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

### Scenario A

Visual direction: a calm “library lounge” rather than an analytics dashboard. Use a warm-neutral base, one confident accent color, generous spacing, and strong typography contrast so the interface feels curated and trustworthy. The product should read as a place to discover and reuse resources, not monitor systems.

Core layout:

- Desktop uses a 12-column grid with a fixed top bar, a left filter rail, and a main browsing area.
- Top bar: product title on the left, centered or slightly left-weighted search, utility actions on the right.
- Main area: a short intro row with result count and active filter chips, then a card grid.
- Left rail: collapsible filter groups with checkboxes, pill toggles, and a “clear all” action pinned near the top.
- Mobile: stack into search first, horizontal filter chips second, then cards; move the full filter UI into a slide-over sheet.

Suggested design tokens:

```ts
export const tokens = {
  color: {
    bg: '#F6F3EE',
    surface: '#FFFDF9',
    surfaceAlt: '#F0EBE3',
    border: '#D8CFC2',
    text: '#1F1A14',
    textMuted: '#6B6257',
    accent: '#0F766E',
    accentHover: '#0B5E58',
    accentSoft: '#D9F0EC',
    success: '#2F6F4F',
    warning: '#A56A1C',
    danger: '#A14646',
    focus: '#1D4ED8',
  },
  radius: {
    sm: '10px',
    md: '16px',
    lg: '24px',
    pill: '999px',
  },
  space: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    '2xl': '32px',
    '3xl': '48px',
  },
  shadow: {
    card: '0 6px 20px rgba(31, 26, 20, 0.06)',
    hover: '0 10px 28px rgba(31, 26, 20, 0.10)',
  },
  type: {
    display: "'Fraunces', 'Georgia', serif",
    body: "'Source Sans 3', sans-serif",
    mono: "'IBM Plex Mono', monospace",
  },
};
```

Typography:

- Use a serif display face for page titles and section headings to make the catalog feel editorial.
- Use a humanist sans for everything interactive and body copy.
- Keep sizes restrained: 32/40 for page title, 18/28 for section title, 15/22 for body, 13/18 for metadata.

Card design:

- Cards should feel like resource “tiles” from a curated collection.
- Structure: title, short description, metadata row, optional tags, and a clear primary action.
- Optional thumbnail or icon area at the top, but keep it compact so text remains primary.
- Metadata examples: owner, last updated, type, popularity, internal team.
- Tags should use muted filled pills, not loud badges.
- Hover raises the card slightly, strengthens shadow, and reveals a secondary action like “Preview” or “Save.”
- Selected state uses accent border plus soft tinted background, not a heavy glow.

Search:

- Prominent search input in the header or hero row, around 480–640px wide on desktop.
- Include leading search icon, placeholder like “Search resources, teams, or tags”.
- Support inline recent searches and zero-state suggestions below the field on focus.
- Search results should visibly highlight matched terms in titles and descriptions with a soft marker color.

Filters:

- Organize into 4–6 predictable groups, such as Type, Team, Status, Format, Topic, Recently Updated.
- Use checkboxes for multi-select groups and pill toggles for quick filters like “Popular”, “New”, “Saved”.
- Active filters should appear as removable chips above results.
- Keep sorting lightweight and useful: Relevance, Recently Updated, Most Used, A–Z.

Responsive behavior:

- Desktop: 3–4 card columns depending on width.
- Tablet: filter rail collapses into a button; grid drops to 2 columns.
- Mobile: 1 column, sticky search, horizontally scrollable quick filters, full filters in bottom sheet.
- Preserve large tap targets: 44px minimum height for inputs, buttons, chips.

Interaction states:

- Hover: subtle lift, border darkens slightly, secondary metadata becomes more legible.
- Focus: high-contrast outline using `focus` token with 2px ring and offset.
- Pressed: reduce elevation and slightly darken filled surfaces.
- Disabled: lower contrast but keep readable; never rely on opacity alone for text.
- Empty state: show a warm illustration or icon with practical guidance and a “Clear filters” CTA.
- Loading: use skeleton cards with title and metadata bars; avoid spinners for the full page.
- Error: inline message near results with retry action, not a blocking modal.

A good mental model for implementation is: “editorial resource library with modern app ergonomics.” If you want, I can turn this into a concrete CSS variable file plus HTML structure next.

RED score: 6/7

Missing rubric items:

- Item 6: The response does not explain how long titles, descriptions, or tag rows should clamp, wrap, or recover when cards and chips overflow narrower grid widths.

### Scenario B

Use the existing MUI theme as the source of truth and change the admin overview through composition, spacing, surface treatment, and information hierarchy rather than new branding.

The direction:

- Make the page feel lighter by increasing whitespace, reducing heavy borders, and using more tinted surfaces instead of solid fills.
- Make it clearer by separating “summary”, “activity”, and “actions” into distinct visual layers.
- Make it feel more trustworthy by using restrained color, stable alignment, consistent card structure, and readable data emphasis.

Theme mapping:

- `theme.palette.primary` stays the green brand color and should be used sparingly for high-value signals only: active states, key KPIs, links, and positive status.
- `theme.palette.background.default` becomes the page canvas.
- `theme.palette.background.paper` remains the base for cards, but mix in very light green-tinted accents via `alpha(theme.palette.primary.main, 0.04-0.08)` for highlighted summary cards.
- `theme.spacing()` should drive all layout rhythm, ideally an 8px cadence: `2`, `3`, `4`, `6`.
- `theme.typography.h4/h5/h6`, `subtitle2`, and `body2` should define hierarchy instead of custom font styling.
- `theme.shape.borderRadius` can be slightly more visible on cards and panels if the product already supports it, but don’t invent a separate radius system.

Recommended layout:

