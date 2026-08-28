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
  [string]([char[]](0x0053, 0x006B, 0x0069, 0x006C, 0x006C, 0x0020, 0x7487, 0x52EB, 0xE178)),
  [string]([char[]](0x0053, 0x006B, 0x0069, 0x006C, 0x006C, 0x0020, 0x7459, 0x52EB, 0x579D)),
  [string]([char[]](0x0048, 0x0061, 0x0072, 0x006E, 0x0065, 0x0073, 0x0073, 0x0020, 0x7EE0, 0xFF04, 0x608A)),
  [string]([char[]](0x7487, 0x52EB, 0xE178, 0x6D93, 0xE15E, 0x7E3E)),
  [string]([char[]](0x95AE, 0x3129, 0x68EC, 0x7487, 0x52EB, 0xE178)),
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
