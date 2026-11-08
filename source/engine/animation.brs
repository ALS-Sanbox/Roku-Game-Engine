' animation.brs - generated classic 2D runtime

sub RokuEngine_Update(dt as Float)
  ' Legacy compatibility entry point. The engine now drives explicit frame phases from core.brs.
  if m.scene = invalid then return
  m.ResetSceneFrameStats()
  m.stats.rawDt = dt
  m.stats.scaledDt = dt
  m.RunPreUpdatePhase()
  m.RunVariableUpdatePhase()
  m.RunLateUpdatePhase()
end sub

function RokuEngine_BuildAnimationFrames(node as Object) as Object
  frames = []
  props = node.properties
  if props = invalid then return frames

  spriteFramesId = props.spriteFramesId
  animationName = props.animation
  runtime = m.EnsureNodeRuntime(node)
  graphClip = invalid
  if runtime.graphController <> invalid then
    controller = runtime.graphController
    state = controller.graph.states[controller.currentStateId]
    if state <> invalid then graphClip = controller.graph.clips[state.clipId]
    if graphClip <> invalid then
      spriteFramesId = _BRS_StrCoalesce(graphClip.spriteFramesId, spriteFramesId)
      animationName = _BRS_StrCoalesce(graphClip.name, animationName)
    end if
  end if
  if spriteFramesId = invalid or spriteFramesId = "" or animationName = invalid or animationName = "" then return frames

  runtime = m.EnsureNodeRuntime(node)
  cacheKey = spriteFramesId + "|" + animationName
  if graphClip <> invalid then cacheKey = cacheKey+"|graph:"+graphClip.id
  if props.spriteSheetId <> invalid and props.spriteSheetId <> "" then cacheKey = cacheKey + "|" + props.spriteSheetId
  if runtime.animationFramesCacheKey = cacheKey and type(runtime.animationFrames) = "roArray" and runtime.animationFrames.Count() > 0 then
    return runtime.animationFrames
  end if

  targetLib = invalid
  if m.resources <> invalid then targetLib = m.resources.GetSpriteFramesLibrary(spriteFramesId)
  if targetLib = invalid or type(targetLib.clips) <> "roArray" then return frames

  targetClip = invalid
  for each clip in targetLib.clips
    if clip <> invalid and clip.name = animationName then
      targetClip = clip
      exit for
    end if
  end for
  if graphClip <> invalid and type(graphClip.frames) = "roArray" then
    if targetClip = invalid and targetLib.clips.Count() > 0 then targetClip = targetLib.clips[0]
    if targetClip <> invalid then
      targetClip = ParseJSON(FormatJSON(targetClip), "i")
      targetClip.frames = graphClip.frames
    end if
  end if
  if targetClip = invalid or type(targetClip.frames) <> "roArray" then return frames

  sheetId = targetClip.spriteSheetId
  if props.spriteSheetId <> invalid and props.spriteSheetId <> "" then
    sheetId = props.spriteSheetId
  else if sheetId = invalid or sheetId = "" then
    sheetId = targetLib.defaultSheetId
  end if
  if sheetId = invalid or sheetId = "" then return frames

  targetSheet = invalid
  if m.resources <> invalid then targetSheet = m.resources.GetSpriteSheet(sheetId)
  if targetSheet = invalid then return frames

  bitmap = invalid
  if m.resources <> invalid then bitmap = m.resources.GetBitmap(targetSheet.resourcePath)
  if bitmap = invalid then return frames

  tileWidth = targetSheet.tileWidth
  tileHeight = targetSheet.tileHeight
  padding = targetSheet.padding
  columns = targetSheet.columns
  if tileWidth = invalid or tileHeight = invalid or columns = invalid then return frames
  if padding = invalid then padding = 0

  for each frameIndex in targetClip.frames
    index = frameIndex
    col = index Mod columns
    row = Int(index / columns)
    x = col * (tileWidth + padding)
    y = row * (tileHeight + padding)
    region = CreateObject("roRegion", bitmap, x, y, tileWidth, tileHeight)
    frames.Push(region)
  end for

  runtime.animationFrames = frames
  runtime.animationFramesCacheKey = cacheKey
  runtime.frameCount = frames.Count()
  runtime.fps = 8
  if targetClip.fps <> invalid then runtime.fps = targetClip.fps
  runtime.playbackMode = "loop"
  if targetClip.playbackMode <> invalid then runtime.playbackMode = targetClip.playbackMode
  return frames
end function

function RokuEngine_ComputeAnimationFrameIndex(node as Object, frameCount as Integer) as Integer
  if frameCount <= 0 then return 0
  runtime = m.EnsureNodeRuntime(node)
  elapsed = 0.0
  if runtime.elapsed <> invalid then elapsed = runtime.elapsed
  fps = 8.0
  if runtime.fps <> invalid then fps = runtime.fps
  if fps <= 0 then fps = 8.0
  rawIndex = Int(elapsed * fps)
  playbackMode = runtime.playbackMode
  if playbackMode = invalid then playbackMode = "loop"

  if playbackMode = "once" then
    if rawIndex >= frameCount then return frameCount - 1
    return rawIndex
  else if playbackMode = "pingpong" then
    if frameCount = 1 then return 0
    span = (frameCount * 2) - 2
    cycle = rawIndex Mod span
    if cycle >= frameCount then return span - cycle
    return cycle
  end if

  return rawIndex Mod frameCount
end function