- Top row: page title, short supporting description, right-aligned primary action.
- Second row: 3-4 KPI cards with one highlighted primary metric.
- Main content below in a 2-column grid:
  - Left: recent activity / performance charts / open issues
  - Right: approvals, alerts, shortcuts, or team tasks
- Keep one consistent card shell across the whole page.

MUI treatment:

- Wrap the page in a `Container maxWidth="xl"` or equivalent bounded shell.
- Use `Grid` with generous gaps, not divider-heavy sections.
- For cards, prefer:
  - soft border: `1px solid` using `theme.palette.divider`
  - low shadow or no shadow
  - padding `theme.spacing(3)` or `theme.spacing(4)`
- For emphasis, use background tint before using saturated green.
- Replace dense tables at the top level with compact summaries and defer detailed rows lower on the page.

Component styling pattern:

```tsx
<Card
  elevation={0}
  sx={(theme) => ({
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 3,
    backgroundColor: theme.palette.background.paper,
  })}
>
```

Primary KPI card:

```tsx
<Card
  elevation={0}
  sx={(theme) => ({
    border: `1px solid ${alpha(theme.palette.primary.main, 0.16)}`,
    background: `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${theme.palette.background.paper} 100%)`,
    borderRadius: 3,
  })}
>
```

Typography hierarchy:

- Title: `h4` or `h5`, medium weight
- Section headers: `h6`
- KPI number: large numeric style derived from `h4/h3`, not a custom font
- Labels and metadata: `subtitle2` or `body2` with `text.secondary`
- Avoid all-caps overload and avoid multiple font weights in the same card

Trust-building details:

- Show timestamps, statuses, and owners consistently.
- Use explicit labels like “Updated 2 hours ago” and “3 items need review”.
- Keep status chips subdued; reserve strong green for “healthy” or “on track”.
- Use iconography lightly and consistently, preferably outline icons.

What to avoid:

- Full-green card backgrounds
- Heavy shadows
- Dense border grids
- Competing accent colors
- Overuse of success/alert chips
- Custom CSS that bypasses theme tokens

If you want, I can turn this into a concrete React/MUI `OverviewPage.tsx` structure with `sx` props mapped directly to the existing theme.

RED score: 5/7

Missing rubric items:

- Item 1: The response does not state the target density mode for the administrative overview, so the reader is left to infer how compact or relaxed the page should feel.
- Item 4: It gives layout and theme guidance, but it does not define responsive rules or concrete interactive component states beyond the general note about active states.
- Item 6: It omits explicit focus treatment, long-text handling, scrolling behavior, and operation reachability guidance for narrower viewports or keyboard use.

### Scenario C

Build the screen around three persistent zones: a compact page header, a filter/action rail, and the data region. At 1440px, target a centered content width of 1360px with 24px page gutters, so the table can stay visually calm without feeling cramped. Use an 8px spacing scale, 14px body text, 12px metadata text, and 36px control heights. Keep the visual rhythm flat and disciplined: light row dividers, low-contrast borders, and strong alignment over decorative chrome.

Layout:

- Header: 64px tall. Left side has title and result count; right side has primary action plus export/import overflow menu.
- Filter bar: 2 rows max on desktop before collapsing secondary filters into “More filters”. Row 1 should contain search, status, owner, date range, and a reset link. Row 2 can hold tags, numeric range, and saved views.
- Bulk action bar: hidden until rows are selected, then appears pinned above the table header. Height 44px.
- Table region: fills remaining width; horizontal scrolling is allowed only inside the table viewport, not the whole page.

Recommended column sizing for a wide management table:

- Selection checkbox: 48px
- Name / primary entity: 240px min
- Secondary info: 180px
- Status: 120px
- Type/category: 140px
- Date created: 140px
- Updated by: 160px
- Numeric metric: 120px, right-aligned
- Validation/errors: 180px
- Operation column: 160px sticky right
- Total expected width: about 1488 to 1680px, which justifies an internal horizontal scroll container

Table behavior:

- Header stays sticky below the filter/bulk area.
- First column and operation column should be sticky if row identity is important; if only one sticky side is allowed, prioritize the operation column.
- Row height: 48px default, 64px when a row contains stacked metadata or validation help.
- Sorting should be single-column by default with clear ascending/descending icons and a tooltip or visible affordance for keyboard users.
- Hover should reveal row emphasis, not new layout shifts.

State model:

- Filters: dirty, applied, loading, empty
- Table: loading, populated, empty, error
- Rows: default, selected, editing, invalid, disabled
- Bulk actions: idle, enabled, processing, partial-success
- Pagination: default, loading next page, exhausted

Overflow guidance:

- Never truncate critical identifiers without a recovery path. For truncated cells, show ellipsis plus full value on focus/hover.
- Long text fields should clamp to one line in dense mode and two lines in relaxed mode.
- Keep inline actions inside the sticky operation column; collapse excess actions into a “More” menu after two visible buttons.
- On narrow screens, convert low-priority columns into expandable row details or a row drawer. Do not force users to pan through 10+ columns on mobile.

Responsive strategy:

- > = 1280px: full table with sticky header and sticky operation column
- 960px to 1279px: hide lowest-priority columns, keep horizontal scroll modest, move advanced filters into a slide-down panel
- 600px to 959px: switch to cardified rows or a two-column summary list with “View details” drawer; keep bulk selection and status visible
- < 600px: stack filters vertically, replace date-range inline inputs with modal/popup pickers, and make per-row actions bottom-sheet based

Inline validation:

- Validate at cell or row level depending on dependency scope.
- Use color plus icon plus text, never color alone.
- Show error text directly under the edited field inside the row when possible; reserve toast messages for save outcomes, not field errors.
- Invalid rows should get a subtle tinted background and an error count badge in the validation column.
- If bulk edit creates mixed validity, preserve edits and mark only affected cells.

Status labels:

