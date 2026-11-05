function RokuCamera_Clamp(value as Float, low as Float, high as Float) as Float
  if value < low then return low
  if value > high then return high
  return value
end function

function RokuCamera_Resolve(engine as Object, reference as Dynamic) as Dynamic
  if reference = invalid or reference = "" then return invalid
  if engine.scene.nodeMap.DoesExist(reference) then return engine.scene.nodeMap[reference]
  return engine.FindNodeByName(reference)
end function

function RokuCamera_PathPoint(engine as Object, node as Object, dt as Float) as Dynamic
  p = node.properties : points = p.points
  if type(points) <> "roArray" or points.Count() = 0 then return invalid
  runtime = engine.EnsureNodeRuntime(node)
  if runtime.pathTime = invalid then runtime.pathTime = 0.0
  if runtime.pathPlaying = invalid then runtime.pathPlaying = p.autoPlay = true
  if runtime.pathPlaying then runtime.pathTime = runtime.pathTime + dt
  lengths = [] : total = 0.0 : count = points.Count() - 1
  if p.closedPath = true then count = points.Count()
  for i = 0 to count - 1
    a = points[i] : b = points[(i + 1) mod points.Count()]
    distance = Sqr((b.x-a.x)^2 + (b.y-a.y)^2)
    lengths.Push(distance) : total = total + distance
  end for
  distance = runtime.pathTime * _BRS_NumCoalesce(p.speed, 200)
  if (p.speed = invalid or p.speed < 1) and p.duration <> invalid and p.duration > 0 then distance = runtime.pathTime / p.duration * total
  if total > 0 and p.loop = true then distance = distance - Fix(distance / total) * total
  if distance >= total then distance = total : runtime.pathPlaying = false
  point = points[0]
  for i = 0 to lengths.Count() - 1
    length = lengths[i]
    if distance <= length or i = lengths.Count() - 1 then
      t = 0.0
      if length > 0 then t = distance / length
      if p.interpolation = "Smooth" then t = t*t*(3-2*t)
      a = points[i] : b = points[(i+1) mod points.Count()]
      point = {x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t}
      if p.interpolation = "Cubic" and points.Count() > 2 then
        before = i-1 : after = i+2
        if p.closedPath = true then
          before = (before+points.Count()) mod points.Count() : after = after mod points.Count()
        else
          if before < 0 then before = 0
          if after >= points.Count() then after = points.Count()-1
        end if
        pa = points[before] : pd = points[after]
        point.x = 0.5*((2*a.x)+(-pa.x+b.x)*t+(2*pa.x-5*a.x+4*b.x-pd.x)*t*t+(-pa.x+3*a.x-3*b.x+pd.x)*t*t*t)
        point.y = 0.5*((2*a.y)+(-pa.y+b.y)*t+(2*pa.y-5*a.y+4*b.y-pd.y)*t*t+(-pa.y+3*a.y-3*b.y+pd.y)*t*t*t)
      end if
      exit for
    end if
    distance = distance - length
  end for
  world = engine.GetWorldTransform(node.id)
  px = _BRS_NumCoalesce(node.transform.pivotX,0) : py = _BRS_NumCoalesce(node.transform.pivotY,0)
  return {x:world.x+world.a*(point.x+px)+world.c*(point.y+py),y:world.y+world.b*(point.x+px)+world.d*(point.y+py)}
end function

