param([int[]]$Pages = @(1, 2, 5, 12, 40))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.FileAccessMode,Windows.Storage,ContentType=WindowsRuntime] | Out-Null
[Windows.Data.Pdf.PdfDocument,Windows.Data.Pdf,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
$asyncOperation = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
$asyncAction = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1
function Wait-Operation($Operation, [Type]$ResultType) {
    $task = $asyncOperation.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    $task.Wait()
    $task.Result
}
$workspace = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { (Get-Location).Path }
$pdfPath = Join-Path $workspace 'docs/manual/Roku-Game-Engine-User-Manual.pdf'
$file = Wait-Operation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($pdfPath)) ([Windows.Storage.StorageFile])
$pdf = Wait-Operation ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
Write-Output "PDF page count: $($pdf.PageCount)"
$reviewFolder = Join-Path $workspace '.visual-editor/manual-review'
New-Item -ItemType Directory -Force -Path $reviewFolder | Out-Null
foreach ($number in (($Pages + @([int]$pdf.PageCount)) | Select-Object -Unique)) {
    if ($number -lt 1 -or $number -gt $pdf.PageCount) { continue }
    $target = Join-Path $reviewFolder "page-$number.png"
    [System.IO.File]::WriteAllBytes($target, [byte[]]@())
    $image = Wait-Operation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($target)) ([Windows.Storage.StorageFile])
    $stream = Wait-Operation ($image.OpenAsync([Windows.Storage.FileAccessMode]::ReadWrite)) ([Windows.Storage.Streams.IRandomAccessStream])
    $page = $pdf.GetPage([uint32]($number - 1))
    try {
        $task = $asyncAction.Invoke($null, @($page.RenderToStreamAsync($stream)))
        $task.Wait()
    } finally { $page.Dispose(); $stream.Dispose() }
    Write-Output $target
}
