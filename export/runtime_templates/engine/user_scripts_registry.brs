' user_scripts_registry.brs - generated from project scripts

function RokuEngine_UserScriptDispatch(scriptPath as String, entryPoint as String, context as Object) as Boolean
  if scriptPath = "res://source/game_scripts/component_runtime_example.brs" then
    eventKey = LCase(Trim(Str(entryPoint)))
    if eventKey = "update" then
      RokuScript_source_game_scripts_component_runtime_example_Update(context)
      return true
    end if
  end if
  return false
end function
