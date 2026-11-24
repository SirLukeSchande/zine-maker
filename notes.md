# Notes

How the app got to where it is, and why things are the way they are. Newest last.

## Backwards compatibility statement
*Checked on 2026-11-24 against commit 6f85a15; rechecked with the unplaced photos pool and the keep stubs.*

**Older projects open unchanged in the current app.** Every project saved by an earlier version (f251da8, 8d5b411, cabebf8, 459557d), whether stored in the browser or saved as a `.zine` file, loads in the current app and lays out exactly as before.
- Test: each old `layout.js` was taken from git and given a sample project the way that version stored it. The sample covered a cover photo, framed and filled pictures, captions, text and blank pages, crops, the middle spread at 65:24, the wraparound cover (where that version had it), and 8 and 16 pages. Every page, the spread and wrap layouts, and the photo order matched the current `layout.js` exactly, with 0 differences.
- The IndexedDB store (`zine-maker` v1), the `.zine` format (`project.json` plus `photos/<id>`) and the project version (`v: 1`) have not changed since the first commit.
- Every preset name that was ever stored still exists. New fields (`count`, `dir`, `gap`, `fit`, `pics`, `wrapOn`, `wrapPreset`) have defaults, so old data simply doesn't have them.
- The unplaced photos pool added no stored field. On open, photos parked in `pics` beyond a page's count (possible from cabebf8 to 6f85a15) move to the pool; the pages look the same.

**Newer projects in an older copy of the app (forward compatibility): photos are safe, some settings are not.** An installed copy that hasn't updated yet, or an old checkout, may open a project made with newer features:
- It shows only the first picture on a page, and draws unknown frames such as 1:1 as portrait 4:3.
- In versions before 8d5b411, `normalizeSettings` drops `wrapOn`/`wrapPreset` when it saves.
- **No photo loss any more:** older versions delete photos they think are unused when you leave the editor. Saved data now has keep stubs that make every photo look used to all of them (see "Guard against older copies"). Tested with every old `gcPhotos` and with a7452b1 running in the browser.
- Any app from now on warns when it opens a project saved at a higher data level (`app`).
- Still bump `sw.js` `VERSION` on every release so installed copies update.

## Starting point (f251da8)
The first version was generated with Claude design. It already had the page editor, crop gestures, imposed sheets with creep, the piercing jig, the proof and sheets PDFs, `.zine` files, offline install and on-device storage.

## PDF export failing with some fonts (4816f8b)
Export crashed for Archivo 400, IBM Plex Mono and Space Grotesk. fontkit's `TTFGlyph._getCBox` read a glyph header even for empty glyphs and ran past the end of the font. We patched the vendored `fontkit.umd.min.js` to return an empty box, the way `_decode` already does. That's why fontkit must not be swapped for upstream.

## Middle spread split/join and the wraparound cover (8d5b411)
- The middle spread can be split into two pages and joined back from the page inspector. `setWide` moves the photo between the spread and the left page.
- New `wrap`: one picture across the back cover (left half) and front cover (right half), with the title on the front. `wideAt` and `layoutSpread(proj, opt, key)` handle both the spread and the wrap, in the editor, the sheet preview and both PDFs.

## Up to 3 pictures per page (cabebf8)
- Asked for: up to 3 pictures side by side or stacked on one page.
- Data: picture 1 keeps the page's own `photo`/`crop`/`preset` (so old data works), and pictures 2 and 3 live in `pics[]`. Pictures beyond `count` stay stored, so lowering and raising the count brings them back.
- Slot ids `'n:i'` let the existing photo picking, multi-photo fill, Earlier/Later and crop code work unchanged. Captions belong to the page, so they move only between first pictures.
- Iterations, all decided by the user:
  1. One frame for all pictures and a fixed gap. Changed to **a frame per picture** and **a gap slider per page** (0 to 3 cm, default 0.4).
  2. Added **Size**: "Same height/width" (`fit: 'match'`, pictures packed tightly at one height side by side or one width stacked) or "Equal space" (`fit: 'equal'`, the area inside the margins split equally).
