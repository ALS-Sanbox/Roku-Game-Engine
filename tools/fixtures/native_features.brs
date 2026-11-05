sub FeatureAssert(name as String, passed as Boolean)
  if passed then print "FEATURE_PASS "; name else print "FEATURE_FAIL "; name
end sub

sub RokuScript_components_native_features_Ready(context as Object)
  e = context.engine : camera = e.FindNodeByName("camera") : target = e.FindNodeByName("player")
  p = camera.properties : p.cameraBounds = false : p.followTargetName = "player" : p.followLerp = 1 : p.lookAheadX = 40
  target.transform.x = 100 : target.transform.y = 100 : e.MarkSubtreeDirty(target.id)
  e.ApplyCameraFollow(1.0/60)
  target.transform.x = 200 : e.MarkSubtreeDirty(target.id) : e.ApplyCameraFollow(1.0/60)
  FeatureAssert("camera look ahead", Abs(e.scene.cameraX - (200+32+40-640)) < 0.01)
  p.lookAheadX = 0 : p.deadzoneWidth = 100 : e.scene.cameraX = -408
  target.transform.x = 225 : e.MarkSubtreeDirty(target.id) : e.ApplyCameraFollow(1.0/60)
  FeatureAssert("camera deadzone holds",Abs(e.scene.cameraX+408)<0.01)
  target.transform.x = 325 : e.MarkSubtreeDirty(target.id) : e.ApplyCameraFollow(1.0/60)
  FeatureAssert("camera deadzone edge follows",Abs(e.scene.cameraX+333)<0.01)
  p.deadzoneWidth = 0 : target.transform.x = 200 : e.MarkSubtreeDirty(target.id)
  p.dynamicZoom = true : e.scene.combatActive = true : p.combatZoom = 1.2 : e.ApplyCameraFollow(1.0/60)
  FeatureAssert("camera combat zoom",Abs(e.scene.cameraZoom-1.2)<0.01)
  p.dynamicZoom = false : e.scene.combatActive = false
  path = e.SpawnNode({type:"CameraPath2D",name:"testPath",properties:{autoPlay:true,duration:2,speed:50,loop:false,points:[{x:0,y:0},{x:100,y:0}]}},"root")
  point = RokuCamera_PathPoint(e,path,1.0)
  FeatureAssert("camera path midpoint",Abs(point.x-50)<0.01)
  point = RokuCamera_PathPoint(e,path,2.0)
  FeatureAssert("camera path stops",Abs(point.x-100)<0.01 and e.EnsureNodeRuntime(path).pathPlaying=false)
  path.properties.loop = true : e.EnsureNodeRuntime(path).pathTime = 0 : e.EnsureNodeRuntime(path).pathPlaying = true
  point = RokuCamera_PathPoint(e,path,3.0)
  FeatureAssert("camera path loops",Abs(point.x-50)<0.01)
  path.properties.points = [{x:0,y:0},{x:100,y:0},{x:100,y:100}] : path.properties.interpolation = "Cubic"
  e.EnsureNodeRuntime(path).pathTime = 0 : point = RokuCamera_PathPoint(e,path,1.0)
  FeatureAssert("camera cubic interpolation",Abs(point.x-50)<0.01 and point.y < 0)
  path.properties.enabled = false
  group = e.SpawnNode({type:"CameraTargetGroup",name:"testGroup",properties:{autoTrack:true,targets:[{nodeId:"player"}],minZoom:0.5,maxZoom:2,paddingLeft:0,paddingRight:0,paddingTop:0,paddingBottom:0}},"root")
  frame = RokuCamera_GroupFrame(e,group)
  FeatureAssert("camera group frame",Abs(frame.x-232)<0.01 and frame.zoom=2)
  group.properties.enabled = false
  zone = e.SpawnNode({type:"CameraZone2D",name:"testZone",transform:{x:0,y:0},properties:{width:800,height:600,mode:"Room Lock",priority:5,zoom:2,blendTime:0}},"root")
  e.ApplyCameraFollow(1.0/60)
  FeatureAssert("camera room zone",Abs(e.scene.cameraX-80)<0.01 and Abs(e.scene.cameraY-120)<0.01 and e.scene.cameraZoom=2)
  zone.properties.enabled = false
  e.ShakeCamera(8,0.5) : e.ApplyCameraFollow(0.1)
  FeatureAssert("camera shake enabled",Abs(e.EnsureNodeRuntime(camera).shakeX)>0)
  e.ApplyCameraFollow(1.0)
  FeatureAssert("camera shake ends",e.EnsureNodeRuntime(camera).shakeRemaining=0)
  p.followTargetName = "" : p.lookAheadX = 0 : p.zoom = 1
  camera.transform.x = 640 : camera.transform.y = 360 : e.MarkSubtreeDirty(camera.id) : e.ApplyCameraFollow(1.0/60)
  camera.transform.pivotX = 48 : camera.transform.pivotY = 36 : e.MarkSubtreeDirty(camera.id) : e.ApplyCameraFollow(1.0/60)
  FeatureAssert("camera center ignores gizmo pivot",Abs(e.scene.cameraX)<0.01 and Abs(e.scene.cameraY)<0.01)
  camera.transform.pivotX = 0 : camera.transform.pivotY = 0 : e.MarkSubtreeDirty(camera.id)

  wall = e.SpawnNode({name:"wall",type:"Node2D",properties:{width:2,height:100},transform:{x:100,y:0},components:[{type:"Collider2DComponent",enabled:true,width:2,height:100}]},"root")
  body = e.SpawnNode({name:"body",type:"Node2D",properties:{width:10,height:10},transform:{x:0,y:10},components:[{type:"Collider2DComponent",enabled:true,width:10,height:10}]},"root")
  rb = {type:"RigidBodyComponent",bodyType:"dynamic",vx:10000,vy:0,friction:1,bounce:0.5}
  e.ApplyRigidBodyMotion(body,rb,0.1)
  FeatureAssert("swept wall collision",Abs(body.transform.x-90)<0.01 and e.EnsureNodeRuntime(body).rbVx=-5000)
  body.transform.x = 95 : e.MarkSubtreeDirty(body.id)
  e.ResolveRigidBodyCollisions(body,rb,e.BuildColliderList())
  FeatureAssert("minimal penetration correction",Abs(body.transform.x-90)<0.01)
  parent = e.SpawnNode({name:"scaledParent",type:"Node2D",transform:{scaleX:2,scaleY:2}},"root")
  child = e.SpawnNode({name:"scaledBody",type:"Node2D",properties:{width:5,height:5},transform:{x:0,y:10},components:[{type:"Collider2DComponent",enabled:true,width:5,height:5}]},parent.id)
  e.ApplyRigidBodyMotion(child,{bodyType:"dynamic",vx:10000,vy:0,friction:1},0.1)
  FeatureAssert("parent space collision correction",Abs(child.transform.x-45)<0.01)
  shapeBounds = RokuCollision_LocalShapeBounds([{type:"rect",x:0.25,y:0.25,w:0.5,h:0.5}],40,20)
  FeatureAssert("authored rectangle physics shape",shapeBounds.x=10 and shapeBounds.y=5 and shapeBounds.width=20 and shapeBounds.height=10)
  other = e.SpawnNode({name:"otherBody",type:"Node2D",properties:{width:10,height:10},transform:{x:300,y:300},components:[{type:"RigidBody2DComponent",enabled:true,bodyType:"dynamic",mass:1,vx:0,vy:0}]},"root")
  reflected = RokuCollision_ImpactVelocity(e,body,{mass:1},{nodeId:other.id},0,100,1)
  FeatureAssert("equal mass collision transfers velocity",Abs(reflected)<0.01 and Abs(e.EnsureNodeRuntime(other).rbVx-100)<0.01)
  for each node in [wall,body,child,parent,path,group,zone,other]
    e.DestroyNode(node.id)
  end for
  a = e.SpawnNode({name:"triggerA",type:"Node2D",properties:{width:10,height:10},components:[{type:"Collider2DComponent",enabled:true,width:10,height:10,isTrigger:true}]},"root")
  b = e.SpawnNode({name:"triggerB",type:"Node2D",properties:{width:10,height:10},components:[{type:"Collider2DComponent",enabled:true,width:10,height:10,isTrigger:true}]},"root")
  e.collisionSystem.Process(0.016,e.BuildColliderList())
  FeatureAssert("contact pairs are unique",e.stats.collisionCount=1)
  e.DestroyNode(a.id) : e.DestroyNode(b.id)
  target.components = [] : target.visible = false
  sound = e.FindNodeByName("sound")
  e.PlayNodeAudio(sound,{resourcePath:"res://audio/tone.wav"})
  runtime = RokuAudio_GetRuntime(e,sound,{resourcePath:"res://audio/tone.wav"})
  FeatureAssert("native audio content setup",runtime.audioReady=true and Instr(1,runtime.audioClipPath,"audio/native/")>0)
  if runtime.audioReady then runtime.audioPlayer.Play() : runtime.audioPlayer.Pause() : runtime.audioPlayer.Resume() : runtime.audioPlayer.Stop()
  sound.components = [{id:"stream",type:"AudioSourceComponent",enabled:true,resourcePath:"res://audio/tone.wav",audioId:"tone"},{id:"effect",type:"AudioSourceComponent",enabled:true,resourcePath:"res://audio/tone.wav",audioId:"effect"}]
  FeatureAssert("script audio controls",e.ControlAudio("sound","play","stream"))
  e.ControlAudio("sound","stop","stream")
  e.PlayNodeAudio(sound,sound.components[1])
  voice = RokuAudio_GetRuntime(e,sound,sound.components[1])
  FeatureAssert("one-shot native voice",voice.audioReady=true and voice.audioPlayer.oneShot=true)
  voice.audioPlayer.Play() : voice.audioPlayer.Stop()
  print "FEATURE_TESTS complete"
end sub
