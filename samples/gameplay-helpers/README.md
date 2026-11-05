# Gameplay helpers sample

Open this folder as a project and open `Helpers.rkscene`. It contains every new helper node. Run it in the simulator or export it for Roku.

- Up/down navigate the menu. The last item wraps to the first.
- Select **Hide menu** with OK. With the menu hidden, use the D-pad to move the green Player into Checkpoint; the console reports trigger entry. Press OK to reopen the menu and restore its previous selection.
- The blue platform follows the rectangular PatrolPath. Select the path and choose **Edit Path** to move, insert, or remove waypoints.
- EnemySpawner clones a hidden orange template at SpawnPoint. The sample script removes clones after they move to the right, freeing active slots.
- Heartbeat reports a timeout every two seconds. Background scrolls and repeats its star texture.
- PatrolVisibility suspends the patrol subtree when its region is outside the camera. Move the path offscreen to try it.

Helper outlines, crosshairs, and labels appear in the editor. They are not drawn into the exported game. Trigger geometry uses the native collision system's enclosing AABB.
