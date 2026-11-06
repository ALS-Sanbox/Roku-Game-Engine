' Native UI, streaming and graph regressions; no physical device is needed.
sub GapDrawLine(x1 as Integer, y1 as Integer, x2 as Integer, y2 as Integer, color as Integer)
  m.lines.Push([x1,y1,x2,y2,color])
end sub
sub GapDrawRect(x as Integer, y as Integer, w as Integer, h as Integer, color as Integer)
  m.rectangles.Push([x,y,w,h,color])
end sub
function GapWidth() as Integer
  return 32
end function
function GapHeight() as Integer
  return 32
end function
function GapBitmap(path as String) as Dynamic
  key = m.ResolveBitmapPath(path)
  if m.fakeBitmaps.DoesExist(key) <> true then return invalid
  m.bitmapCache[key] = m.fakeBitmaps[key]
  return m.fakeBitmaps[key]
end function
function GapJson(path as String) as Dynamic
  return m.graphDocument
end function

uiRoot = GPNode("uiRoot", "SceneRoot", "", {})
canvas = GPNode("canvas", "CanvasLayer", "uiRoot", {})
uiBox = GPNode("uiBox", "HBoxContainer", "canvas", { width: 300, height: 60, separation: 10, alignment: "center" }) : uiBox.transform.x = 100
buttonA = GPNode("buttonA", "CircleButton", "uiBox", { width: 80, height: 40 })
buttonB = GPNode("buttonB", "TriangleButton", "uiBox", { width: 80, height: 40 })
marginBox = GPNode("marginBox", "MarginContainer", "canvas", { width: 200, height: 100, paddingLeft: 10, paddingRight: 30, paddingTop: 20, paddingBottom: 40 })
marginChild = GPNode("marginChild", "OvalButton", "marginBox", { width: 80, height: 30 })
scroll = GPNode("scroll", "ScrollContainer", "canvas", { width: 100, height: 50, scrollOffsetX: 30, scrollOffsetY: 12 }) : scroll.transform.x = 100
scrollChild = GPNode("scrollChild", "Panel", "scroll", { width: 500, height: 200 }) : scrollChild.transform.x = -30
menu = GPNode("menu", "MenuList", "canvas", { width: 200, height: 80, selectedIndex: 0, items: ["First", {label:"Disabled",disabled:true}, {label:"Third",action:"custom:third"}] })
engine.scene.doc.nodes = [uiRoot,canvas,uiBox,buttonA,buttonB,marginBox,marginChild,scroll,scrollChild,menu]
engine.scene.rootNodeId = "uiRoot" : engine.scene.cameraX = 999 : engine.RefreshSceneCaches()
engine.MarkUIDirty = AuditNoop
GPCheck(engine.IsUiNodeType("CircleButton") and engine.IsUiNodeType("ScrollContainer"), "UI type classification includes shapes and containers")
GPCheck(engine.IsNodeFocusable(buttonA) and engine.IsNodeFocusable(buttonB), "shape buttons participate in focus")
rectA = engine.GetNodeScreenTransform("buttonA") : rectB = engine.GetNodeScreenTransform("buttonB")
GPCheck(rectA.x = 165 and rectB.x = 255 and rectB.height = 60, "HBox centered child layout ignores world camera")
uiBox.type = "VBoxContainer" : uiBox.properties.width = 60 : uiBox.properties.height = 200
rectB = engine.GetNodeScreenTransform("buttonB")
GPCheck(rectB.width = 60 and rectB.y = 105, "VBox centered layout")
rect = engine.GetNodeScreenTransform("marginChild")
GPCheck(rect.x = 10 and rect.y = 20 and rect.width = 160 and rect.height = 40, "MarginContainer fills padded inner area")
rect = engine.GetNodeScreenTransform("scrollChild") : clip = RokuUi_AncestorClip(engine, scrollChild)
GPCheck(rect.x = 70 and rect.y = -12 and clip.x = 100 and clip.w = 100, "scroll offsets are applied once and children clipped")
screen = { lines: [], rectangles: [], DrawLine: GapDrawLine, DrawRect: GapDrawRect }
RokuUi_DrawButtonShape(screen, "TriangleButton", 0, 0, 20, 10, &hFFFFFFFF, &hFFFFFFFF)
GPCheck(screen.lines.Count() = 31 and screen.lines[0][0] = screen.lines[0][2], "triangle button has tapered scanlines and bottom edge")
screen.lines.Clear()
RokuUi_DrawButtonShape(screen, "OvalButton", 0, 0, 20, 10, &hFFFFFFFF, &hFFFFFFFF)
GPCheck(screen.lines.Count() = 30 and screen.lines[0][2]-screen.lines[0][0] < screen.lines[12][2]-screen.lines[12][0], "oval button has curved scanlines")
engine.InitializeFocusManager() : engine.focus.actionQueue = []
handled = RokuUi_MenuInput(engine, menu, "move_down")
GPCheck(handled and menu.properties.selectedIndex = 2, "MenuList skips disabled items")
handled = RokuUi_MenuInput(engine, menu, "action")
GPCheck(handled and engine.focus.actionQueue[0].action = "custom:third", "MenuList accepts item-specific action")
handled = RokuUi_MenuInput(engine, menu, "move_down")
GPCheck(menu.properties.selectedIndex = 0, "MenuList wraps")

