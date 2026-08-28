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

### Scenario A

Selected task mode: content discovery with standard-density support for deeper filtering. Preserve framework-neutral TypeScript patterns, plain semantic HTML roles, accessible keyboard behavior, and a professional internal-tool tone rather than a consumer or analytics-dashboard look.

Visual direction:
Use a light canvas with subtle depth: `canvas` `#F8FAFD`, `canvas-accent` `linear-gradient(180deg, #F5F8FF 0%, #FBFCFF 28%, #F8FAFD 100%)`, `surface` `#FFFFFF`, `surface-muted` `#F3F6FA`, `border` `#DCE4EE`, `text-strong` `#10233D`, `text` `#51657D`, `text-muted` `#7F92AA`, `primary` `#2C78F4`, `primary-hover` `#1F67DC`, `focus` `#8AB4FF`, `success` `#1E9B57`, `warning` `#D9901A`, `danger` `#D64545`. Keep any accent gradient limited to the page intro badge, active search chip, or small icon tiles: `linear-gradient(135deg, #2F7DF6 0%, #6D63FF 100%)`. Typography should stay neutral and readable: `font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;` with `h1 32px/40px 600`, `h2 22px/30px 600`, card title `16px/24px 600`, body `14px/22px 400`, metadata `12px/18px 500`. Spacing scale: `4, 8, 12, 16, 20, 24, 32`. Radius: `10px` for panels/cards, `8px` for inputs/buttons, full pill for tags. Shadow only on layered elements: `0 8px 24px rgba(16, 35, 61, 0.08)` for sticky filter tray or popovers; cards mostly rely on border plus a very soft hover lift.

Layout:
Use a restrained top bar at `56px` height with product title left, optional saved views/history center-right, and utility actions on the far right. Below it, the page body should be a single discovery flow:
1. Intro band, `72-96px` tall, with title, one-line purpose, result count, and a compact “recently used / curated / all resources” segmented switch.
2. Search and filter region directly under the intro, sticky after scroll, inside a surface panel with `16px` padding.
3. Results grid as the primary content, visible above the fold on common laptop sizes.
4. Optional right-side detail preview drawer on desktop only when an item is selected, otherwise keep the grid full width.

Desktop content width should cap around `1280px` with `24px` page gutters. Results area uses a 12-column grid:
- `>=1280px`: search/filter row full width, resource cards in 4 columns.
- `1024-1279px`: 3 columns.
- `768-1023px`: 2 columns.
- `<768px`: 1 column, with filters moved into a sheet and search always visible.

Search:
Make search the dominant control at `44px` high and `min-width: 320px` on desktop. Structure: leading search icon, placeholder like “Search by name, team, tag, or use case”, clear button when filled, and trailing keyboard hint only on desktop. On focus, border shifts to `primary`, and a 2px outer ring uses `focus`. Support immediate local filtering with debounced remote search if needed; the field should never collapse or hide behind an icon. Beneath the field, show lightweight query assist chips like “API”, “Template”, “Playbook”, “Design asset” only when empty. Search results state should report “24 matches” or “No results for ‘…’” adjacent to the controls, not buried below the grid.

Filters:
Use grouped filters rather than a long toolbar. Recommended groups:
- Resource type
- Team / owner
- Lifecycle or trust status
- Format / platform
- Access level or availability
- Sort

Desktop behavior: first row shows 3-5 most-used filters as compact pill buttons or selects; “More filters” opens a side sheet or popover with advanced options. Each active filter becomes a removable chip below the controls. Keep “Clear all” text-button aligned right in the chip row. Filter controls should be `36-40px` high, wrap naturally, and preserve logical grouping. Avoid multicolor tags; selected chips use soft primary background and stronger text, not solid saturated fills.

Cards:
Each resource card should feel useful first, decorative second. Geometry: `padding 16px`, `min-height 220px`, vertical flex layout, border-first styling. Recommended structure from top to bottom:
- Top row: small icon tile or file-type glyph, resource type tag, trust/status tag.
- Title row: resource name, max 2 lines.
- Description: 2-3 line clamp.
- Metadata block: owner/team, last updated, usage count or endorsement count.
- Utility strip: 1-2 capability bullets such as “Reusable in onboarding” or “Works with Jira exports”.
- Footer: one primary action like `Open` or `Preview`, one quiet secondary action like `Save` or `Copy link`.

