const fs=require('fs'),path=require('path'),cp=require('child_process');
const root=process.cwd(),web=path.join(root,'apps/web');
const files=JSON.parse(fs.readFileSync('docs/reports/seo-performance-20261111/source-manifest.json','utf8')).files;
const changed=Object.keys(files).filter(x=>/\.tsx?$/.test(x));
const ts=require(root+'/node_modules/typescript');
const cfg=ts.readConfigFile(web+'/tsconfig.json',ts.sys.readFile);
const parsed=ts.parseJsonConfigFileContent(cfg.config,ts.sys,web);
const options={...parsed.options,incremental:false,noEmit:true,tsBuildInfoFile:undefined};
const program=ts.createProgram(changed.map(x=>path.join(root,x)),options);
let diagnostics=program.getOptionsDiagnostics();
for(const file of changed){const sf=program.getSourceFile(path.join(root,file));if(!sf)throw Error('Missing '+file);diagnostics.push(...program.getSyntacticDiagnostics(sf),...program.getSemanticDiagnostics(sf));}
const format={getCanonicalFileName:x=>x,getCurrentDirectory:()=>root,getNewLine:()=> '\n'};
fs.writeFileSync('/tmp/seo-performance-20261111/scoped-tsc.txt',ts.formatDiagnosticsWithColorAndContext(diagnostics,format));
console.log(JSON.stringify({kind:'scoped tsc',typescript:ts.version,changedFiles:changed.length,dependencyFiles:program.getSourceFiles().length,diagnostics:diagnostics.length}));
if(diagnostics.length)process.exit(1);
const lint=cp.spawnSync(process.execPath,[root+'/node_modules/eslint/bin/eslint.js',...changed],{encoding:'utf8',cwd:root});
fs.writeFileSync('/tmp/seo-performance-20261111/scoped-eslint.txt',lint.stdout+lint.stderr);console.log('scoped eslint exit',lint.status);if(lint.status)process.exit(lint.status);
const tests=cp.spawnSync(process.execPath,['--experimental-strip-types','--no-warnings','--import','./tests/atlas/resolve.mjs','--test','tests/analytics/plausible.test.ts','tests/analytics/tracking.test.ts','tests/atlas/seo.test.ts','tests/atlas/seoRoutes.test.ts','tests/atlas/foreverDungeonSeo.test.ts'],{encoding:'utf8',cwd:web});
fs.writeFileSync('/tmp/seo-performance-20261111/source-tests-final.tap',tests.stdout+tests.stderr);console.log('32 source tests exit',tests.status);process.exit(tests.status||0);
