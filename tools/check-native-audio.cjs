const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {renderOffline}=require('../export/native_audio.cjs');
const root=path.resolve(__dirname,'../.visual-editor/native-audio-test-'+process.pid);fs.mkdirSync(root,{recursive:true});
const frames=4000,wav=Buffer.alloc(44+frames*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(frames*2,40);for(let i=0;i<frames;i++)wav.writeInt16LE(Math.round(24000*Math.sin(i*Math.PI/8)),44+i*2);
const clip={volume:.5,pitch:1,busId:'master'},master={id:'master',isMaster:true,volume:1};
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const base=renderOffline(wav,clip,[master],root),results=[];
for(const type of ['Reverb','Delay','Compressor','Distortion','Chorus','Phaser','BitCrusher']){
  const output=renderOffline(wav,clip,[{...master,effects:[{type,enabled:true,params:{}}]}],root);
  assert.notEqual(hash(output),hash(base),type+' must alter samples');
  results.push({effect:type,bytes:output.length,hash:hash(output).slice(0,12)});
}
const reverb=renderOffline(wav,clip,[{...master,effects:[{type:'Reverb',enabled:true,params:{}}]}],root);
assert.equal(hash(reverb).slice(0,12),results[0].hash,'Reverb export must be repeatable');
const loop=renderOffline(wav,{...clip,loop:true},[{...master,effects:[{type:'Delay',params:{time:0.05,feedback:0.2,wet:0.4}}]}],root);
assert.equal(loop.readUInt32LE(40),22050*4,'Loop exports retain their original period');
const panned=renderOffline(wav,clip,[{...master,pan:1}],root);
let left=0,right=0;for(let i=44;i<panned.length;i+=4){left+=Math.abs(panned.readInt16LE(i));right+=Math.abs(panned.readInt16LE(i+2));}
assert.ok(left<right*0.001,'Bus panning reaches packaged stereo samples');
fs.writeFileSync(path.join(root,'results.json'),JSON.stringify(results,null,2));console.log('NATIVE_AUDIO_DSP',JSON.stringify(results));
