# Scene to Scene — a minimal working UI flow

This project demonstrates two saved scenes with a focused button that fades between them. It uses native RGE controls and transitions, with no image dependencies. The small script only prints scene/geometry information for the automated check; it does not implement navigation.

1. Open this folder as an RGE project.
2. Open `Title.rkscene` and `Play.rkscene` so both destinations are available in the action picker.
3. Keep the toolbar's **Startup scene** set to **Title**. That setting controls where Build & Test begins, independently of the scene you are editing.
4. Select **Next** in Title. In **Action**, choose **Fade to scene: Play**. The example is already configured this way.
5. Press **F5 / Build & Test**. Activate the focused button with OK/Select in the simulator to reach Play. Activate its button to return to Title.

The button is at **X=460, Y=480, Width=360, Height=80**, with a top-left pivot. Both UI layers start at the screen origin. Change the button's position in the editor, save, and rebuild to check your own layout. For responsive layouts, use anchors or layout containers; container parents control their children's placement.

In the UI designer, Action and Back Action offer suggestions for open scenes and current UI screens. Custom actions remain editable. Build diagnostics reject missing scene/screen destinations, including actions inside MenuList items.

Run the native simulator check from the engine repository:

```powershell
npm.cmd run test:scene-workflow
```

It checks startup, default focus, fade to Play, return to Title, and the button's runtime geometry. It needs the local simulator setup and Chrome/Edge. Use `MANUAL_BROWSER` for a custom browser path and `MANUAL_BROWSER_FLAGS` for optional browser flags. Logs, screenshots, and the report go to `.visual-editor/artifacts/scene-workflow`.

The automated check verifies simulator behavior. Test the finished game on a Roku device before release, especially font rendering, remote navigation, and performance.
