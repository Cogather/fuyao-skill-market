# Design language

## Character

Professional, lightweight, clear, and trustworthy, with restrained AI-product cues. Decoration supports recognition and atmosphere; it never competes with reading, scanning, or action.

## Adaptation order

1. Preserve the target brand, framework, component library, and established interaction semantics.
2. Map semantic roles: canvas, surface, primary text, body text, muted text, line, primary action, focus, success, warning, danger.
3. Select relaxed, standard, or compact density from the page task.
4. Introduce Fuyao defaults only where the target has no equivalent.

## Default color roles

| Role | Default | Usage |
| --- | --- | --- |
| Canvas start | #f2f7ff | Optional cool opening tint |
| Canvas | #fbfcff | Main light background |
| Surface | #ffffff | Cards, filters, work areas |
| Heading | #07172f | Highest text emphasis |
| Text | #52647d | Body and descriptions |
| Muted | #94a3b8 | Hints, placeholders, disabled context |
| Line | #e2e8f0 | Structural boundaries |
| Primary | #2f7df6 | Actions, selection, focus |
| Primary strong | #2563eb | Hover and high-emphasis blue |
| Accent | #7552ff | Restrained gradient or intelligent feature cue |
| Accent secondary | #2ecdd3 | Restrained gradient support |
| Success | #16a34a | Completed and positive state |
| Warning | #f59e0b | Attention and pending state |
| Danger | #dc2626 | Destructive and failed state |

Use blue-purple or blue-cyan gradients only for a hero phrase, compact icon tile, intelligent-feature cue, or primary action that needs product identity. Do not apply gradients to every card, table row, or status.

## Typography

Use the target font first. Without one, use a system Chinese sans-serif stack. Suggested ranges: discovery hero 42–52px, page heading 34–42px, section heading 24–30px, component title 15–18px, body 13–15px, metadata 10–12px. Prefer weight and spacing over extra colors.

## Spacing and density

Compose from 4, 6, 8, 10, 12, 14, 16, 18, 24, 28, and 32px.

| Density | Controls | Content gap | Use |
| --- | --- | --- | --- |
| Relaxed | 44–58px | 16–24px | Discovery and prominent search |
| Standard | 38–44px | 12–18px | Detail and ordinary forms |
| Compact | 32–38px | 8–14px | Tables, filters, batch workflows |

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
