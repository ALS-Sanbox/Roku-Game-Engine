// Hidden-window capture helper; used only by the release screenshot harness.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
require('../main.js');
app.whenReady().then(()=>{
  let busy=false;
  setInterval(async()=>{
    if(busy)return;
    const win=BrowserWindow.getAllWindows()[0];if(!win||win.webContents.isLoading())return;
    busy=true;
    try {
      const mode=await win.webContents.executeJavaScript('window.__releaseScreenshot');
      if(['editor','ui','scripts'].includes(mode)){
        const capture=await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});
        fs.writeFileSync(path.join(__dirname,'../docs/images/alpha',mode+'.png'),capture.toPNG());
        await win.webContents.executeJavaScript('window.__releaseScreenshot=null;window.__releaseScreenshotDone=true');
      }
    }catch(error){console.error(error);}finally{busy=false;}
  },250);
});
