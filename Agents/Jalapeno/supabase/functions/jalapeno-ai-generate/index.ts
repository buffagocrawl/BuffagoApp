type RequestType = "text_content" | "image_prompt" | "brand_validation";
type ContentSlot = "buffago_post" | "meme_post";
type RiskLevel = "low" | "medium" | "high";

interface SafetyMatch {
  field_name: string;
  rule_name: string;
  matched_pattern_name: string;
  matched_text_snippet: string;
  risk_level: RiskLevel;
}

interface JalapenoAIRequest {
  request_type: RequestType;
  agent_name: string;
  run_id: string;
  internal_snapshot: Record<string, unknown>;
  external_context: Record<string, unknown>;
  content_slot: ContentSlot;
  brand_rules: Record<string, unknown>;
  output_schema_version: string;
  prompt_library_version?: string;
  prompt_name?: string;
  prompt_library?: Record<string, string>;
  selected_text_model?: string;
  selected_image_model?: string;
  routing_reason?: string;
  run_context?: Record<string, unknown>;
}

interface UsagePayload {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number | null;
}

interface SafetyPayload {
  passed: boolean;
  reasons: string[];
  risk_level: RiskLevel;
  notes: string[];
  matches?: SafetyMatch[];
}

interface Envelope {
  success: boolean;
  request_type: RequestType;
  schema_version: string;
  model: string;
  output: Record<string, unknown>;
  usage: UsagePayload;
  safety: SafetyPayload;
  errors: string[];
}

const MODEL_CONFIG = {
  default_text_model: Deno.env.get("JALAPENO_TEXT_MODEL") ?? "gpt-5.5",
  image_model: Deno.env.get("JALAPENO_IMAGE_MODEL") ?? "gpt-image-2",
  default_validation_model: Deno.env.get("JALAPENO_VALIDATION_MODEL") ?? "gpt-5.4-mini",
  max_output_tokens: Number(Deno.env.get("JALAPENO_MAX_OUTPUT_TOKENS") ?? "1200"),
  timeout_seconds: Number(Deno.env.get("JALAPENO_AI_TIMEOUT_SECONDS") ?? "75"),
  retry_count: Number(Deno.env.get("JALAPENO_AI_RETRY_COUNT") ?? "3"),
  retry_backoff_seconds: Number(Deno.env.get("JALAPENO_AI_RETRY_BACKOFF_SECONDS") ?? "2"),
};

const MODEL_PRICING: Record<string, { input_cost_per_million_usd: number | null; output_cost_per_million_usd: number | null }> = {
  text_model: { input_cost_per_million_usd: null, output_cost_per_million_usd: null },
  image_model: { input_cost_per_million_usd: null, output_cost_per_million_usd: null },
  validation_model: { input_cost_per_million_usd: null, output_cost_per_million_usd: null },
};

const TEXT_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "content_slot",
    "post_type",
    "caption",
    "hashtags",
    "image_prompt",
    "alt_text",
    "content_angle",
    "source_signals_used",
    "why_this_post",
    "brand_safety_notes",
    "confidence_score",
  ],
  properties: {
    content_slot: { type: "string", enum: ["buffago_post", "meme_post"] },
    post_type: {
      type: "string",
      enum: ["restaurant_spotlight", "crawl_prompt", "community_update", "food_holiday", "sports_hook", "meme"],
    },
    caption: { type: "string" },
    hashtags: { type: "array", items: { type: "string" } },
    image_prompt: { type: "string" },
    alt_text: { type: "string" },
    content_angle: { type: "string" },
    source_signals_used: { type: "array", items: { type: "string" } },
    why_this_post: { type: "string" },
    brand_safety_notes: { type: "array", items: { type: "string" } },
    confidence_score: { type: "number", minimum: 0, maximum: 1 },
  },
};

