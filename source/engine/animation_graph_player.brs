' AnimationPlayerComponent graph integration. Frame regions still use the
' ordinary sprite cache; transition images are retained only while blending.
function RokuAnim_UpdateNode(ctx as Object) as Boolean
  path = _BRS_StrCoalesce(ctx.component.graphPath, _BRS_StrCoalesce(ctx.props.graphPath, ""))
  rt = ctx.runtime
  if rt.graphPath <> path then
    rt.graphController = invalid : rt.graphPreviousDrawable = invalid
    rt.animationFramesCacheKey = "" : rt.animationFrames = []
    rt.graphPath = path
  end if
  if path = "" then return false
  if rt.graphPath <> path or rt.graphController = invalid then
    graph = RokuAnim_LoadGraph(ctx.engine, ctx.engine.resources.ResolvePkgPath(path))
    if graph = invalid then return false
    rt.graphController = RokuAnim_CreateController(graph) : rt.graphPath = path
    values = ctx.component.graphParameters
    if type(values) = "roString" or type(values) = "String" then values = ParseJSON(values)
    if GetInterface(values, "ifAssociativeArray") <> invalid then
      for each key in values
        if rt.graphController.params.DoesExist(key) then rt.graphController.params[key].value = values[key]
      end for
    end if
  end if
  stepTime = ctx.dt * _BRS_NumCoalesce(ctx.component.speedScale, 1.0)
  if ctx.component.playing = false or ctx.props.playing = false then stepTime = 0
  result = RokuAnim_Update(rt.graphController, stepTime)
  if result.changed then
    rt.graphPreviousDrawable = invalid
    if rt.spriteState <> invalid then rt.graphPreviousDrawable = rt.spriteState.drawable
    rt.graphBlendDuration = result.transitionDuration : rt.graphBlendElapsed = 0.0
    RokuGameplay_Emit(ctx.engine, ctx.node, "AnimationStateChanged", ctx.dt, { stateId: result.stateId, clipId: result.clipId })
  else
    rt.graphBlendElapsed = _BRS_NumCoalesce(rt.graphBlendElapsed, 0)+stepTime
  end if
  rt.graphBlendWeight = 1.0
  if _BRS_NumCoalesce(rt.graphBlendDuration, 0) > 0 then rt.graphBlendWeight = rt.graphBlendElapsed/rt.graphBlendDuration
  if rt.graphBlendWeight >= 1 then rt.graphPreviousDrawable = invalid : rt.graphBlendWeight = 1
  rt.currentAnimationFrameIndex = rt.graphController.frameIndex
  for each ev in result.events
    RokuGameplay_Emit(ctx.engine, ctx.node, "AnimationEvent", ctx.dt, { event: ev, stateId: result.stateId, clipId: result.clipId, frame: result.frameIndex })
  end for
  return true
end function

sub RokuEngine_SetAnimationParameter(nodeId as String, name as String, value as Dynamic)
  node = RokuGameplay_Resolve(m, nodeId)
  if node = invalid then return
  runtime = m.EnsureNodeRuntime(node)
  if runtime.graphController = invalid then
    for each component in node.components
      if component.type = "AnimationPlayerComponent" and component.enabled <> false then
        initialized = RokuAnim_UpdateNode({ engine: m, node: node, component: component, props: node.properties, runtime: runtime, dt: 0.0 })
      end if
    end for
  end if
  if runtime.graphController <> invalid and runtime.graphController.params.DoesExist(name) then runtime.graphController.params[name].value = value
end sub
