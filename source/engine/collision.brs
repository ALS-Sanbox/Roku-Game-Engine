' collision.brs - generated classic 2D runtime

function RokuEngine_CreateCollisionSystem(engine as Object) as Object
  system = {
    engine: engine
    cellSize: 128
    GetNodeCollider: RokuCollision_GetNodeCollider
    BuildColliderList: RokuCollision_BuildColliderList
    BuildTileMapColliders: RokuCollision_BuildTileMapColliders
    CanLayersCollide: RokuCollision_CanLayersCollide
    BuildBroadphaseBuckets: RokuCollision_BuildBroadphaseBuckets
    QueryPotentialColliders: RokuCollision_QueryPotentialColliders
    FindOverlap: RokuCollision_FindOverlap
    ApplyRigidBodyMotion: RokuCollision_ApplyRigidBodyMotion
    ResolveRigidBodyCollisions: RokuCollision_ResolveRigidBodyCollisions
    Process: RokuCollision_Process
  }
  return system
end function

function RokuEngine_TestAabbCollision(a as Object, b as Object) as Boolean
  if a = invalid or b = invalid then return false
  if a.x + a.width < b.x then return false
  if b.x + b.width < a.x then return false
  if a.y + a.height < b.y then return false
  if b.y + b.height < a.y then return false
  return true
end function

function RokuCollision_GetNodeCollider(node as Object) as Dynamic
  engine = m.engine
  if engine = invalid or engine.scene = invalid or node = invalid then return invalid
  components = node.components
  if type(components) <> "roArray" then return invalid
  world = engine.GetWorldTransform(node.id)
  props = node.properties
  if props = invalid then props = {}
  width = 0.0
  height = 0.0
  if props.width <> invalid then width = props.width
  if props.height <> invalid then height = props.height
  for each component in components
    if component = invalid or component.enabled = false then continue for
    if component.type <> "Collider2DComponent" then continue for
    colliderWidth = width
    colliderHeight = height
    if component.width <> invalid then colliderWidth = component.width
    if component.height <> invalid then colliderHeight = component.height
    if colliderWidth <= 0 then colliderWidth = 1
    if colliderHeight <= 0 then colliderHeight = 1
    offsetX = 0.0
    offsetY = 0.0
    if component.offsetX <> invalid then offsetX = component.offsetX
    if component.offsetY <> invalid then offsetY = component.offsetY
    scaleX = world.scaleX
    scaleY = world.scaleY
    if scaleX = invalid or scaleX = 0 then scaleX = 1.0
    if scaleY = invalid or scaleY = 0 then scaleY = 1.0
    isTrigger = false
    if component.isTrigger = true then isTrigger = true
    layer = "default"
    mask = "default"
    if component.layer <> invalid and component.layer <> "" then layer = component.layer
    if component.mask <> invalid and component.mask <> "" then mask = component.mask
    shape = RokuCollision_LocalShapeBounds(component.physicsShapes,colliderWidth,colliderHeight)
    if shape <> invalid then
      offsetX = offsetX+shape.x : offsetY = offsetY+shape.y
      colliderWidth = shape.width : colliderHeight = shape.height
    end if
    rect = RokuEngine_WorldRect(world, colliderWidth, colliderHeight, offsetX, offsetY)
    return { nodeId: node.id, x: rect.x, y: rect.y, width: rect.width, height: rect.height, isTrigger: isTrigger, layer: layer, mask: mask }
  end for
  return invalid
end function

function RokuCollision_LocalShapeBounds(shapes as Dynamic,width as Float,height as Float) as Dynamic
  if type(shapes) <> "roArray" or shapes.Count() = 0 then return invalid
  left = 1e20 : right = -1e20 : top = 1e20 : bottom = -1e20
  for each shape in shapes
    points = []
    if shape.type = "rect" then
      points = [shape.x,shape.y,shape.x+shape.w,shape.y+shape.h]
    else if shape.type = "polygon" and type(shape.points) = "roArray" then
      points = shape.points
    end if
    for i = 0 to points.Count()-2 step 2
      x = points[i]*width : y = points[i+1]*height
      if x < left then left = x
      if x > right then right = x
      if y < top then top = y
      if y > bottom then bottom = y
    end for
  end for
  if right <= left or bottom <= top then return invalid
  return {x:left,y:top,width:right-left,height:bottom-top}
