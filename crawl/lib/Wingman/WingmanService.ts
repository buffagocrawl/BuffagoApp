import { bounded, wingmanError, wingmanRequest } from '../wingmanAsync';
import { canApproveWingman, normalizeWingmanConfidence, WING_CONFIDENCE_APPROVAL_THRESHOLD, sameWingmanLocation, wingmanPlaceNameMatches } from '../../supabase/functions/_shared/wingmanConfidence';
import { supabase } from '../supabase';
import type {
  WingmanAIExtraction,
  WingmanInput,
  WingmanLogInsert,
  WingmanPlaceCandidate,
  WingmanResult,
} from './types';

type OpenAIResponseShape = {
  normalized_name?: unknown;
  city?: unknown;
  state?: unknown;
  address?: unknown;
  lat?: unknown;
  lng?: unknown;
  is_real_restaurant?: unknown;
  confidence?: unknown;
  wings_probability?: unknown;
  category?: unknown;
  reasoning?: unknown;
  needs_city?: unknown;
  needs_more_info?: unknown;
  verified_place?: unknown;
  location_status?: unknown;
  wing_evidence_status?: unknown;
  wing_evidence?: unknown;
  menu_evidence?: unknown;
  existing_destination_id?: unknown;
};

type WingmanServiceOptions = {
  onStatus?: (message: string) => void;
};

export class WingmanService {
  private readonly edgeFunctionName = 'wingman-intake';
  private readonly approveWingsThreshold = WING_CONFIDENCE_APPROVAL_THRESHOLD;
  private readonly wingVerificationThreshold = WING_CONFIDENCE_APPROVAL_THRESHOLD;
  private readonly suggestionConfidenceThreshold = 0.5;

  constructor(private readonly options: WingmanServiceOptions = {}) {}

