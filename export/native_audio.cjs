const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function mixerSettings(clip,mixers=[]) {
  const byId=new Map(mixers.map(m=>[m.id,m])),master=mixers.find(m=>m.isMaster);
  const solo=mixers.some(m=>m.solo&&!m.isMaster);
  let bus=byId.get(clip.busId)||master,gain=Number(clip.volume??1),pan=0,selected=!solo;
  const seen=new Set(),dspBuses=[];
  while(bus){
    if(seen.has(bus.id))throw new Error('Audio bus routing contains a cycle.');seen.add(bus.id);
    if(bus.solo)selected=true;
    if(bus.muted)gain=0;
    gain*=Number(bus.volume??1)*Number(bus.sendLevel??1);pan+=Number(bus.pan||0);
    if(Number(bus.pan||0)!==0||(bus.effects||[]).some(e=>e.enabled!==false)||[bus.eqLow,bus.eqMid,bus.eqHigh].some(v=>Number(v||0)!==0))dspBuses.push(bus.name||bus.id);
    bus=bus.isMaster?null:byId.get(bus.sendTo)||master;
  }
  if(![gain,pan,Number(clip.pitch??1)].every(Number.isFinite))throw new Error('Audio levels and pitch must be finite numbers.');
  return {gain:selected?Math.max(0,gain):0,pitch:Math.max(.1,Math.min(4,Number(clip.pitch??1))),pan:Math.max(-1,Math.min(1,pan)),dspBuses};
}
function processWav(bytes,{gain=1,pitch=1,pan=0}) {
  if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')throw new Error('Not a PCM WAV file.');
  let format,data;
  for(let at=12;at+8<=bytes.length;){const size=bytes.readUInt32LE(at+4),id=bytes.toString('ascii',at,at+4);if(at+8+size>bytes.length)throw new Error('Truncated WAV.');if(id==='fmt ')format=bytes.subarray(at+8,at+8+size);if(id==='data')data=bytes.subarray(at+8,at+8+size);at+=8+size+(size%2);}
  if(!format||!data||format.length<16||format.readUInt16LE(0)!==1||format.readUInt16LE(14)!==16||![1,2].includes(format.readUInt16LE(2)))throw new Error('Native processing requires mono/stereo 16-bit PCM WAV.');
  const channels=format.readUInt16LE(2),rate=format.readUInt32LE(4),frames=Math.floor(data.length/(channels*2)),count=Math.floor(frames/pitch);
  if(count*4>64*1024*1024)throw new Error('Processed audio exceeds 64 MiB.');
  const output=Buffer.alloc(44+count*4);output.write('RIFF');output.writeUInt32LE(output.length-8,4);output.write('WAVEfmt ',8);output.writeUInt32LE(16,16);output.writeUInt16LE(1,20);output.writeUInt16LE(2,22);output.writeUInt32LE(rate,24);output.writeUInt32LE(rate*4,28);output.writeUInt16LE(4,32);output.writeUInt16LE(16,34);output.write('data',36);output.writeUInt32LE(count*4,40);
  for(let i=0;i<count;i++){const source=i*pitch,lo=Math.floor(source),hi=Math.min(frames-1,lo+1),t=source-lo;for(let ch=0;ch<2;ch++){const c=Math.min(ch,channels-1),a=data.readInt16LE((lo*channels+c)*2),b=data.readInt16LE((hi*channels+c)*2);const balance=ch===0?1-Math.max(0,pan):1+Math.min(0,pan);output.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round((a+(b-a)*t)*gain*balance))),44+i*4+ch*2);}}
  return output;
}
function prepareAudio(scenes,projectRoot,output,diagnostics) {
  const renderedCache=new Map();
  for(const scene of scenes){
    let state;try{state=JSON.parse(scene.editorState?.audioEngine||'{}');}catch{throw new Error('Invalid audio mixer state.');}
    for(const clip of state.clips||[]){
      delete clip.nativePath;delete clip.nativeProcessed;
      const forceWav=clip.oneShot&&!/\.wav$/i.test(clip.path||'');
      try{
        const settings=mixerSettings(clip,state.mixers);
        const {target,relative}=require('./build_diagnostics').packagePath(projectRoot,clip.path);
        if(!fs.existsSync(target))throw new Error('Audio source file is missing.');
        fs.mkdirSync(path.dirname(path.join(output,relative)),{recursive:true});fs.copyFileSync(target,path.join(output,relative));
        if(settings.gain===1&&settings.pitch===1&&settings.pan===0&&!settings.dspBuses.length&&!forceWav)continue;
        const bytes=fs.readFileSync(target),key=crypto.createHash('sha256').update(bytes).update(JSON.stringify({volume:clip.volume,pitch:clip.pitch,loop:!!clip.loop,busId:clip.busId,mixers:state.mixers})).digest('hex');
        let data=renderedCache.get(key);
        if(!data){
          if(settings.dspBuses.length||settings.pan!==0)data=renderOffline(bytes,clip,state.mixers,output);
          else {try{data=processWav(bytes,settings);}catch(error){if(!/PCM WAV|Not a PCM/.test(error.message))throw error;data=renderOffline(bytes,clip,state.mixers,output);}}
          renderedCache.set(key,data);
        }
        const id=crypto.createHash('sha256').update(data).digest('hex').slice(0,20),name='audio/native/'+id+'.wav';
        fs.mkdirSync(path.dirname(path.join(output,name)),{recursive:true});fs.writeFileSync(path.join(output,name),data);clip.nativePath='res://'+name;clip.nativeProcessed=true;
      }catch(error){diagnostics.push({severity:'error',code:'NATIVE_AUDIO_PROCESSING',path:clip.path,message:error.message});}
    }
    scene.editorState ||= {};scene.editorState.audioEngine=JSON.stringify(state);
  }
}
function renderOffline(bytes,clip,mixers,output){
  const request=path.join(output,'.native-audio-input.json'),result=path.join(output,'.native-audio-output.wav');
  fs.writeFileSync(request,JSON.stringify({audio:bytes.toString('base64'),clip,mixers}));
  try{
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    const executable=process.versions.electron?process.execPath:require('electron');
    const run=require('node:child_process').spawnSync(executable,[path.resolve(__dirname,'../tools/offline-audio-worker.cjs'),request,result],{env,windowsHide:true,timeout:60000,maxBuffer:1024*1024});
    if(run.error||run.status!==0)throw new Error('Offline audio rendering failed: '+(run.error?.message||run.stderr?.toString().slice(-2000)));
    return fs.readFileSync(result);
  }finally{for(const file of [request,result])if(fs.existsSync(file))fs.unlinkSync(file);}
}
module.exports={mixerSettings,processWav,prepareAudio,renderOffline};
