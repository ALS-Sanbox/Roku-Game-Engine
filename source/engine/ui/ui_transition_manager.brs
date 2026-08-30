' ui_transition_manager.brs — RGE Phase 7: UI Transition & Loading Screen
'
' Transition types:
'   instant | fade | slide_left | slide_right | slide_up | slide_down | wipe
'
' Transition phases:
'   out   — animate out (covers the screen from t=0→1)
'   hold  — fully covered (execute the scene/screen change)
'   in    — animate in  (reveals the new screen from t=1→0)
'
' Input is blocked while blockInput=true.
' Duplicate starts are silently ignored (only one transition at a time).
'
' Loading screen:
'   When waitForLoad=true the "hold" phase stays until m.transitionMgr.loadComplete=true.
'   Call RGE_UI_SetLoadProgress(fraction) to drive the progress bar.
'   Call RGE_UI_MarkLoadComplete() to release the transition.

' ── Easing library ─────────────────────────────────────────────────────────────

function _TM_Ease(t as Float, easing as String) as Float
  t = _TM_Clamp01(t)
  if easing = "linear" then return t
  if easing = "ease_in"    then return t * t
  if easing = "ease_out"   then return 1.0 - (1.0 - t) * (1.0 - t)
  if easing = "ease_in_out" then
    if t < 0.5 then return 2.0 * t * t
    return 1.0 - 2.0 * (1.0 - t) * (1.0 - t)
  end if
  if easing = "elastic_out" then
    if t = 0.0 or t = 1.0 then return t
    c4 = (2.0 * 3.14159265) / 3.0
    return Float(Exp(-Float(10.0) * (t - 1.0))) * Float(Sin((t * 10.0 - 10.75) * c4)) + 1.0
  end if
  return t   ' default: linear
end function

function _TM_Clamp01(v as Float) as Float
  if v < 0.0 then return 0.0
  if v > 1.0 then return 1.0
  return v
end function

' ── Init ──────────────────────────────────────────────────────────────────────

sub RokuEngine_InitializeTransitionManager()
  if m.transitionMgr = invalid then
    m.transitionMgr = {
      active:        false
      phase:         ""        ' "out" | "hold" | "in"
      transType:     "instant"
      duration:      0.3
      easing:        "ease_in_out"
      color:         &h000000FF
      blockInput:    true
      waitForLoad:   false
      loadProgress:  0.0
      loadComplete:  false
      elapsed:       0.0
      t:             0.0       ' normalised [0,1]
      ' Pending action to execute at mid-point (hold phase)
      pendingAction:       ""   ' "screen" | "scene"
      pendingTarget:       ""
      pendingOptions:      invalid
      ' Loading screen text
      loadingLabel:        "Loading..."
      showLoadingProgress: true
      ' Fake progress (when no real progress hook)
      fakeProgress:        false
      fakeProgressRate:    0.6   ' fraction per second
    }
  end if
end sub

' ── Main update tick (call every frame from RunPreUpdatePhase) ─────────────────

sub RokuEngine_UpdateTransition(dt as Float)
  m.InitializeTransitionManager()
  tm = m.transitionMgr
  if not tm.active then return

  tm.elapsed = tm.elapsed + dt

  ' Fake progress advance
  if tm.phase = "hold" and tm.fakeProgress and not tm.loadComplete then
    tm.loadProgress = tm.loadProgress + tm.fakeProgressRate * dt
    if tm.loadProgress >= 0.95 then tm.loadProgress = 0.95
  end if

  ' Phase progression
  half = tm.duration * 0.5
  if tm.transType = "instant" then
    tm.t = 1.0
    if tm.phase = "out" then
      tm.phase = "hold"
      tm.elapsed = 0.0
      _TM_ExecutePendingAction()
    else if tm.phase = "hold" then
      if (not tm.waitForLoad) or tm.loadComplete then
        tm.loadProgress = 1.0
        tm.phase = "in"
        tm.elapsed = 0.0
      end if
    else if tm.phase = "in" then
      _TM_Finish()
    end if
  else
    if tm.phase = "out" then
      tm.t = _TM_Ease(_TM_Clamp01(tm.elapsed / half), tm.easing)
      if tm.elapsed >= half then
        tm.t = 1.0
        tm.phase = "hold"
        tm.elapsed = 0.0
        _TM_ExecutePendingAction()
      end if
    else if tm.phase = "hold" then
      tm.t = 1.0
      if (not tm.waitForLoad) or tm.loadComplete then
        tm.loadProgress = 1.0
        tm.phase = "in"
        tm.elapsed = 0.0
      end if
    else if tm.phase = "in" then
      tm.t = 1.0 - _TM_Ease(_TM_Clamp01(tm.elapsed / half), tm.easing)
      if tm.elapsed >= half then
        _TM_Finish()
      end if
    end if
  end if
