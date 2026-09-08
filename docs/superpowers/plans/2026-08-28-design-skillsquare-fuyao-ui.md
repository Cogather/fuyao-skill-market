# Design Skillsquare Fuyao UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build and behaviorally verify a framework-neutral Codex skill that transfers the Fuyao light enterprise UI language without copying source-project business concepts.

**Architecture:** Keep SKILL.md as a compact router and decision contract. Put visual rules, page archetypes, and component patterns in focused references; provide optional, dependency-free CSS and TypeScript tokens plus one semantic HTML example. Validate both artifact structure and design behavior with RED/GREEN application scenarios.

**Tech Stack:** Markdown, CSS custom properties, framework-neutral TypeScript, semantic HTML, PowerShell contract tests, Codex skill initializer/validator, independent agent application tests.

**Spec:** docs/superpowers/specs/2026-08-28-design-skillsquare-fuyao-ui-design.md

## Global Constraints

- The skill name is exactly design-skillsquare-fuyao-ui.
- Do not bind the guidance or assets to Vue, React, Angular, Svelte, Sass, Tailwind, CSS Modules, or a component library.
- Preserve target-project frameworks, brand tokens, component conventions, business logic, and authorization boundaries.
- Treat the source project as a visual sample only; do not propagate its domain entities, tab names, routes, roles, CSS classes, or workflow assumptions.
- Name reusable patterns by user task and information relationship: content discovery, detail reading, data management, decision support, workflow orchestration, and configuration/relationships.
- CSS and TypeScript assets are optional defaults, use the --fy-* namespace, and have no third-party runtime dependencies.
- SKILL.md stays concise; conditional details live in references and are loaded only when relevant.
- Advice-only requests remain read-only. Code changes require an explicit implementation request.
- The final diff must not change current product pages or business code.

---

### Task 1: Establish RED behavior evidence and artifact contract

**Files:**

- Create: docs/superpowers/skill-tests/2026-08-28-design-skillsquare-fuyao-ui.md
- Create: tests/design-skillsquare-fuyao-ui.tests.ps1

**Interfaces:**

- Consumes: the approved spec and the absence of skills/design-skillsquare-fuyao-ui.
- Produces: four stable scenario prompts, a seven-point scoring rubric, verbatim baseline evidence, and a dependency-free PowerShell artifact validator used by later tasks.

- [ ] **Step 1: Create the behavior campaign document**

Create docs/superpowers/skill-tests/2026-08-28-design-skillsquare-fuyao-ui.md with these exact scenarios and rubric:

```markdown
# design-skillsquare-fuyao-ui behavior campaign

## Scoring

Give one point for each observable behavior:

1. Identifies the page's primary user task and density mode.
2. Preserves the stated framework, styling approach, design tokens, and component library.
3. Uses hierarchy, spacing, and containers before adding decorative color.
4. Gives actionable semantic tokens, layout relationships, component states, and responsive rules.
5. Keeps gradients, glass effects, shadows, and motion restrained.
6. Covers focus, contrast, long text, scrolling, status feedback, and operation reachability where relevant.
7. Transfers structure without importing source-domain terminology or assumptions.

### Scenario A — new discovery interface

You are designing a new TypeScript frontend for browsing reusable internal resources. No framework or component library has been chosen. Create an implementation-ready visual direction covering layout, tokens, cards, search, filters, responsive behavior, and interaction states. Keep it professional and inviting without becoming a technology-showcase dashboard.

### Scenario B — existing brand and component system

An established TypeScript product uses React, Material UI, and an existing green brand palette with spacing and typography tokens. Restyle its administrative overview so it feels lighter, clearer, and more trustworthy. Do not replace Material UI, introduce global class overrides, or change the brand color. Explain the mapping to the existing theme.

### Scenario C — dense data workspace

Design a TypeScript management screen containing advanced filters, a wide sortable table, bulk actions, inline validation, status labels, pagination, and a sticky operation column. It must remain scannable at 1440px and usable on narrow screens. Provide concrete sizing, state, overflow, and accessibility guidance.

### Scenario D — cross-domain structural transfer

A source interface contains a selectable task queue, evidence summary, several comparison dimensions, an opinion editor, final actions, and history. Adapt that structure for an equipment-maintenance triage product. Reuse useful layout and interaction relationships, but do not retain the source product's entities, labels, role model, or workflow assumptions.

## RED baseline

For each scenario, preserve the evaluator response verbatim, then record its score and the missing rubric items.

## GREEN verification

For each scenario, preserve the evaluator response verbatim, then record its score and the missing rubric items after loading the skill.

## Outcome

Summarize the baseline failure patterns, the guidance added to address them, any GREEN gaps, and the smallest refactors made.
```

- [ ] **Step 2: Run the four RED scenarios without the skill**

Dispatch one fresh-context evaluator per scenario. Do not mention the proposed skill, source repository, intended answer, or rubric. Give each evaluator only its scenario and ask it to produce the requested design. Copy each response verbatim into the RED baseline section, score it against all seven items, and list concrete omissions rather than stylistic preferences.

- [ ] **Step 3: Write the failing artifact contract test**

Create tests/design-skillsquare-fuyao-ui.tests.ps1:

```powershell
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
```

- [ ] **Step 4: Run the artifact test and verify RED**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/design-skillsquare-fuyao-ui.tests.ps1
```

Expected: FAIL with Skill directory is missing.

- [ ] **Step 5: Commit RED evidence and tests**

```powershell
git add -- docs/superpowers/skill-tests/2026-08-28-design-skillsquare-fuyao-ui.md tests/design-skillsquare-fuyao-ui.tests.ps1
git commit -m "test: define fuyao ui skill behavior"
```

### Task 2: Create the skill entrypoint and metadata

**Files:**

- Create: skills/design-skillsquare-fuyao-ui/SKILL.md
- Create: skills/design-skillsquare-fuyao-ui/agents/openai.yaml
- Create directories: skills/design-skillsquare-fuyao-ui/references and skills/design-skillsquare-fuyao-ui/assets

**Interfaces:**

- Consumes: baseline failure patterns from Task 1.
- Produces: automatic skill discovery metadata and a compact router that later references and assets satisfy.

- [ ] **Step 1: Initialize the skill directory**

Run:

```powershell
python 'D:\Codex\home\skills\.system\skill-creator\scripts\init_skill.py' design-skillsquare-fuyao-ui --path skills --resources references,assets
```

Expected: the new directory contains SKILL.md, agents/openai.yaml, references, and assets. Do not use --examples.

- [ ] **Step 2: Replace SKILL.md with the minimal entrypoint**

Use this content, adding only guidance supported by actual RED omissions:

```markdown
---
name: design-skillsquare-fuyao-ui
description: Use when designing, implementing, or restyling a frontend that needs a professional, lightweight, clear, and trustworthy enterprise UI across discovery, detail, data-management, decision-support, workflow, or configuration views.
---

