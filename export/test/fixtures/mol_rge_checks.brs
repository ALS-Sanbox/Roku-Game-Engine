' Uses real RGE pools, transforms, timers and query math with platform I/O fakes.
function GMFind(name as String) as Dynamic
  for each n in m.scene.doc.nodes
    if n.name = name then return n
  end for
  return invalid
end function
function GMWorld(id as String) as Object
  node = RokuGameplay_Resolve(m,id)
  if node = invalid then return RokuEngine_CreateIdentityTransform()
  parent = RokuEngine_CreateIdentityTransform()
  if node.parentId <> invalid and node.parentId <> "" then parent = m.GetWorldTransform(node.parentId)
  return RokuEngine_ComposeTransform(parent,RokuEngine_CreateAuthoredLocalTransform(node))
end function
sub GMNothing(value = invalid as Dynamic)
end sub
sub GMControlAudio(id as String, command as String)
end sub
sub GMPaused(value as Boolean)
  m.scene.paused = value
end sub
sub GMPhysicsPaused(value as Boolean)
  m.scene.physicsPaused = value
end sub
function GMLoad(section as String, key as String, fallback as Dynamic) as Dynamic
  return fallback
end function
sub GMReady(node as Object, component as Object, dt as Float)
end sub
sub GMInput(node as Object, component as Object, eventName as String, dt as Float, extra as Object)
  m.lastScriptInput = extra
end sub

engine.scene = {rootNodeId:"root",cameraX:0,cameraY:0,cameraZoom:1,paused:false,runtime:{nodes:{}},doc:molDoc}
engine.RefreshSceneCaches()
engine.scene.nodeMap.root.parentId = ""
engine.FindNodeByName = GMFind
engine.GetWorldTransform = GMWorld
engine.SetPaused = GMPaused
engine.SetPhysicsPaused = GMPhysicsPaused
engine.HideScreen = GMNothing : engine.ChangeScreen = GMNothing
engine.SetFocusedNode = GMNothing : engine.MarkUIDirty = GMNothing
engine.ControlAudio = GMControlAudio
engine.Storage_Load = GMLoad : engine.Storage_LoadInt = GMLoad
engine.inputState = {heldActions:{}} : engine.focus = {}
engine.QuerySegment = RokuEngine_QuerySegment
engine.BuildColliderList = RokuEngine_BuildColliderList
engine.collisionSystem = RokuEngine_CreateCollisionSystem(engine)
engine.frameNumber = 1
RokuScript_components_campaign_Ready({engine:engine,scene:engine.scene,node:engine.scene.nodeMap.root,component:{}})
g = engine.scene.runtime.mol
defs = ParseJSON(engine.scene.nodeMap.Pools.components[0].pools,"i")
for each def in defs
  def.initialSize = 1 : def.growBy = 4
  RokuPool_InitPool(def,engine.scene.nodeMap.Pools,engine)
end for
engine.scene.nodeMap.Playfield.visible = true

' All waves and all four boss configurations, reusing native pooled nodes.
for day = 1 to 22
  g.day = day : MOLR_StartDay(g)
  GPCheck(g.wave = 1 and g.total >= 1, "campaign day starts "+day.ToStr())
  while true
    if g.mode = "alert" then MOLR_SpawnWave(g,true)
    GPCheck(g.enemies.Count() > 0, "campaign wave spawns "+day.ToStr())
    for each e in g.enemies
      e.nativeReferenceCheck = day
      GPCheck(engine.scene.nodeMap[e.nodeId].transform.nativeReferenceCheck = day, "entity owns native transform")
      if e.boss then
        for each fraction in [1.0,0.6,0.3]
          e.hp = e.maxHp*fraction : MOLR_BossUpdate(g,e,0.02)
          e.windup = 0 : e.fire = 0 : e.state = "formation"
          MOLR_BossUpdate(g,e,0.02)
          GPCheck(g.hostile.Count() > 0, "boss phase fires native projectiles")
        end for
        GPCheck(e.bossPhase = 3, "boss reaches third phase")
      end if
    end for
    MOLR_ClearCombat(g)
    if g.wave = g.total then exit while
    MOLR_NextWave(g)
  end while
