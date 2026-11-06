# Native UI, graphs, streaming and device tools

## UI controls

Use the normal focus properties on Button, CircleButton, TriangleButton and OvalButton. Colors remain node-specific. HBoxContainer and VBoxContainer lay out visible UI children using their widths/heights, `separation`, and `alignment` (`begin`, `center`, `end`). Oversized children shrink proportionally to fit. MarginContainer fills its inner area using `paddingLeft`, `paddingRight`, `paddingTop`, and `paddingBottom`. ScrollContainer uses `scrollOffsetX` and `scrollOffsetY` and clips descendants to its rectangle.

A MenuList's `items` can contain strings or objects:

```json
["Continue", {"label":"Start", "action":"scene:Game"}, {"label":"Locked", "disabled":true}]
```

Up/down skips disabled entries; OK uses the item's action or falls back to the node action. Set `wrap:false` to stop at the ends. Script hooks on the MenuList receive `MenuSelectionChanged` and `MenuItemSelected` in `context.extra`.

## Animation graphs

Add `graphPath:"res://assets/hero.graph.json"` to the sprite's AnimationPlayerComponent. Keep the sprite's normal `spriteFramesId` pointing at an imported SpriteFrames library. A graph clip may override that library with its own `spriteFramesId`; frame numbers index the sprite sheet, and the clip name selects the library clip that supplies sheet metadata.

Example graph (the SpriteFrames library must include clips named Idle and Run):

```json
{
  "id":"hero", "defaultState":"idle",
  "parameters":{"Speed":{"type":"float","defaultValue":0}},
  "states":[{"id":"idle","clipId":"idleClip"},{"id":"run","clipId":"runClip"}],
  "clips":[
    {"id":"idleClip","name":"Idle","frames":[0,1],"fps":4,"loop":true},
    {"id":"runClip","name":"Run","frames":[2,3,4,5],"fps":10,"loop":true,
     "events":[{"frame":2,"name":"footstep"}]}
  ],
  "transitions":[
    {"from":"idle","to":"run","duration":0.15,"conditions":[{"param":"Speed","op":">","value":0}]},
    {"from":"run","to":"idle","duration":0.15,"conditions":[{"param":"Speed","op":"==","value":0}]}
  ]
}
```

Drive it from a node script:

```brightscript
context.engine.SetAnimationParameter(context.node.id, "Speed", 2.0)
```

`graphParameters` on the component accepts a JSON object of initial values, for example `{"Speed":0}`. Set trigger parameters to true to fire them. `playing` pauses advancement and `speedScale` changes playback speed. `AnimationEvent` exposes the authored event under `context.extra.event`; `AnimationStateChanged` includes `stateId` and `clipId`. Use hook names following the same script filename prefix as existing Ready/Update hooks. Removing graphPath restores normal clip playback.

## Streaming

The engine initializes `engine.assetStream` and processes its lazy queue during PreUpdate. A manifest `preloadGroups.boot.textures` list is queued at startup. Texture entries refer to keys in the manifest's `textures` table. Other groups can be requested by script:

```brightscript
context.engine.assetStream.PreloadGroup("level2", true)
```

`batchSize` limits assets processed per frame; `budgetKb` controls bitmap-cache eviction. These are incremental synchronous loads, so a single large decode can still take time. Scene textures, sprite libraries, tile sets and UI styles are pinned while in use. `lastWarning` explains when pinned assets prevent meeting the budget. Audio preload requests resolve metadata rather than allocating invented memory amounts.

## Device tools

Open the bottom dock's **Deploy** tab. Add a device IP or scan the LAN, select a target, and enter its developer username/password. Deploy uses the current native project snapshot, including unsaved scene edits. Debug and Dev profiles emit native runtime telemetry; Release disables that telemetry without rewriting user script print statements.

**Connect logs** opens the native console transport; **Device Logs** displays output and telemetry. **Disconnect** closes the connection and stops reconnecting. **Screenshot** uses the selected device's developer credentials. Restart returns Home and launches the installed developer channel. It does not remove the channel.

**Memory Estimates** reflects current editor assets. Live cache telemetry also contains estimates; neither view reports total device RAM. Discovery, deployment and console access require the target device and network to permit those services. Protocol references: [Roku ECP](https://developer.roku.com/dev/docs/external-control-api) and [Roku debugging](https://developer.roku.com/dev/docs/debugging).
