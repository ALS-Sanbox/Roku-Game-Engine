sub RokuScript_components_events_MenuSelectionChanged(context as Object)
  print "Menu selection changed: "; context.node.name
end sub

sub RokuScript_components_events_MenuItemSelected(context as Object)
  print "Menu item selected: "; context.node.name
end sub

sub RokuScript_components_events_AnimationEvent(context as Object)
  print "Animation event: "; context.extra.event.name
end sub

sub RokuScript_components_events_AnimationStateChanged(context as Object)
  print "Animation state: "; context.extra.stateId
end sub

sub RokuScript_components_events_Timeout(context as Object)
  print "Timer timeout: "; context.node.name
end sub

sub RokuScript_components_events_CollisionEnter(context as Object)
  print "Trigger entered: "; context.node.name; " by "; context.extra.otherNodeId
end sub

sub RokuScript_components_events_PathFinished(context as Object)
  print "Path finished: "; context.node.name
end sub

sub RokuScript_components_events_ScreenEntered(context as Object)
  print "Region entered screen: "; context.node.name
end sub

sub RokuScript_components_events_ScreenExited(context as Object)
  print "Region left screen: "; context.node.name
end sub

sub RokuScript_components_events_Spawned(context as Object)
  print "Spawned: "; context.extra.spawnedNodeId
end sub

sub RokuScript_components_events_Update(context as Object)
  if context.node.name <> "SpawnTemplate" or context.node.visible = false then return
  if context.node.transform.x > 700 then context.engine.DestroyNode(context.node.id)
end sub

sub RokuScript_components_events_Action(context as Object)
  if context.node.name = "HideMenu" and context.extra.action = "hide_menu" then
    menu = context.engine.scene.nodeMap.Menu
    menu.visible = false
    context.engine.focus.dirty = true
  end if
end sub

sub RokuScript_components_events_Input(context as Object)
  if context.node.name <> "Player" then return
  if context.extra.action = "action" and context.extra.isPress = true then
    menu = context.engine.scene.nodeMap.Menu
    menu.visible = true
    context.engine.focus.dirty = true
  end if
end sub
