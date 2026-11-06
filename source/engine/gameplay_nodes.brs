' Gameplay scene helpers. Runtime state stays separate from authored properties.

function RokuGameplay_Resolve(engine as Object, reference as Dynamic) as Dynamic
  if engine.scene = invalid or reference = invalid then return invalid
  key = RokuEngine_Trim(RokuEngine_ToString(reference))
  if key = "" then return invalid
  if engine.scene.nodeMap.DoesExist(key) then return engine.scene.nodeMap[key]
  for each node in engine.scene.doc.nodes
    if LCase(RokuEngine_ToString(node.name)) = LCase(key) then return node
  end for
  return invalid
end function

function RokuGameplay_Target(engine as Object, node as Object, key as String) as Dynamic
  reference = node.properties[key]
  if reference = invalid or reference = "" then reference = node.parentId
  return RokuGameplay_Resolve(engine, reference)
end function

sub RokuGameplay_Emit(engine as Object, node as Object, eventName as String, dt as Float, extra as Dynamic)
  if type(node.components) = "roArray" then
    for each component in node.components
      if component.type = "ScriptComponent" and component.enabled <> false then engine.EnsureScriptReady(node, component, dt)
    end for
  end if
  engine.InvokeNodeScripts(node, eventName, dt, extra)
end sub

function RokuGameplay_IsSleeping(engine as Object, node as Object) as Boolean
  if engine.scene = invalid then return false
  sleeping = engine.scene.runtime.gameplaySleeping
  if sleeping = invalid then sleeping = {}
  seen = {}
  while node <> invalid
    if seen.DoesExist(node.id) then exit while
    seen[node.id] = true
    runtime = engine.scene.runtime.nodes[node.id]
    if runtime <> invalid and runtime.poolActive = false then return true
    if sleeping.DoesExist(node.id) and sleeping[node.id] = true then return true
    node = RokuGameplay_Resolve(engine, node.parentId)
  end while
  return false
end function

sub RokuGameplay_UpdateVisibility(engine as Object)
  if engine.scene = invalid then return
  sleeping = {}
  engine.scene.runtime.gameplaySleeping = sleeping
  engine.UpdateWorldTransforms(engine.scene)
  zoom = engine.scene.cameraZoom
  if zoom <= 0 then zoom = 1
  for each node in engine.scene.doc.nodes
    if node.type <> "VisibilityEnabler2D" or node.properties.enabled = false then continue for
    target = RokuGameplay_Target(engine, node, "target")
    if target = invalid or target.type = "SceneRoot" then continue for
    props = node.properties
    world = engine.GetWorldTransform(node.id)
    margin = _BRS_NumCoalesce(props.margin, 64)
    visible = RokuEngine_IsWorldRectVisible(world, _BRS_NumCoalesce(props.width, 160), _BRS_NumCoalesce(props.height, 120), engine.scene.cameraX-margin, engine.scene.cameraY-margin, engine.width/zoom+margin*2, engine.height/zoom+margin*2)
    rt = engine.EnsureNodeRuntime(node)
    if rt.regionVisible = invalid or rt.regionVisible <> visible then
      rt.regionVisible = visible
      eventName = "ScreenExited"
      if visible then eventName = "ScreenEntered"
      RokuGameplay_Emit(engine, node, eventName, 0, { targetNodeId: target.id })
    end if
    ' Multiple regions on one target keep it awake if any region is visible.
    if sleeping.DoesExist(target.id) <> true then sleeping[target.id] = not visible
    if visible then sleeping[target.id] = false
  end for
  disabled = {}
  for each id in sleeping
    if sleeping[id] then disabled[id] = true
  end for
  engine.scene.runtime.gameplaySleeping = disabled
end sub

sub RokuEngine_StartTimer(nodeId as String, waitTime = -1.0 as Float)
  node = RokuGameplay_Resolve(m, nodeId)
  if node = invalid or node.type <> "Timer" then return
  if waitTime > 0 then node.properties.waitTime = waitTime
  rt = m.EnsureNodeRuntime(node)
  rt.timerRunning = true
  rt.timerElapsed = 0.0
end sub

sub RokuEngine_StopTimer(nodeId as String)
  node = RokuGameplay_Resolve(m, nodeId)
  if node = invalid or node.type <> "Timer" then return
  rt = m.EnsureNodeRuntime(node)
  rt.timerRunning = false
  rt.timerElapsed = 0.0
end sub

