(function (root) {
  'use strict';
  const pivots = {
    'top-left': [0, 0], 'top-center': [.5, 0], 'top-right': [1, 0],
    'left-center': [0, .5], center: [.5, .5], 'right-center': [1, .5],
    'bottom-left': [0, 1], 'bottom-center': [.5, 1], 'bottom-right': [1, 1]
  };
  function layout(node, parentWidth, parentHeight, force = false) {
    const p = node.properties || {}, t = node.transform;
    if (!t) return;
    const [al, at, ar, ab, ml, mt, mr, mb] = ['anchorLeft', 'anchorTop', 'anchorRight', 'anchorBottom', 'marginLeft', 'marginTop', 'marginRight', 'marginBottom'].map(k => Number(p[k]) || 0);
    if (!force && [al, at, ar, ab, ml, mt, mr, mb].every(v => v === 0)) return;
    if (al !== ar) p.width = Math.max(1, parentWidth * (ar - al) + mr - ml);
    if (at !== ab) p.height = Math.max(1, parentHeight * (ab - at) + mb - mt);
    const pivot = pivots[t.pivotPreset];
    if (pivot) { t.pivotX = p.width * pivot[0]; t.pivotY = p.height * pivot[1]; }
    const x = (Number(t.pivotX) || 0) * (Number(t.scaleX) || 1);
    const y = (Number(t.pivotY) || 0) * (Number(t.scaleY) || 1);
    const radians = (Number(t.rotation) || 0) * Math.PI / 180;
    t.x = parentWidth * al + ml + x * Math.cos(radians) - y * Math.sin(radians);
    t.y = parentHeight * at + mt + x * Math.sin(radians) + y * Math.cos(radians);
  }
  function preset(node, anchors, parentWidth, parentHeight) {
    const p = node.properties;
    p.anchorPreset = '';
    [p.anchorLeft, p.anchorTop, p.anchorRight, p.anchorBottom] = anchors;
    p.marginLeft = anchors[0] === anchors[2] ? -(Number(p.width) || 0) * anchors[0] : 0;
    p.marginTop = anchors[1] === anchors[3] ? -(Number(p.height) || 0) * anchors[1] : 0;
    p.marginRight = 0;
    p.marginBottom = 0;
    layout(node, parentWidth, parentHeight, true);
  }
  function captureOffsets(node, parentWidth, parentHeight) {
    const p = node.properties || {}, t = node.transform;
    if (!t || !['anchorLeft','anchorTop','anchorRight','anchorBottom','marginLeft','marginTop','marginRight','marginBottom'].some(k => Number(p[k]))) return;
    const r = (Number(t.rotation) || 0) * Math.PI / 180;
    const px = (Number(t.pivotX) || 0) * (Number(t.scaleX) || 1), py = (Number(t.pivotY) || 0) * (Number(t.scaleY) || 1);
    const left = t.x - px * Math.cos(r) + py * Math.sin(r), top = t.y - px * Math.sin(r) - py * Math.cos(r);
    p.marginLeft = left - (Number(p.anchorLeft) || 0) * parentWidth;
    p.marginTop = top - (Number(p.anchorTop) || 0) * parentHeight;
    if (p.anchorLeft !== p.anchorRight) p.marginRight = left + p.width - (Number(p.anchorRight) || 0) * parentWidth;
    if (p.anchorTop !== p.anchorBottom) p.marginBottom = top + p.height - (Number(p.anchorBottom) || 0) * parentHeight;
  }
  function placeInSlot(node, x, y, width, height) {
    const t = node.transform, p = node.properties;
    p.width = width; p.height = height;
    const pivot = pivots[t.pivotPreset];
    if (pivot) { t.pivotX = width * pivot[0]; t.pivotY = height * pivot[1]; }
    t.x = x + (Number(t.pivotX) || 0) * (Number(t.scaleX) || 1);
    t.y = y + (Number(t.pivotY) || 0) * (Number(t.scaleY) || 1);
  }
  function resize(node, start, dx, dy, handle, quantize = v => v, minimum = 8) {
    const t = node.transform, p = node.properties;
    const sx = Number(t.scaleX) || 1, sy = Number(t.scaleY) || 1;
    let width = start.nodeW, height = start.nodeH;
    if (handle.includes('e')) width = quantize(Math.max(minimum, width + dx / sx));
    if (handle.includes('w')) width = quantize(Math.max(minimum, width - dx / sx));
    if (handle.includes('s')) height = quantize(Math.max(minimum, height + dy / sy));
    if (handle.includes('n')) height = quantize(Math.max(minimum, height - dy / sy));
    const left = start.nodeX - start.pivotX * sx + (handle.includes('w') ? (start.nodeW - width) * sx : 0);
    const top = start.nodeY - start.pivotY * sy + (handle.includes('n') ? (start.nodeH - height) * sy : 0);
    p.width = width; p.height = height;
    const pivot = pivots[t.pivotPreset];
    if (pivot) { t.pivotX = width * pivot[0]; t.pivotY = height * pivot[1]; }
    t.x = left + (Number(t.pivotX) || 0) * sx;
    t.y = top + (Number(t.pivotY) || 0) * sy;
  }
  function textureRect(imageWidth, imageHeight, width, height, mode = 'contain', source = {}) {
    const sx = Math.max(0, Number(source.x) || 0), sy = Math.max(0, Number(source.y) || 0);
    let sw = Math.min(Number(source.w) || imageWidth, imageWidth - sx);
    let sh = Math.min(Number(source.h) || imageHeight, imageHeight - sy);
    let x = 0, y = 0, w = width, h = height, cx = sx, cy = sy;
    if (mode === 'contain') {
      const scale = Math.min(width / sw, height / sh);
      w = sw * scale; h = sh * scale; x = (width - w) / 2; y = (height - h) / 2;
    } else if (mode === 'cover') {
      const scale = Math.max(width / sw, height / sh), cropW = width / scale, cropH = height / scale;
      cx += (sw - cropW) / 2; cy += (sh - cropH) / 2; sw = cropW; sh = cropH;
    }
    return { x, y, width: w, height: h, crop: { x: cx, y: cy, width: sw, height: sh } };
  }
  const api = { layout, preset, resize, captureOffsets, textureRect, placeInSlot };
  root.RGELayoutGeometry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