# Design Skillsquare Fuyao UI

## Core principle

Transfer the visual language, not the source product. Preserve the target project's framework, brand, components, terminology, information architecture, and authorization boundaries.

## Adapt before applying

Inspect the relevant screens, styles, tokens, component conventions, and primary user task. Map Fuyao semantic roles into the existing system. Use the optional assets only when the target lacks suitable foundations or the user explicitly wants a starter theme.

Choose density by task:

- Discovery: inviting hierarchy, search, filters, metrics, and browsable cards.
- Detail: restrained decoration and strong reading structure.
- Data management: compact controls, scannable tables, and reachable bulk or row actions.
- Decision support: stable master-detail context, evidence, dimensions, input, and history.
- Workflow orchestration: steps, scope, validation, progress, and batch operations.
- Configuration and relationships: visible structure, safe changes, and clear dependencies.

## Read as needed

- Read references/design-language.md for colors, typography, spacing, elevation, motion, density, responsive behavior, and token mapping.
- Read references/page-patterns.md when composing or restructuring a complete page.
- Read references/component-patterns.md when implementing or reviewing navigation, steps, panels, forms, cards, tables, dialogs, feedback, or empty states.
- Copy or adapt assets/fuyao-theme.css and assets/fuyao-theme.ts only when useful. Use assets/example.html as a composition example, never as a fixed DOM template.

## Output contract

State the selected task mode and the existing conventions being preserved. Define semantic hierarchy and layout before decorative details. Make recommendations executable with token roles, dimensions or ranges, component states, overflow behavior, and breakpoints appropriate to the target. For reviews, report findings without editing. For implementation requests, use the target project's native patterns.

## Completion check

Verify hierarchy, semantic states, keyboard focus, contrast, long text, scrolling, loading and empty states, reduced motion, responsive priority, and operation reachability. Remove source-domain language and assumptions from reusable structures.
```

- [ ] **Step 3: Replace agents/openai.yaml**

```yaml
interface:
  display_name: '扶摇 Skillsquare UI'
  short_description: '将扶摇轻量企业 UI 设计语言灵活迁移到任意前端项目'
  brand_color: '#2F7DF6'
  default_prompt: 'Use $design-skillsquare-fuyao-ui to design this frontend with the Fuyao visual language while preserving its existing framework, brand, components, and business terminology.'
```

- [ ] **Step 4: Verify entrypoint and metadata**

Run:

```powershell
$entry = Get-Content -Raw -Encoding UTF8 'skills/design-skillsquare-fuyao-ui/SKILL.md'
if ($entry -notmatch '(?m)^description:\s*Use when\b') { throw 'Invalid description' }
if ($entry -notmatch 'Transfer the visual language, not the source product') { throw 'Missing core principle' }
$metadata = Get-Content -Raw -Encoding UTF8 'skills/design-skillsquare-fuyao-ui/agents/openai.yaml'
if ($metadata -notmatch '\$design-skillsquare-fuyao-ui') { throw 'Default prompt must mention the skill' }
```

Expected: no output and exit code 0.

- [ ] **Step 5: Commit the entrypoint**

```powershell
git add -- skills/design-skillsquare-fuyao-ui/SKILL.md skills/design-skillsquare-fuyao-ui/agents/openai.yaml
git commit -m "feat: add fuyao ui skill entrypoint"
```

### Task 3: Add the framework-neutral design language

**Files:**

- Create: skills/design-skillsquare-fuyao-ui/references/design-language.md

**Interfaces:**

- Consumes: semantic roles named in SKILL.md.
- Produces: exact default tokens and adaptation rules used by the CSS, TypeScript, example, and component guidance.

- [ ] **Step 1: Write design-language.md**

The file must include these sections and decisions:

```markdown
# Design language

## Character

Professional, lightweight, clear, and trustworthy, with restrained AI-product cues. Decoration supports recognition and atmosphere; it never competes with reading, scanning, or action.

## Adaptation order

1. Preserve the target brand, framework, component library, and established interaction semantics.
2. Map semantic roles: canvas, surface, primary text, body text, muted text, line, primary action, focus, success, warning, danger.
3. Select relaxed, standard, or compact density from the page task.
4. Introduce Fuyao defaults only where the target has no equivalent.

## Default color roles

| Role             | Default | Usage                                          |
| ---------------- | ------- | ---------------------------------------------- |
| Canvas start     | #f2f7ff | Optional cool opening tint                     |
| Canvas           | #fbfcff | Main light background                          |
| Surface          | #ffffff | Cards, filters, work areas                     |
| Heading          | #07172f | Highest text emphasis                          |
| Text             | #52647d | Body and descriptions                          |
| Muted            | #94a3b8 | Hints, placeholders, disabled context          |
| Line             | #e2e8f0 | Structural boundaries                          |
| Primary          | #2f7df6 | Actions, selection, focus                      |
| Primary strong   | #2563eb | Hover and high-emphasis blue                   |
| Accent           | #7552ff | Restrained gradient or intelligent feature cue |
| Accent secondary | #2ecdd3 | Restrained gradient support                    |
| Success          | #16a34a | Completed and positive state                   |
| Warning          | #f59e0b | Attention and pending state                    |
| Danger           | #dc2626 | Destructive and failed state                   |

Use blue-purple or blue-cyan gradients only for a hero phrase, compact icon tile, intelligent-feature cue, or primary action that needs product identity. Do not apply gradients to every card, table row, or status.

## Typography

Use the target font first. Without one, use a system Chinese sans-serif stack. Suggested ranges: discovery hero 42–52px, page heading 34–42px, section heading 24–30px, component title 15–18px, body 13–15px, metadata 10–12px. Prefer weight and spacing over extra colors.

## Spacing and density

Compose from 4, 6, 8, 10, 12, 14, 16, 18, 24, 28, and 32px.

