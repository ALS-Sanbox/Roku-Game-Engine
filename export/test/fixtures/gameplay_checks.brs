' Executed by the optional local BrightScript interpreter; no screen is needed.
sub GPCheck(condition as Boolean, message as String)
  if not condition then print "FAIL: "; message
end sub

function GPNode(id as String, kind as String, parentId as String, props as Object) as Object
  return { id: id, name: id, type: kind, parentId: parentId, children: [], visible: true, components: [], properties: props, transform: { x: 0.0, y: 0.0, rotation: 0.0, scaleX: 1.0, scaleY: 1.0, pivotX: 0.0, pivotY: 0.0 } }
end function

sub GPRefresh()
  m.scene.nodeMap = RokuEngine_BuildNodeMap(m.scene.doc.nodes)
  m.scene.childrenByParent = RokuEngine_BuildChildrenMap(m.scene.doc.nodes)
end sub

function GPWorld(id as String) as Object
  node = RokuGameplay_Resolve(m, id)
  if node = invalid then return RokuEngine_CreateIdentityTransform()
  parent = RokuEngine_CreateIdentityTransform()
  if node.parentId <> "" then parent = m.GetWorldTransform(node.parentId)
  world = RokuEngine_ComposeTransform(parent, RokuEngine_CreateAuthoredLocalTransform(node))
  return RokuGameplay_ParallaxWorld(m, node, world)
end function

sub GPUpdateWorld(scene as Object)
end sub

sub GPDirty(id = "" as String)
end sub

function GPId() as String
  m.nextId = m.nextId+1
  return "clone"+StrI(m.nextId)
end function

sub GPEvent(node as Object, eventName as String, dt as Dynamic, extra as Dynamic)
  m.events.Push({ node: node.id, name: eventName, extra: extra })
end sub

root = GPNode("root", "SceneRoot", "", {})
timer = GPNode("timer", "Timer", "root", { waitTime: 0.25, autostart: true })
pathNode = GPNode("path", "Path2D", "root", { points: [{x:0,y:0},{x:100,y:0},{x:100,y:100}] })
pathNode.transform.rotation = 90 : pathNode.transform.scaleX = 2
follower = GPNode("follower", "PathFollow2D", "path", { speed: 50, progress: 0, loop: false, playing: true, rotates: true })
actor = GPNode("actor", "Node2D", "root", {})
region = GPNode("region", "VisibilityEnabler2D", "actor", { width: 32, height: 32, margin: 0 })
zone = GPNode("zone", "TriggerZone2D", "root", { width: 80, height: 40, enabled: true, layer: "pickup", mask: "player" })
zone.transform.rotation = 90
marker = GPNode("marker", "Marker2D", "root", {}) : marker.transform.x = 400 : marker.transform.y = 300
template = GPNode("template", "Node2D", "root", { width: 20, height: 20 }) : template.visible = false
child = GPNode("child", "Node2D", "template", {}) : child.visible = false
template.properties.target = "child"
spawner = GPNode("spawner", "Spawner2D", "root", { template: "template", spawnPoints: ["marker"], maxActive: 1, interval: 1, spawnCount: 2 })
parallax = GPNode("parallax", "Parallax2D", "root", { scrollScaleX: 0.5, scrollScaleY: 1, repeatWidth: 64 })
tile = GPNode("tile", "Sprite2D", "parallax", { width: 64, height: 64 })
group = GPNode("group", "FocusGroup", "root", { initialFocus: "second", wrap: true, restoreFocus: true, trapFocus: true, width: 300, height: 200 })
first = GPNode("first", "Button", "group", { width: 80, height: 40 })
second = GPNode("second", "Button", "group", { width: 80, height: 40 }) : second.transform.y = 60
outside = GPNode("outside", "Button", "root", { width: 80, height: 40 }) : outside.transform.y = 140
engine = {
  width: 1280, height: 720, nextId: 0, events: [], stats: {rawDt: 0.1}
  scene: { rootNodeId: "root", cameraX: 0, cameraY: 0, cameraZoom: 1, paused: false, runtime: {nodes:{}}, doc: {nodes:[root,timer,pathNode,follower,actor,region,zone,marker,template,child,spawner,parallax,tile,group,first,second,outside]} }
  EnsureNodeRuntime: RokuEngine_EnsureNodeRuntime
  EnsureTransformRuntime: RokuEngine_EnsureTransformRuntime
  RefreshSceneCaches: GPRefresh
  GetWorldTransform: GPWorld
  UpdateWorldTransforms: GPUpdateWorld
  MarkSubtreeDirty: GPDirty
  MarkNodeTransformDirty: GPDirty
  MarkPhaseCachesDirty: GPDirty
  GenerateId: GPId
  InvokeNodeScripts: GPEvent
  StartTimer: RokuEngine_StartTimer
  StopTimer: RokuEngine_StopTimer
  SpawnFromSpawner: RokuEngine_SpawnFromSpawner
  SpawnNode: RokuEngine_SpawnNode
  PoolAcquire: RokuEngine_PoolAcquire
  PoolRelease: RokuEngine_PoolRelease
  InitializeFocusManager: RokuEngine_InitializeFocusManager
  GetNodeScreenTransform: RokuEngine_GetNodeScreenTransform
  IsUiNodeType: RokuEngine_IsUiNodeType
  IsNodeFocusable: RokuEngine_IsNodeFocusable
  MoveFocusDirection: RokuEngine_MoveFocusDirection
  _FM_GetNodeRect: _FM_GetNodeRect
  _FM_FindSpatialNearest: _FM_FindSpatialNearest
  _FM_ResolveNodeIdByIdOrName: _FM_ResolveNodeIdByIdOrName
}
engine.RefreshSceneCaches()