end function


function RokuCollision_BuildTileMapColliders(node as Object) as Object
  colliders = []
  engine = m.engine
  if engine = invalid or engine.scene = invalid or node = invalid then return colliders
  if node.type <> "TileMap" then return colliders

  props = node.properties
  if props = invalid then return colliders
  layers = props.layers
  if GetInterface(layers, "ifArray") = invalid then return colliders

  tileWidth = 32
  tileHeight = 32
  mapWidth = 0
  mapHeight = 0
  if props.tileWidth <> invalid and Int(props.tileWidth) > 0 then tileWidth = Int(props.tileWidth)
  if props.tileHeight <> invalid and Int(props.tileHeight) > 0 then tileHeight = Int(props.tileHeight)
  if props.mapWidth <> invalid then mapWidth = Int(props.mapWidth)
  if props.mapHeight <> invalid then mapHeight = Int(props.mapHeight)
  if mapWidth <= 0 or mapHeight <= 0 then return colliders

  world = engine.GetWorldTransform(node.id)
  if world = invalid then return colliders
  scaleX = world.scaleX
  scaleY = world.scaleY
  if scaleX = invalid or scaleX = 0 then scaleX = 1.0
  if scaleY = invalid or scaleY = 0 then scaleY = 1.0
  cellWidth = Abs(tileWidth * scaleX)
  cellHeight = Abs(tileHeight * scaleY)
  if cellWidth <= 0 or cellHeight <= 0 then return colliders

  occupied = {}
  for each layer in layers
    if layer = invalid then continue for
    collision = layer.collision
    if GetInterface(collision, "ifArray") = invalid then continue for
    for row = 0 to mapHeight - 1
      rowCells = invalid
      if row < collision.Count() then rowCells = collision[row]
      if GetInterface(rowCells, "ifArray") = invalid then continue for
      for col = 0 to mapWidth - 1
        cellValue = 0
        if col < rowCells.Count() then cellValue = Int(rowCells[col])
        if cellValue <= 0 then continue for
        cellKey = StrI(col) + "," + StrI(row)
        occupied[cellKey] = true
      end for
    end for
  end for

  for each cellKey in occupied
    parts = cellKey.Tokenize(",")
    if parts.Count() < 2 then continue for
    col = Int(parts[0])
    row = Int(parts[1])
    rect = RokuEngine_WorldRect(world, tileWidth, tileHeight, col * tileWidth, row * tileHeight)
    colliders.Push({
      nodeId: node.id
      colliderId: node.id + "#tile#" + cellKey
      x: rect.x
      y: rect.y
      width: rect.width
      height: rect.height
      isTrigger: false
      layer: "default"
      mask: "default"
      sourceType: "TileMapCell"
      tileMapNodeId: node.id
      tileCol: col
      tileRow: row
    })
  end for

  return colliders
end function

function RokuCollision_BuildColliderList() as Object
  colliders = []
  engine = m.engine
  if engine = invalid or engine.scene = invalid then return colliders
  engine.UpdateWorldTransforms(engine.scene)
  for each node in engine.scene.doc.nodes
    if node = invalid then continue for
    collider = m.GetNodeCollider(node)
    if collider <> invalid then colliders.Push(collider)
    if node.type = "TileMap" then
      tileColliders = m.BuildTileMapColliders(node)
      if GetInterface(tileColliders, "ifArray") <> invalid then
        for each tileCollider in tileColliders
          if tileCollider <> invalid then colliders.Push(tileCollider)
        end for
      end if
    end if
  end for
  return colliders
end function

function RokuCollision_CanLayersCollide(a as Object, b as Object) as Boolean
  if a = invalid or b = invalid then return false
  aLayer = "default" : bLayer = "default" : aMask = "default" : bMask = "default"
  if a.layer <> invalid and a.layer <> "" then aLayer = a.layer
  if b.layer <> invalid and b.layer <> "" then bLayer = b.layer
  if a.mask <> invalid and a.mask <> "" then aMask = a.mask
  if b.mask <> invalid and b.mask <> "" then bMask = b.mask
  if aMask <> "*" and aMask <> bLayer then return false
  if bMask <> "*" and bMask <> aLayer then return false
  return true
