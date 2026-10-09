# Repository Guidelines

## Project Overview

`poe-trade-tool` is a standalone Tampermonkey userscript for Path of Exile 2 trade pages. It ranks **already-loaded** equipment by normalized defense (energy shield, armour, evasion, Runic Ward) in a draggable Chinese-language panel. Supported pages: `https://www.pathofexile.com/trade2*` and `https://poe.game.qq.com/trade2*`.

Keep it read-only with respect to trade data: no network requests, automatic loading, paging, or game-data changes.

## Architecture & Data Flow

The complete application is `poe2-equipment-calculator.user.js`, a strict-mode IIFE with no imports or dependencies. The userscript metadata runs it at `document-idle` with `@grant none`; the `HOST_ID` guard prevents duplicate panels.

- `refresh()` discovers trade rows using `ROW_SELECTOR`.
- `field()` and `readEquipment(row, index)` parse `data-field` attributes, `stat.<type>.<stat_id>` modifiers, quality, item level, and sockets.
- `calculate(item)` removes supported rune increases, normalizes quality to `max(quality, 20)`, and sums the four defense types. Preserve the documented Runic Ward uncertainty rules; this model is not fully game-verified.
- Results sort by **unrounded** normalized total descending, then original index. Uncomputable items remain last in original order.
- Rendering replaces the table body inside an open Shadow DOM. Four columns: 等级 / 当前防御 / 基础防御 ↓ / 孔. Level buttons locate the original trade row; tooltips explain calculations or failures.
- A `MutationObserver` re-reads relevant DOM changes with a 120 ms debounce. Preserve exclusion of the panel host to avoid self-triggering refreshes.

## Key Directories

- Root: editable application and documentation; there is no `src/`, `tests/`, `scripts/`, or generated distribution tree.
- `debug/`: third-party reference material, not application source or test fixtures. Keep its snapshot unmodified and read only relevant excerpts rather than the entire minified bundle.

## Development Commands

```sh
node --check poe2-equipment-calculator.user.js
```

This checks syntax only. There are no repository-defined build, test, lint, or formatting commands.

To run: install Tampermonkey, paste the complete `.user.js` file into a new script, save, then open or reload a supported trade2 page and load search results. After editing, replace the installed script before verifying behavior. No compilation or local development server is needed.

## Code Conventions & Common Patterns

- Match existing formatting: two-space indentation, semicolons, single quotes, template literals for interpolation, trailing commas in multiline literals.
- Use `lowerCamelCase` functions/fields (`readEquipment`, `missingRuneMods`) and `UPPER_SNAKE_CASE` constants (`ROW_SELECTOR`, `LOCAL_TYPES`). UI text is Chinese; identifiers are English.
- Use vanilla browser APIs directly. There is no dependency-injection framework or application store; state is closure-local (`timer`, `drag`) and per-refresh item objects. Asynchrony is event callbacks plus the debounce timer, not a promise/network pipeline.
- Represent calculation failures as `normalized: null` plus a meaningful `reason`; render `计算不可得` rather than guessing or silently substituting values.
- Prefer actual item-property values over duplicate labels or plugin summaries. Pure defense labels mean absent data. Read item level from `ilvl`, never requirement level.
- Identify modifier effects by stat IDs. Preserve English/Simplified/Traditional Chinese parsing alternatives and comments documenting official API, reference-script, or user-model provenance. Deduplicate nested modifier markup, not separate equal-valued modifiers.
- Socket supplementation is **display-only**: zero-socket chest items may show two, helmets/gloves/boots one; corrupted/sanctified items are excluded. Never feed these assumed counts into defense math or sorting.
- Build dynamic output with `createElement`, `textContent`, and `DocumentFragment`; reserve `innerHTML` for the static panel shell. Preserve keyboard buttons, accessibility attributes, viewport-clamped dragging, and exact numeric ties.

## Documentation Changes

- Do not proactively modify any `README.md`, including the root and `maintenance/` copies. Update them only when the user explicitly requests README changes.
- Code or behavior changes do not authorize README updates. Report changes, verification evidence, and pending checks in the conversation instead.

## Important Files

| Path | Role |
| --- | --- |
| `poe2-equipment-calculator.user.js` | Entry point, distribution artifact, metadata configuration, parsing/calculation/UI implementation. |
| `README.md` | Installation, behavior specification, formulas, evidence/limitations, and per-version verification history. Modify only when explicitly requested by the user. |
| `debug/8b9e2ac2-5696-4f81-875d-d63295fa0f3b.txt` | Unmodified MIT reference userscript, POE2交易助手 3.0.6; provenance for stat IDs and DOM conventions. |
| `LICENSE` | Project MIT license. |

## Runtime/Tooling Preferences

Runtime is a modern browser with Tampermonkey, not Node or Bun. Node is only an optional syntax-check tool; no version is pinned. No package manager, package manifest, lockfile, bundler, linter, or formatter is configured. Keep the script directly paste-installable without imports, external dependencies, or additional userscript grants. Release version metadata lives in the script's `@version` header.

## Testing & QA

No automated test framework, committed browser fixtures, CI, or coverage threshold exists. `README.md` records historical Chromium fixture smoke checks and explicitly distinguishes those from later unverified changes; older checks do not validate new behavior.

**Browser verification is user-run only.** Assistants MUST NOT launch or automate browsers, including live-page and fixture checks. When browser verification is needed, send the user the exact runnable commands or browser-console snippets, required setup/page, and expected observations. The user executes them and returns results; use those results as verification evidence. Until results arrive, explicitly mark browser verification as pending, not passed.

For functional changes, run the syntax check; request user-run browser verification on supported trade pages or a representative fixture covering the relevant cases below:

- Quality below/equal/above 20%; supported, non-defense, unknown, and missing rune modifiers; Ward refusal cases and failure tooltips.
- Duplicate defense fields, label-only fields, item-level reading, full-precision sorting, ties, and uncomputable-last ordering.
- Actual versus display-supplemented sockets; multilingual corruption/sanctification states; unchanged defense values and ordering from supplementation.
- Empty results, dynamic row changes, refresh, collapse, keyboard locating, drag/resize, four-column layout, and absence of equipment names in panel text/tooltips/accessibility labels.

Report what was actually exercised and remaining real-page DOM uncertainties in the conversation; update `README.md` only when explicitly requested by the user. Fixture success is not proof of live-site compatibility.