- Layout rule when any picture fills: the page is split into equal parts. A filled picture takes its part of the trimmed page and runs into the bleed on outer edges, never across the spine. A framed picture sits in its part of the margin area, clipped so it stays out of a filled neighbour's part. The Size switch is hidden then, with a note.
- Checked: a single picture per page gives exactly the same geometry as before.

## Aspect ratios (459557d, 6f85a15)
- Landscape 65:24 was first only for spreads, and was made available on every picture. A portrait version was added first by mistake; the user meant landscape.
- Then 1:1 was added, and the frame choice was split into two menus: **Frame** (fill page / portrait / landscape) and **Aspect ratio**, hidden for fill page. Presets are now generated from `ORIENTS × RATIOS`, so a new ratio is one entry. Stored strings stayed the same, including the legacy `'1:2'`.
- Spread and wrap frames stay landscape-only (a portrait frame across the fold makes no sense).
- First browser-pane test: caught the inspector pushing an array into `replaceChildren` (rendered as text). Fixed with `kids.push.apply`.

## Unplaced photos pool
- Asked for: loading more photos than there are open frames, and keeping photos when a page's picture count is lowered. Planned in plan mode; decisions by the user:
  - Lowering the count moves the pictures that no longer fit into the pool. Raising it again gives empty frames.
  - Remove and Replace send the old photo to the pool. Photos leave only through an explicit Delete.
  - UI: tap-to-place thumbnails in the inspector, plus a Photos tab (overview, Add photos, Delete unplaced, tap a placed photo to jump to it).
- Design: the pool is implicit (photos nothing references), so the format didn't change and `.zine` files carry the pool for free. `gcPhotos` was removed. Photos on hidden pages stay referenced and show as "hidden" in the Photos tab.
- On desktop, pool thumbnails can be dragged onto a frame (`text/x-zine-photo`).
- Checked in Node (helpers, layout compatibility, PDFs skip unplaced photos) and in the browser pane: overflow on load, lowering and raising the count, Remove, Replace, tap and drag placement, reopening, `.zine` round trip, migration of parked pictures, Delete unplaced.

## Guard against older copies
- Problem: every version before the pool had `gcPhotos`, which deletes photos no slot references when you leave the editor. Since the pool, that is every unplaced photo. Older copies can't be changed, so the fix is in the data.
- All old `gcPhotos` count `pages[k].photo` for **any** key `k`, while everything else in old code reads pages by number. So saved data gets a stub page `'keep:<id>': {photo}` for each photo the oldest version (f251da8: only `pages[k].photo` and `spread.photo`) can't see: unplaced photos, pictures 2 and 3, and the wraparound picture.
- Stubs live only in stored data. `withKeep` adds them on save, `.zine` export and import; `stripKeep` removes them on open. `photoRefs` skips them too. On startup, `addKeep` adds stubs to projects stored before this change, without changing their date.
- Older copies keep the stubs when they save (they store the whole project), so the protection survives round trips.
- New field `app` (data level, 2) for the future: opening a project with a higher level shows "saved by a newer version" (it can't help copies older than this one).
- Checked: Node runs every old `gcPhotos` against saved data (without stubs they delete up to 6 of 11 test photos, with stubs none), old `layout.js` versions lay out the same with stubs, and the compatibility run still shows 0 differences. In the browser pane: startup adds stubs, the Photos tab ignores them, a7452b1 served from the same origin opened the zine and kept all photos (without stubs it deleted both unplaced ones), and the newer-version warning shows.

## How we work
- Each feature: change `layout.js` first and check the numbers in Node, then the UI in `app.js`, then make sure both PDF modes still build in Node. Since 6f85a15 the UI is also checked in the browser pane.
- Bump `sw.js` `VERSION` in every release commit (currently `zine-v9`).
- The user reviews, then asks to commit and push to `master`.
