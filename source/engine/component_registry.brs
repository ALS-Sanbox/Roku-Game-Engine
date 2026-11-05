' component_registry.brs - registry-driven native component execution

function RokuEngine_CreateComponentRegistry() as Object
  return {
    definitions: {}
  }
end function

sub RokuEngine_RegisterBuiltinComponents(registry as Object)
  if registry = invalid then return

  m.RegisterComponentDefinition({
    type: "EnemyAIComponent"
    defaultPriority: 90
    phases: ["update"]
    handlers: {
      update: RokuComponent_EnemyAI_Update
    }
  })

  m.RegisterComponentDefinition({
    type: "ObjectPoolComponent"
    defaultPriority: 10
    phases: ["pre_update"]
    handlers: {
      pre_update: RokuComponent_ObjectPool_PreUpdate
    }
  })

  m.RegisterComponentDefinition({
    defaultPriority: 120
    type: "MoveComponent"
    phases: ["update"]
    handlers: {
      update: RokuComponent_Move_Update
    }
  })

  m.RegisterComponentDefinition({
    type: "SpinComponent"
    defaultPriority: 130
    phases: ["update"]
    handlers: {
      update: RokuComponent_Spin_Update
    }
  })

  m.RegisterComponentDefinition({
    type: "BobComponent"
    defaultPriority: 140
    phases: ["update"]
    handlers: {
      update: RokuComponent_Bob_Update
    }
  })

  m.RegisterComponentDefinition({
    type: "FollowInputComponent"
    defaultPriority: 100
    phases: ["input"]
    handlers: {
      input: RokuComponent_FollowInput_Input
    }
  })

  m.RegisterComponentDefinition({
    type: "InputControllerComponent"
    defaultPriority: 110
    phases: ["input"]
    handlers: {
      input: RokuComponent_InputController_Input
    }
  })

  m.RegisterComponentDefinition({
    type: "RigidBody2DComponent"
    defaultPriority: 120
    phases: ["fixed_update"]
    handlers: {
      fixed_update: RokuComponent_RigidBody_FixedUpdate
    }
  })

  m.RegisterComponentDefinition({
    type: "AnimationPlayerComponent"
    defaultPriority: 350
    phases: ["input", "update"]
    handlers: {
      input: RokuComponent_AnimationPlayer_Input
      update: RokuComponent_AnimationPlayer_Update
    }
  })

  m.RegisterComponentDefinition({
    type: "AudioSourceComponent"
    defaultPriority: 400
    phases: ["input", "audio"]
    handlers: {
      input: RokuComponent_AudioSource_Input
      audio: RokuComponent_AudioSource_Audio
    }
  })

  m.RegisterComponentDefinition({
    type: "ScriptComponent"
    defaultPriority: 300
    phases: ["input", "pre_update", "fixed_update", "update", "late_update", "post_update"]
    handlers: {
      input: RokuComponent_Script_Input
      pre_update: RokuComponent_Script_PreUpdate
      fixed_update: RokuComponent_Script_FixedUpdate
      update: RokuComponent_Script_Update
      late_update: RokuComponent_Script_LateUpdate
      post_update: RokuComponent_Script_PostUpdate
    }
  })
end sub

sub RokuEngine_RegisterComponentDefinition(definition as Object)
  if m.componentRegistry = invalid then m.componentRegistry = RokuEngine_CreateComponentRegistry()
  if definition = invalid then return
  if definition.type = invalid or definition.type = "" then return

  normalized = {
    type: definition.type
    defaultPriority: 200
    phases: []
    handlers: {}
  }
  if definition.defaultPriority <> invalid then normalized.defaultPriority = Int(definition.defaultPriority)
  if type(definition.phases) = "roArray" then normalized.phases = definition.phases
  if definition.handlers <> invalid then normalized.handlers = definition.handlers
  if definition.init <> invalid then normalized.init = definition.init
  if definition.validate <> invalid then normalized.validate = definition.validate

  m.componentRegistry.definitions[normalized.type] = normalized
end sub

function RokuEngine_GetComponentDefinition(typeName as Dynamic) as Dynamic
  if m.componentRegistry = invalid or m.componentRegistry.definitions = invalid then return invalid
  resolvedType = ""
  if GetInterface(typeName, "ifAssociativeArray") <> invalid then
    if typeName.type <> invalid then resolvedType = RokuEngine_ToString(typeName.type)
  else if typeName <> invalid then
    resolvedType = RokuEngine_ToString(typeName)
  end if
  resolvedType = RokuEngine_Trim(resolvedType)
  if resolvedType = "" then return invalid
  if m.componentRegistry.definitions.DoesExist(resolvedType) <> true then return invalid
  return m.componentRegistry.definitions[resolvedType]
