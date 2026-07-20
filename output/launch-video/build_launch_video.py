from __future__ import annotations

import math
import shutil
import subprocess
import wave
from pathlib import Path

import imageio.v2 as imageio
import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parent
W, H, FPS, DURATION = 544, 960, 30, 18
ORANGE = (255, 111, 0)
CREAM = (255, 247, 232)
INK = (10, 10, 10)
GREEN = (46, 125, 50)


def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    name = "arialbd.ttf" if bold else "arial.ttf"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / name), size)


def cover(img: Image.Image, size: tuple[int, int], scale: float = 1.0, y_bias: float = 0.5) -> Image.Image:
    iw, ih = img.size
    ratio = max(size[0] / iw, size[1] / ih) * scale
    resized = img.resize((int(iw * ratio), int(ih * ratio)), Image.Resampling.LANCZOS)
    left = max(0, (resized.width - size[0]) // 2)
    top = max(0, int((resized.height - size[1]) * y_bias))
    return resized.crop((left, top, left + size[0], top + size[1]))


def ease(x: float) -> float:
    x = min(1.0, max(0.0, x))
    return 1 - (1 - x) ** 3


def text_center(draw: ImageDraw.ImageDraw, text: str, y: int, fnt, fill, spacing=4, stroke=0, stroke_fill=INK):
    box = draw.multiline_textbbox((0, 0), text, font=fnt, align="center", spacing=spacing, stroke_width=stroke)
    x = (W - (box[2] - box[0])) // 2
    draw.multiline_text((x, y), text, font=fnt, fill=fill, align="center", spacing=spacing,
                        stroke_width=stroke, stroke_fill=stroke_fill)


def pill(draw, xy, label, fill, fg=CREAM, outline=None, size=21):
    draw.rounded_rectangle(xy, radius=24, fill=fill, outline=outline, width=2)
    f = font(size)
    box = draw.textbbox((0, 0), label, font=f)
    x = (xy[0] + xy[2] - (box[2] - box[0])) / 2
    y = (xy[1] + xy[3] - (box[3] - box[1])) / 2 - 2
    draw.text((x, y), label, font=f, fill=fg)


def scene_food(t: float, hero: Image.Image) -> Image.Image:
    frame = cover(hero, (W, H), 1.0 + 0.025 * t / 4.5, 0.52)
    frame = ImageEnhance.Contrast(frame).enhance(1.08)
    shade = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    sd.rectangle((0, 0, W, 500), fill=(0, 0, 0, 145))
    sd.rectangle((0, 760, W, H), fill=(0, 0, 0, 70))
    frame = Image.alpha_composite(frame.convert("RGBA"), shade)
    d = ImageDraw.Draw(frame)
    p = ease(t / 0.7)
    y = int(120 - 18 * p)
    text_center(d, "YOUR NEXT WING NIGHT", y, font(24), ORANGE)
    text_center(d, "SHOULD COUNT.", y + 48, font(56), CREAM, spacing=0)
    if t > 2.2:
        q = ease((t - 2.2) / 0.6)
        yy = int(258 + 18 * (1 - q))
        text_center(d, "Discover it. Rate it. Remember it.", yy, font(23, False), CREAM)
    return frame.convert("RGB")


def phone_shell(base: Image.Image, title: str, subtitle: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    d = ImageDraw.Draw(base)
    d.rounded_rectangle((55, 86, 485, 880), radius=48, fill=(22, 22, 22), outline=(70, 70, 70), width=3)
    d.rounded_rectangle((72, 105, 468, 860), radius=38, fill=(248, 244, 236))
    d.rounded_rectangle((205, 115, 335, 142), radius=14, fill=(20, 20, 20))
    d.text((96, 170), title, font=font(34), fill=INK)
    d.text((96, 214), subtitle, font=font(19, False), fill=(92, 85, 77))
    return base, d


def scene_crawls(t: float) -> Image.Image:
    base = Image.new("RGB", (W, H), INK)
    base, d = phone_shell(base, "Wing Crawls", "Turn dinner into an adventure.")
    cards = [
        (270, "ALLENTOWN HEAT RUN", "3 stops  •  4.2 mi", ORANGE),
        (410, "SOUTH BUFFALO CLASSICS", "4 stops  •  Local favorites", (196, 48, 43)),
        (550, "HIDDEN GEM HUNT", "3 stops  •  New discoveries", GREEN),
    ]
    for i, (y, title, sub, color) in enumerate(cards):
        delay = i * 0.18
        xoff = int(90 * (1 - ease((t - delay) / 0.55)))
        d.rounded_rectangle((95 + xoff, y, 445 + xoff, y + 110), radius=22, fill=(255, 255, 255), outline=(225, 216, 203), width=2)
        d.ellipse((112 + xoff, y + 23, 174 + xoff, y + 85), fill=color)
        d.text((132 + xoff, y + 35), str(i + 1), font=font(23), fill=CREAM)
        d.text((190 + xoff, y + 22), title, font=font(18), fill=INK)
        d.text((190 + xoff, y + 58), sub, font=font(16, False), fill=(100, 94, 86))
    pill(d, (124, 710, 416, 774), "START YOUR FIRST CRAWL", ORANGE, size=19)
    return base


def scene_rate(t: float) -> Image.Image:
    base = Image.new("RGB", (W, H), (244, 238, 227))
    d = ImageDraw.Draw(base)
    d.text((42, 88), "Build your Wingdex.", font=font(42), fill=INK)
    d.text((44, 145), "Every plate earns its place.", font=font(21, False), fill=(89, 82, 72))
    labels = [("CRISPINESS", 92), ("SAUCE", 86), ("MEAT", 89), ("OVERALL", 94)]
    for i, (label, score) in enumerate(labels):
        y = 245 + i * 112
        d.text((48, y), label, font=font(19), fill=INK)
        d.rounded_rectangle((48, y + 42, 492, y + 62), radius=10, fill=(217, 207, 193))
        progress = ease((t - i * 0.14) / 0.75)
        end = 48 + int(444 * score / 100 * progress)
        d.rounded_rectangle((48, y + 42, max(68, end), y + 62), radius=10, fill=ORANGE)
        d.text((430, y - 3), str(int(score * progress)), font=font(24), fill=ORANGE)
    d.rounded_rectangle((75, 730, 465, 850), radius=28, fill=INK)
    d.text((112, 754), "BUFFAGO SCORE", font=font(20), fill=ORANGE)
    d.text((112, 786), "90.3", font=font(42), fill=CREAM)
    d.text((260, 800), "+120 XP", font=font(22), fill=(92, 205, 102))
    return base


def scene_game(t: float, token: Image.Image) -> Image.Image:
    base = Image.new("RGB", (W, H), (12, 12, 12))
    d = ImageDraw.Draw(base)
    text_center(d, "MORE GAME.", 90, font(54), CREAM)
    text_center(d, "LESS REVIEW SITE.", 152, font(44), ORANGE)
    token = token.convert("RGBA")
    token.thumbnail((150, 150), Image.Resampling.LANCZOS)
    bob = int(math.sin(t * 5) * 8)
    base.paste(token, ((W - token.width) // 2, 258 + bob), token)
    stats = [("7", "DAY STREAK"), ("1,840", "XP EARNED"), ("12", "BADGES")]
    for i, (num, label) in enumerate(stats):
        x = 32 + i * 169
        d.rounded_rectangle((x, 475, x + 145, 610), radius=22, fill=(31, 31, 31), outline=(61, 61, 61), width=2)
        b = d.textbbox((0, 0), num, font=font(31))
        d.text((x + 72 - (b[2] - b[0]) / 2, 498), num, font=font(31), fill=ORANGE)
        b = d.textbbox((0, 0), label, font=font(13))
        d.text((x + 72 - (b[2] - b[0]) / 2, 553), label, font=font(13), fill=CREAM)
    text_center(d, "Find hidden gems.\nChallenge your crew.", 690, font(30), CREAM, spacing=10)
    return base


def scene_end(t: float, logo: Image.Image) -> Image.Image:
    base = Image.new("RGB", (W, H), (250, 244, 230))
    d = ImageDraw.Draw(base)
    for r in range(480, 50, -28):
        alpha = (480 - r) / 430
        c = tuple(int(CREAM[i] * (1 - alpha) + ORANGE[i] * alpha * 0.18) for i in range(3))
        d.ellipse((W // 2 - r, 300 - r, W // 2 + r, 300 + r), fill=c)
    logo = logo.convert("RGBA")
    logo.thumbnail((390, 390), Image.Resampling.LANCZOS)
    scale = 0.88 + 0.12 * ease(t / 0.5)
    logo = logo.resize((int(logo.width * scale), int(logo.height * scale)), Image.Resampling.LANCZOS)
    base.paste(logo, ((W - logo.width) // 2, 150), logo)
    d = ImageDraw.Draw(base)
    text_center(d, "THE WING JOURNEY STARTS HERE.", 530, font(25), INK)
    pill(d, (78, 630, 462, 708), "DOWNLOAD BUFFAGO", ORANGE, size=24)
    text_center(d, "Start your first crawl.", 748, font(23, False), (82, 72, 63))
    text_center(d, "@BUFFAGOAPP", 850, font(18), ORANGE)
    return base


def make_audio(path: Path):
    rate = 44100
    n = rate * DURATION
    audio = np.zeros(n, dtype=np.float64)
    for beat in np.arange(0, DURATION, 0.5):
        start = int(beat * rate)
        length = int(0.16 * rate)
        tt = np.arange(length) / rate
        kick = np.sin(2 * np.pi * (92 - 45 * tt) * tt) * np.exp(-26 * tt)
        audio[start:start + length] += 0.42 * kick[: min(length, n - start)]
    for beat in np.arange(0.25, DURATION, 0.5):
        start = int(beat * rate)
        length = min(int(0.07 * rate), n - start)
        rng = np.random.default_rng(int(beat * 100))
        audio[start:start + length] += 0.07 * rng.normal(size=length) * np.exp(-55 * np.arange(length) / rate)
    melody = [(0, 220), (4.5, 247), (8, 294), (12, 330), (15, 392)]
    for start_s, freq in melody:
        start, length = int(start_s * rate), min(int(2.5 * rate), n - int(start_s * rate))
        tt = np.arange(length) / rate
        audio[start:start + length] += 0.055 * np.sin(2 * np.pi * freq * tt) * np.exp(-0.9 * tt)
    audio = np.clip(audio, -0.95, 0.95)
    pcm = (audio * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(rate); wav.writeframes(pcm.tobytes())


def main():
    hero = Image.open(ROOT / "assets" / "wing-night-hero.png")
    logo = Image.open(ROOT / "assets" / "buffago-logo.png")
    token = Image.open(ROOT / "assets" / "buffago-token.png")
    silent = ROOT / "buffago-launch-silent.mp4"
    audio = ROOT / "buffago-launch-audio.wav"
    final = ROOT / "buffago-launch-vertical.mp4"
    with imageio.get_writer(silent, fps=FPS, codec="libx264", quality=8, pixelformat="yuv420p") as writer:
        for i in range(DURATION * FPS):
            t = i / FPS
            if t < 4.5: frame = scene_food(t, hero)
            elif t < 8: frame = scene_crawls(t - 4.5)
            elif t < 12: frame = scene_rate(t - 8)
            elif t < 15: frame = scene_game(t - 12, token)
            else: frame = scene_end(t - 15, logo)
            writer.append_data(np.asarray(frame))
    make_audio(audio)
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run([ffmpeg, "-y", "-i", str(silent), "-i", str(audio), "-c:v", "copy", "-c:a", "aac",
                    "-b:a", "160k", "-shortest", "-movflags", "+faststart", str(final)], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    silent.unlink(missing_ok=True)
    print(final)


if __name__ == "__main__":
    main()