- Use compact pills, 24px to 28px tall, with plain-language states like Active, Draft, Scheduled, Failed, Archived.
- Keep status color semantics stable across table, filters, and detail views.
- Include iconography only for exceptional states like Failed or Warning.

Pagination:

- Desktop: footer with page size, total count, page index, previous/next, and optional jump-to-page.
- Large datasets: prefer server-side pagination with stable sorting/filter query params.
- Consider sticky footer only if the table routinely exceeds one viewport height and bulk actions happen near the bottom.

Accessibility:

- Treat the table as a real data table, not a generic grid, unless spreadsheet-like cell navigation is required.
- Every sortable header must be keyboard reachable and expose sort state via `aria-sort`.
- Sticky columns need solid backgrounds and shadow separators so overlap remains legible at 200% zoom.
- Selection checkboxes need explicit labels, including “Select all rows on this page”.
- Validation errors should be associated to inputs with `aria-describedby`.
- Preserve visible focus rings in sticky cells, menus, and inline editors.
- Minimum hit target: 36px desktop, 44px touch.

A practical implementation pattern in TypeScript is:

- `ManagementPageState`: filters, sort, pagination, selectedRowIds, editingRowId, columnVisibility
- `FilterDraft` separate from `AppliedFilters`
- `TableRow` with `validation: { level: 'none' | 'warning' | 'error'; messages: string[] }`
- `ColumnDef<T>` including `width`, `minWidth`, `priority`, `sticky`, `sortable`, `cell`, `mobileBehavior`

If you want, I can turn this into a concrete React + TypeScript component structure next.

RED score: 6/7

Missing rubric items:

- Item 6: The response covers focus, long text, scrolling, status feedback, and reachability well, but it never gives an explicit contrast standard or token-level contrast guardrail for sticky surfaces, labels, and validation states.

### Scenario D

Design the maintenance-triage interface around one active asset case at a time, with the left side acting as a persistent work queue and the main canvas focused on diagnosis and disposition. The queue should list equipment incidents rather than abstract tasks: each row shows asset name, location, severity, downtime clock, reported symptom, and a compact status chip such as `Needs Review`, `Waiting on Parts`, or `Escalated`. Support filtering by plant, line, equipment type, severity, and SLA risk. Selecting a row loads the case without losing queue context, so supervisors can move quickly across incidents.

The main workspace should preserve the same “review then decide” rhythm, but translate it into maintenance language. Start with an asset summary band across the top: equipment ID, operational state, last service date, warranty/vendor status, and a downtime timer. Below that, use a two-column diagnostic area. The primary column contains a fault evidence summary: operator report, sensor anomalies, recent alarms, maintenance history, attached photos, and suggested likely causes. The secondary column compares remediation paths across several dimensions, for example `Safety risk`, `Production impact`, `Repair time`, `Parts availability`, `Skill required`, and `Estimated cost`. Each row in the comparison should let the triage user quickly contrast options like `Reset and monitor`, `Dispatch technician`, `Schedule planned repair`, `Shut down immediately`, or `Send to vendor`. Use color sparingly for urgency and safety, not as decorative emphasis.

Replace the opinion editor with a triage decision panel that feels operational and structured. It should let the user record the working diagnosis, confidence level, immediate containment steps, recommended action, required approvals, and handoff notes for the field team. Make this editable in place, with autosave and a visible draft state. Final actions should sit in a sticky footer or right rail: `Assign technician`, `Approve shutdown`, `Order parts`, `Schedule outage`, `Escalate to reliability engineer`, and `Close as false alarm`. Each action should preview downstream effects before commit, like notifying a team, creating a work order, or impacting the production schedule.

History should remain visible but shifted to maintenance chronology. Show a reverse-chronological timeline of prior breakdowns, inspections, parts replacements, technician notes, and escalation decisions for the same asset. Include quick jumps between “current case,” “similar past failures,” and “service record.” Interaction-wise, optimize for fast triage under pressure: keyboardable queue navigation, expandable evidence cards, side-by-side option comparison, and persistent context when moving between incidents. If this is headed for implementation, a clean component breakdown would be `IncidentQueue`, `AssetHeader`, `EvidenceSummary`, `RemediationComparisonTable`, `TriageDecisionEditor`, `ActionRail`, and `MaintenanceHistoryTimeline`.

RED score: 4/7

Missing rubric items:

- Item 2: The response does not preserve or propose any styling approach, design-token strategy, or component-library guidance, so it is not implementation-ready in the same way as the stronger scenarios.
- Item 4: It transfers structure clearly, but it does not define semantic tokens, responsive rules, or a concrete state model for the queue, comparison rows, editor, and actions.
- Item 6: It mentions draft state and keyboardable navigation, but it omits explicit focus treatment, contrast guidance, long-text behavior, and scrolling rules for the queue, comparison area, and history timeline.

## GREEN verification

Final fresh evidence uses round-one A/C and the post-correction B/D reruns. Each response body below is copied verbatim from its heading in `.superpowers/sdd/2026-08-28-design-skillsquare-fuyao-ui/final-green-results-raw.md`; scoring follows outside each body.

### Scenario A

Selected task mode: content discovery.

Target context supplied: a new TypeScript frontend for browsing reusable internal resources, with no framework or component library chosen. I inspected only the skill guidance at `E:\project\frontProject\fuyao-skill-market\.worktrees\design-skillsquare-fuyao-ui\skills\design-skillsquare-fuyao-ui\SKILL.md` plus `references/design-language.md`, `references/page-patterns.md`, and `references/component-patterns.md`. That evidence verifies the intended hierarchy: discovery-first layout, relaxed density, strong search and lightweight filters above a browsable card grid, restrained identity treatment, semantic token roles, subtle motion, and accessibility-first state handling. Framework, tokens already in use, existing components, routes, permissions, and business rules remain unknown.