| Density  | Controls | Content gap | Use                              |
| -------- | -------- | ----------- | -------------------------------- |
| Relaxed  | 44–58px  | 16–24px     | Discovery and prominent search   |
| Standard | 38–44px  | 12–18px     | Detail and ordinary forms        |
| Compact  | 32–38px  | 8–14px      | Tables, filters, batch workflows |

## Shape and elevation

Controls use 6–8px radii, ordinary panels 8–12px, feature metrics 18–22px, and pills a full radius. Prefer a one-pixel line and no shadow for dense content. Use soft shadows around floating layers, prominent metrics, or primary actions.

## Background

A page may combine a very light neutral gradient, one or two low-opacity corner glows, and a subtle 34px grid that fades before the content body. Remove these effects when they reduce contrast or crowd a dense workspace.

## Interaction

Use 160–180ms transitions for color, border, opacity, and a maximum 1–3px hover lift. Provide a visible focus ring, disabled explanation when needed, loading feedback, semantic status colors, and reduced-motion fallback.

## Responsive priority

Protect the primary task, current context, key data, and reachable actions. Reflow grids 4→3→2→1, turn master-detail columns into a clear sequence, wrap filters by logical groups, and keep wide tables scrollable with critical columns or actions sticky when justified.

## Mapping example

If a target theme already exposes brand.primary, text.secondary, divider, background.paper, error.main, and spacing(), map the semantic roles to those APIs. Do not add parallel global variables unless the existing theme cannot express a required role.

## Common mistakes

- Replacing an existing brand with the default blue.
- Treating gradients, glass, and shadows as mandatory identity.
- Giving primary and secondary actions equal weight.
- Coloring every tag and status at high saturation.
- Increasing every gap instead of separating information groups.
- Shrinking dense interfaces without protecting scroll and actions.
```

- [ ] **Step 2: Verify design-language invariants**

```powershell
$path = 'skills/design-skillsquare-fuyao-ui/references/design-language.md'
$text = Get-Content -Raw -Encoding UTF8 $path
@('Adaptation order', 'Default color roles', 'Typography', 'Spacing and density', 'Responsive priority', 'Common mistakes') |
  ForEach-Object { if (-not $text.Contains($_)) { throw "Missing section: $_" } }
if ($text -notmatch '#2f7df6') { throw 'Primary default is missing' }
if ($text -notmatch '(?s)Relaxed.*Standard.*Compact') { throw 'Density modes are incomplete' }
```

Expected: no output and exit code 0.

- [ ] **Step 3: Commit the design language**

```powershell
git add -- skills/design-skillsquare-fuyao-ui/references/design-language.md
git commit -m "docs: define fuyao ui design language"
```

### Task 4: Add task-based page patterns

**Files:**

- Create: skills/design-skillsquare-fuyao-ui/references/page-patterns.md

**Interfaces:**

- Consumes: relaxed, standard, and compact density modes from design-language.md.
- Produces: six business-neutral page archetypes selected by observable user task.

- [ ] **Step 1: Write page-patterns.md**

Use the following contract:

```markdown
# Page patterns

Select by the user's primary task, not by industry or source-page name.

## Quick reference

| Task                                | Pattern                     | Density          | First-screen priority                                      |
| ----------------------------------- | --------------------------- | ---------------- | ---------------------------------------------------------- |
| Browse and compare                  | Content discovery           | Relaxed          | Purpose, search, filters, first results                    |
| Understand one item                 | Detail reading              | Standard         | Identity, status, actions, readable content                |
| Scan and operate on many rows       | Data management             | Compact          | Filters, result state, table, bulk/row actions             |
| Compare evidence and decide         | Decision support            | Standard/compact | Current subject, evidence, dimensions, input, final action |
| Complete staged setup or planning   | Workflow orchestration      | Standard/compact | Current step, scope, validation, progress, actions         |
| Understand and change relationships | Configuration/relationships | Standard         | Structure, selection, dependencies, safe change            |

## Content discovery

Use a compact top navigation, a clear value statement, optional restrained identity treatment, search, lightweight filters, and a card grid. Keep useful results in the first screen. Cards prioritize name, purpose, provenance, quality signal, and one primary action; cap decorative tags.

## Detail reading

Use a restrained header with identity, status, metadata, and primary/secondary actions. Organize the body with stable sections or anchors. Keep long text readable, file or version relationships explicit, and destructive actions separated from ordinary actions.

## Data management

Place scope and advanced filters above a result summary and action toolbar. Use a compact table with sticky headers; keep bulk actions near selection state and row actions reachable. Define empty, loading, error, validation, pagination, horizontal overflow, and narrow-screen behavior.

## Decision support

Use a stable master-detail relationship: selectable queue or list, current subject, evidence summary, comparison dimensions, input area, final actions, and history. Preserve the current context while scrolling. On narrow screens, order these regions explicitly instead of hiding evidence or actions.

## Workflow orchestration

Use a stepper for position and progress, then scope filters, structured data, validation, and batch or row actions. Distinguish completed, current, blocked, and future steps without relying on color alone. Keep validation adjacent to its input and explain disabled progression.

## Configuration and relationships

Expose hierarchy or dependencies through trees, grouped panels, connectors, or master-detail views. Show selection scope and inherited effects. Preview or explain high-impact changes and require explicit confirmation for destructive or broad updates.

## Composition rules

Start with navigation → title and context → controls → primary content → feedback and follow-up. A real page may combine patterns, but one must own the visual hierarchy. Reuse relationships such as master-detail, steps, metric groups, filtered tables, inline editing, and sticky actions without copying source terminology or workflow assumptions.

## Responsive rules

Protect context and actions before decorative content. Collapse card columns gradually, wrap related filters together, convert split panes to a documented sequence, allow table scrolling, and avoid hiding the only route to an operation.

## Common mistakes

- Naming a pattern after a source product, role, or business process.
- Building a large hero that pushes the working content below the fold.
- Mixing relaxed discovery spacing into a dense table.
- Detaching bulk actions from selection state.
- Hiding evidence, validation, or final actions at narrow widths.
- Copying source labels when only the layout relationship is reusable.
```

- [ ] **Step 2: Verify all six patterns are present and business-neutral**

```powershell
$path = 'skills/design-skillsquare-fuyao-ui/references/page-patterns.md'
$text = Get-Content -Raw -Encoding UTF8 $path
@('Content discovery', 'Detail reading', 'Data management', 'Decision support', 'Workflow orchestration', 'Configuration and relationships') |
  ForEach-Object { if (-not $text.Contains($_)) { throw "Missing page pattern: $_" } }