States:
- Default: white surface, border `#DCE4EE`.
- Hover: border darkens slightly, translateY `-1px`, shadow `0 6px 18px rgba(16, 35, 61, 0.06)`.
- Focus-visible: 2px focus ring outside card, no hover-only reliance.
- Selected: border `primary`, subtle tinted background `#F4F8FF`.
- Loading: fixed-height skeleton preserving icon, title, text, metadata, footer slots.
- Unavailable/restricted: muted footer action plus short inline explanation.
- Long text: clamp description and title before truncating metadata; tags must never push actions off-card.

Interaction details:
Use one primary action per region. In the search/filter region, the primary action is refining results; avoid adding heavy CTA buttons there. In cards, only `Open` or `Preview` gets filled-primary treatment. Secondary actions stay ghost or soft-outline. Motion should stay inside `160-180ms` for border, shadow, and opacity. Reduced-motion mode removes lift and animated shimmer but keeps clear static state changes.

Responsive behavior:
On tablet, keep the intro short, allow filters to wrap in two rows, and maintain 2-column cards with full-width search on top. On mobile:
- Top bar collapses utilities into an overflow menu.
- Intro becomes title + short subtitle + count.
- Search stays pinned near the top.
- Filters move into a bottom or side sheet with grouped sections and a sticky apply/reset footer.
- Cards become single-column with metadata stacked, never squeezed into dense mini-cards.
- If a detail preview exists, it becomes a separate route or full-screen sheet with a clear back action.

Accessibility and state coverage:
Keyboard order should be nav -> intro switch -> search -> filters -> results -> pagination/load more. Every selected/active state must use more than color: underline, icon, weight, or border change. Empty states should be modest: icon, one sentence explaining why nothing appears, one relevant recovery action like `Clear filters`. Error states belong inline within the affected region with retry. Loading must preserve layout. Overflow for long filter sets should wrap before horizontal scroll; only data-like subcontent inside cards may truncate.

GREEN score: 7/7

Rubric check:
- Item 1: Pass — identifies content discovery as the primary task mode and standard-density support.
- Item 2: Pass — preserves framework-neutral TypeScript and semantic HTML rather than inventing a replacement stack.
- Item 3: Pass — establishes layout, search/filter relationships, and card structure before decorative accents.
- Item 4: Pass — supplies semantic tokens, layout ranges, states, and responsive breakpoints.
- Item 5: Pass — gradients, shadows, and motion are explicitly limited and restrained.
- Item 6: Pass — covers focus, long-text handling, overflow, loading/error states, and accessible interaction order.
- Item 7: Pass — no source-domain terminology or workflow assumptions are imported.

Missing rubric items:
- None.

Comparison to RED:
- Improved from 6/7 to 7/7 by adding the missing long-text and overflow recovery guidance for cards, filters, and truncation behavior.

### Scenario B

Selected task mode: data management with a lightweight discovery-style header.

Preserved conventions: React structure, Material UI components, the existing green brand palette, and your current spacing and typography tokens. The restyle should come from hierarchy, surface treatment, and density tuning rather than swapping libraries or inventing a new visual language.

The overview should feel lighter by separating the page into four clear layers:

1. A restrained page header with title, short supporting text, and one primary action.
2. A compact KPI row for operational confidence.
3. A surface for filters and quick scope controls.
4. A dense but calmer primary content area for tables, lists, or pending work.

Use the existing green only where trust and action matter most: primary CTA, selected states, active filter chips when meaningful, success/status accents, and focus-visible rings if your theme already derives them from `primary`. Keep the rest of the page mostly neutral so the green reads as intentional instead of noisy.

