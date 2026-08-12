# Catalog Name Handling Design

## Goal

Make the add and edit flows in the Command, Skill, and Agent planning catalog tabs apply one consistent catalog-name rule in both the UI and the active HTTP request path.

## Rules

- A catalog name must match `^[a-z0-9-]{1,64}$`.
- Department-level catalogs never use a product prefix.
- A product prefix is enabled only when the selected product's original name matches the same pattern without trimming or case conversion.
- When enabled, the prefix is the original product name lowercased followed by `-`.
- Create forms default to the current prefix. If the product changes while an untouched default or prefixed create name is present, replace only that prefix and preserve the suffix.
- Create and edit submissions require the current prefix and at least one character after it. Invalid product names skip only the product-prefix check and still use the ordinary catalog-name check.

## HTTP Data Flow

- Skill catalog create/update uses `SkillMasterManagementPanelV2.vue` and calls `skillBaseService.createSkillMasterManagement` or `updateSkillMasterManagement`.
- Command and Agent catalog create/update use `HarnessCapabilityCatalogPanel.vue`, then `getHarnessCapabilityPlanningApi`, then `harnessCapabilityPlanningHttp.ts` in HTTP mode.
- The shared name assertion will run again at those HTTP request boundaries. This protects requests that bypass the component submit handlers and keeps Skill aligned with Command and Agent.

## Error Handling

Keep the existing ordinary-format error and prefix error semantics, including the existing error for a name that consists only of the prefix. The UI displays the error without submitting; the HTTP boundary throws the same validation class of error before invoking the network client.

## Testing

Add executable regression tests for the shared rule helper and the HTTP-facing request builders. Cover valid and invalid product names, department scope, create/update prefix checks, and all three capability labels/request field mappings.
