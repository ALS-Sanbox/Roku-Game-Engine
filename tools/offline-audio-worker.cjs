// Isolated hidden Electron process for exact editor Web Audio DSP at export time.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path');
app.setPath('userData',path.join(require('node:os').tmpdir(),'rge-offline-audio-'+process.pid));
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  let win;
  try{
    const request=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
    win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false}});
    await win.loadURL('data:text/html,<html><body></body></html>');
    await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'../editor/audio/rge_audio_engine.js'),'utf8'));
    const result=await win.webContents.executeJavaScript('window.RGEAudioDSP.renderNative('+JSON.stringify(request)+')');
    const count=result.left.length,out=Buffer.alloc(44+count*4);
    out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(2,22);out.writeUInt32LE(result.sampleRate,24);out.writeUInt32LE(result.sampleRate*4,28);out.writeUInt16LE(4,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(count*4,40);
    for(let i=0;i<count;i++)for(let ch=0;ch<2;ch++)out.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(result[ch?'right':'left'][i]*32767))),44+i*4+ch*2);
    fs.writeFileSync(process.argv[3],out);win.destroy();app.exit(0);
  }catch(error){process.stderr.write(error.stack+'\n');win?.destroy();app.exit(1);}
});
