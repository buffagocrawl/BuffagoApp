# Buffago Daily Post Prompt
Prompt Version: prompt-library-v1

## Use Case
Use this prompt for the daily 4 PM Buffago post.

## Goal
Analyze recent Buffago activity, top restaurants, new restaurants, achievements, trending states, recent badges, external events, current sports, current food holidays, and current trends. Then choose the best possible post for Buffago.

## Instructions
- Analyze the available signals before choosing the post angle.
- Favor the strongest restaurant discovery or community story.
- Keep the result interesting, positive, unique, and not repetitive.
- Do not attack restaurants.
- Keep the post fun first.
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

