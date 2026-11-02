' enemy_ai.brs — RGE EnemyAI Component
'
' Provides common enemy movement patterns selectable via the aiType field.
' All patterns run in the update phase and use ctx.transform + ctx.engine.
'
' aiType values (set in the editor dropdown):
'
'   patrol        — walks between two points (patrolWidth defines range)
'   wander        — picks a random direction, walks, pauses, repeats
'   chase         — moves toward the player node (set targetName)
'   flee          — moves away from the player node (set targetName)
'   guard         — stays near spawn point, chases if player enters radius
'   bounce        — moves at constant velocity, bounces off walls
'   circle        — orbits around its spawn point
'   stationary    — never moves (but can face player, attack, etc.)
'   sine_wave     — moves along X with a sine-wave Y offset (shmup bullet)
'   homing        — slow-turning missile that steers toward target
'   strafe        — moves perpendicular to player (sidesteps)
'   flank         — tries to get beside/behind the player

' ── Utility helpers ─────────────────────────────────────────────────────────

function RokuAI_Distance(ax as Float, ay as Float, bx as Float, by as Float) as Float
  dx = bx - ax : dy = by - ay
  return Sqr(dx * dx + dy * dy)
end function

function RokuAI_Normalize(dx as Float, dy as Float) as Object
  len = Sqr(dx * dx + dy * dy)
  if len < 0.001 then return { x: 0.0, y: 0.0 }
  return { x: dx / len, y: dy / len }
end function

function RokuAI_GetTarget(ctx as Object) as Dynamic
  targetName = "Player"
  if ctx.component.targetName <> invalid and ctx.component.targetName <> "" then targetName = ctx.component.targetName
  return ctx.engine.FindNodeByName(targetName)
end function

function RokuAI_Speed(ctx as Object, defaultSpeed as Float) as Float
  if ctx.component.speed <> invalid then return ctx.component.speed
  return defaultSpeed
end function

function RokuAI_EnsureSpawn(ctx as Object) as Object
  rt = ctx.engine.EnsureNodeRuntime(ctx.node)
  if rt.spawnX = invalid then rt.spawnX = ctx.transform.x
  if rt.spawnY = invalid then rt.spawnY = ctx.transform.y
  if rt.aiTimer = invalid then rt.aiTimer = 0.0
  if rt.aiDirX  = invalid then rt.aiDirX  = 1.0
  if rt.aiDirY  = invalid then rt.aiDirY  = 0.0
  if rt.aiState = invalid then rt.aiState = "idle"
  if rt.aiAngle = invalid then rt.aiAngle = 0.0
  return rt
end function

' ── Pattern: patrol ─────────────────────────────────────────────────────────
' Walks left and right between spawnX-patrolWidth and spawnX+patrolWidth.
sub RokuAI_Patrol(ctx as Object, rt as Object)
  speed       = RokuAI_Speed(ctx, 60.0)
  halfWidth   = 80.0
  if ctx.component.patrolWidth <> invalid then halfWidth = ctx.component.patrolWidth / 2.0

  ctx.transform.x = ctx.transform.x + (rt.aiDirX * speed * ctx.dt)

  if rt.aiDirX > 0 and ctx.transform.x >= rt.spawnX + halfWidth then
    ctx.transform.x = rt.spawnX + halfWidth
    rt.aiDirX = -1.0
  else if rt.aiDirX < 0 and ctx.transform.x <= rt.spawnX - halfWidth then
    ctx.transform.x = rt.spawnX - halfWidth
    rt.aiDirX = 1.0
  end if
  ctx.engine.MarkSubtreeDirty(ctx.node.id)
end sub

' ── Pattern: wander ──────────────────────────────────────────────────────────
' Random direction for wanderMoveTime seconds, pause for wanderWaitTime seconds.
sub RokuAI_Wander(ctx as Object, rt as Object)
  speed       = RokuAI_Speed(ctx, 45.0)
  moveTime    = 1.8
  if ctx.component.wanderMoveTime <> invalid then moveTime = ctx.component.wanderMoveTime
  waitTime    = 0.8
  if ctx.component.wanderWaitTime <> invalid then waitTime = ctx.component.wanderWaitTime

  rt.aiTimer = rt.aiTimer + ctx.dt

  if rt.aiState = "idle" then
    if rt.aiTimer >= waitTime then
      angle   = (Rnd(360) - 1) * 3.14159 / 180.0
      rt.aiDirX = Cos(angle) : rt.aiDirY = Sin(angle)
      rt.aiState = "move"    : rt.aiTimer = 0.0
    end if
  else
    ctx.transform.x = ctx.transform.x + (rt.aiDirX * speed * ctx.dt)
    ctx.transform.y = ctx.transform.y + (rt.aiDirY * speed * ctx.dt)
    ctx.engine.MarkSubtreeDirty(ctx.node.id)
    if rt.aiTimer >= moveTime then
      rt.aiState = "idle" : rt.aiTimer = 0.0
    end if
  end if