sub RokuGameplay_Timer(engine as Object, node as Object, dt as Float)
  p = node.properties : rt = engine.EnsureNodeRuntime(node)
  if rt.timerRunning = invalid then rt.timerRunning = (p.autostart <> false)
  if rt.timerElapsed = invalid then rt.timerElapsed = 0.0
  if not rt.timerRunning or p.paused = true or dt <= 0 then return
  waitTime = _BRS_NumCoalesce(p.waitTime, 1)
  if waitTime < 0.001 then waitTime = 0.001
  rt.timerElapsed = rt.timerElapsed + dt
  ' Bound callback work, retaining the remainder for the next frame.
  for i = 1 to 32
    if rt.timerElapsed < waitTime or rt.timerRunning <> true then exit for
    rt.timerElapsed = rt.timerElapsed - waitTime
    if p.oneShot = true then rt.timerRunning = false : rt.timerElapsed = 0.0
    RokuGameplay_Emit(engine, node, "Timeout", dt, { waitTime: waitTime })
    if engine.scene = invalid or engine.scene.nodeMap.DoesExist(node.id) <> true then exit for
  end for
end sub

function RokuGameplay_SamplePath(points as Object, progress as Float, closed as Boolean, looped as Boolean) as Object
  segments = [] : length = 0.0
  count = points.Count()-1
  if closed then count = points.Count()
  if points.Count() < 2 then
    if points.Count() = 1 then return { x: points[0].x, y: points[0].y, rotation: 0, progress: 0, finished: true }
    return { x: 0, y: 0, rotation: 0, progress: 0, finished: true }
  end if
  for i = 0 to count-1
    a = points[i] : b = points[(i+1) mod points.Count()]
    dx = b.x-a.x : dy = b.y-a.y : distance = Sqr(dx*dx+dy*dy)
    segments.Push({ a: a, dx: dx, dy: dy, length: distance })
    length = length+distance
  end for
  if length <= 0 then return { x: points[0].x, y: points[0].y, rotation: 0, progress: 0, finished: true }
  distance = progress
  finished = false
  if looped then
    distance = distance-Fix(distance/length)*length
    if distance < 0 then distance = distance+length
  else
    if distance >= length then distance = length : finished = true
    if distance < 0 then distance = 0 : finished = true
  end if
  normalized = distance
  for each segment in segments
    if segment.length <= 0 then continue for
    if distance <= segment.length then
      fraction = distance/segment.length
      angle = RokuGameplay_Angle(segment.dx, segment.dy)
      return { x: segment.a.x+segment.dx*fraction, y: segment.a.y+segment.dy*fraction, rotation: angle, progress: normalized, finished: finished }
    end if
    distance = distance-segment.length
  end for
  last = points[points.Count()-1]
  return { x: last.x, y: last.y, rotation: 0, progress: normalized, finished: finished }
end function

function RokuGameplay_Angle(dx as Float, dy as Float) as Float
  if dx = 0 then
    if dy < 0 then return -90
    return 90
  end if
  angle = Atn(dy/dx)*57.2957795130823
  if dx < 0 then angle = angle+180
  return angle
end function

function RokuGameplay_InversePoint(world as Object, x as Float, y as Float) as Object
  determinant = world.a*world.d-world.b*world.c
  if Abs(determinant) < 0.000001 then return { x: 0, y: 0 }
  dx = x-world.x : dy = y-world.y
  return { x: (world.d*dx-world.c*dy)/determinant, y: (-world.b*dx+world.a*dy)/determinant }
end function

