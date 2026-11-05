' render_server.brs - render orchestration and pass dispatch

sub RokuEngine_Render()
  if m.scene = invalid then return

  m.UpdateWorldTransforms(m.scene)
  m.screen.Clear(m.clearColor)

  RokuRender_WorldOrdered(m)

  ' roScreen is cleared each frame: UI must be redrawn on both back buffers.
  m.RenderPassUI()
  m.uiDirty = false

  m.RenderPassOverlay()

  m.screen.SwapBuffers()

  renderMs = m.phaseClock.TotalMilliseconds()
  m.stats.renderMs = renderMs
  totalFrameMs = m.stats.messagePumpMs + m.stats.inputMs + m.stats.updateMs + m.stats.physicsMs + m.stats.audioMs + m.stats.renderMs
  m.stats.frameMs = totalFrameMs
  if m.scene.debugStats <> invalid then
    m.scene.debugStats.renderMs = renderMs
    m.scene.debugStats.frameMs = totalFrameMs
    m.scene.debugStats.messagePumpMs = m.stats.messagePumpMs
    m.scene.debugStats.updateMs = m.stats.updateMs
    m.scene.debugStats.physicsMs = m.stats.physicsMs
    m.scene.debugStats.audioMs = m.stats.audioMs
    m.scene.debugStats.fps = m.stats.fps
    m.scene.debugStats.spriteCount = m.stats.spriteCount
  end if

  m.phaseClock.Mark()
end sub

' ── UI dirty tracking helpers ─────────────────────────────────────────────────
' Call MarkUIDirty() from any subsystem that changes visible UI state:
'   - Focus / pressed state changes     (ui_focus_manager)
'   - Option / high-score bindings      (core update phases)
'   - Transition start/stop             (ui_transition_manager)
'   - Scene load / screen push-pop      (ui_screen_manager)
' The render loop clears the flag automatically after each UI pass.

sub RokuEngine_MarkUIDirty()
  m.uiDirty = true
end sub

sub RokuEngine_MarkUIClean()
  m.uiDirty = false
end sub

function RokuEngine_GetRenderTraversalNodeIds() as Object
  ids = []
  if m.scene = invalid then return ids
  visited = {} : stack = []
  roots = RokuRender_SortIds(m,m.RootNodeIds())
  for i = roots.Count()-1 to 0 step -1
    stack.Push(roots[i])
  end for
  while stack.Count() > 0
    id = stack.Pop()
    if visited.DoesExist(id) then continue while
    visited[id] = true : ids.Push(id)
    children = []
    if m.scene.childrenByParent.DoesExist(id) then children = RokuRender_SortIds(m,m.scene.childrenByParent[id])
    for i = children.Count()-1 to 0 step -1
      stack.Push(children[i])
    end for
  end while
  if type(ids) <> "roArray" then ids = []
  return ids
end function

function RokuRender_SortIds(engine as Object,source as Object) as Object
  result = []
  for each id in source
    if not engine.scene.nodeMap.DoesExist(id) then continue for
    z = _BRS_NumCoalesce(engine.scene.nodeMap[id].zIndex,0) : at = result.Count()
    result.Push(id)
    while at > 0
      previous = result[at-1]
      if _BRS_NumCoalesce(engine.scene.nodeMap[previous].zIndex,0) <= z then exit while
      result[at] = previous : at = at-1
    end while
    result[at] = id
  end for
  return result
end function

sub RokuRender_WorldOrdered(engine as Object)
  if engine.scene.hasWorldNodes = false then return
  for each id in engine.GetRenderTraversalNodeIds()
    node = engine.scene.nodeMap[id]
    if node.type = "Sprite2D" or node.type = "AnimatedSprite2D" then
      runtime = engine.EnsureNodeRuntime(node)
      sprite = runtime.spriteState
      if sprite <> invalid and sprite.member <> invalid and sprite.drawable <> invalid then engine.screen.DrawObject(sprite.drawX,sprite.drawY,sprite.drawable)
    else if node.type = "TileMap" then
      engine.RenderPassTileMaps(id)
    else
      engine.RenderDebugNode(node,engine.GetWorldTransform(id))
    end if
  end for
end sub

sub RokuEngine_DrawNodeTree()
  m.RenderPassWorldDebug()
end sub

sub RokuEngine_DrawNode(nodeId as String)
  if m.scene = invalid or nodeId = invalid or nodeId = "" then return
  if not m.scene.nodeMap.DoesExist(nodeId) then return
  node = m.scene.nodeMap[nodeId]
  if node = invalid then return
  world = m.GetWorldTransform(node.id)
  m.RenderDebugNode(node, world)
end sub

sub RokuEngine_DrawNodeShapes(node as Object, world as Object)
  m.RenderDebugNode(node, world)
end sub


sub RokuEngine_RenderPassWorldSprites()
  if m.scene = invalid then return
  if m.compositor = invalid then return
  m.compositor.AnimationTick(m.compositorTickMs)
  m.compositor.DrawAll()
end sub

sub RokuEngine_RenderPassWorldDebug()
  if m.scene = invalid then return
  if m.scene.hasWorldNodes = false then return
  traversalIds = m.GetRenderTraversalNodeIds()
  for each nodeId in traversalIds
    if m.scene.nodeMap.DoesExist(nodeId) then
      node = m.scene.nodeMap[nodeId]
      if node <> invalid then
        world = m.GetWorldTransform(node.id)
        m.RenderDebugNode(node, world)
      end if
    end if
  end for
end sub

sub RokuEngine_RenderPassUI()
  if m.scene = invalid then return
  m.RenderUiPass()
  ' Phase 7: draw transition overlay on top of all UI (fade/slide/wipe + loading screen)
  m.RenderTransitionOverlay()
end sub

sub RokuEngine_RenderPassOverlay()
  if m.scene = invalid then return
  m.DrawDebugText()
end sub