end sub

' ── Pattern: chase ───────────────────────────────────────────────────────────
' Moves directly toward the target node.
sub RokuAI_Chase(ctx as Object, rt as Object)
  target = RokuAI_GetTarget(ctx)
  if target = invalid then return
  speed  = RokuAI_Speed(ctx, 70.0)
  stopDist = 8.0
  if ctx.component.stopDistance <> invalid then stopDist = ctx.component.stopDistance
  dx = target.transform.x - ctx.transform.x
  dy = target.transform.y - ctx.transform.y
  dist = Sqr(dx * dx + dy * dy)
  if dist <= stopDist then return
  dir = RokuAI_Normalize(dx, dy)
  ctx.transform.x = ctx.transform.x + (dir.x * speed * ctx.dt)
  ctx.transform.y = ctx.transform.y + (dir.y * speed * ctx.dt)
  ctx.engine.MarkSubtreeDirty(ctx.node.id)
end sub

' ── Pattern: flee ────────────────────────────────────────────────────────────
' Moves directly away from the target node.
sub RokuAI_Flee(ctx as Object, rt as Object)
  target = RokuAI_GetTarget(ctx)
  if target = invalid then return
  speed  = RokuAI_Speed(ctx, 80.0)
  dx = ctx.transform.x - target.transform.x
  dy = ctx.transform.y - target.transform.y
  dir = RokuAI_Normalize(dx, dy)
  ctx.transform.x = ctx.transform.x + (dir.x * speed * ctx.dt)
  ctx.transform.y = ctx.transform.y + (dir.y * speed * ctx.dt)
  ctx.engine.MarkSubtreeDirty(ctx.node.id)
end sub

' ── Pattern: guard ───────────────────────────────────────────────────────────
' Idles at spawn. If player enters alertRadius, switches to chase.
' Returns to patrol once player leaves leashRadius.
sub RokuAI_Guard(ctx as Object, rt as Object)
  target     = RokuAI_GetTarget(ctx)
  alertRadius = 120.0
  if ctx.component.alertRadius  <> invalid then alertRadius  = ctx.component.alertRadius
  leashRadius = 200.0
  if ctx.component.leashRadius  <> invalid then leashRadius  = ctx.component.leashRadius
  speed       = RokuAI_Speed(ctx, 70.0)
  returnSpeed = 40.0
  if ctx.component.returnSpeed  <> invalid then returnSpeed  = ctx.component.returnSpeed

  if target <> invalid then
    distToTarget = RokuAI_Distance(ctx.transform.x, ctx.transform.y, target.transform.x, target.transform.y)
    distToSpawn  = RokuAI_Distance(ctx.transform.x, ctx.transform.y, rt.spawnX, rt.spawnY)

    if rt.aiState = "guard" then
      if distToTarget <= alertRadius then rt.aiState = "chase"
    else if rt.aiState = "chase" then
      if distToSpawn > leashRadius then
        rt.aiState = "return"
      else
        dx = target.transform.x - ctx.transform.x : dy = target.transform.y - ctx.transform.y
        dir = RokuAI_Normalize(dx, dy)
        ctx.transform.x = ctx.transform.x + (dir.x * speed  * ctx.dt)
        ctx.transform.y = ctx.transform.y + (dir.y * speed  * ctx.dt)
        ctx.engine.MarkSubtreeDirty(ctx.node.id)
        return
      end if
    end if
  end if

  if rt.aiState = "return" then
    dx = rt.spawnX - ctx.transform.x : dy = rt.spawnY - ctx.transform.y
    dist = Sqr(dx * dx + dy * dy)
    if dist < 4.0 then
      ctx.transform.x = rt.spawnX : ctx.transform.y = rt.spawnY
      rt.aiState = "guard"
    else
      dir = RokuAI_Normalize(dx, dy)
      ctx.transform.x = ctx.transform.x + (dir.x * returnSpeed * ctx.dt)
      ctx.transform.y = ctx.transform.y + (dir.y * returnSpeed * ctx.dt)
      ctx.engine.MarkSubtreeDirty(ctx.node.id)
    end if
  else
    if rt.aiState = invalid or rt.aiState = "idle" then rt.aiState = "guard"
  end if
end sub

