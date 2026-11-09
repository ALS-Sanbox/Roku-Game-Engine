' Native method selection, geometry, ordered queries and real trigger dispatch.
function CTWorld(id as String) as Object
  n = m.scene.nodeMap[id]
  if n.testWorld <> invalid then return n.testWorld
  return RokuEngine_ComposeTransform(RokuEngine_CreateIdentityTransform(),RokuEngine_CreateAuthoredLocalTransform(n))
end function
sub CTUpdate(scene as Object)
end sub
sub CTEvent(node as Object, eventName as String, dt as Float, extra as Object)
  m.events.Push({node:node.id,name:eventName,other:extra.otherNodeId})
end sub
function CTCircle(id as String, x as Float, y as Float, radius as Float) as Object
  return {nodeId:id,shape:"circle",centerX:x,centerY:y,radius:radius,x:x-radius,y:y-radius,width:radius*2,height:radius*2,layer:"default",mask:"default",isTrigger:true}
end function

ctRoot = GPNode("ctRoot","SceneRoot","",{})
ctA = GPNode("ctA","Node2D","ctRoot",{width:20,height:20})
ctB = GPNode("ctB","Node2D","ctRoot",{width:20,height:20})
ctA.components = [{type:"Collider2DComponent",width:20,height:20,isTrigger:true,offsetX:0,offsetY:0}]
ctB.components = [{type:"Collider2DComponent",width:20,height:20,isTrigger:true,offsetX:0,offsetY:0}]
ctB.transform.x = 18 : ctB.transform.y = 18
ctEngine = {scene:{nodeMap:{ctRoot:ctRoot,ctA:ctA,ctB:ctB},runtime:{nodes:{}},doc:{nodes:[ctRoot,ctA,ctB]}},projectSettings:{physics:{contactMethod:"aabb"}},events:[],EnsureNodeRuntime:RokuEngine_EnsureNodeRuntime,GetWorldTransform:CTWorld,UpdateWorldTransforms:CTUpdate,InvokeNodeScripts:CTEvent,QuerySegment:RokuEngine_QuerySegment}
ct = RokuEngine_CreateCollisionSystem(ctEngine)
ctEngine.BuildColliderList = RokuEngine_BuildColliderList : ctEngine.collisionSystem = ct

ca = ct.GetNodeCollider(ctA) : cb = ct.GetNodeCollider(ctB)
GPCheck(ca.shape = "aabb" and RokuCollision_TestContact(ca,cb), "default box keeps corner contacts")
ctEngine.projectSettings.physics.contactMethod = "circle"
ca = ct.GetNodeCollider(ctA) : cb = ct.GetNodeCollider(ctB)
GPCheck(ca.shape = "circle" and ca.radius = 10 and not RokuCollision_TestContact(ca,cb), "project circle rejects box-only corners")
ctB.transform.x = 20 : ctB.transform.y = 0 : cb = ct.GetNodeCollider(ctB)
GPCheck(RokuCollision_TestContact(ca,cb), "circle tangency included")
ctA.components[0].contactMethod = "aabb" : ca = ct.GetNodeCollider(ctA)
GPCheck(ca.shape = "aabb", "collider box override")
ctEngine.projectSettings.physics.contactMethod = "aabb" : ctA.components[0].contactMethod = "circle"
ca = ct.GetNodeCollider(ctA)
GPCheck(ca.shape = "circle", "collider circle override")
ctA.components[0].isTrigger = false : ca = ct.GetNodeCollider(ctA)
GPCheck(ca.shape = "aabb", "solid solver keeps box geometry")
ctA.components[0].isTrigger = true : ctA.components[0].circleRadius = 7
ctA.components[0].offsetX = 4 : ctA.components[0].offsetY = 2
ctA.testWorld = {a:0,b:2,c:-3,d:0,x:100,y:200,scaleX:2,scaleY:3,rotation:90,visible:true,opacity:1}
ca = ct.GetNodeCollider(ctA)
GPCheck(ca.centerX = 64 and ca.centerY = 228 and Abs(ca.radius-21) < 0.001, "circle uses transformed center and largest scale")
ctA.testWorld = {a:1,b:0,c:1,d:1,x:0,y:0,scaleX:1,scaleY:1,rotation:0,visible:true,opacity:1}
ca = ct.GetNodeCollider(ctA)
GPCheck(ca.radius > 11.3 and ca.radius < 11.4, "nested shear uses largest singular scale")