end function

function RokuEngine_GetComponentPhaseMetadata(typeName as Dynamic) as Dynamic
  definition = m.GetComponentDefinition(typeName)
  if definition = invalid then return invalid
  return {
    phases: definition.phases
    priority: definition.defaultPriority
  }
end function

sub RokuEngine_InvokeComponentPhase(node as Object, component as Object, phase as String, dt as Float, event as Dynamic)
  if node = invalid or component = invalid then return
  definition = m.GetComponentDefinition(component)
  if definition = invalid then return
  phaseKey = LCase(RokuEngine_Trim(RokuEngine_ToString(phase)))
  if phaseKey = "" then return
  handlers = definition.handlers
  if handlers = invalid or handlers.DoesExist(phaseKey) <> true then return

  runtime = m.EnsureNodeRuntime(node)
  transform = node.transform
  if transform = invalid then
    transform = {}
    node.transform = transform
  end if
  if transform.x = invalid then transform.x = 0.0
  if transform.y = invalid then transform.y = 0.0
  if transform.rotation = invalid then transform.rotation = 0.0
  if node.properties = invalid then node.properties = {}

  if definition.init <> invalid then definition.init(node, component)
  if definition.validate <> invalid then definition.validate(node, component)

  handler = handlers[phaseKey]
  if handler = invalid then return
  context = {
    engine: m
    node: node
    component: component
    phase: phaseKey
    dt: dt
    event: event
    runtime: runtime
    transform: transform
    props: node.properties
    definition: definition
  }
  handler(context)
end sub

sub RokuComponent_Move_Update(ctx as Object)
  vx = 0.0
  vy = 0.0
  if ctx.component.vx <> invalid then vx = ctx.component.vx
  if ctx.component.vy <> invalid then vy = ctx.component.vy
  ctx.transform.x = ctx.transform.x + (vx * ctx.dt)
  ctx.transform.y = ctx.transform.y + (vy * ctx.dt)
end sub

sub RokuComponent_Spin_Update(ctx as Object)
  for each body in ctx.node.components
    if body.type = "RigidBody2DComponent" and body.enabled <> false and body.lockRotation <> false then return
  end for
  speed = 90.0
  if ctx.component.degreesPerSecond <> invalid then speed = ctx.component.degreesPerSecond
  ctx.transform.rotation = ctx.transform.rotation + (speed * ctx.dt)
end sub

sub RokuComponent_Bob_Update(ctx as Object)
  if ctx.runtime.bobElapsed = invalid then ctx.runtime.bobElapsed = 0.0
  ctx.runtime.bobElapsed = ctx.runtime.bobElapsed + ctx.dt
  amplitude = 16.0
  speed = 2.0
  phaseOffset = 0.0
  axis = "y"
  if ctx.component.amplitude <> invalid then amplitude = ctx.component.amplitude
  if ctx.component.speed <> invalid then speed = ctx.component.speed
  if ctx.component.phase <> invalid then phaseOffset = ctx.component.phase
  if ctx.component.axis <> invalid then axis = LCase(RokuEngine_ToString(ctx.component.axis))
  if ctx.runtime.bobBaseX = invalid then ctx.runtime.bobBaseX = ctx.transform.x
  if ctx.runtime.bobBaseY = invalid then ctx.runtime.bobBaseY = ctx.transform.y
  offset = Sin((ctx.runtime.bobElapsed * speed) + phaseOffset) * amplitude
  if axis = "x" then
    ctx.transform.x = ctx.runtime.bobBaseX + offset
  else
    ctx.transform.y = ctx.runtime.bobBaseY + offset
  end if
end sub

sub RokuComponent_RigidBody_FixedUpdate(ctx as Object)
  ctx.engine.ApplyRigidBodyMotion(ctx.node, ctx.component, ctx.dt)
end sub

sub RokuComponent_FollowInput_Input(ctx as Object)
  RokuComponent_HandleDirectionalInput(ctx, true)
end sub

sub RokuComponent_InputController_Input(ctx as Object)
  RokuComponent_HandleDirectionalInput(ctx, false)
end sub

