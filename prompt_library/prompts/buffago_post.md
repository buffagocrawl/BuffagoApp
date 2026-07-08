# Buffago Daily Post Prompt
Prompt Version: prompt-library-v2

## Use Case
Use this prompt for the daily 4 PM Buffago post.

## Goal
Analyze recent Buffago activity, top restaurants, new restaurants, achievements, trending states, recent badges, external events, current sports, current food holidays, and current trends. Then choose the best possible post for Buffago.

## Instructions
- Analyze the available signals before choosing the post angle.
- Favor the strongest restaurant discovery or community story.
- Keep the result interesting, positive, unique, and not repetitive.
- Do not attack restaurants.
- Keep the post social first.
- Prefer share-trigger concepts over generic humor.
- Good angles: tag a friend, send this to someone, make wing plans, debate flats versus drums, debate sauce or heat, or challenge someone.
- Ban wing personification, surreal AI jokes, and captions that do not match the image-text idea.
- Return JSON only.

## Output Shape
```json
{
  "type": "",
  "reason": "",
  "title": "",
  "caption": "",
  "hashtags": [],
  "image_prompt": "",
  "cta": ""
}
```
