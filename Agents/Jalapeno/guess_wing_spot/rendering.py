"""Local-only Pillow/FFmpeg composition. No network or persistence adapters."""
from __future__ import annotations

import io
import json
import math
import os
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

SIZE = (1080, 1920)
FRAME_TIMES = {"hook": 1.0, "photo-1": 3.5, "photo-2": 6.5, "photo-3": 9.5, "composite": 13.0}


def font(size, path=None):
    candidates = [path, os.environ.get("GUESS_WING_FONT"), "C:/Windows/Fonts/arialbd.ttf",
                  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return ImageFont.truetype(str(candidate), size=size)
    raise ValueError("A scalable bold font is required; set GUESS_WING_FONT")


def text(draw, value, *, top, size=76, width=850, fill="white", center=True):
    face = font(size)
    words, lines, current = value.split(), [], ""
    for word in words:
        proposed = (current + " " + word).strip()
        if draw.textlength(proposed, font=face) > width:
            if current:
                lines.append(current)
            current = word
        else:
            current = proposed
    if current:
        lines.append(current)
    for line in lines:
        if draw.textlength(line, font=face) > width:
            raise ValueError("Text is too wide for safe margins")
        x = (SIZE[0] - draw.textlength(line, font=face)) / 2 if center else 110
        draw.text((x, top), line, font=face, fill=fill, stroke_width=1)
        top += round(size * 1.24)
    return top


def badge(draw, number, x=108, y=275, radius=57):
    draw.ellipse((x, y, x + 2 * radius, y + 2 * radius), fill="#F45D1F", outline="white", width=4)
    face = font(round(radius * 1.35))
    draw.text((x + radius, y + radius - 3), str(number), anchor="mm", font=face, fill="white")


def decode_photo(data):
    with Image.open(io.BytesIO(data)) as opened:
        if opened.format != "JPEG" or opened.width * opened.height > 40_000_000:
            raise ValueError("Processed photo must be a bounded JPEG")
        opened.load()
        return ImageOps.exif_transpose(opened).convert("RGB")


def contain(photo, box, *, max_enlargement=1.35):
    scale = min(box[0] / photo.width, box[1] / photo.height, max_enlargement)
    return photo.resize((max(1, round(photo.width * scale)), max(1, round(photo.height * scale))), Image.Resampling.LANCZOS)


def logo_layer(canvas, logo_path, *, y, width=300):
    with Image.open(logo_path) as opened:
        logo = opened.convert("RGBA")
        if logo.getbbox():
            logo = logo.crop(logo.getbbox())
        logo = logo.resize((width, round(logo.height * width / logo.width)), Image.Resampling.LANCZOS)
    canvas.paste(logo, ((SIZE[0] - logo.width) // 2, y), logo)


def photo_base(photo):
    background = ImageOps.fit(photo, SIZE).filter(ImageFilter.GaussianBlur(46))
    background = Image.blend(background, Image.new("RGB", SIZE, "#111111"), 0.45)
    subject = contain(photo, (970, 1180))
    background.paste(subject, ((1080 - subject.width) // 2, 850 - subject.height // 2))
    return background


def hero_overlay(number, credit):
    layer = Image.new("RGBA", SIZE)
    draw = ImageDraw.Draw(layer)
    badge(draw, number)
    text(draw, "NAME THIS WING SPOT", top=210, size=41, fill="#FFB879")
    draw.rounded_rectangle((84, 1485, 996, 1685), radius=24, fill=(12, 12, 12, 232))
    text(draw, f"Photo {number} credit: {credit}", top=1515, size=37, width=850)
    return layer


def hook_card(hook, logo_path):
    canvas = Image.new("RGB", SIZE, "#151719")
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((100, 280, 980, 292), fill="#F45D1F")
    text(draw, "GUESS THE WING SPOT", top=335, size=43, fill="#FFB879")
    end = text(draw, hook, top=490, size=87, width=850)
    if end > 1320:
        raise ValueError("Geographic hook is too long for the safe frame")
    text(draw, "3 photos. 3 restaurants.", top=1360, size=43)
    logo_layer(canvas, logo_path, y=1500, width=330)
    return canvas


def composite_card(photos, credits, logo_path):
    canvas = Image.new("RGB", SIZE, "#151719")
    draw = ImageDraw.Draw(canvas)
    text(draw, "Guess the spots:", top=220, size=76)
    text(draw, "1, 2, 3", top=320, size=88, fill="#FFB879")
    for i, (photo, credit) in enumerate(zip(photos, credits), 1):
        left, top = 90 + (i - 1) * 310, 550
        box = ImageOps.fit(photo, (280, 650)).filter(ImageFilter.GaussianBlur(24))
        box = Image.blend(box, Image.new("RGB", box.size, "#111111"), 0.5)
        # Full subject, not a narrow crop, provides the useful second look.
        subject = contain(photo, (280, 650))
        box.paste(subject, ((280 - subject.width) // 2, (650 - subject.height) // 2))
        canvas.paste(box, (left, top))
        badge(draw, i, x=left + 96, y=top - 110, radius=44)
    text(draw, "Share your wing pics on BuffaGo", top=1260, size=47, width=900)
    text(draw, "Download on iOS & Android", top=1340, size=46, width=900, fill="#FFB879")
    logo_layer(canvas, logo_path, y=1460, width=270)
    return canvas


def run(command):
    result = subprocess.run(command, capture_output=True, text=True, timeout=300)
    if result.returncode:
        # All inputs here are local paths. Never report network responses.
        raise RuntimeError("Local media command failed: " + result.stderr[-1800:])
    return result.stdout


def probe(path, ffprobe):
    return json.loads(run([ffprobe, "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)]))


def validate_video(path, ffprobe):
    payload = probe(path, ffprobe)
    videos = [s for s in payload["streams"] if s["codec_type"] == "video"]
    if len(videos) != 1 or any(s["codec_type"] == "audio" for s in payload["streams"]):
        raise ValueError("Output must contain one video stream and no audio")
    v = videos[0]
    if (v["codec_name"], v["width"], v["height"], v["r_frame_rate"], v["pix_fmt"]) != ("h264", 1080, 1920, "30/1", "yuv420p"):
        raise ValueError("Output media contract failed")
    if not math.isclose(float(payload["format"]["duration"]), 15.0, abs_tol=0.001) or int(v.get("nb_frames", 0)) != 450:
        raise ValueError("Output must be exactly 450 frames / 15 seconds")
    return {"codec": v["codec_name"], "width": v["width"], "height": v["height"], "fps": v["r_frame_rate"],
            "duration_seconds": float(payload["format"]["duration"]), "frames": int(v["nb_frames"]), "audio_streams": 0}


def render(photo_data, selected, hook, output: Path, logo_path: Path, *, ffmpeg="ffmpeg", ffprobe="ffprobe"):
    for executable in (ffmpeg, ffprobe):
        if not shutil.which(executable) and not Path(executable).is_file():
            raise ValueError("FFmpeg and ffprobe are required; supply explicit executable paths")
    photos = [decode_photo(data) for data in photo_data]
    work = output / "private-work"
    work.mkdir(parents=True, exist_ok=False)
    public = output / "public"
    public.mkdir()
    frames = output / "review-frames"
    frames.mkdir()
    warnings, dimensions = [], []
    hook_card(hook, logo_path).save(work / "card-0.png")
    composite_card(photos, [p.photo.credit for p in selected], logo_path).save(work / "card-4.png")
    for i, (photo, source) in enumerate(zip(photos, selected), 1):
        dimensions.append({"number": i, "width": photo.width, "height": photo.height})
        if min(photo.size) < 720:
            warnings.append(f"Photo {i} is low resolution; foreground enlargement capped at 1.35x plus 3% motion")
        photo_base(photo).save(work / f"base-{i}.png")
        hero_overlay(i, source.photo.credit).save(work / f"overlay-{i}.png")
        # These exact processed sources are private visual-review material.
        (work / f"source-{i}.jpg").write_bytes(photo_data[i - 1])
    segments = []
    for i, count in enumerate((60, 90, 90, 90, 120)):
        segment = work / f"segment-{i}.mp4"
        cmd = [ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y"]
        if i in (0, 4):
            cmd += ["-loop", "1", "-framerate", "30", "-i", str(work / f"card-{i}.png")]
        else:
            cmd += ["-i", str(work / f"base-{i}.png"), "-i", str(work / f"overlay-{i}.png"),
                    "-filter_complex", "[0:v]zoompan=z='1+0.03*on/89':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=90:s=1080x1920:fps=30[m];[m][1:v]overlay=0:0:format=auto[v]",
                    "-map", "[v]"]
        cmd += ["-frames:v", str(count), "-an", "-map_metadata", "-1", "-c:v", "libx264", "-preset", "fast",
                "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30", "-threads", "2", str(segment)]
        run(cmd)
        segments.append(segment)
    listing = work / "segments.txt"
    listing.write_text("\n".join(f"file '{p.name}'" for p in segments), encoding="utf-8")
    video = public / "guess-the-wing-spot.mp4"
    run([ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "1", "-i", str(listing),
         "-map", "0:v:0", "-an", "-map_metadata", "-1", "-c:v", "copy", "-movflags", "+faststart", str(video)])
    verification = validate_video(video, ffprobe)
    for label, second in FRAME_TIMES.items():
        run([ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-ss", str(second), "-i", str(video),
             "-frames:v", "1", str(frames / (label + ".png"))])
    return {"video": str(video.resolve()), "frames": str(frames.resolve()), "private_sources": str(work.resolve()),
            "verification": verification, "dimensions": dimensions}, warnings
