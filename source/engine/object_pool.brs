' object_pool.brs — RGE ObjectPoolComponent
'
' Manages one or more typed object pools. Put this component on any node
' (typically a dedicated "PoolManager" node). At scene start it pre-spawns
' all pool instances as hidden nodes. Scripts then call:
'
'   node = context.engine.PoolAcquire("Bullet", x, y)   — get a node
'   context.engine.PoolRelease(node.id)                  — return it
'
' Pool definitions are set in the inspector as a JSON string in the
' "pools" field. Example:
'
'   [
'     { "name":"Bullet",    "nodeType":"Sprite2D",         "size":30 },
'     { "name":"Explosion", "nodeType":"AnimatedSprite2D",  "size":10 },
'     { "name":"Pickup",    "nodeType":"Sprite2D",          "size":20 }
'   ]
'
' Each definition can also include:
'   "zIndex"     — z-order for spawned nodes (default 0)
'   "parentName" — name of the parent node to attach pool nodes to (default root)
'   "properties" — default properties AA applied to each instance
'   "components" — array of component AAs attached to each instance
'
' The pool stores a global registry on m.scene.runtime.objectPools so any
' ScriptComponent anywhere in the scene can call PoolAcquire/PoolRelease.
'
' ── Global pool registry helpers ────────────────────────────────────────────

function RokuPool_EnsureRegistry() as Object
  if m.scene = invalid then return invalid
  if m.scene.runtime = invalid then m.scene.runtime = { nodes: {} }
  if m.scene.runtime.objectPools = invalid then m.scene.runtime.objectPools = {}
  return m.scene.runtime.objectPools
end function

' ── Initialize a single pool ─────────────────────────────────────────────────

function RokuPool_InitPool(def as Object, ownerNode as Object) as Boolean
  registry = RokuPool_EnsureRegistry()
  if registry = invalid then return false

  poolName = ""
  if def.name <> invalid and def.name <> "" then poolName = def.name
  if poolName = "" then return false

  ' Already initialized (scene reload safety)
  if registry.DoesExist(poolName) then return true

  nodeType   = "Node2D"
  if def.nodeType <> invalid and def.nodeType <> "" then nodeType = def.nodeType
  poolSize   = 10
  if def.size <> invalid and Int(def.size) > 0 then poolSize = Int(def.size)
  zIndex     = 0
  if def.zIndex <> invalid then zIndex = Int(def.zIndex)
  nodeProps  = invalid
  if def.properties <> invalid then nodeProps = def.properties
  nodeComps  = []
  if type(def.components) = "roArray" then nodeComps = def.components

  ' Resolve parent
  parentId = ""
  if def.parentName <> invalid and def.parentName <> "" then
    parentNode = m.FindNodeByName(def.parentName)
    if parentNode <> invalid then parentId = parentNode.id
  end if
  if parentId = "" and m.scene.rootNodeId <> invalid then parentId = m.scene.rootNodeId

  ' Pre-spawn all instances as invisible
  instances = []
  for i = 0 to poolSize - 1
    template = {
      type:       nodeType
      name:       poolName + "_pool_" + Stri(i)
      visible:    false
      zIndex:     zIndex
      transform:  { x: 0.0, y: 0.0, rotation: 0.0, scaleX: 1.0, scaleY: 1.0, pivotX: 0.0, pivotY: 0.0 }
      properties: {}
      components: []
    }
    if nodeProps <> invalid then template.properties = nodeProps
    if type(nodeComps) = "roArray" and nodeComps.Count() > 0 then
      ' Deep-copy components and give each a fresh id
      freshComps = []
      for each comp in nodeComps
        if comp <> invalid then
          fc = {}
          for each k in comp
            fc[k] = comp[k]
          end for
          fc.id = m.GenerateId()
          freshComps.Push(fc)
        end if
      end for
      template.components = freshComps
    end if

    spawnedNode = m.SpawnNode(template, parentId)
    if spawnedNode <> invalid then
      rt = m.EnsureNodeRuntime(spawnedNode)
      rt.poolName   = poolName
      rt.poolActive = false
      instances.Push(spawnedNode.id)
    end if
  end for

  registry[poolName] = {
    name:       poolName
    nodeType:   nodeType
    size:       poolSize
    instances:  instances   ' array of node ids
    nextHint:   0           ' round-robin hint for faster search
  }

  return true
end function

' ── pre_update: initialize pools on first frame ───────────────────────────────

sub RokuComponent_ObjectPool_PreUpdate(ctx as Object)
  rt = ctx.engine.EnsureNodeRuntime(ctx.node)
  if rt.poolsReady = true then return

  ' Parse pools JSON
  poolsJson = "[]"
  if ctx.component.pools <> invalid and ctx.component.pools <> "" then poolsJson = ctx.component.pools

  defs = ParseJSON(poolsJson)

  if defs = invalid then
    ' Fallback: try ParseJSON directly (older firmware)
    defs = ParseJSON(poolsJson)
    if type(defs) <> "roArray" then defs = []
  end if

  for each def in defs
    if def <> invalid then RokuPool_InitPool(def, ctx.node)
  end for

  rt.poolsReady = true
