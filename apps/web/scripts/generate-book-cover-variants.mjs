// Preserve the v2 artwork and dimensions; v3 only changes delivery compression.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
const directory=path.resolve(import.meta.dirname,"../public/assets/wow/character-book/intro");
sharp.concurrency(1);
for (const width of [320,640,1024]) {
  const source=path.join(directory,`chronicle-cover-v2-${width}.webp`);
  for(const format of ["avif","webp"]) {
    const target=path.join(directory,`chronicle-cover-v3-${width}.${format}`);
    const image=sharp(source);
    await (format==="avif" ? image.avif({quality:50,effort:5,chromaSubsampling:"4:2:0"}) : image.webp({quality:76,alphaQuality:90,effort:5})).toFile(target);
    const old=fs.statSync(path.join(directory,`chronicle-cover-v2-${width}.${format}`)).size, current=fs.statSync(target).size;
    const before=await sharp(source).metadata(),after=await sharp(target).metadata();
    if(after.width!==before.width || after.height!==before.height || !after.hasAlpha)throw Error("Cover dimensions/transparency changed");
    console.log(`${width} ${format}: ${old} → ${current} bytes (${Math.round((1-current/old)*100)}% less)`);
  }
}
