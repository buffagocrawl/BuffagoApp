# Buffago Image Generation Prompt
Prompt Version: prompt-library-v1

## Use Case
Use this prompt when generating an image prompt for OpenAI image generation.

## Goals
- Write a direct visual scene description, not a meta instruction.
- Start with the scene itself, not phrases like "Create an Instagram-quality image..."
- Keep the prompt usable as the exact final prompt sent to the image model.
- Food should look delicious and realistic where appropriate.
- Restaurant interiors and people should feel natural.
- Brand or app energy should be implied visually, not spelled out with labels.

## Art Direction
- Describe lighting, camera framing, surfaces, and texture naturally in one clean paragraph.
- Do not use raw prompt labels like `Composition:`, `Lighting:`, `Camera angle:`, or `Negative prompt guidance:`.
- Prefer photorealistic food and restaurant scenes for memes unless a different style is clearly requested.
- The base AI image should contain no visible words unless explicitly intended elsewhere in the pipeline.

## Hard Constraints
- Include these constraints in the final prompt naturally:
  no visible words, no captions, no UI, no prompt text, no fake app screens, no abstract placeholder shapes.
