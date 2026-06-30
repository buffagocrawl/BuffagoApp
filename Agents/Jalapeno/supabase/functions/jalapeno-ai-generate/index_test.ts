import { scanSafety } from "./index.ts";

Deno.test("negative private username guidance passes", () => {
  const result = scanSafety([
    {
      field_name: "negative_prompt_guidance",
      text: "Do not show private usernames, real social media screenshots, or identifiable app UI.",
    },
  ]);

  if (!result.passed) {
    throw new Error(`Expected pass, got ${JSON.stringify(result)}`);
  }
});

Deno.test("generic city map phone image prompt passes", () => {
  const result = scanSafety([
    {
      field_name: "image_prompt",
      text: "Create a square Instagram meme image for Buffago with a generic phone showing a Buffago-style map with pins for Buffalo, Rochester, Albany, and Erie.",
    },
    {
      field_name: "composition_notes",
      text: "Keep the phone UI generic and map-like. No private user data.",
    },
  ]);

  if (!result.passed) {
    throw new Error(`Expected pass, got ${JSON.stringify(result)}`);
  }
});

Deno.test("email address fails with structured match", () => {
  const result = scanSafety([
    { field_name: "caption", text: "Feature user email test.user@example.com in the graphic." },
  ]);

  if (result.passed) {
    throw new Error("Expected failure for email address");
  }
  if (result.matches?.[0]?.matched_pattern_name !== "email_address") {
    throw new Error(`Expected email_address match, got ${JSON.stringify(result.matches)}`);
  }
});

Deno.test("fields are scanned independently", () => {
  const result = scanSafety([
    { field_name: "negative_prompt_guidance", text: "Do not show private usernames." },
    { field_name: "caption", text: "Contact test.user@example.com for pickup." },
  ]);

  if (result.passed) {
    throw new Error("Expected failure for email in a separate field");
  }
  if (result.matches?.[0]?.field_name !== "caption") {
    throw new Error(`Expected caption field match, got ${JSON.stringify(result.matches)}`);
  }
});

Deno.test("phone number fails with structured match", () => {
  const result = scanSafety([
    { field_name: "caption", text: "Show phone contact 716-555-0199 on screen." },
  ]);

  if (result.passed) {
    throw new Error("Expected failure for phone number");
  }
  if (result.matches?.[0]?.matched_pattern_name !== "phone_number") {
    throw new Error(`Expected phone_number match, got ${JSON.stringify(result.matches)}`);
  }
});

Deno.test("street address fails with structured match", () => {
  const result = scanSafety([
    { field_name: "caption", text: "Use 123 Main Street Buffalo NY in the overlay." },
  ]);

  if (result.passed) {
    throw new Error("Expected failure for street address");
  }
  if (result.matches?.[0]?.matched_pattern_name !== "street_address") {
    throw new Error(`Expected street_address match, got ${JSON.stringify(result.matches)}`);
  }
});

Deno.test("access token fails with redacted snippet", () => {
  const result = scanSafety([
    { field_name: "caption", text: "access token: sk_test_1234567890abcdefghijklmnop" },
  ]);

  if (result.passed) {
    throw new Error("Expected failure for access token");
  }
  if (result.matches?.[0]?.matched_pattern_name !== "access_token") {
    throw new Error(`Expected access_token match, got ${JSON.stringify(result.matches)}`);
  }
  if (!result.matches[0].matched_text_snippet.includes("[redacted:access_token]")) {
    throw new Error(`Expected redacted snippet, got ${result.matches[0].matched_text_snippet}`);
  }
});
