# Plan

Open work and ideas. No priorities set yet. Move items to notes.md once done.

## Compatibility
- [ ] Older copies still drop settings keys they don't know when they save (`normalizeSettings`). Only matters for features that add settings; the `app` data level warning covers copies from now on.
- [ ] Add the backwards-compatibility check as a script in the repo (old `layout.js` from git vs. current, with sample projects per version), so it can be rerun before each release.

## Testing
- [ ] Keep a small Node test for layout and PDF output (both modes, all fonts) in the repo instead of ad-hoc scripts.
- [ ] Browser-pane smoke test checklist: new zine, pick photos, multi-picture page, frame and ratio menus, export both PDFs.
- [ ] Check the photo's own aspect ratio in the browser pane (not done for 9adf490): empty frame takes the photo's shape, the Chosen ratio / Photo's ratio switch, dimmed menus switching back, spread with a portrait photo, Earlier/Later.
- [ ] Add the crop mark check (all sheets, front and back, mirror after the flip) to the Node test.

## Ideas
- [ ] Per-page caption under each picture on multi-picture pages (right now there's one caption per page).
- [ ] Gap and Size options for the middle spread and wraparound cover, if two pictures across a spread are wanted.