' ── Pattern: bounce ──────────────────────────────────────────────────────────
' Moves at constant velocity, flips direction when hitting scene bounds.
sub RokuAI_Bounce(ctx as Object, rt as Object)
  speed  = RokuAI_Speed(ctx, 80.0)
  boundsW = 1920.0
  if ctx.component.boundsWidth  <> invalid then boundsW = ctx.component.boundsWidth
  boundsH = 1080.0
  if ctx.component.boundsHeight <> invalid then boundsH = ctx.component.boundsHeight
  nodeW   = 32.0
  if ctx.node.properties <> invalid and ctx.node.properties.width  <> invalid then nodeW = ctx.node.properties.width
  nodeH   = 32.0
  if ctx.node.properties <> invalid and ctx.node.properties.height <> invalid then nodeH = ctx.node.properties.height

  if rt.aiDirX = 0.0 and rt.aiDirY = 0.0 then
    rt.aiDirX = 1.0 : rt.aiDirY = 0.7
    dir = RokuAI_Normalize(rt.aiDirX, rt.aiDirY)
    rt.aiDirX = dir.x : rt.aiDirY = dir.y
  end if

  ctx.transform.x = ctx.transform.x + (rt.aiDirX * speed * ctx.dt)
  ctx.transform.y = ctx.transform.y + (rt.aiDirY * speed * ctx.dt)

  if ctx.transform.x < 0.0 then ctx.transform.x = 0.0 : rt.aiDirX = Abs(rt.aiDirX)
  if ctx.transform.y < 0.0 then ctx.transform.y = 0.0 : rt.aiDirY = Abs(rt.aiDirY)
  if ctx.transform.x + nodeW > boundsW then ctx.transform.x = boundsW - nodeW : rt.aiDirX = -Abs(rt.aiDirX)
  if ctx.transform.y + nodeH > boundsH then ctx.transform.y = boundsH - nodeH : rt.aiDirY = -Abs(rt.aiDirY)

  ctx.engine.MarkSubtreeDirty(ctx.node.id)
end sub

' ── Pattern: circle ──────────────────────────────────────────────────────────
' Orbits around spawn point at orbitRadius.
sub RokuAI_Circle(ctx as Object, rt as Object)
  speed  = RokuAI_Speed(ctx, 90.0)
  radius = 80.0
  if ctx.component.orbitRadius <> invalid then radius = ctx.component.orbitRadius

  rt.aiAngle = rt.aiAngle + (speed / radius) * ctx.dt
  ctx.transform.x = rt.spawnX + Cos(rt.aiAngle) * radius
  ctx.transform.y = rt.spawnY + Sin(rt.aiAngle) * radius
  ctx.engine.MarkSubtreeDirty(ctx.node.id)
end sub

' ── Pattern: sine_wave ───────────────────────────────────────────────────────
' Moves along moveAxisX/Y with a perpendicular sine wave offset. Good for
' shmup bullets, jellyfish, swimming fish.
sub RokuAI_SineWave(ctx as Object, rt as Object)
  speed     = RokuAI_Speed(ctx, 100.0)
  amplitude = 40.0
  if ctx.component.sineAmplitude <> invalid then amplitude = ctx.component.sineAmplitude
  frequency = 2.0
  if ctx.component.sineFrequency <> invalid then frequency = ctx.component.sineFrequency
  axisX     = 0.0
  if ctx.component.moveAxisX     <> invalid then axisX     = ctx.component.moveAxisX
  axisY     = -1.0
  if ctx.component.moveAxisY     <> invalid then axisY     = ctx.component.moveAxisY

  rt.aiTimer = rt.aiTimer + ctx.dt
  dir = RokuAI_Normalize(axisX, axisY)

  sineOffset  = Sin(rt.aiTimer * frequency * 3.14159 * 2.0) * amplitude
  perpX       = -dir.y : perpY = dir.x

  ctx.transform.x = ctx.transform.x + (dir.x * speed * ctx.dt) + (perpX * sineOffset * ctx.dt)
  ctx.transform.y = ctx.transform.y + (dir.y * speed * ctx.dt) + (perpY * sineOffset * ctx.dt)
  ctx.engine.MarkSubtreeDirty(ctx.node.id)
end sub

