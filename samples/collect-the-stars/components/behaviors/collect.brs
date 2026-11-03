' Reusable collector controller. Configure speed on ScriptComponent; tag any
' collectible with metadata.collectible=true and add a native trigger collider.
sub RokuScript_components_behaviors_collect_Ready(context as Object)
  game = {score: 0, total: 0, collected: {}}
  for each node in context.scene.doc.nodes
    if node.metadata <> invalid and node.metadata.collectible = true then game.total = game.total + 1
  end for
  context.scene.runtime.collection = game
  Collector_UpdateLabels(context)
end sub

sub RokuScript_components_behaviors_collect_Update(context as Object)
  if context.engine.GetCurrentScreen() <> "Game" then return
  held = context.engine.inputState.heldActions
  speed = 240.0
  if context.component.speed <> invalid then speed = context.component.speed
  dx = 0
  dy = 0
  if held.move_left = true then dx = dx - 1
  if held.move_right = true then dx = dx + 1
  if held.move_up = true then dy = dy - 1
  if held.move_down = true then dy = dy + 1
  if dx <> 0 and dy <> 0 then speed = speed * 0.70710678
  context.node.transform.x = context.node.transform.x + dx * speed * context.dt
  context.node.transform.y = context.node.transform.y + dy * speed * context.dt
  context.engine.MarkSubtreeDirty(context.node.id)
end sub

sub RokuScript_components_behaviors_collect_Collision(context as Object)
  if context.engine.GetCurrentScreen() <> "Game" or context.extra = invalid then return
  if context.extra.phase = "CollisionExit" then return
  id = context.extra.otherNodeId
  other = context.scene.nodeMap[id]
  if other = invalid or other.metadata = invalid or other.metadata.collectible <> true then return
  game = context.scene.runtime.collection
  if game.collected.DoesExist(id) then return
  game.collected[id] = true
  game.score = game.score + 1
  other.visible = false
  context.engine.MarkSubtreeDirty(id)
  Collector_UpdateLabels(context)
  print "COLLECTION score="; game.score; " total="; game.total
  if game.score >= game.total then context.engine.TransitionToScreen("Win", {duration: 0.2})
end sub

sub Collector_UpdateLabels(context as Object)
  game = context.scene.runtime.collection
  for each node in context.scene.doc.nodes
    if node.metadata <> invalid and node.metadata.scoreLabel = true then node.properties.text = "Stars: " + game.score.ToStr() + " / " + game.total.ToStr()
  end for
  context.engine.MarkUIDirty()
end sub
