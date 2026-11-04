(function () {
  'use strict';
  const faces = new Map();
  function family(properties = {}) {
    const path = properties.fontPath;
    const key=(window.RGESceneBridge?.getProjectRoot?.()||'')+'|'+path;
    if (path && !faces.has(key)) {
      const alias = 'RGEProjectFont' + faces.size;
      const entry = {alias, loaded:false}; faces.set(key, entry);
      window.electronAPI?.readProjectAsset({resourcePath:path}).then(async result => {
        if (!result?.success) throw new Error('Font file not found');
        const face = new FontFace(alias, `url(${JSON.stringify(result.dataUrl)})`);
        await face.load(); document.fonts.add(face); entry.loaded = true;
        window.RGEUIEditor?.markDirty();
        if(window.scheduleRender&&window.RenderFlags)window.scheduleRender(window.RenderFlags.VIEWPORT);
        window.RGESceneBridge?.refreshAll();
      }).catch(() => { entry.failed = true;window.RGESceneBridge?.setStatus?.('Could not load font: '+path,true); });
    }
    const face = path && faces.get(key);
    return face?.loaded ? face.alias : properties.fontFamily || 'Noto Sans';
  }
  function canvasFont(properties, size) {
    return `${properties?.fontItalic ? 'italic ' : ''}${properties?.fontBold ? 'bold ' : ''}${Math.max(1,size)}px ${JSON.stringify(family(properties))}, sans-serif`;
  }
  window.RGEUITypography = {family, canvasFont};
})();