const IMAGE_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "content_slot",
    "image_prompt",
    "style",
    "needs_text_overlay",
    "text_overlay",
    "composition_notes",
    "negative_prompt_guidance",
    "brand_safety_notes",
    "visual_style",
    "camera_angle",
    "scene_type",
    "comedy_beat",
    "character_archetype",
    "wing_focus_level",
    "prompt_version",
  ],
  properties: {
    content_slot: { type: "string", enum: ["buffago_post", "meme_post"] },
    image_prompt: { type: "string" },
    style: { type: "string", enum: ["realistic", "meme", "illustration", "app_marketing"] },
    needs_text_overlay: { type: "boolean" },
    text_overlay: { type: ["string", "null"] },
    composition_notes: { type: "string" },
    negative_prompt_guidance: { type: "string" },
    brand_safety_notes: { type: "array", items: { type: "string" } },
    visual_style: { type: "string" },
    camera_angle: { type: "string" },
    scene_type: { type: "string" },
    comedy_beat: { type: "string" },
    character_archetype: { type: "string" },
    wing_focus_level: { type: "string" },
    prompt_version: { type: "string" },
  },
};

const BRAND_VALIDATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["passed", "risk_level", "reasons", "notes"],
  properties: {
    passed: { type: "boolean" },
    risk_level: { type: "string", enum: ["low", "medium", "high"] },
    reasons: { type: "array", items: { type: "string" } },
    notes: { type: "array", items: { type: "string" } },
  },
};

