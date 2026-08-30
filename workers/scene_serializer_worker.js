globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;

self.onmessage = (e) => {
  const { type, payload } = e.data;

  if (type === 'serialize') {
    postMessage({
      type: 'serialized',
      payload: JSON.stringify(payload)
    });
  }
};


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
