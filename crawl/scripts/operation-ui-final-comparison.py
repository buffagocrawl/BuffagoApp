"""Reproducible approved-mockup crops and unmasked visual comparisons.

Only external tournament artwork, phone bezels, and status chrome are cropped.
Reference proportions are preserved. Different content and all UI differences
remain visible; absolute pixel error is diagnostic, never a fidelity score.
"""
import hashlib
import argparse
import json
import textwrap
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageStat

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/operation-ui-overhaul/final-audit'
REF = ROOT / 'design-references'
parser = argparse.ArgumentParser()
parser.add_argument('--only', choices=['crawls'])
parser.add_argument('--output', type=Path)
args = parser.parse_args()
if args.output:
    OUT = args.output.resolve()
OUT.mkdir(parents=True, exist_ok=True)
triptych = '2e60084a-21d6-4d45-bc98-bd41a6a481e4.png'
cases = {
    'home': ('8afd3fb8-1eda-4186-9dd0-054c410ac873.png', (357, 910, 670, 1488), [
        'Compact progression corrected; level/title and reward handlers retained.',
        'Featured restaurant remains taller: address, friend, directions, rate and swap actions retained.',
        'Greeting and reference utility-header composition remain different; achievement icons restored.',
        'Mission/facts now fit at 390x844; smaller and large-text screens intentionally scroll.']),
    'crawls': (triptych, (37, 57, 488, 1010), [
        'Major: recommended card lacks map-led route preview and route photo composition.',
        'Existing map remains an explicit action; do not auto-initialize previously crashing native SDK.',
        'Filters use chips rather than the reference segmented control.',
        'Resume actions visible and browser center hit-test passes; status backgrounds differ.']),
    'wingdex': ('d2f0653a-f830-452b-8836-8fe848e2a09f.png', (366, 1150, 658, 1507), [
        'Wide approved-image backdrop replaces small left thumbnails; readable scrim and fallback retained.',
        'Reference winner contains only two cards in an unusually short viewport.',
        'Rank/favorite ornaments, score-badge placement and dense filter controls differ.',
        'No fake favorite state or unsupported rank behavior added.']),
    'social': (triptych, (547, 57, 991, 1010), [
        'Photo-led full-width media panels corrected; real score, identity and navigation retained.',
        'No fake likes/comments/bookmarks added; reference engagement row intentionally absent.',
        'Restaurant imagery remains explicitly attributed, never represented as the rating author photo.',
        'Score remains in header instead of image corner; header/filter typography differs.']),
    'journey': (triptych, (1052, 57, 1503, 1010), [
        'Personal stats now precede Creator and challenges; progression is compact.',
        'Four real personal metrics restored; shield, period/location controls and photo-history strip still differ.',
        'Existing rating history, detailed statistics and owner-only photo attachment retained.',
        'Creator explanation and retained actions still make viewport taller than reference.']),
}
manifest = {'normalization': 'Explicit app-interior crops; proportional resize to 390px width; top-aligned canvas with bottom padding only. No UI/data/image masks. Chrome/tournament art excluded. Pixel metrics use the overlapping real image region only.', 'cases': []}
if args.only:
    cases = {args.only: cases[args.only]}
    cases['crawls'] = (triptych, (37, 57, 488, 1010), [
        'Map-led recommendation restored using real stop positions; schematic is explicitly labelled, not road geometry.',
        'Active/completed crawls excluded from recommendation; nearest eligible route and filters preserved.',
        'Segmented discovery and compact header restored; no unsupported Saved or invented travel times.',
        'Resume hit-testing retained; approved photo composition differs because no route photo source is supplied.'])