Layout and hierarchy:
- Header: left-aligned title and summary, right-aligned primary action and 1-2 secondary actions. Avoid a hero block; keep working content visible in the first screen.
- KPI cards: 3-4 cards max per row on desktop, collapsing to 2 then 1 on smaller widths. Emphasize number first, label second, tiny trend or status third.
- Filters: place in a dedicated `Paper`/`Card` surface above the main table. Group by task, not by field count. Standard controls can stay at existing heights; make dense controls compact only inside high-frequency admin regions.
- Main content: prefer one dominant table or queue surface with sticky header, quiet row separators, and reachable row actions. Bulk actions should appear only when rows are selected.

Mapping to the existing theme:
- `theme.palette.primary.main`: keep as the brand green for primary buttons, selected tabs/segments, active icons, and key emphasis.
- `theme.palette.primary.light` or `alpha(primary.main, low opacity)`: use for selected row backgrounds, active filter fills, and soft highlight panels.
- `theme.palette.background.default`: page canvas.
- `theme.palette.background.paper`: cards, filter panels, table container, dialogs.
- `theme.palette.text.primary`: headings, KPI values, important labels.
- `theme.palette.text.secondary`: supporting descriptions, metadata, helper text.
- `theme.palette.divider`: all structural lines, card boundaries, row separators.
- `theme.palette.success|warning|error`: semantic statuses only; do not use brand green for every badge.
- `theme.spacing()`: keep all gaps on your token scale. A good target is larger spacing between page sections, tighter spacing within controls and tables.
- `theme.typography.h4/h5/h6/body2/caption`: use existing roles instead of custom font sizes. Let weight and spacing create clarity before introducing color.

Recommended visual adjustments inside Material UI:
- Page background: a very subtle tint or gradient derived from `background.default`, not a new color family.
- Surfaces: white or near-white `Paper` with thin borders; minimize shadows in dense regions.
- Radius: stay inside your existing token system, but use slightly more generous radius for KPI cards than for tables and forms.
- Buttons: one contained primary button per local region; secondary actions should be outlined or text buttons.
- Tabs/segmented controls: active state should combine green text or indicator with shape/underline, not color alone.
- Chips and status pills: low-saturation fills, compact height, limited count.
- Tables: slightly taller header than rows, clearer column labels, muted secondary metadata, sticky header when the dataset is long.
- Empty states: quiet illustration-free panel or table row with a short explanation and one valid next action.

Density guidance:
- Header and KPI region: relaxed to standard.
- Filters: standard.
- Table and bulk operations: compact.
This contrast helps the page feel open at the top and efficient where work actually happens.

Responsive behavior:
- Desktop: header actions inline, KPI row 4->3->2 columns, filters wrap by logical group, table remains horizontally scrollable if needed.
- Tablet/mobile: sequence becomes header -> KPI cards -> filters -> results. Do not hide key actions inside overflow if they are the main task path.
- In narrow widths, move row actions into a menu only after preserving the most common action inline.

State behavior:
- Hover: subtle border or surface shift only.
- Selected: use green plus shape/background, not green alone.
- Focus-visible: explicit ring using primary-derived focus color.
- Loading: reserve KPI and table structure with skeletons to avoid jumpiness.
- Empty/error: keep messaging adjacent to the affected region, with one clear recovery path.

The net effect should be “calm operations dashboard”: more white space between sections, quieter chrome, stronger information grouping, and a more disciplined use of the existing green so the interface feels clearer and more trustworthy without breaking the current theme.

GREEN score: 6/7

Rubric check:
- Item 1: Pass — identifies the task mode and gives an explicit density split between relaxed/standard header zones and compact work zones.
- Item 2: Pass — preserves React, Material UI, the existing green palette, and existing spacing/typography tokens.
- Item 3: Pass — uses hierarchy, surfaces, and information grouping before decorative styling.
- Item 4: Pass — maps semantic theme roles, layout behavior, states, and responsive rules into executable guidance.
- Item 5: Pass — keeps gradients, shadows, and accent color use restrained.
- Item 6: Miss — focus, status feedback, scrolling, and row-action reachability are covered, but the response does not define explicit long-text handling or a concrete contrast guardrail for admin metadata and table content.
- Item 7: Pass — no source-domain terminology or imported workflow assumptions appear.