end for
GPCheck(engine.scene.runtime.objectPools.Enemies.instances.Count() <= 256, "pool growth stays bounded")
RokuPool_InitPool({name:"BoundedTest",nodeType:"Node2D",size:3,initialSize:1,growBy:2,properties:{imagePath:"original",nested:{value:1}},components:[]},engine.scene.nodeMap.Pools,engine)
a = engine.PoolAcquire("BoundedTest",1,2)
b = engine.PoolAcquire("BoundedTest",3,4)
c = engine.PoolAcquire("BoundedTest",5,6)
a.properties.nested.value = 99
a.properties.imagePath = "changed"
GPCheck(a.properties.imagePath = "changed" and b.properties.imagePath = "original", "pooled camel case properties stay mutable")
GPCheck(b.properties.nested.value = 1 and c.properties.nested.value = 1, "grown nodes own property data")
GPCheck(engine.PoolAcquire("BoundedTest",0,0) = invalid, "growth stops at maximum")
engine.PoolRelease(a.id)
GPCheck(engine.PoolAcquire("BoundedTest",7,8).transform.x = 7, "released object can be reused")

g.day = 1 : g.mode = "playing" : g.score = 0 : g.kills = 0 : g.tier = 1
g.skill = MOLR_StatsCreate() : g.effects = {} : g.angel.hp = 5 : g.angel.inv = 0
for each power in ["shield","rapid","triple","speed","power","pierce","slow","prayerShield"]
  item = MOLR_Spawn(g,"Pickups",{x:g.angel.x,y:g.angel.y,name:power,row:14,column:0,dead:false})
  MOLR_Contact({engine:engine,scene:engine.scene,node:engine.scene.nodeMap[item.nodeId],extra:{otherNodeId:"Player"}})
  GPCheck(MOLR_Effect(g,power), "native pickup applies "+power)
end for
MOLR_Hit(g,false,1)
GPCheck(g.angel.hp = 5, "shield prevents damage")
g.effects = {} : MOLR_Hit(g,false,1)
GPCheck(g.angel.hp = 4 and g.effects.Count() = 0, "player damage removes powers")
MOLR_Hit(g,false,1) : GPCheck(g.angel.hp = 4, "invulnerability prevents repeated damage")
g.angel.inv = 0 : MOLR_Hit(g,false,9)
GPCheck(g.mode = "lost" and g.angel.hp = 0, "defeat state")
MOLR_ClearCombat(g) : g.mode = "playing"
for each power in ["rapid","triple","speed","power","pierce"]
  g.effects = {} : g.effects[power] = 10
  MOLR_CreateShots(g,g.angel)
  GPCheck(g.shots.Count() > 0, "weapon works with "+power)
  MOLR_ClearCombat(g)
end for
g.effects = {} : g.kills = 219
e = {dead:false,score:100,boss:false,state:"formation"}
MOLR_Kill(g,e) : GPCheck(g.tier = 2, "tier two at 220 kills")
g.kills = 649 : e.dead = false : MOLR_Kill(g,e)
GPCheck(g.tier = 3, "tier three at 650 kills")

' Ordered swept queries stop piercing beams at the nearest obstacle.
boxes = [{nodeId:"far",x:70,y:0,width:10,height:10},{nodeId:"near",x:20,y:0,width:10,height:10},{nodeId:"behind",x:-20,y:0,width:5,height:10}]
hits = engine.QuerySegment(0,5,100,5,0,"",boxes)
GPCheck(hits.Count() = 2 and hits[0].nodeId = "near" and hits[1].nodeId = "far", "segment hits ordered and bounded")
hits = engine.QuerySegment(0,5,100,5,0,"near",boxes)
GPCheck(hits.Count() = 1 and hits[0].nodeId = "far", "segment skip id")
GPCheck(engine.QuerySegment(25,5,25,5,0,"",boxes).Count() = 1, "zero length inside")
GPCheck(engine.QuerySegment(0,12,100,12,0,"",boxes).Count() = 0, "parallel segment misses")
GPCheck(engine.QuerySegment(0,12,100,12,3,"",boxes).Count() = 2, "sweep radius")