@('Skill 评审', 'Skill 规划', 'Harness 管理', '评审中心') |
  ForEach-Object { if ($text.Contains($_)) { throw "Business term found: $_" } }
```

Expected: no output and exit code 0.

- [ ] **Step 3: Commit the page patterns**

```powershell
git add -- skills/design-skillsquare-fuyao-ui/references/page-patterns.md
git commit -m "docs: add business-neutral page patterns"
```

### Task 5: Add reusable component contracts

**Files:**

- Create: skills/design-skillsquare-fuyao-ui/references/component-patterns.md

**Interfaces:**

- Consumes: semantic roles and density modes from design-language.md plus page relationships from page-patterns.md.
- Produces: framework-neutral implementation decisions for common interface components.

- [ ] **Step 1: Write component-patterns.md**

Start with this quick-reference table:

```markdown
## Quick reference

| Component     | Hierarchy rule                                  | Default geometry                          | Required states                         |
| ------------- | ----------------------------------------------- | ----------------------------------------- | --------------------------------------- |
| Navigation    | Product context, sections, then utility actions | 56–66px bar; 44–48px targets              | default, hover, active, focus, scrolled |
| Stepper       | Completed/current/future status before detail   | 32–44px step targets                      | completed, current, blocked, future     |
| Master-detail | Selection context remains visible beside detail | flexible list + minmax detail             | empty, selected, loading, narrow        |
| Metric card   | Label and value dominate the icon               | 18–22px radius; 44–48px icon tile         | default, loading, unavailable           |
| Button        | One primary action per local task region        | 38–44px standard; 32–38px compact         | hover, focus, disabled, loading         |
| Form control  | Label, input, help/error in reading order       | 38–44px standard; 32–38px compact         | focus, filled, error, disabled          |
| Content card  | Title, purpose, provenance, signal, action      | 8–12px ordinary radius                    | hover, focus, loading, long text        |
| Table         | Scope, result state, data, actions              | 12–13px text; sticky header as needed     | sort, filter, select, empty, overflow   |
| Tag/status    | Semantics stay stable and subordinate           | 22–28px height; pill or 4–6px radius      | default, selected, disabled             |
| Dialog        | Title, impact, content, actions                 | 8–12px radius; bounded viewport           | open, busy, error, destructive          |
| Feedback      | Explain state and next step                     | inline first; toast for transient results | loading, success, warning, error        |
| Empty state   | Reason before optional action                   | restrained panel or table row             | no data, no match, unauthorized         |
```

Then include these exact behavioral contracts:

- Navigation uses a quiet background and text labels; active state uses text emphasis plus an underline or equivalent non-color cue. Add glass blur and elevation only after content scrolls beneath it.
- A stepper exposes completed, current, blocked, and future states through label, icon or number, and shape—not color alone.
- Master-detail layouts keep selection visible and current context explicit. Narrow layouts define a list→detail→action reading order and a route back to selection.
- Metric cards use feature-sized radii and optional compact gradient icon tiles, but the number and label remain the emphasis.
- A local task region has one primary action. Secondary actions use outline or soft surfaces; destructive actions use danger semantics and impact copy.
- Form controls use labels above controls, 38–44px standard height or 32–38px compact height, visible focus rings, adjacent errors, and understandable disabled states.
- Content cards prioritize title, purpose, provenance, quality signal, and action. Limit tags and use a 1–3px maximum hover lift.
- Tables use 12–13px dense text, clear headers, row separators, sticky headers where useful, selection-linked bulk actions, deliberate overflow, and reachable operation columns.
- Tags use low-saturation surfaces and stable semantics. Do not assign unrelated colors merely for variety.
- Dialogs use a stable title/body/action hierarchy, clear close behavior, focus management, and impact explanation for high-risk changes.
- Feedback distinguishes loading, success, warning, error, empty, disabled, and unauthorized states and gives a next step when one exists.
- Empty states explain why content is absent and offer an action only when that action is valid.

Finish with a state checklist covering default, hover, active/selected, focus-visible, disabled, loading, empty, error, long-content, overflow, reduced-motion, and narrow-width behavior, followed by a Common mistakes section.

- [ ] **Step 2: Verify component coverage**

```powershell
$path = 'skills/design-skillsquare-fuyao-ui/references/component-patterns.md'
$text = Get-Content -Raw -Encoding UTF8 $path
@('Navigation', 'Stepper', 'Master-detail', 'Metric', 'Button', 'Form', 'Card', 'Table', 'Tag', 'Dialog', 'Feedback', 'Empty') |
  ForEach-Object { if ($text -notmatch [regex]::Escape($_)) { throw "Missing component contract: $_" } }
@('focus-visible', 'reduced-motion', 'overflow', 'narrow') |
  ForEach-Object { if ($text -notmatch [regex]::Escape($_)) { throw "Missing state guidance: $_" } }
