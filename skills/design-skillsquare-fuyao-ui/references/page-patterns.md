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
