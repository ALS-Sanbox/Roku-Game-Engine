'use strict';
// Original reference supplied narration only. These deterministic PCM source
// assets supply audible rebuild feedback/music using the normal RGE Audio tab.
const fs=require('node:fs'),path=require('node:path');
module.exports=function(directory){
 const names=['high_score','weapon_upgrade','button','shoot','enemy_shoot','enemy_hit','enemy_destroy','boss_destroy','angel_hit','prayer_hit','powerup_pickup','powerup_expire','bullet_block','day_complete','boss_intro','victory','defeat','pause','resume','prayer_delivered','enemy_arrival'];
 function wav(file,duration,sample){
  if(fs.existsSync(path.join(directory,file)))return;
  const rate=16000,frames=Math.round(rate*duration),out=Buffer.alloc(44+frames*2);
  out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*2,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(frames*2,40);
  for(let i=0;i<frames;i++)out.writeInt16LE(Math.round(Math.max(-1,Math.min(1,sample(i/rate)))*32767),44+i*2);
  fs.writeFileSync(path.join(directory,file),out);
 }
 names.forEach((name,index)=>{
  const duration=/victory|delivered|high_score|day_complete/.test(name)?.8:.18;
  const base=180+(index%8)*55;
  wav('sfx_'+name+'.wav',duration,t=>{
   const envelope=Math.min(1,t/.008)*Math.pow(1-t/duration,2);
   const frequency=base*(1+(/destroy|hit|defeat/.test(name)?-0.45:0.7)*t/duration);
   return .18*envelope*(Math.sin(2*Math.PI*frequency*t)+.2*Math.sin(4*Math.PI*frequency*t));
  });
 });
 for(const boss of [false,true]){
  const chords=boss?[[110,130.813,164.814],[97.999,123.471,146.832],[103.826,130.813,155.563],[110,130.813,164.814]]:[[220,261.626,329.628],[174.614,220,261.626],[195.998,246.942,293.665],[164.814,195.998,246.942]];
  wav(boss?'boss00.wav':'bgm00.wav',8,t=>{
   const position=t%2,envelope=Math.sin(Math.PI*position/2)**2;
   return chords[Math.min(3,Math.floor(t/2))].reduce((sum,f)=>sum+Math.sin(2*Math.PI*f*t),0)*envelope*(boss?.035:.025);
  });
 }
};
