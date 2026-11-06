' Regression checks for failures uncovered by the system audit.
sub AuditPhase(node as Object, component as Object, phase as String, dt as Float, event as Dynamic)
  m.auditPhaseCalls = m.auditPhaseCalls+1
end sub

sub AuditInvoke(node as Object, component as Object, eventName as String, dt as Dynamic, extra as Dynamic)
  m.auditHookCalls = m.auditHookCalls+1
end sub

sub AuditNoop()
end sub

function AuditGetScene(sceneName as String) as Object
  return m.cachedScene
end function

engine.PoolRelease("pooled")
pooled.components = [{ type: "MoveComponent" }, { type: "Collider2DComponent", width: 32, height: 32 }, { type: "ScriptComponent", scriptPath: "res://dummy.brs" }]
poolChild = GPNode("poolChild", "Timer", "pooled", { waitTime: 1 })
engine.scene.doc.nodes.Push(poolChild) : engine.RefreshSceneCaches()
GPCheck(RokuGameplay_IsSleeping(engine, pooled), "inactive pool object suspends")
GPCheck(RokuGameplay_IsSleeping(engine, poolChild), "inactive pool descendants suspend")
GPCheck(collision.GetNodeCollider(pooled) = invalid, "inactive pool collider excluded")
engine.auditPhaseCalls = 0 : engine.auditHookCalls = 0
engine.ProcessComponentPhaseEntry = AuditPhase
engine.DispatchComponentPhaseEntry = RokuEngine_DispatchComponentPhaseEntry
engine.InvokeScriptComponent = AuditInvoke
engine.RunScriptHooks = RokuEngine_RunScriptHooks
engine.DispatchComponentPhaseEntry({ nodeId: "pooled", componentIndex: 0, phase: "update" }, 1, invalid)
engine.RunScriptHooks(0, { name: "Action" })
GPCheck(engine.auditPhaseCalls = 0 and engine.auditHookCalls = 0, "inactive pooled nodes receive no phase or broadcast updates")
engine.RunScriptHooks(0, { name: "SceneExit" })
GPCheck(engine.auditHookCalls = 1, "scene exit cleanup still reaches pooled scripts")
engine.PoolAcquire("TestPool", 0, 0)
engine.DispatchComponentPhaseEntry({ nodeId: "pooled", componentIndex: 0, phase: "update" }, 1, invalid)
GPCheck(engine.auditPhaseCalls = 1, "reacquired pooled node resumes")

cachedRoot = GPNode("reloadRoot", "SceneRoot", "", {})
cachedActor = GPNode("reloadActor", "Node2D", "reloadRoot", { score: 0 })
cachedDoc = { scene: { rootNodeId: "reloadRoot" }, nodes: [cachedRoot, cachedActor] }
engine.resources = { cachedScene: cachedDoc, GetScene: AuditGetScene }
engine.RemoveAllCompositorSprites = AuditNoop
engine.InitializeUiRuntime = AuditNoop
engine.UpdateActiveCameraNode = AuditNoop
engine.ShowStartupScreen = AuditNoop
engine.CreateEmptyPhaseLists = RokuEngine_CreateEmptyPhaseLists
engine.LoadScene = RokuEngine_LoadScene
engine.LoadScene("ReloadTest")
engine.scene.nodeMap.reloadActor.transform.x = 250
engine.scene.nodeMap.reloadActor.properties.score = 99
engine.scene.doc.nodes.Push(GPNode("runtimeClone", "Node2D", "reloadRoot", {}))
engine.focus.defaultFocusSet = true : engine.focus.focusedNodeId = "oldFocus"
engine.screenMgr = { screenStack: [{ name: "OldScreen" }] }
engine.LoadScene("ReloadTest")
GPCheck(engine.scene.doc.nodes.Count() = 2, "scene reload discards runtime clones")
GPCheck(engine.scene.nodeMap.reloadActor.transform.x = 0 and engine.scene.nodeMap.reloadActor.properties.score = 0, "scene reload restores authored transforms and properties")
GPCheck(cachedDoc.nodes.Count() = 2 and cachedDoc.nodes[1].properties.score = 0, "cached scene asset remains immutable")
GPCheck(engine.focus.focusedNodeId = "" and engine.focus.defaultFocusSet = false, "scene reload resets focus selection")
GPCheck(engine.screenMgr = invalid, "scene reload discards old screen stack before startup initialization")
print "PASS: runtime audit regressions"
