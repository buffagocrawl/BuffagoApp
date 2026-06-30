# jalapeno-ai-generate

Supabase Edge Function for Jalapeno Phase 5 AI generation.

This function owns the OpenAI secret server-side. Jalapeno never stores `OPENAI_API_KEY` in its local `.env`.

## What it does

- accepts sanitized Jalapeno snapshots and external context
- calls OpenAI's Responses API server-side
- returns structured JSON for text content, image prompts, or brand validation
- returns token usage when OpenAI provides it
- applies a basic deterministic safety scan before returning success

## Required secret

Set the OpenAI secret in Supabase, not in Jalapeno:

```powershell
supabase secrets set OPENAI_API_KEY=your_openai_key_here
```

## Optional model overrides

These are optional and can be changed later without touching Jalapeno's local `.env`:

```powershell
supabase secrets set JALAPENO_TEXT_MODEL=gpt-5.5
supabase secrets set JALAPENO_IMAGE_MODEL=gpt-image-2
supabase secrets set JALAPENO_VALIDATION_MODEL=gpt-5.5
supabase secrets set JALAPENO_MAX_OUTPUT_TOKENS=1200
supabase secrets set JALAPENO_AI_TIMEOUT_SECONDS=75
supabase secrets set JALAPENO_AI_RETRY_COUNT=3
supabase secrets set JALAPENO_AI_RETRY_BACKOFF_SECONDS=2
supabase secrets set JALAPENO_AI_TEMPERATURE=0.7
```

## Deploy

```powershell
supabase functions deploy jalapeno-ai-generate
```

If you are testing locally:

```powershell
supabase functions serve jalapeno-ai-generate --no-verify-jwt
```

## Request shape

The function expects payloads like:

```json
{
  "request_type": "text_content",
  "agent_name": "Jalapeno",
  "run_id": "string",
  "internal_snapshot": {},
  "external_context": {},
  "content_slot": "buffago_post",
  "brand_rules": {},
  "prompt_library_version": "prompt-library-v1",
  "prompt_name": "buffago_post",
  "prompt_library": {},
  "output_schema_version": "1.0"
}
```

## Response shape

The function returns a JSON envelope containing:

- `success`
- `request_type`
- `schema_version`
- `model`
- `output`
- `usage`
- `safety`
- `errors`

## Notes

- The Edge Function should stay the only place that reads `OPENAI_API_KEY`.
- Jalapeno local code should only talk to the Supabase function URL.
- Later image generation can be added here without changing local secret handling.