end sub

sub _TM_ExecutePendingAction()
  tm = m.transitionMgr
  if tm.pendingAction = "screen" then
    RGE_UI_ChangeScreen(tm.pendingTarget)
  else if tm.pendingAction = "push_screen" then
    RGE_UI_PushScreen(tm.pendingTarget)
  else if tm.pendingAction = "pop_screen" then
    RGE_UI_PopScreen()
  else if tm.pendingAction = "scene" then
    m.QueueSceneChange(tm.pendingTarget)
  else if tm.pendingAction = "push_scene" then
    m.PushScene(tm.pendingTarget)
  else if tm.pendingAction = "pop_scene" then
    m.PopScene()
  end if
end sub

sub _TM_Finish()
  m.transitionMgr.active   = false
  m.transitionMgr.phase    = ""
  m.transitionMgr.t        = 0.0
  m.transitionMgr.elapsed  = 0.0
  m.transitionMgr.loadProgress = 0.0
  m.transitionMgr.loadComplete = false
  m.transitionMgr.pendingAction = ""
  m.transitionMgr.pendingTarget = ""
end sub

' ── Public start API ──────────────────────────────────────────────────────────

' RGE_UI_StartTransition — raw start, executes no action at mid-point.
' options AA fields (all optional):
'   duration       Float   seconds (default 0.3)
'   easing         String  "ease_in_out"|"linear"|"ease_in"|"ease_out"|"elastic_out"
'   color          Int     RGBA  (default black)
'   blockInput     Bool
'   waitForLoad    Bool
'   loadingLabel   String
'   fakeProgress   Bool
'   showLoadingProgress Bool

sub RGE_UI_StartTransition(transType as String, options as Dynamic)
  m.InitializeTransitionManager()
  tm = m.transitionMgr
  if tm.active then return   ' prevent duplicate

  if transType = invalid or transType = "" then transType = "fade"
  tm.active       = true
  tm.transType    = LCase(Trim(Str(transType)))
  tm.phase        = "out"
  tm.elapsed      = 0.0
  tm.t            = 0.0
  tm.loadProgress = 0.0
  tm.loadComplete = false

  ' Apply options
  tm.duration      = 0.3
  tm.easing        = "ease_in_out"
  tm.color         = &h000000FF
  tm.blockInput    = true
  tm.waitForLoad   = false
  tm.loadingLabel  = "Loading..."
  tm.fakeProgress  = false
  tm.showLoadingProgress = true
  tm.fakeProgressRate    = 0.6

  if options <> invalid and type(options) = "roAssociativeArray" then
    if options.duration    <> invalid then tm.duration    = Float(options.duration)
    if options.easing      <> invalid then tm.easing      = LCase(Trim(Str(options.easing)))
    if options.color       <> invalid then tm.color       = Int(options.color)
    if options.blockInput  <> invalid then tm.blockInput  = (options.blockInput = true)
    if options.waitForLoad <> invalid then tm.waitForLoad = (options.waitForLoad = true)
    if options.loadingLabel <> invalid then tm.loadingLabel = Trim(Str(options.loadingLabel))
    if options.fakeProgress <> invalid then tm.fakeProgress = (options.fakeProgress = true)
    if options.showLoadingProgress <> invalid then tm.showLoadingProgress = (options.showLoadingProgress = true)
    if options.fakeProgressRate <> invalid then tm.fakeProgressRate = Float(options.fakeProgressRate)
  end if

  ' Auto-enable fake progress when waitForLoad requested but no real hook exists
  if tm.waitForLoad and not tm.fakeProgress then tm.fakeProgress = true
