globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;

/**
 * RGE Camera Preview Panel — Phase 2 + Phase 3 Complete
 * Live canvas rendering from a Camera2D's perspective.
 * Panel HTML lives in index.html; this module drives the render loop.
 */
(function () {
  'use strict';

  const CANVAS_ID   = 'camera-preview-canvas';
  const SELECTOR_ID = 'camera-preview-selector';
  const WRAP_ID     = 'camera-preview-viewport-wrap';
  const INFO_ID     = 'camera-preview-overlay-info';
  const NOCAM_ID    = 'camera-preview-no-cam';
  const STORAGE_KEY = 'rge.cameraPreview.v1';
  const FRAME_MS    = 1000 / 60;
  const PATH_PLAY_ID  = 'camera-path-play';
  const PATH_STOP_ID  = 'camera-path-stop';
  const PATH_SPEED_ID = 'camera-path-speed';
  const PATH_PAUSE_ID = 'camera-path-pause';
  const PATH_LOOP_ID  = 'camera-path-loop';

  let _canvas = null, _ctx = null, _rafId = null, _lastT = 0;
  let _mounted = false, _paused = false, _resizeObs = null;
  let _previewZoom = 'fit'; // 'fit' | 1 | 2 | 4
  let _pathPlayback = { active: false, pathId: null, distance: 0, lastTs: 0 };

  // ── Data accessors ─────────────────────────────────────────────────────────
  function nodes()       { return window.state?.sceneState?.nodes || []; }
  function cam2dNodes()  { return nodes().filter(n => n && n.type === 'Camera2D'); }
  function boundsNodes() { return nodes().filter(n => n && n.type === 'CameraBounds2D'); }
  function zoneNodes()   { return nodes().filter(n => n && n.type === 'CameraZone2D'); }
  function pathNodes()   { return nodes().filter(n => n && n.type === 'CameraPath2D'); }
  function targetGroupNodes() { return nodes().filter(n => n && n.type === 'CameraTargetGroup'); }

  const UI_TYPES = new Set(['CanvasLayer','Control','Label','Panel','TextureRect','Button','HBoxContainer','VBoxContainer','MarginContainer','ScrollContainer','CircleButton','TriangleButton','OvalButton']);
  const SKIP_TYPES = new Set(['Camera2D','CameraBounds2D','CameraZone2D','CameraPath2D','CameraTargetGroup','SceneRoot']);

  // ── CTG helpers ─────────────────────────────────────────────────────────────
  function getNodeById(id) { return nodes().find(n => n && n.id === id) || null; }

  function computeCTGFramePreview(groupNode, viewportW, viewportH) {
    if (!groupNode || groupNode.type !== 'CameraTargetGroup') return null;
    const p = groupNode.properties || {};
    const targetRefs = Array.isArray(p.targets) ? p.targets : [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let validCount = 0;
    for (const entry of targetRefs) {
      const t = getNodeById(entry.nodeId);
      if (!t || t.visible === false) continue;
      const tx = Number(t.transform?.x) || 0;
      const ty = Number(t.transform?.y) || 0;
      if (tx < minX) minX = tx; if (tx > maxX) maxX = tx;
      if (ty < minY) minY = ty; if (ty > maxY) maxY = ty;
      validCount++;
    }
    if (validCount === 0) return null;
    const padL = Number(p.paddingLeft) || 64, padR = Number(p.paddingRight) || 64;
    const padT = Number(p.paddingTop)  || 64, padB = Number(p.paddingBottom)|| 64;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    let zoom = 1;
    if (p.enableAutoZoom !== false) {
      const rawW = (maxX - minX) + padL + padR;
      const rawH = (maxY - minY) + padT + padB;
      const vw = viewportW || 1280, vh = viewportH || 720;
      const zx = rawW > 0 ? vw / rawW : Infinity;
      const zy = rawH > 0 ? vh / rawH : Infinity;
      zoom = Math.max(Number(p.minZoom)||0.5, Math.min(Number(p.maxZoom)||3.0, Math.min(zx,zy)));
    }
    return { centerX, centerY, zoom, validCount, minX, maxX, minY, maxY,
             boundsW: maxX - minX, boundsH: maxY - minY,
             padL, padR, padT, padB };
  }

  /**
   * Draw CameraTargetGroup debug overlay in the camera preview panel.
   * Only called when groupNode.properties.showDebug === true.
   */
  function drawCTGOverlay(ctx, groupNode, viewCX, viewCY, sx, sy, vpX, vpY, vpW, vpH) {
    const frame = computeCTGFramePreview(groupNode, vpW / sx, vpH / sy);
    if (!frame) return;
    const p = groupNode.properties || {};
    const targetRefs = Array.isArray(p.targets) ? p.targets : [];

    ctx.save();
    ctx.beginPath(); ctx.rect(vpX, vpY, vpW, vpH); ctx.clip();

    // Target markers
    for (const entry of targetRefs) {
      const t = getNodeById(entry.nodeId);
      if (!t || t.visible === false) continue;
      const tx = (Number(t.transform?.x) || 0);
      const ty = (Number(t.transform?.y) || 0);
      const sx2 = (tx - viewCX) * sx + vpX + vpW/2;
      const sy2 = (ty - viewCY) * sy + vpY + vpH/2;
      ctx.beginPath(); ctx.arc(sx2, sy2, 6, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,152,0,0.9)'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#ffb74d'; ctx.font = '9px monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(t.name || t.type, sx2 + 9, sy2);
    }

    // Group bounding box (target area)
    const bx1 = (frame.minX - viewCX) * sx + vpX + vpW/2;
    const by1 = (frame.minY - viewCY) * sy + vpY + vpH/2;
    const bw  = frame.boundsW * sx, bh = frame.boundsH * sy;
    ctx.strokeStyle = '#ffcc02'; ctx.lineWidth = 1; ctx.setLineDash([4,4]);
    ctx.strokeRect(bx1, by1, bw, bh);

    // Padding bounding box
    const px1 = (frame.minX - frame.padL - viewCX) * sx + vpX + vpW/2;
    const py1 = (frame.minY - frame.padT - viewCY) * sy + vpY + vpH/2;
    const pw  = (frame.boundsW + frame.padL + frame.padR) * sx;
    const ph  = (frame.boundsH + frame.padT + frame.padB) * sy;
    ctx.strokeStyle = '#ff9800'; ctx.lineWidth = 1.5; ctx.setLineDash([8,5]);
    ctx.strokeRect(px1, py1, pw, ph);

    // Center crosshair
    const ccx = (frame.centerX - viewCX) * sx + vpX + vpW/2;
    const ccy = (frame.centerY - viewCY) * sy + vpY + vpH/2;
    const CH = 10;
    ctx.strokeStyle = '#ff9800'; ctx.lineWidth = 2; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(ccx-CH, ccy); ctx.lineTo(ccx+CH, ccy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ccx, ccy-CH); ctx.lineTo(ccx, ccy+CH); ctx.stroke();

    // Zoom/target info label
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(px1+2, py1+2, 130, 30);
    ctx.fillStyle = '#ff9800'; ctx.font = '10px monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`${groupNode.name || 'CTG'}  Zoom: ${frame.zoom.toFixed(2)}x`, px1+5, py1+5);
    ctx.fillText(`Targets: ${frame.validCount}`, px1+5, py1+17);

    ctx.restore();
  }

  function visibleWorldNodes() {
    return nodes().filter(n => n && !SKIP_TYPES.has(n.type) && !UI_TYPES.has(n.type) && n.visible !== false);
  }
  function visibleUiNodes() {
    return nodes().filter(n => n && UI_TYPES.has(n.type) && n.visible !== false);
  }

  // Tileset/sheet helpers (mirrors scene_editor.js)
  function getTilesetById(id) {
    return (window.state?.tilesets || []).find(t => t && t.id === id) || null;
  }
  function getSheetById(id) {
    return (window.state?.spritesheets || []).find(s => s && s.id === id) || null;
  }
  function getTileMapTileset(node, layer) {
    if (!node || !node.properties) return null;
    const tilesetId = layer?.tilesetId || node.properties.tilesetId || '';
    if (tilesetId) { const t = getTilesetById(tilesetId); if (t) return t; }
    return (window.state?.tilesets || [])[0] || null;
  }
  function getTileRectForIndex(sheet, tileset, tileIndex) {
    if (!sheet || !tileset) return null;
    const tw = Math.max(1, Number(tileset.tileWidth) || Number(sheet.tileWidth) || 32);
    const th = Math.max(1, Number(tileset.tileHeight) || Number(sheet.tileHeight) || 32);
    const pad = Math.max(0, Number(tileset.padding) || Number(sheet.padding) || 0);
    const offX = Number(sheet.offsetX) || 0, offY = Number(sheet.offsetY) || 0;
    const cols = Math.max(1, Math.floor((Math.max(0, sheet.imageWidth - offX) + pad) / (tw + pad)));
    const col = tileIndex % cols, row = Math.floor(tileIndex / cols);
    return { x: offX + col * (tw + pad), y: offY + row * (th + pad), width: tw, height: th };
  }

  function selectedCameraId() { return window.state?.cameraPreview?.selectedCameraId || null; }

  function ensurePathPoints(path) {
    const raw = Array.isArray(path?.properties?.points) ? path.properties.points : [];
    return raw.map((point) => ({
      x: (Number(path?.transform?.x) || 0) + (Number(point?.x) || 0),
      y: (Number(path?.transform?.y) || 0) + (Number(point?.y) || 0)
    }));
  }

  function resolvePreviewPath() {
    const selected = nodes().find(n => n && n.id === window.state?.selectedId && n.type === 'CameraPath2D');
    if (selected) return selected;
    if (_pathPlayback.pathId) {
      const active = pathNodes().find(p => p.id === _pathPlayback.pathId);
      if (active) return active;
    }
    return pathNodes()[0] || null;
  }

  function pathLength(points, loop) {
    let total = 0;
    for (let i = 0; i < points.length - 1; i += 1) total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    if (loop && points.length > 2) total += Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y);
    return total;
  }

  function _smoothstep(t) { return t * t * (3 - 2 * t); }

  function _catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return {
      x: 0.5 * ((2*p1.x) + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
      y: 0.5 * ((2*p1.y) + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3)
    };
  }

  function samplePath(points, distance, loop, interpolation) {
    if (!points.length) return null;
    if (points.length === 1) return points[0];
    const total = pathLength(points, loop);
    if (total <= 0) return points[0];
    let remaining = loop ? ((distance % total) + total) % total : Math.max(0, Math.min(total, distance));
    const n = points.length;
    const segmentCount = loop && n > 2 ? n : n - 1;
    for (let i = 0; i < segmentCount; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % n];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len <= 0) continue;
      if (remaining <= len || i === segmentCount - 1) {
        let t = len > 0 ? Math.max(0, Math.min(1, remaining / len)) : 0;
        if (interpolation === 'Smooth') t = _smoothstep(t);
        if (interpolation === 'Cubic') {
          const p0 = points[(i - 1 + n) % n];
          const p3 = points[(i + 2) % n];
          return _catmullRom(p0, a, b, p3, t);
        }
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      remaining -= len;
    }
    return points[n - 1];
  }

  function getPathPlaybackPosition(ts) {
    // Prefer scene-editor transport state if available (WYSIWYG sync)
    const cpe = window.state?.cameraPathEditor;
    if (cpe && cpe.previewPlaying && cpe._previewMarker) {
      // Mirror the scene editor's evaluation result — already computed
      return { x: cpe._previewMarker.x, y: cpe._previewMarker.y };
    }

    // Legacy standalone playback for Camera Preview panel's own play/stop buttons
    if (!_pathPlayback.active) return null;
    const path = resolvePreviewPath();
    const points = ensurePathPoints(path);
    if (!path || points.length < 1) return null;
    const loop = (cpe?.previewLoop) || path.properties?.loop === true;
    const closed = path.properties?.closedPath === true;
    const interpolation = path.properties?.interpolation || 'Linear';
    const total = pathLength(points, loop || closed);
    if (total <= 0) return points[0];

    // Determine speed: use path.speed if >= 1, else fall back to duration
    let speed;
    if (path.properties?.speed != null && Number(path.properties.speed) >= 1) {
      speed = Math.max(1, Number(path.properties.speed));
    } else {
      const speedInput = document.getElementById(PATH_SPEED_ID);
      speed = Math.max(1, Number(speedInput?.value) || 160);
    }

    if (!_pathPlayback.lastTs) _pathPlayback.lastTs = ts;
    const dt = Math.max(0, Math.min(0.25, (ts - _pathPlayback.lastTs) / 1000));
    _pathPlayback.lastTs = ts;
    _pathPlayback.distance += speed * dt;
    if (!loop && !closed && _pathPlayback.distance >= total) {
      _pathPlayback.distance = total;
      _pathPlayback.active = false;
    }
    return samplePath(points, _pathPlayback.distance, loop || closed, interpolation);
  }

  function resolveCamera() {
    const cams = cam2dNodes();
    if (!cams.length) return null;
    const id = selectedCameraId();
    if (id) { const f = cams.find(c => c.id === id); if (f) return f; }
    return cams.find(c => c.properties?.current) || cams[0];
  }

  // ── Canvas ─────────────────────────────────────────────────────────────────
  function acquireCanvas() {
    _canvas = document.getElementById(CANVAS_ID);
    if (!_canvas) return false;
    _ctx = _canvas.getContext('2d');
    return !!_ctx;
  }

  function fitCanvas() {
    if (!_canvas) return;
    const wrap = document.getElementById(WRAP_ID);
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width));
    const h = Math.max(1, Math.floor(r.height) - 28); // leave room for zoom bar
    if (_canvas.width !== w || _canvas.height !== h) { _canvas.width = w; _canvas.height = h; }
  }

  // ── Drawing helpers ────────────────────────────────────────────────────────
  function hexRgba(hex, a) {
    if (typeof window.hexWithAlpha === 'function') return window.hexWithAlpha(hex, a);
    try {
      const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
      return `rgba(${r},${g},${b},${a})`;
    } catch { return `rgba(94,117,148,${a})`; }
  }

  function strokeDash(ctx, x, y, w, h, stroke, lw, dash) {
    ctx.save(); ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.setLineDash(dash||[]);
    ctx.strokeRect(x,y,w,h); ctx.restore();
  }

  function fillBox(ctx, x, y, w, h, fill) {
    ctx.save(); ctx.fillStyle = fill; ctx.fillRect(x,y,w,h); ctx.restore();
  }

  function arrowLine(ctx, x1, y1, x2, y2, color, lw) {
    const dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy);
    if (len<2) return;
    const ux=dx/len, uy=dy/len, hl=Math.min(12,len*0.3);
    ctx.save(); ctx.strokeStyle=ctx.fillStyle=color; ctx.lineWidth=lw||2; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2,y2);
    ctx.lineTo(x2-hl*(ux+uy*0.5),y2-hl*(uy-ux*0.5));
    ctx.lineTo(x2-hl*(ux-uy*0.5),y2-hl*(uy+ux*0.5));
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  // ── Node rendering ─────────────────────────────────────────────────────────
  // camX/camY = top-left world coords of camera view
  // vpX/vpY   = top-left pixel of the viewport rect on the canvas
  function drawNode(ctx, node, camX, camY, sx, sy, vpX, vpY) {
    if (node.visible === false) return;
    const tx=(Number(node.transform?.x)||0), ty=(Number(node.transform?.y)||0);
    const rot=(Number(node.transform?.rotation)||0)*Math.PI/180;
    const snx=Number(node.transform?.scaleX)||1, sny=Number(node.transform?.scaleY)||1;

    // ── TileMap ──────────────────────────────────────────────────────────────
    if (node.type === 'TileMap') {
      const props = node.properties || {};
      const tw = Math.max(1, Number(props.tileWidth) || 32);
      const th = Math.max(1, Number(props.tileHeight) || 32);
      const mw = Math.max(1, Number(props.mapWidth) || 10);
      const mh = Math.max(1, Number(props.mapHeight) || 8);
      const layers = Array.isArray(props.layers) ? props.layers : [];
      const originX = (tx - camX) * sx + vpX;
      const originY = (ty - camY) * sy + vpY;
      const stw = tw * sx * snx, sth = th * sy * sny;
      const totalW = mw * stw, totalH = mh * sth;

      ctx.save();
      if (rot) { ctx.translate(originX + totalW/2, originY + totalH/2); ctx.rotate(rot); ctx.translate(-(originX + totalW/2), -(originY + totalH/2)); }

      ctx.fillStyle = 'rgba(30,48,80,0.55)';
      ctx.fillRect(originX, originY, totalW, totalH);

      for (let r = 0; r < mh; r++) {
        for (let c = 0; c < mw; c++) {
          const cellX = originX + c * stw;
          const cellY = originY + r * sth;
          for (const layer of layers) {
            if (!layer || layer.visible === false) continue;
            const tv = Number(layer.tiles?.[r]?.[c]);
            if (!Number.isFinite(tv) || tv < 0) continue;
            const opacity = Math.max(0, Math.min(1, Number(layer.opacity) || 1));
            const tileset = getTileMapTileset(node, layer);
            const sheet = tileset ? getSheetById(tileset.spriteSheetId) : null;
            if (sheet?.image && sheet.image.complete && sheet.image.naturalWidth > 0 && tileset) {
              const rect = getTileRectForIndex(sheet, tileset, tv);
              if (rect) {
                ctx.globalAlpha = opacity;
                ctx.drawImage(sheet.image, rect.x, rect.y, rect.width, rect.height, cellX, cellY, stw, sth);
                ctx.globalAlpha = 1;
              }
            } else {
              ctx.fillStyle = `rgba(77,121,199,${opacity * 0.7})`;
              ctx.fillRect(cellX + 1, cellY + 1, stw - 2, sth - 2);
            }
          }
        }
      }
      ctx.fillStyle = 'rgba(180,210,255,0.75)';
      ctx.font = `${Math.max(8, Math.min(11, stw * 0.4))}px monospace`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(node.name || 'TileMap', originX + 3, originY + 3);
      ctx.restore();
      return;
    }

    // ── Generic world nodes (Sprite2D, AnimatedSprite2D, Node2D, etc.) ───────
    const nw = Math.max(1, Number(node.properties?.width) || 64);
    const nh = Math.max(1, Number(node.properties?.height) || 64);
    const screenX = (tx - camX) * sx + vpX, screenY = (ty - camY) * sy + vpY;
    const sw2 = nw * sx * snx, sh2 = nh * sy * sny;
    ctx.save(); ctx.translate(screenX, screenY); if (rot) ctx.rotate(rot);
    const hw = sw2 / 2, hh = sh2 / 2;
    if (node.type === 'Sprite2D' || node.type === 'AnimatedSprite2D') {
      const img = window.state?.imageCache?.get?.(node.id);
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, -hw, -hh, sw2, sh2);
        ctx.strokeStyle = 'rgba(100,200,255,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([]);
        ctx.strokeRect(-hw, -hh, sw2, sh2);
      } else {
        ctx.fillStyle = 'rgba(95,178,211,0.22)'; ctx.fillRect(-hw, -hh, sw2, sh2);
        ctx.strokeStyle = '#5fb2d3'; ctx.lineWidth = 1; ctx.setLineDash([]);
        ctx.strokeRect(-hw, -hh, sw2, sh2);
        ctx.fillStyle = '#5fb2d3';
        ctx.font = `${Math.max(8, Math.min(12, sw2 / 6))}px monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(node.name || node.type, 0, 0);
      }
    } else if (node.type === 'Node2D') {
      const tint = node.properties?.tint || '#5e7594';
      ctx.fillStyle = hexRgba(tint, 0.14); ctx.fillRect(-hw, -hh, sw2, sh2);
      ctx.strokeStyle = tint; ctx.lineWidth = 1.5; ctx.setLineDash([8, 5]);
      ctx.strokeRect(-hw, -hh, sw2, sh2);
      ctx.fillStyle = '#c8d6ea'; ctx.setLineDash([]);
      ctx.font = `${Math.max(8, Math.min(12, sw2 / 5))}px monospace`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(node.name || 'Node2D', -hw + 3, -hh + 3);
    } else {
      ctx.fillStyle = 'rgba(32,38,52,0.7)'; ctx.fillRect(-hw, -hh, sw2, sh2);
      ctx.strokeStyle = '#5e7594'; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
      ctx.strokeRect(-hw, -hh, sw2, sh2);
      ctx.fillStyle = '#c8d6ea'; ctx.setLineDash([]);
      ctx.font = `${Math.max(7, Math.min(11, sw2 / 6))}px monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(node.name || node.type, 0, 0);
    }
    ctx.restore();
  }

  // ── UI node rendering (screen-space, inside camera viewport rect) ──────────
  function drawUiNode(ctx, node, vpX, vpY, vpW, vpH) {
    if (node.visible === false) return;
    const tx = Number(node.transform?.x) || 0;
    const ty = Number(node.transform?.y) || 0;
    const rot = (Number(node.transform?.rotation) || 0) * Math.PI / 180;
    const nw = Math.max(1, Number(node.properties?.width) || 96);
    const nh = Math.max(1, Number(node.properties?.height) || 48);
    // UI coords are viewport-relative (0,0 = top-left of camera view)
    const sx = vpX + tx, sy = vpY + ty;

    ctx.save();
    ctx.translate(sx + nw / 2, sy + nh / 2);
    if (rot) ctx.rotate(rot);

    const hw = nw / 2, hh = nh / 2;

    if (node.type === 'CanvasLayer') {
      // Just a dashed container outline
      ctx.strokeStyle = 'rgba(155,89,255,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
      ctx.strokeRect(-hw, -hh, nw, nh);
      ctx.fillStyle = 'rgba(155,89,255,0.12)'; ctx.fillRect(-hw, -hh, nw, nh);
      ctx.fillStyle = 'rgba(180,140,255,0.8)'; ctx.setLineDash([]);
      ctx.font = '9px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(node.name || 'CanvasLayer', -hw + 3, -hh + 3);
    } else if (node.type === 'Label') {
      const text = node.properties?.text || node.name || 'Label';
      const fontSize = Math.max(8, Math.min(32, Number(node.properties?.fontSize) || 16));
      const color = node.properties?.color || '#ffffff';
      ctx.fillStyle = hexRgba(color, 0.9);
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(text, -hw, -hh);
    } else if (node.type === 'Button' || node.type === 'CircleButton' || node.type === 'TriangleButton' || node.type === 'OvalButton') {
      ctx.fillStyle = 'rgba(71,130,191,0.75)'; ctx.fillRect(-hw, -hh, nw, nh);
      ctx.strokeStyle = '#4b8dce'; ctx.lineWidth = 1.5; ctx.setLineDash([]);
      ctx.strokeRect(-hw, -hh, nw, nh);
      ctx.fillStyle = '#e8f0fe';
      ctx.font = `${Math.max(8, Math.min(14, nh * 0.4))}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(node.properties?.text || node.name || 'Button', 0, 0);
    } else if (node.type === 'Panel') {
      const bg = node.properties?.backgroundColor || '#1a2030';
      ctx.fillStyle = hexRgba(bg, 0.8); ctx.fillRect(-hw, -hh, nw, nh);
      ctx.strokeStyle = 'rgba(100,140,200,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([]);
      ctx.strokeRect(-hw, -hh, nw, nh);
      ctx.fillStyle = 'rgba(180,200,220,0.6)';
      ctx.font = '9px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(node.name || 'Panel', -hw + 3, -hh + 3);
    } else if (node.type === 'TextureRect') {
      const img = window.state?.imageCache?.get?.(node.id);
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, -hw, -hh, nw, nh);
      } else {
        ctx.fillStyle = 'rgba(95,140,211,0.22)'; ctx.fillRect(-hw, -hh, nw, nh);
        ctx.strokeStyle = '#5f8cd3'; ctx.lineWidth = 1; ctx.setLineDash([]);
        ctx.strokeRect(-hw, -hh, nw, nh);
        ctx.fillStyle = '#9ab8e8';
        ctx.font = `${Math.max(8, Math.min(12, nw / 8))}px monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(node.name || 'TextureRect', 0, 0);
      }
    } else {
      // Generic UI node fallback
      ctx.fillStyle = 'rgba(139,89,210,0.18)'; ctx.fillRect(-hw, -hh, nw, nh);
      ctx.strokeStyle = 'rgba(139,89,210,0.6)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      ctx.strokeRect(-hw, -hh, nw, nh);
      ctx.fillStyle = '#c8b8ea'; ctx.setLineDash([]);
      ctx.font = `${Math.max(7, Math.min(10, nw / 8))}px monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(node.name || node.type, 0, 0);
    }
    ctx.restore();
  }

  // ── Background ─────────────────────────────────────────────────────────────
  function drawChecker(ctx, cw, ch) {
    const sz=14;
    ctx.fillStyle='#151821'; ctx.fillRect(0,0,cw,ch);
    ctx.fillStyle='#1b2030';
    for (let y=0;y<ch;y+=sz) {
      const odd=Math.floor(y/sz)%2;
      for (let x=odd*sz;x<cw;x+=sz*2) ctx.fillRect(x,y,sz,sz);
    }
  }

  function drawGrid(ctx, camX, camY, sx, sy, vpX, vpY, vpW, vpH) {
    const gs=64, gw=gs*sx, gh=gs*sy;
    if (gw<8||gh<8) return;
    const ox=(vpX-camX*sx)%gw, oy=(vpY-camY*sy)%gh;
    ctx.save(); ctx.strokeStyle='rgba(255,255,255,0.035)'; ctx.lineWidth=1; ctx.setLineDash([]);
    for (let x=((ox%gw)+gw)%gw+vpX;x<vpX+vpW;x+=gw) { ctx.beginPath(); ctx.moveTo(x,vpY); ctx.lineTo(x,vpY+vpH); ctx.stroke(); }
    for (let y=((oy%gh)+gh)%gh+vpY;y<vpY+vpH;y+=gh) { ctx.beginPath(); ctx.moveTo(vpX,y); ctx.lineTo(vpX+vpW,y); ctx.stroke(); }
    ctx.restore();
  }

  // ── Zone color map ─────────────────────────────────────────────────────────
  const ZONE_COLORS = { Normal:'#4caf50', 'Room Lock':'#2196f3', 'Zoom Zone':'#ffeb3b', Cinematic:'#9c27b0', 'Boss Arena':'#f44336' };

  // ── Compute effective camera rect (with active zone zoom) ──────────────────
  function getEffectiveCamRect(cam, camX, camY) {
    const baseW = Math.max(1, Number(cam.properties?.width) || 1920);
    const baseH = Math.max(1, Number(cam.properties?.height) || 1080);
    let zoom    = Math.max(0.01, Number(cam.properties?.zoom) || 1);

    // Apply active zone zoom (highest priority zone whose bounds contain cam center)
    const active = zoneNodes()
      .filter(z => {
        const zx=Number(z.transform?.x)||0, zy=Number(z.transform?.y)||0;
        const zw=Number(z.properties?.width)||512, zh=Number(z.properties?.height)||288;
        return camX>=zx&&camX<=zx+zw&&camY>=zy&&camY<=zy+zh;
      })
      .sort((a,b)=>(Number(b.properties?.priority)||0)-(Number(a.properties?.priority)||0));

    if (active.length && active[0].properties?.zoom) {
      zoom = Math.max(0.01, Number(active[0].properties.zoom));
    }
    return { w: baseW, h: baseH, zoom };
  }

  // ── Apply preset look-ahead offset for preview ─────────────────────────────
  function applyPresetOffset(cam) {
    const preset = cam.properties?.cameraPreset || '';
    let ox=0, oy=0;
    if (preset==='Side Scroller'||preset==='Metroidvania')  ox = Number(cam.properties?.lookAheadX)||64;
    if (preset==='Top Down Adventure'||preset==='RPG/JRPG') { ox=(Number(cam.properties?.lookAheadX)||0)*0.25; oy=(Number(cam.properties?.lookAheadY)||0)*0.25; }
    if (preset==='Twin Stick Shooter') { ox=Number(cam.properties?.lookAheadX)||64; oy=Number(cam.properties?.lookAheadY)||32; }
    if (preset==='Shmup') oy=-100;
    return { ox, oy };
  }

  // ── Main render frame ──────────────────────────────────────────────────────
  function frame(ts) {
    if (!_canvas||!_ctx) { _rafId=requestAnimationFrame(frame); return; }
    if (_paused) { _rafId=requestAnimationFrame(frame); return; }
    if (ts-_lastT < FRAME_MS-1) { _rafId=requestAnimationFrame(frame); return; }
    _lastT=ts;

    fitCanvas();
    const cw=_canvas.width, ch=_canvas.height;
    const ctx=_ctx;
    ctx.clearRect(0,0,cw,ch);
    drawChecker(ctx,cw,ch);

    const cam=resolveCamera();
    const noCamEl=document.getElementById(NOCAM_ID);
    const infoEl=document.getElementById(INFO_ID);

    if (!cam) {
      if (noCamEl) noCamEl.style.display='flex';
      if (infoEl) infoEl.textContent='';
      ctx.save(); ctx.fillStyle='rgba(255,255,255,0.08)'; ctx.font='13px monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('No Camera2D in scene',cw/2,ch/2); ctx.restore();
      _rafId=requestAnimationFrame(frame); return;
    }
    if (noCamEl) noCamEl.style.display='none';

    const playbackPos = getPathPlaybackPosition(ts);
    const camX=playbackPos ? playbackPos.x : (Number(cam.transform?.x)||0);
    const camY=playbackPos ? playbackPos.y : (Number(cam.transform?.y)||0);
    const { w: camW, h: camH, zoom } = getEffectiveCamRect(cam, camX, camY);
    const { ox, oy } = applyPresetOffset(cam);
    // camX/camY is the TOP-LEFT of the camera's world view, not the center.
    // viewCX/viewCY are the top-left world coords of what the camera sees.
    const viewCX = camX + ox, viewCY = camY + oy;

    // Compute scale: fit or fixed
    let fitS = Math.min(cw/camW, ch/camH) * zoom;
    if (_previewZoom !== 'fit') fitS = (_previewZoom * Math.min(cw/camW, ch/camH));
    const sx=fitS, sy=fitS;

    const vpW=camW*sx, vpH=camH*sy;
    const vpX=(cw-vpW)/2, vpY=(ch-vpH)/2;
    // World-to-screen: world point p -> screen = (p - viewTopLeft) * scale + vpTopLeft
    // i.e.  screenX = (worldX - viewCX) * sx + vpX
    //        screenY = (worldY - viewCY) * sy + vpY

    ctx.save();
    ctx.beginPath(); ctx.rect(vpX,vpY,vpW,vpH); ctx.clip();
    ctx.fillStyle='#232840'; ctx.fillRect(vpX,vpY,vpW,vpH);
    drawGrid(ctx,viewCX,viewCY,sx,sy,vpX,vpY,vpW,vpH);

    // Camera zones (behind scene content)
    for (const z of zoneNodes()) {
      const zx=Number(z.transform?.x)||0, zy=Number(z.transform?.y)||0;
      const zw=Number(z.properties?.width)||512, zh=Number(z.properties?.height)||288;
      const mode=z.properties?.mode||'Normal';
      const color=ZONE_COLORS[mode]||'#4caf50';
      const sX=(zx-viewCX)*sx+vpX, sY=(zy-viewCY)*sy+vpY;
      const sW=zw*sx, sH=zh*sy;
      fillBox(ctx,sX,sY,sW,sH,hexRgba(color,0.07));
      strokeDash(ctx,sX,sY,sW,sH,color,1,[8,4]);
    }

    for (const path of pathNodes()) {
      const pts = ensurePathPoints(path);
      if (!pts.length) continue;
      const cpe = window.state?.cameraPathEditor;
      const isActive = cpe?.previewPlaying && (cpe._previewNodeId === path.id || cpe.selectedNodeId === path.id);
      ctx.save();
      ctx.strokeStyle = isActive ? '#ffd54f' : (path.id === _pathPlayback.pathId ? '#ffd54f' : '#ff9800');
      ctx.fillStyle = '#ff9800';
      ctx.lineWidth = isActive ? 2.5 : (path.id === _pathPlayback.pathId ? 2 : 1.25);
      ctx.setLineDash([6, 4]);
      if (pts.length >= 2) {
        ctx.beginPath();
        pts.forEach((point, index) => {
          const sxp = (point.x - viewCX) * sx + vpX;
          const syp = (point.y - viewCY) * sy + vpY;
          if (index === 0) ctx.moveTo(sxp, syp); else ctx.lineTo(sxp, syp);
        });
        if (path.properties?.loop && pts.length > 2) ctx.closePath();
        if (path.properties?.closedPath && pts.length > 2) ctx.closePath();
        ctx.stroke();
      }
      ctx.setLineDash([]);
      pts.forEach((point, index) => {
        const sxp = (point.x - viewCX) * sx + vpX;
        const syp = (point.y - viewCY) * sy + vpY;
        ctx.beginPath();
        ctx.fillStyle = index === 0 ? '#4caf50' : index === pts.length - 1 ? '#f44336' : '#ff9800';
        ctx.arc(sxp, syp, index === 0 || index === pts.length - 1 ? 4 : 3, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw animated preview marker in camera preview canvas
      if (isActive && cpe._previewMarker) {
        const mx = (cpe._previewMarker.x - viewCX) * sx + vpX;
        const my = (cpe._previewMarker.y - viewCY) * sy + vpY;
        // Pulse ring
        ctx.beginPath();
        ctx.arc(mx, my, 12, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,212,255,0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.stroke();
        // Camera icon body
        ctx.fillStyle = '#00d4ff';
        ctx.fillRect(mx - 8, my - 5, 16, 10);
        // Lens
        ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fillStyle = '#003060'; ctx.fill();
        ctx.beginPath(); ctx.arc(mx, my, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#00d4ff'; ctx.fill();
        // Progress label
        const total2 = pathLength(pts, cpe.previewLoop || path.properties?.loop || path.properties?.closedPath);
        const pct = total2 > 0 ? Math.round((cpe.previewTime / total2) * 100) : 0;
        ctx.fillStyle = '#00d4ff'; ctx.font = '9px monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(`${pct}%${cpe.previewPaused ? ' ⏸' : ''}`, mx + 12, my);
      }
      ctx.restore();
    }

    // Scene nodes (world-space, inside camera clip)
    const wNodes=visibleWorldNodes().sort((a,b)=>
      (Number(a.properties?.z||a.properties?.layer||0))-(Number(b.properties?.z||b.properties?.layer||0))
    );
    for (const n of wNodes) drawNode(ctx,n,viewCX,viewCY,sx,sy,vpX,vpY);

    ctx.restore(); // end world clip

    // UI nodes (screen-space, overlaid on the viewport rect)
    const uiNodes = visibleUiNodes().sort((a,b)=>
      (Number(a.properties?.z||a.properties?.layer||0))-(Number(b.properties?.z||b.properties?.layer||0))
    );
    if (uiNodes.length > 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(vpX, vpY, vpW, vpH); ctx.clip();
      for (const n of uiNodes) drawUiNode(ctx, n, vpX, vpY, vpW, vpH);
      ctx.restore();
    }

    // Viewport border
    ctx.save(); ctx.strokeStyle='#00d4ff'; ctx.lineWidth=2; ctx.setLineDash([]);
    ctx.strokeRect(vpX,vpY,vpW,vpH); ctx.restore();

    // Dead zone — centered within the viewport rect
    const dzw=Number(cam.properties?.deadzoneWidth)||0, dzh=Number(cam.properties?.deadzoneHeight)||0;
    const dox=Number(cam.properties?.deadzoneOffsetX)||0, doy=Number(cam.properties?.deadzoneOffsetY)||0;
    if (dzw>0&&dzh>0) {
      const dzSW=dzw*sx, dzSH=dzh*sy;
      const dzSX=vpX+vpW/2-dzSW/2+(dox*sx), dzSY=vpY+vpH/2-dzSH/2+(doy*sy);
      fillBox(ctx,dzSX,dzSY,dzSW,dzSH,'rgba(255,179,0,0.07)');
      strokeDash(ctx,dzSX,dzSY,dzSW,dzSH,'#ffb300',1.5,[6,4]);
      ctx.save(); ctx.fillStyle='#ffb300'; ctx.font='10px monospace';
      ctx.textAlign='left'; ctx.textBaseline='top';
      ctx.fillText(`Dead Zone  ${Math.round(dzw)} × ${Math.round(dzh)}`,dzSX+3,dzSY+3); ctx.restore();
    }

    // Look-ahead arrow — from viewport center
    const lax=Number(cam.properties?.lookAheadX)||0, lay=Number(cam.properties?.lookAheadY)||0;
    if (lax!==0||lay!==0) {
      const cx2=vpX+vpW/2, cy2=vpY+vpH/2;
      arrowLine(ctx,cx2,cy2,cx2+lax*sx,cy2+lay*sy,'#ff4081',2);
      ctx.save(); ctx.fillStyle='#ff4081'; ctx.font='10px monospace';
      ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.fillText('Look Ahead',cx2+lax*sx+6,cy2+lay*sy); ctx.restore();
    }

    // Camera bounds
    for (const bn of boundsNodes()) {
      const bx=Number(bn.transform?.x)||0, by=Number(bn.transform?.y)||0;
      const bw=Number(bn.properties?.width)||1024, bh=Number(bn.properties?.height)||768;
      const bSX=(bx-viewCX)*sx+vpX, bSY=(by-viewCY)*sy+vpY;
      const bSW=bw*sx, bSH=bh*sy;
      fillBox(ctx,bSX,bSY,bSW,bSH,'rgba(76,175,80,0.05)');
      strokeDash(ctx,bSX,bSY,bSW,bSH,'#4caf50',2,[12,6]);
      ctx.save(); ctx.fillStyle='#4caf50'; ctx.font='10px monospace';
      ctx.textAlign='left'; ctx.textBaseline='top';
      ctx.fillText(`Camera Bounds  ${Math.round(bw)} × ${Math.round(bh)}`,bSX+4,bSY+4); ctx.restore();
    }

    // CameraTargetGroup debug overlays
    for (const tg of targetGroupNodes()) {
      if (tg.properties?.showDebug !== false) {
        drawCTGOverlay(ctx, tg, viewCX, viewCY, sx, sy, vpX, vpY, vpW, vpH);
      }
    }

    // Overlay info
    if (infoEl) {
      infoEl.textContent=`${cam.name||'Camera'}  ${camW} × ${camH}  Zoom ${zoom.toFixed(2)}${_paused?' [PAUSED]':''}`;
    }


    _rafId=requestAnimationFrame(frame);
  }

  // ── Loop control ───────────────────────────────────────────────────────────
  function startLoop() { if (_rafId===null) _rafId=requestAnimationFrame(frame); }
  function stopLoop()  { if (_rafId!==null) { cancelAnimationFrame(_rafId); _rafId=null; } }

  // ── Persistence ────────────────────────────────────────────────────────────
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ selectedCameraId: selectedCameraId(), previewZoom: _previewZoom })); } catch(_) {}
  }
  function restore() {
    try {
      const d=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
      if (d?.selectedCameraId&&window.state?.cameraPreview) window.state.cameraPreview.selectedCameraId=d.selectedCameraId;
      if (d?.previewZoom) _previewZoom=d.previewZoom;
    } catch(_) {}
  }

  // ── Selector ───────────────────────────────────────────────────────────────
  function refreshSelector() {
    const sel=document.getElementById(SELECTOR_ID);
    if (!sel) return;
    const cams=cam2dNodes(), curId=selectedCameraId();
    const newIds=cams.map(c=>c.id), oldIds=Array.from(sel.options).map(o=>o.value);
    const changed=newIds.length!==oldIds.length||newIds.some((id,i)=>id!==oldIds[i]);
    if (changed) {
      sel.innerHTML='';
      if (!cams.length) {
        const o=document.createElement('option'); o.value=''; o.textContent='— No cameras —'; sel.appendChild(o);
      } else {
        cams.forEach(c => {
          const o=document.createElement('option'); o.value=c.id;
          o.textContent=c.name||`Camera (${c.id.slice(0,6)})`; sel.appendChild(o);
        });
      }
    } else {
      cams.forEach((c,i)=>{ sel.options[i].textContent=c.name||`Camera (${c.id.slice(0,6)})`; });
    }
    let resolvedId=curId&&cams.find(c=>c.id===curId)?curId:null;
    if (!resolvedId&&cams.length) resolvedId=cams.find(c=>c.properties?.current)?.id||cams[0].id;
    if (window.state?.cameraPreview) window.state.cameraPreview.selectedCameraId=resolvedId||null;
    sel.value=resolvedId||'';
  }

  // ── Mount ──────────────────────────────────────────────────────────────────
  function mount() {
    if (_mounted) return;
    _mounted=true;
    restore();
    if (!acquireCanvas()) {
      setTimeout(()=>{ if(acquireCanvas()){attachControls();startLoop();} },300);
      return;
    }
    attachControls(); startLoop();
  }

  function attachControls() {
    if (window.ResizeObserver&&!_resizeObs) {
      const wrap=document.getElementById(WRAP_ID);
      if (wrap) { _resizeObs=new ResizeObserver(fitCanvas); _resizeObs.observe(wrap); }
    }
    const sel=document.getElementById(SELECTOR_ID);
    if (sel&&!sel._cpWired) {
      sel._cpWired=true;
      sel.addEventListener('change',()=>{
        if (window.state?.cameraPreview) window.state.cameraPreview.selectedCameraId=sel.value||null;
        persist();
      });
    }
    const playBtn = document.getElementById(PATH_PLAY_ID);
    if (playBtn && !playBtn._cpPathWired) {
      playBtn._cpPathWired = true;
      playBtn.addEventListener('click', () => {
        const path = resolvePreviewPath();
        const points = ensurePathPoints(path);
        if (!path || !points.length) return;
        _pathPlayback = { active: true, pathId: path.id, distance: 0, lastTs: 0 };
      });
    }
    const stopBtn = document.getElementById(PATH_STOP_ID);
    if (stopBtn && !stopBtn._cpPathWired) {
      stopBtn._cpPathWired = true;
      stopBtn.addEventListener('click', () => {
        _pathPlayback.active = false;
        _pathPlayback.distance = 0;
        _pathPlayback.lastTs = 0;
        // Also stop scene editor transport if active
        if (typeof window.cameraPathPreviewStop === 'function') window.cameraPathPreviewStop();
      });
    }
    // Pause button (may be in Camera Preview panel toolbar)
    const pauseBtn = document.getElementById(PATH_PAUSE_ID);
    if (pauseBtn && !pauseBtn._cpPathWired) {
      pauseBtn._cpPathWired = true;
      pauseBtn.addEventListener('click', () => {
        if (typeof window.cameraPathPreviewPause === 'function') window.cameraPathPreviewPause();
      });
    }
    // Loop button (may be in Camera Preview panel toolbar)
    const loopBtn = document.getElementById(PATH_LOOP_ID);
    if (loopBtn && !loopBtn._cpPathWired) {
      loopBtn._cpPathWired = true;
      loopBtn.addEventListener('click', () => {
        if (typeof window.cameraPathPreviewToggleLoop === 'function') window.cameraPathPreviewToggleLoop();
        loopBtn.classList.toggle('active');
      });
    }
  }

  function unmount() { stopLoop(); _mounted=false; }

  // ── Public API ─────────────────────────────────────────────────────────────
  window.CameraPreviewPanel = {
    mount, unmount,
    refreshCameraList: refreshSelector,
    getSelectedCameraId: selectedCameraId,
    setSelectedCamera(idOrNode) {
      const id=typeof idOrNode==='string'?idOrNode:idOrNode?.id;
      if (window.state?.cameraPreview) window.state.cameraPreview.selectedCameraId=id||null;
      refreshSelector(); persist();
    },
    forceUpdate: refreshSelector,
    setZoom(z) { _previewZoom=z; persist(); },
    togglePause() { _paused=!_paused; return _paused; },
    forceRefresh() { _lastT=0; },
    isPaused() { return _paused; },
    playSelectedPath() {
      const path = resolvePreviewPath();
      if (!path) return false;
      // Prefer scene editor transport
      if (typeof window.cameraPathPreviewPlay === 'function') {
        window.cameraPathPreviewPlay(path.id);
        return true;
      }
      _pathPlayback = { active: true, pathId: path.id, distance: 0, lastTs: 0 };
      return true;
    },
    pausePathPlayback() {
      if (typeof window.cameraPathPreviewPause === 'function') window.cameraPathPreviewPause();
    },
    stopPathPlayback() {
      if (typeof window.cameraPathPreviewStop === 'function') { window.cameraPathPreviewStop(); return; }
      _pathPlayback.active = false;
      _pathPlayback.distance = 0;
      _pathPlayback.lastTs = 0;
    },
    PANEL_ID: 'dock-panel-camera-preview',
  };

})();

// Phase2 completion additions
(function(){window.RGECameraPreviewDiagnostics=function(cam){return {name:(cam&&cam.name)||"",zoom:(cam&&cam.zoom)||1};};window.RGECameraOverlaySettings=window.RGECameraOverlaySettings||{frame:true,deadZone:true,lookAhead:true,bounds:true,labels:true};})();
