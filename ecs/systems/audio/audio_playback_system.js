globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
export class AudioPlaybackSystem {
  constructor(audioEngine) {
    this.audio = audioEngine;
    this.order = 120;
  }

  update(world, dt) {
    const entities = world.query?.(['AudioSourceComponent']) || world.query?.(['AudioSource']) || [];
    for (const entity of entities) {
      const source = entity.AudioSourceComponent || entity.AudioSource;
      if (!source) continue;

      // Resolve the clip from the global clip registry (Audio tab is the single source of truth)
      const clipPath = source.resourcePath || source.clip || '';
      if (!clipPath) continue;

      // Look up playback settings from the global clip registry
      const clipData = window._rgeAudioClips
        ? Object.values(window._rgeAudioClips).find(c => c.path === clipPath)
        : null;

      // Only auto-play on first frame if the clip is marked playOnAwake in the Audio tab
      const shouldPlay = clipData ? (clipData.playOnAwake || clipData.autoplay) : false;
      if (shouldPlay && !source._started) {
        this.audio.playEventOnBus(clipPath, {
          busId:    clipData.busId    || null,
          volume:   clipData.volume   ?? 1,
          pitch:    clipData.pitch    ?? 1,
          loop:     clipData.loop     ?? false,
          oneShot:  clipData.oneShot  ?? false,
          priority: source.priority   ?? 50,
        });
        source._started = true;
      }
    }

    this.audio.update(dt);
  }
}


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
