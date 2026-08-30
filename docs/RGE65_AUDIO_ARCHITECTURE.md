# RGE 65 Audio Architecture

## Added Systems
- ECS AudioSource component
- ECS AudioListener component
- AudioPlaybackSystem
- Event-driven runtime audio manager
- Mixer bus hierarchy
- Voice pooling foundation
- Runtime mixer fading
- Meter throttling
- Roku-safe voice limits

## Runtime Bus Layout
Master
- Music
- SFX
- UI
- Ambient
- Voice

## Roku Optimizations
- 33ms throttled mixer updates
- pooled voice strategy
- capped simultaneous voices
- fade interpolation batching
- low redraw meter updates
- event lookup cache
- streaming-safe architecture

## Export Integration Targets
- exporter.js
- runtime_manifest_builder.js
- metadata_builders.js
- classic2d_export.js

## Recommended Runtime Strategy
- stream music
- preload UI sounds
- preload short SFX banks
- use event registry lookups
- avoid runtime node allocation spikes
- use SceneGraph audio pools where available

## Editor Expansion Path
- waveform cache atlas
- automation lanes
- mixer snapshots
- live bus monitor
- audio profiler overlay
- playback debugger

## Serialization Example
{
  "AudioSource": {
    "clip": "Explosion",
    "bus": "SFX",
    "volume": 0.8,
    "loop": false,
    "priority": 75
  }
}
