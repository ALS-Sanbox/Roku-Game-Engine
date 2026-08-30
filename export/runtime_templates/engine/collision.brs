' collision.brs - generated classic 2D runtime

function RokuEngine_CreateCollisionSystem(engine as Object) as Object
  system = {
    engine: engine
    cellSize: 128
    GetNodeCollider: RokuCollision_GetNodeCollider
    BuildColliderList: RokuCollision_BuildColliderList
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
    return { nodeId: node.id, x: world.x + offsetX * scaleX, y: world.y + offsetY * scaleY, width: Abs(colliderWidth * scaleX), height: Abs(colliderHeight * scaleY), isTrigger: isTrigger, layer: layer, mask: mask }
  end for
  return invalid
end function


function RokuCollision_BuildColliderList() as Object
  colliders = []
  engine = m.engine
  if engine = invalid or engine.scene = invalid then return colliders
  engine.UpdateWorldTransforms(engine.scene)
  for each node in engine.scene.doc.nodes
    collider = m.GetNodeCollider(node)
    if collider <> invalid then colliders.Push(collider)
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
    if RokuEngine_TestAabbCollision(target, other) then return other
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
  if component.bodyType <> invalid and component.bodyType <> "" then bodyType = LCase(Str(component.bodyType))
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
    vx = vx * friction
    vy = vy * friction
  end if
  transform.x = transform.x + (vx * dt)
  transform.y = transform.y + (vy * dt)
  engine.MarkSubtreeDirty(node.id)
  runtime.rbVx = vx
  runtime.rbVy = vy
end sub

sub RokuCollision_ResolveRigidBodyCollisions(node as Object, component as Object, colliders as Object)
  if node = invalid or component = invalid then return
  engine = m.engine
  if engine = invalid then return
  bodyType = "dynamic"
  if component.bodyType <> invalid and component.bodyType <> "" then bodyType = LCase(Str(component.bodyType))
  if bodyType = "static" then return
  collider = m.GetNodeCollider(node)
  if collider = invalid then return
  hit = m.FindOverlap(collider, colliders, node.id)
  runtime = engine.EnsureNodeRuntime(node)
  runtime.isColliding = (hit <> invalid)
  if hit = invalid then return
  if collider.isTrigger = true or hit.isTrigger = true then return
  transform = node.transform
  if transform = invalid then return
  overlapX = (collider.width + hit.width) - Abs((collider.x + collider.width / 2.0) - (hit.x + hit.width / 2.0)) * 2.0
  overlapY = (collider.height + hit.height) - Abs((collider.y + collider.height / 2.0) - (hit.y + hit.height / 2.0)) * 2.0
  if overlapX <= 0 or overlapY <= 0 then return
  bounce = component.bounce
  if bounce = invalid then bounce = 0.0
  if bounce < 0 then bounce = 0
  if bounce > 1 then bounce = 1
  if overlapX < overlapY then
    if collider.x < hit.x then transform.x = transform.x - overlapX else transform.x = transform.x + overlapX
    engine.MarkSubtreeDirty(node.id)
    runtime.rbVx = -runtime.rbVx * bounce
  else
    if collider.y < hit.y then transform.y = transform.y - overlapY else transform.y = transform.y + overlapY
    engine.MarkSubtreeDirty(node.id)
    runtime.rbVy = -runtime.rbVy * bounce
  end if
end sub

sub RokuCollision_Process(dt = invalid as Dynamic, colliders = invalid as Dynamic)
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
        pairKey = pairA + "|" + hitKey
        currentPairs[pairKey] = { a: pairA, b: pairB, trigger: (collider.isTrigger = true or hit.isTrigger = true) }
      end for
    end if
    for each component in components
      if component = invalid or component.enabled = false then continue for
      if component.type = "RigidBody2DComponent" then m.ResolveRigidBodyCollisions(node, component, colliders)
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