Visual direction: professional and inviting, closer to a polished internal resource library than a dashboard. Use a bright neutral canvas with a faint cool tint at the top, one restrained corner glow, and mostly flat white surfaces with crisp borders. Identity should come from typography, spacing, and one controlled blue accent rather than heavy gradients or glass. The page should feel calm, searchable, and trustworthy.

Layout:

- Top bar: 56px high, white or translucent-white after scroll, left-aligned product title, center or left primary nav if needed, right utility actions.
- Page shell: max content width `1280-1440px`, horizontal padding `24px` desktop, `16px` tablet/mobile.
- First screen order: title/value statement, primary search, filter row, result summary, first card rows.
- Main content: two-column at large sizes only if filters need persistence; otherwise keep filters inline above results. Avoid a permanent analytics sidebar.
- Card grid: `4` columns at `>=1440px`, `3` at `>=1100px`, `2` at `>=720px`, `1` below that.

Token model:

- `--canvas-start: #f2f7ff`
- `--canvas: #fbfcff`
- `--canvas-end: #ffffff`
- `--surface: #ffffff`
- `--surface-muted: #f8fafc`
- `--text-heading: #07172f`
- `--text-body: #52647d`
- `--text-secondary: #667085`
- `--text-muted: #94a3b8`
- `--line: #e2e8f0`
- `--primary: #2f7df6`
- `--primary-strong: #2563eb`
- `--on-primary: #ffffff`
- `--success: #16a34a`
- `--warning: #f59e0b`
- `--danger: #dc2626`
- `--focus: #2f7df6`
- Radius: controls `8px`, cards `12px`, metric/promo surfaces `20px`, pills `999px`.
- Spacing scale: `4, 8, 12, 16, 24, 32`.
- Control heights: `44px` primary search/actions, `36-40px` standard filters, `32px` compact secondary controls.

Typography:

- Prefer the target brand font if one is later chosen; otherwise use a modern sans stack suitable for English and Chinese content.
- Hero/page title `36-40px / 600-700`.
- Section title `22-24px / 600`.
- Card title `16-18px / 600`.
- Body `14px / 400-500`.
- Metadata `12-13px / 500`.
- Use color sparingly; rely on weight and spacing for hierarchy.

Search and filters:

- Search is the dominant control: full-width on mobile, `480-640px` on desktop, with placeholder text like “Search by name, owner, tag, or use case”.
- Support quick filters as low-saturation pills or segmented chips for high-value dimensions only: type, team/owner, status, maturity, access level.
- Place advanced filters in a collapsible drawer or popover, not permanently expanded.
- Show active filters as removable pills under the control row.
- Result summary line should show count, sort, and a clear “Reset filters” action when scoped.

Card design:

- Card padding `16-18px`, border `1px solid var(--line)`, minimal or no shadow by default.
- Structure: title, one-line purpose, provenance/owner row, quality signals, tags, primary action.
- Title can wrap to 2 lines; description clamps to 2-3 lines.
- Provenance row should carry the trust signal: owner, last updated, usage count, or verification badge.
- Limit visible tags to `2-3`; overflow becomes `+N`.
- Primary action sits at the bottom and remains visually singular. Secondary actions stay quiet or move into a menu.
- Optional small icon tile may use a very subtle blue tint, but the text should remain the main signal.

Recommended card fields:

- Name
- Short purpose
- Resource type
- Owner/team
- Last updated
- Trust or quality marker
- Tags/use cases
- Primary action: `Open`, `View details`, or `Use resource`

Interaction states:

- Hover: border darkens slightly, surface tint shifts, max `1px` upward lift.
- Selected/active: stronger border plus subtle inset or background cue, not color alone.
- Focus-visible: solid `2px` outline with `2px` offset on every interactive element.
- Disabled: muted visuals plus short explanation if the reason is not obvious.
- Loading: preserve card and control geometry with skeletons; no layout jump.
- Empty: explain whether there is no data or no match, then offer clear recovery.
- Error: local inline feedback near the affected region with retry.
- Reduced motion: remove lift and animated glow, keep state changes through contrast/border.

Responsive behavior:

- On tablet and mobile, stack title, search, and filters in that order.
- Turn filter groups into horizontally scrollable chips plus an “All filters” drawer.
- Keep result count and sort visible above the grid.
- Cards become single-column and maintain full-width primary actions.
- If a detail panel is later added, collapse to list -> detail -> action sequence with a clear back path.

Accessibility and content safety:

- All body and metadata text that users must read should meet `4.5:1` contrast.
- Large headings and meaningful boundaries should meet `3:1`.
- Do not rely on color alone for status, selection, or verification.
- Long titles and multilingual text must wrap cleanly without pushing actions off-card.
- Keyboard users must be able to traverse search, filters, sort, grid, and pagination/load-more in a predictable order.

Implementation-ready page recipe:

1. `AppShell`
2. `TopNav`
3. `DiscoveryHeader` with title, short supportive description, dominant search
4. `FilterBar` with quick chips, sort, advanced-filter trigger
5. `ResultMeta` with count and active filter pills
6. `ResourceGrid`
7. `ResourceCard`
8. `EmptyState` / `ErrorState` / `LoadingGrid`
9. Optional `Pagination` or `LoadMore`

Unknown and therefore conditional:

- Framework choice: React, Vue, Svelte, or others unknown.
- Styling approach: CSS modules, Tailwind, CSS-in-JS, or design tokens pipeline unknown.
- Existing token system unknown, so these roles should map into any later theme layer rather than become hardcoded.
- Existing routing, permissions, access control, and business taxonomy unknown, so card fields and filters should remain configurable.
- Existing detail-page pattern unknown, so “Open” versus inline preview should stay reversible.

If this direction is implemented faithfully, the result should feel like a curated internal library: easy to trust, easy to scan, and efficient to use without slipping into a metrics-heavy dashboard aesthetic.

GREEN score: 7/7

Rubric check:

- Item 1: Pass — identifies content discovery and relaxed density.
- Item 2: Pass — labels the absent framework, styling, tokens, components, routes, permissions, and business rules as unknown and keeps mappings conditional.
- Item 3: Pass — establishes hierarchy, search/filter relationships, and card composition before decoration.
- Item 4: Pass — supplies semantic roles, dimensions, states, and responsive rules.
- Item 5: Pass — keeps glows, gradients, shadows, and motion restrained.
- Item 6: Pass — covers 4.5:1/3:1 contrast, solid focus, long-text wrapping/clamping, overflow, feedback states, and reachable actions.
- Item 7: Pass — imports no source-domain terminology or workflow assumptions.

Missing rubric items:

- None.

Comparison to RED:

- Improved from 6/7 to 7/7 by retaining long-text/overflow recovery and adding explicit contrast plus accurate unknown-context handling.

Incomplete-context check:

- Pass — supplied and inspected evidence is distinguished from unknown target conventions, which remain conditional and reversible.

### Scenario B

Selected task mode: configuration and relationships overview with data-management secondary density.

Target context supplied: an established TypeScript administrative overview built with React, Material UI, and an existing green brand palette plus spacing and typography tokens. The goal is to make it feel lighter, clearer, and more trustworthy without replacing Material UI, changing the brand color, or introducing global class overrides.

What I inspected and what that verifies: I inspected the `design-skillsquare-fuyao-ui` skill plus its `design-language.md`, `page-patterns.md`, and `component-patterns.md` references. That verifies the intended visual language: lightweight enterprise surfaces, restrained decoration, clear hierarchy, compact-to-standard density, semantic role mapping into an existing theme, one primary action per task region, and accessibility-first states. Uninspected and therefore unknown: the product’s exact MUI theme object, token names, component wrappers, routes, permissions, business rules, and the current overview layout.

Restyle direction:
Use a quieter canvas, whiter working surfaces, stronger text hierarchy, and tighter grouping instead of adding more color. The page should read as: page title and context, concise status/actions, filter bar, key metrics, primary table or queue, then secondary panels such as alerts, recent activity, or pending approvals. Let the overview feel open by increasing separation between groups, not by inflating every spacing value.

Map the existing green brand into semantic roles instead of repainting the whole screen:

- `primary.main`: keep the existing green as the single brand accent for selected states, focused highlights, and primary actions.
- `primary.dark` or the nearest darker green token: use for filled primary buttons where white text must meet contrast.
- `background.default`: use the lightest existing neutral or a very subtle green-tinted neutral if the theme already supports it.
- `background.paper`: use plain white or the theme’s standard paper for cards, filter trays, and tables.
- `text.primary`: use the darkest existing heading/body neutral.
- `text.secondary`: use the readable secondary token, not a low-contrast muted gray.
- `divider`: use the existing border token for all structural separation.
- `success`, `warning`, `error`: keep semantic statuses separate from the brand green so “healthy” and “primary” do not blur together.

Material UI composition:

- Keep the page in `Container` or the existing content shell, with a `Stack`-based vertical rhythm.
- Build each functional region with `Card` or `Paper`, but keep them mostly flat: 1px borders, minimal shadow, slightly larger radius only for KPI cards.
- Use `Tabs`, segmented filters, or compact chips only where they clarify scope; avoid colorful pills everywhere.
- Use `Table`/`DataGrid` in compact density for row-heavy admin content, with sticky headers if the current product already supports them.
- Use `Button` emphasis sparingly: one filled green primary action per region, all other actions as `outlined` or quiet `text` buttons.
- Prefer `Alert` or inline helper text for state feedback instead of decorative banners.

Hierarchy and spacing:

- Header region: standard density, with the title, one-line operational summary, and 1 to 2 highest-priority actions.
- Filters: compact controls grouped in a single surface directly above the main data region.
- Metrics: 3 to 4 cards max in the first row, emphasizing label then number; any icon tile should be subtle and low saturation.
- Main content: one dominant operational block, usually the table or master-detail area.
- Secondary content: smaller cards for exceptions, reminders, or recent changes.
- Use the existing spacing token scale, aiming for roughly 24 to 32px between major sections, 12 to 16px inside ordinary cards, and 8 to 12px inside dense toolbars and tables.

Typography mapping:

- Reuse the existing type family and token weights.
- Make trust come from type contrast, not color contrast: stronger page title, crisp section titles, readable body copy, and clearly secondary metadata.
- If the theme has variants like `h4`, `h5`, `subtitle2`, `body2`, prefer those over custom font sizing.
- Keep metrics visually calm: large numeric values, smaller labels, limited supporting text.

State and interaction rules:

- Selected nav/filter states should use green plus a non-color cue such as underline, border, or weight change.
- Hover should be restrained: small border/surface shift, no dramatic lift.
- Dense areas like tables and forms should stay mostly flat.
- Loading, empty, error, and disabled states should be inline and local to the affected region.
- Long labels, counts, and organization names should wrap or clamp before pushing actions off-screen.

Accessibility and resilience:

- Normal and small text, including metadata and helper text, should meet 4.5:1 contrast in the rendered green theme.
- Large text and meaningful boundaries such as selected tabs, input borders, and focus outlines should meet 3:1.
- Every interactive element should keep a solid 2px focus outline with a 2px offset; forced-colors mode must not rely on shadows or tinted fills.
- Filters should wrap by group on narrow widths; wide tables should scroll horizontally with key actions kept reachable.
- Empty, unauthorized, and error states should explain the condition and preserve the next valid action.
- Reduced-motion mode should remove nonessential fades/lifts while keeping selection, focus, and status clear.

GREEN score: 7/7

Rubric check:

