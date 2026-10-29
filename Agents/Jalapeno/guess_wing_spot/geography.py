"""Conservative address-based geography; no geocoder and no app-data edits."""
from __future__ import annotations

import hashlib
import math
import re
import unicodedata
from dataclasses import dataclass

from .eligibility import Photo


def normalized(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().casefold()
    return " ".join(re.findall(r"[a-z0-9]+", value))


def town_label(value: str, state_code: str, state_name: str) -> str:
    value = normalized(value)
    for suffix in (normalized(state_name), normalized(state_code)):
        if value.endswith(" " + suffix):
            value = value[:-(len(suffix) + 1)]
    return value.strip()


def street_key(value: str) -> str:
    value = value.replace("#", " unit ")
    aliases = {"street": "st", "road": "rd", "avenue": "ave", "boulevard": "blvd", "drive": "dr",
               "lane": "ln", "court": "ct", "highway": "hwy", "suite": "unit", "ste": "unit",
               "north": "n", "south": "s", "east": "e", "west": "w", "place": "pl"}
    return " ".join(aliases.get(t, t) for t in normalized(value).split())


@dataclass(frozen=True)
class LocatedPhoto:
    photo: Photo
    physical_key: str
    state_code: str
    state_name: str
    town: str | None
    evidence: dict


@dataclass(frozen=True)
class Group:
    key: str
    level: str
    label: str
    state_code: str
    photos: tuple[LocatedPhoto, ...]

    @property
    def locations(self):
        return {p.physical_key for p in self.photos}

    def summary(self):
        return {"key": self.key, "level": self.level, "label": self.label,
                "state": self.state_code, "photos": len(self.photos), "locations": len(self.locations)}


def locate(photo: Photo) -> LocatedPhoto | None:
    d, state = photo.destination, photo.state
    code, name = str(state.get("state_code", "")).strip().upper(), str(state.get("state_name", "")).strip()
    if not re.fullmatch(r"[A-Z]{2}", code) or not name:
        return None
    address = str(d.get("address") or "").strip()
    # A state independently present in a complete address is required. City-only
    # labels are not sufficient physical-location or state evidence.
    match = re.fullmatch(r"(.+?),\s*([^,]+),\s*([A-Za-z]{2})\s+(\d{5})(?:-\d{4})?(?:,?\s*(?:USA|United States))?", address, re.I)
    if not match or match[3].upper() != code:
        return None
    street, town, _, postal = match.groups()
    # Some addresses separate unit from street with a comma. Preserve the unit.
    street = street.replace(",", " ")
    if not re.match(r"^\d", street) or not re.fullmatch(r"[A-Za-z][A-Za-z .'-]*", town.strip()):
        return None
    address_town = town_label(town, code, name)
    city = town_label(str(d.get("city") or ""), code, name)
    town_verified = bool(city and city == address_town)
    # On contradiction, keep only independently corroborated state grouping.
    # Do not silently geocode a postal place into an incorporated municipality.
    identity = "|".join((code, street_key(street), address_town, postal))
    physical = hashlib.sha256(identity.encode()).hexdigest()[:24]
    evidence = {"method": "complete_address_and_state_record", "address": address,
                "state_code": code, "address_town": town.strip(), "stored_city": d.get("city"),
                "town_verified": town_verified, "town_conflict_or_missing": not town_verified,
                "canonical_address_identity": identity}
    return LocatedPhoto(photo, physical, code, name, address_town if town_verified else None, evidence)


def deduplicate_locations(photos: list[LocatedPhoto]) -> list[LocatedPhoto]:
    """Merge duplicate destination records with same street and near coordinates.

    Normalized complete addresses already merge exact duplicates. Proximity is
    only secondary evidence when street number and unit agree; chain branches
    at different addresses/units are never merged solely by restaurant name.
    """
    from dataclasses import replace
    parents = {p.physical_key: p.physical_key for p in photos}

    def root(key):
        while parents[key] != key:
            key = parents[key]
        return key

    def coords(p):
        try:
            lat, lng = float(p.photo.destination["lat"]), float(p.photo.destination["lng"])
            return (lat, lng) if math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180 else None
        except (KeyError, TypeError, ValueError):
            return None

    for i, a in enumerate(photos):
        for b in photos[i + 1:]:
            if a.state_code != b.state_code:
                continue
            street_a = a.evidence["canonical_address_identity"].split("|")[1]
            street_b = b.evidence["canonical_address_identity"].split("|")[1]
            if street_a != street_b:
                continue
            ca, cb = coords(a), coords(b)
            if ca and cb:
                meters = math.hypot((ca[0] - cb[0]) * 111_320,
                                    (ca[1] - cb[1]) * 111_320 * math.cos(math.radians(ca[0])))
                if meters < 20:
                    low, high = sorted((root(a.physical_key), root(b.physical_key)))
                    parents[high] = low
    return [replace(p, physical_key=root(p.physical_key)) for p in photos]


def discover(photos: list[Photo], county_mapping: list[dict] | None = None):
    located, skipped = [], []
    for photo in photos:
        place = locate(photo)
        if place:
            located.append(place)
        else:
            skipped.append({"photo_id": photo.id, "reason": "complete_unambiguous_address_and_state_required"})
    located = deduplicate_locations(located)
    county_by_identity = {}
    for entry in county_mapping or []:
        if (entry.get("verified") is True and entry.get("evidence") and entry.get("verified_at")
                and entry.get("canonical_address_identity") and re.fullmatch(r"[A-Z]{2}", entry.get("state_code", ""))
                and re.fullmatch(r"[A-Za-z][A-Za-z .'-]{0,70}", entry.get("county", ""))):
            identity = entry["canonical_address_identity"]
            if identity in county_by_identity and county_by_identity[identity] != entry:
                raise ValueError("Conflicting verified county mappings")
            county_by_identity[identity] = entry
    buckets = {}

    def add(key, level, label, place):
        bucket = buckets.setdefault(key, {"level": level, "label": label, "state": place.state_code, "photos": []})
        bucket["photos"].append(place)

    for p in located:
        add("state:" + p.state_code, "state", p.state_name, p)
        if p.town:
            add(f"town:{p.state_code}:{p.town}", "town", f"{p.town.title()}, {p.state_code}", p)
        mapping = county_by_identity.get(p.evidence["canonical_address_identity"])
        if mapping and mapping["state_code"] == p.state_code:
            # Retain the actual mapping evidence in the private manifest.
            p.evidence["county_mapping"] = mapping
            add(f"county:{p.state_code}:{normalized(mapping['county'])}", "county", f"{mapping['county']}, {p.state_code}", p)
    groups = [Group(key, b["level"], b["label"], b["state"], tuple(b["photos"])) for key, b in sorted(buckets.items())]
    return [g for g in groups if len(g.locations) >= 3], {
        "address_exclusions": skipped, "county_mapping_entries": len(county_by_identity),
        "county_support": "verified_mapping_only" if county_by_identity else "unavailable_skipped",
        "groups_below_three_locations": [g.summary() for g in groups if len(g.locations) < 3],
    }
