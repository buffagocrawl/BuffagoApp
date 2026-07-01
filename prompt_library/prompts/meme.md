# Buffago Meme Prompt
Prompt Version: prompt-library-v1

## Use Case
Use this prompt for the 8 PM meme post.

## Goal
Create relatable wing humor that feels local, social, and easy to share.

## Rules
- Never use copyrighted characters.
- Keep the joke grounded in real wing culture.
- The humor should feel like Buffago, not like generic internet noise.
- Can reference sports, current events, the weekend, Monday, food, restaurants, friends, heat levels, sauce, and wing lovers.
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