function jsonResponse(body: Envelope, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function envOpenAIKey(): string | null {
  return Deno.env.get("OPENAI_API_KEY")?.trim() || null;
}

function safeStringify(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

interface FieldTextEntry {
  field_name: string;
  text: string;
}

interface SafetyRule {
  rule_name: string;
  matched_pattern_name: string;
  reason: string;
  risk_level: RiskLevel;
  pattern: RegExp;
  private_data_rule?: boolean;
}

const SAFETY_RULES: SafetyRule[] = [
  { rule_name: "politics", matched_pattern_name: "politics_keyword", reason: "Politics detected", risk_level: "high", pattern: /\bpolitic(s|al)?\b/i },
  { rule_name: "politics", matched_pattern_name: "election_keyword", reason: "Political framing detected", risk_level: "high", pattern: /\b(election|congress|senate|president)\b/i },
  { rule_name: "tragedy", matched_pattern_name: "tragedy_keyword", reason: "Tragedy or disaster framing detected", risk_level: "high", pattern: /\b(traged(y|ies)|disaster|crash|shooting|death|killed)\b/i },
  { rule_name: "sexual_content", matched_pattern_name: "sexual_keyword", reason: "Sexual content detected", risk_level: "high", pattern: /\b(sexual|porn|nude|naked)\b/i },
  { rule_name: "hate_or_harassment", matched_pattern_name: "hate_keyword", reason: "Hate or harassment detected", risk_level: "high", pattern: /\b(hate|racist|bigot|slur)\b/i },
  { rule_name: "private_user_data", matched_pattern_name: "email_address", reason: "Private user data detected", risk_level: "high", pattern: /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i, private_data_rule: true },
  { rule_name: "private_user_data", matched_pattern_name: "account_identifier", reason: "Private user data detected", risk_level: "high", pattern: /\b(?:account|member|profile)\s+(?:id|identifier)\b\s*[:#=-]?\s*[a-z0-9._-]{4,}\b/i, private_data_rule: true },
  { rule_name: "private_user_data", matched_pattern_name: "user_identifier", reason: "Private user data detected", risk_level: "high", pattern: /\buser\s+id\b\s*[:#=-]?\s*[a-z0-9._-]{4,}\b/i, private_data_rule: true },
  { rule_name: "private_user_data", matched_pattern_name: "street_address", reason: "Private user data detected", risk_level: "high", pattern: /\b\d{1,5}\s+[a-z0-9.'-]+(?:\s+[a-z0-9.'-]+){0,4}\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct)\b/i, private_data_rule: true },
  { rule_name: "private_user_data", matched_pattern_name: "phone_number", reason: "Private user data detected", risk_level: "high", pattern: /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/, private_data_rule: true },
  { rule_name: "private_user_data", matched_pattern_name: "social_handle", reason: "Private user data detected", risk_level: "high", pattern: /\B@[a-z0-9._]{3,32}\b/i, private_data_rule: true },
  { rule_name: "private_user_data", matched_pattern_name: "labeled_username", reason: "Private user data detected", risk_level: "high", pattern: /\b(?:username|user\s*name|handle)\b\s*[:#=-]?\s*@?[a-z0-9._]{3,32}\b/i, private_data_rule: true },
  { rule_name: "private_user_data", matched_pattern_name: "access_token", reason: "Access token or secret detected", risk_level: "high", pattern: /\b(?:sk_(?:live|test)_[a-z0-9]+|gh[pousr]_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z\-_]{20,}|eyJ[A-Za-z0-9_-]{10,}|(?:access|api|auth|secret|session|refresh)\s*token\s*[:=]\s*[A-Za-z0-9._-]{16,}|(?:api[_\s-]?key|secret)\s*[:=]\s*[A-Za-z0-9._-]{16,})\b/, private_data_rule: true },
  { rule_name: "alcohol", matched_pattern_name: "alcohol_keyword", reason: "Alcohol-centered content detected", risk_level: "high", pattern: /\b(alcohol|booze|beer|cocktail)\b/i },
  { rule_name: "fake_claims", matched_pattern_name: "fake_claim_keyword", reason: "Fake claims detected", risk_level: "high", pattern: /\bfake\s+(metrics|claims|endorsement|sponsorship)\b/i },
];

const PRIVATE_DATA_PROHIBITIVE_PATTERNS: RegExp[] = [
  /\b(?:do\s+not|don't|avoid|without|no)\s+(?:show|include|display|use|mention|reveal|contain|have)?\s*(?:any\s+)?(?:real\s+)?(?:private\s+)?(?:user\s+)?(?:data|info|information|name|names|username|usernames|handle|handles)\b/i,
  /\b(?:do\s+not|don't|avoid|without|no)\s+(?:real\s+)?(?:private\s+)?(?:social\s+media\s+)?(?:screenshots|account\s+ids?|user\s+ids?)\b/i,
  /\bavoid\s+real\s+names\b/i,
];

function collectFieldTextEntries(value: unknown, fieldName: string, out: FieldTextEntry[] = []): FieldTextEntry[] {
  if (typeof value === "string") {
    out.push({ field_name: fieldName, text: value });
    return out;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      collectFieldTextEntries(item, `${fieldName}[${index}]`, out);
    }
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      collectFieldTextEntries(item, `${fieldName}.${key}`, out);
    }
  }
  return out;
}

function collectFields(value: Record<string, unknown>, fields: string[]): FieldTextEntry[] {
  const collected: FieldTextEntry[] = [];
  for (const field of fields) {
    collectFieldTextEntries(value[field], field, collected);
  }
  return collected;
}

function getClauseAroundMatch(text: string, matchIndex: number): string {
  const separators = /[.!?;\n]/g;
  let clauseStart = 0;
  let clauseEnd = text.length;
  let separatorMatch: RegExpExecArray | null;

  while ((separatorMatch = separators.exec(text)) !== null) {
    if (separatorMatch.index < matchIndex) {
      clauseStart = separatorMatch.index + 1;
      continue;
    }
    clauseEnd = separatorMatch.index;
    break;
  }

  return text.slice(clauseStart, clauseEnd).trim();
}

function isProhibitivePrivateDataGuidance(text: string, matchIndex: number): boolean {
  const clause = getClauseAroundMatch(text, matchIndex);
  return PRIVATE_DATA_PROHIBITIVE_PATTERNS.some((pattern) => pattern.test(clause));
}

function buildRedactedSnippet(text: string, matchIndex: number, matchText: string, patternName: string): string {
  const contextRadius = 24;
  const start = Math.max(0, matchIndex - contextRadius);
  const end = Math.min(text.length, matchIndex + matchText.length + contextRadius);
  const prefix = text.slice(start, matchIndex);
  const suffix = text.slice(matchIndex + matchText.length, end);
  return `${prefix}[redacted:${patternName}]${suffix}`.replace(/\s+/g, " ").trim();
}

function highestRiskLevel(matches: SafetyMatch[]): RiskLevel {
  if (matches.some((match) => match.risk_level === "high")) {
    return "high";
  }
  if (matches.some((match) => match.risk_level === "medium")) {
    return "medium";
  }
  return "low";
}

export function scanSafety(textEntries: FieldTextEntry[]): SafetyPayload {
  const reasons: string[] = [];
  const matches: SafetyMatch[] = [];

  for (const entry of textEntries) {
    for (const rule of SAFETY_RULES) {
      const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
      const found = entry.text.match(pattern);
      if (!found || typeof found.index !== "number") {
        continue;
      }
      if (rule.private_data_rule && isProhibitivePrivateDataGuidance(entry.text, found.index)) {
        continue;
      }

      matches.push({
        field_name: entry.field_name,
        rule_name: rule.rule_name,
        matched_pattern_name: rule.matched_pattern_name,
        matched_text_snippet: buildRedactedSnippet(entry.text, found.index, found[0], rule.matched_pattern_name),
        risk_level: rule.risk_level,
      });
      if (!reasons.includes(rule.reason)) {
        reasons.push(rule.reason);
      }
    }
  }

  if (matches.length > 0) {
    return {
      passed: false,
      reasons,
      risk_level: highestRiskLevel(matches),
      notes: ["Deterministic safety scan flagged the output before delivery."],
      matches,
    };
  }

  return {
    passed: true,
    reasons: [],
    risk_level: "low",
    notes: ["Deterministic safety scan passed."],
    matches: [],
  };
}

function estimatedCost(usage: { input_tokens: number; output_tokens: number }, modelKey: keyof typeof MODEL_PRICING): number | null {
  const pricing = MODEL_PRICING[modelKey];
  if (pricing.input_cost_per_million_usd === null || pricing.output_cost_per_million_usd === null) {
    return null;
  }
  const inputCost = (usage.input_tokens / 1_000_000) * pricing.input_cost_per_million_usd;
  const outputCost = (usage.output_tokens / 1_000_000) * pricing.output_cost_per_million_usd;
  return Number((inputCost + outputCost).toFixed(6));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function normalizePromptLibrary(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string" && item.trim()) {
      result[key] = item.trim();
    }
  }
  return result;
}

function buildFallbackSystemPrompt(requestType: RequestType, contentSlot: ContentSlot, brandRules: Record<string, unknown>): string {
  const tone = JSON.stringify(asStringArray(brandRules["tone"]), null, 2);
  const mustNot = JSON.stringify(asStringArray(brandRules["must_not"]), null, 2);
  const must = JSON.stringify(asStringArray(brandRules["must"]), null, 2);
  const common = [
    "You are Jalapeno, Buffago's Instagram agent.",
    "Keep the voice fun, lightly sarcastic, wing-obsessed, community-focused, not mean, not corporate, and never generic AI marketing copy.",
    "Do not include politics, current disasters, tragedy jokes, offensive stereotypes, sexual content, hate, harassment, private user info, opted-out references, fake metrics, fake endorsements, or alcohol-centered content unless specifically allowed.",
    "Stay local, food-first, and Buffago-branded.",
  ].join(" ");
  return `${common}\n\nRequest type: ${requestType}\nContent slot: ${contentSlot}\n\nTone rules:\n${tone}\n\nMust not:\n${mustNot}\n\nMust:\n${must}`;
}

function buildSystemPrompt(
  requestType: RequestType,
  contentSlot: ContentSlot,
  brandRules: Record<string, unknown>,
  promptLibrary: Record<string, string>,
  promptLibraryVersion: string,
): string {
  const slotKey = requestType === "image_prompt" ? "image_generation" : requestType === "brand_validation" ? "quality_review" : contentSlot === "meme_post" ? "meme" : "buffago_post";
  const sections = [
    promptLibrary.brand,
    promptLibrary.voice,
    promptLibrary.content_rules,
    promptLibrary.banned_phrases,
    requestType === "brand_validation" ? promptLibrary.quality_review : promptLibrary.required_ctas,
    promptLibrary[slotKey],
  ].filter((section): section is string => typeof section === "string" && section.trim().length > 0);

  if (sections.length === 0) {
    return buildFallbackSystemPrompt(requestType, contentSlot, brandRules);
  }

  return [
    `Prompt library version: ${promptLibraryVersion}`,
    "You are Jalapeno, Buffago's Instagram agent.",
    "Keep the voice fun, lightly sarcastic, wing-obsessed, community-focused, not mean, not corporate, and never generic AI marketing copy.",
    "Do not include politics, current disasters, tragedy jokes, offensive stereotypes, sexual content, hate, harassment, private user info, opted-out references, fake metrics, fake endorsements, or alcohol-centered content unless specifically allowed.",
    "Stay local, food-first, and Buffago-branded.",
    `Request type: ${requestType}`,
    `Content slot: ${contentSlot}`,
    `Brand rules:\n${JSON.stringify(brandRules, null, 2)}`,
    `Prompt library sections:\n${sections.join("\n\n")}`,
    "Return only the structured JSON requested by the response schema for this request.",
  ].join("\n\n");
}

function buildBrandValidationSystemPrompt(
  contentSlot: ContentSlot,
  brandRules: Record<string, unknown>,
  promptLibrary: Record<string, string>,
  promptLibraryVersion: string,
): string {
  const sections = [
    promptLibrary.brand,
    promptLibrary.voice,
    promptLibrary.content_rules,
    promptLibrary.banned_phrases,
    promptLibrary.quality_review,
  ].filter((section): section is string => typeof section === "string" && section.trim().length > 0);

  if (sections.length === 0) {
    return buildFallbackSystemPrompt("brand_validation", contentSlot, brandRules);
  }

  return [
    `Prompt library version: ${promptLibraryVersion}`,
    "You are Jalapeno's brand safety validator.",
    "Review only the provided request context.",
    "Return a concise JSON object and nothing else.",
    "Use the required schema exactly and do not include commentary.",
    "Keep the assessment focused on Buffago's friendly, food-first, non-controversial voice.",
    `Content slot: ${contentSlot}`,
    `Brand rules:\n${JSON.stringify(brandRules, null, 2)}`,
    `Prompt library sections:\n${sections.join("\n\n")}`,
    "If the content is safe, set passed=true, risk_level=low, and explain why briefly in reasons.",
  ].join("\n\n");
}

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const attempts = [trimmed];
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    attempts.push(trimmed.slice(firstBrace, lastBrace + 1));
  }
  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }
  throw new Error("OpenAI response did not include valid JSON");
}

function buildUserPrompt(request: JalapenoAIRequest): string {
  return [
    `Agent: ${request.agent_name}`,
    `Run ID: ${request.run_id}`,
    `Request type: ${request.request_type}`,
    `Content slot: ${request.content_slot}`,
    `Output schema version: ${request.output_schema_version}`,
    `Internal snapshot:\n${safeStringify(request.internal_snapshot)}`,
    `External context:\n${safeStringify(request.external_context)}`,
  ].join("\n\n");
}

async function callOpenAIResponses(
  apiKey: string,
  body: Record<string, unknown>,
  timeoutSeconds: number,
  retryCount: number,
  retryBackoffSeconds: number,
): Promise<Record<string, unknown>> {
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= retryCount; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        const message = text || response.statusText;
        if ([408, 425, 429, 500, 502, 503, 504].includes(response.status) && attempt < retryCount) {
          lastError = `HTTP ${response.status}: ${message}`;
          await new Promise((resolve) => setTimeout(resolve, retryBackoffSeconds * attempt * 1000));
          continue;
        }
        throw new Error(`OpenAI request failed (${response.status}): ${message}`);
      }
      const parsed = parseJsonObject(text);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("OpenAI response was not an object");
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < retryCount) {
        await new Promise((resolve) => setTimeout(resolve, retryBackoffSeconds * attempt * 1000));
        continue;
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(lastError ?? "OpenAI request failed");
}

