param(
  [string]$SkillPath = (
    Join-Path (Split-Path -Parent $PSScriptRoot) 'skills/design-skillsquare-fuyao-ui'
  )
)

$ErrorActionPreference = 'Stop'

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

Assert-True (Test-Path -LiteralPath $SkillPath) "Skill directory is missing: $SkillPath"

$required = @(
  'SKILL.md',
  'agents/openai.yaml',
  'references/design-language.md',
  'references/page-patterns.md',
  'references/component-patterns.md',
  'assets/fuyao-theme.css',
  'assets/fuyao-theme.ts',
  'assets/example.html'
)

foreach ($relativePath in $required) {
  $absolutePath = Join-Path $SkillPath $relativePath
  Assert-True (Test-Path -LiteralPath $absolutePath) "Required file is missing: $relativePath"
}

$entry = Get-Content -Raw -Encoding UTF8 (Join-Path $SkillPath 'SKILL.md')
Assert-True ($entry -match '(?m)^name:\s*design-skillsquare-fuyao-ui\s*$') 'Unexpected skill name'
Assert-True ($entry -match '(?m)^description:\s*Use when\b') 'Description must start with Use when'
Assert-True ($entry -match 'references/design-language\.md') 'Design-language routing is missing'
Assert-True ($entry -match 'references/page-patterns\.md') 'Page-pattern routing is missing'
Assert-True ($entry -match 'references/component-patterns\.md') 'Component-pattern routing is missing'
$entryWordCount = (($entry -split '\s+') | Where-Object { $_ }).Count
Assert-True ($entryWordCount -le 500) "SKILL.md is too long: $entryWordCount words"

$skillText = Get-ChildItem -LiteralPath $SkillPath -Recurse -File |
  Where-Object { $_.Extension -in '.md', '.css', '.ts', '.html', '.yaml' } |
  ForEach-Object { Get-Content -Raw -Encoding UTF8 $_.FullName }
$joined = $skillText -join [Environment]::NewLine
$forbidden = @(
  'Skill 评审',
  'Skill 规划',
  'Harness 管理',
  '评审中心',
  '部门评审',
  'skill-market-shell',
  'planning-pageNum',
  'UserMarketShell'
)
foreach ($term in $forbidden) {
  Assert-True (-not $joined.Contains($term)) "Business-coupled term found: $term"
}

$css = Get-Content -Raw -Encoding UTF8 (Join-Path $SkillPath 'assets/fuyao-theme.css')
Assert-True ($css -match '--fy-color-primary:\s*#2f7df6') 'Primary CSS token is missing'
Assert-True ($css -match '--fy-color-muted:\s*#94a3b8') 'Disabled/nonessential muted CSS token is missing'
Assert-True ($css -match '--fy-focus-ring:\s*0 0 0 3px var\(--fy-color-primary-glow\)') 'Focus-ring CSS token must consume the primary-glow role'
Assert-True ($css -match ':focus-visible') 'Visible keyboard-focus CSS is missing'
Assert-True ($css -match '@media \(prefers-reduced-motion: reduce\)') 'Reduced-motion CSS fallback is missing'

$typescript = Get-Content -Raw -Encoding UTF8 (Join-Path $SkillPath 'assets/fuyao-theme.ts')
Assert-True ($typescript -match 'export const fuyaoTheme') 'TypeScript token export is missing'
Assert-True ($typescript -match 'as const') 'TypeScript tokens must preserve literal types'
Assert-True ($typescript -notmatch '(?m)^\s*import\s') 'TypeScript tokens must have no imports'

$colorRoles = @(
  @{ Css = 'canvas-end'; TypeScript = 'canvasEnd'; Default = '#ffffff' },
  @{ Css = 'readable-muted'; TypeScript = 'readableMuted'; Default = '#667085' },
  @{ Css = 'surface-muted'; TypeScript = 'surfaceMuted'; Default = '#f8fafc' },
  @{ Css = 'surface-translucent'; TypeScript = 'surfaceTranslucent'; Default = 'rgba(255, 255, 255, 0.88)' },
  @{ Css = 'on-primary'; TypeScript = 'onPrimary'; Default = '#ffffff' },
  @{ Css = 'primary-glow'; TypeScript = 'primaryGlow'; Default = 'rgba(47, 125, 246, 0.14)' },
  @{ Css = 'accent-glow'; TypeScript = 'accentGlow'; Default = 'rgba(117, 82, 255, 0.11)' }
)

foreach ($role in $colorRoles) {
  $cssName = [regex]::Escape($role.Css)
  $typescriptName = [regex]::Escape($role.TypeScript)
  $cssMatch = [regex]::Match($css, "(?m)^\s*--fy-color-${cssName}:\s*(?<value>[^;]+);\s*$")
  $typescriptMatch = [regex]::Match($typescript, "(?m)^\s*${typescriptName}:\s*'(?<value>[^']+)',\s*$")

  Assert-True $cssMatch.Success "Semantic CSS role is missing: --fy-color-$($role.Css)"
  Assert-True $typescriptMatch.Success "Semantic TypeScript role is missing: $($role.TypeScript)"
  Assert-True ($cssMatch.Groups['value'].Value.Trim() -eq $role.Default) "Unexpected CSS default for --fy-color-$($role.Css)"
  Assert-True ($typescriptMatch.Groups['value'].Value.Trim() -eq $role.Default) "Unexpected TypeScript default for $($role.TypeScript)"
  Assert-True ($cssMatch.Groups['value'].Value.Trim() -eq $typescriptMatch.Groups['value'].Value.Trim()) "CSS/TypeScript parity failed for $($role.TypeScript)"
}

