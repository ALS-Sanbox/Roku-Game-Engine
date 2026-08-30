globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
(function () {
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function sanitizeSavedRuntime(runtime) {
    const clean = clone(runtime || {});
    const nodes = Array.isArray(clean.nodes) ? clean.nodes : [];
    nodes.forEach((node) => {
      if (!node || typeof node !== 'object') return;
      if (!node.properties || typeof node.properties !== 'object') return;
      if ('imageDataUrl' in node.properties) node.properties.imageDataUrl = '';
    });
    return clean;
  }

  function sanitizeSavedEditor(editor) {
    const normalizedResources = RGE_ROOT.RokuSchemaResources?.normalizeEditorResourceState
      ? RGE_ROOT.RokuSchemaResources.normalizeEditorResourceState(clone(editor || {}))
      : clone(editor || {});
    const clean = clone(normalizedResources || {});
    const sheets = Array.isArray(clean.spritesheets) ? clean.spritesheets : [];
    sheets.forEach((sheet) => {
      if (!sheet || typeof sheet !== 'object') return;
      delete sheet.dataUrl;
    });
    return clean;
  }

  function splitSceneState(sceneState, editorState) {
    const runtime = RGE_ROOT.RokuNodes.normalizeScene(clone(sceneState || {}));
    const editor = RGE_ROOT.RokuNodes.normalizeEditorState(clone(editorState || {}), runtime, sceneState || {});
    return {
      runtime: sanitizeSavedRuntime(runtime),
      editor: sanitizeSavedEditor(editor)
    };
  }

  function exportSceneAsJson(sceneState, editorState) {
    return JSON.stringify(splitSceneState(sceneState, editorState).runtime, null, 2);
  }

  function exportEditorStateAsJson(sceneState, editorState) {
    return JSON.stringify(splitSceneState(sceneState, editorState).editor, null, 2);
  }


  function buildRuntimeResourceManifest(scenes, editorStates) {
    const sceneMap = {};
    const textures = {};
    const spriteSheets = {};
    const spriteFrames = {};
    const audio = {};
    const sceneList = Array.isArray(scenes) ? scenes : [scenes];
    const editorList = Array.isArray(editorStates) ? editorStates : [editorStates];

    sceneList.forEach((sceneState, index) => {
      const runtime = RGE_ROOT.RokuNodes.normalizeScene(clone(sceneState || {}));
      const editor = RGE_ROOT.RokuNodes.normalizeEditorState(clone(editorList[index] || editorList[0] || {}), runtime, sceneState || {});
      const sceneName = runtime.scene?.name || `Scene${index + 1}`;
      sceneMap[sceneName] = { id: sceneName, name: sceneName, path: `pkg:/assets/scenes/${sceneName}.json` };

      (editor.spritesheets || []).forEach((sheet) => {
        if (!sheet || !sheet.id) return;
        const clean = sanitizeSavedEditor({ spritesheets: [sheet] }).spritesheets[0];
        spriteSheets[clean.id] = clean;
        const texturePath = clean.resourcePath || clean.filePath;
        if (texturePath) textures[clean.id] = { id: clean.id, path: texturePath, kind: 'image' };
      });

      (editor.spriteFramesLibraries || []).forEach((lib) => {
        if (lib && lib.id) spriteFrames[lib.id] = clone(lib);
      });

      (runtime.nodes || []).forEach((node) => {
        const props = node && node.properties ? node.properties : {};
        if (props.imagePath) textures[props.textureId || props.imagePath] = { id: props.textureId || props.imagePath, path: props.imagePath, kind: 'image' };
        (node.components || []).forEach((component) => {
          if (component && (component.type === 'AudioSource' || component.type === 'AudioSourceComponent') && component.resourcePath) {
            const id = component.audioId || component.id || component.resourcePath;
            audio[id] = { id, path: component.resourcePath, kind: 'audio' };
          }
        });
      });
    });

    // Also include clips registered in the Audio Panel's global clip list
    const panelClips = (RGE_ROOT.RGEAudioEngine && Array.isArray(RGE_ROOT.RGEAudioEngine.clips))
      ? RGE_ROOT.RGEAudioEngine.clips
      : (RGE_ROOT._audioPanelInstance && Array.isArray(RGE_ROOT._audioPanelInstance.engine && RGE_ROOT._audioPanelInstance.engine.clips))
        ? RGE_ROOT._audioPanelInstance.engine.clips
        : [];
    panelClips.forEach((clip) => {
      if (clip && clip.path) {
        const id = clip.id || clip.path;
        audio[id] = {
          id,
          path:    clip.path,
          kind:    'audio',
          volume:  clip.volume  ?? 1,
          pitch:   clip.pitch   ?? 1,
          loop:    clip.loop    ?? false,
          oneShot: clip.oneShot ?? false,
          busId:   clip.busId   || 'master',
        };
      }
    });

    return {
      formatVersion: 1,
      scenes: sceneMap,
      textures,
      spriteSheets,
      spriteFrames,
      audio,
      preloadGroups: {
        boot: {
          scenes: Object.keys(sceneMap),
          textures: Object.keys(textures),
          audio: Object.keys(audio)
        }
      }
    };
  }

  function exportSceneSummary(sceneState) {
    const runtime = RGE_ROOT.RokuNodes.normalizeScene(clone(sceneState || {}));
    return {
      sceneName: runtime.scene?.name || 'Untitled',
      nodeCount: Array.isArray(runtime.nodes) ? runtime.nodes.length : 0,
      nodeTypes: Array.from(new Set((runtime.nodes || []).map((node) => node.type))).sort(),
      formatVersion: runtime.formatVersion || RGE_ROOT.RokuNodes.SCENE_FORMAT_VERSION || 2
    };
  }

  // ── RGE v91: Serialize all new system state alongside scene ────────────────

  function serializeV91Systems() {
    const out = {};
    try {
      if (RGE_ROOT.RGEAssetRegistry) out.assetRegistry = RGE_ROOT.RGEAssetRegistry.serialize();
    } catch (_) {}
    try {
      if (RGE_ROOT.RGEPreloadManager) out.preloadGroups = RGE_ROOT.RGEPreloadManager.serializeGroups();
    } catch (_) {}
    try {
      if (RGE_ROOT.RGEAtlasGenerator) out.atlasGroups = RGE_ROOT.RGEAtlasGenerator.serialize();
    } catch (_) {}
    try {
      if (RGE_ROOT.RGEAnimation && RGE_ROOT.RGEAnimation.registry) {
        out.animationGraphs = RGE_ROOT.RGEAnimation.registry.serialize();
      }
    } catch (_) {}
    try {
      if (RGE_ROOT.RGEDeploymentManager) out.deployment = RGE_ROOT.RGEDeploymentManager.serialize();
    } catch (_) {}
    return out;
  }

  function deserializeV91Systems(data) {
    if (!data) return;
    try {
      if (data.assetRegistry && RGE_ROOT.RGEAssetRegistry) {
        RGE_ROOT.RGEAssetRegistry.deserialize(data.assetRegistry);
      }
    } catch (_) {}
    try {
      if (data.preloadGroups && RGE_ROOT.RGEPreloadManager) {
        RGE_ROOT.RGEPreloadManager.deserializeGroups(data.preloadGroups);
      }
    } catch (_) {}
    try {
      if (data.atlasGroups && RGE_ROOT.RGEAtlasGenerator) {
        RGE_ROOT.RGEAtlasGenerator.deserialize(data.atlasGroups);
      }
    } catch (_) {}
    try {
      if (data.animationGraphs && RGE_ROOT.RGEAnimation) {
        RGE_ROOT.RGEAnimation.registry.deserialize(data.animationGraphs);
      }
    } catch (_) {}
    try {
      if (data.deployment && RGE_ROOT.RGEDeploymentManager) {
        RGE_ROOT.RGEDeploymentManager.deserialize(data.deployment);
      }
    } catch (_) {}
  }

  RGE_ROOT.Exporter = {
    splitSceneState,
    exportSceneAsJson,
    exportEditorStateAsJson,
    buildRuntimeResourceManifest,
    exportSceneSummary,
    // v91
    serializeV91Systems,
    deserializeV91Systems,
  };
})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