end function

function RokuCollision_BuildBroadphaseBuckets(colliders as Object) as Object
  buckets = {}
  if type(colliders) <> "roArray" then return buckets
  cellSize = m.cellSize
  if cellSize <= 0 then cellSize = 128
  for each collider in colliders
    if collider = invalid then continue for
    minX = Int(Fix(collider.x / cellSize))
    maxX = Int(Fix((collider.x + collider.width) / cellSize))
    minY = Int(Fix(collider.y / cellSize))
    maxY = Int(Fix((collider.y + collider.height) / cellSize))
    for gx = minX to maxX
      for gy = minY to maxY
        key = StrI(gx) + "|" + StrI(gy)
        if buckets.DoesExist(key) <> true then buckets[key] = []
        buckets[key].Push(collider)
      end for
    end for
  end for
  return buckets
end function

function RokuCollision_QueryPotentialColliders(target as Object, buckets as Object) as Object
  hits = []
  seen = {}
  if target = invalid or buckets = invalid then return hits
  cellSize = m.cellSize
  if cellSize <= 0 then cellSize = 128
  minX = Int(Fix(target.x / cellSize))
  maxX = Int(Fix((target.x + target.width) / cellSize))
  minY = Int(Fix(target.y / cellSize))
  maxY = Int(Fix((target.y + target.height) / cellSize))
  for gx = minX to maxX
    for gy = minY to maxY
      key = StrI(gx) + "|" + StrI(gy)
      if buckets.DoesExist(key) <> true then continue for
      for each candidate in buckets[key]
        if candidate = invalid then continue for
        candidateKey = candidate.nodeId
        if candidate.colliderId <> invalid and candidate.colliderId <> "" then candidateKey = candidate.colliderId
        if seen.DoesExist(candidateKey) then continue for
        seen[candidateKey] = true
        hits.Push(candidate)
      end for
    end for
  end for
  return hits
end function

function RokuCollision_FindOverlap(target as Object, colliders as Object, skipNodeId as String) as Dynamic
  if target = invalid or type(colliders) <> "roArray" then return invalid
  buckets = m.BuildBroadphaseBuckets(colliders)
  candidates = m.QueryPotentialColliders(target, buckets)
  for each other in candidates
    if other = invalid then continue for
    if other.nodeId = skipNodeId then continue for
    if not m.CanLayersCollide(target, other) then continue for
    if target.x < other.x+other.width and target.x+target.width > other.x and target.y < other.y+other.height and target.y+target.height > other.y then return other
  end for
  return invalid
end function

