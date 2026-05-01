// supabase/functions/wingman-intake/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type RequestBody = {
  action?: 'validate' | 'insertDestination';
  restaurant?: string;
  rawInput?: string;
  stateId?: number;
  stateCode?: string | null;
  city?: string | null;
  extraInfo?: string | null;
  wingVerification?: boolean;
  prompt?: string;
  destination?: {
    name?: string | null;
    address?: string | null;
    city?: string | null;
    lat?: number | null;
    lng?: number | null;
  };
};

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') || 'gpt-4.1-mini';
const GOOGLE_PLACES_API_KEY =
  Deno.env.get('GOOGLE_PLACES_API_KEY') || Deno.env.get('GOOGLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

type PlaceCandidate = {
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  types: string[];
  rating: number | null;
  userRatingsTotal: number | null;
};

function parseCityState(address: string | null) {
  if (!address) return { city: null, state: null };

  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  const stateZip = parts.find((part) => /\b[A-Z]{2}\b/.test(part));
  const state = stateZip?.match(/\b([A-Z]{2})\b/)?.[1] ?? null;
  const city = stateZip ? parts[Math.max(0, parts.indexOf(stateZip) - 1)] ?? null : null;

  return { city, state };
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function createAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret.');
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function requireUserId(req: Request) {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return { userId: null, error: 'Missing auth header.' };
  }

  const admin = createAdminClient();
  const jwt = authHeader.replace('Bearer ', '').trim();
  const { data, error } = await admin.auth.getUser(jwt);

  if (error || !data?.user?.id) {
    return { userId: null, error: 'Invalid user.' };
  }

  return { userId: data.user.id, error: null };
}

async function resolvePlaceCandidate(params: {
  restaurant: string;
  state: string;
  city?: string | null;
}): Promise<PlaceCandidate | null> {
  if (!GOOGLE_PLACES_API_KEY) return null;

  const query = [params.restaurant, params.city, params.state, 'restaurant']
    .filter(Boolean)
    .join(' ');
  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  url.searchParams.set('query', query);
  url.searchParams.set('type', 'restaurant');
  url.searchParams.set('region', 'us');
  url.searchParams.set('key', GOOGLE_PLACES_API_KEY);

  const response = await fetch(url.toString());
  const body = await response.json();

  if (!response.ok || body?.status === 'REQUEST_DENIED') {
    console.error('GOOGLE PLACES ERROR:', JSON.stringify(body));
    return null;
  }

  const first = Array.isArray(body?.results) ? body.results[0] : null;
  if (!first) return null;

  const address =
    typeof first.formatted_address === 'string' && first.formatted_address.trim()
      ? first.formatted_address.trim()
      : null;
  const parsed = parseCityState(address);

  return {
    name:
      typeof first.name === 'string' && first.name.trim()
        ? first.name.trim()
        : null,
    address,
    city: parsed.city || params.city || null,
    state: parsed.state || params.state || null,
    lat: asNumber(first.geometry?.location?.lat),
    lng: asNumber(first.geometry?.location?.lng),
    types: Array.isArray(first.types) ? first.types.filter((t: unknown) => typeof t === 'string') : [],
    rating: asNumber(first.rating),
    userRatingsTotal: asNumber(first.user_ratings_total),
  };
}

function buildWingmanPrompt(params: {
  restaurant: string;
  state: string;
  city?: string | null;
  extraInfo?: string | null;
  place?: PlaceCandidate | null;
  wingVerification?: boolean;
}) {
  const { restaurant, state, city, extraInfo, place, wingVerification } = params;
  const placeContext = place
    ? `
Verified place candidate from Google Places:
Name: "${place.name ?? ''}"
Address: "${place.address ?? ''}"
City: "${place.city ?? ''}"
State: "${place.state ?? ''}"
Latitude: ${place.lat ?? 'null'}
Longitude: ${place.lng ?? 'null'}
Types: ${place.types.join(', ') || 'unknown'}
Rating: ${place.rating ?? 'unknown'}
User ratings total: ${place.userRatingsTotal ?? 'unknown'}
`.trim()
    : 'Verified place candidate from Google Places: none';

  return `
You are Wingman, an AI assistant that helps validate and resolve restaurant inputs for a mobile app called BuffaGo.

Your job is to take messy user input and extract structured information about a restaurant.
${wingVerification ? 'This is a second-pass wing verification. Focus specifically on whether the verified restaurant is likely to serve chicken wings.' : ''}

Return ONLY valid JSON. Do not include any extra text, markdown, or explanation outside the JSON.

Input:
Restaurant: "${restaurant}"
State: "${state}"
${city ? `City: "${city}"` : ''}
${extraInfo ? `Additional Info: "${extraInfo}"` : ''}
${placeContext}

Return JSON with the following fields:

- normalized_name (string or null)
- city (string or null)
- state (string or null)
- address (string or null)
- lat (number or null)
- lng (number or null)
- is_real_restaurant (boolean)
- confidence (number between 0 and 1)
- wings_probability (number between 0 and 1)
- category (string or null)
- reasoning (string)

Optional fields (ONLY include if useful):
- needs_city (boolean)
- needs_more_info (boolean)

Guidelines:

GENERAL:
- Fix spelling mistakes if possible
- Normalize the restaurant name to its proper format
- Do NOT invent exact addresses or precise details you are unsure about
- If a verified place candidate is present, use its name, address, city, state, lat, and lng
- If unsure, lower confidence rather than guessing

REAL RESTAURANT:
- If the restaurant likely exists, set is_real_restaurant = true
- If clearly fake or nonsense, set:
  - normalized_name: null
  - is_real_restaurant: false
  - low confidence

CONFIDENCE:
- 0.8–1.0 = very confident match
- 0.5–0.8 = likely but not certain
- 0.2–0.5 = weak guess
- 0.0–0.2 = likely invalid

WINGS PROBABILITY:
- Sports bars, pubs, grills, taverns, wing spots, and bar-and-grill restaurants should be treated as high wing-probability places
- If the verified place category or name indicates a sports bar, do not downgrade wings_probability only because the exact wing menu is not in context
- In second-pass wing verification, use the verified place context and user details to make the best wing-specific judgment; under 0.70 means manual review
- Sports bars, pubs, wing spots → high (0.7–1.0)
- Casual restaurants → medium (0.4–0.7)
- Fine dining, cafes, non-chicken cuisines → low (0.0–0.3)

DISAMBIGUATION:
- If the input is too ambiguous and city is missing, set needs_city = true
- If still unclear even with city, set needs_more_info = true
- Do NOT hallucinate a specific location if multiple are possible

IMPORTANT:
- confidence and wings_probability MUST be numbers between 0 and 1
- Do NOT return strings for numeric fields
- Do NOT include trailing commas
- Output must be strict JSON
`.trim();
}

function sanitizeResult(raw: any) {
  const confidence =
    typeof raw?.confidence === 'number'
      ? Math.min(1, Math.max(0, raw.confidence))
      : null;

  const wingsProbability =
    typeof raw?.wings_probability === 'number'
      ? Math.min(1, Math.max(0, raw.wings_probability))
      : null;

  return {
    normalized_name:
      typeof raw?.normalized_name === 'string' && raw.normalized_name.trim()
        ? raw.normalized_name.trim()
        : null,
    city:
      typeof raw?.city === 'string' && raw.city.trim()
        ? raw.city.trim()
        : null,
    state:
      typeof raw?.state === 'string' && raw.state.trim()
        ? raw.state.trim()
        : null,
    address:
      typeof raw?.address === 'string' && raw.address.trim()
        ? raw.address.trim()
        : null,
    lat: typeof raw?.lat === 'number' && Number.isFinite(raw.lat) ? raw.lat : null,
    lng: typeof raw?.lng === 'number' && Number.isFinite(raw.lng) ? raw.lng : null,
    is_real_restaurant:
      typeof raw?.is_real_restaurant === 'boolean'
        ? raw.is_real_restaurant
        : false,
    confidence,
    wings_probability: wingsProbability,
    category:
      typeof raw?.category === 'string' && raw.category.trim()
        ? raw.category.trim()
        : null,
    reasoning:
      typeof raw?.reasoning === 'string' && raw.reasoning.trim()
        ? raw.reasoning.trim()
        : 'No reasoning provided.',
    needs_city:
      typeof raw?.needs_city === 'boolean'
        ? raw.needs_city
        : false,
    needs_more_info:
      typeof raw?.needs_more_info === 'boolean'
        ? raw.needs_more_info
        : false,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed. Use POST.' }, 405);
  }

  if (!OPENAI_API_KEY) {
    return jsonResponse({ error: 'Missing OPENAI_API_KEY secret.' }, 500);
  }

  try {
    const body = (await req.json()) as RequestBody;
    const action = body.action || 'validate';
    let authenticatedUserId: string | null = null;

    const restaurant =
      body.restaurant?.trim() ||
      body.destination?.name?.trim() ||
      body.rawInput?.trim();
    const state = body.stateCode?.trim() || String(body.stateId || '').trim();
    const city = body.city?.trim() || body.destination?.city?.trim() || null;
    const extraInfo = [
      body.extraInfo?.trim() || null,
      body.destination?.address?.trim()
        ? `Candidate address: ${body.destination.address.trim()}`
        : null,
    ]
      .filter(Boolean)
      .join(' ') || null;
    const wingVerification = body.wingVerification === true || action === 'insertDestination';

    if (!restaurant) {
      return jsonResponse({ error: 'Missing restaurant in request body.' }, 400);
    }

    if (!state) {
      return jsonResponse({ error: 'Missing stateId or stateCode in request body.' }, 400);
    }

    if (action === 'insertDestination') {
      if (!body.stateId || Number.isNaN(Number(body.stateId))) {
        return jsonResponse({ error: 'Missing numeric stateId for destination insert.' }, 400);
      }

      const auth = await requireUserId(req);
      authenticatedUserId = auth.userId;
    }

    const place = await resolvePlaceCandidate({
      restaurant,
      state,
      city,
    });

    const prompt =
      typeof body.prompt === 'string' && body.prompt.trim()
        ? body.prompt
        : buildWingmanPrompt({
            restaurant,
            state,
            city,
            extraInfo,
            place,
            wingVerification,
          });

    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'developer',
            content:
              'You are Wingman. Return only valid JSON that matches the provided schema.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'wingman_restaurant_validation',
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                normalized_name: {
                  type: ['string', 'null'],
                },
                city: {
                  type: ['string', 'null'],
                },
                state: {
                  type: ['string', 'null'],
                },
                address: {
                  type: ['string', 'null'],
                },
                lat: {
                  type: ['number', 'null'],
                },
                lng: {
                  type: ['number', 'null'],
                },
                is_real_restaurant: {
                  type: 'boolean',
                },
                confidence: {
                  type: 'number',
                  minimum: 0,
                  maximum: 1,
                },
                wings_probability: {
                  type: 'number',
                  minimum: 0,
                  maximum: 1,
                },
                category: {
                  type: ['string', 'null'],
                },
                reasoning: {
                  type: 'string',
                },
                needs_city: {
                  type: 'boolean',
                },
                needs_more_info: {
                  type: 'boolean',
                },
              },
              required: [
                'normalized_name',
                'city',
                'state',
                'address',
                'lat',
                'lng',
                'is_real_restaurant',
                'confidence',
                'wings_probability',
                'category',
                'reasoning',
                'needs_city',
                'needs_more_info',
              ],
            },
          },
        },
        temperature: 0.2,
      }),
    });

    if (!openAIResponse.ok) {
      const errorText = await openAIResponse.text();
    
      console.error('OPENAI ERROR:', errorText);
    
      return jsonResponse({
        error: 'OpenAI request failed.',
        details: errorText,
      }, 500);
    }

    const completion = await openAIResponse.json();
    const content = completion?.choices?.[0]?.message?.content;

    if (!content || typeof content !== 'string') {
      return jsonResponse({
        error: 'OpenAI returned no message content.',
        raw: completion,
      }, 500);
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(content);
    } catch {
      return jsonResponse({
        error: 'Failed to parse model JSON.',
        rawContent: content,
      }, 500);
    }

    const result = sanitizeResult(parsed);

    if (place) {
      result.normalized_name = place.name || result.normalized_name;
      result.address = place.address || result.address;
      result.city = place.city || result.city;
      result.state = place.state || result.state;
      result.lat = place.lat ?? result.lat;
      result.lng = place.lng ?? result.lng;
      result.is_real_restaurant = true;
      result.confidence = Math.max(result.confidence ?? 0, 0.85);
      result.needs_city = false;
      result.needs_more_info = false;
    }

    if (action === 'insertDestination') {
      if (
        !result.normalized_name ||
        result.is_real_restaurant !== true ||
        (result.confidence ?? 0) < 0.8 ||
        (result.wings_probability ?? 0) < 0.75 ||
        !place
      ) {
        return jsonResponse({
          error: 'Wingman could not verify this restaurant strongly enough to add it.',
          result,
        }, 422);
      }

      const admin = createAdminClient();
      const insertPayload = {
        name: result.normalized_name,
        address: result.address,
        city: result.city,
        state_id: Number(body.stateId),
        lat: result.lat,
        lng: result.lng,
        created_by: authenticatedUserId,
      };

      const { data: inserted, error: insertError } = await admin
        .from('destinations')
        .insert(insertPayload)
        .select('id, name, address, city, lat, lng, state_id')
        .single();

      if (insertError) {
        return jsonResponse({
          error: 'Failed to insert destination.',
          details: insertError.message,
        }, 500);
      }

      return jsonResponse({
        destination: inserted ?? null,
        result,
      });
    }

    return jsonResponse(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown Wingman function error';

    return jsonResponse({
      error: message,
    }, 500);
  }
});
