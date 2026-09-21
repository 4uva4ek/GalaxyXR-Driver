// Test fixture only. No production backend code is substituted in the patch.
const files = new Map(), directories = new Set(), calls = [], denied = new Set();
const watchers = new Set();
const normalize = path => {
 const out=[]; for(const bit of String(path).replaceAll('\\','/').split('/')) {
  if(!bit||bit==='.')continue; if(bit==='..')out.pop();else out.push(bit);
 } return out.join('/');
};
const data='C:/Users/Test/AppData/Roaming/GalaxyXR/CustomHeadset';
const config='D:/Steam Config',runtime='D:/Renamed VR Runtime';
const openvr='C:/Users/Test/AppData/Local/openvr/openvrpaths.vrpath';
function put(path,value){files.set(normalize(path),typeof value==='string'?value:JSON.stringify(value));}
put(openvr,{runtime:[runtime],config:[config],external_drivers:[]});
for(const n of ['vrserver','vrpathreg'])put(runtime+'/bin/win64/'+n+'.exe','fixture');
put(runtime+'/drivers/GalaxyXRNative/driver.vrdrivermanifest',{name:'GalaxyXRNative',version:'1.2.3'});
put(runtime+'/drivers/GalaxyXRNative/bin/win64/driver_GalaxyXRNative.dll','fixture');
put(config+'/steamvr.vrsettings',{driver_GalaxyXRNative:{enable:true},driver_CustomHeadsetOpenVR:{enable:false}});
put(data+'/gui-settings.json',{colorScheme:'dark',updateMode:'rewrite',advanceMode:true});
put(data+'/info.json',{driverVersion:'1.2.3',defaultSettings:{},displayList:[],edidList:[]});
put(data+'/settings.json',{galaxyXr:{enable:true,nativeIdentity:true},streamFrame:{streamFrameSchema:4,nvencPresetSchema:4,enable:true,vrlinkLimitedRange:true,vrlinkEnableCAS:false,vrlinkEnableSharpen:false,vrlinkEnableEnhance:false}});
function guard(path){if(denied.has(normalize(path)))throw new Error('Permission denied: '+path);}
const appDataDir=async()=> 'C:/Users/Test/AppData/Roaming/com.sboys3.custom-headset';
const localDataDir=async()=> 'C:/Users/Test/AppData/Local';
const join=async(...parts)=>normalize(parts.join('/'));
const basename=async path=>normalize(path).split('/').at(-1);
const exists=async path=>{guard(path);return files.has(normalize(path))||directories.has(normalize(path))||[...files.keys()].some(k=>k.startsWith(normalize(path)+'/'));};
const mkdir=async path=>{guard(path);directories.add(normalize(path));};
const readTextFile=async path=>{guard(path);if(!files.has(normalize(path)))throw new Error('File missing: '+path);return files.get(normalize(path));};
const writeTextFile=async(path,text)=>{guard(path);calls.push({kind:'write',path:normalize(path),text});put(path,text);};
const copyFile=async(from,to)=>{guard(to);calls.push({kind:'copy',from,to});put(to,await readTextFile(from));};
const remove=async path=>{guard(path);calls.push({kind:'remove',path});files.delete(normalize(path));};
const readDir=async path=>[];
const watchImmediate=async(path,callback)=>{const item={path,callback};watchers.add(item);return()=>watchers.delete(item);};
const emitWatch=path=>{for(const w of watchers)if(normalize(path).startsWith(normalize(w.path)))w.callback({paths:[path],type:{modify:{kind:'any'}}});};
const getVersion=async()=> '1.2.3';
const invoke=async(name,args)=>{calls.push({kind:'invoke',name,args});if(name==='get_executable_path')return 'E:/Portable/GalaxyXRDriverGUI';if(name==='is_vrmonitor_running')return false;if(name==='get_diagnostic_data')return{};return true;};
const open=async()=>null,save=async()=>null,openUrl=async()=>{},revealItemInDir=async()=>{},openPath=async()=>{};
const fixture={files,directories,calls,denied,watchers,put,normalize,data,config,runtime,openvr,emitWatch};
module.exports={fixture,api:{appDataDir,localDataDir,join,basename,exists,mkdir,readTextFile,writeTextFile,copyFile,remove,readDir,watchImmediate,getVersion,invoke,open,save,openUrl,revealItemInDir,openPath}};