function RokuCamera_GroupFrame(engine as Object, group as Object) as Dynamic
  p = group.properties
  if type(p.targets) <> "roArray" then return invalid
  left = 1e20 : right = -1e20 : top = 1e20 : bottom = -1e20 : count = 0
  for each entry in p.targets
    node = RokuCamera_Resolve(engine, entry.nodeId)
    if node = invalid then continue for
    world = engine.GetWorldTransform(node.id)
    if not world.visible then continue for
    rect = RokuEngine_WorldRect(world,_BRS_NumCoalesce(node.properties.width,0),_BRS_NumCoalesce(node.properties.height,0))
    if rect.x < left then left = rect.x
    if rect.y < top then top = rect.y
    if rect.x+rect.width > right then right = rect.x+rect.width
    if rect.y+rect.height > bottom then bottom = rect.y+rect.height
    count = count + 1
  end for
  if count = 0 then return invalid
  left = left-_BRS_NumCoalesce(p.paddingLeft,64) : right = right+_BRS_NumCoalesce(p.paddingRight,64)
  top = top-_BRS_NumCoalesce(p.paddingTop,64) : bottom = bottom+_BRS_NumCoalesce(p.paddingBottom,64)
  zoom = engine.scene.cameraZoom
  if p.enableAutoZoom <> false then zoom = RokuCamera_Clamp(engine.width/(right-left+0.00001),0.1,engine.height/(bottom-top+0.00001))
  return {x:(left+right)*0.5,y:(top+bottom)*0.5,zoom:RokuCamera_Clamp(zoom,_BRS_NumCoalesce(p.minZoom,0.5),_BRS_NumCoalesce(p.maxZoom,3))}
end function