sub RokuGameplay_FollowPath(engine as Object, node as Object, dt as Float)
  p = node.properties : rt = engine.EnsureNodeRuntime(node)
  path = RokuGameplay_Target(engine, node, "path")
  if path = invalid or path.type <> "Path2D" or type(path.properties.points) <> "roArray" then return
  progress = _BRS_NumCoalesce(p.progress, 0)
  if rt.pathProgress = invalid or rt.pathAuthoredProgress <> progress then rt.pathProgress = progress
  rt.pathAuthoredProgress = progress
  if p.playing <> false then rt.pathProgress = rt.pathProgress+_BRS_NumCoalesce(p.speed, 60)*dt
  sample = RokuGameplay_SamplePath(path.properties.points, rt.pathProgress, path.properties.closedPath = true, p.loop <> false)
  rt.pathProgress = sample.progress
  pathWorld = engine.GetWorldTransform(path.id)
  x = pathWorld.x+pathWorld.a*sample.x+pathWorld.c*sample.y
  y = pathWorld.y+pathWorld.b*sample.x+pathWorld.d*sample.y
  parentWorld = RokuEngine_CreateIdentityTransform()
  parent = RokuGameplay_Resolve(engine, node.parentId)
  if parent <> invalid then parentWorld = engine.GetWorldTransform(parent.id)
  position = RokuGameplay_InversePoint(parentWorld, x, y)
  node.transform.x = position.x : node.transform.y = position.y
  if p.rotates = true then
    angle = sample.rotation*0.0174532925199433
    dx = pathWorld.a*Cos(angle)+pathWorld.c*Sin(angle)
    dy = pathWorld.b*Cos(angle)+pathWorld.d*Sin(angle)
    determinant = parentWorld.a*parentWorld.d-parentWorld.b*parentWorld.c
    if Abs(determinant) > 0.000001 then node.transform.rotation = RokuGameplay_Angle((parentWorld.d*dx-parentWorld.c*dy)/determinant, (-parentWorld.b*dx+parentWorld.a*dy)/determinant)
  end if
  engine.MarkSubtreeDirty(node.id)
  if sample.finished and p.loop = false and p.playing <> false then
    p.playing = false
    RokuGameplay_Emit(engine, node, "PathFinished", dt, { progress: sample.progress })
  end if
end sub

sub RokuGameplay_Update(engine as Object, dt as Float)
  if engine.scene = invalid then return
  ' Snapshot ids: spawners and event handlers may mutate the scene.
  ids = []
  for each node in engine.scene.doc.nodes
    ids.Push(node.id)
  end for
  for each id in ids
    node = RokuGameplay_Resolve(engine, id)
    if node = invalid or RokuGameplay_IsSleeping(engine, node) then continue for
    p = node.properties
    if p = invalid then continue for
    nodeDt = dt
    if engine.scene.paused = true then
      nodeDt = 0
      if node.type = "Timer" and p.processWhenPaused = true then nodeDt = engine.stats.rawDt
    end if
    if node.type = "Timer" then RokuGameplay_Timer(engine, node, nodeDt)
    if node.type = "PathFollow2D" then RokuGameplay_FollowPath(engine, node, nodeDt)
    if node.type = "Spawner2D" then RokuGameplay_UpdateSpawner(engine, node, nodeDt)
    if node.type = "Parallax2D" then
      rt = engine.EnsureNodeRuntime(node)
      rt.scrollX = _BRS_NumCoalesce(rt.scrollX, 0)+_BRS_NumCoalesce(p.autoscrollX, 0)*nodeDt
      rt.scrollY = _BRS_NumCoalesce(rt.scrollY, 0)+_BRS_NumCoalesce(p.autoscrollY, 0)*nodeDt
    end if
  end for
end sub

sub RokuGameplay_SyncParallax(engine as Object)
  if engine.scene = invalid then return
  for each node in engine.scene.doc.nodes
    if node.type = "Parallax2D" then engine.MarkSubtreeDirty(node.id)
  end for
end sub

function RokuGameplay_ParallaxWorld(engine as Object, node as Object, world as Object) as Object
  if node.type <> "Parallax2D" then return world
  p = node.properties : rt = engine.EnsureNodeRuntime(node)
  world.x = world.x+engine.scene.cameraX*(1-_BRS_NumCoalesce(p.scrollScaleX, 0.5))+_BRS_NumCoalesce(rt.scrollX, 0)
  world.y = world.y+engine.scene.cameraY*(1-_BRS_NumCoalesce(p.scrollScaleY, 0.5))+_BRS_NumCoalesce(rt.scrollY, 0)
  return world
end function

function RokuGameplay_CloneBranch(engine as Object, template as Object, parentId as String, idMap = invalid as Dynamic) as Dynamic
  isRoot = (idMap = invalid)
  if isRoot then idMap = {}
  copy = ParseJSON(FormatJSON(template))
  copy.Delete("id") : copy.children = []
  copy.visible = true
  originalChildren = []
  if engine.scene.childrenByParent.DoesExist(template.id) then
    for each id in engine.scene.childrenByParent[template.id]
      originalChildren.Push(id)
    end for
  end if
  spawned = engine.SpawnNode(copy, parentId)
  if spawned = invalid then return invalid
  idMap[template.id] = spawned.id
  for each id in originalChildren
    child = RokuGameplay_Resolve(engine, id)
    if child <> invalid then
      clone = RokuGameplay_CloneBranch(engine, child, spawned.id, idMap)
      if clone <> invalid then clone.visible = child.visible
    end if
  end for
  if isRoot then
    for each originalId in idMap
      clone = RokuGameplay_Resolve(engine, idMap[originalId])
      RokuGameplay_RemapReferences(engine, clone.properties, idMap)
      for each component in clone.components
        RokuGameplay_RemapReferences(engine, component, idMap)
      end for
    end for
  end if
  return spawned
