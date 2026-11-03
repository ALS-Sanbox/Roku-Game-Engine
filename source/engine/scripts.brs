' scripts.brs - generated classic 2D runtime

function RokuEngine_NormalizeScriptPath(scriptPath as Dynamic) as String
  if scriptPath = invalid then return ""
  value = RokuEngine_Trim(RokuEngine_ToString(scriptPath))
  if value = "" then return ""
  if Left(value, 6) = "pkg:/" then return "res://" + Mid(value, 6)
  if Left(value, 1) = "/" then return "res://" + Mid(value, 2)
  if Left(value, 6) <> "res://" then return "res://" + value
  return value
end function

function RokuEngine_BuildScriptContext(node as Object, component as Object, eventName as String, dt as Dynamic, extra as Dynamic) as Object
  context = {
    engine: m
    scene: m.scene
    node: node
    component: component
    eventName: eventName
    dt: dt
    extra: extra
  }
  return context
end function

sub RokuEngine_InvokeScriptComponent(node as Object, component as Object, eventName as String, dt as Dynamic, extra as Dynamic)
  if node = invalid or component = invalid then return
  scriptPath = ""
  if component.scriptPath <> invalid then scriptPath = RokuEngine_NormalizeScriptPath(component.scriptPath)
  if scriptPath = "" then return
  entryPoint = ""
  if eventName <> invalid then entryPoint = eventName
  if entryPoint = "" and component.entryPoint <> invalid and component.entryPoint <> "" then entryPoint = component.entryPoint
  if entryPoint = "" then entryPoint = "Update"
  lowerEntry = LCase(RokuEngine_Trim(RokuEngine_ToString(entryPoint)))
  if lowerEntry = "_ready" then entryPoint = "Ready"
  if lowerEntry = "_init" then entryPoint = "Init"
  if lowerEntry = "_pre_update" or lowerEntry = "preupdate" then entryPoint = "PreUpdate"
  if lowerEntry = "_physics_process" or lowerEntry = "physicsupdate" then entryPoint = "PhysicsUpdate"
  if lowerEntry = "_process" or lowerEntry = "_update" then entryPoint = "Update"
  if lowerEntry = "_late_update" or lowerEntry = "lateupdate" then entryPoint = "LateUpdate"
  if lowerEntry = "_post_update" or lowerEntry = "postupdate" then entryPoint = "PostUpdate"
  if lowerEntry = "_input" then entryPoint = "Input"
  if lowerEntry = "_collision" then entryPoint = "Collision"
  if lowerEntry = "sceneenter" then entryPoint = "SceneEnter"
  if lowerEntry = "sceneexit" then entryPoint = "SceneExit"
  context = m.RokuEngine_BuildScriptContext(node, component, entryPoint, dt, extra)
  RokuEngine_UserScriptDispatch(scriptPath, entryPoint, context)
end sub

sub RokuEngine_InvokeNodeScripts(node as Object, eventName as String, dt as Dynamic, extra as Dynamic)
  if node = invalid then return
  components = node.components
  if type(components) <> "roArray" then return
  for each component in components
    if component = invalid or component.enabled = false then continue for
    if component.type = "ScriptComponent" then m.InvokeScriptComponent(node, component, eventName, dt, extra)
  end for
end sub
