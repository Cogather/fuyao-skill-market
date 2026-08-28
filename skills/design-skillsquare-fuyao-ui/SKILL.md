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
