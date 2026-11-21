param(
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$wasmDir = Join-Path $root 'wasm'
$release = Join-Path $wasmDir 'target\wasm32-unknown-unknown\release\plotsy_math.wasm'
$outWasm = Join-Path $wasmDir 'plotsy_math.wasm'
$outData = Join-Path $root 'js\plotsy_math_data.js'

if (-not $SkipBuild) {
  Push-Location $wasmDir
  try {
    cargo build --release --target wasm32-unknown-unknown
    if ($LASTEXITCODE -ne 0) {
      throw "Cargo failed to build Plotsy WASM (exit code $LASTEXITCODE)."
    }
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path $release)) {
  throw "WASM 产物不存在：$release"
}

Copy-Item -LiteralPath $release -Destination $outWasm -Force
$bytes = [System.IO.File]::ReadAllBytes($outWasm)
$base64 = [Convert]::ToBase64String($bytes)
$header = @'
/* 由 scripts/build-wasm.ps1 生成，请勿手改。 */
(function (global) {
  const Plotsy = (global.Plotsy = global.Plotsy || {});
  Plotsy.wasmBase64 = 
'@
$footer = @'
;
})(typeof window !== 'undefined' ? window : globalThis);
'@
$js = $header + '"' + $base64 + '"' + $footer
[System.IO.File]::WriteAllText($outData, $js, [System.Text.UTF8Encoding]::new($false))

"WASM: $outWasm ($([math]::Round($bytes.Length / 1KB, 1)) KB)"
"Data: $outData ($([math]::Round((Get-Item $outData).Length / 1KB, 1)) KB)"
