# Plan

Open work and ideas. No priorities set yet. Move items to notes.md once done.

## Compatibility
- [ ] **Urgent: guard against older app copies opening newer projects.** Since the unplaced pool, any older copy deletes every unplaced photo when you leave the editor (see notes.md, backwards compatibility statement). Options: store a `minApp` or feature version in the project and have the app refuse to edit (or open read-only) anything newer than it understands; or make `gcPhotos` keep any photo id found anywhere in the project JSON.
- [ ] Add the backwards-compatibility check as a script in the repo (old `layout.js` from git vs. current, with sample projects per version), so it can be rerun before each release.

## Testing
- [ ] Keep a small Node test for layout and PDF output (both modes, all fonts) in the repo instead of ad-hoc scripts.
- [ ] Browser-pane smoke test checklist: new zine, pick photos, multi-picture page, frame and ratio menus, export both PDFs.

## Ideas
- [ ] Per-page caption under each picture on multi-picture pages (right now there's one caption per page).
- [ ] Gap and Size options for the middle spread and wraparound cover, if two pictures across a spread are wanted.