end sub

' RGE_UI_IsTransitionActive — returns true while any transition is running
function RGE_UI_IsTransitionActive() as Boolean
  m.InitializeTransitionManager()
  return m.transitionMgr.active = true
end function

' RGE_UI_TransitionToScreen — transition then change screen
sub RGE_UI_TransitionToScreen(screenName as String, options as Dynamic)
  m.InitializeTransitionManager()
  if m.transitionMgr.active then return
  m.transitionMgr.pendingAction = "screen"
  m.transitionMgr.pendingTarget = screenName
  transType = "fade"
  if options <> invalid and type(options) = "roAssociativeArray" and options.transType <> invalid then
    transType = Trim(Str(options.transType))
  end if
  RGE_UI_StartTransition(transType, options)
end sub

' RGE_UI_TransitionToScene — transition then change scene
sub RGE_UI_TransitionToScene(sceneName as String, options as Dynamic)
  m.InitializeTransitionManager()
  if m.transitionMgr.active then return
  m.transitionMgr.pendingAction = "scene"
  m.transitionMgr.pendingTarget = sceneName
  transType = "fade"
  if options <> invalid and type(options) = "roAssociativeArray" and options.transType <> invalid then
    transType = Trim(Str(options.transType))
  end if
  RGE_UI_StartTransition(transType, options)
end sub

' RGE_UI_SetLoadProgress — drive the loading progress bar (0.0 – 1.0)
sub RGE_UI_SetLoadProgress(fraction as Float)
  m.InitializeTransitionManager()
  if fraction < 0.0 then fraction = 0.0
  if fraction > 1.0 then fraction = 1.0
  m.transitionMgr.loadProgress = fraction
end sub

' RGE_UI_MarkLoadComplete — release the hold phase
sub RGE_UI_MarkLoadComplete()
  m.InitializeTransitionManager()
  m.transitionMgr.loadProgress = 1.0
  m.transitionMgr.loadComplete = true
end sub

' ── Input guard ───────────────────────────────────────────────────────────────

' Returns true if input should be blocked this frame (call before ProcessInputPhase)
function RGE_UI_IsInputBlocked() as Boolean
  m.InitializeTransitionManager()
  tm = m.transitionMgr
  return tm.active and tm.blockInput = true
end function

' ── Render transition overlay ─────────────────────────────────────────────────
' Call AFTER RenderUiPass so it draws on top of all UI.

sub RokuEngine_RenderTransitionOverlay()
  m.InitializeTransitionManager()
  tm = m.transitionMgr
  if not tm.active then return
  if tm.t <= 0.0 then return

  sw = m.width
  sh = m.height
  if sw <= 0 or sh <= 0 then sw = 1280 : sh = 720

  t     = tm.t
  color = tm.color
  alpha = Int(t * 255.0)
  if alpha > 255 then alpha = 255
  if alpha < 0   then alpha = 0

  ' Compose RGBA with computed alpha
  baseR = Int(color / 16777216) and 255
  baseG = Int(color / 65536)    and 255
  baseB = Int(color / 256)      and 255
  overlayColor = (baseR * 16777216) + (baseG * 65536) + (baseB * 256) + alpha

  tt = tm.transType
  if tt = "instant" or tt = "fade" then
    m.screen.DrawRect(0, 0, sw, sh, overlayColor)

  else if tt = "slide_left" then
    ' Overlay slides in from the right, revealing black behind
    x = Int(sw * (1.0 - t))
    m.screen.DrawRect(0, 0, x, sh, &h000000FF)  ' exposed area
    m.screen.DrawRect(x, 0, sw - x, sh, overlayColor)

  else if tt = "slide_right" then
    x = Int(sw * t)
    m.screen.DrawRect(x, 0, sw - x, sh, &h000000FF)
    m.screen.DrawRect(0, 0, x, sh, overlayColor)

  else if tt = "slide_up" then
    y = Int(sh * (1.0 - t))
    m.screen.DrawRect(0, 0, sw, y, &h000000FF)
    m.screen.DrawRect(0, y, sw, sh - y, overlayColor)

  else if tt = "slide_down" then
    y = Int(sh * t)
    m.screen.DrawRect(0, y, sw, sh - y, &h000000FF)
    m.screen.DrawRect(0, 0, sw, y, overlayColor)

  else if tt = "wipe" then
    ' Horizontal wipe from left
    wipeW = Int(sw * t)
    m.screen.DrawRect(0, 0, wipeW, sh, overlayColor)

  else
    ' Unknown type fallback → fade
    m.screen.DrawRect(0, 0, sw, sh, overlayColor)
  end if

  ' Loading screen (shown during hold phase when waitForLoad=true)
  if tm.phase = "hold" and tm.waitForLoad then
    _TM_DrawLoadingScreen(sw, sh, tm)
  end if
