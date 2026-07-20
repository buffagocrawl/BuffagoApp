from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from creative_pair import create_creative_pair, repair_creative_pair, validate_creative_pair


caption = (
    "Who gets the last wing? Comment below.\n\n"
    "#BuffagoEats #ConnecticutEats #WingNight #Foodie #WingCrawl"
)
overlay = "SEND THIS TO\nYOUR WING CREW"
initial = validate_creative_pair(caption, overlay)
print(f"caption_cta_type={initial.caption_cta_type.value}")
print(f"initial_overlay_cta_type={initial.overlay_cta_type.value}")
print("creative_pair_validation_failed" if not initial.passed else "creative_pair_validation_succeeded")

pair = create_creative_pair(
    caption_text=caption,
    overlay_text=overlay,
    caption_source="incident_fixture",
    overlay_source="incident_fixture",
)
print("creative_pair_repair_started")
repaired = repair_creative_pair(pair)
final = validate_creative_pair(repaired.caption_text, repaired.overlay_text)
print(f"final_overlay_cta_type={final.overlay_cta_type.value}")
print("creative_pair_validation_succeeded" if final.passed else "creative_pair_validation_failed")
print(f"render_allowed={str(final.passed).lower()}")
print(f"publish_precheck_passed={str(final.passed).lower()}")
