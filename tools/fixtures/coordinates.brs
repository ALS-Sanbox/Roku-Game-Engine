' Executed by the real native runtime, only in the coordinate regression fixture.
sub RokuScript_components_coordinates_Ready(context as Object)
  e = context.engine
  camera = e.FindNodeByName("camera")
  p = camera.properties
  p.followTargetName = "sprite"
  p.cameraBounds = false
  p.followLerp = 0.2
  e.scene.cameraInitialized = true
  e.scene.cameraX = 0 : e.scene.cameraY = 0
  e.ApplyCameraFollow(1.0 / 60)
  e.ApplyCameraFollow(1.0 / 60)
  twoSteps = e.scene.cameraX
  e.scene.cameraX = 0 : e.scene.cameraY = 0
  e.ApplyCameraFollow(2.0 / 60)
  if Abs(e.scene.cameraX - twoSteps) > 0.001 then
    print "COORDINATE_FAILURE smoothing"
    return
  end if
  p.followTargetName = ""
  p.followLerp = 1
  p.cameraBounds = true
  camera.transform.x = 5000 : camera.transform.y = 5000
  e.ApplyCameraFollow(1.0 / 60)
  if Abs(e.scene.cameraX - 320) > 0.001 or Abs(e.scene.cameraY - 180) > 0.001 then
    print "COORDINATE_FAILURE bounds"
    return
  end if
  camera.transform.x = 640 : camera.transform.y = 360
  e.ApplyCameraFollow(1.0 / 60)
  collider = e.GetNodeCollider(e.FindNodeByName("sprite"))
  if collider.x <> 580 or collider.y <> 330 or collider.width <> 80 then
    print "COORDINATE_FAILURE collider/pivot"
    return
  end if
  print "COORDINATE_MODEL passed smoothing bounds collider"
end sub
