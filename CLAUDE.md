# Zine Maker

Static web app for planning a saddle-stitched photo zine and exporting imposed print sheets as PDF.
No server, no build step, no package.json. Everything stays on the device (IndexedDB).
See [notes.md](notes.md) for how features were built, [Plan.md](Plan.md) for open work.

## Files
- `layout.js`: geometry core. Pure functions, no DOM, all lengths in cm. Works in the browser (`window.ZL`) and in Node (`require`).
- `pdf.js`: PDF export with pdf-lib (`window.ZP`). Also runs in Node.
- `app.js`: all UI (`h()` DOM helper, editor, inspector, settings, export, .zine import/export).
- `store.js`: IndexedDB `zine-maker` v1 (stores `projects` and `photos`), with an in-memory fallback.
- `sw.js`: offline cache. **Raise `VERSION` (`zine-vN`) in every commit that changes a shipped file**, otherwise installed copies keep the old files.
- `pdf-lib.min.js`, `jszip.min.js`, `fontkit.umd.min.js`: vendored. **fontkit is patched** (empty-glyph fix in `TTFGlyph._getCBox`, commit 4816f8b). Don't replace it with upstream.
- `f-*.ttf` fonts; `f-*.js` are base64 copies used only when opened from `file://`.

## Code style
- ES5 in IIFEs: `var`, `function`, no modules, no arrow functions in shipped code. Keep it working in older Safari on iPad.
- Dense code with few comments. Comments explain *why* or a data shape, in the same terse style as the code around them.
- UI copy: plain, short sentences, sentence case.

## Data model (project JSON, `v: 1`)
- `s`: settings, always passed through `normalizeSettings` (it drops unknown keys and clamps values).
- `pages["n"]`: only the overrides of `pageDefaults`. Always read pages through `getPage`, which fills in defaults and normalizes `count`, `dir`, `gap`, `fit`, `preset` and `pics`.
- Page picture fields: `photo`, `crop {cx, cy, z}`, `preset`, plus `count` (1 to 3), `dir` (`row`/`column`), `gap` (cm), `fit` (`match`/`equal`), and `pics: [{photo, crop, preset}]` for pictures 2 and 3.
- `spread` and `wrap`: two-page pictures, with frames stored in `s.spreadPreset` and `s.wrapPreset`.
- Presets are `'fill page'` or `'<portrait|landscape> <ratio>'`, built from `ORIENTS` × `RATIOS` in `layout.js`. Ratios are written long:short, except the legacy `'1:2'` (which means 2:1 landscape). To add a ratio, add one entry to `RATIOS`.
- Slots in the UI: a page number, `'spread'`, `'wrap'`, or `'n:i'` for picture i+1 on page n (i = 1, 2).
- Unplaced photos have no stored field: they are the photos in `photos` that no slot references (`photoRefs`/`unplacedPhotos` in `layout.js`). **The app never deletes photos automatically.** Only the Photos tab's Delete removes them, and only unplaced ones. Pictures beyond a page's `count` must not keep a photo: `setCount` and `releaseHidden` (on open) move them to the pool.
- Stored data (IndexedDB and `.zine`) also has stub pages `pages['keep:<id>'] = {photo}` for every photo the oldest app's cleanup can't see, so older copies don't delete them. Only `withKeep` (on save, export, import) adds them and `stripKeep` (on open) removes them; the live project never has them. All writes of project data go through `stored()` in `app.js`.
- `app`: the data level that saved the project (`DATA` in `app.js`, now 2). Opening a project with a higher level shows a warning. Raise `DATA` when a release stores something an older copy would damage when it saves.

## Backwards compatibility (rules)
- Never rename or remove stored keys or preset strings. Add new fields with defaults in `pageDefaults`/`defaultSettings`, and normalize them in `getPage`/`normalizeSettings`.
- A project saved by any earlier version must lay out exactly as before. Check this by running the old `layout.js` from git against the current one (method in notes.md).
- Don't change the IndexedDB name or version, or the `.zine` layout (`project.json` plus `photos/<id>`), without a migration.
- Any code that walks photo references must include `pics` and `wrap`. Use `Z.photoRefs`. Code that walks `pages` keys must skip `keep:` keys if it can see stored data.

## Testing
- Layout and PDF: Node scripts that `require('./layout.js')` and `require('./pdf.js')` and build both PDF modes with the real fonts and a stub `getCrop`.
- UI: the desktop app's browser pane with `.claude/launch.json` (git-ignored; runs `python3 -m http.server 8765`). The service worker caches aggressively, so unregister it and clear caches before reloading to test new code.
- Opening `index.html` from `file://` in the browser pane only shows a static snapshot (no scripts).

## Git
- Work on `master`. Commit and push only when asked.
- Commit messages: a summary line, then short bullets. End with the Co-Authored-By line.