end sub

' ── Engine API: PoolAcquire ──────────────────────────────────────────────────
'
' Finds the next available (inactive) instance in the named pool,
' places it at (x, y), makes it visible, and returns the node.
' Returns invalid if the pool is exhausted.
'
function RokuEngine_PoolAcquire(poolName as String, x as Float, y as Float) as Dynamic
  registry = RokuPool_EnsureRegistry()
  if registry = invalid then return invalid
  if not registry.DoesExist(poolName) then return invalid

  pool = registry[poolName]
  if type(pool.instances) <> "roArray" then return invalid

  n = pool.instances.Count()
  if n = 0 then return invalid

  ' Round-robin search starting at nextHint
  startIdx = pool.nextHint
  if startIdx = invalid or startIdx < 0 or startIdx >= n then startIdx = 0
  idx = startIdx

  for i = 0 to n - 1
    nodeId = pool.instances[idx]
    if nodeId <> invalid and m.scene.nodeMap <> invalid and m.scene.nodeMap.DoesExist(nodeId) then
      node = m.scene.nodeMap[nodeId]
      rt   = m.EnsureNodeRuntime(node)
      if rt.poolActive <> true then
        ' Activate
        node.visible          = true
        node.transform.x      = x
        node.transform.y      = y
        node.transform.rotation = 0.0
        rt.poolActive         = true
        rt.poolAcquiredFrame  = m.frameNumber
        m.MarkSubtreeDirty(nodeId)

        ' Advance hint for next call
        pool.nextHint = (idx + 1) mod n
        return node
      end if
    end if
    idx = (idx + 1) mod n
  end for

  return invalid  ' pool exhausted
end function

' ── Engine API: PoolRelease ──────────────────────────────────────────────────
'
' Returns a node to its pool: hides it, resets transform, clears runtime state.
' Safe to call with any nodeId — no-ops if it's not a pool node.
'
sub RokuEngine_PoolRelease(nodeId as String)
  if nodeId = invalid or nodeId = "" then return
  if m.scene = invalid or m.scene.nodeMap = invalid then return
  if not m.scene.nodeMap.DoesExist(nodeId) then return

  node = m.scene.nodeMap[nodeId]
  rt   = m.EnsureNodeRuntime(node)

  ' Only act on pool nodes
  if rt.poolName = invalid then return

  node.visible          = false
  node.transform.x      = -9999.0
  node.transform.y      = -9999.0
  node.transform.rotation = 0.0
  rt.poolActive         = false
  rt.poolAcquiredFrame  = invalid
  m.MarkSubtreeDirty(nodeId)
end sub

' ── Engine API: PoolReleaseAll ───────────────────────────────────────────────
'
' Returns every active instance of the named pool. Useful on level reset.
'
sub RokuEngine_PoolReleaseAll(poolName as String)
  registry = RokuPool_EnsureRegistry()
  if registry = invalid then return
  if not registry.DoesExist(poolName) then return
  pool = registry[poolName]
  if type(pool.instances) <> "roArray" then return
  for each nodeId in pool.instances
    m.PoolRelease(nodeId)
  end for
end sub

' ── Engine API: PoolReleaseAllPools ─────────────────────────────────────────
'
' Returns every active instance across all pools. Useful on scene reset.
'
sub RokuEngine_PoolReleaseAllPools()
  registry = RokuPool_EnsureRegistry()
  if registry = invalid then return
  for each poolName in registry
    m.PoolReleaseAll(poolName)
  end for
end sub

' ── Engine API: PoolActiveCount ─────────────────────────────────────────────
'
' Returns the number of currently active instances in a pool.
'
function RokuEngine_PoolActiveCount(poolName as String) as Integer
  registry = RokuPool_EnsureRegistry()
  if registry = invalid then return 0
  if not registry.DoesExist(poolName) then return 0
  pool = registry[poolName]
  if type(pool.instances) <> "roArray" then return 0
  count = 0
  for each nodeId in pool.instances
    if nodeId <> invalid and m.scene.nodeMap <> invalid and m.scene.nodeMap.DoesExist(nodeId) then
      node = m.scene.nodeMap[nodeId]
      rt   = m.EnsureNodeRuntime(node)
      if rt.poolActive = true then count = count + 1
    end if
  end for
  return count
end function

' ── Engine API: PoolGetActive ───────────────────────────────────────────────
'
' Returns an array of all currently active node objects in a pool.
' Useful for iterating active bullets, enemies, particles, etc.
'
function RokuEngine_PoolGetActive(poolName as String) as Object
  result = []
  registry = RokuPool_EnsureRegistry()
  if registry = invalid then return result
  if not registry.DoesExist(poolName) then return result
  pool = registry[poolName]
  if type(pool.instances) <> "roArray" then return result
  for each nodeId in pool.instances
    if nodeId <> invalid and m.scene.nodeMap <> invalid and m.scene.nodeMap.DoesExist(nodeId) then
      node = m.scene.nodeMap[nodeId]
      rt   = m.EnsureNodeRuntime(node)
      if rt.poolActive = true then result.Push(node)
    end if
  end for
  return result
end function
