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
Assert-True ($css -match '--fy-focus-ring:') 'Focus-ring CSS token is missing'
Assert-True ($css -match ':focus-visible') 'Visible keyboard-focus CSS is missing'
Assert-True ($css -match '@media \(prefers-reduced-motion: reduce\)') 'Reduced-motion CSS fallback is missing'

$typescript = Get-Content -Raw -Encoding UTF8 (Join-Path $SkillPath 'assets/fuyao-theme.ts')
Assert-True ($typescript -match 'export const fuyaoTheme') 'TypeScript token export is missing'
Assert-True ($typescript -match 'as const') 'TypeScript tokens must preserve literal types'
Assert-True ($typescript -notmatch '(?m)^\s*import\s') 'TypeScript tokens must have no imports'

$example = Get-Content -Raw -Encoding UTF8 (Join-Path $SkillPath 'assets/example.html')
Assert-True ($example -match '<main\b') 'Example must use a main landmark'

Write-Host 'design-skillsquare-fuyao-ui artifact contract: PASS'
