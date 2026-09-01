# Reusable component contracts

Consumes semantic roles and density modes from `design-language.md` plus page relationships from `page-patterns.md`, and translates them into framework-neutral component decisions.

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

## Behavioral contracts

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

## Accessibility guardrails

- Normal and small text, including metadata and help, meets at least 4.5:1 contrast. Large text and meaningful component or focus boundaries meet at least 3:1.
- Readable metadata, help, and secondary content use the readable-muted role. Reserve the weaker muted role for disabled or nonessential context.
- Every interactive component exposes a solid 2px focus outline with a 2px offset. Keep any low-opacity shadow as enhancement, and use a solid system-color outline when forced colors are active.

## State checklist

- `default`: Preserve the intended hierarchy without depending on decoration, motion, or high-saturation color.
- `hover`: Use subtle surface, border, or text emphasis with a restrained 1–3px maximum lift; never let hover outrank the primary task.
- `active/selected`: Keep selection explicit with shape, placement, weight, or underline in addition to color.
- `focus-visible`: Show the solid offset outline, retain an optional shadow enhancement, and ensure the focused element remains readable against canvas and surface roles, including in forced-colors mode.
- `disabled`: Communicate unavailable actions through the muted role and, when helpful, short explanatory copy; do not reuse that weak contrast for readable metadata or help.
- `loading`: Reserve space for incoming content, avoid layout jumps, and show whether the user should wait or can continue elsewhere.
- `empty`: Explain absence before suggesting recovery, and keep the empty treatment proportional to the surrounding pattern.
- `error`: Place the message adjacent to the affected region, preserve recovery actions, and use danger semantics without overwhelming the page.
- `long-content`: Clamp or wrap secondary text first, preserve title/value readability, and prevent tags or metadata from displacing the main signal.
- `overflow`: Choose wrapping, scrolling, truncation, or sticky affordances deliberately so data and actions remain reachable.
- `reduced-motion`: Remove non-essential animation while preserving state clarity through layout, contrast, and static cues.
- `narrow-width`: Reorder content into an explicit reading path that protects context, key data, and the route to action.

## Common mistakes

- Giving multiple actions equal visual weight inside one local task region.
- Using color alone to distinguish active, blocked, selected, or completed states.
- Applying gradients, glass, or heavy shadow to dense tables, forms, or every card.
- Letting icons, tags, or decorative tiles outrank the label, value, or primary content.
- Moving errors, help text, or bulk actions away from the control or selection state they explain.
- Hiding the only route back to selection when a master-detail layout collapses at narrow width.
- Treating overflow and long-content behavior as edge cases instead of part of the component contract.
