/* Zine geometry core. Pure functions, no DOM. All lengths in cm unless noted. */
(function (root) {
  'use strict';

  var PT_PER_CM = 72 / 2.54;
  var PRESETS = ['fill page', 'portrait 4:3', 'portrait 3:2', 'landscape 4:3', 'landscape 3:2', 'landscape 1:2'];
  var SPREAD_PRESETS = ['fill page', 'landscape 4:3', 'landscape 3:2', 'landscape 1:2', 'landscape 65:24'];
  var RATIO = {
    'portrait 4:3': 3 / 4, 'portrait 3:2': 2 / 3,
    'landscape 4:3': 4 / 3, 'landscape 3:2': 3 / 2,
    'landscape 1:2': 2, 'landscape 65:24': 65 / 24
  };
  var FONTS = [
    { id: 'inter', name: 'Inter' },
    { id: 'dm-sans', name: 'DM Sans' },
    { id: 'space-grotesk', name: 'Space Grotesk' },
    { id: 'work-sans', name: 'Work Sans' },
    { id: 'archivo', name: 'Archivo' },
    { id: 'ibm-plex-mono', name: 'IBM Plex Mono' },
    { id: 'eb-garamond', name: 'EB Garamond' },
    { id: 'cormorant-garamond', name: 'Cormorant Garamond' },
    { id: 'playfair-display', name: 'Playfair Display' },
    { id: 'libre-baskerville', name: 'Libre Baskerville' }
  ];
  var DIN = [['A4', 29.7, 21], ['A3', 42, 29.7], ['A2', 59.4, 42], ['A1', 84.1, 59.4], ['A0', 118.9, 84.1]];
  var SLUG = 2; // cm of free paper around the trimmed sheet, for marks and page numbers

  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var round1 = function (v) { return Math.round(v * 10) / 10; };

  function defaultSettings() {
    return {
      w: 15, h: 20, pages: 16, margin: 1, bleed: 0.3, thickness: 0,
      paper: 'auto', holes: 'auto',
      fontBody: 'inter', fontTitle: 'inter', titleBold: true,
      bodySize: 8, titleSize: 22,
      spreadOn: true, spreadPreset: 'landscape 1:2',
      wrapOn: false, wrapPreset: 'fill page'
    };
  }

  function normalizeSettings(s) {
    var d = defaultSettings(), o = {}, k;
    for (k in d) o[k] = (s && s[k] !== undefined) ? s[k] : d[k];
    o.w = clamp(Math.round(+o.w * 2) / 2, 8, 30);
    o.h = clamp(Math.round(+o.h * 2) / 2, 8, 30);
    o.pages = clamp(Math.round(+o.pages / 4) * 4, 4, 32);
    o.margin = clamp(+o.margin, 0.5, 3);
    o.bleed = clamp(+o.bleed, 0, 0.5);
    o.thickness = clamp(+o.thickness, 0, 0.5);
    o.bodySize = clamp(+o.bodySize, 6, 14);
    o.titleSize = clamp(+o.titleSize, 12, 48);
    o.titleBold = !!o.titleBold;
    o.spreadOn = !!o.spreadOn;
    if (SPREAD_PRESETS.indexOf(o.spreadPreset) < 0) o.spreadPreset = 'landscape 1:2';
    o.wrapOn = !!o.wrapOn;
    if (SPREAD_PRESETS.indexOf(o.wrapPreset) < 0) o.wrapPreset = 'fill page';
    if (!FONTS.some(function (f) { return f.id === o.fontBody; })) o.fontBody = 'inter';
    if (!FONTS.some(function (f) { return f.id === o.fontTitle; })) o.fontTitle = 'inter';
    return o;
  }

  function newId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function defaultProject(name) {
    return {
      v: 1, id: newId(), name: name || 'Untitled zine',
      title: '', byline: '',
      s: defaultSettings(),
      pages: {},                 // "n" -> overrides of pageDefaults
      spread: { photo: null, crop: { cx: 0.5, cy: 0.5, z: 1 } },
      wrap: { photo: null, crop: { cx: 0.5, cy: 0.5, z: 1 } },   // one picture across back (left) and front (right) cover
      photos: {}                 // photoId -> { w, h, name }
    };
  }

  function pageDefaults(n, N) {
    var text = (n === 2 || n === N - 1 || n === N);
    return { kind: text ? 'text' : 'photo', preset: 'portrait 4:3', photo: null,
      crop: { cx: 0.5, cy: 0.5, z: 1 }, caption: '', text: '' };
  }

  function getPage(proj, n) {
    var d = pageDefaults(n, proj.s.pages), o = (proj.pages && proj.pages[n]) || {};
    var r = {}, k;
    for (k in d) r[k] = o[k] !== undefined ? o[k] : d[k];
    r.crop = { cx: (o.crop && o.crop.cx != null) ? o.crop.cx : 0.5, cy: (o.crop && o.crop.cy != null) ? o.crop.cy : 0.5, z: (o.crop && o.crop.z) || 1 };
    return r;
  }

  function spreadInfo(proj) {
    var N = proj.s.pages;
    var on = !!proj.s.spreadOn && N >= 8;
    return { on: on, left: N / 2, right: N / 2 + 1 };
  }

  function wrapInfo(proj) {
    return { on: !!proj.s.wrapOn, left: proj.s.pages, right: 1 };
  }

  function pageRole(proj, n) {
    var sp = spreadInfo(proj), wr = wrapInfo(proj);
    if (sp.on && n === sp.left) return 'spread-l';
    if (sp.on && n === sp.right) return 'spread-r';
    if (wr.on && n === wr.left) return 'wrap-l';
    if (wr.on && n === wr.right) return 'wrap-r';
    if (n === 1) return 'cover';
    return getPage(proj, n).kind;
  }

  /* 'spread' or 'wrap' when page n is half of a two-page picture, else null */
  function wideAt(proj, n) {
    var r = pageRole(proj, n);
    return r === 'spread-l' || r === 'spread-r' ? 'spread' : r === 'wrap-l' || r === 'wrap-r' ? 'wrap' : null;
  }

  /* Elements are in page-local cm, origin top-left of the trimmed page. */
  function layoutPage(proj, n, opt) {
    opt = opt || {};
    var s = proj.s, W = s.w, H = s.h, m = s.margin, N = s.pages;
    var bleed = opt.bleed == null ? s.bleed : opt.bleed;
    var creep = opt.creep || 0;
    var side = (n % 2 === 0) ? 'left' : 'right';
    var dx = side === 'left' ? creep : -creep;
    var role = pageRole(proj, n);
    var out = { n: n, side: side, role: role, w: W, h: H, els: [] };
    if (wideAt(proj, n)) return out;
    var pg = getPage(proj, n), cover = (n === 1);
    if (cover || pg.kind === 'photo') {
      var fill = pg.preset === 'fill page', fr;
      if (fill) {
        fr = side === 'left'
          ? { x: -bleed, y: -bleed, w: W + bleed, h: H + 2 * bleed }
          : { x: 0, y: -bleed, w: W + bleed, h: H + 2 * bleed };
      } else {
        var r = RATIO[pg.preset] || 0.75;
        var rW = Math.max(1, W - 2 * m), rH = Math.max(1, H - 2 * m - (cover ? 3.75 : 1.75));
        var w = Math.min(rW, rH * r), h = w / r;
        fr = { x: m + (rW - w) / 2 + dx, y: m + (rH - h) / 2, w: w, h: h };
      }
      out.els.push({ type: 'photo', slot: 'page', n: n, fill: fill, photo: pg.photo, crop: pg.crop,
        x: fr.x, y: fr.y, w: fr.w, h: fr.h });
      var light = fill && !!pg.photo;
      if (cover) {
        var tx = fill ? m + dx : fr.x;
        out.els.push({ type: 'text', field: 'title', text: proj.title || '', ph: 'Title', x: tx, y: H - m - 1.3, w: W - 2 * m,
          size: s.titleSize, font: 'title', bold: s.titleBold, lineH: 1.15, anchor: 'bottom', color: light ? '#ffffff' : '#111111' });
        out.els.push({ type: 'text', field: 'byline', text: proj.byline || '', ph: 'Name — year', x: tx, y: H - m, w: W - 2 * m,
          size: 8, font: 'body', bold: false, lineH: 1.4, anchor: 'bottom', color: light ? '#ffffff' : '#111111' });
      } else if (!fill) {
        out.els.push({ type: 'text', field: 'caption', text: pg.caption || '', ph: 'Caption', x: fr.x, y: fr.y + fr.h + 0.3, w: fr.w,
          size: 7, font: 'body', bold: false, lineH: 1.4, anchor: 'top', color: '#111111' });
      }
    } else if (pg.kind === 'text') {
      out.els.push({ type: 'text', field: 'text', text: pg.text || '', ph: 'Text', x: m + dx, y: H - m, w: Math.min(8, W - 2 * m),
        size: s.bodySize, font: 'body', bold: false, lineH: 1.6, anchor: 'bottom', color: '#111111' });
    }
    return out;
  }

  /* Two-page picture in spread-local cm (width 2W): the middle spread, or with key 'wrap'
     the back cover (left half) and front cover (right half) with the title on the front. */
  function layoutSpread(proj, opt, key) {
    opt = opt || {};
    key = key || 'spread';
    var s = proj.s, W = s.w, H = s.h, m = s.margin, wrap = key === 'wrap';
    var bleed = opt.bleed == null ? s.bleed : opt.bleed;
    var preset = wrap ? s.wrapPreset : s.spreadPreset, data = proj[key] || { photo: null, crop: { cx: 0.5, cy: 0.5, z: 1 } };
    var fill = preset === 'fill page', fr;
    if (fill) fr = { x: -bleed, y: -bleed, w: 2 * W + 2 * bleed, h: H + 2 * bleed };
    else {
      var r = RATIO[preset] || 2, rH = Math.max(1, H - 2 * m - (wrap ? 3.75 : 0));
      var w = Math.min(2 * W - 2 * m, rH * r), h = w / r;
      fr = { x: W - w / 2, y: m + (rH - h) / 2, w: w, h: h };
    }
    var els = [{ type: 'photo', slot: key, fill: fill, photo: data.photo,
      crop: data.crop, x: fr.x, y: fr.y, w: fr.w, h: fr.h }];
    if (wrap) {
      var col = fill && data.photo ? '#ffffff' : '#111111';
      els.push({ type: 'text', field: 'title', text: proj.title || '', ph: 'Title', x: W + m, y: H - m - 1.3, w: W - 2 * m,
        size: s.titleSize, font: 'title', bold: s.titleBold, lineH: 1.15, anchor: 'bottom', color: col });
      els.push({ type: 'text', field: 'byline', text: proj.byline || '', ph: 'Name — year', x: W + m, y: H - m, w: W - 2 * m,
        size: 8, font: 'body', bold: false, lineH: 1.4, anchor: 'bottom', color: col });
    }
    return { w: 2 * W, h: H, els: els };
  }

  function imposition(proj) {
    var N = proj.s.pages, sheets = [], i;
    for (i = 0; i < N / 4; i++) {
      sheets.push({
        i: i, shift: i * proj.s.thickness / 10,
        front: { l: N - 2 * i, r: 2 * i + 1 },
        back: { l: 2 * i + 2, r: N - 2 * i - 1 }
      });
    }
    return sheets;
  }

  function sheetGeo(proj) {
    var W = proj.s.w, H = proj.s.h, need = [2 * W + 2 * SLUG, H + 2 * SLUG];
    var list = DIN, i, hit = null;
    if (proj.s.paper && proj.s.paper !== 'auto') {
      list = DIN.filter(function (d) { return d[0] === proj.s.paper; });
    }
    for (i = 0; i < list.length && !hit; i++) {
      var d = list[i];
      if (need[0] <= d[1] && need[1] <= d[2]) hit = { name: d[0], w: d[1], h: d[2], orient: 'landscape', fits: true };
      else if (need[0] <= d[2] && need[1] <= d[1]) hit = { name: d[0], w: d[2], h: d[1], orient: 'portrait', fits: true };
    }
    if (!hit && list.length) { // forced size that is too small: show it anyway, flagged
      var f = list[0];
      hit = { name: f[0], w: f[1], h: f[2], orient: 'landscape', fits: false };
    }
    if (!hit) hit = { name: 'LARGER THAN A0', w: need[0], h: need[1], orient: 'landscape', fits: false };
    return { paper: hit, W: W, H: H, MX: (hit.w - 2 * W) / 2, MT: (hit.h - H) / 2, slug: SLUG };
  }

  function jigInfo(proj) {
    var H = proj.s.h, jm = Math.min(2, H / 8), n;
    if (proj.s.holes !== 'auto' && +proj.s.holes >= 2) n = Math.round(+proj.s.holes);
    else {
      n = Math.max(1, Math.round((H - 2 * jm) / 4.5)) + 1;
      if (n % 2 === 0) n += 1;
      n = Math.max(3, n);
    }
    var holes = [], k;
    for (k = 0; k < n; k++) holes.push({ k: k + 1, d: jm + k * (H - 2 * jm) / (n - 1) });
    return { n: n, jm: jm, holes: holes, width: 4, length: H };
  }

  function sheetLabel(proj, sh, side, geo) {
    var f = side === 'front' ? sh.front : sh.back;
    return 'SHEET ' + (sh.i + 1) + ' ' + side.toUpperCase() + ' · PP. ' + f.l + ' | ' + f.r +
      ' · TRIM ' + round1(2 * proj.s.w) + ' × ' + round1(proj.s.h) + ' CM · ' + geo.paper.name + ' ' + geo.paper.orient.toUpperCase() +
      ' · FLIP LEFT TO RIGHT (' + (geo.paper.orient === 'landscape' ? 'SHORT' : 'LONG') + ' EDGE)' +
      (geo.paper.fits ? '' : ' · DOES NOT FIT THIS PAPER');
  }

  function cropRegion(iw, ih, crop, fa) {
    var z = Math.max(1, crop.z || 1);
    var rw = Math.min(iw, ih * fa), rh = rw / fa;
    rw /= z; rh /= z;
    var cx = clamp((crop.cx == null ? 0.5 : crop.cx) * iw, rw / 2, iw - rw / 2);
    var cy = clamp((crop.cy == null ? 0.5 : crop.cy) * ih, rh / 2, ih - rh / 2);
    return { sx: cx - rw / 2, sy: cy - rh / 2, sw: rw, sh: rh };
  }

  function wrapText(text, maxW, measure) {
    var out = [], paras = String(text || '').split('\n'), p, words, line, i, t;
    for (p = 0; p < paras.length; p++) {
      words = paras[p].split(/\s+/).filter(Boolean);
      if (!words.length) { out.push(''); continue; }
      line = words[0];
      for (i = 1; i < words.length; i++) {
        t = line + ' ' + words[i];
        if (measure(t) <= maxW) line = t; else { out.push(line); line = words[i]; }
      }
      out.push(line);
    }
    return out;
  }

  function photoPages(proj) { // reading-order list of slots that take a picture
    var N = proj.s.pages, list = [], n;
    for (n = 1; n <= N; n++) {
      var role = pageRole(proj, n);
      if (role === 'spread-l') list.push('spread');
      else if (role === 'wrap-r') list.push('wrap');
      else if (role === 'spread-r' || role === 'wrap-l') continue;
      else if (role === 'cover' || role === 'photo') list.push(n);
    }
    return list;
  }

  var api = {
    PT_PER_CM: PT_PER_CM, PRESETS: PRESETS, SPREAD_PRESETS: SPREAD_PRESETS, RATIO: RATIO, FONTS: FONTS, DIN: DIN, SLUG: SLUG,
    clamp: clamp, round1: round1, defaultSettings: defaultSettings, normalizeSettings: normalizeSettings,
    defaultProject: defaultProject, newId: newId, pageDefaults: pageDefaults, getPage: getPage, spreadInfo: spreadInfo,
    wrapInfo: wrapInfo, wideAt: wideAt, pageRole: pageRole, layoutPage: layoutPage, layoutSpread: layoutSpread, imposition: imposition, sheetGeo: sheetGeo,
    jigInfo: jigInfo, sheetLabel: sheetLabel, cropRegion: cropRegion, wrapText: wrapText, photoPages: photoPages
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ZL = api;
})(typeof self !== 'undefined' ? self : this);
