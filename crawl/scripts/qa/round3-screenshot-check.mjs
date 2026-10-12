import { readdirSync, readFileSync } from 'node:fs';
import { decode } from 'fast-png';
const root='../docs/android-qa-round-3/screenshots';let checked=0;
for(const folder of readdirSync(root)){for(const file of readdirSync(`${root}/${folder}`).filter(file=>file.endsWith('.png'))){
 const p=`${root}/${folder}/${file}`,png=decode(readFileSync(p)),colors=new Set();
 for(let y=180;y<png.height-180;y+=8)for(let x=0;x<png.width;x+=8){const i=(y*png.width+x)*png.channels;colors.add(`${png.data[i]},${png.data[i+1]},${png.data[i+2]}`);}
 checked++;if(colors.size<50)console.log(`BLANK ${p} colors=${colors.size}`);
}}
console.log(`Checked ${checked} screenshots`);
