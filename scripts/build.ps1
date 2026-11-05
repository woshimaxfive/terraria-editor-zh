param([string]$OutputDirectory=(Join-Path $PSScriptRoot '../dist'))
$ErrorActionPreference='Stop'
$sourceRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$stage=Join-Path $sourceRoot ('artifacts/publish-'+[Guid]::NewGuid().ToString('N'))
foreach($part in @('ui','core')){
 $name=if($part -eq 'ui'){'TEdit.Browser.UI'}else{'TEdit.Browser.Core'}
 & dotnet publish (Join-Path $sourceRoot "src/browser/$part/$name.csproj") -c Release -o (Join-Path $stage $part)
 if($LASTEXITCODE -ne 0){throw "Build failed: $part"}
}
Copy-Item -LiteralPath (Join-Path $sourceRoot 'licenses') -Destination (Join-Path $stage 'licenses') -Recurse
foreach($notice in @('LICENSE-MS-PL.txt','LICENSE-MIT.txt','README.md')){
 Copy-Item -LiteralPath (Join-Path $sourceRoot $notice) -Destination (Join-Path $stage $notice)
}
[IO.File]::WriteAllText((Join-Path $stage '.nojekyll'),'', [Text.UTF8Encoding]::new($false))
& python (Join-Path $PSScriptRoot 'generate-version.py') $stage
if($LASTEXITCODE -ne 0){throw 'Source version generation failed'}
& python (Join-Path $PSScriptRoot 'generate-offline.py') $stage
if($LASTEXITCODE -ne 0){throw 'Offline manifest generation failed'}
$target=[IO.Path]::GetFullPath($OutputDirectory)
if(Test-Path -LiteralPath $target){throw "Output already exists; choose an empty output directory: $target"}
Move-Item -LiteralPath $stage -Destination $target
Write-Host "Static site: $target"
