/* PDF export (pdf-lib). Works in the browser and in Node (for tests).
   io = { PDFLib, fontkit, loadFont(id, bold) -> bytes, getCrop(photoId, crop, aspect, pxW, pxH) -> jpeg bytes|null,
          onProgress(frac, msg), showEmpty (bool) } */
(function (root) {
  'use strict';
  var Z = (typeof module !== 'undefined' && module.exports) ? require('./layout.js') : root.ZL;
  var PT = Z.PT_PER_CM;
  var MAX_PIXELS = 14e6, DPI = 300;

  function hexRgb(PDFLib, hex) {
    var h = String(hex || '#111111').replace('#', '');
    return PDFLib.rgb(parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255);
  }

  async function buildPdf(proj, mode, io) {
    var PDFLib = io.PDFLib, L = PDFLib;
    var doc = await PDFLib.PDFDocument.create();
    doc.registerFontkit(io.fontkit);
    doc.setTitle(proj.name + (mode === 'sheets' ? ' — imposed sheets' : ' — proof'));
    doc.setCreator('Zine Maker');
    doc.setProducer('Zine Maker (pdf-lib)');
    var fonts = {}, images = {};
    var s = proj.s;
    var progress = io.onProgress || function () {};
    var done = 0, total = 1;

    async function getFont(id, bold) {
      var key = id + (bold ? ':b' : ':r');
      if (!fonts[key]) fonts[key] = await doc.embedFont(await io.loadFont(id, bold), { subset: false });
      return fonts[key];
    }
    async function fontFor(el) {
      return getFont(el.font === 'title' ? s.fontTitle : s.fontBody, !!el.bold);
    }
    async function getImage(el) {
      if (!el.photo) return null;
      var aspect = el.w / el.h;
      var pxW = el.w / 2.54 * DPI, pxH = el.h / 2.54 * DPI;
      var k = Math.sqrt(MAX_PIXELS / (pxW * pxH)); if (k < 1) { pxW *= k; pxH *= k; }
      pxW = Math.round(pxW); pxH = Math.round(pxH);
      var key = [el.photo, el.crop.cx.toFixed(4), el.crop.cy.toFixed(4), el.crop.z.toFixed(3), aspect.toFixed(4), pxW].join('|');
      if (!images[key]) {
        var bytes = await io.getCrop(el.photo, el.crop, aspect, pxW, pxH);
        images[key] = bytes ? await doc.embedJpg(bytes) : null;
        done++; progress(Math.min(0.95, done / total), 'Preparing photo ' + done + ' of ' + total);
      }
      return images[key];
    }

    // geometry in a "frame": a pdf page plus the cm offset of its origin from the top-left of the pdf page
    function mkFrame(page, ph, ox, oy) { return { page: page, ph: ph, ox: ox, oy: oy }; }
    function px(f, x) { return (f.ox + x) * PT; }
    function py(f, y) { return f.ph - (f.oy + y) * PT; }

    function line(f, x1, y1, x2, y2, th, dash) {
      f.page.drawLine({ start: { x: px(f, x1), y: py(f, y1) }, end: { x: px(f, x2), y: py(f, y2) },
        thickness: th || 0.25, color: L.rgb(0, 0, 0), dashArray: dash });
    }

    async function drawPhoto(f, el, clip) {
      var x = px(f, el.x), y = py(f, el.y + el.h), w = el.w * PT, h = el.h * PT;
      var img = await getImage(el);
      if (clip) f.page.pushOperators(L.pushGraphicsState(), L.moveTo(px(f, clip.x), py(f, clip.y + clip.h)), L.lineTo(px(f, clip.x + clip.w), py(f, clip.y + clip.h)),
        L.lineTo(px(f, clip.x + clip.w), py(f, clip.y)), L.lineTo(px(f, clip.x), py(f, clip.y)), L.closePath(), L.clip(), L.endPath());
      if (img) f.page.drawImage(img, { x: x, y: y, width: w, height: h });
      else if (io.showEmpty) f.page.drawRectangle({ x: x, y: y, width: w, height: h, color: L.rgb(0.925, 0.925, 0.925) });
      if (clip) f.page.pushOperators(L.popGraphicsState());
    }

    async function drawText(f, el) {
      if (!el.text) return;
      var font = await fontFor(el);
      var measure = function (t) { return font.widthOfTextAtSize(t, el.size) / PT; };
      var lines = Z.wrapText(el.text, el.w, measure);
      var lh = el.size * el.lineH / PT;
      var top = el.anchor === 'bottom' ? el.y - lines.length * lh : el.y;
      var asc = font.heightAtSize(el.size, { descender: false }), full = font.heightAtSize(el.size);
      var col = hexRgb(PDFLib, el.color), i;
      for (i = 0; i < lines.length; i++) {
        if (!lines[i]) continue;
        var base = (top + i * lh) * PT + ((lh * PT - full) / 2 + asc);
        f.page.drawText(lines[i], { x: px(f, el.x), y: f.ph - (f.oy * PT + base), size: el.size, font: font, color: col });
      }
    }

    async function drawEls(f, els, clip) {
      var i;
      for (i = 0; i < els.length; i++) {
        if (els[i].type === 'photo') await drawPhoto(f, els[i], clip);
      }
      for (i = 0; i < els.length; i++) {
        if (els[i].type === 'text') await drawText(f, els[i]);
      }
    }

    async function smallText(f, str, x, y, size, opt) {
      opt = opt || {};
      var font = await getFont(s.fontBody, false);
      var w = font.widthOfTextAtSize(str, size);
      var xx = px(f, x) - (opt.right ? w : 0);
      f.page.drawText(str, { x: xx, y: py(f, y) - size * 0.8, size: size, font: font, color: hexRgb(PDFLib, opt.color || '#111111') });
    }

    var sp = Z.spreadInfo(proj);
    var N = s.pages;

    // count photo placements for progress
    (function () {
      var n, c = 0; for (n = 1; n <= N; n++) { var r = Z.pageRole(proj, n); if (r === 'cover' || r === 'photo') {
        var gp = Z.getPage(proj, n), k;
        if (gp.photo) c++;
        for (k = 1; k < gp.count; k++) if (gp.pics[k - 1].photo) c++;
      } }
      if (sp.on && proj.spread.photo) c++;
      if (Z.wrapInfo(proj).on && proj.wrap && proj.wrap.photo) c++;
      total = Math.max(1, c);
    })();

    if (mode === 'proof') {
      var n;
      for (n = 1; n <= N; n++) {
        var page = doc.addPage([s.w * PT, s.h * PT]);
        var f = mkFrame(page, s.h * PT, 0, 0);
        var role = Z.pageRole(proj, n), wide = Z.wideAt(proj, n);
        if (wide) {
          var spl = Z.layoutSpread(proj, { bleed: 0 }, wide);
          var shift = (role === 'spread-l' || role === 'wrap-l') ? 0 : -s.w;
          var fr = mkFrame(page, s.h * PT, shift, 0);
          await drawEls(fr, spl.els, { x: -shift, y: 0, w: s.w, h: s.h });
        } else {
          var lp = Z.layoutPage(proj, n, { bleed: 0 });
          await drawEls(f, lp.els, { x: 0, y: 0, w: s.w, h: s.h });
        }
      }
    } else {
      var geo = Z.sheetGeo(proj), sheets = Z.imposition(proj);
      var PW = geo.paper.w, PH = geo.paper.h, MX = geo.MX, MT = geo.MT, W = s.w, H = s.h;
      var g = Math.max(0.3, s.bleed + 0.1), len = 0.8;

      for (var si = 0; si < sheets.length; si++) {
        var sh = sheets[si];
        for (var sd = 0; sd < 2; sd++) {
          var side = sd === 0 ? 'front' : 'back';
          var face = sd === 0 ? sh.front : sh.back;
          var pg = doc.addPage([PW * PT, PH * PT]);
          var F = mkFrame(pg, PH * PT, 0, 0);
          // artwork first, marks last so they stay on top
          var lWide = Z.wideAt(proj, face.l);
          if (lWide) {
            await drawEls(mkFrame(pg, PH * PT, MX, MT), Z.layoutSpread(proj, null, lWide).els);
          } else {
            await drawEls(mkFrame(pg, PH * PT, MX, MT), Z.layoutPage(proj, face.l, { creep: sh.shift }).els);
            await drawEls(mkFrame(pg, PH * PT, MX + W, MT), Z.layoutPage(proj, face.r, { creep: sh.shift }).els);
          }
          // cut marks at the four trim corners, fold marks at the spine
          var x0 = MX, x1 = MX + 2 * W, y0 = MT, y1 = MT + H;
          line(F, x0 - g - len, y0, x0 - g, y0); line(F, x0, y0 - g - len, x0, y0 - g);
          line(F, x1 + g, y0, x1 + g + len, y0); line(F, x1, y0 - g - len, x1, y0 - g);
          line(F, x0 - g - len, y1, x0 - g, y1); line(F, x0, y1 + g, x0, y1 + g + len);
          line(F, x1 + g, y1, x1 + g + len, y1); line(F, x1, y1 + g, x1, y1 + g + len);
          line(F, MX + W, y0 - g - len, MX + W, y0 - g); line(F, MX + W, y1 + g, MX + W, y1 + g + len);
          await smallText(F, Z.sheetLabel(proj, sh, side, geo), 0.5, 0.5, 7);
          // page numbers live in the slug, outside the trim
          var nums = [[face.l, false], [face.r, true]];
          for (var q = 0; q < 2; q++) {
            var pn = nums[q][0], rr = Z.pageRole(proj, pn);
            if (pn === 1 || pn === N || rr === 'spread-l' || rr === 'spread-r') continue;
            if (nums[q][1]) await smallText(F, String(pn), MX + 2 * W - s.margin, y1 + 1.4, 7, { right: true });
            else await smallText(F, String(pn), MX + s.margin, y1 + 1.4, 7);
          }
          progress(0.95, 'Sheet ' + (si + 1) + ' ' + side);
        }
      }

      // piercing jig on the same paper
      var jg = Z.jigInfo(proj);
      var jp = doc.addPage([PW * PT, PH * PT]);
      var J = mkFrame(jp, PH * PT, 0, 0);
      var jw = jg.width, SX = (PW - jw) / 2, mid = PW / 2;
      jp.drawRectangle({ x: SX * PT, y: PH * PT - (MT + H) * PT, width: jw * PT, height: H * PT, borderColor: L.rgb(0, 0, 0), borderWidth: 0.5 });
      line(J, mid, MT, mid, MT + H, 0.5, [3, 3]);
      var ax0 = SX, ax1 = SX + jw;
      line(J, ax0 - g - len, MT, ax0 - g, MT); line(J, ax0, MT - g - len, ax0, MT - g);
      line(J, ax1 + g, MT, ax1 + g + len, MT); line(J, ax1, MT - g - len, ax1, MT - g);
      line(J, ax0 - g - len, MT + H, ax0 - g, MT + H); line(J, ax0, MT + H + g, ax0, MT + H + g + len);
      line(J, ax1 + g, MT + H, ax1 + g + len, MT + H); line(J, ax1, MT + H + g, ax1, MT + H + g + len);
      for (var hk = 0; hk < jg.holes.length; hk++) {
        var hy = MT + jg.holes[hk].d;
        jp.drawCircle({ x: mid * PT, y: PH * PT - hy * PT, size: 0.1 * PT, borderColor: L.rgb(0, 0, 0), borderWidth: 0.5 });
        line(J, mid - 0.5, hy, mid + 0.5, hy, 0.4);
        await smallText(J, (hk + 1) + ' · ' + Z.round1(jg.holes[hk].d) + ' cm', mid + 0.7, hy - 0.12, 7);
      }
      await smallText(J, 'PIERCING JIG · ' + jg.n + ' SEWING HOLES · SPINE ' + Z.round1(H) + ' CM · ' + geo.paper.name + ' ' + geo.paper.orient.toUpperCase() + ' · PRINT AT 100%', 0.5, 0.5, 7);
      var bf = await getFont(s.fontBody, false);
      var txt = 'Cut on the outline and fold on the dashed line. Slip the strip into the crease of the nested sheets with the head at the top, and pierce at each circle. Print at 100%.';
      var lines2 = Z.wrapText(txt, Math.max(4, SX - 2.5), function (t) { return bf.widthOfTextAtSize(t, 8) / PT; });
      for (var li = 0; li < lines2.length; li++) await smallText(J, lines2[li], 1, MT + li * 0.5, 8);
    }

    progress(0.98, 'Writing PDF');
    var bytes = await doc.save();
    progress(1, 'Done');
    return bytes;
  }

  var api = { buildPdf: buildPdf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ZP = api;
})(typeof self !== 'undefined' ? self : this);