```

Expected: no output and exit code 0.

- [ ] **Step 3: Commit the component contracts**

```powershell
git add -- skills/design-skillsquare-fuyao-ui/references/component-patterns.md
git commit -m "docs: add fuyao ui component contracts"
```

### Task 6: Add optional CSS, TypeScript, and HTML assets

**Files:**

- Create: skills/design-skillsquare-fuyao-ui/assets/fuyao-theme.css
- Create: skills/design-skillsquare-fuyao-ui/assets/fuyao-theme.ts
- Create: skills/design-skillsquare-fuyao-ui/assets/example.html

**Interfaces:**

- Consumes: token names and values from design-language.md.
- Produces: optional --fy-* CSS variables, a matching fuyaoTheme TypeScript object, and one framework-neutral composition example.

- [ ] **Step 1: Create fuyao-theme.css**

Define these token groups with exact defaults:

- Colors: canvas-start #f2f7ff, canvas #fbfcff, surface #ffffff, heading #07172f, text #52647d, muted #94a3b8, line #e2e8f0, primary #2f7df6, primary-strong #2563eb, accent #7552ff, accent-secondary #2ecdd3, success #16a34a, warning #f59e0b, danger #dc2626.
- Typography: a system Chinese sans-serif stack and size tokens 10, 12, 13, 15, 18, 24, 34, 42, and 52px.
- Spacing: --fy-space-1 through --fy-space-11 mapped to 4, 6, 8, 10, 12, 14, 16, 18, 24, 28, and 32px.
- Radii: 6, 8, 12, 20, and 999px.
- Shadows: soft 0 10px 28px rgba(35, 52, 84, 0.06), raised 0 18px 48px rgba(35, 52, 84, 0.08), floating 0 24px 70px rgba(15, 23, 42, 0.18).
- Motion: fast 160ms, standard 180ms, easing ease.
- Focus: --fy-focus-ring: 0 0 0 3px rgba(47, 125, 246, 0.18).
- Layout: breakpoints documented as 640, 1040, and 1320px; content max 1320px.

Use this implementation shape; keep every selector scoped under .fy-ui except :root:

```css
:root {
  --fy-color-canvas-start: #f2f7ff;
  --fy-color-canvas: #fbfcff;
  --fy-color-surface: #ffffff;
  --fy-color-heading: #07172f;
  --fy-color-text: #52647d;
  --fy-color-muted: #94a3b8;
  --fy-color-line: #e2e8f0;
  --fy-color-primary: #2f7df6;
  --fy-color-primary-strong: #2563eb;
  --fy-color-accent: #7552ff;
  --fy-color-accent-secondary: #2ecdd3;
  --fy-color-success: #16a34a;
  --fy-color-warning: #f59e0b;
  --fy-color-danger: #dc2626;
  --fy-font-sans:
    'HarmonyOS Sans SC', 'MiSans', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei UI', system-ui,
    sans-serif;
  --fy-font-size-xs: 10px;
  --fy-font-size-sm: 12px;
  --fy-font-size-compact: 13px;
  --fy-font-size-body: 15px;
  --fy-font-size-title: 18px;
  --fy-font-size-section: 24px;
  --fy-font-size-page: 34px;
  --fy-font-size-display: 42px;
  --fy-font-size-hero: 52px;
  --fy-space-1: 4px;
  --fy-space-2: 6px;
  --fy-space-3: 8px;
  --fy-space-4: 10px;
  --fy-space-5: 12px;
  --fy-space-6: 14px;
  --fy-space-7: 16px;
  --fy-space-8: 18px;
  --fy-space-9: 24px;
  --fy-space-10: 28px;
  --fy-space-11: 32px;
  --fy-radius-control: 6px;
  --fy-radius-comfortable: 8px;
  --fy-radius-panel: 12px;
  --fy-radius-feature: 20px;
  --fy-radius-pill: 999px;
  --fy-shadow-soft: 0 10px 28px rgba(35, 52, 84, 0.06);
  --fy-shadow-raised: 0 18px 48px rgba(35, 52, 84, 0.08);
  --fy-shadow-floating: 0 24px 70px rgba(15, 23, 42, 0.18);
  --fy-focus-ring: 0 0 0 3px rgba(47, 125, 246, 0.18);
  --fy-motion-fast: 160ms;
  --fy-motion-standard: 180ms;
  --fy-motion-easing: ease;
  --fy-content-max: 1320px;
}

.fy-ui,
.fy-ui *,
.fy-ui *::before,
.fy-ui *::after {
  box-sizing: border-box;
}

.fy-ui {
  margin: 0;
  color: var(--fy-color-text);
  font: 400 var(--fy-font-size-body) / 1.6 var(--fy-font-sans);
}

.fy-ui .fy-page {
  min-height: 100vh;
  background:
    radial-gradient(circle at 10% -5%, rgba(47, 125, 246, 0.14), transparent 28%),
    radial-gradient(circle at 90% -4%, rgba(117, 82, 255, 0.11), transparent 30%),
    linear-gradient(180deg, var(--fy-color-canvas-start), var(--fy-color-canvas) 44%, #fff);
}

.fy-ui .fy-shell {
  width: min(100%, var(--fy-content-max));
  margin-inline: auto;
  padding-inline: clamp(16px, 4vw, 48px);
}

.fy-ui .fy-topbar {
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--fy-space-7);
}

.fy-ui .fy-nav {
  display: flex;
  align-items: center;
  gap: var(--fy-space-3);
  overflow-x: auto;
}

.fy-ui .fy-nav-link {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  padding-inline: var(--fy-space-7);
  border-bottom: 2px solid transparent;
  color: var(--fy-color-text);
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}

.fy-ui .fy-nav-link[aria-current='page'] {
  border-bottom-color: var(--fy-color-primary);
  color: var(--fy-color-primary-strong);
}

.fy-ui .fy-hero {
  padding-block: clamp(36px, 7vw, 76px) var(--fy-space-10);
  text-align: center;
}

.fy-ui .fy-hero h1 {
  max-width: 980px;
  margin: 0 auto;
  color: var(--fy-color-heading);
  font-size: clamp(var(--fy-font-size-display), 4.2vw, var(--fy-font-size-hero));
  line-height: 1.08;
}

.fy-ui .fy-gradient-text {
  color: transparent;
  background: linear-gradient(
    105deg,
    var(--fy-color-primary),
    var(--fy-color-accent) 52%,
    var(--fy-color-accent-secondary)
  );
  background-clip: text;
  -webkit-background-clip: text;
}

.fy-ui .fy-hero p {
  max-width: 720px;
  margin: var(--fy-space-7) auto 0;
}

.fy-ui .fy-section-title {
  margin: var(--fy-space-10) 0 var(--fy-space-7);
  color: var(--fy-color-heading);
  font-size: var(--fy-font-size-section);
}

.fy-ui .fy-metric-grid,
.fy-ui .fy-card-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--fy-space-6);
}

.fy-ui .fy-metric {
  min-height: 88px;
  padding: var(--fy-space-7);
  border: 1px solid var(--fy-color-line);
  border-radius: var(--fy-radius-feature);
  background: rgba(255, 255, 255, 0.8);
  box-shadow: var(--fy-shadow-soft);
}

.fy-ui .fy-metric strong {
  display: block;
  margin-top: var(--fy-space-2);
  color: var(--fy-color-heading);
  font-size: var(--fy-font-size-section);
}

.fy-ui .fy-toolbar {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) repeat(2, minmax(140px, 190px)) auto;
  gap: var(--fy-space-5);
  align-items: end;
  margin-block: var(--fy-space-10);
  padding: var(--fy-space-7);
  border: 1px solid var(--fy-color-line);
  border-radius: var(--fy-radius-panel);
  background: rgba(255, 255, 255, 0.9);
  box-shadow: var(--fy-shadow-soft);
}