  async run(input: WingmanInput): Promise<WingmanResult> {
    this.validateInput(input);

    let aiRawResponse: unknown = null;

    try {
      aiRawResponse = await this.callOpenAI(input);

      let ai = this.parseAssessment(aiRawResponse);
      const place = this.buildPlaceCandidate(ai);
      let finalRawResponse = aiRawResponse;

      if (
        !input.deferWingVerification &&
        !input.wingVerification &&
        place.found &&
        (ai.wingsProbability ?? 0) < this.wingVerificationThreshold
      ) {
        this.options.onStatus?.('Wingman is making another call to check whether they have wings.');
        const verificationRaw = await this.callOpenAI({
          ...input,
          candidateAddress: place.address || input.candidateAddress,
          wingVerification: true,
          extraInfo: [
            input.extraInfo?.trim(),
            'Second pass: assess the supplied menu evidence for chicken wings at the exact verified location. Do not substitute category assumptions or a default score.',
          ]
            .filter(Boolean)
            .join(' '),
        });
        const verificationAI = this.parseAssessment(verificationRaw);

        const samePlace = sameWingmanLocation(ai, verificationAI)
          && (!ai.normalizedName || !verificationAI.normalizedName || wingmanPlaceNameMatches(ai.normalizedName,verificationAI.normalizedName));
        const blockedEvidence = [ai.wingEvidenceStatus,verificationAI.wingEvidenceStatus].find(status=>status==='unavailable'||status==='conflicting');
        ai = {
          ...ai, ...verificationAI,
          normalizedName: verificationAI.normalizedName ?? ai.normalizedName,
          city: verificationAI.city ?? ai.city, state: verificationAI.state ?? ai.state,
          address: verificationAI.address ?? ai.address, lat: verificationAI.lat ?? ai.lat, lng: verificationAI.lng ?? ai.lng,
          // A missing second-pass score remains missing; never reuse a prior
          // approving score or discard conflicting evidence/location details.
          wingsProbability: verificationAI.wingsProbability,
          verifiedPlace: ai.verifiedPlace === true && verificationAI.verifiedPlace === true && samePlace,
          locationStatus: samePlace ? verificationAI.locationStatus : 'conflicting',
          needsMoreInfo: !samePlace || verificationAI.needsMoreInfo,
          wingEvidenceStatus: blockedEvidence || verificationAI.wingEvidenceStatus,
          menuEvidence: [...(ai.menuEvidence || []),...(verificationAI.menuEvidence || [])],
        };
        finalRawResponse = {
          firstPass: aiRawResponse,
          wingVerification: verificationRaw,
        };
      }
      const finalPlace = this.buildPlaceCandidate(ai);

      const decision = this.decide({
        input,
        ai,
        place: finalPlace,
      });

      const result: WingmanResult = {
        success: true,
        rawInput: input.rawInput.trim(),
        restaurantName: input.restaurantName ?? null,
        city: input.city ?? null,
        extraInfo: input.extraInfo ?? null,
        stateId: input.stateId,
        stateCode: input.stateCode ?? null,
        ai,
        place: finalPlace,
        candidates: [],
        aiRawResponse: finalRawResponse,
        error: null,
        ...decision,
      };

      await this.insertLogSafe(
        this.buildLogInsert({
          input,
          result,
        })
      );

      return result;
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Unknown Wingman error';
      const isRateLimited = message.toLowerCase().includes('too many requests');

      const errorResult: WingmanResult = {
        success: false,
        rawInput: input.rawInput.trim(),
        restaurantName: input.restaurantName ?? null,
        city: input.city ?? null,
        extraInfo: input.extraInfo ?? null,
        stateId: input.stateId,
        stateCode: input.stateCode ?? null,
        ai: this.emptyAIExtraction(),
        place: this.emptyPlaceCandidate(),
        candidates: [],
        decision: 'error',
        decisionReason: 'system_error',
        userMessage: isRateLimited
          ? 'Too many requests. Give it a little time and try again.'
          : 'Wingman hit a problem while checking that restaurant. Please try again in a moment.',
        shouldInsertDestination: false,
        shouldInsertSuggestion: false,
        destinationInsert: null,
        suggestionInsert: null,
        aiRawResponse,
        error: message,
      };

      await this.insertLogSafe(
        this.buildLogInsert({
          input,
          result: errorResult,
        })
      );

      return errorResult;
    }
  }

  private validateInput(input: WingmanInput): void {
    const raw = input?.rawInput?.trim();

    if (!raw) {
      throw new Error('Wingman requires a restaurant input.');
    }

    if (raw.length < 2) {
      throw new Error('Restaurant input is too short.');
    }

    if (!input?.stateId || Number.isNaN(Number(input.stateId))) {
      throw new Error('Wingman requires a valid stateId.');
    }
  }

  private async callOpenAI(input: WingmanInput): Promise<unknown> {
    const restaurantForPrompt =
      input.restaurantName?.trim() || input.rawInput.trim();

    const { data, error } = await wingmanRequest(signal => supabase.functions.invoke(this.edgeFunctionName, {
      signal,
      body: {
        restaurant: restaurantForPrompt,
        rawInput: input.rawInput.trim(),
        stateId: input.stateId,
        stateCode: input.stateCode ?? null,
        city: input.city ?? null,
        extraInfo: input.extraInfo ?? null,
        candidateAddress: input.candidateAddress ?? null,
        wingVerification: input.wingVerification === true,
      },
    }));

    if (error) {
      const detail = await this.formatFunctionError(error);
      throw new Error(`Wingman function call failed: ${detail}`);
    }

    if (data == null) {
      throw new Error('Wingman function returned no data.');
    }

    return data;
  }

  private async formatFunctionError(error: unknown): Promise<string> {
    return wingmanError(error);
  }

