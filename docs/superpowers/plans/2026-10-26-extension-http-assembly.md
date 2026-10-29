# Extension HTTP Assembly Implementation Plan

**Goal:** Connect the approved Extension release flow to the supplied HTTP contracts while retaining the existing form and mock experience.

**Design:** Keep the recursive tree renderer and mock assembly module. Add typed HTTP services and a focused HTTP state controller consumed by the existing assembly panel. Read layout and current bypass entries from scene detail; treat backend tree paths and upload/inherit acceptance as authoritative. Layout, upload, clear and inherit are immediate persistent operations; the inheritance checkbox only controls the upcoming save. Failed operations retain the last successful data. Search and tree responses are guarded against stale results.

**Scope:** Endpoints 3–6 and 8–11 power the existing release UI. Endpoints 1, 2 and 7 get tested service methods only. Existing red-box form markup stays intact.

**Contract changes:** Scene detail uses GET with the existing lookup fields as query parameters. Save uses POST /extensions/save and conditionally adds inheritBypass. Save never includes layout; layout uses standard/testagent through /extensions/layout. ZIP uploads contain the original file and userId/extensionName/layout as multipart fields, with a 50 MiB limit.

## Tasks

- [x] Add contract tests for the nine service methods, business errors, detail fields, save payload and authoritative tree adaptation; implement the typed service.
- [x] Connect HTTP state and UI: server layout initialization, inherited entry list and checkbox, debounced search, inherit/upload/clear, ignored reasons, tree retry and busy guards.
- [x] Exercise HTTP interactions with intercepted backend responses, including failure retention and stale search; retain mock regression coverage.
- [x] Run relevant domain tests, HTTP and mock browser tests, type/lint checks and a production build outside tracked dist.

## Review focus

- Accepted paths under .testagent are never prefixed twice or removed by the mock filter.
- Failure responses with nonzero business codes never look like success.
- Layout-only inheritance without bypass remains selectable.
- Unchecking inheritance filters FILE preview entries and sends false only on publish; it does not call clear immediately.
- Upload/clear/inherit/layout operations disable submission until their authoritative tree refresh finishes.

## Verification results (2026-10-26)

- Seven domain/contract test scripts passed: extension-assembly-http, extension-http-contract-update, extension-detail-http, harness-extension-publish-context-http, harness-asset-detail-http, business-scenario-design, extension-release-assembly.
- HTTP Playwright: 14 passed across extension-assembly-http, harness-workflow-list-http and extension-detail-http. Mock Playwright: 1 passed in extension-release-targets. Browser runs used Edge and dedicated ports 5187/5188; HTTP responses were intercepted, not a live backend integration test.
- Scoped ESLint and git diff --check passed. Production Vite build passed with output outside tracked dist.
- Full app vue-tsc was executed with tsconfig.app.json and reports 220 existing diagnostics. No diagnostics in the new assembly controller/service/components or modified Extension publishing pages/services, except the unchanged unused SkillPlanningDepartmentAdminsBody import in skillBaseService.ts:15. This task does not claim the repository-wide typecheck passes.
- Review reproduced and fixed two race conditions: uploading after opting out now updates all form state atomically and re-enables inheritance; persistent assembly operations guard Cancel/Back as well as publication. Regression assertions failed before the fixes and passed afterward. Directory errors still allow leaving the page.
- Both current and legacy publish services reject nonzero business error codes from the new save endpoint.
