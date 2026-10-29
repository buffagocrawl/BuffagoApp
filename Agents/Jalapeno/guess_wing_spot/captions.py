import re

PHOTO_SHARING_CTA = "Got wing pics? Share yours on BuffaGo. Available on the App Store and Google Play."


def caption_credits(selected):
    anonymous = [i for i, p in enumerate(selected, 1)
                 if p.photo.approval.get("attribution_preference") == "anonymous"]
    lines = []
    for i, p in enumerate(selected, 1):
        if i not in anonymous:
            lines.append(f"Photo {i}: {p.photo.credit}")
        elif i == anonymous[0]:
            if len(anonymous) == 1:
                lines.append(f"Photo {i}: Anonymous community member")
            else:
                label = "Photos" if len(anonymous) == len(selected) else "Photos " + ", ".join(map(str, anonymous))
                lines.append(f"{label}: Anonymous community members")
    return "\n".join(lines)


def caption(group, selected):
    hook = f"Know your {group.label} wings? Name these 3."
    slug = re.sub(r"[^A-Za-z0-9]", "", group.label.split(",")[0])
    geographic = f"#{slug}Wings" if group.level == "state" else f"#{slug}{group.state_code}Food"
    credits = caption_credits(selected)
    body = f"{hook}\nComment your restaurant guesses: 1, 2, 3.\n\nPhoto credits (plain text):\n{credits}\n\n{PHOTO_SHARING_CTA}\n\n#BuffaGo {geographic} #ChickenWings #WingChallenge"
    # No verified bio download-link configuration exists in this isolated
    # generator. Do not promise a link based solely on app-store availability.
    # Credits are never transformed into @mentions. All geographic tags derive
    # solely from the selected challenge area, not individual restaurant towns.
    return hook, body
