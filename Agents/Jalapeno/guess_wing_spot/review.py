"""Private human visual findings, independent of source-photo/app records."""
import hashlib
import re


def apply_review(photos, repository, entries):
    """A known answer clue can exclude unchanged bytes, never arbitrary IDs.

    Stale findings fail closed until reviewed against the changed source. This
    is not an approval mechanism: every resulting reel still requires review.
    """
    indexed = {}
    for entry in entries or []:
        if (not re.fullmatch(r"[0-9a-f-]{36}", str(entry.get("photo_id", "")))
                or not re.fullmatch(r"[0-9a-f]{64}", str(entry.get("processed_sha256", "")))
                or entry.get("decision") != "exclude_answer_clue"
                or not entry.get("reason") or not entry.get("reviewed_at")):
            raise ValueError("Invalid private visual-review finding")
        if entry["photo_id"] in indexed:
            raise ValueError("Duplicate visual-review finding")
        indexed[entry["photo_id"]] = entry
    retained, findings = [], []
    for photo in photos:
        finding = indexed.get(photo.id)
        if finding:
            digest = hashlib.sha256(repository.photo_bytes(photo.id)).hexdigest()
            findings.append({"photo_id": photo.id, "decision": "excluded_known_answer_clue" if digest == finding["processed_sha256"]
                             else "excluded_stale_visual_review_requires_reinspection", "reviewed_at": finding["reviewed_at"],
                             "reason": finding["reason"], "processed_sha256": digest})
        else:
            retained.append(photo)
    return retained, findings