circle = CTCircle("circle",0,0,5)
rectangle = {nodeId:"rectangle",x:4,y:4,width:4,height:4}
GPCheck(not RokuCollision_TestContact(circle,rectangle) and not RokuCollision_TestContact(rectangle,circle), "mixed contacts reject corner false positives symmetrically")
rectangle.x = 3 : rectangle.y = 0
GPCheck(RokuCollision_TestContact(circle,rectangle) and RokuCollision_TestContact(rectangle,circle), "mixed edge contact")
hits = ctEngine.QuerySegment(-10,0,10,0,0,"",[circle])
GPCheck(hits.Count() = 1 and Abs(hits[0].fraction-0.25) < 0.0001, "circle swept hit entry")
GPCheck(ctEngine.QuerySegment(-10,5,10,5,0,"",[circle]).Count() = 1, "swept tangent")
GPCheck(ctEngine.QuerySegment(-10,5.1,10,5.1,0,"",[circle]).Count() = 0, "sweep outside circle misses")
GPCheck(ctEngine.QuerySegment(-10,7,10,7,2,"",[circle]).Count() = 1, "swept radius expansion")
GPCheck(ctEngine.QuerySegment(0,0,0,0,0,"",[circle]).Count() = 1, "zero length inside circle")
GPCheck(ctEngine.QuerySegment(7,0,7,0,0,"",[circle]).Count() = 0, "zero length outside circle")
GPCheck(ctEngine.QuerySegment(8,0,12,0,0,"",[circle]).Count() = 0, "circle behind ray excluded")
GPCheck(ctEngine.QuerySegment(-10,0,10,0,0,"circle",[circle]).Count() = 0, "circle query skip")
hits = ctEngine.QuerySegment(-10,0,30,0,0,"",[CTCircle("far",20,0,2),circle])
GPCheck(hits.Count() = 2 and hits[0].nodeId = "circle" and hits[1].nodeId = "far", "circle hits nearest first")

' Enter/Stay/Exit and overlap API all use the selected geometry and layers.
ctA.Delete("testWorld") : ctA.components[0].offsetX = 0 : ctA.components[0].offsetY = 0 : ctA.components[0].circleRadius = 0
ctA.components[0].contactMethod = "project" : ctEngine.projectSettings.physics.contactMethod = "circle"
ctB.transform.x = 18 : ctB.transform.y = 18
ct.Process(0.02,ct.BuildColliderList())
GPCheck(ctEngine.events.Count() = 0, "circle corner has no trigger enter")
ctB.transform.x = 10 : ctB.transform.y = 0
ct.Process(0.02,ct.BuildColliderList())
GPCheck(ctEngine.events.Count() = 4 and ctEngine.events[0].name = "CollisionEnter", "circle enter dispatch")
ctEngine.events = [] : ct.Process(0.02,ct.BuildColliderList())
GPCheck(ctEngine.events[0].name = "CollisionStay", "circle stay dispatch")
ctB.transform.x = 100 : ctEngine.events = [] : ct.Process(0.02,ct.BuildColliderList())
GPCheck(ctEngine.events[0].name = "CollisionExit", "circle exit dispatch")
ctA.components[0].mask = "other" : ctB.transform.x = 10 : ctEngine.events = []
ct.Process(0.02,ct.BuildColliderList())
GPCheck(ctEngine.events.Count() = 0, "circle respects layer masks")
ctA.components[0].mask = "default"
GPCheck(ct.FindOverlap(ct.GetNodeCollider(ctA),ct.BuildColliderList(),"ctA") <> invalid, "circle overlap API")

zone = GPNode("ctZone","TriggerZone2D","ctRoot",{width:40,height:20,enabled:true})
ctEngine.scene.nodeMap.ctZone = zone
cz = ct.GetNodeCollider(zone)
GPCheck(cz.shape = "circle" and cz.radius = 10, "trigger zone inherits circle method")
zone.properties.contactMethod = "aabb" : cz = ct.GetNodeCollider(zone)
GPCheck(cz.shape = "aabb" and cz.width = 40, "trigger zone overrides method")
print "PASS: collision methods"
