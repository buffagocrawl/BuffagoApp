"""Compare bytes downloaded from real isolated Storage with confirmed framing."""
from pathlib import Path
import json,hashlib
from PIL import Image,ImageChops,ImageStat
root=Path(__file__).resolve().parents[3]
folder=root/'artifacts/app-polish/release-qa/staging'
source=root/'artifacts/app-polish/release-qa/native/pinch-confirmed-upload.jpg'
original=folder/'worker-original.jpg'
assert hashlib.sha256(source.read_bytes()).digest()==hashlib.sha256(original.read_bytes()).digest()
image=Image.open(original).convert('RGB')
results=[]
for kind in ('primary','thumbnail'):
 derivative=Image.open(folder/f'worker-{kind}.jpg').convert('RGB')
 expected=image.resize(derivative.size,Image.Resampling.LANCZOS)
 error=sum(ImageStat.Stat(ImageChops.difference(derivative,expected)).mean)/3
 assert derivative.width==derivative.height and error<5
 results.append({'kind':kind,'size':derivative.size,'meanChannelError':round(error,4)})
result={'status':'PASS','realStorageDownloads':True,'originalSHA256':hashlib.sha256(original.read_bytes()).hexdigest(),'originalSize':image.size,'derivatives':results,'scope':'confirmed Android-emulator fixture through real HTTP upload/worker/storage; no physical gestures or native iPhone acceptance'}
(root/'artifacts/app-polish/release-qa/deployment/staging-derivative-agreement.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(json.dumps(result))
