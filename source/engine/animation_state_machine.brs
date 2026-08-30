' animation_state_machine.brs — RGE v91
' Animation graph runtime for Roku.
' Mirrors the editor-side animation_state_machine.js exactly.
'
' Usage:
'   graph  = RokuAnim_LoadGraph(engine, "pkg:/assets/anim/hero.graph.json")
'   ctrl   = RokuAnim_CreateController(graph)
'   RokuAnim_SetFloat(ctrl, "Speed", 5.0)
'   result = RokuAnim_Update(ctrl, dt)
'   ' result.frameIndex → use in sprite renderer

' ── Graph loader ──────────────────────────────────────────────────────────────

function RokuAnim_LoadGraph(engine as Object, path as String) as Dynamic
  if engine = invalid then return invalid
  rm = engine.resources
  if rm = invalid then return invalid
  doc = rm.GetJsonDocument(path)
  if doc = invalid or type(doc) <> "roAssociativeArray" then return invalid

  graph = {
    id:           doc.id
    name:         doc.name
    defaultState: doc.defaultState
    parameters:   {}
    states:       {}
    clips:        {}
    transitions:  []
  }

  ' parameters
  if type(doc.parameters) = "roAssociativeArray" then
    for each key in doc.parameters
      p = doc.parameters[key]
      if type(p) = "roAssociativeArray" then
        graph.parameters[key] = { type: p.type, defaultValue: p.defaultValue }
      end if
    end for
  end if

  ' clips
  if type(doc.clips) = "roArray" then
    for each c in doc.clips
      if type(c) = "roAssociativeArray" and c.id <> invalid then
        clip = {
          id:             c.id
          name:           c.name
          frames:         c.frames
          fps:            8
          loop:           true
          spriteFramesId: ""
          events:         []
        }
        if c.fps <> invalid then clip.fps = c.fps
        if c.loop = false then clip.loop = false
        if c.spriteFramesId <> invalid then clip.spriteFramesId = c.spriteFramesId
        if type(c.events) = "roArray" then clip.events = c.events
        graph.clips[c.id] = clip
      end if
    end for
  end if

  ' states
  if type(doc.states) = "roArray" then
    for each s in doc.states
      if type(s) = "roAssociativeArray" and s.id <> invalid then
        state = {
          id:     s.id
          name:   s.name
          clipId: ""
          speed:  1.0
          loop:   true
        }
        if s.clipId <> invalid then state.clipId = s.clipId
        if s.speed  <> invalid then state.speed  = s.speed
        if s.loop = false then state.loop = false
        graph.states[s.id] = state
      end if
    end for
  end if

  ' transitions
  if type(doc.transitions) = "roArray" then
    for each t in doc.transitions
      if type(t) = "roAssociativeArray" then
        tr = {
          id:          t.id
          from:        t.from
          to:          t.to
          conditions:  []
          hasExitTime: false
          exitTime:    1.0
          duration:    0.1
        }
        if t.hasExitTime = true then tr.hasExitTime = true
        if t.exitTime  <> invalid then tr.exitTime  = t.exitTime
        if t.duration  <> invalid then tr.duration  = t.duration
        if type(t.conditions) = "roArray" then tr.conditions = t.conditions
        graph.transitions.Push(tr)
      end if
    end for
  end if

  return graph
end function

' ── Controller ────────────────────────────────────────────────────────────────

function RokuAnim_CreateController(graph as Dynamic) as Dynamic
  if graph = invalid then return invalid
  ctrl = {
    graph:          graph
    currentStateId: graph.defaultState
    elapsed:        0.0
    frameIndex:     0
    params:         {}
    _dirty:         true
  }
  ' init params with defaults
  for each key in graph.parameters
    p = graph.parameters[key]
    ctrl.params[key] = { type: p.type, value: p.defaultValue }
  end for
  return ctrl
end function

' ── Parameter setters ─────────────────────────────────────────────────────────

sub RokuAnim_SetFloat(ctrl as Object, name as String, value as Float)
  if ctrl = invalid or ctrl.params[name] = invalid then return
  ctrl.params[name].value = value
end sub

sub RokuAnim_SetBool(ctrl as Object, name as String, value as Boolean)
  if ctrl = invalid or ctrl.params[name] = invalid then return
  ctrl.params[name].value = value
end sub