sub RokuEngine_ApplyCameraFollow(dt as Float)
  if m.scene = invalid then return
  m.UpdateActiveCameraNode()
  camera = RokuCamera_Resolve(m,m.activeCameraNodeId)
  if camera = invalid then return
  p = camera.properties
  if p.enabled = false then return
  m.UpdateWorldTransforms(m.scene)
  world = m.GetWorldTransform(camera.id) : runtime = m.EnsureNodeRuntime(camera)
  if runtime.shakeX <> invalid then m.scene.cameraX = m.scene.cameraX-runtime.shakeX : m.scene.cameraY = m.scene.cameraY-runtime.shakeY
  runtime.shakeX = 0.0 : runtime.shakeY = 0.0
  px = _BRS_NumCoalesce(camera.transform.pivotX,0) : py = _BRS_NumCoalesce(camera.transform.pivotY,0)
  cx = world.x+world.a*px+world.c*py : cy = world.y+world.b*px+world.d*py
  zoom = RokuCamera_Clamp(_BRS_NumCoalesce(p.zoom,1),0.1,10)
  lerp = RokuCamera_Clamp(_BRS_NumCoalesce(p.followLerp,1),0,1)
  target = RokuCamera_Resolve(m,p.followTargetName)
  if target <> invalid then
    rect = RokuEngine_WorldRect(m.GetWorldTransform(target.id),_BRS_NumCoalesce(target.properties.width,0),_BRS_NumCoalesce(target.properties.height,0))
    cx = rect.x+rect.width*0.5 : cy = rect.y+rect.height*0.5
    if runtime.previousX <> invalid then
      runtime.targetSpeed = 0.0
      if dt > 0 then runtime.targetSpeed = Sqr((cx-runtime.previousX)^2+(cy-runtime.previousY)^2)/dt
      if cx > runtime.previousX then runtime.directionX = 1
      if cx < runtime.previousX then runtime.directionX = -1
      if cy > runtime.previousY then runtime.directionY = 1
      if cy < runtime.previousY then runtime.directionY = -1
    end if
    runtime.previousX = cx : runtime.previousY = cy
    cx = cx+_BRS_NumCoalesce(runtime.directionX,0)*_BRS_NumCoalesce(p.lookAheadX,0)
    cy = cy+_BRS_NumCoalesce(runtime.directionY,0)*_BRS_NumCoalesce(p.lookAheadY,0)
  end if
  zone = invalid : priority = -1e20 : group = invalid : path = invalid : bounds = invalid
  for each node in m.scene.doc.nodes
    np = node.properties
    if np = invalid or np.enabled = false then continue for
    if node.type = "CameraZone2D" then
      zr = RokuEngine_WorldRect(m.GetWorldTransform(node.id),_BRS_NumCoalesce(np.width,0),_BRS_NumCoalesce(np.height,0))
      if cx >= zr.x and cy >= zr.y and cx <= zr.x+zr.width and cy <= zr.y+zr.height then
        if _BRS_NumCoalesce(np.priority,0) > priority then zone = node : priority = _BRS_NumCoalesce(np.priority,0)
      end if
    else if node.type = "CameraTargetGroup" and np.autoTrack <> false and group = invalid then
      group = node
    else if node.type = "CameraPath2D" and np.autoPlay = true and path = invalid then
      path = node
    end if
  end for
  if zone <> invalid then
    zp = zone.properties
    zoom = RokuCamera_Clamp(_BRS_NumCoalesce(zp.zoom,zoom),0.1,10)
    cx = cx+_BRS_NumCoalesce(zp.offsetX,0) : cy = cy+_BRS_NumCoalesce(zp.offsetY,0)
    if zp.followLerp <> invalid then lerp = RokuCamera_Clamp(zp.followLerp,0,1)
    if zp.targetGroupOverride <> invalid then group = RokuCamera_Resolve(m,zp.targetGroupOverride)
    if zp.pathOverride <> invalid then path = RokuCamera_Resolve(m,zp.pathOverride)
    if zp.boundsOverride <> invalid then bounds = RokuCamera_Resolve(m,zp.boundsOverride)
    if zp.mode = "Room Lock" or p.roomLock = true then
      zr = RokuEngine_WorldRect(m.GetWorldTransform(zone.id),zp.width,zp.height)
      cx = zr.x+zr.width*0.5 : cy = zr.y+zr.height*0.5
    end if
    blend = _BRS_NumCoalesce(zp.blendTime,0)
    runtime.zoneBlend = blend
    if blend > 0 then lerp = 1-Exp(-dt/blend)
  end if
  zoneId = ""
  if zone <> invalid then zoneId = zone.id
  if runtime.zoneId <> zoneId then
    oldZoneId = _BRS_StrCoalesce(runtime.zoneId,"")
    runtime.zoneId = zoneId
    sendEvent = runtime.zoneEvents = true
    if zone <> invalid then sendEvent = sendEvent or zone.properties.eventsEnabled <> false
    if sendEvent then m.RunScriptHooks(0.0,{name:"CameraZoneChanged",phase:"camera_zone",zoneId:zoneId,previousZoneId:oldZoneId})
    runtime.zoneEvents = zone <> invalid
    if zone <> invalid then runtime.zoneEvents = zone.properties.eventsEnabled <> false
    if zone = invalid then runtime.zoneExitRemaining = _BRS_NumCoalesce(runtime.zoneBlend,0)
  end if
  exitingZone = zone = invalid and _BRS_NumCoalesce(runtime.zoneExitRemaining,0) > 0
  if exitingZone then
    lerp = 1-Exp(-dt/runtime.zoneBlend)
    runtime.zoneExitRemaining = runtime.zoneExitRemaining-dt
  end if
  if group <> invalid then
    frame = RokuCamera_GroupFrame(m,group)
    if frame <> invalid then cx = frame.x : cy = frame.y : zoom = frame.zoom
    if group.properties.smoothing <> invalid then lerp = RokuCamera_Clamp(group.properties.smoothing,0,1)
  end if
  if path <> invalid then
    point = RokuCamera_PathPoint(m,path,dt)
    if point <> invalid then cx = point.x : cy = point.y
  end if
  if p.dynamicZoom = true then
    zoom = zoom/(1+_BRS_NumCoalesce(runtime.targetSpeed,0)/1000)
    if m.scene.combatActive = true then zoom = _BRS_NumCoalesce(p.combatZoom,1.2)
    zoom = RokuCamera_Clamp(zoom,_BRS_NumCoalesce(p.zoomMin,0.5),_BRS_NumCoalesce(p.zoomMax,2))
  end if
  if p.smoothFollow = false then lerp = 1
  if zone = invalid and not exitingZone and lerp > 0 and lerp < 1 then lerp = 1-(1-lerp)^(dt*60)
  if not m.scene.cameraInitialized then lerp = 1
  if p.dynamicZoom = true or group <> invalid or zone <> invalid or exitingZone then zoom = m.scene.cameraZoom+(zoom-m.scene.cameraZoom)*lerp
  m.scene.cameraZoom = zoom
  vw = m.width/zoom : vh = m.height/zoom
  desiredX = cx+_BRS_NumCoalesce(p.offsetX,0)-vw*0.5 : desiredY = cy+_BRS_NumCoalesce(p.offsetY,0)-vh*0.5
  if target <> invalid and group = invalid and path = invalid and zone = invalid and m.scene.cameraInitialized then
    dw = _BRS_NumCoalesce(p.deadzoneWidth,0)*0.5 : dh = _BRS_NumCoalesce(p.deadzoneHeight,0)*0.5
    ox = _BRS_NumCoalesce(p.deadzoneOffsetX,0) : oy = _BRS_NumCoalesce(p.deadzoneOffsetY,0)
    if dw > 0 then desiredX = desiredX-RokuCamera_Clamp(desiredX-m.scene.cameraX-ox,-dw,dw)-ox
    if dh > 0 then desiredY = desiredY-RokuCamera_Clamp(desiredY-m.scene.cameraY-oy,-dh,dh)-oy
  end if
  m.scene.cameraX = m.scene.cameraX+(desiredX-m.scene.cameraX)*lerp
  m.scene.cameraY = m.scene.cameraY+(desiredY-m.scene.cameraY)*lerp
  if p.cameraBounds = true then
    if bounds = invalid then
      for each node in m.scene.doc.nodes
        if node.type = "CameraBounds2D" then bounds = node : exit for
      end for
    end if
    br = invalid
    if bounds <> invalid then
      br = RokuEngine_WorldRect(m.GetWorldTransform(bounds.id),bounds.properties.width,bounds.properties.height)
    else if p.boundsWidth <> invalid and p.boundsHeight <> invalid then
      br = {x:_BRS_NumCoalesce(p.boundsX,0),y:_BRS_NumCoalesce(p.boundsY,0),width:p.boundsWidth,height:p.boundsHeight}
    end if
    if br <> invalid then
      if p.roomLock = true and zone = invalid then m.scene.cameraX = br.x+br.width*0.5-vw*0.5 : m.scene.cameraY = br.y+br.height*0.5-vh*0.5
      if bounds <> invalid and bounds.properties.clampZoom = true and br.width > 0 and br.height > 0 then
        minimum = m.width/br.width
        if m.height/br.height > minimum then minimum = m.height/br.height
        if m.scene.cameraZoom < minimum then m.scene.cameraZoom = minimum : vw = m.width/minimum : vh = m.height/minimum
      end if
      right = br.x+br.width-vw : bottom = br.y+br.height-vh
      if right < br.x then right = br.x
      if bottom < br.y then bottom = br.y
      if bounds = invalid or bounds.properties.clampPosition <> false then
        m.scene.cameraX = RokuCamera_Clamp(m.scene.cameraX,br.x,right)
        m.scene.cameraY = RokuCamera_Clamp(m.scene.cameraY,br.y,bottom)
      end if
    end if
  end if
  if p.screenShake <> false and runtime.shakeRemaining <> invalid and runtime.shakeRemaining > 0 then
    runtime.shakeRemaining = runtime.shakeRemaining-dt
    if runtime.shakeRemaining < 0 then runtime.shakeRemaining = 0
    intensity = runtime.shakeMagnitude*runtime.shakeRemaining/runtime.shakeDuration
    runtime.shakePhase = runtime.shakePhase+dt
    runtime.shakeX = Sin(runtime.shakePhase*127)*intensity
    runtime.shakeY = Cos(runtime.shakePhase*113)*intensity
    m.scene.cameraX = m.scene.cameraX+runtime.shakeX : m.scene.cameraY = m.scene.cameraY+runtime.shakeY
  end if
  m.scene.cameraInitialized = true
end sub

sub RokuEngine_ShakeCamera(magnitude as Float, duration as Float)
  m.UpdateActiveCameraNode()
  camera = RokuCamera_Resolve(m,m.activeCameraNodeId)
  if camera = invalid or duration <= 0 then return
  runtime = m.EnsureNodeRuntime(camera)
  runtime.shakeRemaining = duration : runtime.shakeDuration = duration
  runtime.shakeMagnitude = Abs(magnitude) : runtime.shakePhase = 0.0
end sub