sub RokuCollision_ApplyRigidBodyMotion(node as Object, component as Object, dt as Float)
  if node = invalid or component = invalid then return
  engine = m.engine
  if engine = invalid then return
  runtime = engine.EnsureNodeRuntime(node)
  transform = node.transform
  if transform = invalid then transform = {} : node.transform = transform
  if transform.x = invalid then transform.x = 0.0
  if transform.y = invalid then transform.y = 0.0
  bodyType = "dynamic"
  if component.bodyType <> invalid and component.bodyType <> "" then bodyType = LCase(RokuEngine_ToString(component.bodyType))
  if bodyType = "static" then runtime.rbVx = 0.0 : runtime.rbVy = 0.0 : return
  vx = runtime.rbVx : vy = runtime.rbVy
  if vx = invalid then vx = component.vx
  if vy = invalid then vy = component.vy
  if vx = invalid then vx = 0.0
  if vy = invalid then vy = 0.0
  if bodyType <> "kinematic" then
    ax = component.ax : ay = component.ay : gravity = component.gravity : friction = component.friction
    if ax = invalid then ax = 0.0
    if ay = invalid then ay = 0.0
    if gravity = invalid then gravity = 0.0
    if friction = invalid then friction = 1.0
    vx = vx + (ax * dt)
    vy = vy + ((ay + gravity) * dt)
    if friction < 0 then friction = 0
    if friction > 1 then friction = 1
    vx = vx * friction ^ (dt * 60)
    vy = vy * friction ^ (dt * 60)
  end if
  ' Sweep each axis against solid AABBs so fast bodies cannot skip thin walls.
  parent = RokuEngine_CreateIdentityTransform()
  if node.parentId <> invalid and node.parentId <> "" then parent = engine.GetWorldTransform(node.parentId)
  worldVx = parent.a * vx + parent.c * vy
  worldVy = parent.b * vx + parent.d * vy
  dx = worldVx * dt : dy = worldVy * dt
  colliders = m.BuildColliderList()
  bounce = RokuCamera_Clamp(_BRS_NumCoalesce(component.bounce, 0), 0, 1)
  for axis = 0 to 1
    delta = dx
    if axis = 1 then delta = dy
    collider = m.GetNodeCollider(node)
    allowed = delta
    impact = invalid
    if collider <> invalid and collider.isTrigger <> true then
      for each hit in colliders
        if hit.nodeId = node.id or hit.isTrigger = true then continue for
        if not m.CanLayersCollide(collider, hit) then continue for
        if axis = 0 then
          cross = collider.y < hit.y + hit.height and collider.y + collider.height > hit.y
          near = hit.x - (collider.x + collider.width) : far = hit.x + hit.width - collider.x
        else
          cross = collider.x < hit.x + hit.width and collider.x + collider.width > hit.x
          near = hit.y - (collider.y + collider.height) : far = hit.y + hit.height - collider.y
        end if
        if cross and delta > 0 and near >= -0.0001 and near < allowed then allowed = near : impact = hit
        if cross and delta < 0 and far <= 0.0001 and far > allowed then allowed = far : impact = hit
      end for
    end if
    if axis = 0 then
      RokuCollision_MoveWorld(engine, node, allowed, 0)
      if allowed <> delta then worldVx = RokuCollision_ImpactVelocity(engine,node,component,impact,axis,worldVx,bounce) : runtime.isColliding = true
    else
      RokuCollision_MoveWorld(engine, node, 0, allowed)
      if allowed <> delta then worldVy = RokuCollision_ImpactVelocity(engine,node,component,impact,axis,worldVy,bounce) : runtime.isColliding = true
    end if
  end for
  determinant = parent.a * parent.d - parent.b * parent.c
  if Abs(determinant) > 0.000001 then
    runtime.rbVx = (parent.d * worldVx - parent.c * worldVy) / determinant
    runtime.rbVy = (parent.a * worldVy - parent.b * worldVx) / determinant
  end if
end sub

function RokuCollision_ImpactVelocity(engine as Object, node as Object, component as Object, hit as Dynamic, axis as Integer, incoming as Float, bounce as Float) as Float
  if hit = invalid or not engine.scene.nodeMap.DoesExist(hit.nodeId) then return -incoming*bounce
  other = engine.scene.nodeMap[hit.nodeId] : body = invalid
  if type(other.components) = "roArray" then
    for each item in other.components
      if item.type = "RigidBody2DComponent" and item.enabled <> false then body = item : exit for
    end for
  end if
  if body = invalid then return -incoming*bounce
  if body.bodyType = "static" or body.bodyType = "kinematic" then return -incoming*bounce
  runtime = engine.EnsureNodeRuntime(other)
  vx = _BRS_NumCoalesce(runtime.rbVx,_BRS_NumCoalesce(body.vx,0))
  vy = _BRS_NumCoalesce(runtime.rbVy,_BRS_NumCoalesce(body.vy,0))
  parent = RokuEngine_CreateIdentityTransform()
  if other.parentId <> invalid and other.parentId <> "" then parent = engine.GetWorldTransform(other.parentId)
  wx = parent.a*vx+parent.c*vy : wy = parent.b*vx+parent.d*vy
  outgoing = wx
  if axis = 1 then outgoing = wy
  mass = _BRS_NumCoalesce(component.mass,1) : otherMass = _BRS_NumCoalesce(body.mass,1)
  if mass <= 0 then mass = 1
  if otherMass <= 0 then otherMass = 1
  impulse = (1+bounce)*(incoming-outgoing)/(1/mass+1/otherMass)
  if axis = 0 then wx = wx+impulse/otherMass else wy = wy+impulse/otherMass
  determinant = parent.a*parent.d-parent.b*parent.c
  if Abs(determinant) > 0.000001 then
    runtime.rbVx = (parent.d*wx-parent.c*wy)/determinant
    runtime.rbVy = (parent.a*wy-parent.b*wx)/determinant
  end if
  return incoming-impulse/mass
