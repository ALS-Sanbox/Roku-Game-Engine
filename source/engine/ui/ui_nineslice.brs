' ui_nineslice.brs — RGE Phase 4: Nine-Slice Runtime Rendering
'
' Draws a NineSlicePanel or styled Panel/Button using a NineSliceStyle definition.
' The style defines:
'   imagePath   — source texture path
'   sliceLeft   — pixels from left before corner ends
'   sliceTop    — pixels from top before corner ends
'   sliceRight  — pixels from right before corner ends
'   sliceBottom — pixels from bottom before corner ends
'   centerMode  — "stretch" | "tile"   (how to fill the center region)
'   edgeMode    — "stretch" | "tile"   (how to fill the 4 edge strips)
'
' The 9 regions (using slice margins l,t,r,b and source size sw×sh):
'
'   ┌─────────┬─────────────┬─────────┐
'   │ NW corn │  N edge     │ NE corn │   height: sliceTop
'   │ l × t   │ sw-l-r × t │ r × t   │
'   ├─────────┼─────────────┼─────────┤
'   │ W edge  │  Center     │ E edge  │   height: dst_h - t - b
'   │ l × mid │ cw × mid    │ r × mid │
'   ├─────────┼─────────────┼─────────┤
'   │ SW corn │  S edge     │ SE corn │   height: sliceBottom
'   │ l × b   │ cw × b      │ r × b   │
'   └─────────┴─────────────┴─────────┘
'
' Corners are NEVER scaled — they are drawn 1:1 (or clamped if dst is smaller).
' Edges and center are either scaled or tiled per edgeMode / centerMode.

' ── Public entry point ─────────────────────────────────────────────────────────

' RokuEngine_DrawNineSliceStyled
' Draws the given node (Panel, Button, NineSlicePanel) using the supplied style AA.
' Falls back gracefully when style is invalid or texture fails to load.
'
' Parameters:
'   screen  — roScreen / roSGNode render target
'   engine  — engine AA that exposes LoadImageAsset()
'   node    — the UI node being drawn
'   style   — NineSliceStyle AA from the manifest
'   x,y,w,h — destination rect in screen pixels
'   opacity — 0.0 – 1.0

sub RokuEngine_DrawNineSliceStyled(screen as Object, engine as Object, node as Object, style as Object, x as Integer, y as Integer, w as Integer, h as Integer, opacity as Float)
  if screen = invalid or style = invalid then
    _NS_FallbackRect(screen, x, y, w, h, opacity)
    return
  end if

  imagePath = ""
  if style.imagePath <> invalid then imagePath = Trim(Str(style.imagePath))
  if imagePath = "" then
    _NS_FallbackRect(screen, x, y, w, h, opacity)
    return
  end if

  region = engine.LoadImageAsset(imagePath)
  if region = invalid then
    _NS_FallbackRect(screen, x, y, w, h, opacity)
    return
  end if

  sl = _BRS_IntOr(style.sliceLeft, 16)
  st = _BRS_IntOr(style.sliceTop, 16)
  sr = _BRS_IntOr(style.sliceRight, 16)
  sb = _BRS_IntOr(style.sliceBottom, 16)

  centerMode = "stretch"
  if style.centerMode <> invalid then centerMode = LCase(Trim(Str(style.centerMode)))

  edgeMode = "stretch"
  if style.edgeMode <> invalid then edgeMode = LCase(Trim(Str(style.edgeMode)))

  RokuEngine_DrawNineSliceRegions(screen, engine, region, sl, st, sr, sb, x, y, w, h, centerMode, edgeMode, opacity)
end sub

' ── Core renderer ──────────────────────────────────────────────────────────────