function extractOutputText(response: Record<string, unknown>): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }
  const output = response.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const content = (item as Record<string, unknown>).content;
      if (!Array.isArray(content)) {
        continue;
      }
      for (const contentItem of content) {
        if (contentItem && typeof contentItem === "object") {
          const text = (contentItem as Record<string, unknown>).text;
          if (typeof text === "string" && text.trim()) {
            return text;
          }
        }
      }
    }
  }
  throw new Error("OpenAI response did not include output text");
}

function extractUsage(response: Record<string, unknown>): UsagePayload {
  const usage = response.usage;
  if (usage && typeof usage === "object") {
    const typed = usage as Record<string, unknown>;
    const inputTokens = Number(typed.input_tokens ?? 0);
    const outputTokens = Number(typed.output_tokens ?? 0);
    const totalTokens = Number(typed.total_tokens ?? inputTokens + outputTokens);
    return {
      input_tokens: Number.isFinite(inputTokens) ? inputTokens : 0,
      output_tokens: Number.isFinite(outputTokens) ? outputTokens : 0,
      total_tokens: Number.isFinite(totalTokens) ? totalTokens : 0,
      estimated_cost_usd: null,
    };
  }
  return { input_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_cost_usd: null };
}

function normalizeBrandRules(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function buildRequestErrorEnvelope(
  requestType: RequestType,
  schemaVersion: string,
  model: string,
  message: string,
  riskLevel: RiskLevel = "high",
): Envelope {
  return {
    success: false,
    request_type: requestType,
    schema_version: schemaVersion,
    model,
    output: {},
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_cost_usd: null },
    safety: {
      passed: false,
      reasons: [message],
      risk_level: riskLevel,
      notes: [],
    },
    errors: [message],
  };
}