RokuGameplay_Timer(engine, timer, 0.6)
rt = engine.EnsureNodeRuntime(timer)
GPCheck(engine.events.Count() = 2 and Abs(rt.timerElapsed-0.1) < 0.001, "timer repeats retain fractional time")
engine.StopTimer("timer") : RokuGameplay_Timer(engine, timer, 1)
GPCheck(engine.events.Count() = 2, "stopped timer")
timer.properties.oneShot = true : engine.StartTimer("timer", 0.1)
RokuGameplay_Timer(engine, timer, 1)
GPCheck(engine.events.Count() = 3 and rt.timerRunning = false, "one-shot timer fires once")
timer.properties.oneShot = false : engine.StartTimer("timer", 0.1)
engine.scene.paused = true
RokuGameplay_Update(engine, 0.5)
GPCheck(rt.timerElapsed = 0, "timer respects scene pause")
timer.properties.processWhenPaused = true
before = engine.events.Count()
RokuGameplay_Update(engine, 0.5)
GPCheck(engine.events.Count() = before+1, "pause-exempt timer uses raw frame time")
engine.StopTimer("timer") : engine.scene.paused = false

sample = RokuGameplay_SamplePath(pathNode.properties.points, -25, false, true)
GPCheck(Abs(sample.x-100) < 0.001 and Abs(sample.y-75) < 0.001, "negative path looping")
sample = RokuGameplay_SamplePath([{x:0,y:0},{x:0,y:0},{x:100,y:0}], 50, false, false)
GPCheck(Abs(sample.x-50) < 0.001, "duplicate waypoints")
RokuGameplay_FollowPath(engine, follower, 1)
GPCheck(Abs(follower.transform.x-50) < 0.001 and Abs(follower.transform.y) < 0.001, "follower uses path-local distance under rotated scaled parent")
RokuGameplay_FollowPath(engine, follower, 10)
GPCheck(follower.properties.playing = false, "non-loop path finishes")

collision = RokuEngine_CreateCollisionSystem(engine)
collider = collision.GetNodeCollider(zone)
GPCheck(collider.isTrigger and collider.layer = "pickup" and Abs(collider.width-40) < 0.001 and Abs(collider.height-80) < 0.001, "trigger uses transformed bounds and layers")
zone.properties.enabled = false
GPCheck(collision.GetNodeCollider(zone) = invalid, "disabled trigger")

actor.transform.x = 2000
RokuGameplay_UpdateVisibility(engine)
GPCheck(RokuGameplay_IsSleeping(engine, actor) and RokuGameplay_IsSleeping(engine, region), "offscreen target and descendants suspend")
secondRegion = GPNode("secondRegion", "VisibilityEnabler2D", "root", { width: 32, height: 32, margin: 0, target: "actor" })
engine.scene.doc.nodes.Push(secondRegion) : engine.RefreshSceneCaches()
RokuGameplay_UpdateVisibility(engine)
GPCheck(not RokuGameplay_IsSleeping(engine, actor), "any onscreen region keeps shared target awake")
secondRegion.properties.enabled = false : RokuGameplay_UpdateVisibility(engine)
GPCheck(RokuGameplay_IsSleeping(engine, actor), "disabled region removes its wake rule")
actor.transform.x = 100
RokuGameplay_UpdateVisibility(engine)
GPCheck(not RokuGameplay_IsSleeping(engine, actor), "visibility region wakes target")

