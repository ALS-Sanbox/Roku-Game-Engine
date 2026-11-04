# Slice sprites and UI images

Open **Tabs → Sprite Slicer**, or click **Slice sprite / UI image** in an image element's Inspector. UI Screens also has **Slice image / atlas** under Image settings.

1. **Import image**, or select an existing Sprite2D, TextureRect, Button or Panel and choose **Use selected element image**.
2. For a sheet, enter cell width/height, spacing, and X/Y offsets, then **Slice grid**. Only complete cells are included, in row order. Click a cell to select it; Ctrl/Shift-click toggles multiple cells. For irregular atlases, choose **Draw rectangle** and drag around a region. Zoom and scroll to reach small or distant regions.
3. Name the slice(s), then **Save selected regions**. A batch gets numbered names. The original image is preserved; regions reference rectangles inside it.
4. Click a saved region, select a scene element, then **Apply region to selected element**. This keeps the element's size, position, and pivot. Or choose Sprite2D, TextureRect, Button, or Panel and click **Create from region**. New elements start at the region's natural size with a top-left pivot.
5. Save the scene. Regions are stored with its editor resources and included in native builds.

For UI backgrounds, enter **UI borders** before saving. This is the number of pixels preserved on each side when resizing a button or panel; the center stretches. Zero gives a simple cropped image. Each region needs room for a center after its borders. **Edit UI borders / states** opens the existing UI Assets Atlas editor for separate left/top/right/bottom borders and other style settings.

Saved slices appear in the Sprite Slicer and UI Assets Atlas. Sprite2D uses the region as its cropped texture; TextureRect uses its existing fit mode. Panel and Button use the saved style for their background. Text, script connections and existing node transforms are preserved when applying a region.

Grid slicing creates reusable image regions. AnimatedSprite2D animation clips are still authored in the existing Sprites / Sprite Frames tools.