sub RokuComponent_HandleDirectionalInput(ctx as Object, useFollowSpeed as Boolean)
  code = invalid
  actionKey = ""
  if ctx.event <> invalid and ctx.event.code <> invalid then code = ctx.event.code
  if ctx.event <> invalid and ctx.event.action <> invalid then actionKey = LCase(RokuEngine_Trim(RokuEngine_ToString(ctx.event.action)))
  if code = invalid and actionKey = "" then return

  speed = 24.0
  if useFollowSpeed then
    if ctx.component.speed <> invalid then speed = ctx.component.speed
  else
    if ctx.component.moveStep <> invalid then speed = ctx.component.moveStep
  end if

  controlsCamera = false
  if ctx.component.controlsCamera = true then controlsCamera = true
  allowHorizontal = true
  allowVertical = true
  if ctx.component.allowHorizontal = false then allowHorizontal = false
  if ctx.component.allowVertical = false then allowVertical = false

  if actionKey = "move_up" and allowVertical then
    if controlsCamera then ctx.engine.scene.cameraY = ctx.engine.scene.cameraY - speed else ctx.transform.y = ctx.transform.y - speed
  else if actionKey = "move_down" and allowVertical then
    if controlsCamera then ctx.engine.scene.cameraY = ctx.engine.scene.cameraY + speed else ctx.transform.y = ctx.transform.y + speed
  else if actionKey = "move_left" and allowHorizontal then
    if controlsCamera then ctx.engine.scene.cameraX = ctx.engine.scene.cameraX - speed else ctx.transform.x = ctx.transform.x - speed
  else if actionKey = "move_right" and allowHorizontal then
    if controlsCamera then ctx.engine.scene.cameraX = ctx.engine.scene.cameraX + speed else ctx.transform.x = ctx.transform.x + speed
  end if
end sub

sub RokuComponent_AnimationPlayer_Update(ctx as Object)
  if ctx.component.animation <> invalid and ctx.component.animation <> "" then ctx.props.animation = ctx.component.animation
  if ctx.component.autoplay <> invalid and ctx.props.autoplay = invalid then ctx.props.autoplay = ctx.component.autoplay
  if ctx.component.playing <> invalid and ctx.runtime.animationInputToggled <> true then ctx.props.playing = ctx.component.playing
  if ctx.props.speedScale <> invalid then
    ctx.runtime.animationSpeedScale = ctx.props.speedScale
  else if ctx.component.speedScale <> invalid then
    ctx.runtime.animationSpeedScale = ctx.component.speedScale
  else if ctx.runtime.animationSpeedScale = invalid then
    ctx.runtime.animationSpeedScale = 1.0
  end if

  if ctx.node.type <> "AnimatedSprite2D" then return

  if ctx.runtime.elapsed = invalid then ctx.runtime.elapsed = 0.0
  if ctx.runtime.animationSpeedScale = invalid then ctx.runtime.animationSpeedScale = 1.0
  playing = true
  if ctx.props.playing = false then playing = false
  if ctx.props.autoplay = false and ctx.runtime.animationStarted <> true and ctx.props.playing <> true then playing = false
  if ctx.props.autoplay = true then ctx.runtime.animationStarted = true
  if ctx.props.playing = true then ctx.runtime.animationStarted = true
  if playing then ctx.runtime.elapsed = ctx.runtime.elapsed + (ctx.dt * ctx.runtime.animationSpeedScale)

  frames = ctx.engine.BuildAnimationFrames(ctx.node)
  frameCount = frames.Count()
  if frameCount <= 0 then return

  frameIndex = ctx.engine.ComputeAnimationFrameIndex(ctx.node, frameCount)
  ctx.runtime.currentAnimationFrameIndex = frameIndex
  if ctx.runtime.playbackMode = "once" and Int(ctx.runtime.elapsed * ctx.runtime.fps) >= frameCount then
    ctx.props.playing = false
  end if
end sub

sub RokuComponent_AnimationPlayer_Input(ctx as Object)
  code = invalid
  actionKey = ""
  if ctx.event <> invalid and ctx.event.code <> invalid then code = ctx.event.code
  if ctx.event <> invalid and ctx.event.action <> invalid then actionKey = LCase(RokuEngine_Trim(RokuEngine_ToString(ctx.event.action)))
  if code = invalid and actionKey = "" then return

  triggerAction = RokuComponent_ResolveTriggerAction(ctx)
  if actionKey = triggerAction then
    ctx.props.playing = not ctx.props.playing
    ctx.runtime.animationInputToggled = true
  end if
end sub

