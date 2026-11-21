import {build} from 'esbuild';
import {mkdir,cp,writeFile} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'../electron'),repo=resolve(app,'../../..'),web=join(repo,'apps/web');
const dest=resolve(process.argv[2]),pub=join(dest,'public');
await mkdir(pub,{recursive:true});
for(const name of ['package.json','main.cjs','preload.cjs','planner.cjs','overlay.js'])await cp(join(app,name),join(dest,name));
await cp(join(app,'index.html'),join(pub,'index.html'));
await cp(join(web,'app/favicon.ico'),join(pub,'brand.ico'));
for(const folder of ['assets/wow/slim/characters','assets/wow/characters/frost-login/crest.webp','assets/wow/characters/frost-login/icons/equipment.webp','assets/og/fonts/alegreya-500.ttf','assets/og/fonts/inter-400.ttf','assets/og/fonts/inter-600.ttf','assets/wow/character-book/intro/arthas-strike-v1.webp','assets/wow/loading/characters-icecrown-20261106.webp','assets/wow/fonts/grimoire']){
  const path=join(pub,folder);await mkdir(dirname(path),{recursive:true});await cp(join(web,'public',folder),path,{recursive:true});
}
const output=await build({absWorkingDir:repo,entryPoints:[join(app,'ui.jsx')],outfile:join(pub,'ui.js'),bundle:true,format:'iife',platform:'browser',
  target:'chrome140',jsx:'automatic',minify:true,metafile:true,tsconfig:join(web,'tsconfig.json'),define:{'process.env.NODE_ENV':'"production"'},
  external:['/assets/*','/fonts/*','/brand/*'],alias:{'@gildra/atlas-ui':join(repo,'packages/atlas-ui/src'),'@gildra/game-data':join(repo,'packages/game-data/src/index.ts'),'next/image':join(app,'image.jsx'),'@/components/wow/shared/materialAtlas':join(app,'material.js')},
  plugins:[{name:'desktop-host',setup(b){b.onResolve({filter:/^@gildra\/atlas-ui\/AtlasValyroSelect$/},args=>args.importer.endsWith('GearFarmPlanner.tsx')?{path:join(app,'difficulty.jsx')}:undefined);b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'desk'}));b.onLoad({filter:/.*/,namespace:'desk'},()=>({contents:'import React from "react"; export default function Link({children,href,...props}){return React.createElement("a",{...props,href},children)}',resolveDir:app}));}}]});
if(process.argv[3])await writeFile(process.argv[3],JSON.stringify(Object.keys(output.metafile.inputs)));