.fy-ui .fy-field {
  display: grid;
  gap: var(--fy-space-2);
  min-width: 0;
}

.fy-ui .fy-field label {
  color: var(--fy-color-text);
  font-size: var(--fy-font-size-sm);
  font-weight: 700;
}

.fy-ui .fy-field input,
.fy-ui .fy-field select {
  width: 100%;
  min-width: 0;
  height: 42px;
  padding-inline: var(--fy-space-5);
  border: 1px solid var(--fy-color-line);
  border-radius: var(--fy-radius-comfortable);
  background: var(--fy-color-surface);
  color: var(--fy-color-heading);
  font: inherit;
}

.fy-ui .fy-button {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding-inline: var(--fy-space-7);
  border: 1px solid var(--fy-color-line);
  border-radius: var(--fy-radius-pill);
  background: var(--fy-color-surface);
  color: var(--fy-color-heading);
  font: inherit;
  font-weight: 800;
  text-decoration: none;
  cursor: pointer;
  transition: transform var(--fy-motion-fast) var(--fy-motion-easing);
}

.fy-ui .fy-button--primary {
  border-color: #1d1d1f;
  background: #1d1d1f;
  color: #fff;
}

.fy-ui .fy-button:hover {
  transform: translateY(-1px);
}

.fy-ui :focus-visible {
  outline: 0;
  box-shadow: var(--fy-focus-ring);
}

.fy-ui .fy-card-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.fy-ui .fy-card {
  min-width: 0;
  padding: var(--fy-space-8);
  border: 1px solid var(--fy-color-line);
  border-radius: var(--fy-radius-panel);
  background: var(--fy-color-surface);
  box-shadow: var(--fy-shadow-soft);
  transition:
    transform var(--fy-motion-fast) var(--fy-motion-easing),
    box-shadow var(--fy-motion-fast) var(--fy-motion-easing);
}

.fy-ui .fy-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--fy-shadow-raised);
}

.fy-ui .fy-card h2 {
  margin: 0;
  color: var(--fy-color-heading);
  font-size: var(--fy-font-size-title);
}

.fy-ui .fy-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--fy-space-2);
}

.fy-ui .fy-tag {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  padding-inline: var(--fy-space-3);
  border: 1px solid var(--fy-color-line);
  border-radius: var(--fy-radius-control);
  background: #f8fafc;
  color: var(--fy-color-text);
  font-size: var(--fy-font-size-sm);
}

.fy-ui .fy-table-wrap {
  margin-block: var(--fy-space-10);
  overflow: auto;
  border: 1px solid var(--fy-color-line);
  border-radius: var(--fy-radius-panel);
  background: var(--fy-color-surface);
}

.fy-ui .fy-table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
}

.fy-ui .fy-table th,
.fy-ui .fy-table td {
  padding: var(--fy-space-5) var(--fy-space-6);
  border-bottom: 1px solid var(--fy-color-line);
  text-align: left;
}

.fy-ui .fy-table th {
  position: sticky;
  top: 0;
  background: #f8fafc;
  color: var(--fy-color-heading);
  font-size: var(--fy-font-size-sm);
}

