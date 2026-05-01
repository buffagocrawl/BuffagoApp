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
};

type WingmanServiceOptions = {
  onStatus?: (message: string) => void;
};

export class WingmanService {
  private readonly edgeFunctionName = 'wingman-intake';
  private readonly approveConfidenceThreshold = 0.8;
  private readonly approveWingsThreshold = 0.7;
  private readonly wingVerificationThreshold = 0.75;
  private readonly suggestionConfidenceThreshold = 0.5;
  private readonly suggestionWingsThreshold = 0.4;

  constructor(private readonly options: WingmanServiceOptions = {}) {}

  async run(input: WingmanInput): Promise<WingmanResult> {
    this.validateInput(input);

    let aiRawResponse: unknown = null;

    try {
      aiRawResponse = await this.callOpenAI(input);

      let ai = this.parseAIResponse(aiRawResponse);
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
          wingVerification: true,
          extraInfo: [
            input.extraInfo?.trim(),
            'Second pass: verify specifically whether this restaurant serves wings or is clearly a wing-friendly sports bar/bar-and-grill.',
          ]
            .filter(Boolean)
            .join(' '),
        });
        const verificationAI = this.parseAIResponse(verificationRaw);

        ai = {
          ...ai,
          ...verificationAI,
          normalizedName: verificationAI.normalizedName ?? ai.normalizedName,
          city: verificationAI.city ?? ai.city,
          state: verificationAI.state ?? ai.state,
          address: verificationAI.address ?? ai.address,
          lat: verificationAI.lat ?? ai.lat,
          lng: verificationAI.lng ?? ai.lng,
          wingsProbability:
            verificationAI.wingsProbability ?? ai.wingsProbability,
          reasoning:
            verificationAI.reasoning ??
            ai.reasoning ??
            'Wingman completed a second wing verification pass.',
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
      const message = error instanceof Error ? error.message : 'Unknown Wingman error';

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
        userMessage:
          'Wingman hit a problem while checking that restaurant. Please try again in a moment.',
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

    const { data, error } = await supabase.functions.invoke(this.edgeFunctionName, {
      body: {
        restaurant: restaurantForPrompt,
        rawInput: input.rawInput.trim(),
        stateId: input.stateId,
        stateCode: input.stateCode ?? null,
        city: input.city ?? null,
        extraInfo: input.extraInfo ?? null,
        wingVerification: input.wingVerification === true,
      },
    });

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
    const fallback = error instanceof Error ? error.message : String(error);
    const response = (error as { context?: unknown } | null)?.context;

    if (!response || typeof (response as Response).clone !== 'function') {
      return fallback;
    }

    try {
      const body = await (response as Response).clone().json();

      if (body && typeof body === 'object') {
        const record = body as Record<string, unknown>;
        const message =
          typeof record.error === 'string' && record.error.trim()
            ? record.error.trim()
            : fallback;
        const details =
          typeof record.details === 'string' && record.details.trim()
            ? record.details.trim()
            : null;

        return details ? `${message} ${details}` : message;
      }
    } catch {
      try {
        const text = await (response as Response).clone().text();
        if (text.trim()) return text.trim();
      } catch {
        // Keep the Supabase error message when the response body is unreadable.
      }
    }

    return fallback;
  }

  private parseAIResponse(raw: unknown): WingmanAIExtraction & {
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
      confidence: this.asNullableNumber(obj.confidence),
      isRealRestaurant: this.asNullableBoolean(obj.is_real_restaurant),
      wingsProbability: this.asNullableNumber(obj.wings_probability),
      category: this.asNullableString(obj.category),
      reasoning: this.asNullableString(obj.reasoning),
      needsCity: this.asNullableBoolean(obj.needs_city) ?? false,
      needsMoreInfo: this.asNullableBoolean(obj.needs_more_info) ?? false,
    };

    return {
      normalizedName: parsed.normalizedName,
      city: parsed.city,
      state: parsed.state,
      address: parsed.address,
      lat: parsed.lat,
      lng: parsed.lng,
      confidence: this.clampNullable(parsed.confidence, 0, 1),
      isRealRestaurant: parsed.isRealRestaurant,
      wingsProbability: this.clampNullable(parsed.wingsProbability, 0, 1),
      category: parsed.category,
      reasoning: parsed.reasoning,
      needsCity: parsed.needsCity,
      needsMoreInfo: parsed.needsMoreInfo,
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
      source: found && (ai.address || ai.lat != null || ai.lng != null) ? 'google_places' : found ? 'openai' : 'none',
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

    if (ai.needsCity) {
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

    if (ai.needsMoreInfo) {
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

    if (ai.isRealRestaurant === false || confidence < this.suggestionConfidenceThreshold) {
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

    if (
      ai.isRealRestaurant === true &&
      confidence >= this.approveConfidenceThreshold &&
      wingsProbability >= this.approveWingsThreshold
    ) {
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
      confidence >= this.suggestionConfidenceThreshold &&
      (wingsProbability >= this.suggestionWingsThreshold ||
        wingsProbability < this.approveWingsThreshold)
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
      await this.insertLog(log);
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

    if (record.content != null) {
      return record.content;
    }

    if (record.output_text != null) {
      return record.output_text;
    }

    if (Array.isArray(record.content) && record.content.length > 0) {
      return record.content[0];
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

  private clampNullable(value: number | null, min: number, max: number): number | null {
    if (value == null || !Number.isFinite(value)) {
      return null;
    }

    return Math.min(max, Math.max(min, value));
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
