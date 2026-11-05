---
name: design-skillsquare-fuyao-ui
description: Use when designing, implementing, or restyling a frontend that needs a professional, lightweight, clear, and trustworthy enterprise UI across discovery, detail, data-management, decision-support, workflow, or configuration views.
---

# Design Skillsquare Fuyao UI

## Core principle

Transfer the visual language, not the source product. Preserve verified target-project framework, brand, component, terminology, information-architecture, and authorization conventions.

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

State the selected task mode, what target context was supplied, what you inspected, and which conventions that evidence verifies. Explicitly label uninspected framework, tokens, components, routes, permissions, and business rules as unknown. Keep recommendations that depend on unknowns conditional and reversible instead of claiming those conventions were preserved. Define semantic hierarchy and layout before decorative details. Make recommendations executable with token roles, dimensions or ranges, component states, overflow behavior, and breakpoints appropriate to the target. End every implementation-ready direction with an Accessibility and resilience section covering 4.5:1 normal/small-text and 3:1 large-text/boundary contrast, solid offset focus plus forced-colors behavior, long-text wrapping/clamping/recovery, scrolling/overflow, status feedback, and operation reachability. For reviews, report findings without editing. For implementation requests, use verified target-project patterns.

## Completion check

Verify hierarchy and semantic states; 4.5:1 contrast for normal or small text; 3:1 for large text and meaningful component or focus boundaries; a solid offset keyboard-focus indicator with forced-colors support; long text; scrolling; loading and empty states; reduced motion; responsive priority; and operation reachability. Remove source-domain language and assumptions from reusable structures.