spawned = engine.SpawnFromSpawner("spawner")
GPCheck(spawned <> invalid and spawned.visible and spawned.transform.x = 400 and spawned.transform.y = 300, "spawner clones hidden template at marker")
GPCheck(engine.scene.childrenByParent[spawned.id].Count() = 1, "spawner clones child hierarchy")
spawnedChild = engine.scene.nodeMap[engine.scene.childrenByParent[spawned.id][0]]
GPCheck(spawnedChild.visible = false, "spawned children retain visibility")
GPCheck(spawned.properties.target = spawnedChild.id, "cloned internal references point at cloned children")
GPCheck(engine.SpawnFromSpawner("spawner") = invalid, "spawner max active")
pooled = GPNode("pooled", "Node2D", "root", {}) : pooled.visible = false
engine.scene.doc.nodes.Push(pooled) : engine.RefreshSceneCaches()
pooledRt = engine.EnsureNodeRuntime(pooled) : pooledRt.poolName = "TestPool" : pooledRt.poolActive = false
engine.scene.runtime.objectPools = { TestPool: { instances: ["pooled"], nextHint: 0 } }
spawner.properties.poolName = "TestPool"
spawnerRt = engine.EnsureNodeRuntime(spawner) : spawnerRt.spawnedIds = []
acquired = engine.SpawnFromSpawner("spawner")
GPCheck(acquired <> invalid, "spawner acquires existing pool object")
if acquired <> invalid then
  GPCheck(acquired.id = "pooled" and acquired.transform.x = 400, "pooled spawn placement")
  engine.PoolRelease(acquired.id)
  acquired = engine.SpawnFromSpawner("spawner")
  GPCheck(acquired <> invalid, "released pool object frees spawner slot")
end if
RokuComponent_ObjectPool_PreUpdate({ engine: engine, node: actor, component: { pools: FormatJSON([{ name: "AutoPool", size: 2, nodeType: "Node2D", properties: { nested: { value: 1 } }, components: [{ type: "MoveComponent", settings: { value: 1 } }] }]) } })
poolA = engine.PoolAcquire("AutoPool", 0, 0) : poolB = engine.PoolAcquire("AutoPool", 0, 0)
GPCheck(poolA <> invalid and poolB <> invalid, "pool component initializes with explicit engine context")
if poolA <> invalid and poolB <> invalid then
  poolA.properties.nested.value = 2 : poolA.components[0].settings.value = 2
  GPCheck(poolB.properties.nested.value = 1 and poolB.components[0].settings.value = 1, "pool instances own their property and component data")
  GPCheck(engine.PoolAcquire("AutoPool", 0, 0) = invalid, "exhausted pool does not allocate")
end if

engine.scene.cameraX = 100
world = engine.GetWorldTransform(parallax.id)
GPCheck(Abs(world.x-50) < 0.001, "parallax camera-relative motion")
engine.scene.cameraX = 10000
offsets = RokuGameplay_RepeatOffsets(engine, tile)
GPCheck(offsets.Count() > 1 and offsets.Count() <= 256 and offsets[0].x > 0, "parallax repetition follows camera far from original tile")

engine.InitializeFocusManager()
first.properties.focusable = false
GPCheck(not engine.IsNodeFocusable(first), "explicitly nonfocusable buttons are excluded")
first.properties.focusable = true
engine.focus.focusableIds = ["first", "second", "outside"] : engine.focus.dirty = false
engine.focus.focusedNodeId = "first"
RokuFocusGroup_Update(engine) : RokuFocusGroup_Restore(engine)
engine.focus.dirty = false
GPCheck(engine.focus.focusedNodeId = "second", "focus group initial selection")
engine.MoveFocusDirection("down")
GPCheck(engine.focus.focusedNodeId = "first", "focus wraps inside group")
first.properties.focusDown = "outside" : engine.MoveFocusDirection("down")
GPCheck(engine.focus.focusedNodeId = "second", "manual links respect focus scope")
RokuFocusGroup_Update(engine)
group.visible = false : RokuFocusGroup_Update(engine)
engine.focus.focusedNodeId = "outside" : group.visible = true
RokuFocusGroup_Update(engine) : RokuFocusGroup_Restore(engine)
GPCheck(engine.focus.focusedNodeId = "second", "focus restores on reopening")

print "PASS: gameplay runtime"
