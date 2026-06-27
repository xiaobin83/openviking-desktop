# Rename MSI installer: remove locale suffix (e.g. "_en-US") from filename
# Called automatically after `pnpm build:win`

$msiDir = "src-tauri\target\release\bundle\msi"
if (-not (Test-Path $msiDir)) {
    Write-Output "MSI directory not found: $msiDir"
    exit 0
}

$msiFiles = Get-ChildItem -LiteralPath $msiDir -Filter "*_*-*.msi"
if (-not $msiFiles) {
    Write-Output "No locale-suffixed MSI files found."
    exit 0
}

foreach ($file in $msiFiles) {
    # Match patterns like: ..._en-US.msi, ..._zh-CN.msi, ..._fr-FR.msi
    if ($file.BaseName -match '^(.+)_[a-z]{2}-[A-Z]{2}$') {
        $newName = "$($matches[1]).msi"
        $newPath = Join-Path $file.DirectoryName $newName

        # Remove old file if exists
        if (Test-Path $newPath) {
            Remove-Item -LiteralPath $newPath -Force
        }

        Rename-Item -LiteralPath $file.FullName -NewName $newName
        Write-Output "Renamed: $($file.Name) -> $newName"
    } else {
        Write-Output "Skipped (no locale suffix): $($file.Name)"
    }
}
