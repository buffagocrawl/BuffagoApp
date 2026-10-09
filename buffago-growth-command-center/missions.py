"""Deterministic manual coaching; no publishing, generated content, or network calls."""
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from cache import SnapshotCache

THEMES = ('Local Wing Rankings', 'Wing Wars', 'Hidden Gem', 'Wing Debate',
          'Weekend Wing Challenge', 'Wing Spotlight', 'Community Recap')
TOWNS = ('Hartford', 'New Haven', 'Stamford', 'Bridgeport', 'Waterbury', 'Danbury')
DEBATES = ('Ranch vs. blue cheese', 'Drums vs. flats', 'Breaded vs. naked',
           'Buffalo vs. barbecue', 'Mild vs. extra hot', 'Bone-in vs. boneless')


def eastern_day(now=None):
    moment = now or datetime.now(timezone.utc)
    if moment.tzinfo is None:
        raise ValueError('An aware timestamp is required')
    return moment.astimezone(ZoneInfo('America/New_York')).date()


@dataclass(frozen=True)
class Mission:
    day: date
    theme: str
    topic: str
    what: str
    instructions: str
    why: str
    result: str
    question: str
    minutes: int
    context: str


def mission_for(day, snapshot=None):
    week = (day - timedelta(days=day.weekday())).toordinal() // 7
    town, debate = TOWNS[week % len(TOWNS)], DEBATES[week % len(DEBATES)]
    topics = (f'Ask for wing nominations in {town}', f'Invite two {town} wing contenders',
              f'Ask for a lesser-known wing spot in {town}', debate,
              f'Try one new wing spot in {town}', f'Share your own wing visit in {town}',
              f'What was your best wing discovery this week in {town}?')
    what = ('A town nomination poll; use a ranking only after checking real BuffaGo ratings.',
            'A two-restaurant comparison or nomination poll; do not declare a winner.',
            'A community request for an overlooked restaurant, or a verified personal discovery.',
            'A simple preference poll featuring the two sides of the debate.',
            'An invitation to visit a new restaurant and add an honest BuffaGo rating.',
            'An original visit photo or an approved community wing photo with permission.',
            'An open-ended community question; recap only verified recent activity.')[day.weekday()]
    specific = (
        'Open BuffaGo and check the town, rating counts and scores. If coverage is sufficient, describe the list as highest-rated on BuffaGo, state counts and date, and disclose limited coverage. Otherwise collect nominations; never invent a ranking.',
        'Choose two real restaurants after checking names and towns. Show verified scores and counts only if both have meaningful coverage. Otherwise ask for nominations. Do not claim a statistically proven winner.',
        'Check real ratings before describing a place as underrated. Verify its name and town. Use your own visit photo or an approved submission with permission; otherwise ask followers for suggestions.',
        'Photograph your own wings or make a plain text poll manually. Present both preferences neutrally and invite a reason for the choice.',
        'Choose a real restaurant you can visit. Invite followers to try somewhere new this weekend, then open BuffaGo and rate their own experience.',
        'Take a real food photo during your visit. Confirm the restaurant name and location. Credit approved community submissions and obtain permission. Never substitute stock wing images.',
        'Check recent ratings and discussions manually. Mention only facts you can verify. With insufficient activity, use the open-ended question instead of claiming popularity or a trend.'
    )[day.weekday()]
    activity = getattr(getattr(snapshot, 'wing', None), 'current', None)
    context = 'Restaurant-level evidence is unavailable in this snapshot; verify manually or use the evergreen topic.'
    if activity is not None:
        context += f' The existing snapshot reports {activity:g} ratings in its last-24-hour window; this is not a restaurant trend.'
    return Mission(day, THEMES[day.weekday()], topics[day.weekday()], what,
                   specific + ' Create the post yourself. Add the engagement question in your own words. Publish manually to Instagram and Facebook, then record only the platforms you actually used.',
                   'Local participation can introduce BuffaGo to friends of commenters and encourage real restaurant discovery.',
                   'After 24–48 hours, check reach, meaningful comments, shares and profile visits separately on each platform. Compare with your recent similar posts; note any new ratings without assuming attribution.',
                   debate + ': which do you prefer, and why?' if day.weekday() == 3 else f'Which wing spot in {town} would you recommend, and why?',
                   20 if day.weekday() == 5 else 10, context)


class MissionStore:
    """One local writer, using the same atomic JSON pattern as snapshot persistence."""
    def __init__(self, path):
        self.cache = SnapshotCache(path)

    def records(self):
        cached = self.cache.load()
        values = cached.payload.get('missions', {}) if cached else {}
        return values if isinstance(values, dict) else {}

    def complete(self, mission, platforms, now=None):
        platforms = sorted(set(platforms))
        if not platforms or any(p not in ('Instagram', 'Facebook') for p in platforms):
            raise ValueError('Select Instagram, Facebook, or both')
        moment = now or datetime.now(timezone.utc)
        if moment.tzinfo is None:
            raise ValueError('An aware completion timestamp is required')
        values = self.records()
        values[mission.day.isoformat()] = dict(date=mission.day.isoformat(), theme=mission.theme,
            topic=mission.topic, completed_at=moment.isoformat(), platforms=platforms,
            confirmation='owner confirmed manually')
        self.cache.save({'missions': values})

    def undo(self, day):
        values = self.records()
        values.pop(day.isoformat(), None)
        self.cache.save({'missions': values})

    def progress(self, day):
        monday = day - timedelta(days=day.weekday())
        values = self.records()
        return sum((monday + timedelta(days=i)).isoformat() in values for i in range(7))


def goal_contribution(title):
    if title and any(word in title.lower() for word in ('social', 'awareness', 'instagram', 'facebook', 'shares')):
        return f'This mission supports “{title}” by inviting local participation. Posting does not update the goal or prove results.'
    return 'Keep measuring the current weekly goal separately; manual posting does not change goal progress.'
