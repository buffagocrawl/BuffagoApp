from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

from prompt_library_loader import PROMPT_LIBRARY_VERSION


BUFFAGO_VISUAL_STYLE = (
    "Ultra realistic cinematic photography with a viral Instagram meme feel, not stock photography. "
    "Comedy first, food second, story third, with warm sports bar, brewery, or neighborhood restaurant lighting, "
    "highly expressive faces, natural imperfections, visible emotion, motion and action, shallow depth of field, "
    "an obvious focal point, background characters reacting naturally, no staged poses, no AI-looking smiles, "
    "professional food photography quality, and professional commercial photography quality."
)

WING_FOOD_DIRECTION = (
    "The wings are the visual centerpiece in the foreground or clear focal plane: golden crisp edges, glossy buffalo-orange sauce, "
    "visible texture, steam, pepper and seasoning detail, creamy ranch or blue cheese cups nearby, celery and carrots as supporting props."
)

STRICT_NEGATIVE_RULES = (
    "no visible words, no captions, no meme text, no logos, no signage, no screenshots, "
    "no UI, no prompt text, no fake app screens, no abstract placeholder shapes"
)

STATIC_SCENE_AVOIDANCE = (
    "Avoid a static seated conversation or two people simply sitting across a table; the scene should feel caught mid-action."
)

CAMERA_VARIANTS = (
    "dramatic close-up from plate level with sauce shine and faces reacting behind the wings",
    "overhead chaos shot showing hands reaching, napkins flying, sauce cups sliding, and wings anchoring the frame",
    "bartender POV from behind the bar watching the argument unfold across a wing basket",
    "booth-level cinematic wide shot with motion blur, packed restaurant energy, and wings in the front focal plane",
    "phone-recording social-media POV, as if a bystander caught the ridiculous wing moment live",
    "referee or sports broadcast angle with a mock-serious wing ruling happening at the table",
    "kitchen pass perspective with hot wings steaming under warm lights while the dining room reacts",
    "tailgate wide shot with fans circling a heroic tray of wings during a ridiculous debate",
    "wing festival crowd shot with people gasping, cheering, and pointing at the saucy centerpiece",
)

SCENE_TYPES = (
    "packed sports bar",
    "busy brewery wing night",
    "neighborhood restaurant booth section",
    "kitchen pass during a rush",
    "tailgate table",
    "wing festival tasting tent",
    "restaurant counter with regulars",
)

ACTION_VERBS = (
    "pointing",
    "grabbing",
    "gasping",
    "cheering",
    "dropping to knees",
    "slamming the table",
    "holding a wing like evidence",
    "defending a basket",
    "facepalming",
    "celebrating",
)

EMOTIONAL_CUES = (
    "mock outrage",
    "comedic disbelief",
    "restaurant-freezes-in-silence energy",
    "triumphant wing confidence",
    "betrayed best-friend shock",
    "over-serious game-day intensity",
)

COMEDY_BEATS = (
    "one person stands on a booth pointing a saucy wing like courtroom evidence while another shields the basket like treasure",
    "a mock referee makes an exaggerated ruling over flats versus drums while everyone at nearby tables reacts",
    "a ranch loyalist guards a dipping cup with two hands while friends gasp like a rule was broken",
    "a heat seeker takes one bite and tries to look brave while the whole restaurant silently clocks the panic",
    "a boneless defender presents a nugget like a legal exhibit while wing purists recoil in theatrical disbelief",
    "a sauce scientist inspects a wing under the kitchen pass lights while diners cheer the experiment",
    "a newcomer drops to one knee in awe of the first perfect wing while the table erupts around them",
    "the bartender facepalms as a wing debate becomes far too serious for a normal Tuesday",
)