@media (max-width: 1320px) {
  .fy-ui .fy-metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 1040px) {
  .fy-ui .fy-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .fy-ui .fy-toolbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .fy-ui .fy-topbar {
    align-items: flex-start;
    flex-direction: column;
    padding-block: var(--fy-space-3);
  }
  .fy-ui .fy-metric-grid,
  .fy-ui .fy-card-grid,
  .fy-ui .fy-toolbar {
    grid-template-columns: 1fr;
  }
  .fy-ui .fy-button {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fy-ui *,
  .fy-ui *::before,
  .fy-ui *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

- [ ] **Step 2: Create fuyao-theme.ts**

Export a single dependency-free literal object whose groups and values mirror the CSS:

```typescript
export const fuyaoTheme = {
  color: {
    canvasStart: '#f2f7ff',
    canvas: '#fbfcff',
    surface: '#ffffff',
    heading: '#07172f',
    text: '#52647d',
    muted: '#94a3b8',
    line: '#e2e8f0',
    primary: '#2f7df6',
    primaryStrong: '#2563eb',
    accent: '#7552ff',
    accentSecondary: '#2ecdd3',
    success: '#16a34a',
    warning: '#f59e0b',
    danger: '#dc2626',
  },
  font: {
    sans: "'HarmonyOS Sans SC', 'MiSans', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei UI', system-ui, sans-serif",
    size: {
      xs: 10,
      sm: 12,
      compact: 13,
      body: 15,
      title: 18,
      section: 24,
      page: 34,
      display: 42,
      hero: 52,
    },
  },
  space: [0, 4, 6, 8, 10, 12, 14, 16, 18, 24, 28, 32],
  radius: { control: 6, comfortable: 8, panel: 12, feature: 20, pill: 999 },
  shadow: {
    soft: '0 10px 28px rgba(35, 52, 84, 0.06)',
    raised: '0 18px 48px rgba(35, 52, 84, 0.08)',
    floating: '0 24px 70px rgba(15, 23, 42, 0.18)',
    focus: '0 0 0 3px rgba(47, 125, 246, 0.18)',
  },
  motion: { fast: 160, standard: 180, easing: 'ease' },
  breakpoint: { compact: 640, medium: 1040, wide: 1320 },
  layout: { contentMax: 1320 },
} as const;

export type FuyaoTheme = typeof fuyaoTheme;
export type FuyaoColorToken = keyof typeof fuyaoTheme.color;
export type FuyaoDensity = 'relaxed' | 'standard' | 'compact';
```

- [ ] **Step 3: Create example.html**

Build one semantic, dependency-free page that links ./fuyao-theme.css and uses only generic content:

- header with nav links Overview, Library, Activity and one Create button;
- main landmark with a professional hero, one restrained gradient phrase, supporting copy, and four metric cards;
- search/filter toolbar with associated labels;
- three generic resource cards with title, owner, description, restrained tags, and primary/secondary actions;
- a compact Recent activity table inside a horizontally scrollable region;
- visible focus styles supplied in the CSS;
- no source-project entity, tab, role, route, or class name.

The page title must be Fuyao UI composition example. Use English generic copy so domain separation is obvious.

Use this complete document:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Fuyao UI composition example</title>
    <link rel="stylesheet" href="./fuyao-theme.css" />
  </head>
  <body class="fy-ui">
    <div class="fy-page">
      <header class="fy-shell fy-topbar">
        <nav class="fy-nav" aria-label="Primary navigation">
          <a class="fy-nav-link" href="#" aria-current="page">Overview</a>
          <a class="fy-nav-link" href="#">Library</a>
          <a class="fy-nav-link" href="#">Activity</a>
        </nav>
        <button class="fy-button fy-button--primary" type="button">Create resource</button>
      </header>

      <main class="fy-shell">
        <section class="fy-hero" aria-labelledby="page-title">
          <h1 id="page-title">
            Find reliable <span class="fy-gradient-text">shared resources</span> faster
          </h1>
          <p>
            A framework-neutral composition showing clear hierarchy, restrained product identity,
            and adaptable enterprise density.
          </p>
        </section>

        <section class="fy-metric-grid" aria-label="Summary metrics">
          <article class="fy-metric"><span>Available</span><strong>248</strong></article>
          <article class="fy-metric"><span>Contributors</span><strong>63</strong></article>
          <article class="fy-metric"><span>Active teams</span><strong>18</strong></article>
          <article class="fy-metric"><span>Updates this week</span><strong>31</strong></article>
        </section>

        <form class="fy-toolbar" role="search">
          <div class="fy-field">
            <label for="resource-search">Search</label>
            <input id="resource-search" type="search" placeholder="Name, owner, or purpose" />
          </div>
          <div class="fy-field">
            <label for="resource-type">Type</label>
            <select id="resource-type">
              <option>All types</option>
              <option>Template</option>
              <option>Guide</option>
            </select>
          </div>
          <div class="fy-field">
            <label for="resource-status">Status</label>
            <select id="resource-status">
              <option>Any status</option>
              <option>Ready</option>
              <option>Draft</option>
            </select>
          </div>
          <button class="fy-button fy-button--primary" type="submit">Search</button>
        </form>

        <section aria-labelledby="resource-heading">
          <h2 id="resource-heading" class="fy-section-title">Featured resources</h2>
          <div class="fy-card-grid">
            <article class="fy-card">
              <h2>Release checklist</h2>
              <p>Owner: Platform team</p>
              <p>A concise, reusable checklist for coordinating production releases.</p>
              <div class="fy-tags">
                <span class="fy-tag">Ready</span><span class="fy-tag">Operations</span>
              </div>
              <p><a class="fy-button" href="#">View details</a></p>
            </article>
            <article class="fy-card">
              <h2>Research brief</h2>
              <p>Owner: Insights team</p>
              <p>A structured starting point for documenting findings and open questions.</p>
              <div class="fy-tags">
                <span class="fy-tag">Updated</span><span class="fy-tag">Research</span>
              </div>
              <p><a class="fy-button" href="#">View details</a></p>
            </article>
            <article class="fy-card">
              <h2>Service map</h2>
              <p>Owner: Architecture group</p>
              <p>A maintained overview of service relationships and operational ownership.</p>
              <div class="fy-tags">
                <span class="fy-tag">Verified</span><span class="fy-tag">Architecture</span>
              </div>
              <p><a class="fy-button" href="#">View details</a></p>
            </article>
          </div>
        </section>

        <section aria-labelledby="activity-heading">
          <h2 id="activity-heading" class="fy-section-title">Recent activity</h2>
          <div
            class="fy-table-wrap"
            tabindex="0"
            aria-label="Recent activity, horizontally scrollable"
          >
            <table class="fy-table">
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Owner</th>
                  <th>Change</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Release checklist</td>
                  <td>Platform team</td>
                  <td>Version updated</td>
                  <td>Ready</td>
                  <td>Today</td>
                </tr>
                <tr>
                  <td>Research brief</td>
                  <td>Insights team</td>
                  <td>New evidence</td>
                  <td>Updated</td>
                  <td>Yesterday</td>
                </tr>
                <tr>
                  <td>Service map</td>
                  <td>Architecture group</td>
                  <td>Ownership confirmed</td>
                  <td>Verified</td>
                  <td>2 days ago</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  </body>
</html>
```

- [ ] **Step 4: Run the artifact test and TypeScript check**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/design-skillsquare-fuyao-ui.tests.ps1
node_modules\.bin\tsc.cmd --pretty false --noEmit --target ES2020 --module ESNext --skipLibCheck skills/design-skillsquare-fuyao-ui/assets/fuyao-theme.ts
```

Expected: artifact contract PASS and TypeScript exit code 0.

- [ ] **Step 5: Capture and inspect the example**

Run:

```powershell
node --input-type=module -e "import { chromium } from 'playwright'; import { pathToFileURL } from 'node:url'; import path from 'node:path'; const browser=await chromium.launch({channel:'chrome'}); const page=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'light'}); await page.goto(pathToFileURL(path.resolve('skills/design-skillsquare-fuyao-ui/assets/example.html')).href); await page.screenshot({path:path.join(process.env.TEMP,'design-skillsquare-fuyao-ui-example.png'),fullPage:true}); process.exit(0);"
```

Inspect the screenshot. Expected: readable first screen, restrained blue-purple identity, no clipped text, clear action hierarchy, three equal cards at 1440px, and a table whose overflow container does not widen the page.

- [ ] **Step 6: Commit the optional assets**

```powershell
git add -- skills/design-skillsquare-fuyao-ui/assets/fuyao-theme.css skills/design-skillsquare-fuyao-ui/assets/fuyao-theme.ts skills/design-skillsquare-fuyao-ui/assets/example.html
git commit -m "feat: add framework-neutral fuyao ui assets"
```

### Task 7: Run GREEN application tests and close observed gaps

**Files:**

- Modify: docs/superpowers/skill-tests/2026-08-28-design-skillsquare-fuyao-ui.md
- Modify only if evidence requires it: skills/design-skillsquare-fuyao-ui/SKILL.md
- Modify only if evidence requires it: skills/design-skillsquare-fuyao-ui/references/design-language.md
- Modify only if evidence requires it: skills/design-skillsquare-fuyao-ui/references/page-patterns.md
- Modify only if evidence requires it: skills/design-skillsquare-fuyao-ui/references/component-patterns.md

**Interfaces:**

- Consumes: the exact four prompts and rubric from Task 1 plus the complete skill.
- Produces: verbatim GREEN evidence, scores, and the smallest evidence-backed guidance corrections.

- [ ] **Step 1: Run four fresh GREEN evaluators**

Dispatch four fresh-context evaluators using these complete prompts:

```text
Use $design-skillsquare-fuyao-ui at skills/design-skillsquare-fuyao-ui to complete this request.

You are designing a new TypeScript frontend for browsing reusable internal resources. No framework or component library has been chosen. Create an implementation-ready visual direction covering layout, tokens, cards, search, filters, responsive behavior, and interaction states. Keep it professional and inviting without becoming a technology-showcase dashboard.
```

```text
Use $design-skillsquare-fuyao-ui at skills/design-skillsquare-fuyao-ui to complete this request.

An established TypeScript product uses React, Material UI, and an existing green brand palette with spacing and typography tokens. Restyle its administrative overview so it feels lighter, clearer, and more trustworthy. Do not replace Material UI, introduce global class overrides, or change the brand color. Explain the mapping to the existing theme.
```

```text
Use $design-skillsquare-fuyao-ui at skills/design-skillsquare-fuyao-ui to complete this request.

Design a TypeScript management screen containing advanced filters, a wide sortable table, bulk actions, inline validation, status labels, pagination, and a sticky operation column. It must remain scannable at 1440px and usable on narrow screens. Provide concrete sizing, state, overflow, and accessibility guidance.
```

```text
Use $design-skillsquare-fuyao-ui at skills/design-skillsquare-fuyao-ui to complete this request.

A source interface contains a selectable task queue, evidence summary, several comparison dimensions, an opinion editor, final actions, and history. Adapt that structure for an equipment-maintenance triage product. Reuse useful layout and interaction relationships, but do not retain the source product's entities, labels, role model, or workflow assumptions.
```

Provide only the relevant raw target context when a scenario calls for an existing theme. Do not provide the intended answer, rubric, RED observations, or proposed fixes.

- [ ] **Step 2: Score and record GREEN results**

Copy responses verbatim into GREEN verification and score all seven items. The required outcome is:

- every scenario scores at least 6/7;
- Scenario B preserves the existing green brand and Material UI;
- Scenario C defines sticky/overflow/narrow-screen behavior;
- Scenario D uses generic target terminology and does not import source workflow assumptions.

- [ ] **Step 3: Refactor using the evidence-to-file map**

For each failed criterion, make the smallest change:

| Failure                                                         | File to adjust                   |
| --------------------------------------------------------------- | -------------------------------- |
| Wrong trigger or skipped skill                                  | SKILL.md description             |
| Framework, brand, or component replacement                      | SKILL.md Adapt before applying   |
| Missing tokens, density, background, motion, or responsive rule | references/design-language.md    |
| Wrong page structure or copied business workflow                | references/page-patterns.md      |
| Missing states, overflow, focus, or action hierarchy            | references/component-patterns.md |

Do not add rationalization tables or pressure-language prohibitions; this is a pattern/reference skill. State the desired output shape positively.

- [ ] **Step 4: Re-run only failed scenarios, then the full GREEN set**

Expected: all four scenarios meet the threshold and scenario-specific requirements. Record the final results and the exact guidance changed in the Outcome section.

- [ ] **Step 5: Commit behavioral verification**

```powershell
git add -- docs/superpowers/skill-tests/2026-08-28-design-skillsquare-fuyao-ui.md skills/design-skillsquare-fuyao-ui
git commit -m "test: verify fuyao ui skill transfer"
```

### Task 8: Validate the finished skill and repository

**Files:**

- Verify: skills/design-skillsquare-fuyao-ui/**
- Verify: tests/design-skillsquare-fuyao-ui.tests.ps1
- Verify: docs/superpowers/skill-tests/2026-08-28-design-skillsquare-fuyao-ui.md

**Interfaces:**

- Consumes: all prior deliverables.
- Produces: validator output, clean build evidence, and a scoped final diff.

- [ ] **Step 1: Run the artifact and TypeScript checks**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/design-skillsquare-fuyao-ui.tests.ps1
node_modules\.bin\tsc.cmd --pretty false --noEmit --target ES2020 --module ESNext --skipLibCheck skills/design-skillsquare-fuyao-ui/assets/fuyao-theme.ts
```

Expected: PASS and exit code 0.

- [ ] **Step 2: Run the official quick validator**

The current system Python lacks PyYAML. Install only the validator dependency into a task-specific temporary directory, leaving the project and global Python unchanged:

```powershell
$validatorDeps = Join-Path $env:TEMP 'design-skillsquare-validator-pydeps'
python -m pip install --disable-pip-version-check --target $validatorDeps 'PyYAML==6.0.2'
$env:PYTHONPATH = $validatorDeps
python 'D:\Codex\home\skills\.system\skill-creator\scripts\quick_validate.py' 'skills/design-skillsquare-fuyao-ui'
```

If pip needs network access, request approval for that exact installation. Expected validator output: Skill is valid!

- [ ] **Step 3: Run project verification**

```powershell
npm.cmd run build
git diff --check
git status --short
```

Expected: Vite build exits 0; diff check is silent; status contains only intended plan/skill/test artifacts or is clean after commits.

- [ ] **Step 4: Audit business and framework coupling**

```powershell
$skillRoot = 'skills/design-skillsquare-fuyao-ui'
$text = Get-ChildItem -LiteralPath $skillRoot -Recurse -File |
  ForEach-Object { Get-Content -Raw -Encoding UTF8 $_.FullName } |
  Out-String
@('Skill 评审', 'Skill 规划', 'Harness 管理', '评审中心', 'skill-market-shell', 'planning-pageNum', 'UserMarketShell') |
  ForEach-Object { if ($text.Contains($_)) { throw "Forbidden coupling: $_" } }
@('must use React', 'must use Vue', 'requires Tailwind', 'requires Sass') |
  ForEach-Object { if ($text.Contains($_)) { throw "Framework coupling: $_" } }
```

Expected: no output and exit code 0.

- [ ] **Step 5: Review the final commit range**

```powershell
git log --oneline --decorate -10
git diff --stat 5991db9..HEAD
git diff --check 5991db9..HEAD
```

Confirm that current application files under src are untouched and every acceptance criterion in the spec maps to a verified artifact or behavior result.
