' Native counterparts to editor container-layout and action-wiring regressions.
flowRoot = GPNode("flowRoot", "CanvasLayer", "", {})
flowRow = GPNode("flowRow", "HBoxContainer", "flowRoot", {width:300,height:200,separation:10,alignment:"center"})
flowColumn = GPNode("flowColumn", "VBoxContainer", "flowRow", {width:100,height:80,separation:4,alignment:"end"})
flowButton = GPNode("flowButton", "Button", "flowColumn", {width:70,height:50,anchorLeft:0.5,anchorTop:0.5})
flowButton.transform.pivotX = 35 : flowButton.transform.pivotY = 25
flowHidden = GPNode("flowHidden", "Button", "flowRow", {width:200,height:20}) : flowHidden.visible = false
flowWorld = GPNode("flowWorld", "Node2D", "flowRow", {})
flowSecond = GPNode("flowSecond", "Button", "flowRow", {width:80,height:40})
flowNodes = [flowButton,flowColumn,flowHidden,flowWorld,flowSecond,flowRow,flowRoot]
flowEngine = {width:320,height:200,scene:{nodeMap:RokuEngine_BuildNodeMap(flowNodes),doc:{nodes:flowNodes}},IsUiNodeType:RokuEngine_IsUiNodeType,GetNodeScreenTransform:RokuEngine_GetNodeScreenTransform,QueueSceneChange:RokuEngine_QueueSceneChange,Dispatch:_FM_DispatchNamedAction}
flowRect = flowEngine.GetNodeScreenTransform("flowButton")
GPCheck(flowRect.x = 55 and flowRect.y = 150 and flowRect.width = 100 and flowRect.height = 50, "editor/runtime nested container rectangle parity")
flowEngine.Dispatch("  scene:Play  ", "flowButton")
GPCheck(flowEngine.scene.pendingSceneChange.sceneName = "Play", "scene action whitespace matches build validation")
print "PASS: scene workflow regressions"
