from __future__ import annotations

import math
import subprocess
import wave
from pathlib import Path

import imageio.v2 as imageio
import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


HERE = Path(__file__).resolve().parent
PICS = HERE.parent / "pics"
W, H, FPS = 544, 960, 30
ORANGE, CREAM, INK = (255, 111, 0), (255, 247, 232), (7, 7, 8)


def font(size: int, bold: bool = True):
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / ("arialbd.ttf" if bold else "arial.ttf")), size)


def ease(x: float) -> float:
    x = min(1.0, max(0.0, x))
    return 1 - (1 - x) ** 3


def center_text(draw, text, y, fnt, fill, stroke=0):
    box = draw.multiline_textbbox((0, 0), text, font=fnt, align="center", spacing=6, stroke_width=stroke)
    draw.multiline_text(((W - box[2] + box[0]) / 2, y), text, font=fnt, fill=fill,
                        align="center", spacing=6, stroke_width=stroke, stroke_fill=INK)


def screenshot_frame(img: Image.Image, t: float, title: str, subtitle: str = "", accent=ORANGE) -> Image.Image:
    img = img.convert("RGB")
    # A soft full-frame echo fills the wider 9:16 canvas while the real screen remains uncropped.
    bg_scale = max(W / img.width, H / img.height)
    bg = img.resize((int(img.width * bg_scale), int(img.height * bg_scale)), Image.Resampling.LANCZOS)
    bg = bg.crop(((bg.width - W) // 2, 0, (bg.width - W) // 2 + W, H)).filter(ImageFilter.GaussianBlur(22))
    bg = ImageEnhance.Brightness(bg).enhance(0.28).convert("RGBA")
    screen_h = H
    screen_w = int(img.width * screen_h / img.height)
    zoom = 1 + 0.012 * min(t, 4)
    screen = img.resize((int(screen_w * zoom), int(screen_h * zoom)), Image.Resampling.LANCZOS)
    x, y = (W - screen.width) // 2, (H - screen.height) // 2
    bg.paste(screen, (x, y))
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    d.rounded_rectangle((24, 62, W - 24, 202), radius=28, fill=(5, 5, 6, 224), outline=accent, width=3)
    center_text(d, title, 87, font(29), CREAM)
    if subtitle:
        center_text(d, subtitle, 140, font(20, False), (220, 215, 207))
    return Image.alpha_composite(bg, overlay).convert("RGB")


def end_card(t: float, logo: Image.Image, compact=False) -> Image.Image:
    frame = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(frame)
    for r in range(350, 40, -25):
        k = (350 - r) / 310
        color = (int(25 + 30 * k), int(14 + 8 * k), int(8 + 2 * k))
        d.ellipse((W // 2 - r, 330 - r, W // 2 + r, 330 + r), fill=color)
    logo = logo.convert("RGBA")
    logo.thumbnail((360, 360), Image.Resampling.LANCZOS)
    s = 0.9 + 0.1 * ease(t / 0.45)
    logo = logo.resize((int(logo.width * s), int(logo.height * s)), Image.Resampling.LANCZOS)
    frame.paste(logo, ((W - logo.width) // 2, 150), logo)
    d = ImageDraw.Draw(frame)
    center_text(d, "MAKE WING NIGHT COUNT.", 525, font(33), CREAM)
    d.rounded_rectangle((68, 630, W - 68, 714), radius=34, fill=ORANGE)
    center_text(d, "DOWNLOAD BUFFAGO", 651, font(25), CREAM)
    center_text(d, "Start your first crawl.", 755, font(23, False), (205, 199, 191))
    center_text(d, "@BUFFAGOAPP", 850, font(18), ORANGE)
    return frame


def crossfade(a: Image.Image, b: Image.Image, p: float) -> Image.Image:
    return Image.blend(a, b, ease(p))


def make_audio(path: Path, duration: float, bpm=128):
    rate, n = 44100, int(44100 * duration)
    audio = np.zeros(n, dtype=np.float64)
    step = 60 / bpm
    for beat in np.arange(0, duration, step):
        start, length = int(beat * rate), min(int(0.15 * rate), n - int(beat * rate))
        tt = np.arange(length) / rate
        audio[start:start + length] += 0.46 * np.sin(2 * np.pi * (95 - 50 * tt) * tt) * np.exp(-27 * tt)
    for beat in np.arange(step / 2, duration, step):
        start, length = int(beat * rate), min(int(0.06 * rate), n - int(beat * rate))
        rng = np.random.default_rng(int(beat * 1000))
        audio[start:start + length] += 0.065 * rng.normal(size=length) * np.exp(-60 * np.arange(length) / rate)
    notes = [196, 220, 247, 294]
    for bar in np.arange(0, duration, step * 4):
        for j, note in enumerate(notes):
            start = int((bar + j * step) * rate)
            if start >= n: break
            length = min(int(step * 0.75 * rate), n - start)
            tt = np.arange(length) / rate
            audio[start:start + length] += 0.035 * np.sin(2 * np.pi * note * tt) * np.exp(-4 * tt)
    pcm = (np.clip(audio, -0.95, 0.95) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(rate); wav.writeframes(pcm.tobytes())


def render(name: str, duration: int, scenes: list[tuple[float, str | None, str, str]], logo: Image.Image):
    loaded = {p.name: Image.open(p) for p in PICS.glob("*.jpg")}
    silent, audio, final = HERE / f"{name}-silent.mp4", HERE / f"{name}.wav", HERE / f"{name}.mp4"
    with imageio.get_writer(silent, fps=FPS, codec="libx264", quality=8, pixelformat="yuv420p") as writer:
        for i in range(duration * FPS):
            now = i / FPS
            idx = max(j for j, scene in enumerate(scenes) if scene[0] <= now)
            start, pic, title, subtitle = scenes[idx]
            local = now - start
            current = end_card(local, logo) if pic is None else screenshot_frame(loaded[pic], local, title, subtitle)
            if idx + 1 < len(scenes):
                next_start, next_pic, next_title, next_subtitle = scenes[idx + 1]
                if now > next_start - 0.28:
                    nxt = end_card(0, logo) if next_pic is None else screenshot_frame(loaded[next_pic], 0, next_title, next_subtitle)
                    current = crossfade(current, nxt, (now - (next_start - 0.28)) / 0.28)
            writer.append_data(np.asarray(current))
    make_audio(audio, duration)
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run([ffmpeg, "-y", "-i", str(silent), "-i", str(audio), "-c:v", "copy", "-c:a", "aac",
                    "-b:a", "160k", "-shortest", "-movflags", "+faststart", str(final)], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    silent.unlink(missing_ok=True); audio.unlink(missing_ok=True)
    print(final)


def main():
    logo = Image.open(HERE / "assets" / "buffago-logo.png")
    six = [
        (0.0, "2000.jpg", "WING NIGHT. GAMIFIED.", "Crawl. Rate. Compete."),
        (1.35, "1990.jpg", "FIND YOUR NEXT SPOT", "Build your Wingdex."),
        (2.70, "1994.jpg", "TRACK THE JOURNEY", "Stats. Rankings. Bragging rights."),
        (4.05, None, "", ""),
    ]
    thirty = [
        (0.0, "1986.jpg", "WING NIGHT JUST LEVELED UP", "Meet Buffago."),
        (3.2, "1988.jpg", "YOUR WING HQ", "XP, nearby spots, and your next move."),
        (6.6, "2000.jpg", "TURN DINNER INTO A CRAWL", "Complete stops. Unlock the route."),
        (10.2, "1990.jpg", "BUILD YOUR WINGDEX", "Find local spots and rank every plate."),
        (13.8, "1992.jpg", "COMPARE WITH YOUR CREW", "Friendly competition tastes better."),
        (17.2, "1994.jpg", "OWN YOUR WING JOURNEY", "Crawls, ratings, and personal bests."),
        (20.8, "1998.jpg", "THE STATS GET SERIOUS", "Even when the wings don't."),
        (24.2, "1996.jpg", "EVERY CRAWL BECOMES A MEMORY", "Keep exploring. Keep climbing."),
        (27.0, None, "", ""),
    ]
    render("buffago-launch-real-screens-6s", 6, six, logo)
    render("buffago-launch-real-screens-30s", 30, thirty, logo)


if __name__ == "__main__":
    main()