end sub

' ── Loading screen draw ───────────────────────────────────────────────────────

sub _TM_DrawLoadingScreen(sw as Integer, sh as Integer, tm as Object)
  ' Spinner (text-based, no image needed)
  spinFrames = ["|", "/", "-", "\\"]
  spinIdx    = Int(tm.elapsed * 6.0) mod 4
  spinChar   = spinFrames[spinIdx]

  fontReg  = CreateObject("roFontRegistry")
  fontSm   = fontReg.GetDefaultFont(24, false, false)
  fontLg   = fontReg.GetDefaultFont(36, false, false)
  fontIcon = fontReg.GetDefaultFont(48, false, false)
  if fontSm = invalid then fontSm   = fontReg.GetDefaultFont()
  if fontLg = invalid then fontLg   = fontReg.GetDefaultFont()
  if fontIcon = invalid then fontIcon = fontReg.GetDefaultFont()

  labelColor  = &hE7EEF7FF
  dimColor    = &h8899AAFF
  spinColor   = &hFFFFFFFF
  trackColor  = &h1A2638FF
  fillColor   = &h4A90D9FF
  borderColor = &h5E7594FF

  ' Center layout
  cx = sw / 2
  cy = sh / 2

  ' Spinner icon
  spinW = fontIcon.GetOneLineWidth(spinChar, 60)
  m.screen.DrawText(spinChar, cx - spinW / 2, cy - 70, spinColor, fontIcon)

  ' Loading label
  label = tm.loadingLabel
  if label = invalid or label = "" then label = "Loading..."
  labelW = fontLg.GetOneLineWidth(label, sw - 100)
  m.screen.DrawText(label, cx - labelW / 2, cy - 10, labelColor, fontLg)

  ' Progress bar
  if tm.showLoadingProgress then
    barW  = 400
    barH  = 14
    barX  = cx - barW / 2
    barY  = cy + 40

    ' Track
    m.screen.DrawRect(barX, barY, barW, barH, trackColor)
    ' Fill
    fillW = Int(barW * tm.loadProgress)
    if fillW > 0 then m.screen.DrawRect(barX, barY, fillW, barH, fillColor)
    ' Border outline (4 lines)
    m.screen.DrawLine(barX, barY, barX + barW, barY, borderColor)
    m.screen.DrawLine(barX, barY + barH, barX + barW, barY + barH, borderColor)
    m.screen.DrawLine(barX, barY, barX, barY + barH, borderColor)
    m.screen.DrawLine(barX + barW, barY, barX + barW, barY + barH, borderColor)

    ' Percentage
    pct = Int(tm.loadProgress * 100)
    pctStr = Trim(Str(pct)) + "%"
    pctW = fontSm.GetOneLineWidth(pctStr, 80)
    m.screen.DrawText(pctStr, cx - pctW / 2, barY + barH + 8, dimColor, fontSm)
  end if
end sub