end function

sub RokuCollision_ResolveRigidBodyCollisions(node as Object, component as Object, colliders as Object)
  if node = invalid or component = invalid then return
  engine = m.engine
  if engine = invalid then return
  bodyType = "dynamic"
  if component.bodyType <> invalid and component.bodyType <> "" then bodyType = LCase(RokuEngine_ToString(component.bodyType))
  if bodyType = "static" then return
  collider = m.GetNodeCollider(node)
  if collider = invalid then return
  solids = []
  for each candidate in colliders
    if candidate.isTrigger <> true then solids.Push(candidate)
  end for
  hit = m.FindOverlap(collider, solids, node.id)
  runtime = engine.EnsureNodeRuntime(node)
  runtime.isColliding = runtime.isColliding = true or hit <> invalid
  if hit = invalid then return
  if collider.isTrigger = true or hit.isTrigger = true then return
  transform = node.transform
  if transform = invalid then return
  overlapX = collider.x + collider.width - hit.x
  if hit.x + hit.width - collider.x < overlapX then overlapX = hit.x + hit.width - collider.x
  overlapY = collider.y + collider.height - hit.y
  if hit.y + hit.height - collider.y < overlapY then overlapY = hit.y + hit.height - collider.y
  if overlapX <= 0 or overlapY <= 0 then return
  bounce = component.bounce
  if bounce = invalid then bounce = 0.0
  if bounce < 0 then bounce = 0
  if bounce > 1 then bounce = 1
  if overlapX < overlapY then
    if collider.x < hit.x then overlapX = -overlapX
    RokuCollision_MoveWorld(engine, node, overlapX, 0)
    engine.MarkSubtreeDirty(node.id)
    RokuCollision_ResolveVelocity(engine,node,component,hit,0,overlapX,bounce)
  else
    if collider.y < hit.y then overlapY = -overlapY
    RokuCollision_MoveWorld(engine, node, 0, overlapY)
    engine.MarkSubtreeDirty(node.id)
    RokuCollision_ResolveVelocity(engine,node,component,hit,1,overlapY,bounce)
  end if
end sub

sub RokuCollision_ResolveVelocity(engine as Object,node as Object,component as Object,hit as Object,axis as Integer,push as Float,bounce as Float)
  runtime = engine.EnsureNodeRuntime(node)
  parent = RokuEngine_CreateIdentityTransform()
  if node.parentId <> invalid and node.parentId <> "" then parent = engine.GetWorldTransform(node.parentId)
  vx = _BRS_NumCoalesce(runtime.rbVx,0) : vy = _BRS_NumCoalesce(runtime.rbVy,0)
  wx = parent.a*vx+parent.c*vy : wy = parent.b*vx+parent.d*vy
  if axis = 0 and wx*push < 0 then wx = RokuCollision_ImpactVelocity(engine,node,component,hit,axis,wx,bounce)
  if axis = 1 and wy*push < 0 then wy = RokuCollision_ImpactVelocity(engine,node,component,hit,axis,wy,bounce)
  determinant = parent.a*parent.d-parent.b*parent.c
  if Abs(determinant) > 0.000001 then
    runtime.rbVx = (parent.d*wx-parent.c*wy)/determinant
    runtime.rbVy = (parent.a*wy-parent.b*wx)/determinant
  end if
end sub

sub RokuCollision_MoveWorld(engine as Object, node as Object, dx as Float, dy as Float)
  parent = RokuEngine_CreateIdentityTransform()
  if node.parentId <> invalid and node.parentId <> "" then parent = engine.GetWorldTransform(node.parentId)
  determinant = parent.a * parent.d - parent.b * parent.c
  if Abs(determinant) < 0.000001 then return
  node.transform.x = node.transform.x + (parent.d * dx - parent.c * dy) / determinant
  node.transform.y = node.transform.y + (parent.a * dy - parent.b * dx) / determinant
  engine.MarkSubtreeDirty(node.id)
end sub

