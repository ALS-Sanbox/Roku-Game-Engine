globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;

self.onmessage = async (event) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'streamTexture':
      postMessage({
        type: 'complete',
        payload
      });
      break;
  }
};


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