end function

sub RokuGameplay_RemapReferences(engine as Object, value as Dynamic, idMap as Object)
  if type(value) = "roArray" then
    for each item in value
      RokuGameplay_RemapReferences(engine, item, idMap)
    end for
  else if GetInterface(value, "ifAssociativeArray") <> invalid then
    for each key in value
      if key = "path" or key = "target" or key = "template" or key = "initialFocus" or key = "focusUp" or key = "focusDown" or key = "focusLeft" or key = "focusRight" or key = "nodeId" or key = "targetNodeId" then
        original = RokuGameplay_Resolve(engine, value[key])
        if original <> invalid and idMap.DoesExist(original.id) then value[key] = idMap[original.id]
      else if key = "spawnPoints" and type(value[key]) = "roArray" then
        points = value[key]
        for i = 0 to points.Count()-1
          original = RokuGameplay_Resolve(engine, points[i])
          if original <> invalid and idMap.DoesExist(original.id) then points[i] = idMap[original.id]
        end for
      else
        RokuGameplay_RemapReferences(engine, value[key], idMap)
      end if
    end for
  end if
end sub

function RokuEngine_SpawnFromSpawner(nodeId as String) as Dynamic
  spawner = RokuGameplay_Resolve(m, nodeId)
  if spawner = invalid or spawner.type <> "Spawner2D" or spawner.properties.enabled = false then return invalid
  p = spawner.properties : rt = m.EnsureNodeRuntime(spawner)
  if rt.spawnedIds = invalid then rt.spawnedIds = []
  active = []
  for each id in rt.spawnedIds
    existing = RokuGameplay_Resolve(m, id)
    if existing <> invalid then
      existingRt = m.EnsureNodeRuntime(existing)
      if existingRt.poolActive <> false then active.Push(id)
    end if
  end for
  rt.spawnedIds = active
  if active.Count() >= _BRS_NumCoalesce(p.maxActive, 10) then return invalid
  marker = spawner
  if type(p.spawnPoints) = "roArray" and p.spawnPoints.Count() > 0 then
    if rt.spawnIndex = invalid then rt.spawnIndex = 0
    candidate = RokuGameplay_Resolve(m, p.spawnPoints[rt.spawnIndex mod p.spawnPoints.Count()])
    rt.spawnIndex = rt.spawnIndex+1
    if candidate <> invalid then marker = candidate
  end if
  world = m.GetWorldTransform(marker.id)
  spawned = invalid
  if p.poolName <> invalid and p.poolName <> "" then
    spawned = m.PoolAcquire(p.poolName, 0, 0)
  else
    template = RokuGameplay_Resolve(m, p.template)
    if template = invalid then return invalid
    ' A template containing its own spawner would recursively multiply itself.
    current = spawner
    while current <> invalid
      if current.id = template.id then return invalid
      current = RokuGameplay_Resolve(m, current.parentId)
    end while
    spawned = RokuGameplay_CloneBranch(m, template, m.scene.rootNodeId)
  end if
  if spawned = invalid then return invalid
  parentWorld = RokuEngine_CreateIdentityTransform()
  parent = RokuGameplay_Resolve(m, spawned.parentId)
  if parent <> invalid then parentWorld = m.GetWorldTransform(parent.id)
  position = RokuGameplay_InversePoint(parentWorld, world.x, world.y)
  spawned.transform.x = position.x : spawned.transform.y = position.y
  m.MarkSubtreeDirty(spawned.id)
  rt.spawnedIds.Push(spawned.id)
  RokuGameplay_Emit(m, spawner, "Spawned", 0, { spawnedNodeId: spawned.id })
  return spawned
end function

