import { decode, encode } from 'fast-png';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const folder = process.argv[2] || 'artifacts/visual-polish-v2/completion';
const pattern = process.argv[3] || '.png';
const files = readdirSync(folder).filter(f => f.includes(pattern) && f.endsWith('.png') && !f.startsWith('sheet-')).sort();
for (let start=0;start<files.length;start+=5) {
  const group=files.slice(start,start+5), width=300*group.length, height=740;
  const data=new Uint8Array(width*height*4).fill(30);
  for (let i=3;i<data.length;i+=4) data[i]=255;
  group.forEach((file,index)=>{
    const src=decode(readFileSync(`${folder}/${file}`));
    const h=Math.round(src.height*300/src.width);
    for(let y=0;y<Math.min(h,height);y++)for(let x=0;x<300;x++) {
      const from=(Math.floor(y*src.height/h)*src.width+Math.floor(x*src.width/300))*src.channels;
      const to=(y*width+index*300+x)*4;
      for(let c=0;c<3;c++)data[to+c]=src.data[from+c];
    }
  });
  const name=`${folder}/sheet-${pattern.replace(/[^a-z0-9]/gi,'')}-${start/5}.png`;
  writeFileSync(name,encode({width,height,data,channels:4}));
  console.log(JSON.stringify({name,files:group}));
}
