"""Canvas primitives used by the dashboard."""

from __future__ import annotations

import tkinter as tk
from typing import Any

from ui import theme


def sparkline_segments(values: list[int | float | None], x1: float, y1: float,
                       x2: float, y2: float) -> list[list[tuple[float, float]]]:
    """Return line segments in logical coordinates, breaking across missing data."""
    numeric = [float(value) for value in values if value is not None]
    if not numeric:
        return []
    low, high = min(numeric), max(numeric)
    span = high - low
    count = max(1, len(values) - 1)
    segments: list[list[tuple[float, float]]] = []
    current: list[tuple[float, float]] = []
    for index, value in enumerate(values):
        if value is None:
            if current:
                segments.append(current)
                current = []
            continue
        x = x1 + (x2 - x1) * index / count
        y = (y1 + y2) / 2 if span == 0 else y2 - (float(value) - low) / span * (y2 - y1)
        current.append((x, y))
    if current:
        segments.append(current)
    return segments


class Painter:
    def __init__(self, canvas: tk.Canvas, width: int, height: int):
        self.canvas = canvas
        self.sx = width / 1600
        self.sy = height / 900
        self.scale = min(self.sx, self.sy)

    def xy(self, value: float, axis: str = "x") -> float:
        return value * (self.sx if axis == "x" else self.sy)

    def font(self, size: int, weight: str = "normal") -> tuple[str, int, str]:
        # Tk treats positive sizes as points, which makes layout depend on host
        # DPI. Negative sizes are pixels and keep kiosk geometry predictable.
        return theme.FONT, -max(8, int(size * self.scale)), weight

    def box(self, x1: int, y1: int, x2: int, y2: int, fill: str = theme.PANEL,
            outline: str = theme.BORDER, width: int = 1) -> None:
        self.canvas.create_rectangle(self.xy(x1), self.xy(y1, "y"), self.xy(x2), self.xy(y2, "y"),
                                     fill=fill, outline=outline, width=max(1, int(width * self.scale)))

    def text(self, x: int, y: int, value: Any, size: int = 18, color: str = theme.TEXT,
             weight: str = "normal", anchor: str = "nw", width: int | None = None) -> None:
        kwargs: dict[str, Any] = {}
        if width:
            kwargs["width"] = self.xy(width)
        self.canvas.create_text(self.xy(x), self.xy(y, "y"), text=str(value), fill=color,
                                font=self.font(size, weight), anchor=anchor, **kwargs)

    def label(self, x: int, y: int, value: str) -> None:
        self.text(x, y, value.upper(), 12, theme.MUTED, "bold")

    def metric(self, x: int, y: int, title: str, value: str, detail: str = "",
               direction: str | None = None) -> None:
        self.label(x, y, title)
        self.text(x, y + 25, value, 36, theme.TEXT, "bold")
        if direction:
            arrow = {"up": "↑", "down": "↓", "flat": "→"}.get(direction, "→")
            color = {"up": theme.UP, "down": theme.DOWN}.get(direction, theme.FLAT)
            self.text(x + 105, y + 31, arrow, 24, color, "bold")
        if detail:
            self.text(x, y + 72, detail, 13, theme.MUTED)