  parseAssessment(raw: unknown): WingmanAIExtraction & {
    needsCity?: boolean;
    needsMoreInfo?: boolean;
  } {
    const normalizedRaw = this.normalizeRawAIResponse(raw);
    const obj = this.ensureObject(normalizedRaw);

    const parsed = {
      normalizedName: this.asNullableString(obj.normalized_name),
      city: this.asNullableString(obj.city),
      state: this.asNullableString(obj.state),
      address: this.asNullableString(obj.address),
      lat: this.asNullableNumber(obj.lat),
      lng: this.asNullableNumber(obj.lng),
      confidence: normalizeWingmanConfidence(obj.confidence),
      isRealRestaurant: this.asNullableBoolean(obj.is_real_restaurant),
      wingsProbability: normalizeWingmanConfidence(obj.wings_probability),
      category: this.asNullableString(obj.category),
      reasoning: this.asNullableString(obj.reasoning),
      needsCity: this.asNullableBoolean(obj.needs_city) ?? false,
      needsMoreInfo: this.asNullableBoolean(obj.needs_more_info) ?? false,
      verifiedPlace: obj.verified_place === true,
      locationStatus: ['verified','needs_city','needs_more_info','conflicting','unverified'].includes(String(obj.location_status)) ? obj.location_status as NonNullable<WingmanAIExtraction['locationStatus']> : 'unverified' as const,
      wingEvidenceStatus: ['supports','unknown','unavailable','conflicting'].includes(String(obj.wing_evidence_status)) ? obj.wing_evidence_status as NonNullable<WingmanAIExtraction['wingEvidenceStatus']> : 'unknown' as const,
      wingEvidence: this.asNullableString(obj.wing_evidence),
      menuEvidence: Array.isArray(obj.menu_evidence) ? obj.menu_evidence.filter((item: any)=>typeof item?.url==='string' && typeof item?.text==='string').map((item: any)=>({url:item.url,text:item.text,explicitUnavailable:item.explicitUnavailable===true})) : [],
      existingDestinationId: this.asNullableString(obj.existing_destination_id),
    };

    return {
      normalizedName: parsed.normalizedName,
      city: parsed.city,
      state: parsed.state,
      address: parsed.address,
      lat: parsed.lat,
      lng: parsed.lng,
      confidence: parsed.confidence,
      isRealRestaurant: parsed.isRealRestaurant,
      wingsProbability: parsed.wingsProbability,
      category: parsed.category,
      reasoning: parsed.reasoning,
      needsCity: parsed.needsCity,
      needsMoreInfo: parsed.needsMoreInfo,
      verifiedPlace: parsed.verifiedPlace, locationStatus: parsed.locationStatus,
      wingEvidenceStatus: parsed.wingEvidenceStatus, wingEvidence: parsed.wingEvidence,
      menuEvidence: parsed.menuEvidence, existingDestinationId: parsed.existingDestinationId,
    };
  }

  private buildPlaceCandidate(ai: WingmanAIExtraction): WingmanPlaceCandidate {
    const found = Boolean(ai.normalizedName) && ai.isRealRestaurant === true;

    return {
      found,
      name: ai.normalizedName,
      address: ai.address ?? null,
      city: ai.city,
      state: ai.state,
      lat: ai.lat ?? null,
      lng: ai.lng ?? null,
      source: found && ai.verifiedPlace === true ? 'google_places' : found ? 'openai' : 'none',
    };
  }