for screen, (filename, box, notes) in cases.items():
    source = REF / filename
    current_path = OUT / 'screenshots' / f'{screen}-390-fixture.png'
    original = Image.open(source).convert('RGB')
    crop = original.crop(box)
    crop.save(OUT / f'{screen}-reference-crop.png')
    current = Image.open(current_path).convert('RGB')
    ref = crop.resize((current.width, round(crop.height * current.width / crop.width)), Image.Resampling.LANCZOS)
    w, h = current.width, max(ref.height, current.height)
    def canvas(im):
        result = Image.new('RGB', (w, h), '#292929')
        result.paste(im, (0, 0))
        return result
    aligned_ref, aligned_current = canvas(ref), canvas(current)
    aligned_ref.save(OUT / f'{screen}-reference-aligned.png')
    aligned_current.save(OUT / f'{screen}-current-aligned.png')
    transparent = aligned_current.convert('RGBA'); transparent.putalpha(128)
    transparent.save(OUT / f'{screen}-current-transparent.png')
    Image.blend(aligned_ref, aligned_current, 0.5).save(OUT / f'{screen}-overlay.png')
    diff = ImageChops.difference(aligned_ref, aligned_current)
    diff.save(OUT / f'{screen}-difference.png')
    diagnostic = ImageStat.Stat(diff.crop((0, 0, w, min(ref.height, current.height)))).mean
    panel = Image.new('RGB', (w * 3 + 390, h + 50), '#202226')
    draw = ImageDraw.Draw(panel)
    for i, (label, im) in enumerate([('APPROVED REFERENCE', aligned_ref), ('CURRENT FIXTURE', aligned_current), ('ABSOLUTE DIFFERENCE', diff)]):
        panel.paste(im, (i*w, 50))
        draw.text((i*w+8, 15), label, fill='white')
    x, y = w * 3 + 16, 16
    draw.text((x, y), screen.upper() + ' / MISMATCH REVIEW', fill='#ff8310')
    y += 40
    for idx, note in enumerate(notes, 1):
        for line in textwrap.wrap(f'{idx}. {note}', width=46):
            draw.text((x, y), line, fill='white'); y += 20
        y += 18
    # Frames mark the review scopes named in the notes. Raw comparisons retain
    # unaltered pixels; the viewport-size observation uses the entire frame.
    scopes = {
        'home': [(60,145),(220,575),(0,60),(575,710)],
        'crawls': [(175,455),(0,60),(55,175),(330,455)],
        'wingdex': [(295,770),(0,current.height),(0,470),(380,475)],
        'social': [(290,575),(525,575),(525,575),(0,200)],
        'journey': [(170,535),(170,535),(260,335),(535,770)],
    }
    for idx, (top, bottom) in enumerate(scopes[screen], 1):
        cy = 50 + top
        draw.rectangle((w+3, cy, 2*w-4, min(50+bottom, h+46)), outline='#ff8310', width=2)
        draw.text((w+8, cy+3), str(idx), fill='#ff8310')
    panel.save(OUT / f'{screen}-annotated-comparison.png')
    annotated_diff = Image.new('RGB', (w + 390, h + 50), '#202226')
    annotated_diff.paste(diff, (0, 50))
    annotated_diff.paste(panel.crop((w*3, 0, w*3+390, h+50)), (w, 0))
    ad = ImageDraw.Draw(annotated_diff)
    ad.text((8,15), 'UNMASKED DIFFERENCE / REVIEW NOTES', fill='white')
    for idx, (top, bottom) in enumerate(scopes[screen], 1):
        ad.rectangle((3,50+top,w-4,min(50+bottom,h+46)), outline='#ff8310', width=2)
        ad.text((8,53+top),str(idx),fill='#ff8310')
    annotated_diff.save(OUT / f'{screen}-annotated-difference.png')
    pair = Image.new('RGB', (w*2, h+35), '#202226')
    pair.paste(aligned_ref, (0,35)); pair.paste(aligned_current, (w,35))
    pd = ImageDraw.Draw(pair); pd.text((8,10),'APPROVED REFERENCE',fill='white'); pd.text((w+8,10),'CURRENT FIXTURE',fill='white')
    pair.save(OUT / f'{screen}-side-by-side.png')
    manifest['cases'].append({'screen': screen, 'reference_source': str(source.relative_to(ROOT)), 'reference_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'source_dimensions': original.size, 'crop_xyxy': box, 'crop_dimensions': crop.size, 'proportional_reference_dimensions': ref.size, 'current': str(current_path.relative_to(ROOT)), 'current_sha256': hashlib.sha256(current_path.read_bytes()).hexdigest(), 'current_dimensions': current.size, 'mean_absolute_rgb_error_0_to_255': diagnostic, 'notes': notes, 'fidelity_score': None})
(OUT / 'comparison-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
for screen in cases:
    matrix = Image.new('RGB', (230*5, 610), '#202226')
    md = ImageDraw.Draw(matrix)
    for column, suffix in enumerate(['320-fixture', '360-fixture', '390-fixture', '430-fixture', '320-font130-fixture']):
        capture = Image.open(OUT / 'screenshots' / f'{screen}-{suffix}.png').convert('RGB')
        capture.thumbnail((226, 575), Image.Resampling.LANCZOS)
        matrix.paste(capture, (column*230, 30))
        md.text((column*230+4, 8), suffix, fill='white')
    matrix.save(OUT / f'{screen}-viewport-contact-sheet.png')
print(f'{len(cases)} unmasked comparison sets generated; no mathematical fidelity claim.')