Missing rubric items:
- Item 6: Add explicit long-text treatment and contrast targets if this scenario is revised in a later cycle.

Comparison to RED:
- Improved from 5/7 to 6/7 by fixing the missing density-mode callout and adding responsive/state guidance while preserving the existing green brand and Material UI contract.

Scenario-specific check:
- Pass — the response keeps Material UI, keeps the existing green brand color, and maps recommendations directly onto the existing theme instead of replacing either.

### Scenario C

Selected task mode: data management with compact density, preserving the target TypeScript app’s existing tokens, table patterns, form semantics, routing, and permission model.

Use a 3-layer page at desktop widths: a sticky page header, a filter/work area, and the result table. At `1440px`, keep the content frame around `1360px` max width with `24px` outer gutters. The header should be `64px` tall with the page title, result count, primary action, and a secondary “saved views” or export action. Below it, place filters in a surface panel with `16px` padding, `12px` row gaps, and compact controls at `32px` height. Group filters into 3 bands: quick search and status, advanced attributes, and date/range fields. Keep advanced filters collapsed behind a button by default; expanded mode can grow to 2 rows on desktop. Use a 12-column grid: search spans 4 columns, common selects 2 columns each, date ranges 3 columns, and the action row aligns right with “Reset”, “Apply”, and “Save view”. On widths below `1024px`, turn the filter panel into wrapped 2-column groups; below `640px`, stack controls full width and keep “Apply” sticky at the bottom of the filter sheet or drawer.

Place a result toolbar directly above the table, `44px` tall, with left-aligned selection state and bulk actions, right-aligned column settings and density toggle. Bulk actions should appear only when rows are selected, but reserve the toolbar height so the table does not jump. Use compact chips or labels for active filters, each removable with keyboard support. Inline validation belongs inside the filter panel and table cells, never in global toasts alone. Field errors should sit `4px` below the control, use icon plus text, and not rely on red alone. For editable table cells, use a quiet default state, then on focus show a `2px` focus ring, helper text beneath the cell editor, and an error row expansion or anchored message if validation fails. Recommended validation states: `default`, `dirty`, `valid`, `invalid`, `saving`, `saved`, `conflict`, and `disabled`.

The table should be the primary surface. Use sticky header and sticky operation column. Dense row height: `44px` for read-only rows, `52px` when rows contain status plus metadata. Header height `40px`. Cell padding `10px 12px`. Text size `13px` for body, `12px` for metadata, `14px` semibold for key identifiers. At `1440px`, a wide management table remains scannable if you cap visible columns to roughly 8 to 10 meaningful fields and use min widths instead of equal distribution. A solid starting map is: selection `48px`, primary name/ID `240px`, status `120px`, owner `140px`, category `140px`, last updated `160px`, numeric metric columns `120px`, notes/summary `220px`, and operation column `160px`. Keep the first identifying column and the operation column sticky when horizontal scroll is present. The operation column should use an opaque surface with a left divider shadow so users always know actions remain available.

Sorting should be available on every non-action header via full-header buttons, not tiny icons alone. Show three states: unsorted, ascending, descending. Preserve hit targets of at least `32px`. Status labels should be low-saturation pills around `22px` to `24px` tall with stable semantics: success for active/completed, warning for pending/review, danger for failed/blocked, neutral for draft/inactive. Do not color-code arbitrary categories. If multiple statuses exist in one row, keep the primary lifecycle status in the dedicated status column and move secondary flags into subtle tags or icons with tooltips.

For overflow, prefer a real horizontal scroller over squeezing columns below readability. Keep table container `overflow-x: auto`, `overflow-y: visible`, and reserve `16px` bottom padding so the horizontal scrollbar does not collide with pagination. Truncate long text to one line in dense cells with tooltip-on-focus/hover; allow the primary name column to wrap to two lines if it is the main recognition field. Numeric and date columns should never wrap. On narrow screens below `900px`, switch from full table to priority-based column reduction plus row expansion. Keep only selection, primary label, status, and operation visible; move secondary data into an expandable details panel per row. Below `640px`, replace bulk action toolbar with a bottom action bar once selection exists.

