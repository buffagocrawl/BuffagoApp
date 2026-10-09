"""Tolerant snapshot parsing and display-oriented calculations."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal
import math
from typing import Any


def as_number(value: Any) -> int | float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return value if math.isfinite(value) else None
    try:
        number = float(str(value))
        if not math.isfinite(number):
            return None
        return int(number) if number.is_integer() else number
    except (TypeError, ValueError):
        return None


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_text(value: Any) -> str | None:
    """Return clean display text without stringifying nulls or containers."""
    if not isinstance(value, str):
        return None
    text = " ".join(value.split())
    return text if text and text.lower() not in {"none", "null"} else None


def parse_date(value: Any) -> date | None:
    text = as_text(value)
    if not text:
        return None
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=parsed.tzinfo or timezone.utc)
    except ValueError:
        return None


def direction_arrow(direction: Any, change: Any = None) -> str:
    normalized = str(direction or "").lower()
    if normalized == "up":
        return "↑"
    if normalized == "down":
        return "↓"
    if normalized == "flat":
        return "→"
    number = as_number(change)
    return "↑" if number and number > 0 else "↓" if number and number < 0 else "→"


def combined_value(first: Any, second: Any) -> int | float | None:
    values = [value for value in (as_number(first), as_number(second)) if value is not None]
    return sum(values) if values else None


def fmt_number(value: Any, decimals: int = 0) -> str:
    number = as_number(value)
    if number is None:
        return "—"
    if decimals:
        return f"{number:,.{decimals}f}"
    return f"{number:,.0f}"


@dataclass(frozen=True)
class TrendMetric:
    current: int | float | None = None
    previous: int | float | None = None
    change_pct: int | float | None = None
    direction: str = "flat"

    @classmethod
    def parse(cls, value: Any) -> "TrendMetric":
        data = as_dict(value)
        current = as_number(data.get("last_24h"))
        previous = as_number(data.get("previous_24h"))
        change = as_number(data.get("change_pct"))
        direction = str(data.get("direction") or "").lower()
        if direction not in {"up", "down", "flat"}:
            direction = "up" if change and change > 0 else "down" if change and change < 0 else "flat"
        return cls(current, previous, change, direction)


@dataclass(frozen=True)
class GrowthMetric:
    current: int | float | None = None
    previous: int | float | None = None
    change_pct: int | float | None = None
    direction: str = "flat"

    @classmethod
    def parse(cls, value: Any) -> "GrowthMetric":
        data = as_dict(value)
        current = as_number(data.get("current"))
        previous = as_number(data.get("previous"))
        change = as_number(data.get("change_pct"))
        direction = str(data.get("direction") or "").lower()
        if current == 0 and previous == 0:
            direction = "flat"
        elif direction not in {"up", "down", "flat"}:
            if change is not None:
                direction = "up" if change > 0 else "down" if change < 0 else "flat"
            elif current is not None and previous is not None:
                direction = "up" if current > previous else "down" if current < previous else "flat"
            else:
                direction = "flat"
        return cls(current, previous, change, direction)


def format_growth_change(metric: GrowthMetric) -> str:
    current, previous = metric.current, metric.previous
    if current == 0 and previous == 0:
        return "→ flat"
    if current is not None and current > 0 and previous == 0 and metric.change_pct is None:
        return "↑ from 0"
    if metric.change_pct is not None and metric.direction in {"up", "down"}:
        value = abs(float(metric.change_pct))
        percent = f"{value:.1f}".rstrip("0").rstrip(".")
        return f"{'↑' if metric.direction == 'up' else '↓'} {percent}%"
    if metric.direction == "up":
        return "↑ up"
    if metric.direction == "down":
        return "↓ down"
    if current is not None and previous is not None:
        return "→ flat"
    return "Awaiting data"


@dataclass(frozen=True)
class GrowthDownloads:
    ios: GrowthMetric = field(default_factory=GrowthMetric)
    android: GrowthMetric = field(default_factory=GrowthMetric)

    @classmethod
    def parse(cls, value: Any) -> "GrowthDownloads":
        data = as_dict(value)
        return cls(GrowthMetric.parse(data.get("ios")), GrowthMetric.parse(data.get("android")))

    @property
    def combined(self) -> GrowthMetric | None:
        values = (self.ios.current, self.android.current, self.ios.previous, self.android.previous)
        if any(value is None for value in values):
            return None
        current = self.ios.current + self.android.current  # type: ignore[operator]
        previous = self.ios.previous + self.android.previous  # type: ignore[operator]
        if previous == 0:
            change = None
        else:
            change = ((current - previous) / previous) * 100
        direction = "up" if current > previous else "down" if current < previous else "flat"
        return GrowthMetric(current, previous, change, direction)


@dataclass(frozen=True)
class HistoryPoint:
    day: date
    wing_ratings: int | float | None = None
    active_users: int | float | None = None
    new_users: int | float | None = None
    ios_downloads: int | float | None = None
    android_downloads: int | float | None = None

    @classmethod
    def parse(cls, value: Any) -> "HistoryPoint | None":
        data = as_dict(value)
        try:
            day = date.fromisoformat(str(data.get("date", "")))
        except ValueError:
            return None
        return cls(day, *(as_number(data.get(key)) for key in (
            "wing_ratings", "active_users", "new_users", "ios_downloads", "android_downloads"
        )))

    @property
    def downloads(self) -> int | float | None:
        if self.ios_downloads is None or self.android_downloads is None:
            return None
        return self.ios_downloads + self.android_downloads


@dataclass(frozen=True)
class MonthlyPoint:
    month: date
    mau: int | float | None = None
    unique_devices: int | float | None = None
    wing_ratings: int | float | None = None
    new_accounts: int | float | None = None
    app_open_tracking_available: bool = False

    @classmethod
    def parse(cls, value: Any) -> "MonthlyPoint | None":
        data = as_dict(value)
        raw_month = data.get("month")
        month = None
        if (isinstance(raw_month, str) and len(raw_month) == 7
                and raw_month[4] == "-" and raw_month[:4].isdigit() and raw_month[5:].isdigit()):
            try:
                month = datetime.strptime(raw_month, "%Y-%m").date()
            except ValueError:
                pass
        if month is None:
            month = parse_date(raw_month)
        if month is None:
            return None
        available = data.get("app_open_tracking_available") is True
        return cls(month.replace(day=1), as_number(data.get("mau")) if available else None,
                   as_number(data.get("unique_devices")) if available else None,
                   as_number(data.get("wing_ratings")), as_number(data.get("new_accounts")), available)


@dataclass(frozen=True)
class MarketingScore:
    score: int = 0
    score_version: str = "v1"
    confidence: str = "limited"
    explanation: str = "App-open tracking history is limited."
    factors: dict[str, int | None] = field(default_factory=dict)


MARKETING_SCORE_WEIGHTS = {"mau": 0.40, "acquisition": 0.25, "engagement": 0.20, "account_growth": 0.15}


def _momentum_factor(values: list[int | float | None]) -> int | None:
    """v1: compare recency-weighted averages of the newer/older available halves.

    Monthly recency weights rise linearly from 1.0 to 2.0 across the 12 slots.
    Missing values are omitted. A five-activity pseudocount smooths small samples;
    relative movement is capped to [-1, 1] before mapping to a 0-100 factor.
    """
    present = [(index, float(value)) for index, value in enumerate(values) if value is not None]
    if len(present) < 2:
        return None
    split = len(present) // 2
    previous, recent = present[:split], present[split:]

    def weighted_average(items: list[tuple[int, float]]) -> Decimal:
        weighted = [(Decimal(str(value)), Decimal(1) + Decimal(index) / Decimal(max(1, len(values) - 1)))
                    for index, value in items]
        return sum(v * w for v, w in weighted) / sum(w for _, w in weighted)

    prior = weighted_average(previous)
    change = (weighted_average(recent) - prior) / (prior + Decimal(5))
    change = max(Decimal(-1), min(Decimal(1), change))
    return math.floor(Decimal(50) + Decimal(50) * change + Decimal("0.5"))


def marketing_score(months: tuple[MonthlyPoint, ...] | list[MonthlyPoint]) -> MarketingScore:
    """Calculate reproducible Growth Command Center Marketing Score v1."""
    points = list(months)[-12:]
    if len(points) < 12:
        points = [MonthlyPoint(date(2000, 1, 1))] * (12 - len(points)) + points
    tracked = sum(1 for point in points if point.app_open_tracking_available)
    confidence = "limited" if tracked < 6 else "medium" if tracked <= 8 else "high"
    factors = {
        "mau": _momentum_factor([p.mau if p.app_open_tracking_available else None for p in points]),
        "acquisition": _momentum_factor([p.unique_devices if p.app_open_tracking_available else None for p in points]),
        "engagement": _momentum_factor([p.wing_ratings for p in points]),
        "account_growth": _momentum_factor([p.new_accounts for p in points]),
    }
    active = [(factors[key], weight) for key, weight in MARKETING_SCORE_WEIGHTS.items() if factors[key] is not None]
    if active:
        weighted = [(Decimal(value), Decimal(str(weight))) for value, weight in active]
        score = math.floor(sum(value * weight for value, weight in weighted) /
                           sum(weight for _, weight in weighted) + Decimal("0.5"))
    else:
        score = 0
    named = {"mau": "MAU", "acquisition": "device acquisition", "engagement": "rating engagement", "account_growth": "new-account growth"}
    available = [(key, value) for key, value in factors.items() if value is not None]
    strongest = max(available, key=lambda item: item[1], default=None)
    weakest = min(available, key=lambda item: item[1], default=None)
    if strongest and weakest and strongest[0] != weakest[0] and strongest[1] >= 55 and weakest[1] <= 45:
        explanation = f"{named[strongest[0]]} is improving while {named[weakest[0]]} remains weak."
    elif strongest and weakest and strongest[0] != weakest[0] and weakest[1] <= 45 and strongest[1] - weakest[1] >= 15:
        explanation = f"{named[weakest[0]]} is weak; {named[strongest[0]]} is holding up."
    elif weakest and weakest[1] <= 45:
        explanation = f"Growth momentum is soft, led by weakness in {named[weakest[0]]}."
    elif available:
        explanation = "Growth factors are broadly steady." if all(40 <= v <= 60 for _, v in available) else f"{named[strongest[0]]} leads current growth momentum."
    else:
        explanation = "Not enough monthly history to score growth yet."
    if tracked < 9:
        explanation += f" App-open tracking covers {tracked} months, so score confidence is {confidence}."
    return MarketingScore(score, "v1", confidence, explanation, factors)


@dataclass(frozen=True)
class StoreMetric:
    downloads_total: int | float | None = None
    downloads_daily: int | float | None = None
    store_rating: int | float | None = None
    store_rating_count: int | float | None = None
    metric_date: date | None = None
    fetched_at: datetime | None = None

    @classmethod
    def parse(cls, value: Any) -> "StoreMetric":
        data = as_dict(value)
        return cls(*(as_number(data.get(key)) for key in (
            "downloads_total", "downloads_daily", "store_rating", "store_rating_count"
        )), metric_date=parse_date(data.get("metric_date")), fetched_at=parse_datetime(data.get("fetched_at")))


@dataclass(frozen=True)
class DeviceOpens:
    total: int | float | None = None
    ios: int | float | None = None
    android: int | float | None = None

    @classmethod
    def parse(cls, value: Any) -> "DeviceOpens":
        data = as_dict(value)
        ios, android = as_number(data.get("ios")), as_number(data.get("android"))
        # Historical snapshot totals could include web IDs. The wall is mobile-only.
        total = ios + android if ios is not None and android is not None else None
        return cls(total, ios, android)

    @property
    def breakdown(self) -> str:
        return f"iOS {fmt_number(self.ios)}  •  Android {fmt_number(self.android)}"


@dataclass(frozen=True)
class GrowthExperiment:
    id: str | None = None
    title: str | None = None
    hypothesis: str | None = None
    metric_name: str | None = None
    target_value: int | float | None = None
    current_value: int | float | None = None
    unit: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: str | None = None
    notes: str | None = None
    progress_pct: int | float | None = None
    day_number: int | float | None = None
    duration_days: int | float | None = None
    updated_at: datetime | None = None
    legacy_progress: str | None = None
    schedule_available: bool = False

    @classmethod
    def parse(cls, value: Any) -> "GrowthExperiment | None":
        data = as_dict(value)
        title = as_text(data.get("title"))
        if not data or not title:
            return None
        start, end = parse_date(data.get("start_date")), parse_date(data.get("end_date"))
        return cls(
            id=as_text(data.get("id")), title=title,
            hypothesis=as_text(data.get("hypothesis")), metric_name=as_text(data.get("metric_name")),
            target_value=as_number(data.get("target_value")), current_value=as_number(data.get("current_value")),
            unit=as_text(data.get("unit")), start_date=start, end_date=end,
            status=as_text(data.get("status")), notes=as_text(data.get("notes")),
            progress_pct=as_number(data.get("progress_pct")), day_number=as_number(data.get("day_number")),
            duration_days=as_number(data.get("duration_days")), updated_at=parse_datetime(data.get("updated_at")),
            schedule_available=start is not None and end is not None,
        )

    @classmethod
    def parse_local(cls, value: Any) -> "GrowthExperiment | None":
        data = as_dict(value)
        title = as_text(data.get("title"))
        if not title:
            return None
        day, duration = as_number(data.get("day")), as_number(data.get("duration_days"))
        return cls(title=title, hypothesis=as_text(data.get("goal")),
                   legacy_progress=as_text(data.get("progress")), day_number=day,
                   duration_days=duration, schedule_available=day is not None and duration is not None)

    @property
    def has_progress(self) -> bool:
        return self.current_value is not None and self.target_value is not None

    @property
    def calculated_progress_pct(self) -> float | None:
        if not self.has_progress:
            return None
        if self.progress_pct is not None:
            return max(0.0, min(100.0, float(self.progress_pct)))
        if not self.target_value or self.target_value <= 0:
            return None
        return max(0.0, min(100.0, float(self.current_value) / float(self.target_value) * 100))


@dataclass(frozen=True)
class GrowthMove:
    id: str | None = None
    date: date | None = None
    title: str | None = None
    why_it_matters: str | None = None
    status: str | None = None
    completed_at: datetime | None = None
    updated_at: datetime | None = None

    @classmethod
    def parse(cls, value: Any) -> "GrowthMove | None":
        data = as_dict(value)
        title = as_text(data.get("title"))
        if not data or not title:
            return None
        status = (as_text(data.get("status")) or "").lower() or None
        return cls(as_text(data.get("id")), parse_date(data.get("date")), title,
                   as_text(data.get("why_it_matters")), status,
                   parse_datetime(data.get("completed_at")), parse_datetime(data.get("updated_at")))

    @classmethod
    def parse_local(cls, value: Any) -> "GrowthMove | None":
        data = as_dict(value)
        title = as_text(data.get("action"))
        return cls(title=title, why_it_matters=as_text(data.get("why"))) if title else None


@dataclass(frozen=True)
class FounderBalance:
    tracked: bool = False
    product: int | float | None = None
    growth: int | float | None = None
    customer: int | float | None = None
    total: int | float | None = None
    window: str | None = None

    @classmethod
    def parse(cls, value: Any) -> "FounderBalance | None":
        data = as_dict(value)
        if not data or not isinstance(data.get("tracked"), bool):
            return None
        return cls(data["tracked"], as_number(data.get("product")), as_number(data.get("growth")),
                   as_number(data.get("customer")), as_number(data.get("total")), as_text(data.get("window")))

    @classmethod
    def parse_local(cls, value: Any) -> "FounderBalance | None":
        data = as_dict(value)
        if not data:
            return None
        product = as_number(data.get("product_actions"))
        growth = as_number(data.get("growth_actions"))
        customer = as_number(data.get("customer_conversations"))
        return cls(any(item is not None for item in (product, growth, customer)), product, growth, customer)


@dataclass(frozen=True)
class MarketingInsight:
    id: str | None = None
    title: str | None = None
    body: str | None = None
    source: str | None = None
    created_at: datetime | None = None
    expires_at: datetime | None = None

    @classmethod
    def parse(cls, value: Any) -> "MarketingInsight | None":
        data = as_dict(value)
        title, body = as_text(data.get("title")), as_text(data.get("body"))
        if not data or not (title or body):
            return None
        return cls(as_text(data.get("id")), title, body, as_text(data.get("source")),
                   parse_datetime(data.get("created_at")), parse_datetime(data.get("expires_at")))

    @classmethod
    def parse_local(cls, value: Any) -> "MarketingInsight | None":
        data = as_dict(value)
        title, body = as_text(data.get("title")), as_text(data.get("detail"))
        return cls(title=title, body=body) if title or body else None


@dataclass(frozen=True)
class GrowthOSState:
    current_experiment: GrowthExperiment | None = None
    todays_move: GrowthMove | None = None
    founder_balance_7d: FounderBalance | None = None
    marketing_insight: MarketingInsight | None = None

    @classmethod
    def parse(cls, value: Any) -> "GrowthOSState":
        data = as_dict(value)
        return cls(GrowthExperiment.parse(data.get("current_experiment")),
                   GrowthMove.parse(data.get("todays_move")),
                   FounderBalance.parse(data.get("founder_balance_7d")),
                   MarketingInsight.parse(data.get("marketing_insight")))

    def with_local_fallbacks(self, local: Any) -> "GrowthOSState":
        data = as_dict(local)
        return GrowthOSState(
            self.current_experiment or GrowthExperiment.parse_local(data.get("current_experiment")),
            self.todays_move or GrowthMove.parse_local(data.get("todays_growth_move")),
            self.founder_balance_7d or FounderBalance.parse_local(data.get("founder_balance")),
            self.marketing_insight or MarketingInsight.parse_local(data.get("growth_insight")),
        )


@dataclass(frozen=True)
class Snapshot:
    recent_activity: dict[str, tuple[dict[str, Any], ...]] = field(default_factory=dict)
    marketing_weekly_goal: dict[str, str] = field(default_factory=dict)
    catalog_health: dict[str, dict[str, Any]] = field(default_factory=dict)
    device_all_time: DeviceOpens = field(default_factory=DeviceOpens)
    device_last_24h: DeviceOpens = field(default_factory=DeviceOpens)
    device_previous_24h: DeviceOpens = field(default_factory=DeviceOpens)
    pending_photos: int | float | None = None
    open_work: int | float | None = None
    calendar_previous_month: tuple[str | None, int | float | None] = (None, None)
    calendar_current_month: tuple[str | None, int | float | None] = (None, None)
    total_restaurants: int | float | None = None
    total_accounts: int | float | None = None
    monthly_history: tuple[MonthlyPoint, ...] = ()
    marketing: MarketingScore = field(default_factory=MarketingScore)
    generated_at: datetime | None = None
    wing_total: int | float | None = None
    wing: TrendMetric = field(default_factory=TrendMetric)
    users: TrendMetric = field(default_factory=TrendMetric)
    feedback_open: int | float | None = None
    feedback_new: int | float | None = None
    feedback_oldest: datetime | None = None
    ios: StoreMetric = field(default_factory=StoreMetric)
    android: StoreMetric = field(default_factory=StoreMetric)
    timezone: str | None = None
    growth_wing: GrowthMetric = field(default_factory=GrowthMetric)
    growth_users: GrowthMetric = field(default_factory=GrowthMetric)
    growth_new_users: GrowthMetric = field(default_factory=GrowthMetric)
    growth_downloads: GrowthDownloads = field(default_factory=GrowthDownloads)
    history: tuple[HistoryPoint, ...] = ()
    growth_os: GrowthOSState = field(default_factory=GrowthOSState)

    @classmethod
    def from_payload(cls, payload: Any) -> "Snapshot":
        if not isinstance(payload, dict):
            raise ValueError("Snapshot payload must be a JSON object")
        pulse = as_dict(payload.get("product_pulse"))
        devices = as_dict(pulse.get("device_opens"))
        wing_data = as_dict(pulse.get("wing_ratings"))
        calendar = as_dict(pulse.get("calendar_mau"))
        totals = as_dict(pulse.get("totals"))
        feedback = as_dict(pulse.get("feedback"))
        store = as_dict(pulse.get("store"))
        growth = as_dict(payload.get("growth_7d"))
        history_values = payload.get("history_14d")
        history = []
        if isinstance(history_values, list):
            for value in history_values:
                point = HistoryPoint.parse(value)
                if point is not None:
                    history.append(point)
        monthly_values = pulse.get("monthly_history")
        monthly = []
        if isinstance(monthly_values, list):
            for value in monthly_values:
                point = MonthlyPoint.parse(value)
                if point is not None:
                    monthly.append(point)
        marketing_data = as_dict(payload.get("marketing"))
        calculated_marketing = marketing_score(monthly)
        factor_data = as_dict(marketing_data.get("factors"))
        supplied_score = as_number(marketing_data.get("score"))
        marketing = MarketingScore(
            int(supplied_score if supplied_score is not None else calculated_marketing.score),
            as_text(marketing_data.get("score_version")) or calculated_marketing.score_version,
            as_text(marketing_data.get("confidence")) or calculated_marketing.confidence,
            as_text(marketing_data.get("explanation")) or calculated_marketing.explanation,
            {key: as_number(as_dict(factor_data.get(key)).get('score') if isinstance(factor_data.get(key), dict)
                            else factor_data.get(key)) if key in factor_data else calculated_marketing.factors.get(key)
             for key in MARKETING_SCORE_WEIGHTS},
        )
        previous_month, current_month = as_dict(calendar.get("previous_month")), as_dict(calendar.get("current_month"))
        return cls(
            recent_activity={key: tuple({field: item.get(field) for field in fields}
                for item in as_dict(payload.get('recent_activity')).get(key, [])[:10] if isinstance(item, dict))
                for key, fields in (('logins', ('user_id', 'display_name', 'occurred_at')),
                                    ('ratings', ('destination_name', 'city', 'created_at')))
                if isinstance(as_dict(payload.get('recent_activity')).get(key, []), list)},
            marketing_weekly_goal={key: as_text(as_dict(payload.get('marketing_weekly_goal')).get(key)) or ''
                for key in ('week_start', 'goal', 'next_step', 'what_to_do', 'expected_result', 'timeline', 'why')},
            catalog_health={key: {'count': as_number(as_dict(as_dict(pulse.get('catalog_health')).get(key)).get('count')),
                'percentage': as_number(as_dict(as_dict(pulse.get('catalog_health')).get(key)).get('percentage'))}
                for key in ('restaurants_without_ratings', 'restaurants_without_photos')},
            device_all_time=DeviceOpens.parse(devices.get("all_time")),
            device_last_24h=DeviceOpens.parse(devices.get("last_24h")),
            device_previous_24h=DeviceOpens.parse(devices.get("previous_24h")),
            pending_photos=as_number(as_dict(pulse.get("pending_photos")).get("total")),
            open_work=as_number(as_dict(pulse.get("open_work")).get("total")),
            calendar_previous_month=(as_text(previous_month.get("month")), as_number(previous_month.get("value"))),
            calendar_current_month=(as_text(current_month.get("month")), as_number(current_month.get("value"))),
            total_restaurants=as_number(totals.get("restaurants")),
            total_accounts=as_number(totals.get("users_created", totals.get("accounts"))),
            monthly_history=tuple(monthly),
            marketing=marketing,
            generated_at=parse_datetime(payload.get("generated_at")),
            wing_total=(as_number(totals.get("wing_ratings")) if "wing_ratings" in totals
                        else as_number(wing_data.get("total"))),
            wing=TrendMetric.parse(wing_data),
            users=TrendMetric.parse(pulse.get("active_users")),
            feedback_open=as_number(feedback.get("open_total")),
            feedback_new=as_number(feedback.get("new_open_24h")),
            feedback_oldest=parse_datetime(feedback.get("oldest_open_at")),
            ios=StoreMetric.parse(store.get("ios")),
            android=StoreMetric.parse(store.get("android")),
            timezone=str(payload.get("timezone")) if isinstance(payload.get("timezone"), str) else None,
            growth_wing=GrowthMetric.parse(growth.get("wing_ratings")),
            growth_users=GrowthMetric.parse(growth.get("active_users")),
            growth_new_users=GrowthMetric.parse(growth.get("new_users")),
            growth_downloads=GrowthDownloads.parse(growth.get("downloads")),
            history=tuple(history),
            growth_os=GrowthOSState.parse(payload.get("growth_os")),
        )

    @property
    def has_download_history(self) -> bool:
        return bool(self.history) and any(point.downloads is not None for point in self.history)

    @property
    def downloads_total(self) -> int | float | None:
        return combined_value(self.ios.downloads_total, self.android.downloads_total)

    @property
    def downloads_daily(self) -> int | float | None:
        return combined_value(self.ios.downloads_daily, self.android.downloads_daily)

    @property
    def downloads_direction(self) -> str:
        # The current contract has no prior store day. A populated daily value is
        # shown as positive activity; absent data stays visually neutral.
        return "up" if self.downloads_daily and self.downloads_daily > 0 else "flat"

    def oldest_feedback_age(self, now: datetime | None = None) -> str | None:
        if not self.feedback_oldest:
            return None
        current = now or datetime.now(timezone.utc)
        seconds = max(0, int((current - self.feedback_oldest).total_seconds()))
        days = seconds // 86400
        hours = (seconds % 86400) // 3600
        return f"{days}d old" if days else f"{hours}h old"