CHARACTER_ARCHETYPES: dict[str, str] = {
    "The Ranch Guy": "overprotective of ranch, clutching sauce cups like valuables, proud and slightly defensive",
    "The Flats Purist": "treats flats as the only serious wing choice, precise, smug, and theatrically offended",
    "The Drum Defender": "big-energy drum supporter, points with conviction and celebrates every saucy bite",
    "The Wing Referee": "mock-official peacemaker using hand signals and exaggerated judgment over wing disputes",
    "The Newbie": "wide-eyed first-timer reacting like a perfect wing changed the room",
    "The Sauce Scientist": "curious sauce tinkerer inspecting color, gloss, heat, and texture like a lab result",
    "The Heat Seeker": "brave spice chaser trying not to reveal the sauce is winning",
    "The Boneless Defender": "chaotic contrarian defending boneless wings against a horrified table",
}


@dataclass(frozen=True, slots=True)
class BuffagoImageDirection:
    visual_style: str
    camera_angle: str
    scene_type: str
    comedy_beat: str
    character_archetype: str
    character_description: str
    wing_focus_level: str
    prompt_version: str

    def metadata(self) -> dict[str, str]:
        return {
            "visual_style": self.visual_style,
            "camera_angle": self.camera_angle,
            "scene_type": self.scene_type,
            "comedy_beat": self.comedy_beat,
            "character_archetype": self.character_archetype,
            "character_description": self.character_description,
            "wing_focus_level": self.wing_focus_level,
            "prompt_version": self.prompt_version,
        }


def _stable_index(seed: str, values: tuple[str, ...], *, salt: str = "") -> int:
    if not values:
        return 0
    digest = hashlib.sha256(f"{seed}:{salt}".encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % len(values)


def build_buffago_image_direction(seed: str, *, content_type: str = "") -> BuffagoImageDirection:
    archetype_names = tuple(CHARACTER_ARCHETYPES)
    archetype = archetype_names[_stable_index(seed, archetype_names, salt="archetype")]
    wing_focus = "maximum" if content_type in {"meme", "funny_observation", "restaurant_spotlight", "hidden_gem"} else "high"
    return BuffagoImageDirection(
        visual_style="buffago_cinematic_comedy_food_v2",
        camera_angle=CAMERA_VARIANTS[_stable_index(seed, CAMERA_VARIANTS, salt="camera")],
        scene_type=SCENE_TYPES[_stable_index(seed, SCENE_TYPES, salt="scene")],
        comedy_beat=COMEDY_BEATS[_stable_index(seed, COMEDY_BEATS, salt="beat")],
        character_archetype=archetype,
        character_description=CHARACTER_ARCHETYPES[archetype],
        wing_focus_level=wing_focus,
        prompt_version=f"{PROMPT_LIBRARY_VERSION}:buffago-visual-v2",
    )


def apply_prompt_metadata(metadata: dict[str, Any], direction: BuffagoImageDirection) -> None:
    metadata.update(direction.metadata())


def build_scene_direction_prompt(
    *,
    setting: str,
    characters: str,
    conflict: str,
    mood: str,
    direction: BuffagoImageDirection,
) -> str:
    return (
        f"{BUFFAGO_VISUAL_STYLE} In a {setting}, {characters}. "
        f"The conflict is visually obvious: {conflict}. "
        f"The comedy beat is {direction.comedy_beat}, with {direction.character_archetype}, {direction.character_description}. "
        f"Use {direction.camera_angle}. {WING_FOOD_DIRECTION} "
        f"The mood is {mood}, full of {EMOTIONAL_CUES[_stable_index(direction.comedy_beat, EMOTIONAL_CUES, salt='mood')]} and active gestures like "
        f"{ACTION_VERBS[_stable_index(direction.comedy_beat, ACTION_VERBS, salt='action-a')]} and "
        f"{ACTION_VERBS[_stable_index(direction.character_archetype, ACTION_VERBS, salt='action-b')]}. "
        "Background characters should react naturally with gasps, cheers, facepalms, disbelief, or someone recording on a phone. "
        f"{STATIC_SCENE_AVOIDANCE} No alcohol focus, no distorted anatomy, no uncanny faces, no cluttered stock-photo energy, {STRICT_NEGATIVE_RULES}."
    )
