#!/usr/bin/env node
'use strict';
/** Apply this source overlay from a SEPARATE extracted folder. Never operates
 * on SteamVR or AppData. Existing source is backed up before replacement.
 * ThirdParty, .git and generated builds are not copied or deleted. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ignored = new Set(['node_modules', 'dist', 'build', 'target', '.git', '.vs', 'x64', 'x86', 'output', '.source-backups', 'release', '__pycache__']);
const legacyRoots = [['CustomHeadsetGUI','GalaxyXRDriverGUI'], ['CustomHeadsetOpenVR','GalaxyXRDriver']];
const retired = [('Mega'+'neX'),('Pi'+'max'),('Dream'+'Air')].map(v=>v.toLowerCase());
function within(parent, child) { const rel=path.relative(parent,child); return rel==='' || (!rel.startsWith('..'+path.sep) && rel!=='..' && !path.isAbsolute(rel)); }
function noLinks(file) {
  for(let p=file;;p=path.dirname(p)) {
    try { if(fs.lstatSync(p).isSymbolicLink()) throw new Error(`Refusing symbolic link/junction: ${p}`); }
    catch(e) { if(e.code!=='ENOENT')throw e; }
    if(path.dirname(p)===p)break;
  }
}
function *files(dir, relative='') {
  noLinks(dir);
  for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    if(ignored.has(entry.name) || entry.name==='ThirdParty')continue;
    const rel=path.join(relative,entry.name),file=path.join(dir,entry.name);
    if(entry.isSymbolicLink())throw new Error(`Refusing symbolic link/junction: ${file}`);
    if(entry.isDirectory())yield*files(file,rel);else if(entry.isFile())yield {file,relative:rel};
  }
}
function migratedRelative(relative) {
  const normalized=relative.replaceAll('\\','/');
  // Angular was replaced, not merged back into the Lit application. The old
  // source remains in the backup. Locale catalogs and environments are kept.
  if(normalized.startsWith('src/app/') || normalized.startsWith('src-angular/'))return null;
  if(retired.some(name=>normalized.toLowerCase().replaceAll('-','').includes(name)))return null;
  if(/\.(vcxproj\.user|tsbuildinfo)$/.test(normalized) || /^(angular\.json|tsconfig\.(app|spec)\.json)$/.test(normalized))return null;
  return relative.replaceAll('CustomHeadsetOpenVR.vcxproj','GalaxyXRDriver.vcxproj')
    .replaceAll('CustomHeadsetCropped','GalaxyXRDriverCropped')
    .replaceAll('CustomHeadset.png','GalaxyXRDriver.png').replaceAll('CustomHeadset.svg','GalaxyXRDriver.svg');
}
function applySourceUpdate(source, project) {
  source=path.resolve(source);project=path.resolve(project);noLinks(source);noLinks(project);
  if(within(source,project)||within(project,source))throw new Error('Extract the update into a separate folder outside the existing project, then pass --project to that existing project.');
  for(const name of ['build.js','GalaxyXRDriverGUI','GalaxyXRDriver'])if(!fs.existsSync(path.join(source,name)))throw new Error(`Incomplete update source: ${name}`);
  if(!fs.existsSync(path.join(project,'build.js')) || !legacyRoots.every(([old,next])=>[old,next].some(name=>fs.existsSync(path.join(project,name)))))throw new Error('The target must be the complete existing project root containing build.js and both the GUI and native driver folders.');
  // Validate the complete source before changing the checkout.
  const overlay=[...files(source)];
  const backup=path.join(project,'.source-backups',new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex'));
  noLinks(backup);fs.mkdirSync(backup,{recursive:true});
  const operations=[],saved=new Set();let copied=0;
  const target = relative=>{const result=path.resolve(project,relative);if(!within(project,result)||result===project)throw new Error('Unsafe update path: '+relative);noLinks(result);return result;};
  function installFile(input, relative, onlyMissing=false) {
    const output=target(relative);
    if(onlyMissing && fs.existsSync(output))return;
    if(fs.existsSync(output)) {
      if(!fs.statSync(output).isFile())throw new Error('Expected a file, found a directory: '+output);
      if(fs.readFileSync(input).equals(fs.readFileSync(output)))return;
    }
    if(!saved.has(output)) {
      const original=fs.existsSync(output)?path.join(backup,'overwritten',relative):null;
      if(original) {fs.mkdirSync(path.dirname(original),{recursive:true});fs.copyFileSync(output,original);}
      operations.push({kind:'file',path:output,original});saved.add(output);
    }
    fs.mkdirSync(path.dirname(output),{recursive:true});
    const tmp=output+'.source-update-'+crypto.randomBytes(4).toString('hex');
    try { fs.copyFileSync(input,tmp);fs.renameSync(tmp,output); } finally { if(fs.existsSync(tmp))fs.unlinkSync(tmp); }
    copied++;
  }
  function archive(relative) {
    const original=target(relative);if(!fs.existsSync(original))return null;
    const destination=path.join(backup,'retired',relative);fs.mkdirSync(path.dirname(destination),{recursive:true});
    fs.renameSync(original,destination);operations.push({kind:'move',path:original,original:destination});return destination;
  }
  try {
    for(const [old,next] of legacyRoots) {
      const directory=path.join(project,old);
      if(!fs.existsSync(directory))continue;
      // Scan first: no traversal through a checkout symlink during migration.
      [...files(directory)];
      const oldBackup=archive(old);
      for(const item of files(oldBackup)) {const rel=migratedRelative(item.relative);if(rel!==null)installFile(item.file,path.join(next,rel),true);}
    }
    archive('CustomHeadsetOpenVR.sln');
    for(const item of overlay)installFile(item.file,item.relative);
    // A source overlay cannot delete stale files. Retire old Angular and vendor
    // files in an already-renamed checkout as well, without touching AppData.
    for(const root of ['GalaxyXRDriverGUI','GalaxyXRDriver']) {
      const angular=path.join(root,'src','app');if(root.endsWith('GUI'))archive(angular);
      for(const item of [...files(path.join(project,root))]) {
        const rel=path.join(root,item.relative),flat=rel.toLowerCase().replaceAll('-','');
        if(retired.some(name=>flat.includes(name)) || /CustomHeadset(OpenVR\.vcxproj|Cropped\.|\.png|\.svg)/.test(item.relative))archive(rel);
      }
    }
    fs.writeFileSync(path.join(backup,'source-update.json'),JSON.stringify({schema:1,source,project,copied,operations},null,2)+'\n');
    return {backup,copied};
  } catch(error) {
    const failures=[];
    for(const operation of operations.reverse()) {
      try {
        if(operation.kind==='move') {fs.mkdirSync(path.dirname(operation.path),{recursive:true});fs.renameSync(operation.original,operation.path);}
        else if(operation.original)fs.copyFileSync(operation.original,operation.path);
        else if(fs.existsSync(operation.path)&&fs.statSync(operation.path).isFile())fs.unlinkSync(operation.path);
      } catch(e) {failures.push(String(e));}
    }
    throw new Error(`Source update failed: ${error.message}. Backup: ${backup}. ${failures.length?'Rollback needs review: '+failures.join('; '):'Changed source files were rolled back.'}`);
  }
}
module.exports={applySourceUpdate};
if(require.main===module) {
  if(process.argv.length!==4 || process.argv[2]!=='--project') {
    console.error('Usage: node tools/Apply-SourceUpdate.cjs --project "D:\\path\\to\\existing\\GalaxyXR-Driver"\nRun from a separately extracted update folder. Close editors/builds first.');process.exitCode=2;
  } else {
    try { const result=applySourceUpdate(path.resolve(__dirname,'..'),process.argv[3]);console.log(`Updated ${result.copied} source files. Backup: ${result.backup}\nUse GalaxyXRDriverGUI and GalaxyXRDriver.sln from now on. Run npm ci, then rebuild both application and driver.`); }
    catch(error) {console.error(error.message);process.exitCode=1;}
  }
}