' Native shot damage, interception, and piercing obstacle ordering.
for each contactMethod in ["aabb","circle"]
engine.projectSettings = {physics:{contactMethod:contactMethod}}
MOLR_ClearCombat(g) : g.effects = {} : g.tier = 1 : g.mode = "playing"
enemy = MOLR_Spawn(g,"Enemies",{x:270,y:200,hp:5,maxHp:5,row:2,radius:18,score:100,boss:false,id:999,hitFlash:0,windup:0,state:"formation",dead:false})
MOLR_CreateShots(g,{x:270,y:250})
MOLR_Projectiles(g,0.05,0.05)
GPCheck(enemy.hp = 4 and g.shots[0].dead, "swept shot damages native enemy")
MOLR_ClearCombat(g)
bullet = MOLR_Spawn(g,"Hostile",{x:270,y:200,vx:0,vy:0,radius:5,defensible:true,dead:false})
scoreBefore = g.score
MOLR_CreateShots(g,{x:270,y:250}) : MOLR_Projectiles(g,0.05,0.05)
GPCheck(bullet.dead and g.score = scoreBefore+50, "native projectile interception scores")
MOLR_ClearCombat(g) : g.effects = {pierce:10}
enemy = MOLR_Spawn(g,"Enemies",{x:270,y:100,hp:5,maxHp:5,row:2,radius:18,score:100,boss:false,id:1000,hitFlash:0,windup:0,state:"formation",dead:false})
obstacle = MOLR_Spawn(g,"Hazards",{x:270,y:150,row:0,column:0,size:48,radius:20,angle:0,dead:false})
MOLR_CreateShots(g,{x:270,y:250}) : MOLR_Projectiles(g,0.02,0.02)
GPCheck(enemy.hp = 5 and g.shots[0].beamTop > 0, "piercing beam blocked before farther enemy")
obstacle.dead = true : g.hazards = MOLR_Collect(g,"hazards")
MOLR_Projectiles(g,0.02,0.02)
GPCheck(enemy.hp = 4 and g.shots[0].beamTop = 0, "beam extends when obstacle clears")
MOLR_Projectiles(g,0.02,0.02) : GPCheck(enemy.hp = 4, "piercing damage deduplicated")
MOLR_ClearCombat(g)

end for
engine.projectSettings.physics.contactMethod = "aabb"

engine.EnsureScriptReady = GMReady : engine.InvokeScriptComponent = GMInput
RokuComponent_Script_Input({engine:engine,node:engine.scene.nodeMap.root,component:{},dt:0.01,event:{code:6,action:"action",isPress:true,isRelease:false,isRepeat:true}})
GPCheck(engine.lastScriptInput.isPress and engine.lastScriptInput.isRepeat and not engine.lastScriptInput.isRelease, "native script receives input edges")
ordered = RokuEngine_SortPhaseEntries([{priority:2,nodeOrder:0,ordinal:0},{priority:1,nodeOrder:2,ordinal:1},{priority:1,nodeOrder:1,ordinal:2},{priority:1,nodeOrder:1,ordinal:3}])
GPCheck(ordered[0].ordinal = 2 and ordered[1].ordinal = 3 and ordered[2].ordinal = 1 and ordered[3].ordinal = 0, "stable phase priority ordering")

g.time = 2.0 : g.landscapeStage = invalid
for each day in [1,8,15,19]
  g.day = day : MOLR_Landscape(g,0.02)