async function handleTextOrImageRequest(
  request: JalapenoAIRequest,
  model: string,
  schemaName: string,
  schema: Record<string, unknown>,
): Promise<Envelope> {
  try {
    const apiKey = envOpenAIKey();
    if (!apiKey) {
      return buildRequestErrorEnvelope(request.request_type, request.output_schema_version, model, "OPENAI_API_KEY is not configured in Supabase", "high");
    }

    const systemPrompt = request.request_type === "image_prompt"
      ? "Generate a production-ready Buffago image prompt as cinematic comedy scene direction. Include supported visual metadata. Return only the structured JSON requested."
      : "Generate a ready-to-post Buffago caption package. Return only the structured JSON requested.";
    const promptLibrary = normalizePromptLibrary(request.prompt_library);
    const promptLibraryVersion = request.prompt_library_version ?? "prompt-library-v1";
    const input = [
      { role: "system", content: [{ type: "input_text", text: `${systemPrompt}\n\n${buildSystemPrompt(request.request_type, request.content_slot, normalizeBrandRules(request.brand_rules), promptLibrary, promptLibraryVersion)}` }] },
      { role: "user", content: [{ type: "input_text", text: buildUserPrompt(request) }] },
    ];

    const response = await callOpenAIResponses(
      apiKey,
      {
        model,
        input,
        max_output_tokens: MODEL_CONFIG.max_output_tokens,
        text: {
          format: {
            type: "json_schema",
            name: schemaName,
            schema,
            strict: true,
          },
        },
      },
      MODEL_CONFIG.timeout_seconds,
      MODEL_CONFIG.retry_count,
      MODEL_CONFIG.retry_backoff_seconds,
    );

    const outputText = extractOutputText(response);
    const output = parseJsonObject(outputText);
    const textValues = collectFields(output, ["caption", "image_prompt", "alt_text", "content_angle", "why_this_post", "text_overlay"]);
    const safety = scanSafety(textValues);
    const usage = extractUsage(response);
    usage.estimated_cost_usd = estimatedCost(usage, "text_model");

    if (!safety.passed) {
      return {
        success: false,
        request_type: request.request_type,
        schema_version: request.output_schema_version,
        model,
        output,
        usage,
        safety,
        errors: safety.reasons,
      };
    }

    return {
      success: true,
      request_type: request.request_type,
      schema_version: request.output_schema_version,
      model,
      output,
      usage,
      safety,
      errors: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return buildRequestErrorEnvelope(request.request_type, request.output_schema_version, model, message, "high");
  }
}

async function handleBrandValidation(request: JalapenoAIRequest): Promise<Envelope> {
  const model = request.selected_text_model?.trim() || MODEL_CONFIG.default_validation_model;
  try {
    const apiKey = envOpenAIKey();
    if (!apiKey) {
      return buildRequestErrorEnvelope(request.request_type, request.output_schema_version, model, "OPENAI_API_KEY is not configured in Supabase", "high");
    }

    const promptLibrary = normalizePromptLibrary(request.prompt_library);
    const promptLibraryVersion = request.prompt_library_version ?? "prompt-library-v1";
    const systemPrompt = buildBrandValidationSystemPrompt(
      request.content_slot,
      normalizeBrandRules(request.brand_rules),
      promptLibrary,
      promptLibraryVersion,
    );

    const response = await callOpenAIResponses(
      apiKey,
      {
        model,
        input: [
          { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
          { role: "user", content: [{ type: "input_text", text: buildUserPrompt(request) }] },
        ],
        max_output_tokens: 512,
        text: {
          format: {
            type: "json_schema",
            name: "jalapeno_brand_validation",
            schema: BRAND_VALIDATION_SCHEMA,
            strict: true,
          },
        },
      },
      MODEL_CONFIG.timeout_seconds,
      MODEL_CONFIG.retry_count,
      MODEL_CONFIG.retry_backoff_seconds,
    );

    const output = parseJsonObject(extractOutputText(response));
    const textValues = collectFields(output, ["passed", "risk_level"]);
    const deterministic = scanSafety(textValues);
    const outputSafety: SafetyPayload = {
      passed: Boolean(output.passed) && deterministic.passed,
      reasons: [
        ...(Array.isArray(output.reasons) ? output.reasons.map((value) => String(value)) : []),
        ...deterministic.reasons,
      ],
      risk_level: Boolean(output.passed) && deterministic.passed ? "low" : "high",
      notes: [
        ...(Array.isArray(output.notes) ? output.notes.map((value) => String(value)) : []),
        ...deterministic.notes,
      ],
    };
    const usage = extractUsage(response);
    usage.estimated_cost_usd = estimatedCost(usage, "validation_model");

    return {
      success: true,
      request_type: request.request_type,
      schema_version: request.output_schema_version,
      model,
      output,
      usage,
      safety: outputSafety,
      errors: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return buildRequestErrorEnvelope(request.request_type, request.output_schema_version, model, message, "high");
  }
}

function pickModel(request: Partial<JalapenoAIRequest>): string {
  const selectedTextModel = request.selected_text_model?.trim();
  if (selectedTextModel) {
    return selectedTextModel;
  }
  return MODEL_CONFIG.default_text_model;
}

if (import.meta.main) {
  Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({
      success: false,
      request_type: "text_content",
      schema_version: "1.0",
      model: MODEL_CONFIG.default_text_model,
      output: {},
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_cost_usd: null },
      safety: { passed: false, reasons: ["Only POST is supported"], risk_level: "high", notes: [] },
      errors: ["Only POST is supported"],
    }, 405);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(buildRequestErrorEnvelope("text_content", "1.0", MODEL_CONFIG.default_text_model, "Request body must be valid JSON"), 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse(buildRequestErrorEnvelope("text_content", "1.0", MODEL_CONFIG.default_text_model, "Request body must be a JSON object"), 400);
  }

  const request = body as Partial<JalapenoAIRequest>;
  const requestType = request.request_type;
  if (requestType !== "text_content" && requestType !== "image_prompt" && requestType !== "brand_validation") {
    return jsonResponse(buildRequestErrorEnvelope("text_content", "1.0", MODEL_CONFIG.default_text_model, "Invalid request_type"), 400);
  }

  const contentSlot = request.content_slot;
  if (contentSlot !== "buffago_post" && contentSlot !== "meme_post") {
    return jsonResponse(buildRequestErrorEnvelope(requestType, String(request.output_schema_version ?? "1.0"), pickModel(request), "Invalid content_slot"), 400);
  }

  const response: Envelope = requestType === "brand_validation"
    ? await handleBrandValidation(request as JalapenoAIRequest)
    : await handleTextOrImageRequest(
      request as JalapenoAIRequest,
      pickModel(request),
      requestType === "image_prompt" ? "jalapeno_image_prompt" : "jalapeno_text_content",
      requestType === "image_prompt" ? IMAGE_OUTPUT_SCHEMA : TEXT_OUTPUT_SCHEMA,
    );

  const status = response.success ? 200 : 400;
  return jsonResponse(response, status);
  });
}