Pagination belongs below the table in a `56px` footer: left side shows total count and selected count, right side shows page size, page index, and next/previous controls. Keep page size options modest, such as `20`, `50`, `100`. If the table supports infinite loading, still preserve explicit progress feedback and a clear “loaded x of y” state.

Accessibility guidance:
- Use semantic table markup where possible, with `aria-sort` on sortable headers and clear row selection announcements.
- Every status chip needs a text label, not color-only meaning.
- Sticky columns must remain in DOM order; avoid duplicated action buttons for screen readers unless hidden correctly.
- Inline errors need programmatic association via `aria-describedby`.
- Keyboard flow should reach filters, result toolbar, table headers, cells, row actions, and pagination in a predictable order.
- Provide visible focus on all interactive elements, including icon-only controls.
- Respect reduced motion by removing lift and transition-heavy feedback.
- Maintain contrast of at least `4.5:1` for body text and `3:1` for component boundaries and large labels.

Loading and empty states should preserve layout. Use skeleton headers and 5 to 8 skeleton rows during fetch, keep column widths stable, and never replace the whole page with a spinner. Empty states should distinguish “no data yet”, “no matches for current filters”, and “no permission”. Error states should stay local to the affected region and always leave retry or reset paths visible.

GREEN score: 7/7

Rubric check:
- Item 1: Pass — identifies data management as the task mode and compact as the density mode.
- Item 2: Pass — preserves the target app’s existing tokens and interaction patterns.
- Item 3: Pass — leads with layout zones, spacing, and table structure before decoration.
- Item 4: Pass — includes concrete sizing, states, overflow rules, and responsive breakpoints.
- Item 5: Pass — keeps chrome subdued and motion limited through reduced-motion and quiet-surface guidance.
- Item 6: Pass — explicitly covers focus, contrast, long text, scrolling, status semantics, and operation reachability.
- Item 7: Pass — stays generic and does not import source-domain terminology or assumptions.

Missing rubric items:
- None.

Comparison to RED:
- Improved from 6/7 to 7/7 by adding the missing explicit contrast standard and preserving strong sticky/overflow/narrow-screen behavior.

Scenario-specific check:
- Pass — defines sticky header and sticky operation column behavior, internal table overflow, and narrow-screen reduction/expansion patterns.

### Scenario D

Selected task mode: decision support with a compact workflow-orchestration layer. Preserve the target product’s existing brand tokens, shell navigation, table/list patterns, form controls, permission boundaries, and maintenance terminology.

Use a stable master-detail page for maintenance triage. The left rail is a selectable incident queue of equipment alerts, each row showing asset name, site, severity, downtime risk, last telemetry time, and a single strongest status chip such as `Awaiting triage`, `Needs parts check`, or `Escalated`. Keep the queue at 320-380px on desktop with compact 32-36px row density, sticky filter/search controls above it, and selection visible through border, weight, and background shift, not color alone.

The detail pane keeps the current asset context pinned while the rest scrolls. Order the regions as:
1. Asset header: equipment name, line or facility, current operating state, SLA clock, and primary triage action.
2. Evidence summary: latest alarms, sensor drift, maintenance history snippet, technician notes, and linked manuals or photos.
3. Comparison dimensions: a structured scorecard comparing impact, safety risk, production loss, repair complexity, parts availability, and confidence. Use a two-column card or compact table layout with clear labels, short explanatory text, and low-saturation status surfaces.
4. Triage editor: decision input for likely cause, urgency, recommended next step, assignee/team, planned downtime window, and freeform rationale. Labels stay above controls; errors and validation stay adjacent.
5. Final actions: one primary action for the region, such as `Dispatch technician` or `Approve shutdown`, with secondary actions like `Request inspection`, `Defer with reason`, and `Export case`.
6. History: chronological log of prior decisions, work orders, acknowledgements, and status changes.