$typescriptPrimaryGlow = [regex]::Match(
  $typescript,
  "(?m)^\s*primaryGlow:\s*'(?<value>[^']+)',\s*$"
).Groups['value'].Value.Trim()
$typescriptFocusShadow = [regex]::Match(
  $typescript,
  "(?m)^\s*focus:\s*'(?<value>[^']+)',\s*$"
).Groups['value'].Value.Trim()
Assert-True (
  $typescriptFocusShadow -eq "0 0 0 3px $typescriptPrimaryGlow"
) 'TypeScript focus shadow must consume the same default as primaryGlow'

$pageRule = [regex]::Match($css, '(?s)\.fy-ui \.fy-page\s*\{(?<body>.*?)\}').Groups['body'].Value
Assert-True ($pageRule -match 'var\(--fy-color-primary-glow\)') 'Page glow must consume the primary-glow semantic role'
Assert-True ($pageRule -match 'var\(--fy-color-accent-glow\)') 'Page glow must consume the accent-glow semantic role'
Assert-True ($pageRule -match 'var\(--fy-color-canvas-end\)') 'Page gradient must consume the canvas-end semantic role'

$metricRule = [regex]::Match($css, '(?s)\.fy-ui \.fy-metric\s*\{(?<body>.*?)\}').Groups['body'].Value
$toolbarRule = [regex]::Match($css, '(?s)\.fy-ui \.fy-toolbar\s*\{(?<body>.*?)\}').Groups['body'].Value
Assert-True ($metricRule -match 'background:\s*var\(--fy-color-surface-translucent\)') 'Metric surface must consume the translucent-surface semantic role'
Assert-True ($toolbarRule -match 'background:\s*var\(--fy-color-surface-translucent\)') 'Toolbar surface must consume the translucent-surface semantic role'

$metadataRule = [regex]::Match($css, '(?s)\.fy-ui \.fy-metric > span,\s*\.fy-ui \.fy-card > p\s*\{(?<body>.*?)\}').Groups['body'].Value
Assert-True ($metadataRule -match 'color:\s*var\(--fy-color-readable-muted\)') 'Visible metadata must consume the readable-muted semantic role'

$tagRule = [regex]::Match($css, '(?s)\.fy-ui \.fy-tag\s*\{(?<body>.*?)\}').Groups['body'].Value
$tableHeaderRule = [regex]::Match($css, '(?s)\.fy-ui \.fy-table th\s*\{(?<body>.*?)\}').Groups['body'].Value
Assert-True ($tagRule -match 'background:\s*var\(--fy-color-surface-muted\)') 'Tag must consume the muted-surface semantic role'
Assert-True ($tableHeaderRule -match 'background:\s*var\(--fy-color-surface-muted\)') 'Table header must consume the muted-surface semantic role'

$primaryButtonRule = [regex]::Match($css, '(?s)\.fy-ui \.fy-button--primary\s*\{(?<body>.*?)\}').Groups['body'].Value
Assert-True ($primaryButtonRule -match 'border-color:\s*var\(--fy-color-primary-strong\)') 'Primary button border must consume the contrast-safe primary semantic role'
Assert-True ($primaryButtonRule -match 'background:\s*var\(--fy-color-primary-strong\)') 'Primary button background must consume the contrast-safe primary semantic role'
Assert-True ($primaryButtonRule -match 'color:\s*var\(--fy-color-on-primary\)') 'Primary button text must consume the on-primary semantic role'
Assert-True ($primaryButtonRule -notmatch '#(?:000(?:000)?|1d1d1f)') 'Primary button must not hardcode black'

$focusRule = [regex]::Match($css, '(?s)\.fy-ui :focus-visible\s*\{(?<body>.*?)\}').Groups['body'].Value
Assert-True ($focusRule -match 'outline:\s*2px\s+solid\s+var\(--fy-color-primary\)') 'Focus-visible must use a solid 2px primary outline'
Assert-True ($focusRule -match 'outline-offset:\s*2px') 'Focus-visible must offset its solid outline'
Assert-True ($focusRule -match 'box-shadow:\s*var\(--fy-focus-ring\)') 'Focus-visible must retain the focus shadow as enhancement'
Assert-True ($css -match '(?s)@media\s*\(forced-colors:\s*active\)\s*\{.*?\.fy-ui :focus-visible\s*\{.*?outline:\s*2px\s+solid\s+(?:CanvasText|Highlight)') 'Forced-colors focus fallback is missing'

$example = Get-Content -Raw -Encoding UTF8 (Join-Path $SkillPath 'assets/example.html')
Assert-True ($example -match '<main\b') 'Example must use a main landmark'
Assert-True ($css -notmatch '(?i)https?://') 'CSS must not depend on remote HTTP(S) resources'
Assert-True ($example -notmatch '(?i)https?://') 'HTML example must not depend on remote HTTP(S) resources'

Write-Host 'design-skillsquare-fuyao-ui artifact contract: PASS'