end for
GPCheck(engine.scene.nodeMap.Car0.visible and engine.scene.nodeMap.Person0.visible and engine.scene.nodeMap.Road.visible, "city scenery native nodes")
g.day = 15 : MOLR_Landscape(g,0.02)
GPCheck(engine.scene.nodeMap.Animal0.visible and not engine.scene.nodeMap.Car0.visible, "countryside scenery native nodes")

' Real fixed hook: movement, firing, effect expiration, and day recovery.
MOLR_ClearCombat(g) : g.day = 1 : MOLR_StartDay(g)
g.firing = true : g.fire = 0 : g.angel.hp = 5 : g.prayer.hp = 12
g.effects = {rapid:0.001} : g.time = 0 : g.noticeTime = 0
engine.inputState.heldActions = {move_right:true}
beforeX = g.angel.x
RokuScript_components_campaign_PhysicsUpdate({engine:engine,scene:engine.scene,node:engine.scene.nodeMap.root,dt:0.02})
GPCheck(g.angel.x > beforeX and g.shots.Count() > 0, "native fixed hook moves and fires")
GPCheck(not MOLR_Effect(g,"rapid"), "timed power expires in fixed hook")
engine.inputState.heldActions = {}
MOLR_ClearCombat(g) : g.wave = g.total : g.mode = "playing"
RokuScript_components_campaign_PhysicsUpdate({engine:engine,scene:engine.scene,node:engine.scene.nodeMap.root,dt:0.02})
GPCheck(g.mode = "transition", "empty final wave completes day")
RokuScript_components_campaign_PhysicsUpdate({engine:engine,scene:engine.scene,node:engine.scene.nodeMap.root,dt:0.1})
GPCheck(g.angel.scaleX > 1, "native transition animates messenger")
g.angel.hp = 3 : g.prayer.hp = 8
RokuScript_components_campaign_Timeout({engine:engine,scene:engine.scene,node:engine.scene.nodeMap.SequenceClock})
GPCheck(g.day = 2 and g.angel.hp = 4 and g.prayer.hp = 10, "native sequence advances and heals")

profile = MOLR_ValidateProfile({version:2,best:20,scores:[{name:"ABC",score:50,day:22,won:true},{name:"?",score:999,day:99}]},10)
GPCheck(profile.best = 50 and profile.scores.Count() = 1, "profile migration and invalid rows")
for i = 1 to 12
  MOLR_AddScore(profile,"AAA",i*100,1,false)
end for
GPCheck(profile.scores.Count() = 10 and profile.scores[0].score = 1200, "sorted top ten")
g.entry = [0,25,35] : GPCheck(MOLR_Initials(g) = "AZ9", "remote initials")
g.lastRecipient = 0 : g.day = 22 : g.mode = "delivering"
g.delivery = {time:0,fromX:270,fromY:875,angelX:270,angelY:720,recipient:1}
g.nativeMode = "delivering"
RokuScript_components_campaign_PhysicsUpdate({engine:engine,scene:engine.scene,node:engine.scene.nodeMap.root,dt:0.1})
GPCheck(g.prayer.y < 875 and g.angel.scaleX > 1, "delivery moves native actors")
RokuScript_components_campaign_Timeout({engine:engine,scene:engine.scene,node:engine.scene.nodeMap.SequenceClock})
GPCheck(g.mode = "won", "native delivery timer wins campaign")
GPCheck(engine.scene.nodeMap.Player.zIndex > engine.scene.nodeMap.DeliveryHome.zIndex, "delivery actors render above home")

anim = GPNode("animationCheck","AnimatedSprite2D","root",{})
art = engine.EnsureNodeRuntime(anim) : art.elapsed = 0.5 : art.fps = 8 : art.playbackMode = "loop"
engine.ComputeAnimationFrameIndex = RokuEngine_ComputeAnimationFrameIndex
GPCheck(engine.ComputeAnimationFrameIndex(anim,4) = 0, "animation reads engine runtime")
art.elapsed = 0.25
GPCheck(engine.ComputeAnimationFrameIndex(anim,4) = 2, "animation advances")
print "PASS: MOL native campaign"
