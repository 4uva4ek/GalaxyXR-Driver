#!/usr/bin/env node
'use strict';
// Section ownership tests use the real helpers. With npm ci they use Lit's
// actual template objects; without dependencies an inert template adapter can
// validate grouping/CSS only. No adapter is shipped in production code.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../GalaxyXRDriverGUI'),requireGui=createRequire(root+'/package.json');
const ts=process.env.FLUENT_TEST_TYPESCRIPT?require(process.env.FLUENT_TEST_TYPESCRIPT):requireGui('typescript');
(async()=>{
 let lit,decorators,mode='real Lit templates';
 try{lit=await import(pathToFileURL(requireGui.resolve('lit')));decorators=await import(pathToFileURL(requireGui.resolve('lit/decorators.js')));}
 catch(e){if(e.code!=='MODULE_NOT_FOUND'&&e.code!=='ERR_MODULE_NOT_FOUND')throw e;mode='inert template adapter (not a production Lit render)';lit={LitElement:class{},html:(strings,...values)=>({strings,values}),css:(strings,...values)=>({cssText:strings.reduce((s,v,i)=>s+v+(values[i]?.cssText??values[i]??''),'')})};decorators={property:()=>()=>{}};}
 const cache=new Map();
 function load(file){if(cache.has(file))return cache.get(file);const module={exports:{}};cache.set(file,module.exports);const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,useDefineForClassFields:false}}).outputText;const req=id=>id==='lit'?lit:id==='lit/decorators.js'?decorators:id.endsWith('/i18n')?{t:s=>s}:load(path.resolve(path.dirname(file),id+'.ts'));vm.runInNewContext('(function(require,module,exports){'+js+'})',{WeakMap,Math,String})(req,module,module.exports);cache.set(file,module.exports);return module.exports;}
 const h=load(root+'/src-lit/features/page-base.ts'),html=lit.html;let count=0;
 function test(name,fn){fn();count++;console.log('PASS '+name);}
 function children(t){return Array.isArray(t.values?.at(-1))?t.values.at(-1):[];}
 function flatten(v){if(Array.isArray(v))return v.map(flatten).join('');if(v?.strings)return v.strings.reduce((s,text,i)=>s+text+flatten(v.values[i]),'');if(typeof v==='function'||v==null)return '';return String(v);}
 const parentRow=h.fieldRow('Official Controller Input Profile',html`<input type="checkbox" aria-label="Official Controller Input Profile">`);
 const childRow=h.fieldRow('Grip Convention',html`<input type="checkbox" checked aria-label="Grip Convention">`);
 const deepRow=h.fieldRow('Prediction strength',html`<input type="number" value="1.15" aria-label="Prediction strength">`);
 const imageRow=h.fieldRow('Brightness',html`<input type="number" value="1" aria-label="Brightness">`);
 let clicks=0;
 const cards=h.sectionCards([h.sectionRow('Controllers',true,0,()=>clicks++),parentRow,h.sectionRow('Controller Fix',true,1,()=>clicks++),childRow,h.sectionRow('Controller Advanced',true,2,()=>clicks++),deepRow,h.sectionHeading('Image Processing'),h.sectionRow('Color',true,1,()=>clicks++),imageRow]);
 const roots=cards.values[0];
 test('Top-level headings produce separate cards',()=>assert.equal(roots.length,2));
 test('Parent controls belong to their parent card body',()=>assert.equal(children(roots[0])[0],parentRow));
 test('Child controls are nested inside a second card, not flat siblings',()=>assert.equal(children(children(roots[0])[1])[0],childRow));
 test('Deep sections add another ownership level',()=>assert.equal(children(children(children(roots[0])[1])[1])[0],deepRow));
 test('Image Processing owns its Color section',()=>assert.equal(children(children(roots[1])[0])[0],imageRow));
 test('Header rendering never calls feature actions or saves settings',()=>assert.equal(clicks,0));
 test('Collapsing removes descendant controls but keeps an accessible header',()=>{const t=h.sectionCards([h.sectionRow('Closed',false,0,()=>{}),childRow]);const text=flatten(t);assert.ok(!text.includes('Grip Convention'));assert.match(text,/aria-expanded=false/);assert.match(text,/aria-controls=settings-section-0-body/);});
 test('No redundant Expand or Collapse labels remain',()=>assert.doesNotMatch(flatten(cards),/>\s*(Expand|Collapse)\s*</));
 test('Rows before the first heading stay outside section cards',()=>{const t=h.sectionCards([parentRow,h.sectionHeading('Section'),childRow]);assert.equal(t.values[0][0],parentRow);assert.equal(children(t.values[0][1])[0],childRow);});
 test('All six pages use the shared grouping helper',()=>{for(const file of ['driver-settings-page','stream-frame-page','distortion-profile-page','app-settings-page','about-page','setup-page'])assert.match(fs.readFileSync(root+'/src-lit/features/'+file+'.ts','utf8'),/sectionCards\((body|parts|\[)/);});
 test('Shared styles indent complete child cards and collapse cleanly on narrow screens',()=>{assert.match(h.fieldStyles.cssText,/\.section-body\s*\{[^}]*padding: 4px 16px 12px 22px/);assert.match(h.fieldStyles.cssText,/\.section-body > \.section-card\s*\{[^}]*margin: 12px 0 8px 12px/);assert.match(h.fieldStyles.cssText,/\.section-card \.field \.title::after \{ display: none/);});
 console.log(`${count}/11 section-card checks passed using ${mode}.`);
 if(process.env.SECTION_CARD_FIXTURE){let markup=flatten(cards).replace(/\?hidden=false/g,'').replace(/\?hidden=true/g,'hidden').replace(/@click=\s*/g,'');fs.writeFileSync(process.env.SECTION_CARD_FIXTURE,`<!doctype html><html><head><meta charset="utf-8"><style>:root{--colorNeutralForeground1:#242424;--colorNeutralBackground1:#fff;--colorNeutralBackground2:#fafafa;--colorNeutralBackground3:#f5f5f5;--colorNeutralStroke2:#d1d1d1;--colorNeutralStroke1:#c7c7c7;--colorBrandStroke1:#0f6cbd;--colorNeutralStrokeAccessible:#616161;}body{margin:0;padding:16px;font:16px system-ui;background:var(--colorNeutralBackground2);color:var(--colorNeutralForeground1)}input{max-width:140px} ${h.fieldStyles.cssText}</style></head><body><p>Layout-only fixture: production grouping helper and CSS; native controls substitute for Fluent controls.</p>${markup}</body></html>`);}
})().catch(e=>{console.error(e);process.exitCode=1;});
