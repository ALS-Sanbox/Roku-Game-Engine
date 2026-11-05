' One streaming decoder for music; device-limited low-latency WAV voices for SFX.
function RokuAudio_GetRuntime(engine as Object,node as Object,component as Object) as Object
  owner = engine.EnsureNodeRuntime(node)
  if owner.audioVoices = invalid then owner.audioVoices = {}
  key = _BRS_StrCoalesce(component.id,_BRS_StrCoalesce(component.audioId,_BRS_StrCoalesce(component.resourcePath,"default")))
  if not owner.audioVoices.DoesExist(key) then owner.audioVoices[key] = {}
  return owner.audioVoices[key]
end function

function RokuEngine_ControlAudio(nodeReference as String, command as String, componentId = "" as String) as Boolean
  node = RokuCamera_Resolve(m,nodeReference)
  if node = invalid then return false
  for each component in node.components
    if component.type <> "AudioSourceComponent" or component.enabled = false then continue for
    if componentId <> "" and component.id <> componentId then continue for
    m.PlayNodeAudio(node,component)
    runtime = RokuAudio_GetRuntime(m,node,component)
    if runtime.audioPlayer = invalid then return false
    action = LCase(command)
    if action = "play" then return runtime.audioPlayer.Play()
    if action = "stop" then return runtime.audioPlayer.Stop()
    if action = "pause" then return runtime.audioPlayer.Pause()
    if action = "resume" then return runtime.audioPlayer.Resume()
    return false
  end for
  return false
end function

sub RokuAudio_StopNode(engine as Object,node as Object)
  runtime = engine.EnsureNodeRuntime(node)
  if runtime.audioVoices <> invalid then
    for each key in runtime.audioVoices
      voice = runtime.audioVoices[key]
      if voice.audioPlayer <> invalid then voice.audioPlayer.Stop()
    end for
  end if
end sub

function RokuAudio_CreateVoice(engine as Object,id as String,url as String,loopEnabled as Boolean,oneShot as Boolean) as Dynamic
  voice = {engine:engine,id:id,url:url,loopEnabled:loopEnabled,oneShot:oneShot,Play:RokuAudio_Play,Stop:RokuAudio_Stop,Pause:RokuAudio_Pause,Resume:RokuAudio_Resume}
  if oneShot then
    voice.resource = CreateObject("roAudioResource",url)
    if voice.resource = invalid then return invalid
    capacity = voice.resource.MaxSimulStreams()
    if capacity < 1 then capacity = 1
    if engine.audioNextSlot = invalid then engine.audioNextSlot = 0
    voice.slot = engine.audioNextSlot mod capacity
    engine.audioNextSlot = engine.audioNextSlot+1
  else if engine.audioStreamPlayer = invalid then
    engine.audioStreamPlayer = CreateObject("roAudioPlayer")
    if engine.audioStreamPlayer = invalid then return invalid
    engine.audioStreamPlayer.SetMessagePort(engine.port)
  end if
  return voice
end function

function RokuAudio_Play() as Boolean
  if m.oneShot then
    m.resource.Trigger(100,m.slot)
    return true
  end if
  m.engine.activeStreamVoiceId = m.id
  m.engine.activeStreamNodeId = m.nodeId
  m.engine.audioStreamPlayer.SetContentList([{url:m.url}])
  m.engine.audioStreamPlayer.SetLoop(m.loopEnabled)
  return m.engine.audioStreamPlayer.Play()
end function

function RokuAudio_Stop() as Boolean
  if m.oneShot then
    m.resource.Stop()
    return true
  end if
  if m.engine.activeStreamVoiceId <> m.id then return false
  return m.engine.audioStreamPlayer.Stop()
end function

function RokuAudio_Pause() as Boolean
  if m.oneShot or m.engine.activeStreamVoiceId <> m.id then return false
  return m.engine.audioStreamPlayer.Pause()
end function

function RokuAudio_Resume() as Boolean
  if m.oneShot or m.engine.activeStreamVoiceId <> m.id then return false
  return m.engine.audioStreamPlayer.Resume()
end function