' ── Pattern: homing ──────────────────────────────────────────────────────────
' Slow-turning missile. Steers toward target with limited turn rate.
sub RokuAI_Homing(ctx as Object, rt as Object)
  target    = RokuAI_GetTarget(ctx)
  if target = invalid then return
  speed     = RokuAI_Speed(ctx, 120.0)
  turnSpeed = 2.5
  if ctx.component.turnSpeed <> invalid then turnSpeed = ctx.component.turnSpeed

  if rt.aiDirX = 0.0 and rt.aiDirY = 0.0 then rt.aiDirY = -1.0

  dx = target.transform.x - ctx.transform.x
  dy = target.transform.y - ctx.transform.y
  desired = RokuAI_Normalize(dx, dy)

  ' Smoothly steer current direction toward desired
  rt.aiDirX = rt.aiDirX + (desired.x - rt.aiDirX) * turnSpeed * ctx.dt
  rt.aiDirY = rt.aiDirY + (desired.y - rt.aiDirY) * turnSpeed * ctx.dt
  dir = RokuAI_Normalize(rt.aiDirX, rt.aiDirY)
  rt.aiDirX = dir.x : rt.aiDirY = dir.y

  ctx.transform.x = ctx.transform.x + (rt.aiDirX * speed * ctx.dt)
  ctx.transform.y = ctx.transform.y + (rt.aiDirY * speed * ctx.dt)
  ctx.engine.MarkSubtreeDirty(ctx.node.id)
end sub

' ── Pattern: strafe ──────────────────────────────────────────────────────────
' Circles the target by always moving perpendicular to the target vector.
sub RokuAI_Strafe(ctx as Object, rt as Object)
  target = RokuAI_GetTarget(ctx)
  if target = invalid then return
  speed  = RokuAI_Speed(ctx, 80.0)
  dx = target.transform.x - ctx.transform.x
  dy = target.transform.y - ctx.transform.y
  dir = RokuAI_Normalize(dx, dy)
  ' Perpendicular = rotate 90 degrees
  ctx.transform.x = ctx.transform.x + (-dir.y * speed * ctx.dt)
  ctx.transform.y = ctx.transform.y + ( dir.x * speed * ctx.dt)
  ctx.engine.MarkSubtreeDirty(ctx.node.id)
end sub

' ── Pattern: flank ───────────────────────────────────────────────────────────
' Tries to reach a point 90 degrees to the side of the target.
' Alternates flanking side when close enough.
sub RokuAI_Flank(ctx as Object, rt as Object)
  target = RokuAI_GetTarget(ctx)
  if target = invalid then return
  speed     = RokuAI_Speed(ctx, 75.0)
  flankDist = 80.0
  if ctx.component.flankDistance <> invalid then flankDist = ctx.component.flankDistance

  dx = target.transform.x - ctx.transform.x
  dy = target.transform.y - ctx.transform.y
  dir = RokuAI_Normalize(dx, dy)
  side = 1.0
  if rt.aiState = "flank_left" then side = -1.0

  goalX = target.transform.x + (-dir.y * flankDist * side)
  goalY = target.transform.y + ( dir.x * flankDist * side)

  gdx = goalX - ctx.transform.x : gdy = goalY - ctx.transform.y
  dist = Sqr(gdx * gdx + gdy * gdy)
  if dist < 12.0 then
    if rt.aiState = "flank_right" then rt.aiState = "flank_left" else rt.aiState = "flank_right"
  else
    gdir = RokuAI_Normalize(gdx, gdy)
    ctx.transform.x = ctx.transform.x + (gdir.x * speed * ctx.dt)
    ctx.transform.y = ctx.transform.y + (gdir.y * speed * ctx.dt)
    ctx.engine.MarkSubtreeDirty(ctx.node.id)
  end if
end sub

' ── Main EnemyAI update handler ─────────────────────────────────────────────

sub RokuComponent_EnemyAI_Update(ctx as Object)
  if ctx.component = invalid then return
  rt = RokuAI_EnsureSpawn(ctx)

  aiType = "patrol"
  if ctx.component.aiType <> invalid and ctx.component.aiType <> "" then
    aiType = LCase(RokuEngine_Trim(RokuEngine_ToString(ctx.component.aiType)))
  end if

  if aiType = "patrol"      then
    RokuAI_Patrol(ctx,    rt)
  else if aiType = "wander"      then
    RokuAI_Wander(ctx,    rt)
  else if aiType = "chase"       then
    RokuAI_Chase(ctx,     rt)
  else if aiType = "flee"        then
    RokuAI_Flee(ctx,      rt)
  else if aiType = "guard"       then
    RokuAI_Guard(ctx,     rt)
  else if aiType = "bounce"      then
    RokuAI_Bounce(ctx,    rt)
  else if aiType = "circle"      then
    RokuAI_Circle(ctx,    rt)
  else if aiType = "sine_wave"   then
    RokuAI_SineWave(ctx,  rt)
  else if aiType = "homing"      then
    RokuAI_Homing(ctx,    rt)
  else if aiType = "strafe"      then
    RokuAI_Strafe(ctx,    rt)
  else if aiType = "flank"       then
    RokuAI_Flank(ctx,     rt)
  ' stationary: no movement
  end if
end sub