rm = RokuEngine_CreateResourceManager(engine)
rm.manifest = { textures: { a: {path:"res://a.png"}, b:{path:"res://b.png"} }, preloadGroups: { boot: { textures: ["a","b"] } } }
rm.textureManifest = rm.manifest.textures : rm.preloadGroups = rm.manifest.preloadGroups
rm.nineSliceStyleManifest = {}
bitmap = { GetWidth: GapWidth, GetHeight: GapHeight }
rm.fakeBitmaps = { "pkg:/a.png": bitmap, "pkg:/b.png": bitmap, "pkg:/c.png": bitmap }
rm.GetBitmap = GapBitmap : engine.resources = rm : engine.scene.doc.nodes = []
stream = { engine: engine, loadedGuids:{}, accessTimes:{}, sizesKb:{}, paths:{}, totalKb:0.0, accessCounter:0, budgetKb:8, batchSize:1, lazyQueue:[], TrackBitmap:RokuStream_TrackBitmap, MarkAccess:RokuStream_MarkAccess, IsLoaded:RokuStream_IsLoaded, IsPinned:RokuStream_IsPinned, LoadAsset:RokuStream_LoadAsset, EvictLRU:RokuStream_EvictLRU, PreloadGroup:RokuStream_PreloadGroup, EnqueueLazy:RokuStream_EnqueueLazy, ProcessQueue:RokuStream_ProcessQueue }
loaded = stream.LoadAsset("missing", "res://missing.png", "texture")
GPCheck(not loaded and not stream.IsLoaded("missing") and stream.totalKb = 0, "missing textures are not marked loaded")
stream.PreloadGroup("boot", true) : stream.ProcessQueue()
GPCheck(stream.lazyQueue.Count() = 1 and stream.IsLoaded("a"), "preload queue honors per-frame batch")
stream.ProcessQueue()
loaded = stream.LoadAsset("c", "res://c.png", "texture")
stream.MarkAccess("pkg:/a.png") : rm.regionCache.old = "reference" : rm.transformedTileCache.old = "reference"
stream.EvictLRU()
GPCheck(stream.IsLoaded("a") and not stream.IsLoaded("b") and stream.IsLoaded("c"), "LRU evicts least recently accessed bitmap")
GPCheck(not rm.bitmapCache.DoesExist("pkg:/b.png") and rm.regionCache.Count() = 0 and rm.transformedTileCache.Count() = 0, "LRU releases bitmap and derived cache references")
engine.scene.doc.nodes = [GPNode("pin", "Sprite2D", "", { imagePath:"res://a.png" })]
stream.budgetKb = 0 : stream.EvictLRU()
GPCheck(stream.IsLoaded("a") and stream.totalKb = 4 and stream.lastWarning <> "", "active scene texture is pinned even over budget")

graphNode = GPNode("graphSprite", "AnimatedSprite2D", "", { playing:true, spriteFramesId:"library", animation:"Idle" })
component = { type:"AnimationPlayerComponent", graphPath:"res://hero.graph.json", graphParameters:"{}", playing:true }
graphNode.components = [component]
engine.scene.doc.nodes = [graphNode] : engine.RefreshSceneCaches()
rm.GetJsonDocument = GapJson
rm.graphDocument = { id:"hero", defaultState:"idle", parameters:{Speed:{type:"float",defaultValue:0}}, states:[{id:"idle",clipId:"idleClip"},{id:"run",clipId:"runClip"}], clips:[{id:"idleClip",name:"Idle",frames:[0,1,2],fps:10,events:[{frame:0,name:"idleStart"},{frame:1,name:"idleStep"}]},{id:"runClip",name:"Run",frames:[3,4,5,6],fps:10,events:[{frame:0,name:"runStart"},{frame:2,name:"runStep"}]}], transitions:[{from:"idle",to:"run",duration:0.5,conditions:[{param:"Speed",op:">",value:1}]}] }
engine.SetAnimationParameter = RokuEngine_SetAnimationParameter
rt = engine.EnsureNodeRuntime(graphNode)
ctx = { engine:engine, node:graphNode, component:component, props:graphNode.properties, runtime:rt, dt:0.15 }
beforeEvents = engine.events.Count()
updated = RokuAnim_UpdateNode(ctx)
GPCheck(updated and rt.currentAnimationFrameIndex = 1 and engine.events.Count() = beforeEvents+2, "graph component emits crossed frame events and updates ordinal frame")
rt.spriteState = { drawable:"previous frame" }
engine.SetAnimationParameter("graphSprite", "Speed", 2)
ctx.dt = 0.1 : updated = RokuAnim_UpdateNode(ctx)
GPCheck(rt.graphController.currentStateId = "run" and rt.graphPreviousDrawable <> invalid and rt.graphBlendWeight = 0, "graph parameter drives transition with retained prior frame")
ctx.dt = 0.25 : updated = RokuAnim_UpdateNode(ctx)
GPCheck(Abs(rt.graphBlendWeight-0.5) < 0.001 and rt.currentAnimationFrameIndex = 2, "graph transition duration drives fade progress")
updated = RokuAnim_UpdateNode(ctx)
GPCheck(rt.graphPreviousDrawable = invalid and rt.graphBlendWeight = 1, "graph fade releases prior frame on completion")
component.graphPath = ""
updated = RokuAnim_UpdateNode(ctx)
GPCheck(not updated and rt.graphController = invalid and rt.animationFramesCacheKey = "", "removing graph restores ordinary sprite animation")
print "PASS: remaining gaps repaired"
