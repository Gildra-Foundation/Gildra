const sharp=require('sharp');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'../../..');
const files={'ruby-life-pools':'RubyLifePools','altar-of-fangs':'AltarOfFangs','murder-row':'MurderRow','den-of-nalorakk':'DenOfNalorakk','the-blinding-vale':'TheBlindingVale','voidscar-arena':'VoidscarArena','kings-rest':'KingsRest','temple-of-sethraliss':'TempleOfSethraliss'};
(async()=>{for(const [slug,dir] of Object.entries(files)){
 const tiles=await Promise.all(Array.from({length:150},async(_,i)=>({input:await sharp(`${process.argv[2]}/Midnight/Textures/${dir}/1_${i+1}.png`).resize(112,112).toBuffer(),left:(i%15)*112,top:Math.floor(i/15)*112})));
 await sharp({create:{width:1680,height:1120,channels:4,background:'#050607'}}).composite(tiles).webp({quality:88}).toFile(`${root}/apps/web/public/assets/wow/maps/mdt/${slug}.webp`);
 console.log(slug);
}})();