  private decide(params: {
    input: WingmanInput;
    ai: WingmanAIExtraction & {
      needsCity?: boolean;
      needsMoreInfo?: boolean;
    };
    place: WingmanPlaceCandidate;
  }): Pick<
    WingmanResult,
    | 'decision'
    | 'decisionReason'
    | 'userMessage'
    | 'shouldInsertDestination'
    | 'shouldInsertSuggestion'
    | 'destinationInsert'
    | 'suggestionInsert'
  > {
    const { input, ai, place } = params;

    const confidence = ai.confidence ?? 0;
    const wingsProbability = ai.wingsProbability ?? 0;
    const hasName = Boolean(ai.normalizedName);
    const hasUserId = Boolean(input.userId);

    if (ai.existingDestinationId && ai.verifiedPlace) {
      return { decision: 'candidate_selection', decisionReason: 'manual_review_required',
        userMessage: 'Wingman found an existing BuffaGo restaurant.', shouldInsertDestination: false,
        shouldInsertSuggestion: false, destinationInsert: null, suggestionInsert: null };
    }

    if (ai.needsCity || ai.locationStatus === 'needs_city') {
      return {
        decision: 'needs_city',
        decisionReason: 'needs_city_for_disambiguation',
        userMessage: 'Wingman needs the town or city to narrow this down.',
        shouldInsertDestination: false,
        shouldInsertSuggestion: false,
        destinationInsert: null,
        suggestionInsert: null,
      };
    }

    if (ai.needsMoreInfo || ['needs_more_info','conflicting'].includes(ai.locationStatus || '')) {
      return {
        decision: 'needs_more_info',
        decisionReason: 'needs_more_info_for_disambiguation',
        userMessage: 'Wingman needs a little more detail to identify this restaurant.',
        shouldInsertDestination: false,
        shouldInsertSuggestion: false,
        destinationInsert: null,
        suggestionInsert: null,
      };
    }

    if (!hasName) {
      return {
        decision: 'rejected',
        decisionReason: 'invalid_ai_response',
        userMessage:
          'Wingman could not confidently understand that restaurant. Please try a more specific name.',
        shouldInsertDestination: false,
        shouldInsertSuggestion: false,
        destinationInsert: null,
        suggestionInsert: null,
      };
    }

    if (ai.isRealRestaurant === false || (!ai.verifiedPlace && confidence < this.suggestionConfidenceThreshold)) {
      return {
        decision: 'rejected',
        decisionReason: ai.isRealRestaurant === false ? 'place_not_found' : 'low_confidence_ai',
        userMessage:
          'Wingman could not verify that as a real restaurant yet. Please try a different search.',
        shouldInsertDestination: false,
        shouldInsertSuggestion: false,
        destinationInsert: null,
        suggestionInsert: null,
      };
    }

    if (!place.found) {
      return {
        decision: 'rejected',
        decisionReason: 'place_not_found',
        userMessage:
          'Wingman could not verify that restaurant yet. Please try a different search.',
        shouldInsertDestination: false,
        shouldInsertSuggestion: false,
        destinationInsert: null,
        suggestionInsert: null,
      };
    }

    if (canApproveWingman({ matchConfidence: ai.confidence, wingConfidence: ai.wingsProbability,
      verifiedRestaurant: ai.verifiedPlace === true && ai.isRealRestaurant === true,
      locationStatus: ai.locationStatus ?? null, needsCity: ai.needsCity, needsMoreInfo: ai.needsMoreInfo,
      wingEvidenceStatus: ai.wingEvidenceStatus,
    })) {
      return {
        decision: 'approved',
        decisionReason: 'high_confidence_match_with_wings',
        userMessage: 'Wingman found a strong match and detected wings. Adding it now.',
        shouldInsertDestination: true,
        shouldInsertSuggestion: false,
        destinationInsert: {
          name: ai.normalizedName!,
          address: place.address,
          city: place.city,
          stateId: input.stateId,
          lat: place.lat,
          lng: place.lng,
          createdBy: input.userId ?? null,
        },
        suggestionInsert: null,
      };
    }

    if (
      ai.isRealRestaurant === true &&
      (ai.verifiedPlace === true || confidence >= this.suggestionConfidenceThreshold)
    ) {
      return {
        decision: 'suggestion',
        decisionReason:
          wingsProbability < this.approveWingsThreshold
            ? 'place_found_but_wings_uncertain'
            : 'manual_review_required',
        userMessage:
          hasUserId
            ? 'Wingman made another check, but wings are still not certain enough. Adding it for manual review.'
            : 'Wingman found the restaurant, but it needs manual review before being added.',
        shouldInsertDestination: false,
        shouldInsertSuggestion: hasUserId,
        destinationInsert: null,
        suggestionInsert: hasUserId
          ? {
              userId: input.userId!,
              restaurantName: ai.normalizedName!,
              address: place.address,
              stateId: input.stateId,
            }
          : null,
      };
    }

    return {
      decision: 'rejected',
      decisionReason: 'no_wings_detected',
      userMessage:
        'Wingman could not detect enough evidence that this place serves wings. It was not added.',
      shouldInsertDestination: false,
      shouldInsertSuggestion: false,
      destinationInsert: null,
      suggestionInsert: null,
    };
  }

