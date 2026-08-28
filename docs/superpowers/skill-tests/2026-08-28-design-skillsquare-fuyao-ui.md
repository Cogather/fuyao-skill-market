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
    bg: "#F6F3EE",
    surface: "#FFFDF9",
    surfaceAlt: "#F0EBE3",
    border: "#D8CFC2",
    text: "#1F1A14",
    textMuted: "#6B6257",
    accent: "#0F766E",
    accentHover: "#0B5E58",
    accentSoft: "#D9F0EC",
    success: "#2F6F4F",
    warning: "#A56A1C",
    danger: "#A14646",
    focus: "#1D4ED8"
  },
  radius: {
    sm: "10px",
    md: "16px",
    lg: "24px",
    pill: "999px"
  },
  space: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "24px",
    "2xl": "32px",
    "3xl": "48px"
  },
  shadow: {
    card: "0 6px 20px rgba(31, 26, 20, 0.06)",
    hover: "0 10px 28px rgba(31, 26, 20, 0.10)"
  },
  type: {
    display: "'Fraunces', 'Georgia', serif",
    body: "'Source Sans 3', sans-serif",
    mono: "'IBM Plex Mono', monospace"
  }
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
- >= 1280px: full table with sticky header and sticky operation column
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

Pending. Task 1 intentionally keeps `skills/design-skillsquare-fuyao-ui` absent, so there is no GREEN run yet and the artifact contract must continue failing on the missing directory check.

## Outcome

The RED baseline is strongest when the evaluator is pushed toward explicit layout mechanics and weakest when the prompt depends on preserving an existing theme contract or translating structure without a token/state system. Across the four responses, the recurring omissions are incomplete density-mode callouts, incomplete accessibility coverage at the contrast/overflow level, and missing implementation detail for framework-preserving or cross-domain cases.

Task 1 adds a dependency-free artifact contract that will force later GREEN work to supply the missing skill package structure, routing references, theme assets, and business-decoupling safeguards. No GREEN gaps were evaluated yet because the skill directory remains intentionally absent in this RED task, and no product refactors were made.