- Item 1: Pass — identifies a configuration/relationships overview with data-management secondary density and a compact-to-standard split.
- Item 2: Pass — explicitly preserves React, Material UI, the green brand, and existing spacing/typography tokens without global class overrides.
- Item 3: Pass — leads with hierarchy, grouping, quiet surfaces, and spacing before decorative accents.
- Item 4: Pass — provides executable semantic mapping, MUI composition, dimensions, states, and responsive behavior.
- Item 5: Pass — keeps brand color, shadow, motion, chips, and icon treatment restrained.
- Item 6: Pass — explicitly covers 4.5:1/3:1 contrast, solid offset focus and forced colors, long-text wrapping/clamping, horizontal overflow, regional feedback states, and reachable actions.
- Item 7: Pass — imports no source-domain terminology or workflow assumptions.

Missing rubric items:

- None.

Comparison to fresh round 1:

- Improved from 6/7 to 7/7 by closing the mandatory Item 6 gap with explicit contrast and long-text resilience while preserving the React/MUI/green/token contract.

Scenario-specific check:

- Pass — React, Material UI, the existing green brand, and existing spacing/typography tokens remain the source of truth.

### Scenario C

Selected task mode: data management.

Target context supplied: only the Fuyao UI skill package. I inspected `SKILL.md`, `references/design-language.md`, `references/page-patterns.md`, and `references/component-patterns.md`. That verifies these conventions: compact density for row-heavy work, filters above results, sticky table headers, selection-linked bulk actions, deliberate horizontal overflow, reachable row operations, restrained decoration, semantic status colors, and explicit narrow-screen reflow.

Unknown and therefore conditional: framework, design tokens, component library, routes, permissions, backend capabilities, exact business fields, and validation rules.

Use a compact management layout with four vertical bands:

1. Page header, `72px` tall on desktop, `auto` on small screens. Left side has title plus a one-line result description; right side has one primary action and up to two secondary actions. Header content wraps below `960px`.
2. Filter panel in a surface card with `16px` padding desktop, `12px` mobile. Use a 12-column grid at `>=1280px`, 6 columns at `768-1279px`, and single column below `768px`. Keep common filters visible and advanced filters collapsible.
3. Result toolbar, `44px` tall desktop, sticky under the page header if the page scrolls. Left side shows selection count and bulk actions; right side shows column settings, density toggle, export, and total count.
4. Table region filling the remaining height with its own horizontal scroll.

Recommended filter layout:

- Search input: `minmax(280px, 2fr)`, compact `36px` height, leading icon, clear button.
- Status multi-select: `180-220px`.
- Owner / category / region selects: `160-200px` each.
- Date range: two controls or one range picker, `240-280px`.
- Advanced section: tags, numeric ranges, validation state, created/updated by.
- Action row: `Reset`, `Apply filters`, optional `Save view`. Keep one primary button only.

For the wide table, design around `min-width: 1480-1680px` so it stays scannable at `1440px` through horizontal scroll rather than over-compression. Use dense text `12-13px`, row height `44px`, header height `40px`, cell padding `10px 12px`. Suggested columns:

- Selection checkbox, `48px`, sticky left
- Name / identifier, `260px`, sticky left
- Status, `120px`
- Validation state, `140px`
- Owner, `160px`
- Type, `140px`
- Updated time, `168px`
- Source / channel, `160px`
- Notes / summary, `240px`
- Metrics or amount, `140px`, right aligned
- Operation column, `180-220px`, sticky right

Sticky behavior:

- Header row sticks to top of the table container.
- First one or two identity columns may stick left if row recognition matters.
- Operation column must stick right with an opaque background, left border, and slight shadow so it remains visually separated during horizontal scroll.
- Keep `z-index` tiers explicit: body cells `1`, sticky cells `2`, sticky header `3`, sticky header + sticky sides `4`.

Sorting and overflow:

- Sortable headers need a full-button hit area, not icon-only triggers.
- Default sort indicator should combine icon plus `aria-sort`.
- Long text in dense cells should truncate with tooltip only for secondary content; primary identifiers should wrap to two lines max if needed.
- Numeric columns should not wrap.
- Table container should expose both vertical and horizontal scrollbars when needed; avoid nested scrolling inside cells.

Bulk actions:

- Hidden when nothing is selected.
- On selection, replace passive summary with an action bar showing count and actions like `Change status`, `Assign owner`, `Export selected`, `Delete`.
- Dangerous bulk actions require confirmation and should remain visually separated.
- Keep bulk bar sticky if the table region is tall.

Inline validation:

- Support row-level edits without opening a modal for every field.
- Use cell states: default, editing, valid, invalid, saving, saved, server error.
- Invalid cells need a `2px` border or outline plus an adjacent message region. Do not rely on red text alone.
- Prefer inline help below the edited row or in an expandable validation rail, not floating tooltips for critical errors.
- If a row has multiple invalid fields, show a row summary badge like `3 issues` linked to the first invalid cell.

Status labels:

- Use low-saturation pills, `20-24px` tall, horizontal padding `8-10px`.
- Keep semantics stable:
  - Active / success: green-tinted surface
  - Pending / in review: amber-tinted surface
  - Error / blocked: red-tinted surface
  - Draft / paused / archived: neutral muted surface
- Include icon or text difference for important states; do not encode meaning with color alone.

Pagination:

- Desktop: footer with total count, page size, current range, first/prev/next/last.
- Mobile and narrow tablet: simplify to `Previous`, `Next`, current page, page size in an overflow menu.
- Footer height `48px`, sticky only if the table body is very tall and users need constant paging access.

Responsive behavior:

- `>=1440px`: full layout, sticky left identity columns and sticky right operations.
- `1024-1439px`: filters wrap to two rows, optional columns collapse into a column chooser, operation column remains sticky.
- `768-1023px`: convert filters to stacked groups, reduce visible columns to identity, status, owner, updated, operations; secondary columns move to row expansion.
- `<768px`: switch from full table to card-like stacked rows or horizontally scrollable simplified table. Keep selection, primary identity, status, and main action visible first. Row expansion should reveal hidden fields and inline validation details.