sub RokuCollision_Process(dt as Dynamic, colliders as Dynamic)
  engine = m.engine
  if engine = invalid or engine.scene = invalid then return
  if type(colliders) <> "roArray" then colliders = m.BuildColliderList()
  buckets = m.BuildBroadphaseBuckets(colliders)
  engine.UpdateWorldTransforms(engine.scene)
  currentPairs = {}
  for each node in engine.scene.doc.nodes
    if node = invalid then continue for
    components = node.components
    if type(components) <> "roArray" then continue for
    collider = m.GetNodeCollider(node)
    if collider <> invalid then
      candidates = m.QueryPotentialColliders(collider, buckets)
      for each hit in candidates
        if hit = invalid or hit.nodeId = node.id then continue for
        if not m.CanLayersCollide(collider, hit) then continue for
        if not RokuEngine_TestAabbCollision(collider, hit) then continue for
        pairA = node.id : pairB = hit.nodeId
        hitKey = pairB
        if hit.colliderId <> invalid and hit.colliderId <> "" then hitKey = hit.colliderId
        ownKey = pairA
        if collider.colliderId <> invalid then ownKey = collider.colliderId
        if ownKey < hitKey then pairKey = ownKey+"|"+hitKey else pairKey = hitKey+"|"+ownKey
        currentPairs[pairKey] = { a: pairA, b: pairB, trigger: (collider.isTrigger = true or hit.isTrigger = true) }
      end for
    end if
    for each component in components
      if component = invalid or component.enabled = false then continue for
      if component.type = "RigidBody2DComponent" then
        for iteration = 0 to 3
          m.ResolveRigidBodyCollisions(node, component, colliders)
        end for
      end if
    end for
  end for
  if engine.stats <> invalid then engine.stats.collisionCount = currentPairs.Count()
  if engine.scene.debugStats <> invalid then engine.scene.debugStats.collisionPairCount = currentPairs.Count()

  previousPairs = engine.collisionPairsPrevious
  if previousPairs = invalid then previousPairs = {}
  for each pairKey in currentPairs
    pair = currentPairs[pairKey]
    phase = "CollisionStay"
    if previousPairs.DoesExist(pairKey) <> true then phase = "CollisionEnter"
    if engine.scene.nodeMap.DoesExist(pair.a) then
      nodeA = engine.scene.nodeMap[pair.a]
      engine.InvokeNodeScripts(nodeA, phase, dt, { otherNodeId: pair.b, isTrigger: pair.trigger, phase: phase })
      engine.InvokeNodeScripts(nodeA, "Collision", dt, { otherNodeId: pair.b, isTrigger: pair.trigger, phase: phase })
    end if
    if engine.scene.nodeMap.DoesExist(pair.b) then
      nodeB = engine.scene.nodeMap[pair.b]
      engine.InvokeNodeScripts(nodeB, phase, dt, { otherNodeId: pair.a, isTrigger: pair.trigger, phase: phase })
      engine.InvokeNodeScripts(nodeB, "Collision", dt, { otherNodeId: pair.a, isTrigger: pair.trigger, phase: phase })
    end if
  end for
  for each pairKey in previousPairs
    if currentPairs.DoesExist(pairKey) then continue for
    pair = previousPairs[pairKey]
    if engine.scene.nodeMap.DoesExist(pair.a) then
      nodeA = engine.scene.nodeMap[pair.a]
      engine.InvokeNodeScripts(nodeA, "CollisionExit", dt, { otherNodeId: pair.b, isTrigger: pair.trigger, phase: "CollisionExit" })
      engine.InvokeNodeScripts(nodeA, "Collision", dt, { otherNodeId: pair.b, isTrigger: pair.trigger, phase: "CollisionExit" })
    end if
    if engine.scene.nodeMap.DoesExist(pair.b) then
      nodeB = engine.scene.nodeMap[pair.b]
      engine.InvokeNodeScripts(nodeB, "CollisionExit", dt, { otherNodeId: pair.a, isTrigger: pair.trigger, phase: "CollisionExit" })
      engine.InvokeNodeScripts(nodeB, "Collision", dt, { otherNodeId: pair.a, isTrigger: pair.trigger, phase: "CollisionExit" })
    end if
  end for
  engine.collisionPairsPrevious = currentPairs
end sub
