"""Compare only the local synthetic pinch fixture against its prepared bytes.
Run from repository root after copying the known fixture JPEG/metadata from
the emulator; never fetch a photo, storage object, or provider over the network.
"""
import json
import re
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageStat

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / 'Agents/Jalapeno'))
from wing_media_processing.photo import process_photo
from wing_media_processing.models import ProcessingLimits

out = root / 'artifacts/app-polish/release-qa/native'
meta = json.loads((out / 'pinch-crop.json').read_text())
crop = meta['crop']
upload = Image.open(out / 'pinch-confirmed-upload.jpg').convert('RGB')
source = Image.open(root / 'crawl/tests/fixtures/native-visual/framing-landscape.png').convert('RGB')
expected = source.crop((crop['originX'], crop['originY'], crop['originX'] + crop['width'], crop['originY'] + crop['height']))

def mean_error(left, right):
    return round(sum(ImageStat.Stat(ImageChops.difference(left, right)).mean) / 3, 3)

xml = (out / 'pinch-and-drag-confirmed-frame.xml').read_text()
node = re.search(r'<node[^>]*content-desc="Final square photo crop"[^>]*>', xml).group(0)
x, y, right, bottom = map(int, re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', node).groups())
# Exclude the two-DP frame border at the tested 3x emulator density.
border = 7
preview = Image.open(out / 'pinch-and-drag-confirmed-frame.png').convert('RGB').crop((x + border, y + border, right - border, bottom - border))
rendered = upload.resize((right - x, bottom - y), Image.Resampling.BILINEAR).crop((border, border, right - x - border, bottom - y - border))
artifacts = process_photo(out / 'pinch-confirmed-upload.jpg', out / 'processed', artifact_name='pinch', limits=ProcessingLimits())
primary = Image.open(artifacts.normalized_path).convert('RGB')
thumbnail = Image.open(artifacts.thumbnail_path).convert('RGB')
result = {
    'environment': 'Android emulator, injected two-pointer gesture, synthetic asset only',
    'crop': crop, 'upload_bytes': meta['size'], 'upload_size': upload.size,
    'source_crop_mean_channel_error': mean_error(upload, expected),
    'preview_mean_channel_error': mean_error(preview, rendered),
    'primary_size': primary.size,
    'primary_mean_channel_error': mean_error(primary, upload.resize(primary.size, Image.Resampling.LANCZOS)),
    'thumbnail_size': thumbnail.size,
    'thumbnail_mean_channel_error': mean_error(thumbnail, upload.resize(thumbnail.size, Image.Resampling.LANCZOS)),
    'retained_upload_original': (out / 'pinch-confirmed-upload.jpg').is_file(),
    'network_upload_performed': False,
}
assert crop['width'] < 1200 and upload.size == (crop['width'], crop['height'])
assert result['source_crop_mean_channel_error'] < 5 and result['preview_mean_channel_error'] < 10
assert result['primary_mean_channel_error'] < 5 and result['thumbnail_mean_channel_error'] < 5
(out / 'pinch-crop-verification.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result, indent=2))
