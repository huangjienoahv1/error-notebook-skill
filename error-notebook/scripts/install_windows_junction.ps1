[CmdletBinding()]
param(
    [string]$SourceSkillPath = (Split-Path -Parent $PSScriptRoot),
    [string]$InstallPath = (Join-Path $env:USERPROFILE '.codex\skills\error-notebook'),
    [string]$BackupRoot = (Join-Path $env:USERPROFILE '.codex\skill-backups'),
    [string]$PrivateNotebookPath = (Join-Path $env:USERPROFILE '.codex\error-notebook-data\error-notebook.md')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw '本脚本必须使用 PowerShell 7（pwsh.exe）执行。'
}

function Get-NormalizedPath {
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    return [IO.Path]::GetFullPath($Path).TrimEnd(
        [IO.Path]::DirectorySeparatorChar,
        [IO.Path]::AltDirectorySeparatorChar
    )
}

function Get-JunctionTarget {
    param(
        [Parameter(Mandatory)]
        [IO.FileSystemInfo]$Item
    )

    $rawTarget = @($Item.Target)[0]
    if ([string]::IsNullOrWhiteSpace($rawTarget)) {
        return $null
    }

    if (-not [IO.Path]::IsPathRooted($rawTarget)) {
        $rawTarget = Join-Path $Item.Parent.FullName $rawTarget
    }
    return Get-NormalizedPath -Path $rawTarget
}

function Initialize-PrivateNotebook {
    param(
        [Parameter(Mandatory)]
        [string]$SkillPath,
        [Parameter(Mandatory)]
        [string]$NotebookPath
    )

    $notebookPathFull = Get-NormalizedPath -Path $NotebookPath
    if (Test-Path -LiteralPath $notebookPathFull) {
        if (-not (Test-Path -LiteralPath $notebookPathFull -PathType Leaf)) {
            throw "私有错题本路径不是文件：$notebookPathFull"
        }
        Write-Output "私有错题本已存在，未覆盖：$notebookPathFull"
        return
    }

    $templatePath = Join-Path $SkillPath 'references\error-notebook.md'
    if (-not (Test-Path -LiteralPath $templatePath -PathType Leaf)) {
        throw "Skill 缺少公开错题本模板：$templatePath"
    }
    $notebookParent = Split-Path -Parent $notebookPathFull
    if (-not (Test-Path -LiteralPath $notebookParent -PathType Container)) {
        New-Item -ItemType Directory -Path $notebookParent -Force | Out-Null
    }
    Copy-Item -LiteralPath $templatePath -Destination $notebookPathFull

    $templateHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $templatePath).Hash
    $notebookHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $notebookPathFull).Hash
    if ($templateHash -ne $notebookHash) {
        throw '私有错题本初始化后哈希不一致。'
    }
    Write-Output "私有错题本初始化成功：$notebookPathFull"
}

$sourceItem = Get-Item -LiteralPath $SourceSkillPath -Force
if (-not $sourceItem.PSIsContainer) {
    throw "Skill 源路径不是目录：$SourceSkillPath"
}

$sourcePath = Get-NormalizedPath -Path $sourceItem.FullName
$sourceEntrypoint = Join-Path $sourcePath 'SKILL.md'
if (-not (Test-Path -LiteralPath $sourceEntrypoint -PathType Leaf)) {
    throw "Skill 源目录缺少 SKILL.md：$sourcePath"
}
Initialize-PrivateNotebook -SkillPath $sourcePath -NotebookPath $PrivateNotebookPath

$installPathFull = Get-NormalizedPath -Path $InstallPath
if ($installPathFull.Equals($sourcePath, [StringComparison]::OrdinalIgnoreCase)) {
    Write-Output "全局 Skill 已直接使用仓库目录：$sourcePath"
    exit 0
}

$installParent = Split-Path -Parent $installPathFull
if (-not (Test-Path -LiteralPath $installParent -PathType Container)) {
    New-Item -ItemType Directory -Path $installParent -Force | Out-Null
}

$backupPath = $null
if (Test-Path -LiteralPath $installPathFull) {
    $existingItem = Get-Item -LiteralPath $installPathFull -Force
    if ($existingItem.LinkType -eq 'Junction') {
        $existingTarget = Get-JunctionTarget -Item $existingItem
        if ($existingTarget -and $existingTarget.Equals($sourcePath, [StringComparison]::OrdinalIgnoreCase)) {
            Write-Output "Junction 已正确指向仓库 Skill：$installPathFull -> $sourcePath"
            exit 0
        }
    }

    $backupRootFull = Get-NormalizedPath -Path $BackupRoot
    if (-not (Test-Path -LiteralPath $backupRootFull -PathType Container)) {
        New-Item -ItemType Directory -Path $backupRootFull -Force | Out-Null
    }
    $backupName = "$(Split-Path -Leaf $installPathFull)-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    $backupPath = Join-Path $backupRootFull $backupName
    if (Test-Path -LiteralPath $backupPath) {
        throw "备份路径已存在，停止迁移：$backupPath"
    }
    Move-Item -LiteralPath $installPathFull -Destination $backupPath
}

$createdJunction = $false
try {
    $junction = New-Item -ItemType Junction -Path $installPathFull -Target $sourcePath
    $createdJunction = $true
    $actualTarget = Get-JunctionTarget -Item $junction
    if ($junction.LinkType -ne 'Junction' -or
        -not $actualTarget -or
        -not $actualTarget.Equals($sourcePath, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Junction 验证失败：$installPathFull"
    }

    $installedEntrypoint = Join-Path $installPathFull 'SKILL.md'
    $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $sourceEntrypoint).Hash
    $installedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $installedEntrypoint).Hash
    if ($sourceHash -ne $installedHash) {
        throw 'Junction 创建后 SKILL.md 哈希不一致。'
    }
}
catch {
    if ($createdJunction -and (Test-Path -LiteralPath $installPathFull)) {
        [IO.Directory]::Delete($installPathFull, $false)
    }
    if ($backupPath -and
        (Test-Path -LiteralPath $backupPath) -and
        -not (Test-Path -LiteralPath $installPathFull)) {
        Move-Item -LiteralPath $backupPath -Destination $installPathFull
    }
    throw
}

Write-Output "Junction 创建成功：$installPathFull -> $sourcePath"
if ($backupPath) {
    Write-Output "迁移前目录已保留：$backupPath"
}
