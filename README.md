# Zine Maker

Static web app (no server, no build). Photos and projects stay on the device (IndexedDB).
It also runs when index.html is opened straight from disk (file://), but hosting it is better: offline install and iPad "Add to Home Screen" need a web address.

## Host it for free (pick one)
**GitHub Pages** – public repo, upload all files here to the repo root, then Settings → Pages → Deploy from branch → main / root.
**Cloudflare Pages** – Workers & Pages → Create → Pages → Upload assets.
**Netlify** – app.netlify.com/drop → drag the folder.

Then on the iPad: Safari → Share → Add to Home Screen.

## Updating
Raise `VERSION` in `sw.js` (zine-v3, …) on every redeploy, otherwise installed copies keep the old files.
The f-*.js files are a fallback for file:// use only; they are loaded on demand.
