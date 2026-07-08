# Buffago Meme Prompt
Prompt Version: prompt-library-v2

## Use Case
Use this prompt for the 8 PM meme post.

## Goal
Create share-trigger wing content that feels local, social, and easy to send, tag, debate, or use to make wing plans.

## Rules
- Never use copyrighted characters.
- Keep the social hook grounded in real wing culture.
- The post should feel like Buffago, not like generic internet noise.
- Can reference sports, current events, the weekend, Monday, food, restaurants, friends, heat levels, sauce, and wing lovers.
- Prefer share triggers over punchlines: tag a friend, send this to someone, start a flats-versus-drums debate, make plans, challenge someone, or call out a wing-loving friend.
- Ban AI joke formats like "If this wing had a voicemail...", "understood the assignment", wings acting human, surreal one-liners, and unrelated captions.
- `meme_text` should usually be 3 to 8 words and no more than two short lines.
- `caption` must directly support the same idea as `meme_text`.
- `image_prompt` must describe only the visual scene.
- Do not ask the image model to render meme captions or text.
- The image prompt should explicitly forbid visible words, captions, UI, prompt text, fake app screens, and abstract placeholder shapes.
- Return JSON only.

## Output Shape
```json
{
  "meme_text": "",
  "image_prompt": "",
  "caption": ""
}
```
