sub RokuScript_components_workflow_Update(context as Object)
  if context.scene.runtime.workflowLogged = true then return
  context.scene.runtime.workflowLogged = true
  rect = context.engine.GetNodeScreenTransform("next")
  print "SCENE_WORKFLOW_READY="; context.scene.name
  print "SCENE_WORKFLOW_BUTTON="; FormatJSON({x:rect.x,y:rect.y,width:rect.width,height:rect.height})
end sub