Accessibility guidance:

- Body and metadata text must maintain `4.5:1` contrast; focus boundaries and large labels at least `3:1`.
- Every interactive element needs a solid `2px` focus outline with `2px` offset, including sticky cells and row actions.
- Use `aria-sort`, `aria-invalid`, `aria-describedby`, and live regions for save/error feedback.
- Checkbox selection needs clear header labeling and an indeterminate state.
- Keyboard order should move through filters, bulk bar, headers, then row controls without trapping inside sticky regions.
- In forced-colors mode, do not depend on shadows, gradients, or tinted pills to communicate state.

TypeScript state model guidance:

- Keep separate state slices for `filters`, `draftFilters`, `sort`, `pagination`, `selection`, `columnVisibility`, `editingCells`, `validation`, and `loading`.
- Use stable row IDs for selection and inline edit reconciliation.
- Store validation by `{rowId, field}` so errors survive sorting, paging, and refetching.
- Treat sticky column widths as constants or tokenized layout config, not ad hoc inline values.

A practical screen width target is a centered page container of `min(100%, 1600px)` with `24px` desktop gutters and `12-16px` mobile gutters. That keeps the workspace readable at `1440px` while preserving enough width for a serious operations table.

GREEN score: 7/7

Rubric check:

- Item 1: Pass — identifies data management with compact density.
- Item 2: Pass — labels framework, tokens, components, routes, permissions, backend capabilities, fields, and validation rules as unknown and conditional.
- Item 3: Pass — begins with structural bands and workspace relationships before visual treatment.
- Item 4: Pass — gives sizing, states, sticky layering, overflow, pagination, and responsive rules.
- Item 5: Pass — keeps decoration restrained and status treatment semantic.
- Item 6: Pass — covers 4.5:1/3:1 contrast, solid offset focus and forced colors, long text, sticky/horizontal overflow, feedback, and reachable actions.
- Item 7: Pass — remains business-neutral and imports no source workflow assumptions.

Missing rubric items:

- None.

Comparison to RED:

- Improved from 6/7 to 7/7 by retaining sticky/overflow/narrow behavior and adding contrast plus accurate unknown-context handling.

Scenario-specific check:

- Pass — sticky headers/identity/operation columns, internal overflow, and narrow-screen reduction/expansion are explicit.

### Scenario D

Selected task mode: Decision support with compact data-management support.

Target context supplied: a source interface structure with a selectable task queue, evidence summary, comparison dimensions, opinion editor, final actions, and history, to be adapted for an equipment-maintenance triage product.

What I inspected: the `design-skillsquare-fuyao-ui` skill, plus `references/design-language.md`, `references/page-patterns.md`, and `references/component-patterns.md`.

Conventions this verifies: a professional/lightweight enterprise visual language, stable master-detail decision-support layout, standard-to-compact density, one primary action per task region, explicit state handling, and responsive preservation of context plus actions.

Unknown and therefore conditional: target framework, tokens, component library, routes, permissions, business rules, device classes, and existing maintenance terminology. The direction below stays reversible and maps to semantic roles rather than assuming specific implementation APIs.

Use a stable two-pane triage page for maintenance coordinators or reliability staff:

- Left pane: “Incoming Cases” queue, 320-380px wide on desktop, compact density.
- Right pane: active case workspace, min width 0, standard density with compact subregions.
- Top bar inside workspace: asset identity, current condition status, elapsed downtime, site/location, assigned owner, and local actions.
- Body order: evidence summary, comparison dimensions, triage notes/editor, disposition actions, history log.

Map the source relationships into maintenance triage semantics like this:

- Selectable task queue -> maintenance incident queue with filters for severity, site, asset class, downtime risk, assignment, and report age.
- Evidence summary -> incident snapshot with sensor alerts, operator report, last service, open work orders, recent failures, and safety flags.
- Comparison dimensions -> triage dimensions such as safety impact, production impact, likelihood of escalation, repair complexity, parts availability, and confidence.
- Opinion editor -> triage assessment editor with structured fields plus freeform notes.
- Final actions -> disposition panel for dispatch technician, schedule repair, request inspection, monitor remotely, hold for parts, or close as duplicate/no issue.
- History -> chronological event log of reports, inspections, status changes, decisions, and handoffs.

Semantic hierarchy and layout:

- Page header: restrained, 72-96px total height including breadcrumbs if present. Primary text uses heading role; metadata uses readable-muted role.
- Queue header: title, live count, search, and compact filter chips. Keep result count and sort visible.
- Queue rows: asset name first, then issue summary, severity badge, site, reported time, and downtime/safety signal. Row height 72-88px. Selected row uses line emphasis plus left accent bar, not color alone.
- Workspace header: asset name and equipment ID dominant; status badge, site, owner, and “time since reported” secondary. Primary action should not live here unless it applies to the entire case.
- Evidence summary: first card row, 2-4 cards or grouped strips. Prioritize “Current signals,” “Operational context,” “Recent maintenance,” and “Blocking constraints.”
- Comparison dimensions: grid of scored dimensions with labels above values. Use 2 columns desktop, 1 column tablet/mobile. Each dimension can show score, rationale snippet, and confidence.
- Assessment editor: the largest writable region. Suggested fields are triage category, likely cause, recommended next step, urgency target, required skill/team, and notes.
- Final actions: sticky footer or sticky side panel inside the workspace region. One primary action only, with secondary and destructive actions visually subordinate.
- History: below actions on desktop if space allows, otherwise separate lower section/tab. Each entry shows actor, event, timestamp, and optional linked artifact.

Recommended regions and dimensions:

- Desktop >= 1280px: queue 340px, content split into main column plus optional 280-320px side rail for actions/history summary.
- Tablet 768-1279px: queue 300px, detail single column with sticky actions.
- Narrow < 768px: explicit sequence is queue -> case summary -> evidence -> dimensions -> editor -> actions -> history, with a persistent back-to-queue control.

Component and state guidance:

- Queue table/list: compact controls 32-36px high; sticky filter row if the list is long; loading skeletons preserve row height; empty states distinguish “no incidents” from “no matches.”
- Severity/status badges: low-saturation surfaces with stable semantics.
  - Critical: danger
  - At risk: warning
  - Stable/monitoring: primary or muted-surface emphasis
  - Resolved/closed: success
- Evidence cards: 8-12px radius, 1px line border, minimal shadow. Use icon tiles only for one or two high-signal metrics, not every fact.
- Dimension blocks: each block should support `default`, `selected/focused`, `unavailable`, and `loading`. Show text labels for score meaning; do not rely on color bands alone.
- Editor controls: labels above inputs, help text adjacent, validation inline. Structured selects and segmented controls are better than unconstrained prose for key triage decisions.
- Final actions: one primary action based on current triage state, such as `Dispatch now` or `Schedule repair`. Secondary actions like `Request more data` and `Reassign` should be outline or quiet-surface buttons.
- History log: vertical timeline or grouped list with clear date separators and expandable long notes.

Token-role mapping to carry the visual language without copying the source domain:

- Canvas: very light neutral or cool-tinted background.
- Surface: white/near-white work panels.
- Muted surface: filter bars, table headers, passive chips.
- Heading: deep high-contrast ink.
- Text: standard body copy.
- Readable muted: metadata, timestamps, helper text.
- Line: structural separators between queue, cards, and form sections.
- Primary: current selection, focus, and the single primary action.
- Success/warning/danger: status semantics only.

Density and spacing:

- Queue/filter/action surfaces: compact.
- Detail reading/editor regions: standard.
- Use 8, 12, 16, 24px spacing steps.
- Control heights: 32-36px compact, 38-44px standard.
- Section gaps: 16px between major regions, 8-12px within card internals.

Interaction model:

- Preserve current case context while scrolling; queue selection should remain visible on desktop.
- Changing case selection with unsaved editor content should trigger a lightweight unsaved-changes confirmation.
- Bulk queue actions are allowed only if they are truly batch-safe, such as assign owner or change priority; avoid batch-close or batch-dispatch without explicit confirmation.
- Disabled actions should explain why, for example missing fault code, no technician coverage, or awaiting parts confirmation.
- Use 160-180ms transitions for hover, border, and opacity only; avoid decorative motion in dense operational regions.

Suggested information architecture labels for the adapted product:

- Queue: `Incoming Cases`
- Evidence summary: `Situation`
- Comparison dimensions: `Triage Factors`
- Opinion editor: `Assessment`
- Final actions: `Disposition`
- History: `Timeline`

Accessibility and resilience:

- Ensure 4.5:1 contrast for all normal and small text, including metadata, helper text, and timestamps; ensure 3:1 contrast for large text and meaningful boundaries such as selected rows, panel dividers, and focus indicators.
- Provide a solid 2px focus outline with 2px offset for every interactive element; in forced-colors mode, keep the outline as a system color and do not depend on shadows or gradients.
- Wrap or clamp long asset names, issue summaries, and notes without hiding the only route to the primary action; preserve readable expansion for logs and evidence text.
- Keep queue and tables horizontally safe with deliberate overflow handling, sticky critical columns only when justified, and reachable row actions at all widths.
- Support loading, empty, error, disabled, and unauthorized states per region, with recovery guidance adjacent to the affected region.
- On narrow screens, do not hide evidence or disposition controls; reorder them into a documented sequence with a persistent route back to the queue.

GREEN score: 7/7

Rubric check:

- Item 1: Pass — identifies decision support with compact data-management support and the correct queue/detail density split.
- Item 2: Pass — labels framework, tokens, component library, routes, permissions, business rules, devices, and existing terminology as unknown and keeps mappings conditional.
- Item 3: Pass — establishes master-detail hierarchy and information relationships before styling.
- Item 4: Pass — provides concrete sizing, semantic roles, component states, responsive sequencing, and interaction behavior.
- Item 5: Pass — keeps color, surfaces, shadow, icon tiles, and motion restrained.
- Item 6: Pass — explicitly covers 4.5:1/3:1 contrast, solid offset focus and forced colors, long-text wrapping/clamping/recovery, deliberate overflow, regional feedback states, and action reachability at all widths.
- Item 7: Pass — transfers only source relationships into equipment-maintenance terminology without importing source entities, role models, or workflow rules.

Missing rubric items:

- None.

Comparison to fresh round 1:

- Improved from 6/7 to 7/7 by closing the mandatory Item 6 contrast/long-text gap while retaining accurate unknown-context handling and target-domain structural transfer.

Scenario-specific check:

- Pass — the response preserves the useful queue/evidence/comparison/editor/actions/history skeleton without source workflow assumptions.

## Outcome

Final fresh GREEN scores are A `7/7`, B `7/7`, C `7/7`, and D `7/7`. Every scenario meets the aggregate `>=6/7` threshold and passes mandatory rubric Item 6.

Scenario B preserves React, Material UI, the existing green brand, and existing spacing/typography tokens. Scenarios C and D distinguish supplied facts from unknown target framework, token, component, route, permission, and business conventions; their recommendations remain conditional and reversible. Scenario C retains sticky-header/operation-column, horizontal-overflow, and narrow-screen behavior. Scenario D transfers the queue/evidence/comparison/editor/actions/history structure into equipment-maintenance triage without source workflow assumptions.

The single evidence-backed output-contract correction is validated by the fresh B/D reruns: both now include explicit contrast thresholds, focus and forced-colors behavior, long-text resilience, overflow, status feedback, and operation reachability. No further guidance change is justified.
