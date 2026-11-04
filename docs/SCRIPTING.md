# Scripts and scene elements

Open **Tabs → Scripts**. This editor is for project BrightScript (`.brs`) files in `components/` and `source/`. Generated `source/main.brs` and `source/engine/` files are excluded. You can also double-click a script in FileSystem or click **Edit script** on a Script component.

Use **New** to create `components/menu.brs`, then select the node that should own it in the Scene tree and click **Attach to selected node**. This adds a ScriptComponent with the script's resource path. Save the scene to persist the attachment. Saving the script saves its source separately. Build & Test and Export save edited scripts before building; external file changes block saving until you resolve them with Reload (copy your edits first).

The editor provides line numbers, horizontal and vertical scrolling, native text undo/redo, two-space Tab indentation, Ctrl+F / Find next, and Ctrl+S. Changes remain in memory when switching scripts. Closing with unsaved scripts prompts you. This is a text editor; compiler diagnostics appear when building.

## Hook names

The editor colors BrightScript keywords, strings, comments, numbers and types while preserving normal text editing. **Script connections** follows the selected scene element. Attached entries are executable ScriptComponents; related entries are editor metadata describing controller or shared-module relationships. Click a link to open its source; links with a function name jump to that function. The current script's owner buttons select its attached nodes.

MOL keeps `components/mol_controller.brs` attached once to the scene root. Its other elements show controller/function links and relevant shared modules, rather than running duplicate controllers. MOL's menu uses its own input state machine, so its existing buttons retain that behavior. These links describe the imported architecture and do not replace its actions.

Hook names include the script's project-relative path. For `components/menu.brs`, the prefix is `RokuScript_components_menu`. New generates the correct prefix automatically. If you rename or move a script, update its hook prefixes and ScriptComponent paths too.

```brightscript
sub RokuScript_components_menu_Ready(context as Object)
  ' Runs once when this owner becomes ready.
end sub

sub RokuScript_components_menu_Update(context as Object)
  ' Runs each frame; dt is in seconds.
end sub
```

Other hooks: Init (legacy Ready alias), SceneEnter, SceneExit, PreUpdate, PhysicsUpdate, LateUpdate, PostUpdate, Input, Action, Collision, CollisionEnter, CollisionStay, CollisionExit. Do not duplicate Ready initialization in Init.

`context.node` is the owner, `context.component` is its ScriptComponent, `context.scene` is the active scene, and `context.engine` exposes engine methods. Each attached owner receives its own context. Scripts are native BrightScript, not JavaScript or DOM scripts.

## Reference UI and game elements

Choose an element in the Scripts reference dropdown and click **Insert reference** inside a hook. This inserts a lookup by the element's stable ID. Names may change; avoid changing an ID used by scripts. Lookups only find nodes in the active scene, so check for `invalid`.

For example, if a Label has the ID `ScoreLabel`:

```brightscript
sub RokuScript_components_menu_Ready(context as Object)
  label = context.scene.nodeMap["ScoreLabel"]
  if label <> invalid then label.properties.text = "Score: 0"
end sub
```

Use the actual ID inserted by the editor. `context.engine.FindNodeByName("ScoreLabel")` is another option, but duplicate names are ambiguous. UI controls use `properties.text`, `properties.width`, `properties.height` and `visible`; world nodes use `transform.x` and `transform.y`. These are runtime changes, not changes to the saved scene.

```brightscript
sub RokuScript_components_menu_Update(context as Object)
  player = context.scene.nodeMap["Player"]
  if player <> invalid then player.transform.x = player.transform.x + 60 * context.dt
end sub
```

## Connect a UI button

Open a script, select a **Button** in the Scene tree, then click **Connect selected button** in Scripts. This attaches the script to the button, sets its action to `custom:ScriptAction`, and inserts an Action hook. It replaces the button's previous action. Save the script and scene, then Build & Test. Activate the focused button with the remote's OK action.

For `components/menu.brs`, the generated handler is:

```brightscript
sub RokuScript_components_menu_Action(context as Object)
  if context.extra.nodeId <> context.node.id then return
  context.node.properties.text = "Clicked!"
end sub
```

Custom button actions broadcast to enabled ScriptComponents in the active scene. `context.extra.nodeId` identifies the button, `context.extra.name` is the event name (`ScriptAction` here), and `context.extra.action` is the full `custom:ScriptAction` string. Keep the owner-ID guard when attaching a shared script to several buttons. For a controller script attached elsewhere, compare `context.extra.nodeId` to the desired button ID instead, and optionally check `context.extra.name`.

Built-in actions such as `scene:Game` retain their existing behavior; use a custom action when you want script logic. To change scenes inside an Action hook, call `context.engine.QueueSceneChange("Game")` with a scene name in your project.
