' main.brs - RokuEngine Game
sub Main()
  projectName = "RokuEngine Game"
  engine = RokuEngine_Create("MainScene")
  if engine = invalid then return
  engine.Run()
end sub