sub RokuEngine_DrawNineSliceRegions(screen as Object, engine as Object, region as Object, sl as Integer, st as Integer, sr as Integer, sb as Integer, x as Integer, y as Integer, w as Integer, h as Integer, centerMode as String, edgeMode as String, opacity as Float)
  srcW = region.GetWidth()
  srcH = region.GetHeight()

  ' Clamp margins so they never exceed source or destination dimensions
  sl = _NS_Clamp(sl, 0, Int(srcW / 2))
  sr = _NS_Clamp(sr, 0, srcW - sl)
  st = _NS_Clamp(st, 0, Int(srcH / 2))
  sb = _NS_Clamp(sb, 0, srcH - st)

  ' Source center dimensions
  cSrcW = srcW - sl - sr
  cSrcH = srcH - st - sb

  ' Destination center dimensions  (corners are 1:1, center fills the rest)
  cDstW = w - sl - sr
  cDstH = h - st - sb

  ' Clamp destination so corners never overflow
  actSL = _NS_Min(sl, w)
  actSR = _NS_Min(sr, w - actSL)
  actST = _NS_Min(st, h)
  actSB = _NS_Min(sb, h - actST)
  actCW = w - actSL - actSR
  actCH = h - actST - actSB

  ' ── Corners (never scaled) ────────────────────────────────────────────────
  ' NW
  if actSL > 0 and actST > 0 then
    _NS_DrawSlice(screen, region, 0, 0, sl, st, x, y, actSL, actST, false, false)
  end if
  ' NE
  if actSR > 0 and actST > 0 then
    _NS_DrawSlice(screen, region, srcW - sr, 0, sr, st, x + w - actSR, y, actSR, actST, false, false)
  end if
  ' SW
  if actSL > 0 and actSB > 0 then
    _NS_DrawSlice(screen, region, 0, srcH - sb, sl, sb, x, y + h - actSB, actSL, actSB, false, false)
  end if
  ' SE
  if actSR > 0 and actSB > 0 then
    _NS_DrawSlice(screen, region, srcW - sr, srcH - sb, sr, sb, x + w - actSR, y + h - actSB, actSR, actSB, false, false)
  end if

  ' ── Edges ─────────────────────────────────────────────────────────────────
  ' N (top edge)
  if cSrcW > 0 and actST > 0 and actCW > 0 then
    if edgeMode = "tile" then
      _NS_TileHorizontal(screen, region, sl, 0, cSrcW, st, x + actSL, y, actCW, actST)
    else
      _NS_DrawSlice(screen, region, sl, 0, cSrcW, st, x + actSL, y, actCW, actST, true, false)
    end if
  end if
  ' S (bottom edge)
  if cSrcW > 0 and actSB > 0 and actCW > 0 then
    if edgeMode = "tile" then
      _NS_TileHorizontal(screen, region, sl, srcH - sb, cSrcW, sb, x + actSL, y + h - actSB, actCW, actSB)
    else
      _NS_DrawSlice(screen, region, sl, srcH - sb, cSrcW, sb, x + actSL, y + h - actSB, actCW, actSB, true, false)
    end if
  end if
  ' W (left edge)
  if cSrcH > 0 and actSL > 0 and actCH > 0 then
    if edgeMode = "tile" then
      _NS_TileVertical(screen, region, 0, st, sl, cSrcH, x, y + actST, actSL, actCH)
    else
      _NS_DrawSlice(screen, region, 0, st, sl, cSrcH, x, y + actST, actSL, actCH, false, true)
    end if
  end if
  ' E (right edge)
  if cSrcH > 0 and actSR > 0 and actCH > 0 then
    if edgeMode = "tile" then
      _NS_TileVertical(screen, region, srcW - sr, st, sr, cSrcH, x + w - actSR, y + actST, actSR, actCH)
    else
      _NS_DrawSlice(screen, region, srcW - sr, st, sr, cSrcH, x + w - actSR, y + actST, actSR, actCH, false, true)
    end if
  end if

  ' ── Center ────────────────────────────────────────────────────────────────
  if cSrcW > 0 and cSrcH > 0 and actCW > 0 and actCH > 0 then
    if centerMode = "tile" then
      _NS_TileCenter(screen, region, sl, st, cSrcW, cSrcH, x + actSL, y + actST, actCW, actCH)
    else
      _NS_DrawSlice(screen, region, sl, st, cSrcW, cSrcH, x + actSL, y + actST, actCW, actCH, true, true)
    end if
  end if
end sub

' ── Tiling helpers ─────────────────────────────────────────────────────────────

' Tile a horizontal strip (N or S edge)
sub _NS_TileHorizontal(screen as Object, region as Object, srcX as Integer, srcY as Integer, srcW as Integer, srcH as Integer, dstX as Integer, dstY as Integer, dstW as Integer, dstH as Integer)
  if srcW <= 0 or srcH <= 0 or dstW <= 0 or dstH <= 0 then return
  ox = 0
  while ox < dstW
    tw = _NS_Min(srcW, dstW - ox)
    slice = CreateObject("roRegion", region.GetBitmap(), srcX, srcY, tw, srcH)
    if slice = invalid then exit while
    if dstH = srcH then
      screen.DrawObject(dstX + ox, dstY, slice)
    else
      screen.DrawScaledObject(dstX + ox, dstY, tw, dstH, slice)
    end if
    ox = ox + srcW
  end while
