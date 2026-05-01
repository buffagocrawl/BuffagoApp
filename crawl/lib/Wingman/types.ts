export type WingmanDecision =
  | 'approved'
  | 'suggestion'
  | 'rejected'
  | 'needs_city'
  | 'needs_more_info'
  | 'candidate_selection'
  | 'error';

export type WingmanDecisionReason =
  | 'high_confidence_match_with_wings'
  | 'place_found_but_wings_uncertain'
  | 'place_not_found'
  | 'low_confidence_ai'
  | 'invalid_ai_response'
  | 'no_wings_detected'
  | 'manual_review_required'
  | 'needs_city_for_disambiguation'
  | 'needs_more_info_for_disambiguation'
  | 'multiple_possible_matches'
  | 'system_error';

export interface WingmanInput {
  userId?: string | null;
  wingVerification?: boolean;
  deferWingVerification?: boolean;

  // Original combined input for backward compatibility
  rawInput: string;

  // New structured fields for staged flow
  restaurantName?: string | null;
  city?: string | null;
  extraInfo?: string | null;

  stateId: number;
  stateCode?: string | null;
}

export interface WingmanAIExtraction {
  normalizedName: string | null;
  city: string | null;
  state: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  confidence: number | null;
  isRealRestaurant: boolean | null;
  wingsProbability: number | null;
  category: string | null;
  reasoning: string | null;
}

export interface WingmanPlaceCandidate {
  found: boolean;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  source: 'openai' | 'google_places' | 'none';
}

export interface WingmanCandidateOption {
  id?: string | null;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  confidence?: number | null;
  source: 'openai' | 'google_places' | 'existing_destination' | 'none';
  isExistingDestination?: boolean;
  existingDestinationId?: string | null;
}

export interface WingmanDestinationInsert {
  name: string;
  address: string | null;
  city: string | null;
  stateId: number;
  lat: number | null;
  lng: number | null;
  createdBy?: string | null;
}

export interface WingmanSuggestionInsert {
  userId: string;
  restaurantName: string;
  address: string | null;
  stateId: number;
}

export interface WingmanResult {
  success: boolean;
  decision: WingmanDecision;
  decisionReason: WingmanDecisionReason;
  userMessage: string;

  rawInput: string;
  restaurantName?: string | null;
  city?: string | null;
  extraInfo?: string | null;
  stateId: number;
  stateCode?: string | null;

  ai: WingmanAIExtraction;
  place: WingmanPlaceCandidate;

  // New: allow multiple candidate options for the UI
  candidates?: WingmanCandidateOption[];

  shouldInsertDestination: boolean;
  shouldInsertSuggestion: boolean;

  destinationInsert?: WingmanDestinationInsert | null;
  suggestionInsert?: WingmanSuggestionInsert | null;

  aiRawResponse?: unknown;
  error?: string | null;
}

export interface WingmanLogInsert {
  user_id?: string | null;
  raw_input: string;
  state_id: number;

  restaurant_name?: string | null;
  city_input?: string | null;
  extra_info?: string | null;

  ai_name?: string | null;
  ai_city?: string | null;
  ai_state?: string | null;
  ai_confidence?: number | null;

  place_found?: boolean | null;
  place_name?: string | null;
  place_address?: string | null;
  place_lat?: number | null;
  place_lng?: number | null;

  wings_probability?: number | null;
  wings_confidence?: string | null;

  decision: WingmanDecision;
  decision_reason: string | null;

  destination_id?: string | null;
  suggestion_id?: string | null;

  ai_raw_response?: unknown;
  place_raw_response?: unknown;
}
