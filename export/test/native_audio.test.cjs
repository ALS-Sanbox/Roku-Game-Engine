const {test}=require('node:test'),assert=require('node:assert/strict');
const {mixerSettings,processWav}=require('../native_audio.cjs');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {buildNativeProject}=require('../native_build');
function wav(){const bytes=Buffer.alloc(44+16);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(8000,24);bytes.writeUInt32LE(16000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(16,40);for(let i=0;i<8;i++)bytes.writeInt16LE(16000,44+i*2);return bytes;}
test('native WAV processing applies gain pitch and stereo pan without altering source',()=>{
 const source=wav(),before=Buffer.from(source),output=processWav(source,{gain:.25,pitch:2,pan:1});
 assert.deepEqual(source,before);assert.equal(output.readUInt32LE(40),16);
 assert.equal(output.readInt16LE(44),0);assert.equal(output.readInt16LE(46),4000);assert.equal(output.readUInt32LE(24),8000);
 assert.throws(()=>processWav(Buffer.from('invalid'),{}));
});
test('native mixer routing includes nested gain mute solo and rejects cycles',()=>{
 const mixers=[{id:'master',isMaster:true,volume:.5},{id:'sfx',volume:.5,sendTo:'master'},{id:'other',solo:true,sendTo:'master'}];
 assert.equal(mixerSettings({volume:1,busId:'sfx'},mixers).gain,0);
 mixers[1].solo=true;assert.equal(mixerSettings({volume:.5,busId:'sfx'},mixers).gain,.125);
 mixers[0].muted=true;assert.equal(mixerSettings({volume:1,busId:'sfx'},mixers).gain,0);
 assert.throws(()=>mixerSettings({busId:'a'},[{id:'a',sendTo:'b'},{id:'b',sendTo:'a'}]),/cycle/);
});
test('native builds preserve sources and scope clip settings to each scene',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rge-native-audio-'));
 try{
  const bytes=wav();fs.writeFileSync(path.join(root,'tone.wav'),bytes);
  const scenes=['A','B'].map((name,i)=>({runtimeScene:{formatVersion:2,scene:{name,rootNodeId:'root'},nodes:[{id:'root',type:'SceneRoot',parentId:null,properties:{},transform:{},components:[{type:'AudioSourceComponent',enabled:true,resourcePath:'res://tone.wav'}]}]},editorState:{audioEngine:JSON.stringify({mixers:[{id:'master',isMaster:true,volume:1}],clips:[{id:'tone',path:'res://tone.wav',volume:i?.5:.25,pitch:1}]})}}));
  const before=JSON.stringify(scenes),result=buildNativeProject({projectRoot:root,scenes},{buildRoot:path.join(root,'builds')});
  assert.equal(JSON.stringify(scenes),before);assert.deepEqual(fs.readFileSync(path.join(root,'tone.wav')),bytes);
  const resources=JSON.parse(fs.readFileSync(path.join(result.output,'assets/resources.json')));
  assert.notEqual(resources.audio['A::tone'].nativePath,resources.audio['B::tone'].nativePath);
  assert.equal(fs.readFileSync(path.join(result.output,resources.audio['A::tone'].nativePath.slice(6))).readInt16LE(44),4000);
  assert.equal(fs.readFileSync(path.join(result.output,resources.audio['B::tone'].nativePath.slice(6))).readInt16LE(44),8000);
  assert.ok(fs.existsSync(path.join(result.output,'tone.wav')));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
