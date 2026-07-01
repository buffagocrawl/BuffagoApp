# Buffago Image Generation Prompt
Prompt Version: prompt-library-v1

## Use Case
Use this prompt when generating an image prompt for OpenAI image generation.

## Goals
- Write a direct visual scene description, not a meta instruction.
- Start with the scene itself, not phrases like "Create an Instagram-quality image..."
- Keep the prompt usable as the exact final prompt sent to the image model.
- Make the image feel like a viral Instagram meme moment, not a generic stock photo.
- Comedy comes first, food second, story third.
- Food should look delicious, realistic, and mouthwatering.
- Restaurant interiors and people should feel natural, imperfect, expressive, and caught mid-action.
- Brand or app energy should be implied visually, not spelled out with labels.

## Art Direction
- Describe the prompt as scene direction in one clean paragraph.
- Every prompt should include setting, characters, conflict, visual comedy beat, wing/food direction, camera angle, mood, and background reactions.
- Use ultra realistic cinematic photography, warm sports bar / brewery / restaurant lighting, shallow depth of field, obvious focal point, professional food photography quality, and professional commercial photography quality.
- Wings should be the visual centerpiece: golden crisp edges, glossy buffalo sauce, visible texture, steam, seasoning detail, creamy ranch or blue cheese cups, and celery/carrots as supporting props.
- Use action and emotion: pointing, grabbing, gasping, cheering, dropping to knees, slamming the table, holding a wing like evidence, defending a basket, facepalming, celebrating, mock outrage, comedic disbelief, or restaurant-freezes-in-silence energy.
- Include natural background reactions such as a bartender facepalming, nearby diners staring, someone recording on a phone, or friends cheering.
- Vary camera/scene direction across prompts: dramatic close-up, overhead chaos shot, bartender POV, booth-level cinematic wide shot, phone-recording/social-media POV, referee/sports broadcast angle, kitchen pass perspective, tailgate wide shot, or wing festival crowd shot.
- Recurring Buffago character archetypes may be used: The Ranch Guy, The Flats Purist, The Drum Defender, The Wing Referee, The Newbie, The Sauce Scientist, The Heat Seeker, and The Boneless Defender.
- Do not use raw prompt labels like `Composition:`, `Lighting:`, `Camera angle:`, or `Negative prompt guidance:`.
- Prefer photorealistic food and restaurant scenes for memes unless a different style is clearly requested.
- The base AI image should contain no visible words unless explicitly intended elsewhere in the pipeline.
- Avoid static seated conversation scenes unless specifically requested. Do not default to two people sitting across a table arguing.
- Do not use staged poses, AI-looking smiles, stock-photo staging, or clean corporate lifestyle photography.

## Structured Metadata
When the response schema supports these fields, include concise metadata values:
- `visual_style`
- `camera_angle`
- `scene_type`
- `comedy_beat`
- `character_archetype`
- `wing_focus_level`
- `prompt_version`

## Hard Constraints
- Include these constraints in the final prompt naturally:
  no visible words, no captions, no UI, no prompt text, no fake app screens, no abstract placeholder shapes.