sub RokuAnim_SetInt(ctrl as Object, name as String, value as Integer)
  if ctrl = invalid or ctrl.params[name] = invalid then return
  ctrl.params[name].value = value
end sub

sub RokuAnim_SetTrigger(ctrl as Object, name as String)
  if ctrl = invalid or ctrl.params[name] = invalid then return
  ctrl.params[name].value = true
end sub

' ── Update ────────────────────────────────────────────────────────────────────

function RokuAnim_Update(ctrl as Object, dt as Float) as Object
  result = { stateId: "", clipId: "", frameIndex: 0, changed: false }
  if ctrl = invalid or ctrl.graph = invalid then return result

  graph = ctrl.graph
  state = graph.states[ctrl.currentStateId]
  if state = invalid then return result

  speed = state.speed
  if speed = invalid then speed = 1.0
  ctrl.elapsed = ctrl.elapsed + dt * speed

  clip = invalid
  if state.clipId <> "" then clip = graph.clips[state.clipId]

  duration = 0.0
  if clip <> invalid and clip.fps > 0 and type(clip.frames) = "roArray" then
    duration = clip.frames.Count() / clip.fps
  end if

  ' evaluate transitions
  changed = false
  for each tr in graph.transitions
    if tr.from = ctrl.currentStateId or tr.from = "*" then
      exitOk = true
      if tr.hasExitTime = true and duration > 0 then
        exitOk = ctrl.elapsed >= tr.exitTime * duration
      end if
      if exitOk and RokuAnim_EvalConditions(tr.conditions, ctrl.params) then
        ctrl.currentStateId = tr.to
        ctrl.elapsed = 0.0
        ctrl.frameIndex = 0
        changed = true
        exit for
      end if
    end if
  end for

  ' recompute current clip after potential state change
  state = graph.states[ctrl.currentStateId]
  clip  = invalid
  if state <> invalid and state.clipId <> "" then clip = graph.clips[state.clipId]

  if clip <> invalid and type(clip.frames) = "roArray" and clip.frames.Count() > 0 and clip.fps > 0 then
    frameF = ctrl.elapsed * clip.fps
    frameCount = clip.frames.Count()
    if clip.loop then
      fi = Int(frameF) Mod frameCount
      if fi < 0 then fi = fi + frameCount
      ctrl.frameIndex = fi
    else
      ctrl.frameIndex = Int(frameF)
      if ctrl.frameIndex >= frameCount then ctrl.frameIndex = frameCount - 1
    end if
    ' fire frame events
    for each ev in clip.events
      if ev <> invalid and ev.frame = ctrl.frameIndex then
        ' Dispatch via script hooks if available
      end if
    end for
  end if

  ' clear triggers
  for each key in ctrl.params
    p = ctrl.params[key]
    if p <> invalid and p.type = "trigger" then p.value = false
  end for

  result.stateId    = ctrl.currentStateId
  result.clipId     = ""
  result.frameIndex = ctrl.frameIndex
  result.changed    = changed
  if clip <> invalid then
    result.clipId = clip.id
    if type(clip.frames) = "roArray" and ctrl.frameIndex < clip.frames.Count() then
      result.frameIndex = clip.frames[ctrl.frameIndex]
    end if
  end if
  return result
end function

function RokuAnim_EvalConditions(conditions as Dynamic, params as Object) as Boolean
  if type(conditions) <> "roArray" or conditions.Count() = 0 then return false
  for each c in conditions
    if c = invalid then return false
    p = params[c.param]
    if p = invalid then return false
    actual = p.value
    target = c.value
    op     = c.op
    passed = false
    if op = "==" then passed = actual = target
    if op = "!=" then passed = actual <> target
    if op = "<"  then passed = actual < target
    if op = "<=" then passed = actual <= target
    if op = ">"  then passed = actual > target
    if op = ">=" then passed = actual >= target
    if not passed then return false
  end for
  return true
end function

' ── Reset ─────────────────────────────────────────────────────────────────────

sub RokuAnim_Reset(ctrl as Object)
  if ctrl = invalid then return
  ctrl.currentStateId = ctrl.graph.defaultState
  ctrl.elapsed        = 0.0
  ctrl.frameIndex     = 0
  for each key in ctrl.params
    p = ctrl.params[key]
    if p <> invalid then p.value = ctrl.graph.parameters[key].defaultValue
  end for
end sub
