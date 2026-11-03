globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/**
 * ui_editor.js — RGE Phase 3: UI Snapping, Guides & Layer Management
 *
 * Communicates with scene_editor.js via RGE_ROOT.RGESceneBridge.
 * All snapping/layer/guide data is persisted in editorState.uiMeta.
 *
 * Snap modes:
 *   grid | parentEdge | parentCenter | siblingEdge | siblingCenter | safeArea | guides
 *
 * Layer system:
 *   Layers are definitions (id, name, color, visible, locked, order).
 *   CanvasLayer nodes carry properties.layerDefId linking them to a definition.
 *   Locked layer → no drag/resize/delete/inspector edit.
 *   Hidden layer → not drawn, but saved.
 */

(function () {
  'use strict';

  // ───────────────────────── constants ────────────────────────────────────
  const HANDLE_SIZE   = 8;
  const MIN_NODE_DIM  = 8;
  const SAFE_AREA_PCT = 0.05;
  const CANVAS_BG     = '#10121a';
  const GRID_COL      = 'rgba(255,255,255,0.05)';
  const GUIDE_COL     = 'rgba(64,200,255,0.7)';
  const SAFE_COL      = 'rgba(255,200,50,0.18)';
  const SAFE_STROKE   = 'rgba(255,200,50,0.55)';
  const SEL_STROKE    = '#478cbf';
  const SNAP_COL      = 'rgba(255,80,80,0.9)';     // snap guide lines during drag
  const HANDLE_FILL   = '#478cbf';
  const HANDLE_STROKE = '#141620';
  // v46.16: Keep the UI preview in CSS-pixel space. The canvas backing store
  // may be DPR-scaled for crispness, but all editor hit tests and node math
  // must use the visible CSS size or clicks will miss and the view can look
  // over-zoomed on high-DPI displays.
  const PREVIEW_FIT_SCALE = 0.78;
  const PREVIEW_MAX_SCALE = 1;

  const DEFAULT_LAYER_DEFS = [
    { name: 'Background',    color: '#2a4a7a', order: 0 },
    { name: 'Main Menu',     color: '#4a2a7a', order: 1 },
    { name: 'Dialogs',       color: '#2a6a4a', order: 2 },
    { name: 'HUD',           color: '#7a4a2a', order: 3 },
    { name: 'Transitions',   color: '#6a6a2a', order: 4 },
    { name: 'Debug Overlay', color: '#5a2a2a', order: 5 },
  ];

  const RESOLUTIONS = {
    '1280x720':  { w: 1280, h: 720  },
    '1920x1080': { w: 1920, h: 1080 },
    '960x540':   { w: 960,  h: 540  },
    '640x360':   { w: 640,  h: 360  },
  };

  // ───────────────────────── module state ─────────────────────────────────
  let _active  = false;
  let _canvas  = null;
  let _ctx     = null;
  let _wrap    = null;
  let _rafId   = null;
  let _dirty   = true;
  let _initialized = false;
  let _observerInstalled = false;
  let _resizeObserver = null;

  // Active snap lines drawn this frame: [{x1,y1,x2,y2}]
  let _snapLines = [];

  // Interaction state
  const _drag = {
    mode:   null,   // null | 'move' | 'resize' | 'guide'
    handle: null,   // 'nw'|'ne'|... for resize; 'h'|'v' for guide
    guideId: null,
    start:  null,
    // { px, py, nodeX, nodeY, nodeW, nodeH }
  };

  // Guide dragging from ruler (not yet placed)
  let _pendingGuide = null;

  // ───────────────────────── bridge helpers ────────────────────────────────
  // bridge → RGE_ROOT.RGEEditorBridge.bridge (shared, see editor/editor_bridge.js)
  const bridge = () => RGE_ROOT.RGEEditorBridge ? RGE_ROOT.RGEEditorBridge.bridge() : (RGE_ROOT.RGESceneBridge || null);
  function getNodes()  { return bridge()?.getNodes() ?? []; }
  function getNode(id) { return bridge()?.getNode(id) ?? null; }
  function selectedId() { return bridge()?.getSelectedId() ?? null; }
  function selectedNode() { const id = selectedId(); return id ? getNode(id) : null; }

  function uiNodes() {
    const b = bridge(); if (!b) return [];
    return getNodes().filter(n => b.isUiNodeType(n.type));
  }

  // ───────────────────────── uiMeta persistence ────────────────────────────
  // uiMeta lives in editorState so it serialises with the scene.

  function getUiMeta() {
    const b = bridge(); if (!b) return _defaultUiMeta();
    const es = b.getEditorState?.() ?? {};
    if (!es.uiMeta || typeof es.uiMeta !== 'object') {
      es.uiMeta = _defaultUiMeta();
      b.setEditorStateProp?.('uiMeta', es.uiMeta);
    }
    return es.uiMeta;
  }

  function _defaultUiMeta() {
    return {
      snap: {
        enabled:      false,
        gridSize:     8,
        showGrid:     true,
        showGuides:   true,
        tolerance:    6,
        modes: {
          grid:          true,
          parentEdge:    true,
          parentCenter:  false,
          siblingEdge:   true,
          siblingCenter: false,
          safeArea:      true,
          guides:        true,
        }
      },
      showSafeArea: false,
      resolution:   '1280x720',
      guides:       [],     // [{id, axis:'h'|'v', pos:number}]
      layers:       [],     // layer definitions (NOT CanvasLayer nodes)
    };
  }

  function saveUiMeta(meta) {
    const b = bridge(); if (!b) return;
    b.setEditorStateProp?.('uiMeta', meta);
  }

  // Ensure default layer definitions exist on first use
  function ensureDefaultLayers(meta) {
    if (Array.isArray(meta.layers) && meta.layers.length > 0) return;
    meta.layers = DEFAULT_LAYER_DEFS.map((def, i) => ({
      id:      'layer_' + (Date.now() + i),
      name:    def.name,
      color:   def.color,
      visible: true,
      locked:  false,
      order:   def.order,
    }));
  }

  // Get layer def for a CanvasLayer node (by layerDefId or by order match)
  function getLayerDef(node, meta) {
    if (!Array.isArray(meta.layers)) return null;
    const lid = node.properties?.layerDefId;
    if (lid) return meta.layers.find(l => l.id === lid) || null;
    return null;
  }

  // Is the selected node on a locked layer?
  function isNodeLocked(node, meta) {
    if (!node) return false;
    if (node.locked) return true;
    // Walk up to find owning CanvasLayer
    const canvasLayer = _findOwningCanvasLayer(node);
    if (canvasLayer) {
      const def = getLayerDef(canvasLayer, meta);
      if (def && def.locked) return true;
    }
    // If node IS a CanvasLayer
    if (node.type === 'CanvasLayer') {
      const def = getLayerDef(node, meta);
      if (def && def.locked) return true;
    }
    return false;
  }

  function isNodeHiddenByLayer(node, meta) {
    const canvasLayer = node.type === 'CanvasLayer' ? node : _findOwningCanvasLayer(node);
    if (canvasLayer) {
      const def = getLayerDef(canvasLayer, meta);
      if (def && def.visible === false) return true;
    }
    return false;
  }

  // ───────────────────────── layout containers ─────────────────────────────
  // Types whose children are fully position/size-controlled by the container.
  const LAYOUT_CONTAINER_TYPES = new Set(['HBoxContainer', 'VBoxContainer', 'MarginContainer', 'ScrollContainer']);

  // Returns true if this node's position/size is controlled by a layout container parent.
  function isLayoutControlled(node) {
    if (!node || !node.parentId) return false;
    const parent = getNode(node.parentId);
    return !!parent && LAYOUT_CONTAINER_TYPES.has(parent.type);
  }

  // ── Anchor layout ────────────────────────────────────────────────────────
  // Reads anchorLeft/Top/Right/Bottom + marginLeft/Top/Right/Bottom on every
  // UI node and computes its transform.x/y and properties.width/height from
  // the parent's dimensions. This mirrors Godot's Control anchor system.
  //
  // Parent space: if the node's parent is a UI node, use parent.properties.width/height.
  //              if the parent is a CanvasLayer (or none), use the preview resolution.
  function applyAnchorLayout() {
    const meta = getUiMeta();
    const { w: resW, h: resH } = previewRes(meta);
    const all  = getNodes();
    const byId = new Map(all.map(n => [n.id, n]));

    for (const node of all) {
      const p = node.properties;
      if (!p) continue;

      // Only process nodes that have anchor properties (all UI nodes do after migration)
      const aL = Number(p.anchorLeft   ?? 0);
      const aT = Number(p.anchorTop    ?? 0);
      const aR = Number(p.anchorRight  ?? 0);
      const aB = Number(p.anchorBottom ?? 0);
      const mL = Number(p.marginLeft   ?? 0);
      const mT = Number(p.marginTop    ?? 0);
      const mR = Number(p.marginRight  ?? 0);
      const mB = Number(p.marginBottom ?? 0);

      // Skip nodes with all-zero anchors — they use manual transform.x/y
      if (aL === 0 && aT === 0 && aR === 0 && aB === 0 &&
          mL === 0 && mT === 0 && mR === 0 && mB === 0) continue;

      // Determine parent dimensions
      const parent = node.parentId ? byId.get(node.parentId) : null;
      let pw, ph;
      if (parent && parent.type !== 'CanvasLayer' && parent.properties?.width != null) {
        pw = Math.max(1, Number(parent.properties.width));
        ph = Math.max(1, Number(parent.properties.height));
      } else {
        // Root node or child of CanvasLayer — use canvas resolution as parent space
        pw = resW;
        ph = resH;
      }

      // Compute edges in parent space
      const left   = pw * aL + mL;
      const top    = ph * aT + mT;
      const right  = pw * aR + mR;
      const bottom = ph * aB + mB;

      const newX = left;
      const newY = top;
      const newW = Math.max(1, right - left);
      const newH = Math.max(1, bottom - top);

      // Only write if anchors actually constrain size/position
      // (i.e. when left !== right or top !== bottom in anchor space)
      node.transform.x   = Math.round(newX);
      node.transform.y   = Math.round(newY);
      // Only override width/height when anchors create a meaningful span
      if (aL !== aR || mL !== 0 || mR !== 0) {
        p.width  = newW;
      }
      if (aT !== aB || mT !== 0 || mB !== 0) {
        p.height = newH;
      }
    }
  }

  // Apply Godot-style layout to all layout containers in the scene.
  // Called after any structural change (add/delete node, resize container, change separation).
  function applyContainerLayout() {
    const all = getNodes();
    const byId = new Map(all.map(n => [n.id, n]));

    // Collect all layout containers — process parents before children
    // so nested containers are laid out in the correct order.
    const containers = all.filter(n => LAYOUT_CONTAINER_TYPES.has(n.type));

    for (const container of containers) {
      const children = all.filter(n => n.parentId === container.id);
      if (!children.length) continue;

      const cw = Math.max(1, Number(container.properties?.width  ?? 0));
      const ch = Math.max(1, Number(container.properties?.height ?? 0));

      if (container.type === 'HBoxContainer') {
        const sep       = Math.max(0, Number(container.properties?.separation ?? 4));
        const alignment = container.properties?.alignment || 'begin';
        const totalSep  = sep * Math.max(0, children.length - 1);
        const available = Math.max(0, cw - totalSep);   // space for child widths

        // Each child's natural width (minimum 1)
        const naturalWidths = children.map(c => Math.max(1, Number(c.properties?.width  ?? 80)));
        const totalNatural  = naturalWidths.reduce((s, w) => s + w, 0);

        // Scale all children proportionally if they overflow the available space.
        // If they fit, honour their natural widths (no growing — Godot default without expand).
        const scale = totalNatural > available && totalNatural > 0
          ? available / totalNatural
          : 1;

        const finalWidths = naturalWidths.map(w => Math.max(1, Math.round(w * scale)));
        const totalFinal  = finalWidths.reduce((s, w) => s + w, 0);

        // Compute cursor start based on alignment
        let cursor;
        if      (alignment === 'center') cursor = Math.round((cw - totalFinal - totalSep) / 2);
        else if (alignment === 'end')    cursor = cw - totalFinal - totalSep;
        else                             cursor = 0;  // begin

        children.forEach((child, i) => {
          child.transform.x        = Math.round(cursor);
          child.transform.y        = 0;
          child.properties.width   = finalWidths[i];
          child.properties.height  = ch;           // cross-axis: fill container height
          cursor += finalWidths[i] + sep;
        });

      } else if (container.type === 'VBoxContainer') {
        const sep       = Math.max(0, Number(container.properties?.separation ?? 4));
        const alignment = container.properties?.alignment || 'begin';
        const totalSep  = sep * Math.max(0, children.length - 1);
        const available = Math.max(0, ch - totalSep);   // space for child heights

        // Each child's natural height (minimum 1)
        const naturalHeights = children.map(c => Math.max(1, Number(c.properties?.height ?? 40)));
        const totalNatural   = naturalHeights.reduce((s, h) => s + h, 0);

        // Scale proportionally if children overflow the available space.
        const scale = totalNatural > available && totalNatural > 0
          ? available / totalNatural
          : 1;

        const finalHeights = naturalHeights.map(h => Math.max(1, Math.round(h * scale)));
        const totalFinal   = finalHeights.reduce((s, h) => s + h, 0);

        // Compute cursor start based on alignment
        let cursor;
        if      (alignment === 'center') cursor = Math.round((ch - totalFinal - totalSep) / 2);
        else if (alignment === 'end')    cursor = ch - totalFinal - totalSep;
        else                             cursor = 0;  // begin

        children.forEach((child, i) => {
          child.transform.x        = 0;
          child.transform.y        = Math.round(cursor);
          child.properties.width   = cw;           // cross-axis: fill container width
          child.properties.height  = finalHeights[i];
          cursor += finalHeights[i] + sep;
        });

      } else if (container.type === 'MarginContainer') {
        const pL = Math.max(0, Number(container.properties?.paddingLeft   ?? 8));
        const pT = Math.max(0, Number(container.properties?.paddingTop    ?? 8));
        const pR = Math.max(0, Number(container.properties?.paddingRight  ?? 8));
        const pB = Math.max(0, Number(container.properties?.paddingBottom ?? 8));
        const innerW = Math.max(1, cw - pL - pR);
        const innerH = Math.max(1, ch - pT - pB);
        // All children fill the inner area (Godot: MarginContainer forces single child to fill)
        for (const child of children) {
          child.transform.x        = pL;
          child.transform.y        = pT;
          child.properties.width   = innerW;
          child.properties.height  = innerH;
        }

      } else if (container.type === 'ScrollContainer') {
        const offX = Number(container.properties?.scrollOffsetX ?? 0);
        const offY = Number(container.properties?.scrollOffsetY ?? 0);
        // Children are placed at -offset; their own size is respected
        for (const child of children) {
          child.transform.x = -offX;
          child.transform.y = -offY;
        }
      }
    }
    // After container layout is resolved, apply anchor constraints
    applyAnchorLayout();
  }

  function _findOwningCanvasLayer(node) {
    let cur = node;
    const all = getNodes();
    const byId = new Map(all.map(n => [n.id, n]));
    let depth = 0;
    while (cur && depth < 20) {
      if (!cur.parentId) break;
      const parent = byId.get(cur.parentId);
      if (!parent) break;
      if (parent.type === 'CanvasLayer') return parent;
      cur = parent; depth++;
    }
    return null;
  }

  function _setDescendantsVisible(parentNode, visible) {
    const all = getNodes();
    // Build child map
    const childMap = new Map();
    for (const n of all) {
      if (n.parentId) {
        if (!childMap.has(n.parentId)) childMap.set(n.parentId, []);
        childMap.get(n.parentId).push(n);
      }
    }
    // Walk all descendants and set visible
    function walk(nodeId) {
      const children = childMap.get(nodeId) || [];
      for (const child of children) {
        child.visible = visible;
        walk(child.id);
      }
    }
    walk(parentNode.id);
  }

  // ───────────────────────── resolution / preview ──────────────────────────
  function previewRes(meta) {
    const key = (meta || getUiMeta()).resolution || '1280x720';
    return RESOLUTIONS[key] || { w: 1280, h: 720 };
  }

  function canvasDpr() {
    // Clamp to a sane range: enough pixels for crisp editor text/handles, but
    // not so many that dock resizing tanks slower machines.
    return Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  }

  function configureCanvasContext() {
    if (!_ctx) return;
    const dpr = canvasDpr();
    _ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    _ctx.imageSmoothingEnabled = false;
    if ('mozImageSmoothingEnabled' in _ctx) _ctx.mozImageSmoothingEnabled = false;
    if ('webkitImageSmoothingEnabled' in _ctx) _ctx.webkitImageSmoothingEnabled = false;
    if ('msImageSmoothingEnabled' in _ctx) _ctx.msImageSmoothingEnabled = false;
  }

  function logicalCanvasSize() {
    if (!_canvas) return { w: 1, h: 1 };
    const rect = _canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width || _canvas.clientWidth || 1);
    const h = Math.max(1, rect.height || _canvas.clientHeight || 1);
    return { w, h };
  }

  function previewRect() {
    if (!_canvas) return { x: 0, y: 0, w: 0, h: 0, scale: 1 };
    const { w: cw, h: ch } = logicalCanvasSize();
    const { w, h } = previewRes();
    const fit = Math.min(cw / w, ch / h);
    const scale = Math.max(0.05, Math.min(PREVIEW_MAX_SCALE, fit * PREVIEW_FIT_SCALE));
    const pw = w * scale, ph = h * scale;
    return { x: Math.round((cw - pw) / 2), y: Math.round((ch - ph) / 2), w: pw, h: ph, scale };
  }

  // Shared node-by-id map, rebuilt once per draw frame and reused for all
  // nodeScreenRect calls within that frame. Pointer events rebuild on demand.
  let _nodeByIdCache = null;
  function _getNodeByIdMap() {
    if (!_nodeByIdCache) _nodeByIdCache = new Map(getNodes().map(n => [n.id, n]));
    return _nodeByIdCache;
  }
  function _invalidateNodeCache() { _nodeByIdCache = null; }

  // Returns the absolute logical position of a node by walking up ancestors.
  // Accepts an optional pre-built map to avoid redundant getNodes() calls.
  function nodeAbsPos(node, byId) {
    const map = byId || _getNodeByIdMap();
    let ax = 0, ay = 0, cur = node, depth = 0;
    while (cur && depth++ < 32) {
      ax += Number(cur.transform?.x ?? 0);
      ay += Number(cur.transform?.y ?? 0);
      const par = map.get(cur.parentId);
      if (!par || par.type === 'CanvasLayer') break;
      cur = par;
    }
    return { x: ax, y: ay };
  }

  function nodeScreenRect(node, byId) {
    const pr  = previewRect();
    const abs = nodeAbsPos(node, byId);
    const w   = Math.max(1, Number(node.properties?.width  ?? 80));
    const h   = Math.max(1, Number(node.properties?.height ?? 40));
    return { x: pr.x + abs.x * pr.scale, y: pr.y + abs.y * pr.scale, w: w * pr.scale, h: h * pr.scale };
  }

  // ───────────────────────── snapping ─────────────────────────────────────
  function snap(rawX, rawY, nodeW, nodeH, nodeId) {
    const meta = getUiMeta();
    const s    = meta.snap;
    if (!s.enabled) return { x: Math.round(rawX), y: Math.round(rawY), lines: [] };

    const tol  = Number(s.tolerance) || 6;
    const { w: resW, h: resH } = previewRes(meta);
    const lines = [];

    let bestX = rawX, bestY = rawY;
    let dxBest = tol + 1, dyBest = tol + 1;

    // Candidate snap points: { v: value, axis:'x'|'y', label }
    const snapXCands = [];
    const snapYCands = [];

    // 1 — grid
    if (s.modes.grid && s.gridSize >= 1) {
      const gs = s.gridSize;
      snapXCands.push({ v: Math.round(rawX / gs) * gs, label: 'grid' });
      snapYCands.push({ v: Math.round(rawY / gs) * gs, label: 'grid' });
      // also align right edge
      const rx = Math.round((rawX + nodeW) / gs) * gs - nodeW;
      snapXCands.push({ v: rx, label: 'grid-r' });
      const by = Math.round((rawY + nodeH) / gs) * gs - nodeH;
      snapYCands.push({ v: by, label: 'grid-b' });
    }

    // 2 — safe area
    if (s.modes.safeArea) {
      const sa = SAFE_AREA_PCT;
      const sl = resW * sa, st = resH * sa;
      const sr = resW * (1 - sa), sb = resH * (1 - sa);
      snapXCands.push({ v: sl,         label: 'safe-l' });
      snapXCands.push({ v: sr - nodeW, label: 'safe-r' });
      snapXCands.push({ v: (resW - nodeW) / 2, label: 'safe-cx' });
      snapYCands.push({ v: st,         label: 'safe-t' });
      snapYCands.push({ v: sb - nodeH, label: 'safe-b' });
      snapYCands.push({ v: (resH - nodeH) / 2, label: 'safe-cy' });
    }

    // 3 — parent edges/center
    const selNode = nodeId ? getNode(nodeId) : null;
    if (selNode) {
      const parentId = selNode.parentId;
      const parent   = parentId ? getNode(parentId) : null;
      if (parent && bridge()?.isUiNodeType(parent.type)) {
        const pw = Number(parent.properties?.width  ?? resW);
        const ph = Number(parent.properties?.height ?? resH);
        const px = Number(parent.transform?.x ?? 0);
        const py = Number(parent.transform?.y ?? 0);
        if (s.modes.parentEdge) {
          snapXCands.push({ v: px,              label: 'par-l' });
          snapXCands.push({ v: px + pw - nodeW, label: 'par-r' });
          snapYCands.push({ v: py,              label: 'par-t' });
          snapYCands.push({ v: py + ph - nodeH, label: 'par-b' });
        }
        if (s.modes.parentCenter) {
          snapXCands.push({ v: px + (pw - nodeW) / 2, label: 'par-cx' });
          snapYCands.push({ v: py + (ph - nodeH) / 2, label: 'par-cy' });
        }
      }
    }

    // 4 — sibling edges/center
    if (s.modes.siblingEdge || s.modes.siblingCenter) {
      const siblingNodes = uiNodes().filter(n =>
        n.id !== nodeId && n.parentId === (selNode?.parentId) && n.type !== 'CanvasLayer'
      );
      for (const sib of siblingNodes) {
        const sx2 = Number(sib.transform?.x ?? 0);
        const sy2 = Number(sib.transform?.y ?? 0);
        const sw  = Number(sib.properties?.width  ?? 80);
        const sh  = Number(sib.properties?.height ?? 40);
        if (s.modes.siblingEdge) {
          snapXCands.push({ v: sx2,         label: 'sib-l' });
          snapXCands.push({ v: sx2 + sw,    label: 'sib-r' });
          snapXCands.push({ v: sx2 + sw - nodeW, label: 'sib-re' });
          snapYCands.push({ v: sy2,         label: 'sib-t' });
          snapYCands.push({ v: sy2 + sh,    label: 'sib-b' });
          snapYCands.push({ v: sy2 + sh - nodeH, label: 'sib-be' });
        }
        if (s.modes.siblingCenter) {
          snapXCands.push({ v: sx2 + (sw - nodeW) / 2, label: 'sib-cx' });
          snapYCands.push({ v: sy2 + (sh - nodeH) / 2, label: 'sib-cy' });
        }
      }
    }

    // 5 — custom guides
    if (s.modes.guides && Array.isArray(meta.guides)) {
      for (const g of meta.guides) {
        if (g.axis === 'v') snapXCands.push({ v: g.pos,         label: 'guide' });
        if (g.axis === 'v') snapXCands.push({ v: g.pos - nodeW, label: 'guide-r' });
        if (g.axis === 'h') snapYCands.push({ v: g.pos,         label: 'guide' });
        if (g.axis === 'h') snapYCands.push({ v: g.pos - nodeH, label: 'guide-b' });
      }
    }

    // Choose closest candidates
    for (const cand of snapXCands) {
      const d = Math.abs(rawX - cand.v);
      if (d < dxBest) { dxBest = d; bestX = cand.v; }
    }
    for (const cand of snapYCands) {
      const d = Math.abs(rawY - cand.v);
      if (d < dyBest) { dyBest = d; bestY = cand.v; }
    }

    // Build snap lines through the node's centre point in absolute game-space → screen
    const pr = previewRect();
    // bestX/bestY are in local (parent-relative) coords. Convert to absolute for screen mapping.
    const selNode2 = nodeId ? getNode(nodeId) : null;
    const parentId2 = selNode2?.parentId ?? null;
    const parentAbs2 = parentId2 ? nodeAbsPos(getNode(parentId2) || {}) : { x: 0, y: 0 };
    const absX = bestX + parentAbs2.x;
    const absY = bestY + parentAbs2.y;
    const centerXScreen = pr.x + (absX + nodeW / 2) * pr.scale;
    const centerYScreen = pr.y + (absY + nodeH / 2) * pr.scale;
    if (dxBest <= tol) {
      lines.push({ x1: centerXScreen, y1: pr.y, x2: centerXScreen, y2: pr.y + pr.h });
    }
    if (dyBest <= tol) {
      lines.push({ x1: pr.x, y1: centerYScreen, x2: pr.x + pr.w, y2: centerYScreen });
    }

    return { x: Math.round(bestX), y: Math.round(bestY), lines };
  }

  // Simple single-axis grid snap (for grid-only paths like resize)
  function snapVal(v) {
    const meta = getUiMeta();
    const s    = meta.snap;
    if (!s.enabled || !s.modes.grid || s.gridSize < 1) return Math.round(v);
    return Math.round(v / s.gridSize) * s.gridSize;
  }

  // ───────────────────────── handles ──────────────────────────────────────
  function getHandles(sr) {
    const hs = HANDLE_SIZE;
    const { x, y, w, h } = sr;
    return {
      nw: { x: x-hs/2,     y: y-hs/2,     cursor:'nw-resize' },
      n:  { x: x+w/2-hs/2, y: y-hs/2,     cursor:'n-resize'  },
      ne: { x: x+w-hs/2,   y: y-hs/2,     cursor:'ne-resize' },
      e:  { x: x+w-hs/2,   y: y+h/2-hs/2, cursor:'e-resize'  },
      se: { x: x+w-hs/2,   y: y+h-hs/2,   cursor:'se-resize' },
      s:  { x: x+w/2-hs/2, y: y+h-hs/2,   cursor:'s-resize'  },
      sw: { x: x-hs/2,     y: y+h-hs/2,   cursor:'sw-resize' },
      w:  { x: x-hs/2,     y: y+h/2-hs/2, cursor:'w-resize'  },
    };
  }

  function hitHandle(sx, sy, sr) {
    const handles = getHandles(sr);
    const hs = HANDLE_SIZE;
    for (const [key, h] of Object.entries(handles)) {
      if (sx >= h.x && sx <= h.x+hs && sy >= h.y && sy <= h.y+hs) return key;
    }
    return null;
  }

  function hitNode(sx, sy, node) {
    const sr = nodeScreenRect(node);
    return sx >= sr.x && sx <= sr.x+sr.w && sy >= sr.y && sy <= sr.y+sr.h;
  }

  // ───────────────────────── node colors ──────────────────────────────────
  const NODE_COLORS = {
    CanvasLayer:    { fill:'rgba(60,40,120,0.18)',  stroke:'#6a3fa0' },
    Control:        { fill:'rgba(40,60,100,0.18)',  stroke:'#4a6aaa' },
    Panel:          { fill:'rgba(38,50,71,0.85)',   stroke:'#5e7594' },
    Label:          { fill:'rgba(20,30,50,0.7)',    stroke:'#4a90d9' },
    TextureRect:    { fill:'rgba(20,40,60,0.7)',    stroke:'#7dc4ff' },
    Button:         { fill:'rgba(55,90,127,0.85)',  stroke:'#5b8def' },
    CircleButton:   { fill:'rgba(55,90,127,0.85)',  stroke:'#5b8def' },
    TriangleButton: { fill:'rgba(55,90,127,0.85)',  stroke:'#5b8def' },
    OvalButton:     { fill:'rgba(55,90,127,0.85)',  stroke:'#5b8def' },
    NineSlicePanel: { fill:'rgba(80,40,120,0.45)',  stroke:'#b464ff' },
    MenuList:       { fill:'rgba(38,50,71,0.85)',   stroke:'#7b8ca8' },
    ProgressBar:    { fill:'rgba(26,38,56,0.85)',   stroke:'#4a90d9' },
  };

  // ───────────────────────── draw frame ───────────────────────────────────
  function drawFrame() {
    if (!_ctx || !_canvas) return;
    const meta = getUiMeta();
    const s    = meta.snap;
    const pr   = previewRect();
    const { w: resW, h: resH } = previewRes(meta);
    const { w: cw, h: ch } = logicalCanvasSize();
    const ctx  = _ctx;

    configureCanvasContext();
    ctx.save();

    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, cw, ch);

    // TV shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur  = 24;
    ctx.fillStyle   = '#181c28';
    ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
    ctx.restore();

    // Clip to preview
    ctx.save();
    ctx.beginPath();
    ctx.rect(pr.x, pr.y, pr.w, pr.h);
    ctx.clip();

    // Grid
    if (s.showGrid && s.gridSize >= 4) {
      const gs = s.gridSize * pr.scale;
      ctx.strokeStyle = GRID_COL;
      ctx.lineWidth   = 0.5;
      for (let gx = pr.x; gx <= pr.x + pr.w; gx += gs) {
        ctx.beginPath(); ctx.moveTo(gx, pr.y); ctx.lineTo(gx, pr.y+pr.h); ctx.stroke();
      }
      for (let gy = pr.y; gy <= pr.y + pr.h; gy += gs) {
        ctx.beginPath(); ctx.moveTo(pr.x, gy); ctx.lineTo(pr.x+pr.w, gy); ctx.stroke();
      }
    }

    // Safe-area overlay
    if (meta.showSafeArea) {
      const sa = SAFE_AREA_PCT;
      const sx = pr.x + resW * sa * pr.scale;
      const sy = pr.y + resH * sa * pr.scale;
      const sw = pr.w - 2 * resW * sa * pr.scale;
      const sh = pr.h - 2 * resH * sa * pr.scale;
      ctx.save();
      ctx.strokeStyle = SAFE_STROKE;
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.setLineDash([]);
      ctx.fillStyle = SAFE_COL;
      ctx.fillRect(pr.x, pr.y, pr.w, sy-pr.y);
      ctx.fillRect(pr.x, sy+sh, pr.w, pr.y+pr.h-sy-sh);
      ctx.fillRect(pr.x, sy, sx-pr.x, sh);
      ctx.fillRect(sx+sw, sy, pr.x+pr.w-sx-sw, sh);
      ctx.restore();
    }

    // Custom guides (inside clip)
    if (s.showGuides && Array.isArray(meta.guides)) {
      ctx.strokeStyle = GUIDE_COL;
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 4]);
      for (const g of meta.guides) {
        if (g.axis === 'v') {
          const gx = pr.x + g.pos * pr.scale;
          ctx.beginPath(); ctx.moveTo(gx, pr.y); ctx.lineTo(gx, pr.y+pr.h); ctx.stroke();
        } else {
          const gy = pr.y + g.pos * pr.scale;
          ctx.beginPath(); ctx.moveTo(pr.x, gy); ctx.lineTo(pr.x+pr.w, gy); ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    }

    // Pending guide being dragged from ruler
    if (_pendingGuide) {
      const pg = _pendingGuide;
      ctx.strokeStyle = GUIDE_COL;
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([6, 3]);
      if (pg.axis === 'v') {
        const gx = pg.screenPos;
        ctx.beginPath(); ctx.moveTo(gx, pr.y); ctx.lineTo(gx, pr.y+pr.h); ctx.stroke();
      } else {
        const gy = pg.screenPos;
        ctx.beginPath(); ctx.moveTo(pr.x, gy); ctx.lineTo(pr.x+pr.w, gy); ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Draw nodes — hidden-layer nodes are skipped
    const allUi = uiNodes().filter(n => n.visible !== false && !isNodeHiddenByLayer(n, meta));
    // Hierarchical draw: parent always before child so child renders on top.
    const _uiIds = new Set(allUi.map(n => n.id));
    const _kids  = new Map();
    for (const n of allUi) {
      if (n.parentId && _uiIds.has(n.parentId)) {
        if (!_kids.has(n.parentId)) _kids.set(n.parentId, []);
        _kids.get(n.parentId).push(n);
      }
    }
    for (const arr of _kids.values()) arr.sort((a,b) => Number(a.zIndex??0)-Number(b.zIndex??0));
    const _uiRoots = allUi.filter(n => !n.parentId || !_uiIds.has(n.parentId)).sort((a,b) => {
      const dl = Number(a.properties?.layer??0)-Number(b.properties?.layer??0);
      return dl || Number(a.zIndex??0)-Number(b.zIndex??0);
    });
    // Invalidate and prime the node-map cache once for the entire draw pass.
    _invalidateNodeCache();
    const _byId = _getNodeByIdMap();
    const _paintNode = n => { drawNode(ctx, n, pr, meta, _byId); (_kids.get(n.id)||[]).forEach(_paintNode); };
    for (const r of _uiRoots) _paintNode(r);

    ctx.restore(); // unclip

    // Border
    ctx.strokeStyle = '#3a3f52';
    ctx.lineWidth   = 1;
    ctx.strokeRect(pr.x+0.5, pr.y+0.5, pr.w-1, pr.h-1);

    // Resolution label
    ctx.fillStyle = 'rgba(100,110,140,0.7)';
    ctx.font      = '11px "Noto Sans", sans-serif';
    ctx.fillText(`${resW}×${resH}`, pr.x+6, pr.y+pr.h+14);

    // Ruler strips
    _drawRulers(ctx, pr, resW, resH);

    // Snap lines (drawn over everything, outside clip)
    if (_snapLines.length) {
      ctx.strokeStyle = SNAP_COL;
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 3]);
      for (const ln of _snapLines) {
        ctx.beginPath(); ctx.moveTo(ln.x1, ln.y1); ctx.lineTo(ln.x2, ln.y2); ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Selection (outside clip so handles are always visible)
    const selNode = selectedNode();
    if (selNode && !isNodeHiddenByLayer(selNode, meta) && bridge()?.isUiNodeType(selNode.type)) {
      drawSelection(ctx, selNode, meta, _byId);
    }

    ctx.restore();
  }

  const RULER_SIZE = 16;

  function _drawRulers(ctx, pr, resW, resH) {
    ctx.fillStyle = 'rgba(20,22,32,0.85)';
    ctx.fillRect(pr.x, pr.y - RULER_SIZE, pr.w, RULER_SIZE);  // top ruler
    ctx.fillRect(pr.x - RULER_SIZE, pr.y, RULER_SIZE, pr.h);  // left ruler

    ctx.fillStyle = 'rgba(120,130,160,0.6)';
    ctx.font = '8px "Noto Sans", sans-serif';
    ctx.textBaseline = 'middle';

    const step = rulerStep(pr.scale);
    // Horizontal ticks
    for (let v = 0; v <= resW; v += step) {
      const sx = pr.x + v * pr.scale;
      ctx.fillStyle = 'rgba(100,110,150,0.5)';
      ctx.fillRect(sx, pr.y - 5, 0.5, 5);
      if (v % (step * 2) === 0) {
        ctx.fillStyle = 'rgba(140,150,180,0.7)';
        ctx.fillText(String(v), sx + 2, pr.y - RULER_SIZE/2);
      }
    }
    // Vertical ticks
    for (let v = 0; v <= resH; v += step) {
      const sy = pr.y + v * pr.scale;
      ctx.fillStyle = 'rgba(100,110,150,0.5)';
      ctx.fillRect(pr.x - 5, sy, 5, 0.5);
    }
    ctx.textBaseline = 'alphabetic';
  }

  function rulerStep(scale) {
    if (scale > 0.6) return 50;
    if (scale > 0.3) return 100;
    return 200;
  }

  function drawNode(ctx, node, pr, meta, byId) {
    const sr  = nodeScreenRect(node, byId);
    const col = NODE_COLORS[node.type] || { fill:'rgba(40,50,70,0.7)', stroke:'#5e7594' };
    const op  = Math.max(0, Math.min(1, Number(node.properties?.opacity ?? 1)));

    // Layer-color tint for CanvasLayer nodes
    let layerStroke = null;
    if (node.type === 'CanvasLayer') {
      const def = getLayerDef(node, meta);
      if (def) layerStroke = def.color;
    }

    ctx.save();
    ctx.globalAlpha = op;

    // Shape buttons handle their own background — skip the default fillRect
    const _isShapeBtn = node.type === 'CircleButton' || node.type === 'TriangleButton' || node.type === 'OvalButton';
    if (!_isShapeBtn) {
      ctx.fillStyle = node.properties?.color ? hexToRgba(node.properties.color, op) : col.fill;
      ctx.fillRect(sr.x, sr.y, sr.w, sr.h);
    }

    switch (node.type) {
      case 'CanvasLayer':
        ctx.strokeStyle = layerStroke || col.stroke;
        ctx.setLineDash([8, 4]);
        ctx.lineWidth = 2;
        ctx.strokeRect(sr.x, sr.y, sr.w, sr.h);
        ctx.setLineDash([]);
        ctx.fillStyle = layerStroke || col.stroke;
        ctx.font = 'bold 11px "Noto Sans", sans-serif';
        ctx.fillText(`⬡ ${node.name}`, sr.x + 6, sr.y + 14);
        ctx.restore();
        return;
      case 'Label':          _drawLabel(ctx, node, sr, pr);          break;
      case 'Button':         _drawButton(ctx, node, sr, pr);         break;
      case 'CircleButton':   _drawCircleButton(ctx, node, sr, pr);   break;
      case 'TriangleButton': _drawTriangleButton(ctx, node, sr, pr); break;
      case 'OvalButton':     _drawOvalButton(ctx, node, sr, pr);     break;
      case 'ProgressBar':    _drawProgressBar(ctx, node, sr);        break;
      case 'MenuList':       _drawMenuList(ctx, node, sr);           break;
      case 'NineSlicePanel': _drawNineSliceLines(ctx, node, sr, pr); break;
      default: break;
    }

    if (!_isShapeBtn) {
      ctx.strokeStyle = col.stroke;
      ctx.lineWidth   = node.type === 'NineSlicePanel' ? 1.5 : 1;
      ctx.strokeRect(sr.x, sr.y, sr.w, sr.h);

      ctx.fillStyle = 'rgba(180,200,230,0.25)';
      ctx.font = '9px "Noto Sans", sans-serif';
      ctx.fillText(node.type, sr.x + 3, sr.y + sr.h - 3);
    }

    // Layout-controlled badge: subtle blue corner triangle
    if (isLayoutControlled(node)) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = 'rgba(100,180,255,0.18)';
      ctx.fillRect(sr.x, sr.y, sr.w, sr.h);
      ctx.restore();
    }

    ctx.restore();
  }

  function _drawLabel(ctx, node, sr) {
    const text  = String(node.properties?.text ?? 'Label');
    const color = node.properties?.textColor || '#e7eef7';
    const pr2   = previewRect();
    const fs    = Math.max(8, Math.min(Number(node.properties?.fontSize ?? 24) * pr2.scale, 48));
    ctx.fillStyle    = color;
    ctx.font         = `${fs}px "Noto Sans", sans-serif`;
    ctx.textBaseline = 'middle';
    const tw  = ctx.measureText(text).width;
    const al  = node.properties?.align || 'left';
    let tx = sr.x + 6;
    if (al === 'center') tx = sr.x + (sr.w - tw) / 2;
    if (al === 'right')  tx = sr.x + sr.w - tw - 6;
    ctx.fillText(text, tx, sr.y + sr.h / 2, sr.w - 12);
    ctx.textBaseline = 'alphabetic';
  }

  function _drawButton(ctx, node, sr) {
    const text  = String(node.properties?.text ?? 'Button');
    const color = node.properties?.textColor || '#ffffff';
    const pr2   = previewRect();
    const fs    = Math.min(Number(node.properties?.fontSize ?? 22) * pr2.scale, 28);
    ctx.fillStyle    = color;
    ctx.font         = `${Math.max(9, fs)}px "Noto Sans", sans-serif`;
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    ctx.fillText(text, sr.x + (sr.w - tw) / 2, sr.y + sr.h / 2);
    ctx.textBaseline = 'alphabetic';
  }

  function _drawCircleButton(ctx, node, sr, pr) {
    const fill   = node.properties?.normalColor || '#375a7f';
    const stroke = '#5b8def';
    const rx = sr.w / 2, ry = sr.h / 2;
    ctx.fillStyle   = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.ellipse(sr.x + rx, sr.y + ry, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const text = String(node.properties?.text ?? '');
    if (text) {
      const pr2 = previewRect();
      const fs  = Math.min(Number(node.properties?.fontSize ?? 18) * pr2.scale, 22);
      ctx.fillStyle    = node.properties?.textColor || '#ffffff';
      ctx.font         = `${Math.max(8, fs)}px "Noto Sans", sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign    = 'center';
      ctx.fillText(text, sr.x + rx, sr.y + ry);
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
    }
    ctx.fillStyle = 'rgba(180,200,230,0.25)';
    ctx.font = '9px "Noto Sans", sans-serif';
    ctx.fillText('CircleButton', sr.x + 3, sr.y + sr.h - 3);
  }

  function _drawTriangleButton(ctx, node, sr, pr) {
    const fill   = node.properties?.normalColor || '#375a7f';
    const stroke = '#5b8def';
    ctx.fillStyle   = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(sr.x + sr.w / 2, sr.y);          // apex
    ctx.lineTo(sr.x + sr.w,     sr.y + sr.h);   // bottom-right
    ctx.lineTo(sr.x,             sr.y + sr.h);   // bottom-left
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const text = String(node.properties?.text ?? '');
    if (text) {
      const pr2 = previewRect();
      const fs  = Math.min(Number(node.properties?.fontSize ?? 16) * pr2.scale, 20);
      ctx.fillStyle    = node.properties?.textColor || '#ffffff';
      ctx.font         = `${Math.max(8, fs)}px "Noto Sans", sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign    = 'center';
      ctx.fillText(text, sr.x + sr.w / 2, sr.y + sr.h * 0.65);
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
    }
    ctx.fillStyle = 'rgba(180,200,230,0.25)';
    ctx.font = '9px "Noto Sans", sans-serif';
    ctx.fillText('TriangleButton', sr.x + 3, sr.y + sr.h - 3);
  }

  function _drawOvalButton(ctx, node, sr, pr) {
    const fill   = node.properties?.normalColor || '#375a7f';
    const stroke = '#5b8def';
    const rx = sr.w / 2, ry = sr.h / 2;
    ctx.fillStyle   = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.ellipse(sr.x + rx, sr.y + ry, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const text = String(node.properties?.text ?? 'Button');
    const pr2  = previewRect();
    const fs   = Math.min(Number(node.properties?.fontSize ?? 18) * pr2.scale, 22);
    ctx.fillStyle    = node.properties?.textColor || '#ffffff';
    ctx.font         = `${Math.max(8, fs)}px "Noto Sans", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign    = 'center';
    ctx.fillText(text, sr.x + rx, sr.y + ry);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(180,200,230,0.25)';
    ctx.font = '9px "Noto Sans", sans-serif';
    ctx.fillText('OvalButton', sr.x + 3, sr.y + sr.h - 3);
  }

  function _drawProgressBar(ctx, node, sr) {
    const minV  = Number(node.properties?.minValue ?? 0);
    const maxV  = Number(node.properties?.maxValue ?? 1);
    const value = Number(node.properties?.value ?? 0.5);
    const frac  = maxV > minV ? Math.max(0, Math.min(1, (value-minV)/(maxV-minV))) : 0;
    ctx.fillStyle = node.properties?.fillColor || '#4a90d9';
    ctx.fillRect(sr.x, sr.y, sr.w * frac, sr.h);
    if (node.properties?.showLabel) {
      ctx.fillStyle    = node.properties?.labelColor || '#e7eef7';
      ctx.font         = '11px "Noto Sans", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(frac*100)}%`, sr.x+4, sr.y+sr.h/2);
      ctx.textBaseline = 'alphabetic';
    }
  }

  function _drawMenuList(ctx, node, sr) {
    const items   = Array.isArray(node.properties?.items) ? node.properties.items : [];
    const itemH   = Math.max(8, Number(node.properties?.itemHeight ?? 48) * sr.h / Math.max(1, Number(node.properties?.height ?? sr.h)));
    const selIdx  = Number(node.properties?.selectedIndex ?? 0);
    const selCol  = node.properties?.selectedColor || '#375a7f';
    const txtCol  = node.properties?.textColor || '#e7eef7';
    const sTxtCol = node.properties?.selectedTextColor || '#ffffff';
    const maxVis  = Math.floor(sr.h / Math.max(1, itemH));
    for (let i = 0; i < Math.min(items.length, maxVis); i++) {
      const iy = sr.y + i * itemH;
      if (i === selIdx) { ctx.fillStyle = selCol; ctx.fillRect(sr.x, iy, sr.w, itemH); }
      const label = typeof items[i] === 'string' ? items[i] : (items[i]?.label || `Item ${i+1}`);
      ctx.fillStyle    = i === selIdx ? sTxtCol : txtCol;
      ctx.font         = '11px "Noto Sans", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, sr.x+8, iy+itemH/2, sr.w-16);
      ctx.textBaseline = 'alphabetic';
      if (i < Math.min(items.length, maxVis)-1) {
        ctx.strokeStyle = 'rgba(94,117,148,0.4)'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(sr.x, iy+itemH); ctx.lineTo(sr.x+sr.w, iy+itemH); ctx.stroke();
      }
    }
    if (!items.length) {
      ctx.fillStyle    = 'rgba(180,200,230,0.3)';
      ctx.font         = '11px "Noto Sans", sans-serif';
      ctx.fillText('MenuList (empty)', sr.x+6, sr.y+sr.h/2);
    }
  }

  function _drawNineSliceLines(ctx, node, sr, pr) {
    const sl = Number(node.properties?.sliceLeft   ?? 16) * pr.scale;
    const st = Number(node.properties?.sliceTop    ?? 16) * pr.scale;
    const sr2= Number(node.properties?.sliceRight  ?? 16) * pr.scale;
    const sb = Number(node.properties?.sliceBottom ?? 16) * pr.scale;
    ctx.strokeStyle = 'rgba(180,100,255,0.4)'; ctx.lineWidth = 1;
    if (sl > 0) { ctx.beginPath(); ctx.moveTo(sr.x+sl, sr.y); ctx.lineTo(sr.x+sl, sr.y+sr.h); ctx.stroke(); }
    if (sr2> 0) { ctx.beginPath(); ctx.moveTo(sr.x+sr.w-sr2, sr.y); ctx.lineTo(sr.x+sr.w-sr2, sr.y+sr.h); ctx.stroke(); }
    if (st > 0) { ctx.beginPath(); ctx.moveTo(sr.x, sr.y+st); ctx.lineTo(sr.x+sr.w, sr.y+st); ctx.stroke(); }
    if (sb > 0) { ctx.beginPath(); ctx.moveTo(sr.x, sr.y+sr.h-sb); ctx.lineTo(sr.x+sr.w, sr.y+sr.h-sb); ctx.stroke(); }
  }

  function drawSelection(ctx, node, meta, byId) {
    const sr = nodeScreenRect(node, byId);
    const locked = isNodeLocked(node, meta);
    const controlled = isLayoutControlled(node);

    // Border style
    if (locked) {
      ctx.strokeStyle = '#ff6b35';
      ctx.lineWidth   = 2;
      ctx.setLineDash([6, 3]);
    } else if (controlled) {
      ctx.strokeStyle = '#a0c8ff';  // blue — layout-managed
      ctx.lineWidth   = 2;
      ctx.setLineDash([4, 3]);
    } else {
      ctx.strokeStyle = SEL_STROKE;
      ctx.lineWidth   = 2;
      ctx.setLineDash([]);
    }
    ctx.strokeRect(sr.x-1, sr.y-1, sr.w+2, sr.h+2);
    ctx.setLineDash([]);

    // Show resize handles only when not locked and not layout-controlled
    if (!locked && !controlled && node.type !== 'CanvasLayer') {
      const handles = getHandles(sr);
      for (const h of Object.values(handles)) {
        ctx.fillStyle   = HANDLE_FILL;
        ctx.strokeStyle = HANDLE_STROKE;
        ctx.lineWidth   = 1;
        ctx.fillRect(h.x, h.y, HANDLE_SIZE, HANDLE_SIZE);
        ctx.strokeRect(h.x, h.y, HANDLE_SIZE, HANDLE_SIZE);
      }
    }

    // Status badge
    if (locked) {
      ctx.fillStyle    = 'rgba(255,107,53,0.9)';
      ctx.font         = 'bold 10px "Noto Sans", sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText('🔒 Locked', sr.x+2, sr.y+2);
      ctx.textBaseline = 'alphabetic';
    } else if (controlled) {
      const parent = getNode(node.parentId);
      const pType  = parent?.type ?? 'Container';
      ctx.fillStyle    = 'rgba(160,200,255,0.92)';
      ctx.font         = 'bold 9px "Noto Sans", sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(`⊞ ${pType}`, sr.x+3, sr.y+3);
      ctx.textBaseline = 'alphabetic';
    }
  }

  // ───────────────────────── RAF loop ─────────────────────────────────────
  function startLoop() {
    if (_rafId) return;
    function tick() {
      if (!_active) { _rafId = null; return; }
      resizeCanvasToContainer();
      if (_dirty) { drawFrame(); _dirty = false; }
      _rafId = requestAnimationFrame(tick);
    }
    _rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
  }

  // markDirty uses local _dirty flag (pattern shared via editor/editor_bridge.js)
  function markDirty() { _dirty = true; }

  function forceRefresh(reason = 'manual') {
    _dirty = true;
    if (!_canvas) {
      _canvas = document.getElementById('ui-editor-canvas');
      _ctx    = _canvas?.getContext('2d', { alpha: false });
      _wrap   = document.getElementById('ui-editor-canvas-wrap');
    }
    if (!_active || !_canvas || !_ctx) return;
    applyContainerLayout();
    resizeCanvasToContainer();
    drawFrame();
    _dirty = false;
    // One follow-up resize+redraw to catch any layout settling after the current tick.
    requestAnimationFrame(() => {
      if (!_active) return;
      resizeCanvasToContainer();
      markDirty();
    });
  }

  function resizeCanvasToContainer() {
    if (!_canvas || !_wrap) return;
    const rect = _wrap.getBoundingClientRect();
    const dpr  = canvasDpr();
    const cw   = Math.max(1, Math.round(rect.width));
    const ch   = Math.max(1, Math.round(rect.height));
    const bw = Math.max(1, Math.round(cw * dpr));
    const bh = Math.max(1, Math.round(ch * dpr));
    if (_canvas.width !== bw || _canvas.height !== bh) {
      _canvas.width  = bw;
      _canvas.height = bh;
      _canvas.style.width  = cw + 'px';
      _canvas.style.height = ch + 'px';
      _dirty = true;
    } else if (_canvas.style.width !== cw + 'px' || _canvas.style.height !== ch + 'px') {
      _canvas.style.width  = cw + 'px';
      _canvas.style.height = ch + 'px';
    }
    configureCanvasContext();
  }

  // ───────────────────────── pointer events ────────────────────────────────
  function canvasPointerPos(e) {
    const rect = _canvas.getBoundingClientRect();
    const logical = logicalCanvasSize();
    const cssW = Math.max(1, rect.width || logical.w);
    const cssH = Math.max(1, rect.height || logical.h);
    return {
      x: (e.clientX - rect.left) * (logical.w / cssW),
      y: (e.clientY - rect.top)  * (logical.h / cssH),
    };
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    _invalidateNodeCache();
    const { x: sx, y: sy } = canvasPointerPos(e);
    const b = bridge(); if (!b) return;
    const meta = getUiMeta();
    const pr   = previewRect();

    // ── Ruler drag → create guide ──────────────────────────────────
    const inTopRuler  = sy >= pr.y-RULER_SIZE && sy < pr.y && sx >= pr.x && sx <= pr.x+pr.w;
    const inLeftRuler = sx >= pr.x-RULER_SIZE && sx < pr.x && sy >= pr.y && sy <= pr.y+pr.h;
    if (inTopRuler || inLeftRuler) {
      _pendingGuide = { axis: inTopRuler ? 'v' : 'h', screenPos: inTopRuler ? sx : sy };
      _canvas.setPointerCapture(e.pointerId);
      markDirty();
      return;
    }

    // ── Guide hit test ─────────────────────────────────────────────
    if (meta.snap.showGuides && Array.isArray(meta.guides)) {
      for (const g of meta.guides) {
        const sp = g.axis === 'v' ? pr.x + g.pos * pr.scale : pr.y + g.pos * pr.scale;
        const hit = Math.abs((g.axis === 'v' ? sx : sy) - sp) < 6;
        if (hit) {
          _drag.mode    = 'guide';
          _drag.guideId = g.id;
          _drag.start   = { px: sx, py: sy };
          _canvas.setPointerCapture(e.pointerId);
          markDirty();
          return;
        }
      }
    }

    // ── Resize handle on selected node ─────────────────────────────
    const selNode = selectedNode();
    if (selNode && selNode.type !== 'CanvasLayer' && !isNodeLocked(selNode, meta) && !isLayoutControlled(selNode)) {
      const sr = nodeScreenRect(selNode);
      const handle = hitHandle(sx, sy, sr);
      if (handle) {
        _drag.mode   = 'resize';
        _drag.handle = handle;
        _drag.start  = {
          px: sx, py: sy,
          nodeX: Number(selNode.transform?.x ?? 0),
          nodeY: Number(selNode.transform?.y ?? 0),
          nodeW: Number(selNode.properties?.width  ?? 80),
          nodeH: Number(selNode.properties?.height ?? 40),
        };
        _canvas.setPointerCapture(e.pointerId);
        return;
      }
    }

    // ── Hit-test nodes ─────────────────────────────────────────────
    // Build depth-first draw order (same as drawFrame) then reverse it so
    // children (drawn on top) are tested before their parents.
    const _htAll = uiNodes().filter(n => n.visible !== false && !isNodeHiddenByLayer(n, meta));
    const _htIds = new Set(_htAll.map(n => n.id));
    const _htKids = new Map();
    for (const n of _htAll) {
      const pid = n.parentId;
      if (pid && _htIds.has(pid)) {
        if (!_htKids.has(pid)) _htKids.set(pid, []);
        _htKids.get(pid).push(n);
      }
    }
    for (const arr of _htKids.values()) arr.sort((a,b) => Number(a.zIndex??0)-Number(b.zIndex??0));
    const _htRoots = _htAll.filter(n => !n.parentId || !_htIds.has(n.parentId)).sort((a,b) => {
      const dl = Number(a.properties?.layer??0)-Number(b.properties?.layer??0);
      return dl || Number(a.zIndex??0)-Number(b.zIndex??0);
    });
    const _drawOrder = [];
    const _htWalk = n => { _drawOrder.push(n); (_htKids.get(n.id)||[]).forEach(_htWalk); };
    for (const r of _htRoots) _htWalk(r);
    // Reverse: deepest/topmost nodes tested first
    _drawOrder.reverse();

    let hit = null;
    for (const node of _drawOrder) { if (hitNode(sx, sy, node)) { hit = node; break; } }

    if (hit) {
      b.selectNode(hit.id);
      if (!isNodeLocked(hit, meta) && !isLayoutControlled(hit)) {
        _drag.mode  = 'move';
        // Store absolute canvas position at drag start (not local transform).
        // On move, we compute new_abs = abs_start + delta, then convert back
        // to local coords by subtracting parent absolute position.
        // This matches how the scene editor handles child node dragging.
        const _hitAbs = nodeAbsPos(hit);
        _drag.start = {
          px: sx, py: sy,
          nodeX: Number(hit.transform?.x ?? 0),  // local, for reference
          nodeY: Number(hit.transform?.y ?? 0),
          absX:  _hitAbs.x,  // absolute game coords at drag start
          absY:  _hitAbs.y,
          nodeW: Number(hit.properties?.width  ?? 80),
          nodeH: Number(hit.properties?.height ?? 40),
          nodeId: hit.id,
          parentId: hit.parentId || null,
        };
        _buildInspCache();  // cache inspector inputs once for the drag session
        _canvas.setPointerCapture(e.pointerId);
      }
    } else {
      b.selectNode(null);
    }
    markDirty();
  }

  function onPointerMove(e) {
    _invalidateNodeCache();
    const { x: sx, y: sy } = canvasPointerPos(e);
    const b = bridge(); if (!b) return;
    const meta = getUiMeta();
    const pr   = previewRect();

    // ── Pending guide drag ─────────────────────────────────────────
    if (_pendingGuide) {
      _pendingGuide.screenPos = _pendingGuide.axis === 'v' ? sx : sy;
      markDirty();
      return;
    }

    // ── Guide drag ─────────────────────────────────────────────────
    if (_drag.mode === 'guide') {
      const g = meta.guides.find(g2 => g2.id === _drag.guideId);
      if (g) {
        g.pos = g.axis === 'v'
          ? Math.round((sx - pr.x) / pr.scale)
          : Math.round((sy - pr.y) / pr.scale);
        saveUiMeta(meta);
        markDirty();
      }
      return;
    }

    // ── No drag: cursor + hover ────────────────────────────────────
    if (!_drag.mode) {
      let cursor = 'default';
      const selNode = selectedNode();
      if (selNode && !isNodeLocked(selNode, meta) && selNode.type !== 'CanvasLayer') {
        if (isLayoutControlled(selNode)) {
          // Layout-controlled: show not-allowed on handles, default elsewhere
          if (hitNode(sx, sy, selNode)) cursor = 'not-allowed';
        } else {
          const sr = nodeScreenRect(selNode);
          const handle = hitHandle(sx, sy, sr);
          if (handle) {
            const cursors = { nw:'nw-resize',n:'n-resize',ne:'ne-resize',e:'e-resize',se:'se-resize',s:'s-resize',sw:'sw-resize',w:'w-resize' };
            cursor = cursors[handle] || 'default';
          } else if (hitNode(sx, sy, selNode)) cursor = 'move';
        }
      }
      // Check guides for grab cursor
      if (meta.snap.showGuides && Array.isArray(meta.guides)) {
        for (const g of meta.guides) {
          const sp = g.axis === 'v' ? pr.x + g.pos * pr.scale : pr.y + g.pos * pr.scale;
          if (Math.abs((g.axis === 'v' ? sx : sy) - sp) < 6) { cursor = g.axis === 'v' ? 'col-resize' : 'row-resize'; break; }
        }
      }
      // Ruler zones
      const inTopRuler  = sy >= pr.y-RULER_SIZE && sy < pr.y && sx >= pr.x && sx <= pr.x+pr.w;
      const inLeftRuler = sx >= pr.x-RULER_SIZE && sx < pr.x && sy >= pr.y && sy <= pr.y+pr.h;
      if (inTopRuler)  cursor = 'col-resize';
      if (inLeftRuler) cursor = 'row-resize';

      _canvas.style.cursor = cursor;
      markDirty();
      return;
    }

    // ── Move ───────────────────────────────────────────────────────
    const ds  = _drag.start;
    const dx  = (sx - ds.px) / pr.scale;
    const dy  = (sy - ds.py) / pr.scale;
    const sel = selectedNode(); if (!sel) return;

    if (_drag.mode === 'move') {
      // New absolute position in game units
      const newAbsX = ds.absX + dx;
      const newAbsY = ds.absY + dy;
      // Convert absolute → local by subtracting parent's absolute position
      const parentAbs = ds.parentId ? nodeAbsPos(getNode(ds.parentId) || {}) : { x: 0, y: 0 };
      const rawLocalX = newAbsX - parentAbs.x;
      const rawLocalY = newAbsY - parentAbs.y;
      const snapped = snap(rawLocalX, rawLocalY, ds.nodeW, ds.nodeH, sel.id);
      _snapLines = snapped.lines;
      sel.transform.x = snapped.x;
      sel.transform.y = snapped.y;
      _patchInspectorInputs(sel.id, snapped.x, snapped.y, undefined, undefined);

    } else if (_drag.mode === 'resize') {
      const h  = _drag.handle;
      let { nodeX:ox, nodeY:oy, nodeW:ow, nodeH:oh } = ds;
      let nx = ox, ny = oy, nw = ow, nh = oh;

      if (h.includes('e')) nw = snapVal(Math.max(MIN_NODE_DIM, ow + dx));
      if (h.includes('s')) nh = snapVal(Math.max(MIN_NODE_DIM, oh + dy));
      if (h.includes('w')) { nw = snapVal(Math.max(MIN_NODE_DIM, ow - dx)); nx = snapVal(ox + (ow - nw)); }
      if (h.includes('n')) { nh = snapVal(Math.max(MIN_NODE_DIM, oh - dy)); ny = snapVal(oy + (oh - nh)); }

      // Multi-mode snap on the dragged edge position
      if (h.includes('e') || h.includes('w')) {
        const edgeX = h.includes('e') ? nx + nw : nx;
        const snapped = snap(edgeX, ny, 0, nh, sel.id);
        _snapLines = snapped.lines.filter(l => l.x1 === l.x2); // only vertical lines
      }
      if (h.includes('s') || h.includes('n')) {
        const edgeY = h.includes('s') ? ny + nh : ny;
        const snapped = snap(nx, edgeY, nw, 0, sel.id);
        _snapLines = (_snapLines || []).concat(snapped.lines.filter(l => l.y1 === l.y2));
      }

      sel.transform.x          = nx;
      sel.transform.y          = ny;
      sel.properties            = sel.properties || {};
      sel.properties.width      = nw;
      sel.properties.height     = nh;
      _patchInspectorInputs(sel.id, nx, ny, nw, nh);
    }

    markDirty();
  }

  function onPointerUp(e) {
    const b = bridge(); if (!b) return;
    const meta = getUiMeta();
    const pr   = previewRect();

    // ── Place pending guide ────────────────────────────────────────
    if (_pendingGuide) {
      const pg = _pendingGuide;
      _pendingGuide = null;
      const pos = pg.axis === 'v'
        ? Math.round((pg.screenPos - pr.x) / pr.scale)
        : Math.round((pg.screenPos - pr.y) / pr.scale);
      const { w: resW, h: resH } = previewRes(meta);
      const inBounds = pg.axis === 'v' ? (pos >= 0 && pos <= resW) : (pos >= 0 && pos <= resH);
      if (inBounds) {
        if (!Array.isArray(meta.guides)) meta.guides = [];
        meta.guides.push({ id: 'g_' + Date.now(), axis: pg.axis, pos });
        saveUiMeta(meta);
      }
      markDirty();
      return;
    }

    // ── Drop guide outside canvas → delete it ─────────────────────
    if (_drag.mode === 'guide') {
      const { x: sx, y: sy } = canvasPointerPos(e);
      const outsideCanvas = sx < pr.x || sx > pr.x+pr.w || sy < pr.y || sy > pr.y+pr.h;
      if (outsideCanvas) {
        meta.guides = (meta.guides || []).filter(g => g.id !== _drag.guideId);
        saveUiMeta(meta);
      } else {
        saveUiMeta(meta);
      }
      _drag.mode = null; _drag.guideId = null; _drag.start = null;
      markDirty();
      return;
    }

    if (!_drag.mode) return;
    _snapLines = [];

    const sel = selectedNode();
    if (sel) {
      // Re-layout containers: if the moved/resized node is a container, its
      // children need repositioning; if it's a child, nothing changes (blocked above).
      applyContainerLayout();
      b.pushHistory(_drag.mode === 'move' ? `Move ${sel.name}` : `Resize ${sel.name}`);
      // Only refresh what actually changed: inspector (position values) and
      // the scene viewport (node moved). Full refreshAll touches 11 slices
      // including tree/tilemaps/spritesheets which are unaffected by a UI move.
      if (window.scheduleRender && window.RenderFlags) {
        window.scheduleRender(window.RenderFlags.INSPECTOR | window.RenderFlags.VIEWPORT | window.RenderFlags.SCENE_SUMMARY);
      } else {
        b.refreshAll();
      }
    }

    _inspCache = null;  // inspector will be rebuilt by refreshAll; clear stale refs
    _drag.mode = null; _drag.start = null; _drag.handle = null;
    markDirty();
  }

  // Cached inspector input refs — rebuilt on drag start, cleared on drag end.
  // Avoids a querySelectorAll + forced reflow on every pointermove pixel.
  let _inspCache = null;
  function _buildInspCache() {
    const inspEl = document.getElementById('inspector');
    if (!inspEl) { _inspCache = null; return; }
    _inspCache = {};
    inspEl.querySelectorAll('input[data-field-key]').forEach(el => {
      _inspCache[el.dataset.fieldKey] = el;
    });
  }

  function _patchInspectorInputs(nodeId, x, y, w, h) {
    if (!_inspCache) _buildInspCache();
    if (!_inspCache) return;
    if (x !== undefined && _inspCache['transform.x'])       _inspCache['transform.x'].value       = String(Math.round(x));
    if (y !== undefined && _inspCache['transform.y'])       _inspCache['transform.y'].value       = String(Math.round(y));
    if (w !== undefined && _inspCache['properties.width'])  _inspCache['properties.width'].value  = String(Math.round(w));
    if (h !== undefined && _inspCache['properties.height']) _inspCache['properties.height'].value = String(Math.round(h));
  }

  // ───────────────────────── layer management ──────────────────────────────
  function renderLayerList() { /* Layers section removed */ }


  // ───────────────────────── node tree ─────────────────────────────────────
  function renderTree() {
    const treeEl = document.getElementById('ui-node-tree');
    if (!treeEl) return;
    const b = bridge(); if (!b) return;
    const meta   = getUiMeta();
    const allUi  = uiNodes();
    const selId  = selectedId();

    treeEl.innerHTML = '';
    if (!allUi.length) {
      treeEl.innerHTML = '<div class="ui-tree-empty">No UI nodes. Add a CanvasLayer to start.</div>';
      return;
    }

    const childMap = new Map();
    for (const n of allUi) {
      const pid = n.parentId || b.getRootNodeId();
      if (!childMap.has(pid)) childMap.set(pid, []);
      childMap.get(pid).push(n);
    }

    function renderBranch(nodes, depth) {
      for (const node of nodes) {
        const locked  = isNodeLocked(node, meta);
        const hiddenL = isNodeHiddenByLayer(node, meta);

        const row = document.createElement('div');
        row.className = 'ui-tree-row'
          + (node.id === selId ? ' active' : '')
          + (locked  ? ' locked-row' : '')
          + (hiddenL ? ' hidden-row' : '');
        row.dataset.nodeId = node.id;
        row.style.paddingLeft = (8 + depth * 14) + 'px';
        row.title = locked ? '🔒 Layer locked' : '';

        const visBtn = document.createElement('button');
        visBtn.type = 'button'; visBtn.className = 'ui-tree-vis';
        visBtn.textContent = node.visible === false ? '○' : '◉';
        visBtn.addEventListener('click', ev => {
          ev.stopPropagation();
          node.visible = node.visible === false ? true : false;
          // If toggling a CanvasLayer, propagate to all its children
          if (node.type === 'CanvasLayer') {
            _setDescendantsVisible(node, node.visible);
            // Also sync the layer def
            const meta2 = getUiMeta();
            const def2 = getLayerDef(node, meta2);
            if (def2) { def2.visible = node.visible; saveUiMeta(meta2); }
          }
          b.refreshAll(); markDirty();
        });

        const icon = document.createElement('span');
        icon.className = 'ui-tree-icon';
        icon.textContent = nodeIcon(node.type);

        const nm = document.createElement('span');
        nm.className = 'ui-tree-name';
        nm.textContent = node.name || node.type;

        const tp = document.createElement('span');
        tp.className = 'ui-tree-type';
        tp.textContent = node.type;

        if (locked) {
          const lk = document.createElement('span');
          lk.className = 'ui-tree-lock-icon';
          lk.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="13" viewBox="0 0 12 14" fill="none">
            <rect x="1.5" y="6" width="9" height="7.5" rx="1.5" fill="#e06c75" opacity="0.15" stroke="#e06c75" stroke-width="1.25"/>
            <path d="M3.5 6V4a2.5 2.5 0 0 1 5 0v2" stroke="#e06c75" stroke-width="1.25" stroke-linecap="round"/>
            <circle cx="6" cy="9.5" r="1.25" fill="#e06c75"/>
            <line x1="6" y1="10.5" x2="6" y2="12" stroke="#e06c75" stroke-width="1.25" stroke-linecap="round"/>
          </svg>`;
          row.appendChild(visBtn); row.appendChild(icon); row.appendChild(nm); row.appendChild(lk); row.appendChild(tp);
        } else {
          row.appendChild(visBtn); row.appendChild(icon); row.appendChild(nm); row.appendChild(tp);
        }

        row.addEventListener('click', () => {
          b.selectNode(node.id);
          markDirty(); renderTree();
          // Show locked indicator in inspector
          if (locked) _showLockedBannerInInspector();
        });

        treeEl.appendChild(row);
        const children = childMap.get(node.id) || [];
        if (children.length) renderBranch(children, depth + 1);
      }
    }

    const rootId   = b.getRootNodeId();
    const allUiIds = new Set(allUi.map(n => n.id));
    const topLevel = allUi.filter(n => !allUiIds.has(n.parentId) || n.parentId === rootId || !n.parentId);
    renderBranch(topLevel, 0);
  }

  function _showLockedBannerInInspector() {
    const inspEl = document.getElementById('inspector');
    if (!inspEl) return;
    const existing = inspEl.querySelector('.ui-locked-banner');
    if (existing) return;
    const banner = document.createElement('div');
    banner.className = 'ui-locked-banner';
    banner.textContent = '🔒 This node is on a locked layer. Editing is disabled.';
    inspEl.prepend(banner);
  }

  // ───────────────────────── snap controls ────────────────────────────────
  function renderSnapPanel() {
    const panelEl = document.getElementById('ui-snap-panel');
    if (!panelEl) return;
    const meta = getUiMeta();
    const s    = meta.snap;

    // Sync control values without rebuilding the DOM
    const set = (id, val, prop = 'checked') => {
      const el = document.getElementById(id);
      if (el) el[prop] = val;
    };
    set('ui-snap-enabled',       s.enabled);
    set('ui-snap-grid-size',     s.gridSize, 'value');
    set('ui-snap-show-grid',     s.showGrid);
    set('ui-snap-show-guides',   s.showGuides);
    set('ui-snap-tolerance',     s.tolerance, 'value');
    set('ui-snap-grid',          s.modes.grid);
    set('ui-snap-parent-edge',   s.modes.parentEdge);
    set('ui-snap-parent-center', s.modes.parentCenter);
    set('ui-snap-sibling-edge',  s.modes.siblingEdge);
    set('ui-snap-sibling-center',s.modes.siblingCenter);
    set('ui-snap-safe-area',     s.modes.safeArea);
    set('ui-snap-guides',        s.modes.guides);
    set('ui-safe-area-toggle',   meta.showSafeArea);
    set('ui-resolution-select',  meta.resolution, 'value');
  }

  function bindSnapPanel() {
    function onSnap(id, key, sub) {
      const el = document.getElementById(id); if (!el) return;
      el.addEventListener('change', () => {
        const meta = getUiMeta();
        const val  = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? Number(el.value) : el.value);
        if (sub) meta.snap[sub][key] = val;
        else if (key) meta.snap[key] = val;
        saveUiMeta(meta);
        forceRefresh('snap-change');
      });
    }
    onSnap('ui-snap-enabled',       'enabled');
    onSnap('ui-snap-grid-size',     'gridSize');
    onSnap('ui-snap-show-grid',     'showGrid');
    onSnap('ui-snap-show-guides',   'showGuides');
    onSnap('ui-snap-tolerance',     'tolerance');
    onSnap('ui-snap-grid',          'grid',          'modes');
    onSnap('ui-snap-parent-edge',   'parentEdge',    'modes');
    onSnap('ui-snap-parent-center', 'parentCenter',  'modes');
    onSnap('ui-snap-sibling-edge',  'siblingEdge',   'modes');
    onSnap('ui-snap-sibling-center','siblingCenter', 'modes');
    onSnap('ui-snap-safe-area',     'safeArea',      'modes');
    onSnap('ui-snap-guides',        'guides',        'modes');

    const safeEl = document.getElementById('ui-safe-area-toggle');
    if (safeEl) {
      safeEl.addEventListener('change', () => {
        const meta = getUiMeta();
        meta.showSafeArea = safeEl.checked;
        saveUiMeta(meta); markDirty();
      });
    }
    const resEl = document.getElementById('ui-resolution-select');
    if (resEl) {
      resEl.addEventListener('change', () => {
        const meta = getUiMeta();
        meta.resolution = resEl.value;
        saveUiMeta(meta); markDirty();
      });
    }

    // Clear all guides button
    const clearGuidesBtn = document.getElementById('ui-clear-guides');
    if (clearGuidesBtn) {
      clearGuidesBtn.addEventListener('click', () => {
        const meta = getUiMeta();
        meta.guides = [];
        saveUiMeta(meta); markDirty();
      });
    }
  }

  // ───────────────────────── add-node buttons ──────────────────────────────
  function bindAddButtons() {
    const wrap = document.getElementById('ui-add-buttons');
    if (!wrap) return;
    wrap.querySelectorAll('.ui-add-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        const b = bridge(); if (!b) return;
        const meta    = getUiMeta();
        const selId2  = selectedId();
        const selNode2= selId2 ? getNode(selId2) : null;

        // Block add on locked layer
        if (selNode2 && isNodeLocked(selNode2, meta)) {
          alert('Cannot add a node to a locked layer.'); return;
        }

        const UI_CONTAINER_TYPES = new Set(['CanvasLayer', 'Control', 'HBoxContainer', 'VBoxContainer', 'MarginContainer', 'ScrollContainer', 'Panel']);
        const parentId = (selNode2 && UI_CONTAINER_TYPES.has(selNode2.type))
          ? selNode2.id : b.getRootNodeId();

        b.addNode(type, parentId);

        // If adding CanvasLayer, auto-link to first unlinked layer def
        if (type === 'CanvasLayer') {
          const newNode = b.getNodes().find(n => n.type === 'CanvasLayer' && !n.properties?.layerDefId);
          if (newNode) {
            ensureDefaultLayers(meta);
            const usedIds = new Set(
              b.getNodes().filter(n => n.type === 'CanvasLayer' && n.properties?.layerDefId)
                          .map(n => n.properties.layerDefId)
            );
            const freeDef = meta.layers.find(l => !usedIds.has(l.id));
            if (freeDef) { newNode.properties.layerDefId = freeDef.id; }
            saveUiMeta(meta);
          }
        }

        applyContainerLayout();
        markDirty(); renderTree();
      });
    });
  }

  function bindDeleteButton() {
    const refresh = document.getElementById('ui-btn-refresh-canvas');
    if (refresh) refresh.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      recenterCanvas();
      forceRefresh('refresh-button');
    });
    const btn = document.getElementById('ui-btn-delete-node');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const selId2 = selectedId();
      if (!selId2) return;
      const b = bridge(); if (!b) return;
      if (b.isRootNodeId(selId2)) return;
      const meta = getUiMeta();
      const node = getNode(selId2);
      if (node && isNodeLocked(node, meta)) { alert('Cannot delete: layer is locked.'); return; }
      b.deleteNode(selId2);
      applyContainerLayout();
      markDirty(); renderTree();
    });
  }

  function bindCenterButton() {
    const btn = document.getElementById('ui-btn-center-canvas');
    if (!btn) return;
    btn.addEventListener('click', () => recenterCanvas());
  }

  // ───────────────────────── keyboard ─────────────────────────────────────
  function _onKeyDown(e) {
    if (!_active) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    const b = bridge(); if (!b) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const selId2 = selectedId();
      if (!selId2 || b.isRootNodeId(selId2)) return;
      const meta = getUiMeta();
      const node = getNode(selId2);
      if (node && isNodeLocked(node, meta)) return;
      b.deleteNode(selId2);
      applyContainerLayout();
      markDirty(); renderTree();
      e.preventDefault();
    }
    // G = toggle grid
    if (e.key === 'g' || e.key === 'G') {
      const meta = getUiMeta();
      meta.snap.showGrid = !meta.snap.showGrid;
      saveUiMeta(meta); renderSnapPanel(); markDirty();
    }
  }

  // ───────────────────────── utils ─────────────────────────────────────────
  function hexToRgba(hex, alpha) {
    if (!hex) return `rgba(40,50,70,${alpha})`;
    const s = hex.replace('#','');
    if (s.length < 6) return `rgba(40,50,70,${alpha})`;
    const r = parseInt(s.slice(0,2),16);
    const g = parseInt(s.slice(2,4),16);
    const b = parseInt(s.slice(4,6),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function nodeIcon(type) {
    const icons = { CanvasLayer:'⬡', Control:'⊞', Panel:'▭', Label:'T', TextureRect:'⬜', Button:'⊙', NineSlicePanel:'⊟', MenuList:'≡', ProgressBar:'▬' };
    return icons[type] || '◈';
  }

  // ───────────────────────── scene observer ───────────────────────────────
  function _installSceneObserver() {
    if (_observerInstalled) return;
    const b = bridge(); if (!b) return;
    _observerInstalled = true;
    let _syncRafId = null;
    // Patch b.refreshAll to keep the UI editor tree/layerList in sync whenever
    // the scene state changes. We do NOT call orig() here — the scene editor
    // already calls its own refreshAll() internally (the real one). Calling
    // orig() here was causing a second scheduleRender(FULL) on every drag-end,
    // making every node move update all 11 PerfMonitor slices unnecessarily.
    b.refreshAll = function () {
      if (!_active) return;
      markDirty();
      if (!_syncRafId) {
        _syncRafId = requestAnimationFrame(() => {
          _syncRafId = null;
          if (_active) { renderTree(); }
        });
      }
    };
  }


  function ensureResizeObserver() {
    if (_resizeObserver || !_wrap || typeof ResizeObserver !== 'function') return;
    _resizeObserver = new ResizeObserver(() => forceRefresh('resize-observer'));
    _resizeObserver.observe(_wrap);
  }


  function installUiEditorLayoutGuardian() {
    if (window.__rgeUiEditorLayoutGuardianInstalled) return;
    window.__rgeUiEditorLayoutGuardianInstalled = true;
    // Only listen to window resize — the ResizeObserver on _wrap handles dock
    // resizes, and the MutationObserver on the full subtree was firing on every
    // scene-editor interaction (style/class changes anywhere in center-dock),
    // causing forceRefresh() → 3 draws per interaction while UI Components is open.
    window.addEventListener('resize', () => {
      const wrap = document.getElementById('ui-editor-wrap');
      if (wrap && wrap.classList.contains('active')) {
        ensureUiEditorSplitLayout();
        requestAnimationFrame(() => { if (_active) { ensureUiEditorSplitLayout(); markDirty(); } });
      }
    });
  }

  // ───────────────────────── public API ────────────────────────────────────
  function ensureUiEditorSplitLayout() {
    const wrap = document.getElementById('ui-editor-wrap');
    const sidebar = document.getElementById('ui-editor-sidebar');
    const canvasWrap = document.getElementById('ui-editor-canvas-wrap');
    const canvas = document.getElementById('ui-editor-canvas');
    if (!wrap) return;
    Object.assign(wrap.style, {
      display: 'grid',
      gridTemplateColumns: '230px minmax(240px, 1fr)',
      gridTemplateRows: 'minmax(0, 1fr)',
      width: '100%',
      height: '100%',
      minWidth: '0',
      minHeight: '0',
      overflow: 'hidden',
      padding: '0'
    });
    if (sidebar) Object.assign(sidebar.style, {
      gridColumn: '1',
      gridRow: '1',
      width: 'auto',
      height: '100%',
      minHeight: '0',
      overflowY: 'auto',
      overflowX: 'hidden'
    });
    if (canvasWrap) Object.assign(canvasWrap.style, {
      gridColumn: '2',
      gridRow: '1',
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      position: 'relative',
      width: '100%',
      height: '100%',
      minWidth: '240px',
      minHeight: '160px',
      overflow: 'hidden',
      pointerEvents: 'auto'
    });
    if (canvas) Object.assign(canvas.style, {
      display: 'block',
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'auto'
    });
  }

  // ── recenterCanvas ───────────────────────────────────────────────────────
  // Forces the canvas to resize to its actual container, then redraws.
  // Called by the Center button and exposed on RGE_ROOT.RGEUIEditor.
  function recenterCanvas() {
    if (!_canvas) _canvas = document.getElementById('ui-editor-canvas');
    if (!_ctx && _canvas) _ctx = _canvas.getContext('2d', { alpha: false });
    _wrap = document.getElementById('ui-editor-canvas-wrap');
    ensureUiEditorSplitLayout();
    // Force the canvas backing-store to match the container RIGHT NOW
    // (not waiting for the next rAF tick) so previewRect() gets fresh dims.
    // FIX v50: Only update the backing store (canvas.width/height), not style.
    // Setting style.width/height on a flex:1 child changes its layout footprint
    // which re-fires the ResizeObserver and causes an infinite recenter loop.
    if (_canvas && _wrap) {
      const rect = _wrap.getBoundingClientRect();
      const dpr  = canvasDpr();
      const cw   = Math.max(240, Math.round(rect.width));
      const ch   = Math.max(160, Math.round(rect.height));
      _canvas.width        = Math.round(cw * dpr);
      _canvas.height       = Math.round(ch * dpr);
      _canvas.style.width  = cw + 'px';
      _canvas.style.height = ch + 'px';
      configureCanvasContext();
    }
    _dirty = true;
    if (_active) {
      drawFrame();
      _dirty = false;
    }
  }

  function activate() {
    _active = true;
    ensureUiEditorSplitLayout();
    installUiEditorLayoutGuardian();

    if (!_canvas) {
      _canvas = document.getElementById('ui-editor-canvas');
      _ctx    = _canvas?.getContext('2d', { alpha: false });
      _wrap   = document.getElementById('ui-editor-canvas-wrap');
    }
    if (!_canvas || !_ctx) { console.error('[UIEditor] Canvas not found'); return; }
    ensureResizeObserver();

    // Remove first so we never stack duplicate listeners on re-entry
    _canvas.removeEventListener('pointerdown',   onPointerDown);
    _canvas.removeEventListener('pointermove',   onPointerMove);
    _canvas.removeEventListener('pointerup',     onPointerUp);
    _canvas.removeEventListener('pointercancel', onPointerUp);
    _canvas.addEventListener('pointerdown',   onPointerDown);
    _canvas.addEventListener('pointermove',   onPointerMove);
    _canvas.addEventListener('pointerup',     onPointerUp);
    _canvas.addEventListener('pointercancel', onPointerUp);

    if (!_initialized) {
      _initialized = true;
      bindAddButtons();
      bindDeleteButton();
      bindCenterButton();
      bindSnapPanel();
      _installSceneObserver();
    }

    document.removeEventListener('keydown', _onKeyDown);
    document.addEventListener('keydown', _onKeyDown);

    ensureUiEditorSplitLayout();
    resizeCanvasToContainer();
    renderSnapPanel();
    markDirty();
    startLoop();
    renderTree();

    // One deferred resize to pick up final layout dimensions after the panel
    // has fully painted. recenterCanvas also calls ensureUiEditorSplitLayout.
    requestAnimationFrame(() => {
      if (!_active) return;
      recenterCanvas();
      renderTree();
    });
  }

  function clearCanvas() {
    if (!_canvas) _canvas = document.getElementById('ui-editor-canvas');
    if (!_ctx && _canvas) _ctx = _canvas.getContext('2d');
    if (_canvas && _ctx) {
      const dpr = canvasDpr();
      _ctx.save();
      _ctx.setTransform(1, 0, 0, 1, 0, 0);
      _ctx.clearRect(0, 0, _canvas.width || (_canvas.clientWidth * dpr), _canvas.height || (_canvas.clientHeight * dpr));
      _ctx.restore();
    }
  }

  function deactivate() {
    _active = false;
    _dirty = false;
    _drag.mode = null;
    _drag.start = null;
    _drag.handle = null;
    _pendingGuide = null;
    stopLoop();
    if (_canvas) {
      _canvas.removeEventListener('pointerdown',   onPointerDown);
      _canvas.removeEventListener('pointermove',   onPointerMove);
      _canvas.removeEventListener('pointerup',     onPointerUp);
      _canvas.removeEventListener('pointercancel', onPointerUp);
      try { _canvas.blur(); } catch (_) {}
    }
    document.removeEventListener('keydown', _onKeyDown);
    clearCanvas();
  }

  RGE_ROOT.RGEUIEditor = { activate, deactivate, clearCanvas, markDirty, forceRefresh, renderTree, renderLayerList, ensureLayout: ensureUiEditorSplitLayout, recenter: recenterCanvas, applyContainerLayout, applyAnchorLayout };

})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};


/* V146 UI redraw throttling */
RGE_ROOT.RGEUIRedrawRequired = false;
RGE_ROOT.RGERequestUIRedraw = function(){ RGE_ROOT.RGEUIRedrawRequired = true; };
