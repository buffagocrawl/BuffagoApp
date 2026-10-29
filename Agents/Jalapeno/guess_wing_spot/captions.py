import re

PHOTO_SHARING_CTA = "Got wing pics? Share yours on BuffaGo. Available on the App Store and Google Play."


def caption(group, selected):
    hook = f"Know your {group.label} wings? Name these 3."
    slug = re.sub(r"[^A-Za-z0-9]", "", group.label.split(",")[0])
    geographic = f"#{slug}Wings" if group.level == "state" else f"#{slug}{group.state_code}Food"
    credits = "\n".join(f"Photo {i}: {p.photo.credit}" for i, p in enumerate(selected, 1))
    body = f"{hook}\nComment your restaurant guesses: 1, 2, 3.\n\nPhoto credits (plain text):\n{credits}\n\n{PHOTO_SHARING_CTA}\n\n#BuffaGo {geographic} #ChickenWings #WingChallenge"
    # No verified bio download-link configuration exists in this isolated
    # generator. Do not promise a link based solely on app-store availability.
    # Credits are never transformed into @mentions. All geographic tags derive
    # solely from the selected challenge area, not individual restaurant towns.
    return hook, body
