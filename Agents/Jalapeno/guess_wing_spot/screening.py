"""Bounded free local OCR; no AI or watermark removal. Not a logo guarantee."""
import csv
import hashlib
import io
import re
import subprocess
import tempfile
from difflib import SequenceMatcher
from pathlib import Path

from PIL import Image, ImageOps, __version__ as PILLOW_VERSION

from .eligibility import credit_reveals_answer
from .rendering import decode_photo

VERSION = "tesseract-name-clues-v1"
GENERIC = {"the", "and", "bar", "grill", "restaurant", "tavern", "pizza", "wings", "company", "sports", "famous", "of"}


def aliases(name):
    words = re.findall(r"[a-z0-9]+", name.casefold().replace("'", "").replace("’", ""))
    distinctive = [w for w in words if w not in GENERIC and len(w) >= 4]
    return sorted(set(distinctive + [" ".join(words)]))


def clue(words, names):
    joined = " ".join(words).casefold()
    compact = re.sub(r"[^a-z0-9]", "", joined)
    for alias in names:
        target = re.sub(r"[^a-z0-9]", "", alias)
        if len(target) >= 4 and target in compact:
            return True
        if any(len(word) >= 4 and SequenceMatcher(None, word, target).ratio() >= 0.80 for word in words):
            return True
    return False


class Screener:
    def __init__(self, ledger, executable="tesseract"):
        self.ledger, self.executable = ledger, executable
        try:
            result = subprocess.run([executable, "--version"], capture_output=True, text=True, timeout=10, check=True)
            self.version = VERSION + ":" + result.stdout.splitlines()[0] + ":pillow-" + PILLOW_VERSION
        except (OSError, subprocess.SubprocessError, IndexError):
            raise ValueError("local_ocr_unavailable") from None

    def inspect(self, photo, data):
        digest = hashlib.sha256(data).hexdigest()
        names = aliases(photo.destination["name"])
        binding = hashlib.sha256((digest + self.version + repr(names) + photo.credit).encode()).hexdigest()
        key = "screening/" + binding + ".json"
        prior = self.ledger.get(key)
        if prior and prior.get("binding") == binding and prior.get("asset_sha256") == digest and prior.get("screening_version") == self.version:
            return prior
        if prior:
            raise ValueError("invalid_durable_screening_record")
        decision, reason = "passed", "no_name_clue_detected"
        image = decode_photo(data)
        if min(image.size) < 480:
            decision, reason = "unreliable", "resolution_below_screening_floor"
        elif credit_reveals_answer(photo.credit, photo.destination["name"]) or clue(re.findall(r"[a-z0-9]+", photo.credit.casefold()), names):
            decision, reason = "suspicious", "required_credit_reveals_answer"
        else:
            try:
                image.thumbnail((2048, 2048))
                with tempfile.TemporaryDirectory(prefix="wing-ocr-") as directory:
                    path = Path(directory) / "source.png"
                    for angle in (0, 90, 180, 270):
                        ImageOps.autocontrast(ImageOps.grayscale(image.rotate(angle, expand=True))).save(path)
                        for psm in (6, 11):
                            result = subprocess.run([self.executable, str(path), "stdout", "--psm", str(psm), "tsv"],
                                                    capture_output=True, text=True, timeout=20, check=True)
                            rows = list(csv.DictReader(io.StringIO(result.stdout), delimiter="\t"))
                            if not rows or "conf" not in rows[0]:
                                raise ValueError("invalid_ocr_output")
                            words = [re.sub(r"[^a-z0-9]", "", r.get("text", "").casefold()) for r in rows if float(r["conf"]) >= 15]
                            if clue(words, names):
                                decision, reason = "suspicious", "restaurant_name_or_alias_detected"
                            # Long low-confidence words could hide an answer.
                            if decision == "passed" and any(len(re.sub(r"[^a-zA-Z]", "", r.get("text", ""))) >= 4 and 0 <= float(r["conf"]) < 15 for r in rows):
                                decision, reason = "unreliable", "ambiguous_text_requires_another_source"
            except (OSError, subprocess.SubprocessError, ValueError):
                decision, reason = "unreliable", "ocr_did_not_complete_reliably"
        record = {"asset_sha256": digest, "screening_version": self.version, "binding": binding,
                  "decision": decision, "reason": reason}
        if not self.ledger.create(key, record):
            record = self.ledger.get(key)
        return record