  private buildLogInsert(params: {
    input: WingmanInput;
    result: WingmanResult;
  }): WingmanLogInsert {
    const { input, result } = params;

    const wingsConfidence = this.getWingsConfidenceLabel(result.ai.wingsProbability);

    return {
      user_id: input.userId ?? null,
      raw_input: result.rawInput,
      state_id: result.stateId,

      restaurant_name: input.restaurantName ?? null,
      city_input: input.city ?? null,
      extra_info: input.extraInfo ?? null,

      ai_name: result.ai.normalizedName,
      ai_city: result.ai.city,
      ai_state: result.ai.state,
      ai_confidence: result.ai.confidence,

      place_found: result.place.found,
      place_name: result.place.name,
      place_address: result.place.address,
      place_lat: result.place.lat,
      place_lng: result.place.lng,

      wings_probability: result.ai.wingsProbability,
      wings_confidence: wingsConfidence,

      decision: result.decision,
      decision_reason: result.decisionReason,

      destination_id: null,
      suggestion_id: null,

      ai_raw_response: result.aiRawResponse ?? null,
      place_raw_response: result.place,
    };
  }

  private async insertLog(log: WingmanLogInsert): Promise<void> {
    const { error } = await supabase.from('wingman_intake_logs').insert(log);

    if (error) {
      throw new Error(`Failed to insert Wingman log: ${error.message}`);
    }
  }

  private async insertLogSafe(log: WingmanLogInsert): Promise<void> {
    try {
      await bounded(this.insertLog(log), 2000);
    } catch (error) {
      console.warn('[Wingman] Log insert failed', error);
    }
  }

  private normalizeRawAIResponse(raw: unknown): unknown {
    if (typeof raw === 'string') {
      return raw;
    }

    if (!raw || typeof raw !== 'object') {
      return raw;
    }

    const record = raw as Record<string, unknown>;

    if (record.result != null) {
      return record.result;
    }

    if (record.output_text != null) {
      return record.output_text;
    }

    if (Array.isArray(record.content) && record.content.length > 0) {
      return record.content[0];
    }

    if (record.content != null) {
      return record.content;
    }

    return raw;
  }

  private ensureObject(value: unknown): OpenAIResponseShape {
    if (typeof value === 'string') {
      const parsed = JSON.parse(value) as unknown;
      return this.ensureObject(parsed);
    }

    if (value && typeof value === 'object') {
      return value as OpenAIResponseShape;
    }

    throw new Error('Wingman returned an invalid AI response shape.');
  }

  private asNullableString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private asNullableNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private asNullableBoolean(value: unknown): boolean | null {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();

      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }

    return null;
  }

  private getWingsConfidenceLabel(value: number | null): string | null {
    if (value == null) return null;
    if (value >= 0.8) return 'high';
    if (value >= 0.5) return 'medium';
    return 'low';
  }

  private emptyAIExtraction(): WingmanAIExtraction {
    return {
        normalizedName: null,
        city: null,
        state: null,
        address: null,
        lat: null,
        lng: null,
        confidence: null,
      isRealRestaurant: null,
      wingsProbability: null,
      category: null,
      reasoning: null,
    };
  }

  private emptyPlaceCandidate(): WingmanPlaceCandidate {
    return {
      found: false,
      name: null,
      address: null,
      city: null,
      state: null,
      lat: null,
      lng: null,
      source: 'none',
    };
  }
}