sub RokuGameplay_UpdateSpawner(engine as Object, node as Object, dt as Float)
  p = node.properties : rt = engine.EnsureNodeRuntime(node)
  if p.enabled = false or p.autostart = false or dt <= 0 then return
  interval = _BRS_NumCoalesce(p.interval, 1)
  if interval < 0.01 then interval = 0.01
  rt.spawnElapsed = _BRS_NumCoalesce(rt.spawnElapsed, 0)+dt
  if rt.spawnElapsed < interval then return
  rt.spawnElapsed = rt.spawnElapsed-Fix(rt.spawnElapsed/interval)*interval
  count = Int(_BRS_NumCoalesce(p.spawnCount, 1))
  if count > 64 then count = 64
  for i = 1 to count
    spawned = engine.SpawnFromSpawner(node.id)
    if spawned = invalid then exit for
  end for
end sub

' Repeat descendants along their nearest Parallax2D axes. Culling is calculated
' in the layer's local space, so rotated/scaled parent layers remain aligned.
function RokuGameplay_RepeatLayer(engine as Object, node as Object) as Dynamic
  layer = RokuGameplay_Resolve(engine, node.parentId)
  seen = {}
  while layer <> invalid
    if seen.DoesExist(layer.id) then exit while
    seen[layer.id] = true
    if layer.type = "Parallax2D" then exit while
    layer = RokuGameplay_Resolve(engine, layer.parentId)
  end while
  if layer = invalid or layer.type <> "Parallax2D" then return invalid
  return layer
end function

function RokuGameplay_HasRepeat(engine as Object, node as Object) as Boolean
  layer = RokuGameplay_RepeatLayer(engine, node)
  if layer = invalid then return false
  return _BRS_NumCoalesce(layer.properties.repeatWidth, 0) > 0 or _BRS_NumCoalesce(layer.properties.repeatHeight, 0) > 0
end function

function RokuGameplay_RepeatOffsets(engine as Object, node as Object) as Object
  layer = RokuGameplay_RepeatLayer(engine, node)
  if layer = invalid then return [{ x: 0, y: 0 }]
  rw = _BRS_NumCoalesce(layer.properties.repeatWidth, 0)
  rh = _BRS_NumCoalesce(layer.properties.repeatHeight, 0)
  if rw <= 0 and rh <= 0 then return [{ x: 0, y: 0 }]
  matrix = engine.GetWorldTransform(layer.id)
  world = engine.GetWorldTransform(node.id)
  p = node.properties
  width = _BRS_NumCoalesce(p.width, 1) : height = _BRS_NumCoalesce(p.height, 1)
  if node.type = "TileMap" then
    width = _BRS_NumCoalesce(p.mapWidth, 1)*_BRS_NumCoalesce(p.tileWidth, 32)
    height = _BRS_NumCoalesce(p.mapHeight, 1)*_BRS_NumCoalesce(p.tileHeight, 32)
  end if
  bounds = RokuEngine_WorldRect(world, width, height)
  zoom = engine.scene.cameraZoom
  if zoom <= 0 then zoom = 1
  view = { x: engine.scene.cameraX, y: engine.scene.cameraY, width: engine.width/zoom, height: engine.height/zoom }
  rectangles = []
  for each rect in [bounds, view]
    minimumX = 1e20 : minimumY = 1e20 : maximumX = -1e20 : maximumY = -1e20
    for each point in [[rect.x,rect.y],[rect.x+rect.width,rect.y],[rect.x,rect.y+rect.height],[rect.x+rect.width,rect.y+rect.height]]
      local = RokuGameplay_InversePoint(matrix, point[0], point[1])
      if local.x < minimumX then minimumX = local.x
      if local.x > maximumX then maximumX = local.x
      if local.y < minimumY then minimumY = local.y
      if local.y > maximumY then maximumY = local.y
    end for
    rectangles.Push({ left: minimumX, right: maximumX, top: minimumY, bottom: maximumY })
  end for
  source = rectangles[0] : viewport = rectangles[1]
  firstX = 0 : lastX = 0 : firstY = 0 : lastY = 0
  if rw > 0 then firstX = Int((viewport.left-source.right)/rw) : lastX = -Int(-(viewport.right-source.left)/rw)
  if rh > 0 then firstY = Int((viewport.top-source.bottom)/rh) : lastY = -Int(-(viewport.bottom-source.top)/rh)
  offsets = []
  for iy = firstY to lastY
    for ix = firstX to lastX
      offsets.Push({ x: matrix.a*ix*rw+matrix.c*iy*rh, y: matrix.b*ix*rw+matrix.d*iy*rh })
      if offsets.Count() >= 256 then return offsets
    end for
  end for
  return offsets
end function