sub RokuComponent_AudioSource_Input(ctx as Object)
  runtime = RokuAudio_GetRuntime(ctx.engine,ctx.node,ctx.component)
  if ctx.event <> invalid and ctx.event.isPress = false then return
  code = invalid
  actionKey = ""
  if ctx.event <> invalid and ctx.event.code <> invalid then code = ctx.event.code
  if ctx.event <> invalid and ctx.event.action <> invalid then actionKey = LCase(RokuEngine_Trim(RokuEngine_ToString(ctx.event.action)))
  if code = invalid and actionKey = "" then return

  triggerAction = RokuComponent_ResolveTriggerAction(ctx)
  if ctx.component.playOnInput = true and actionKey = triggerAction then
    ctx.engine.PlayNodeAudio(ctx.node, ctx.component)
    if runtime.audioReady = true and runtime.audioPlayer <> invalid then
      runtime.audioPlayer.Stop()
      runtime.audioPlayer.Play()
    end if
  end if
end sub

sub RokuComponent_AudioSource_Audio(ctx as Object)
  ctx.engine.PlayNodeAudio(ctx.node, ctx.component)
  runtime = RokuAudio_GetRuntime(ctx.engine,ctx.node,ctx.component)
  if runtime.audioReady = true and runtime.audioPlayer <> invalid then
    ' Check playOnAwake from the audio manifest (single source of truth)
    shouldAutoplay = false
    if ctx.engine.resources <> invalid then
      clipMeta = invalid
      if ctx.component.audioId <> invalid then clipMeta = ctx.engine.resources.GetAudio(ctx.component.audioId)
      if clipMeta = invalid and ctx.component.resourcePath <> invalid then clipMeta = ctx.engine.resources.GetAudioByPath(ctx.component.resourcePath)
      if clipMeta <> invalid and (clipMeta.playOnAwake = true or clipMeta.autoplay = true) then
        shouldAutoplay = true
      end if
    end if
    if shouldAutoplay = true and runtime.audioAutoplayStarted <> true then
      runtime.audioPlayer.Stop()
      runtime.audioPlayer.Play()
      runtime.audioAutoplayStarted = true
    end if
  end if
end sub

function RokuComponent_ResolveTriggerAction(ctx as Object) as String
  triggerAction = "action"
  if ctx.component.triggerAction <> invalid and ctx.component.triggerAction <> "" then
    triggerAction = LCase(RokuEngine_Trim(RokuEngine_ToString(ctx.component.triggerAction)))
  else if ctx.component.triggerButton <> invalid then
    triggerAction = LCase(RokuEngine_Trim(RokuEngine_ToString(ctx.engine.GetActionForButtonCode(ctx.component.triggerButton))))
  end if
  return triggerAction
end function

sub RokuComponent_Script_Input(ctx as Object)
  code = invalid
  actionKey = ""
  rawEvent = invalid
  if ctx.event <> invalid then
    if ctx.event.code <> invalid then code = ctx.event.code
    if ctx.event.action <> invalid then actionKey = LCase(RokuEngine_Trim(RokuEngine_ToString(ctx.event.action)))
    if ctx.event.raw <> invalid then rawEvent = ctx.event.raw
  end if
  if code = invalid and actionKey = "" then return
  ctx.engine.EnsureScriptReady(ctx.node, ctx.component, ctx.dt)
  inputEvent = { name: "Input", code: code, action: actionKey, raw: rawEvent, phase: "input" }
  ctx.engine.InvokeScriptComponent(ctx.node, ctx.component, "Input", ctx.dt, inputEvent)
end sub

sub RokuComponent_Script_PreUpdate(ctx as Object)
  RokuComponent_InvokeScriptHook(ctx, "PreUpdate", "pre_update")
end sub

sub RokuComponent_Script_FixedUpdate(ctx as Object)
  RokuComponent_InvokeScriptHook(ctx, "PhysicsUpdate", "physics_update")
end sub

sub RokuComponent_Script_Update(ctx as Object)
  RokuComponent_InvokeScriptHook(ctx, "Update", "update")
end sub

sub RokuComponent_Script_LateUpdate(ctx as Object)
  RokuComponent_InvokeScriptHook(ctx, "LateUpdate", "late_update")
end sub

sub RokuComponent_Script_PostUpdate(ctx as Object)
  RokuComponent_InvokeScriptHook(ctx, "PostUpdate", "post_update")
end sub

sub RokuComponent_InvokeScriptHook(ctx as Object, hookName as String, phaseName as String)
  ctx.engine.EnsureScriptReady(ctx.node, ctx.component, ctx.dt)
  ctx.engine.InvokeScriptComponent(ctx.node, ctx.component, hookName, ctx.dt, { name: hookName, phase: phaseName })
end sub