end sub

' Tile a vertical strip (W or E edge)
sub _NS_TileVertical(screen as Object, region as Object, srcX as Integer, srcY as Integer, srcW as Integer, srcH as Integer, dstX as Integer, dstY as Integer, dstW as Integer, dstH as Integer)
  if srcW <= 0 or srcH <= 0 or dstW <= 0 or dstH <= 0 then return
  oy = 0
  while oy < dstH
    th = _NS_Min(srcH, dstH - oy)
    slice = CreateObject("roRegion", region.GetBitmap(), srcX, srcY, srcW, th)
    if slice = invalid then exit while
    if dstW = srcW then
      screen.DrawObject(dstX, dstY + oy, slice)
    else
      screen.DrawScaledObject(dstX, dstY + oy, dstW, th, slice)
    end if
    oy = oy + srcH
  end while
end sub

' Tile the center region in both axes
sub _NS_TileCenter(screen as Object, region as Object, srcX as Integer, srcY as Integer, srcW as Integer, srcH as Integer, dstX as Integer, dstY as Integer, dstW as Integer, dstH as Integer)
  if srcW <= 0 or srcH <= 0 or dstW <= 0 or dstH <= 0 then return
  oy = 0
  while oy < dstH
    th = _NS_Min(srcH, dstH - oy)
    ox = 0
    while ox < dstW
      tw = _NS_Min(srcW, dstW - ox)
      slice = CreateObject("roRegion", region.GetBitmap(), srcX, srcY, tw, th)
      if slice = invalid then exit while
      screen.DrawObject(dstX + ox, dstY + oy, slice)
      ox = ox + srcW
    end while
    oy = oy + srcH
  end while
end sub

' ── Single-slice draw (stretch or 1:1) ────────────────────────────────────────

sub _NS_DrawSlice(screen as Object, region as Object, srcX as Integer, srcY as Integer, srcW as Integer, srcH as Integer, dstX as Integer, dstY as Integer, dstW as Integer, dstH as Integer, scaleX as Boolean, scaleY as Boolean)
  if srcW <= 0 or srcH <= 0 or dstW <= 0 or dstH <= 0 then return
  slice = CreateObject("roRegion", region.GetBitmap(), srcX, srcY, srcW, srcH)
  if slice = invalid then return
  sameW = (not scaleX) or (dstW = srcW)
  sameH = (not scaleY) or (dstH = srcH)
  if sameW and sameH then
    screen.DrawObject(dstX, dstY, slice)
  else
    screen.DrawScaledObject(dstX, dstY, dstW, dstH, slice)
  end if
end sub

' ── Fallback (no image) ────────────────────────────────────────────────────────

sub _NS_FallbackRect(screen as Object, x as Integer, y as Integer, w as Integer, h as Integer, opacity as Float)
  if screen = invalid then return
  screen.DrawRect(x, y, w, h, RokuEngine_ApplyAlpha(&h1E2F45FF, opacity))
  RokuEngine_DrawUiOutlineRect(screen, x, y, w, h, RokuEngine_ApplyAlpha(&h5e759480, opacity))
end sub

' ── Utility ───────────────────────────────────────────────────────────────────

function _NS_Clamp(v as Integer, lo as Integer, hi as Integer) as Integer
  if v < lo then return lo
  if v > hi then return hi
  return v
end function

function _NS_Min(a as Integer, b as Integer) as Integer
  if a < b then return a
  return b
end function

' ── Style resolution ──────────────────────────────────────────────────────────
' Looks up a NineSliceStyle by id from the engine's resource manifest.
' Returns invalid if not found.

function RokuEngine_ResolveNineSliceStyle(engine as Object, styleId as String) as Object
  if engine = invalid or styleId = "" then return invalid
  manifest = engine.GetResourceManifest()
  if manifest = invalid then return invalid
  styles = manifest.nineSliceStyles
  if styles = invalid then return invalid
  return styles[styleId]
end function