Layout and sizing:
- Desktop: queue + detail split, minimum detail width 760px.
- Tablet: 12-column layout with queue collapsing above detail.
- Mobile: explicit sequence `Queue -> Asset context -> Evidence -> Comparison -> Editor -> Actions -> History`, with a persistent back-to-queue route.
- Section gaps: 12-16px standard, 8-12px inside dense evidence or comparison blocks.
- Panels: 8-12px radius, 1px line border, minimal shadow except floating action bars or dialogs.

Interaction rules:
- Keep current asset name, severity, and top action visible during detail scrolling.
- Filters wrap by logical groups: site, equipment type, severity, assignee, status.
- Long alarm text clamps in queue rows but fully wraps in detail.
- Bulk actions appear only when multiple incidents are selected and stay attached to selection state.
- Disabled actions explain why, for example missing approval authority or incomplete evidence.
- Loading preserves panel height with skeleton rows/cards; empty states explain whether there are no active incidents or no matches for current filters.

Semantic styling:
- Canvas/background can use a very light cool tint, but dense work areas stay mostly white for readability.
- Heading text should carry the hierarchy; reserve stronger brand/accent color for selection, focus, and the single primary action.
- Status colors stay semantic: warning for pending attention, danger for failure or safety risk, success for resolved/stable.
- Comparison chips and metadata should use subdued surfaces so the evidence and recommendation remain the focus.

Accessibility and resilience:
- Severity and workflow state need icon/shape/text cues in addition to color.
- Focus rings must be clearly visible on queue rows, tabs, controls, and action buttons.
- Reduced motion removes hover lift and panel transitions without losing state clarity.
- Wide comparison tables or evidence attachments should scroll horizontally only when necessary, with the key label column kept readable.

A good first-screen hierarchy is: queue and filters on the left, selected asset header and evidence summary on the right, then comparison dimensions immediately below so the operator can judge impact before editing or dispatching.

GREEN score: 6/7

Rubric check:
- Item 1: Pass — identifies decision support with compact workflow orchestration as the task mode.
- Item 2: Pass — preserves target brand tokens, shell patterns, controls, and permission boundaries.
- Item 3: Pass — defines stable page regions and structural hierarchy before decorative styling.
- Item 4: Pass — provides layout, sizing, responsive ordering, and concrete interaction/state expectations.
- Item 5: Pass — keeps color, shadows, and motion restrained.
- Item 6: Miss — focus, long-text, scrolling, and status feedback are covered, but the response does not give an explicit contrast target or contrast guardrail for dense queue rows and comparison surfaces.
- Item 7: Pass — transfers structure into maintenance terminology without retaining the source product’s entities, labels, role model, or workflow assumptions.

Missing rubric items:
- Item 6: Add explicit contrast targets if this scenario is revised in a later cycle.

Comparison to RED:
- Improved from 4/7 to 6/7 by adding preservation of target conventions plus concrete layout, responsive, and state guidance while keeping the transferred structure domain-appropriate.

Scenario-specific check:
- Pass — the response uses equipment-maintenance terminology and relationships only, without importing source workflow labels or assumptions.

## Outcome

All four GREEN scenarios meet the required threshold and the scenario-specific checks, so the skill remains unchanged. Final GREEN scores are A `7/7`, B `6/7`, C `7/7`, and D `6/7`.

Compared with RED, the skill closes the discovery overflow gap in Scenario A, the density and responsive/state gap in Scenario B, the explicit contrast gap in Scenario C, and the theme/token plus structural-transfer gap in Scenario D. The remaining evidence-backed misses are narrow: Scenario B still lacks explicit long-text and contrast guidance for dense admin content, and Scenario D still lacks an explicit contrast target for queue and comparison surfaces. Those misses do not block the threshold or the required scenario checks.

Because every scenario now scores at least `6/7`, Scenario B preserves the existing green brand and Material UI, Scenario C explicitly defines sticky/overflow/narrow-screen behavior, and Scenario D uses target-domain terminology without source workflow assumptions, no refactor is justified by the evidence-to-file map in this cycle.
