/* Zine Maker UI */
(function () {
  'use strict';
  var Z = window.ZL, ZP = window.ZP, Store = window.ZS;
  var PT = Z.PT_PER_CM;
  var app = document.getElementById('app');
  var fileInput = document.getElementById('file');
  var zineInput = document.getElementById('zinefile');

  var S = { view: 'home', proj: null, tab: 'pages', sel: 1, urls: {}, projects: [], pickSlot: null,
    showEmpty: true, dpi: 300, result: null, busy: null };

  /* ---------- tiny DOM helper ---------- */
  function h(tag, attrs) {
    var e = document.createElement(tag), k, v;
    attrs = attrs || {};
    for (k in attrs) {
      v = attrs[k];
      if (v == null || v === false || k === 'value') continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2).toLowerCase(), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    var kids = Array.prototype.slice.call(arguments, 2);
    (function add(list) {
      list.forEach(function (c) {
        if (c == null || c === false) return;
        if (Array.isArray(c)) return add(c);
        e.append(c.nodeType ? c : document.createTextNode(String(c)));
      });
    })(kids);
    if (attrs.value !== undefined) e.value = attrs.value;
    return e;
  }
  var $ = function (s, r) { return (r || document).querySelector(s); };

  var toastEl = null, toastT = null;
  function toast(msg, ms) {
    if (!toastEl) { toastEl = h('div', { class: 'toast' }); document.body.append(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('on');
    clearTimeout(toastT);
    if (ms !== 0) toastT = setTimeout(function () { toastEl.classList.remove('on'); }, ms || 2600);
  }
  function hideToast() { if (toastEl) toastEl.classList.remove('on'); }

  /* ---------- save ---------- */
  var saveT = null;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(flushSave, 350);
  }
  function flushSave() {
    clearTimeout(saveT);
    if (!S.proj) return Promise.resolve();
    S.proj.updated = Date.now();
    return Store.putProject({ id: S.proj.id, name: S.proj.name, updated: S.proj.updated, data: S.proj })
      .catch(function () { toast('Could not save. Is storage full?', 5000); });
  }

  /* ---------- home ---------- */
  function showHome() {
    flushSave();
    S.view = 'home'; revokeUrls(); S.proj = null;
    return Store.listProjects().then(function (list) {
      S.projects = (list || []).sort(function (a, b) { return b.updated - a.updated; });
      drawHome();
    });
  }

  function drawHome() {
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var standalone = window.navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    var cards = S.projects.map(function (p) {
      var s = p.data.s;
      return h('div', { class: 'card' },
        h('div', { class: 'card-main', onClick: function () { openProject(p.id); } },
          h('strong', {}, p.name || 'Untitled'),
          h('span', { class: 'mute' }, Z.round1(s.w) + ' × ' + Z.round1(s.h) + ' cm · ' + s.pages + ' pages · ' + new Date(p.updated).toLocaleDateString())),
        h('div', { class: 'card-act' },
          h('button', { class: 'btn small', onClick: function () { duplicateProject(p.id); } }, 'Duplicate'),
          h('button', { class: 'btn small danger', onClick: function () {
            if (confirm('Delete “' + (p.name || 'Untitled') + '” and its photos from this device?')) Store.deleteProject(p.id).then(showHome);
          } }, 'Delete')));
    });
    app.replaceChildren(h('div', { class: 'home' },
      h('h1', {}, 'Zine Maker'),
      h('p', { class: 'mute' }, 'Plan a small saddle-stitched photo zine, place your pictures, and export the imposed sheets for printing at home.'),
      h('div', { class: 'row-btns' },
        h('button', { class: 'btn primary', onClick: newProject }, 'New zine'),
        h('button', { class: 'btn', onClick: function () { zineInput.click(); } }, 'Open .zine file')),
      cards.length ? h('div', { class: 'cards' }, cards) : h('p', { class: 'mute' }, 'No zines yet.'),
      ios && !standalone ? h('p', { class: 'hint' }, 'Tip: tap Share, then “Add to Home Screen” to use this like an app, including offline.') : null,
      Store.isMemory() ? h('p', { class: 'hint warn' }, 'This browser is not letting the app store data. Save .zine files from the Export tab or your work will be lost when you close the page.') : null,
      h('p', { class: 'mute small' }, 'Everything stays on this device. Photos are never uploaded.')));
  }

  function newProject() {
    var p = Z.defaultProject('Untitled zine');
    Store.putProject({ id: p.id, name: p.name, updated: Date.now(), data: p }).then(function () { openProject(p.id); });
  }

  function duplicateProject(id) {
    Store.getProject(id).then(function (rec) {
      var p = JSON.parse(JSON.stringify(rec.data)), oldId = p.id;
      p.id = Z.newId(); p.name = (p.name || 'Untitled') + ' copy';
      var ids = Object.keys(p.photos || {});
      return Promise.all(ids.map(function (pid) {
        return Store.getPhoto(oldId, pid).then(function (ph) {
          if (ph) return Store.putPhoto({ key: p.id + '|' + pid, projId: p.id, id: pid, orig: ph.orig, prev: ph.prev, w: ph.w, h: ph.h });
        });
      })).then(function () { return Store.putProject({ id: p.id, name: p.name, updated: Date.now(), data: p }); });
    }).then(showHome).catch(function () { toast('Could not duplicate.'); });
  }

  /* ---------- open project ---------- */
  function revokeUrls() {
    Object.keys(S.urls).forEach(function (k) { try { URL.revokeObjectURL(S.urls[k]); } catch (e) { } });
    S.urls = {};
  }

  function openProject(id) {
    return Store.getProject(id).then(function (rec) {
      if (!rec) return showHome();
      var p = rec.data;
      p.s = Z.normalizeSettings(p.s);
      p.pages = p.pages || {}; p.photos = p.photos || {};
      p.spread = p.spread || { photo: null, crop: { cx: 0.5, cy: 0.5, z: 1 } };
      p.spread.crop = p.spread.crop || { cx: 0.5, cy: 0.5, z: 1 };
      p.wrap = p.wrap || { photo: null, crop: { cx: 0.5, cy: 0.5, z: 1 } };
      p.wrap.crop = p.wrap.crop || { cx: 0.5, cy: 0.5, z: 1 };
      releaseHidden(p);
      S.proj = p; S.view = 'editor'; S.tab = 'pages'; S.sel = window.innerWidth >= 900 ? 1 : null; S.result = null; revokeUrls();
      buildEditor();
      var ids = Object.keys(p.photos);
      return Promise.all(ids.map(function (pid) {
        return Store.getPhoto(p.id, pid).then(function (ph) { if (ph && ph.prev) S.urls[pid] = URL.createObjectURL(ph.prev); });
      })).then(function () { renderBody(); });
    });
  }

  /* ---------- editor shell ---------- */
  var tabNames = [['pages', 'Pages'], ['photos', 'Photos'], ['sheets', 'Sheets'], ['settings', 'Settings'], ['export', 'Export']];
  var bodyEl = null, inspEl = null;

  function buildEditor() {
    var nameInput = h('input', { class: 'name', value: S.proj.name, 'aria-label': 'Zine name',
      onInput: function (e) { S.proj.name = e.target.value; save(); } });
    var tabs = h('nav', { class: 'tabs' }, tabNames.map(function (t) {
      return h('button', { class: 'tab' + (S.tab === t[0] ? ' on' : ''), 'data-tab': t[0], onClick: function () { setTab(t[0]); } }, t[1]);
    }));
    bodyEl = h('main', { id: 'body' });
    inspEl = h('aside', { id: 'insp', class: 'empty' });
    app.replaceChildren(
      h('header', { class: 'top' },
        h('button', { class: 'btn small', onClick: function () { leaveEditor(); } }, '‹ Zines'),
        nameInput, tabs),
      h('div', { class: 'ed' }, bodyEl, inspEl));
    window.removeEventListener('resize', onResize);
    window.addEventListener('resize', onResize);
    renderBody(); renderInspector();
  }

  var resizeT = null;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(function () { if (S.view === 'editor' && (S.tab === 'pages' || S.tab === 'sheets')) renderBody(); }, 150); }

  function setTab(t) {
    S.tab = t;
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === t); });
    renderBody(); renderInspector();
    bodyEl.scrollTop = 0;
  }

  function leaveEditor() { showHome(); }

  /* Photos no frame holds are the unplaced photos; they stay until deleted here, the only way a photo leaves a zine. */
  function deletePhotos(ids) {
    var p = S.proj, refs = Z.photoRefs(p);
    return Promise.all(ids.filter(function (id) { return !refs[id]; }).map(function (id) {
      delete p.photos[id];
      if (S.urls[id]) { URL.revokeObjectURL(S.urls[id]); delete S.urls[id]; }
      return Store.deletePhoto(p.id, id);
    })).then(function () { save(); renderBody(); renderInspector(); });
  }

  /* Pictures beyond a page's count used to stay parked in pics; they now go to the unplaced photos. */
  function releaseHidden(p) {
    Object.keys(p.pages).forEach(function (k) {
      var pg = p.pages[k]; if (!pg || !pg.pics) return;
      var c = Z.getPage(p, +k).count;
      pg.pics.forEach(function (q, i) { if (q && q.photo && i + 1 >= c) { q.photo = null; q.crop = { cx: 0.5, cy: 0.5, z: 1 }; } });
    });
  }

  /* ---------- slots ---------- */
  /* A slot is a page number, 'spread', 'wrap', or 'n:i' for the 2nd/3rd picture (i = 1, 2) on page n. */
  function isWide(slot) { return slot === 'spread' || slot === 'wrap'; }
  function subOf(slot) {
    if (typeof slot !== 'string' || slot.indexOf(':') < 0) return null;
    var a = slot.split(':'); return { n: +a[0], i: +a[1] };
  }
  function slotPage(slot) { var sub = subOf(slot); return sub ? sub.n : slot; }
  function slotObj(slot) {
    if (isWide(slot)) return S.proj[slot];
    var sub = subOf(slot), n = sub ? sub.n : slot;
    if (!S.proj.pages[n]) S.proj.pages[n] = {};
    var pg = S.proj.pages[n];
    if (!sub) return pg;
    pg.pics = pg.pics || [];
    if (!pg.pics[sub.i - 1]) pg.pics[sub.i - 1] = { photo: null, crop: { cx: 0.5, cy: 0.5, z: 1 } };
    return pg.pics[sub.i - 1];
  }
  function slotPhoto(slot) {
    if (isWide(slot)) return S.proj[slot].photo;
    var sub = subOf(slot);
    return sub ? Z.getPage(S.proj, sub.n).pics[sub.i - 1].photo : Z.getPage(S.proj, slot).photo;
  }
  function slotCrop(slot) {
    var o = slotObj(slot);
    if (!o.crop) o.crop = { cx: 0.5, cy: 0.5, z: 1 };
    return o.crop;
  }
  function slotLabel(slot) {
    if (slot === 'spread') { var sp = Z.spreadInfo(S.proj); return 'Middle spread (pages ' + sp.left + '–' + sp.right + ')'; }
    if (slot === 'wrap') return 'Back and front cover (pages ' + S.proj.s.pages + ' and 1)';
    var sub = subOf(slot), n = slotPage(slot), name = n === 1 ? 'Cover (page 1)' : 'Page ' + n;
    if (Z.getPage(S.proj, n).count > 1) name += ', picture ' + (sub ? sub.i + 1 : 1);
    return name;
  }

  /* ---------- photo import ---------- */
  function ingest(file) {
    var url = URL.createObjectURL(file), img = new Image();
    img.src = url;
    return img.decode().then(function () {
      var w = img.naturalWidth, hh = img.naturalHeight;
      if (!w || !hh) throw new Error('empty');
      var k = Math.min(1, 1800 / Math.max(w, hh)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(hh * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return new Promise(function (res) { c.toBlob(res, 'image/jpeg', 0.85); }).then(function (prev) {
        c.width = c.height = 0; img.src = ''; URL.revokeObjectURL(url);
        if (!prev) throw new Error('preview failed');
        var id = Z.newId();
        return Store.putPhoto({ key: S.proj.id + '|' + id, projId: S.proj.id, id: id, orig: file, prev: prev, w: w, h: hh }).then(function () {
          S.proj.photos[id] = { w: w, h: hh, name: file.name || 'photo', type: file.type || 'image/jpeg' };
          S.urls[id] = URL.createObjectURL(prev);
          return id;
        });
      });
    }).catch(function (e) { try { URL.revokeObjectURL(url); } catch (x) { } throw e; });
  }

  function addFiles(files, slot) {
    files = Array.prototype.slice.call(files || []).filter(function (f) { return !f.type || /^image\//.test(f.type); });
    if (!files.length) return Promise.resolve();
    // fill the picked frame and the empty ones after it; the rest go to the unplaced photos
    var slots = Z.photoPages(S.proj), start = slot == null ? -1 : slots.indexOf(slot);
    var targets = slot == null ? [] : [slot];
    if (start >= 0) targets = targets.concat(slots.slice(start + 1).filter(function (s) { return !slotPhoto(s); }));
    var failed = 0, pooled = 0, placed = 0;
    var chain = Promise.resolve();
    files.forEach(function (f, i) {
      chain = chain.then(function () {
        toast('Adding photo ' + (i + 1) + ' of ' + files.length + '…', 0);
        return ingest(f).then(function (id) {
          if (i >= targets.length) { pooled++; return; }
          var o = slotObj(targets[i]); o.photo = id; o.crop = { cx: 0.5, cy: 0.5, z: 1 }; placed++;
        }).catch(function () { failed++; });
      });
    });
    return chain.then(function () {
      save(); renderBody(); renderInspector();
      var added = placed + pooled, msg = added + ' photo' + (added === 1 ? '' : 's') + ' added' +
        (!pooled ? '.' : placed ? ', ' + pooled + ' to unplaced photos.' : ' to unplaced photos.');
      if (failed) msg += ' ' + failed + ' could not be read (HEIC from a desktop browser?).';
      toast(msg, failed ? 6000 : pooled && placed ? 4000 : 2200);
    });
  }

  fileInput.addEventListener('change', function () {
    var files = Array.prototype.slice.call(fileInput.files || []), slot = S.pickSlot;
    fileInput.value = '';
    if (files && files.length && S.proj) addFiles(files, slot);
  });

  function pick(slot) { S.pickSlot = slot; fileInput.click(); }

  function place(slot, id) {
    var o = slotObj(slot); o.photo = id; o.crop = { cx: 0.5, cy: 0.5, z: 1 };
    S.sel = slot; save(); renderBody(); renderInspector();
  }

  function thumbEl(id, o) {
    var t = h('div', { class: 'thumb' + (o.onClick ? ' tap' : ''), title: (S.proj.photos[id] || {}).name, onClick: o.onClick },
      S.urls[id] ? h('img', { src: S.urls[id], alt: '', draggable: 'false' }) : null,
      o.label ? h('span', { class: 'cap' }, o.label) : null,
      o.del ? h('button', { class: 'x', 'aria-label': 'Delete photo', onClick: function (ev) {
        ev.stopPropagation();
        if (confirm('Delete this photo from the zine and this device?')) deletePhotos([id]);
      } }, '×') : null);
    if (o.drag) {
      t.draggable = true;
      t.addEventListener('dragstart', function (ev) { ev.dataTransfer.setData('text/x-zine-photo', id); ev.dataTransfer.effectAllowed = 'move'; });
    }
    return t;
  }

  /* ---------- page rendering ---------- */
  function fontCss(id, bold) { return '"zf-' + id + '",system-ui,sans-serif;font-weight:' + (bold ? 700 : 400); }

  function applyCropImg(img, meta, crop, e, scale) {
    var r = Z.cropRegion(meta.w, meta.h, crop, e.w / e.h), k = e.w * scale / r.sw;
    img.style.width = (meta.w * k) + 'px'; img.style.height = (meta.h * k) + 'px';
    img.style.left = (-r.sx * k) + 'px'; img.style.top = (-r.sy * k) + 'px';
  }

  function frameEl(e, scale, o) {
    var slot = e.slot;
    var multi = o.interactive && !isWide(slot) && Z.getPage(S.proj, e.n).count > 1;
    var fr = h('div', { class: 'fr' + (e.photo ? '' : ' empty') + (multi && S.sel === slot ? ' on' : ''),
      style: 'left:' + (e.x * scale) + 'px;top:' + (e.y * scale) + 'px;width:' + (e.w * scale) + 'px;height:' + (e.h * scale) + 'px' });
    var meta = e.photo && S.proj.photos[e.photo], url = e.photo && S.urls[e.photo];
    if (meta && url) {
      var img = h('img', { src: url, alt: '', draggable: 'false' });
      fr.append(img);
      applyCropImg(img, meta, e.crop, e, scale);
      if (o.interactive && S.sel === slot) attachCrop(fr, img, slot, meta, e, scale);
    } else if (o.interactive) {
      fr.append(h('span', { class: 'plus' }, e.photo ? '…' : '+'));
    }
    if (o.interactive) {
      fr.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (S.sel !== slot) select(slot);
        else if (!e.photo) pick(slot);
      });
      fr.addEventListener('dragover', function (ev) { ev.preventDefault(); fr.classList.add('drop'); });
      fr.addEventListener('dragleave', function () { fr.classList.remove('drop'); });
      fr.addEventListener('drop', function (ev) {
        ev.preventDefault(); fr.classList.remove('drop');
        var pid = ev.dataTransfer && ev.dataTransfer.getData('text/x-zine-photo');
        if (pid && S.proj.photos[pid]) place(slot, pid);
        else if (ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files.length) { S.sel = slot; addFiles(ev.dataTransfer.files, slot); }
      });
    }
    return fr;
  }

  function textEl(e, scale, o, pageH) {
    var empty = !e.text;
    if (empty && !o.interactive) return null;
    var fid = e.font === 'title' ? S.proj.s.fontTitle : S.proj.s.fontBody;
    var st = 'left:' + (e.x * scale) + 'px;width:' + (e.w * scale) + 'px;font-size:' + (e.size * scale / PT) + 'px;line-height:' + e.lineH +
      ';font-family:' + fontCss(fid, e.bold) + ';color:' + e.color + ';';
    st += e.anchor === 'bottom' ? 'bottom:' + ((pageH - e.y) * scale) + 'px' : 'top:' + (e.y * scale) + 'px';
    var t = h('div', { class: 'tx' + (empty ? ' ph' : '') + (e.color === '#ffffff' ? ' light' : ''), style: st });
    t.textContent = empty ? e.ph : e.text;
    return t;
  }

  function pageEl(lay, scale, o) {
    var cls = 'pg' + (o.selected ? ' sel' : '') + (o.bleedVisible ? ' vis' : '');
    var el = h('div', { class: cls, style: 'width:' + (lay.w * scale) + 'px;height:' + (lay.h * scale) + 'px' });
    lay.els.forEach(function (e) {
      var c = e.type === 'photo' ? frameEl(e, scale, o) : textEl(e, scale, o, lay.h);
      if (c) el.append(c);
    });
    if (o.interactive) el.addEventListener('click', function () { select(lay.n); });
    return el;
  }

  function select(slot) {
    S.sel = slot; renderBody(); renderInspector();
  }

  /* ---------- crop gestures ---------- */
  function attachCrop(fr, img, slot, meta, e, scale) {
    var pts = {}, count = 0, startDist = 0, startZ = 1, crop = slotCrop(slot);
    fr.style.touchAction = 'none'; fr.classList.add('grab');
    function apply() { applyCropImg(img, meta, crop, e, scale); }
    function done() { save(); var z = $('#zoom'); if (z) z.value = crop.z; }
    fr.addEventListener('pointerdown', function (ev) {
      try { fr.setPointerCapture(ev.pointerId); } catch (x) { }
      if (!pts[ev.pointerId]) count++;
      pts[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      if (count === 2) {
        var a = Object.keys(pts).map(function (k) { return pts[k]; });
        startDist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1; startZ = crop.z;
      }
    });
    fr.addEventListener('pointermove', function (ev) {
      var p = pts[ev.pointerId]; if (!p) return;
      var nx = { x: ev.clientX, y: ev.clientY };
      if (count === 1) {
        var r = Z.cropRegion(meta.w, meta.h, crop, e.w / e.h), k = e.w * scale / r.sw;
        crop.cx -= (nx.x - p.x) / (k * meta.w);
        crop.cy -= (nx.y - p.y) / (k * meta.h);
        crop.cx = Z.clamp(crop.cx, 0, 1); crop.cy = Z.clamp(crop.cy, 0, 1);
      } else if (count === 2) {
        pts[ev.pointerId] = nx;
        var a = Object.keys(pts).map(function (k2) { return pts[k2]; });
        crop.z = Z.clamp(startZ * (Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) / startDist), 1, 4);
      }
      pts[ev.pointerId] = nx;
      apply();
    });
    function up(ev) {
      if (pts[ev.pointerId]) { delete pts[ev.pointerId]; count--; if (count <= 0) { count = 0; done(); } }
    }
    fr.addEventListener('pointerup', up); fr.addEventListener('pointercancel', up);
    fr.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      crop.z = Z.clamp(crop.z * Math.exp(-ev.deltaY * 0.002), 1, 4); apply(); done();
    }, { passive: false });
  }

  /* ---------- body: pages ---------- */
  function renderBody() {
    if (!bodyEl) return;
    if (S.tab === 'pages') drawPages();
    else if (S.tab === 'photos') drawPhotos();
    else if (S.tab === 'sheets') drawSheets();
    else if (S.tab === 'settings') drawSettings();
    else drawExport();
  }

  function drawPages() {
    var p = S.proj, s = p.s, N = s.pages, W = s.w, H = s.h;
    var avail = Math.max(240, bodyEl.clientWidth - 32);
    var scale = Z.clamp(avail / (2 * W), 4, 26);
    var sp = Z.spreadInfo(p), wr = Z.wrapInfo(p);
    var rows = [], n;
    // a wrapped cover is shown as one wide row up front: back cover left, front cover right
    if (wr.on) rows.push([N, 1]); else rows.push([null, 1]);
    for (n = 2; n < N; n += 2) rows.push([n, n + 1]);
    if (!wr.on) rows.push([N, null]);
    var wrap = h('div', { class: 'spreads' });
    rows.forEach(function (r) {
      var row = h('div', { class: 'spread', style: 'width:' + (2 * W * scale) + 'px' });
      var wide = r[0] != null && Z.wideAt(p, r[0]);
      if (wide) {
        var lay = Z.layoutSpread(p, { bleed: 0 }, wide);
        lay.n = wide;
        var el = pageEl(lay, scale, { interactive: true, selected: S.sel === wide });
        el.classList.add('wide');
        el.append(h('div', { class: 'fold' }));
        row.append(el);
        row.append(h('div', { class: 'pn', style: 'left:0' }, wide === 'wrap' ? N + ' back' : r[0] + '–' + r[1]));
        if (wide === 'wrap') row.append(h('div', { class: 'pn', style: 'right:0' }, '1 front'));
      } else {
        r.forEach(function (pn, i) {
          if (pn == null) { row.append(h('div', { class: 'pg ghost', style: 'width:' + (W * scale) + 'px;height:' + (H * scale) + 'px' })); return; }
          var lay2 = Z.layoutPage(p, pn, { bleed: 0 });
          var pe = pageEl(lay2, scale, { interactive: true, selected: slotPage(S.sel) === pn });
          row.append(pe);
        });
        r.forEach(function (pn, i) { if (pn != null) row.append(h('div', { class: 'pn', style: (i === 0 ? 'left:0' : 'right:0') }, pn)); });
      }
      wrap.append(h('div', { class: 'spread-wrap' }, row));
    });
    bodyEl.replaceChildren(wrap);
  }

  /* ---------- inspector ---------- */
  function renderInspector() {
    if (!inspEl) return;
    var edEl = inspEl.parentNode; if (edEl) edEl.classList.toggle('has-insp', S.tab === 'pages' && S.sel != null);
    if (S.tab !== 'pages') { inspEl.className = 'empty'; inspEl.replaceChildren(); return; }
    var slot = S.sel, p = S.proj, kids = [];
    inspEl.className = '';
    var close = h('button', { class: 'btn small close', onClick: function () { S.sel = null; renderBody(); renderInspector(); } }, 'Done');
    if (slot == null) { inspEl.className = 'empty'; inspEl.replaceChildren(); return; }
    kids.push(h('div', { class: 'insp-head' }, h('strong', {}, slotLabel(slot)), close));

    var pn = slotPage(slot), role = isWide(slot) ? slot : Z.pageRole(p, pn);
    var presets = isWide(slot) ? Z.SPREAD_PRESETS : Z.PRESETS;
    var cap = function (t) { return t.charAt(0).toUpperCase() + t.slice(1); };

    if (role !== 'cover' && !isWide(role)) {
      var kind = Z.getPage(p, pn).kind;
      kids.push(h('div', { class: 'seg' }, ['photo', 'text', 'blank'].map(function (k) {
        return h('button', { class: kind === k ? 'on' : '', onClick: function () { slotObj(pn).kind = k; S.sel = pn; save(); renderBody(); renderInspector(); } }, cap(k));
      })));
    }
    var jb = joinButton(pn);
    if (jb) kids.push(h('div', { class: 'row-btns' }, jb));

    if (role === 'cover' || role === 'photo' || isWide(role)) {
      var pgd = isWide(role) ? null : Z.getPage(p, pn), sub = subOf(slot);
      if (pgd) {
        kids.push(h('div', { class: 'row' }, h('span', { class: 'lab' }, 'Pictures'), h('div', { class: 'seg grow' }, [1, 2, 3].map(function (c) {
          return h('button', { class: pgd.count === c ? 'on' : '', onClick: function () { setCount(pn, c); } }, String(c));
        }))));
        if (pgd.count > 1) {
          kids.push(h('div', { class: 'row' }, h('span', { class: 'lab' }, 'Arrange'), h('div', { class: 'seg grow' }, [['row', 'Side by side'], ['column', 'Stacked']].map(function (d) {
            return h('button', { class: pgd.dir === d[0] ? 'on' : '', onClick: function () { slotObj(pn).dir = d[0]; save(); renderBody(); renderInspector(); } }, d[1]);
          }))));
          if (pgd.preset === 'fill page' || pgd.pics.slice(0, pgd.count - 1).some(function (q) { return q.preset === 'fill page'; }))
            kids.push(h('p', { class: 'mute small' }, 'With a filled picture the page is always split into equal parts.'));
          else kids.push(h('div', { class: 'row' }, h('span', { class: 'lab' }, 'Size'), h('div', { class: 'seg grow' },
            [['match', pgd.dir === 'row' ? 'Same height' : 'Same width'], ['equal', 'Equal space']].map(function (d) {
              return h('button', { class: pgd.fit === d[0] ? 'on' : '', onClick: function () { slotObj(pn).fit = d[0]; save(); renderBody(); renderInspector(); } }, d[1]);
            }))));
          var gapOut = h('output', {}, Z.round1(pgd.gap) + ' cm');
          kids.push(h('label', { class: 'row' }, h('span', { class: 'lab' }, 'Gap'),
            h('input', { type: 'range', min: 0, max: 3, step: 0.1, value: pgd.gap, onInput: function (e) {
              slotObj(pn).gap = +e.target.value; gapOut.textContent = Z.round1(+e.target.value) + ' cm'; save(); drawPages();
            } }), gapOut));
        }
      }

      var cur = slot === 'spread' ? p.s.spreadPreset : slot === 'wrap' ? p.s.wrapPreset : sub ? pgd.pics[sub.i - 1].preset : pgd.preset;
      kids.push.apply(kids, frameRows(pgd && pgd.count > 1 ? 'Frame ' + (sub ? sub.i + 1 : 1) : 'Frame', cur, presets, function (v) {
        if (slot === 'spread') p.s.spreadPreset = v;
        else if (slot === 'wrap') p.s.wrapPreset = v;
        else slotObj(slot).preset = v;
        save(); renderBody(); renderInspector();
      }));

      var has = !!slotPhoto(slot);
      kids.push(h('div', { class: 'row-btns' },
        h('button', { class: 'btn primary', onClick: function () { pick(slot); } }, has ? 'Replace photo…' : 'Choose photos…'),
        has ? h('button', { class: 'btn', onClick: function () { slotObj(slot).photo = null; save(); renderBody(); renderInspector(); } }, 'Remove') : null));
      var pool = Z.unplacedPhotos(p);
      if (pool.length) {
        kids.push(h('p', { class: 'mute small' }, 'Unplaced photos: tap one to put it here.'));
        kids.push(h('div', { class: 'thumbs small' }, pool.map(function (id) { return thumbEl(id, { drag: true, onClick: function () { place(slot, id); } }); })));
      }
      if (!has) kids.push(h('p', { class: 'mute small' }, 'Pick several at once and they fill the next empty photo frames in order; the rest wait in unplaced photos. On a computer you can also drop files onto a frame.'));
      if (has) {
        var crop = slotCrop(slot);
        kids.push(h('label', { class: 'row' }, h('span', { class: 'lab' }, 'Zoom'),
          h('input', { id: 'zoom', type: 'range', min: 1, max: 4, step: 0.01, value: crop.z, onInput: function (e) {
            crop.z = +e.target.value; save(); drawPages();
          } })));
        kids.push(h('p', { class: 'mute small' }, 'Drag the photo in its frame to move it. Pinch or scroll to zoom.'));
        kids.push(h('div', { class: 'row-btns' },
          h('button', { class: 'btn small', onClick: function () { crop.cx = 0.5; crop.cy = 0.5; crop.z = 1; save(); renderBody(); renderInspector(); } }, 'Reset crop'),
          h('button', { class: 'btn small', onClick: function () { moveSlot(slot, -1); } }, '◀ Earlier'),
          h('button', { class: 'btn small', onClick: function () { moveSlot(slot, 1); } }, 'Later ▶')));
      }
      if (role === 'cover' || role === 'wrap') {
        kids.push(h('label', { class: 'row' }, h('span', { class: 'lab' }, 'Title'),
          h('input', { type: 'text', value: p.title, onInput: function (e) { p.title = e.target.value; save(); drawPages(); } })));
        kids.push(h('label', { class: 'row' }, h('span', { class: 'lab' }, 'Name, year'),
          h('input', { type: 'text', value: p.byline, onInput: function (e) { p.byline = e.target.value; save(); drawPages(); } })));
      } else if (role === 'photo' && Z.layoutPage(p, pn).els.some(function (e) { return e.field === 'caption'; })) {
        kids.push(h('label', { class: 'row' }, h('span', { class: 'lab' }, 'Caption'),
          h('input', { type: 'text', value: Z.getPage(p, pn).caption, onInput: function (e) { slotObj(pn).caption = e.target.value; save(); drawPages(); } })));
      }
    } else if (role === 'text') {
      var ta = h('textarea', { rows: 6, value: Z.getPage(p, slot).text, onInput: function (e) { slotObj(slot).text = e.target.value; save(); drawPages(); } });
      kids.push(h('label', { class: 'row col' }, h('span', { class: 'lab' }, 'Text'), ta));
    } else if (role === 'blank') {
      kids.push(h('p', { class: 'mute' }, 'Blank page.'));
    }
    inspEl.replaceChildren.apply(inspEl, kids);
  }

  /* Two menus for one frame preset: fill page / portrait / landscape, then the ratio (hidden for fill page). */
  function frameRows(label, cur, presets, set) {
    var cap = function (t) { return t.charAt(0).toUpperCase() + t.slice(1); };
    var parts = cur.split(' '), orient = cur === 'fill page' ? cur : parts[0], ratio = cur === 'fill page' ? null : parts[1];
    var orients = ['fill page'].concat(Z.ORIENTS).filter(function (o) {
      return o === 'fill page' ? presets.indexOf(o) >= 0 : presets.some(function (t) { return t.indexOf(o + ' ') === 0; });
    });
    var oSel = h('select', { onChange: function () {
      var o = oSel.value;
      if (o === 'fill page') return set(o);
      var r = ratio && presets.indexOf(o + ' ' + ratio) >= 0 ? ratio : '4:3';
      set(o + ' ' + r);
    } }, orients.map(function (o) { return h('option', { value: o }, cap(o)); }));
    oSel.value = orient;
    var rows = [h('label', { class: 'row' }, h('span', { class: 'lab' }, label), oSel)];
    if (ratio) {
      var rSel = h('select', { onChange: function () { set(orient + ' ' + rSel.value); } },
        Z.RATIOS.filter(function (r) { return presets.indexOf(orient + ' ' + r) >= 0; }).map(function (r) { return h('option', { value: r }, r); }));
      rSel.value = ratio;
      rows.push(h('label', { class: 'row' }, h('span', { class: 'lab' }, 'Aspect ratio'), rSel));
    }
    return rows;
  }

  /* Number of pictures on a page; pictures beyond the count go to the unplaced photos, their frames stay. */
  function setCount(n, c) {
    var pg = Z.getPage(S.proj, n), pics = slotObj(n).pics || [], i;
    slotObj(n).count = c;
    for (i = c - 1; i < pics.length; i++) if (pics[i] && pics[i].photo) { pics[i].photo = null; pics[i].crop = { cx: 0.5, cy: 0.5, z: 1 }; }
    // a newly shown picture starts with the first picture's frame
    for (i = pg.count; i < c; i++) if (!slotObj(n + ':' + i).preset) slotObj(n + ':' + i).preset = pg.preset;
    var sub = subOf(S.sel);
    if (sub && sub.n === n && sub.i >= c) S.sel = n;
    save(); renderBody(); renderInspector();
  }

  /* Split a two-page picture into single pages, or join single pages into one; the picture moves along. */
  function setWide(key, on) {
    var p = S.proj, info = key === 'wrap' ? Z.wrapInfo(p) : Z.spreadInfo(p), page = key === 'wrap' ? 1 : info.left;
    var wide = p[key], pg = slotObj(page);
    if (on && !wide.photo && Z.getPage(p, page).photo) { wide.photo = pg.photo; wide.crop = { cx: 0.5, cy: 0.5, z: 1 }; pg.photo = null; }
    if (!on && wide.photo && !Z.getPage(p, page).photo) { pg.photo = wide.photo; pg.crop = { cx: 0.5, cy: 0.5, z: 1 }; pg.kind = 'photo'; wide.photo = null; }
    setS(key + 'On', on);
    S.sel = on ? key : page;
    renderBody(); renderInspector();
  }

  function joinButton(slot) {
    var p = S.proj, N = p.s.pages, sp = Z.spreadInfo(p);
    if (slot === 'spread') return h('button', { class: 'btn small', onClick: function () { setWide('spread', false); } }, 'Split into two pages');
    if (slot === 'wrap') return h('button', { class: 'btn small', onClick: function () { setWide('wrap', false); } }, 'Split into separate covers');
    if (slot === 1 || slot === N) return h('button', { class: 'btn small', onClick: function () { setWide('wrap', true); } }, 'Wrap one picture around back and front');
    if (N >= 8 && (slot === sp.left || slot === sp.right)) return h('button', { class: 'btn small', onClick: function () { setWide('spread', true); } }, 'Join pages ' + sp.left + '–' + sp.right + ' as one spread');
    return null;
  }

  function moveSlot(slot, dir) {
    var list = Z.photoPages(S.proj), i = list.indexOf(slot), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    var a = slotObj(list[i]), b = slotObj(list[j]);
    // captions belong to the page, so they only travel between first pictures
    (subOf(list[i]) || subOf(list[j]) ? ['photo', 'crop'] : ['photo', 'crop', 'caption']).forEach(function (k) { var t = a[k]; a[k] = b[k]; b[k] = t; });
    S.sel = list[j]; save(); renderBody(); renderInspector();
  }

  /* ---------- body: photos ---------- */
  function drawPhotos() {
    var p = S.proj, refs = Z.photoRefs(p), pool = Z.unplacedPhotos(p), shown = Z.photoPages(p);
    var all = Object.keys(p.photos), placed = all.filter(function (id) { return refs[id]; });
    bodyEl.replaceChildren(h('div', { class: 'photos' },
      h('p', {}, all.length + ' photo' + (all.length === 1 ? '' : 's') + ' · ' + pool.length + ' unplaced'),
      h('div', { class: 'row-btns' },
        h('button', { class: 'btn primary', onClick: function () { pick(null); } }, 'Add photos…'),
        pool.length ? h('button', { class: 'btn danger', onClick: function () {
          if (confirm('Delete ' + pool.length + ' unplaced photo' + (pool.length === 1 ? '' : 's') + ' from the zine and this device?')) deletePhotos(pool);
        } }, 'Delete unplaced…') : null),
      h('h3', {}, 'Unplaced'),
      pool.length ? h('div', { class: 'thumbs' }, pool.map(function (id) { return thumbEl(id, { del: true, drag: true }); }))
        : h('p', { class: 'mute small' }, 'Photos that don’t fit a frame, or that leave one, wait here. Select a frame on the Pages tab to place them.'),
      placed.length ? h('h3', {}, 'Placed') : null,
      placed.length ? h('div', { class: 'thumbs' }, placed.map(function (id) {
        var slot = refs[id][0], vis = shown.indexOf(slot) >= 0;
        return thumbEl(id, { label: slotLabel(slot) + (vis ? '' : ' (hidden)'), onClick: vis ? function () { setTab('pages'); select(slot); } : null });
      })) : null));
  }

  /* ---------- body: sheets preview ---------- */
  function drawSheets() {
    var p = S.proj, s = p.s, geo = Z.sheetGeo(p), sheets = Z.imposition(p);
    var avail = Math.max(260, bodyEl.clientWidth - 32);
    var scale = Z.clamp(avail / geo.paper.w, 2, 16);
    var wrap = h('div', { class: 'sheets' });
    wrap.append(h('p', { class: 'mute small' }, 'Preview of what gets printed. Print front and back sides on the same sheet of paper, flipping left to right. Photos extend past the trim into the bleed.'));
    sheets.forEach(function (sh) {
      ['front', 'back'].forEach(function (side) {
        var face = side === 'front' ? sh.front : sh.back;
        wrap.append(h('div', { class: 'sheet-label' }, Z.sheetLabel(p, sh, side, geo)));
        wrap.append(paperEl(p, geo, scale, function (box) {
          var wide = Z.wideAt(p, face.l);
          if (wide) {
            var sl = Z.layoutSpread(p, null, wide); var el = pageEl(sl, scale, { bleedVisible: true }); el.classList.add('wide'); el.style.position = 'absolute'; el.style.left = 0; box.append(el);
          } else {
            var a = pageEl(Z.layoutPage(p, face.l, { creep: sh.shift }), scale, { bleedVisible: true });
            var b = pageEl(Z.layoutPage(p, face.r, { creep: sh.shift }), scale, { bleedVisible: true });
            a.style.position = 'absolute'; a.style.left = 0; b.style.position = 'absolute'; b.style.left = (s.w * scale) + 'px';
            box.append(a, b);
          }
        }, face));
      });
    });
    var jg = Z.jigInfo(p);
    wrap.append(h('div', { class: 'sheet-label' }, 'PIERCING JIG · ' + jg.n + ' SEWING HOLES · SPINE ' + Z.round1(s.h) + ' CM · ' + geo.paper.name + ' ' + geo.paper.orient.toUpperCase()));
    wrap.append(jigEl(p, geo, jg, scale));
    bodyEl.replaceChildren(wrap);
  }

  function mark(x, y, w, hh, scale) {
    return h('div', { class: 'mk', style: 'left:' + (x * scale) + 'px;top:' + (y * scale) + 'px;width:' + Math.max(1, w * scale) + 'px;height:' + Math.max(1, hh * scale) + 'px' });
  }

  function paperEl(p, geo, scale, fill, face) {
    var s = p.s, paper = h('div', { class: 'paper', style: 'width:' + (geo.paper.w * scale) + 'px;height:' + (geo.paper.h * scale) + 'px' });
    var box = h('div', { class: 'sheetbox', style: 'left:' + (geo.MX * scale) + 'px;top:' + (geo.MT * scale) + 'px;width:' + (2 * s.w * scale) + 'px;height:' + (s.h * scale) + 'px' });
    fill(box); paper.append(box);
    var g = Math.max(0.3, s.bleed + 0.1), len = 0.8, x0 = geo.MX, x1 = geo.MX + 2 * s.w, y0 = geo.MT, y1 = geo.MT + s.h, t = 1 / scale;
    [[x0, -1], [x1, 1]].forEach(function (c) { [[y0, -1], [y1, 1]].forEach(function (d) {
      paper.append(mark(c[1] < 0 ? c[0] - g - len : c[0] + g, d[0], len, t, scale));
      paper.append(mark(c[0], d[1] < 0 ? d[0] - g - len : d[0] + g, t, len, scale));
    }); });
    paper.append(mark(geo.MX + s.w, y0 - g - len, t, len, scale), mark(geo.MX + s.w, y1 + g, t, len, scale));
    if (face) [[face.l, false], [face.r, true]].forEach(function (q) {
      var role = Z.pageRole(p, q[0]);
      if (q[0] === 1 || q[0] === s.pages || role === 'spread-l' || role === 'spread-r') return;
      var n = h('div', { class: 'num', style: 'top:' + ((y1 + 1.4) * scale) + 'px;font-size:' + (7 * scale / PT) + 'px;' + (q[1] ? 'right:' + ((geo.paper.w - x1 + s.margin) * scale) + 'px' : 'left:' + ((x0 + s.margin) * scale) + 'px') }, q[0]);
      paper.append(n);
    });
    return paper;
  }

  function jigEl(p, geo, jg, scale) {
    var s = p.s, paper = h('div', { class: 'paper', style: 'width:' + (geo.paper.w * scale) + 'px;height:' + (geo.paper.h * scale) + 'px' });
    var SX = (geo.paper.w - jg.width) / 2, mid = geo.paper.w / 2, MT = geo.MT, H = s.h, g = Math.max(0.3, s.bleed + 0.1), len = 0.8, t = 1 / scale;
    var strip = h('div', { class: 'strip', style: 'left:' + (SX * scale) + 'px;top:' + (MT * scale) + 'px;width:' + (jg.width * scale) + 'px;height:' + (H * scale) + 'px' });
    paper.append(strip, h('div', { class: 'dash', style: 'left:' + (mid * scale) + 'px;top:' + (MT * scale) + 'px;height:' + (H * scale) + 'px' }));
    [[SX, -1], [SX + jg.width, 1]].forEach(function (c) { [[MT, -1], [MT + H, 1]].forEach(function (d) {
      paper.append(mark(c[1] < 0 ? c[0] - g - len : c[0] + g, d[0], len, t, scale));
      paper.append(mark(c[0], d[1] < 0 ? d[0] - g - len : d[0] + g, t, len, scale));
    }); });
    jg.holes.forEach(function (ho) {
      var y = MT + ho.d;
      paper.append(h('div', { class: 'hole', style: 'left:' + (mid * scale) + 'px;top:' + (y * scale) + 'px' }));
      paper.append(h('div', { class: 'num', style: 'left:' + ((mid + 0.7) * scale) + 'px;top:' + ((y - 0.15) * scale) + 'px;font-size:' + (7 * scale / PT) + 'px' }, ho.k + ' · ' + Z.round1(ho.d) + ' cm'));
    });
    return paper;
  }

  /* ---------- body: settings ---------- */
  var readoutEl = null;
  function updateReadouts() {
    if (!readoutEl) return;
    var p = S.proj, geo = Z.sheetGeo(p), jg = Z.jigInfo(p), sp = Z.spreadInfo(p);
    readoutEl.textContent = 'Finished page ' + Z.round1(p.s.w) + ' × ' + Z.round1(p.s.h) + ' cm · sheet ' + Z.round1(2 * p.s.w) + ' × ' + Z.round1(p.s.h) + ' cm on ' +
      geo.paper.name + ' ' + geo.paper.orient + (geo.paper.fits ? '' : ' (does not fit!)') + ' · ' + (p.s.pages / 4) + ' sheets · ' + jg.n + ' sewing holes' +
      (sp.on ? ' · middle spread on pages ' + sp.left + '–' + sp.right : '') +
      (p.s.wrapOn ? ' · cover wraps around to page ' + p.s.pages : '');
  }

  function setS(key, val) {
    S.proj.s[key] = val; S.proj.s = Z.normalizeSettings(S.proj.s);
    var sub = subOf(S.sel);
    if (sub && (sub.n > S.proj.s.pages || Z.wideAt(S.proj, sub.n))) S.sel = sub.n;
    if (typeof S.sel === 'number') { if (S.sel > S.proj.s.pages) S.sel = 1; var wd = Z.wideAt(S.proj, S.sel); if (wd) S.sel = wd; }
    if (S.sel === 'spread' && !Z.spreadInfo(S.proj).on) S.sel = Z.spreadInfo(S.proj).left;
    if (S.sel === 'wrap' && !S.proj.s.wrapOn) S.sel = 1;
    save(); updateReadouts();
  }

  function sliderRow(label, key, min, max, step, fmt, scaleOut) {
    var s = S.proj.s;
    var out = h('output', {}, fmt(s[key]));
    var inp = h('input', { type: 'range', min: min, max: max, step: step, value: s[key], onInput: function () {
      setS(key, +inp.value); out.textContent = fmt(S.proj.s[key]);
    } });
    return h('label', { class: 'row' }, h('span', { class: 'lab' }, label), inp, out);
  }

  function selectRow(label, key, options, fmt) {
    var s = S.proj.s;
    var sel = h('select', { onChange: function () { var v = sel.value; setS(key, /^\d+$/.test(v) && key === 'holes' ? +v : v); } },
      options.map(function (o) { return h('option', { value: o[0] }, o[1]); }));
    sel.value = String(s[key]);
    return h('label', { class: 'row' }, h('span', { class: 'lab' }, label), sel);
  }

  function checkRow(label, key) {
    var cb = h('input', { type: 'checkbox', onChange: function () {
      if (key === 'spreadOn' || key === 'wrapOn') setWide(key.slice(0, -2), cb.checked); else setS(key, cb.checked);
      renderBody2();
    } });
    cb.checked = !!S.proj.s[key];
    return h('label', { class: 'row check' }, cb, h('span', {}, label));
  }
  function renderBody2() { /* settings panel stays; nothing else to redraw */ }

  function drawSettings() {
    var p = S.proj;
    var presetSel = h('select', { onChange: function (e) {
      var v = e.target.value; if (!v) return; var d = v.split('x'); setS('w', +d[0]); setS('h', +d[1]); drawSettings(); } },
      h('option', { value: '' }, 'Quick sizes…'),
      [['15x20', '15 × 20 cm (3:4)'], ['12x24', '12 × 24 cm'], ['10.5x14.8', 'A6 10.5 × 14.8 cm'], ['14.8x21', 'A5 14.8 × 21 cm'], ['20x20', '20 × 20 cm square'], ['21x29.7', 'A4 21 × 29.7 cm'], ['10x15', '10 × 15 cm']]
        .map(function (o) { return h('option', { value: o[0] }, o[1]); }));
    var fontOpts = Z.FONTS.map(function (f) { return [f.id, f.name]; });
    var holes = [['auto', 'Automatic from page height'], ['3', '3'], ['5', '5'], ['7', '7'], ['9', '9'], ['11', '11']];
    var paperOpts = [['auto', 'Smallest DIN A that fits']].concat(Z.DIN.map(function (d) { return [d[0], d[0]]; }));
    readoutEl = h('div', { class: 'readout' });
    var wrap = h('div', { class: 'settings' },
      readoutEl,
      h('section', {}, h('h3', {}, 'Page size'),
        presetSel,
        sliderRow('Width', 'w', 8, 30, 0.5, function (v) { return Z.round1(v) + ' cm'; }),
        sliderRow('Height', 'h', 8, 30, 0.5, function (v) { return Z.round1(v) + ' cm'; }),
        sliderRow('Pages', 'pages', 4, 32, 4, function (v) { return v; }),
        sliderRow('Margin', 'margin', 0.5, 3, 0.1, function (v) { return Z.round1(v) + ' cm'; }),
        sliderRow('Bleed', 'bleed', 0, 0.5, 0.05, function (v) { return Math.round(v * 100) / 10 + ' mm'; })),
      h('section', {}, h('h3', {}, 'Binding and paper'),
        sliderRow('Paper thickness', 'thickness', 0, 0.5, 0.01, function (v) { return v.toFixed(2) + ' mm'; }),
        h('p', { class: 'mute small' }, 'Creep: inner sheets stick out further when folded, so their content shifts toward the spine by this much per sheet. 0.10 mm is about 80 g uncoated, 0.18 mm about 150 g. Leave at 0 if unsure.'),
        selectRow('Paper size', 'paper', paperOpts),
        selectRow('Sewing holes', 'holes', holes)),
      h('section', {}, h('h3', {}, 'Middle spread'),
        checkRow('One picture across the middle two pages (needs 8+ pages). Off: two separate pages with their own pictures', 'spreadOn'),
        frameRows('Spread frame', p.s.spreadPreset, Z.SPREAD_PRESETS, function (v) { setS('spreadPreset', v); drawSettings(); })),
      h('section', {}, h('h3', {}, 'Cover'),
        checkRow('One picture wrapping around the back and front cover', 'wrapOn'),
        frameRows('Wrap frame', p.s.wrapPreset, Z.SPREAD_PRESETS, function (v) { setS('wrapPreset', v); drawSettings(); })),
      h('section', {}, h('h3', {}, 'Type'),
        selectRow('Body font', 'fontBody', fontOpts),
        selectRow('Title font', 'fontTitle', fontOpts),
        checkRow('Bold title', 'titleBold'),
        sliderRow('Body size', 'bodySize', 6, 14, 0.5, function (v) { return v + ' pt'; }),
        sliderRow('Title size', 'titleSize', 12, 48, 1, function (v) { return v + ' pt'; })));
    bodyEl.replaceChildren(wrap);
    updateReadouts();
  }

  /* ---------- body: export ---------- */
  function safeName() { return (S.proj.name || 'zine').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'zine'; }

  function drawExport() {
    var p = S.proj;
    var empties = 0, n;
    Z.photoPages(p).forEach(function (sl) { if (!slotPhoto(sl)) empties++; });
    var prog = h('progress', { id: 'prog', max: 1, value: 0, class: 'hidden' });
    var status = h('div', { id: 'status', class: 'mute small' });
    var resBox = h('div', { id: 'result' });
    var dpiSel = h('select', { onChange: function (e) { S.dpi = +e.target.value; } }, [300, 200, 150].map(function (d) { return h('option', { value: d }, d + ' dpi'); }));
    dpiSel.value = String(S.dpi);
    var cb = h('input', { type: 'checkbox', onChange: function () { S.showEmpty = cb.checked; } }); cb.checked = S.showEmpty;
    bodyEl.replaceChildren(h('div', { class: 'export' },
      h('p', {}, empties ? empties + ' photo frame' + (empties === 1 ? ' is' : 's are') + ' still empty.' : 'All photo frames are filled.'),
      h('div', { class: 'row-btns col' },
        h('button', { class: 'btn primary', onClick: function () { runExport('sheets'); } }, 'Imposed sheets for printing (PDF)'),
        h('button', { class: 'btn', onClick: function () { runExport('proof'); } }, 'Proof in reading order (PDF)'),
        h('button', { class: 'btn', onClick: exportZine }, 'Save project file (.zine)')),
      h('label', { class: 'row' }, h('span', { class: 'lab' }, 'Image quality'), dpiSel),
      h('label', { class: 'row check' }, cb, h('span', {}, 'Draw empty frames as light grey boxes')),
      prog, status, resBox,
      h('div', { class: 'mute small' },
        h('p', {}, 'Print the sheets PDF double-sided at 100% (no “fit to page”), flipping on the short edge for landscape paper. Fold each sheet, nest them in order, pierce with the jig, sew, then trim along the outer cut marks.'),
        h('p', {}, 'Photos are cropped to their frames and re-saved as high-quality JPEG. Colour stays sRGB; ask your print shop if they need a profile.'))));
    if (S.result) showResult();
  }

  function setProgress(f, msg) {
    var pr = $('#prog'), st = $('#status');
    if (pr) { pr.classList.remove('hidden'); pr.value = f; }
    if (st) st.textContent = msg || '';
  }

  function showResult() {
    var box = $('#result'); if (!box || !S.result) return;
    var r = S.result, canShare = false;
    try { canShare = navigator.canShare && navigator.canShare({ files: [new File([r.blob], r.name, { type: r.blob.type })] }); } catch (e) { }
    box.replaceChildren(h('div', { class: 'result' },
      h('strong', {}, r.name), h('span', { class: 'mute small' }, ' · ' + (r.blob.size / 1048576).toFixed(1) + ' MB'),
      h('div', { class: 'row-btns' },
        h('a', { class: 'btn primary', href: r.url, download: r.name, target: '_blank', rel: 'noopener' }, 'Download / open'),
        canShare ? h('button', { class: 'btn', onClick: function () {
          navigator.share({ files: [new File([r.blob], r.name, { type: r.blob.type })], title: r.name }).catch(function () { });
        } }, 'Share / Save to Files') : null)));
  }

  function offerFile(blob, name) {
    if (S.result) { try { URL.revokeObjectURL(S.result.url); } catch (e) { } }
    S.result = { blob: blob, name: name, url: URL.createObjectURL(blob) };
    showResult();
  }

  var lastImg = { id: null, img: null, url: null };
  function loadOrig(photoId) {
    if (lastImg.id === photoId && lastImg.img) return Promise.resolve(lastImg.img);
    if (lastImg.url) { lastImg.img && (lastImg.img.src = ''); URL.revokeObjectURL(lastImg.url); lastImg = { id: null, img: null, url: null }; }
    return Store.getPhoto(S.proj.id, photoId).then(function (rec) {
      if (!rec || !rec.orig) throw new Error('photo missing');
      var url = URL.createObjectURL(rec.orig), img = new Image(); img.src = url;
      return img.decode().then(function () { lastImg = { id: photoId, img: img, url: url }; return img; });
    });
  }

  function makeIO() {
    var canvas = document.createElement('canvas');
    return {
      PDFLib: window.PDFLib, fontkit: window.fontkit, showEmpty: S.showEmpty,
      loadFont: function (id, bold) {
        var key = id + '-' + (bold ? '700' : '400');
        function viaScript() {
          return new Promise(function (res, rej) {
            if (window.ZFONTS && window.ZFONTS[key]) return res();
            var sc = document.createElement('script'); sc.src = 'f-' + key + '.js';
            sc.onload = function () { res(); }; sc.onerror = function () { rej(new Error('Could not load font ' + key)); };
            document.head.append(sc);
          }).then(function () {
            var bin = atob(window.ZFONTS[key]), u = new Uint8Array(bin.length), i;
            for (i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
            return u;
          });
        }
        // Opened straight from disk (file://), fetch() is blocked in most browsers; use the script fallback.
        if (location.protocol === 'file:') return viaScript();
        return fetch('f-' + key + '.ttf').then(function (r) { if (!r.ok) throw new Error('font'); return r.arrayBuffer(); })
          .then(function (b) { return new Uint8Array(b); }, viaScript);
      },
      getCrop: function (photoId, crop, aspect, pxW, pxH) {
        return loadOrig(photoId).then(function (img) {
          var r = Z.cropRegion(img.naturalWidth, img.naturalHeight, crop, aspect);
          var scaleDpi = S.dpi / 300;
          var ow = Math.max(1, Math.min(Math.round(pxW * scaleDpi), Math.round(r.sw))), oh = Math.max(1, Math.round(ow / aspect));
          canvas.width = ow; canvas.height = oh;
          var ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, ow, oh);
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, ow, oh);
          return new Promise(function (res) { canvas.toBlob(res, 'image/jpeg', 0.92); }).then(function (b) { return b.arrayBuffer(); }).then(function (ab) { canvas.width = canvas.height = 1; return new Uint8Array(ab); });
        });
      },
      onProgress: setProgress
    };
  }

  function runExport(mode) {
    if (S.busy) return;
    if (!window.PDFLib || !window.fontkit) { toast('PDF libraries did not load. Check your connection and reload.', 5000); return; }
    S.busy = mode; setProgress(0.01, 'Starting…');
    flushSave().then(function () { return ZP.buildPdf(S.proj, mode, makeIO()); }).then(function (bytes) {
      offerFile(new Blob([bytes], { type: 'application/pdf' }), safeName() + (mode === 'sheets' ? '-sheets.pdf' : '-proof.pdf'));
      setProgress(1, 'Done.');
    }).catch(function (e) {
      setProgress(0, 'Export failed: ' + (e && e.message ? e.message : e));
    }).then(function () {
      S.busy = null;
      if (lastImg.url) { lastImg.img.src = ''; URL.revokeObjectURL(lastImg.url); lastImg = { id: null, img: null, url: null }; }
    });
  }

  function exportZine() {
    if (S.busy) return;
    S.busy = 'zine'; setProgress(0.05, 'Packing project…');
    flushSave().then(function () {
      var zip = new JSZip(), ids = Object.keys(S.proj.photos);
      zip.file('project.json', JSON.stringify(S.proj));
      return ids.reduce(function (chain, id, i) {
        return chain.then(function () { return Store.getPhoto(S.proj.id, id); }).then(function (rec) {
          if (rec && rec.orig) zip.file('photos/' + id, rec.orig);
          setProgress(0.05 + 0.85 * (i + 1) / ids.length, 'Packing photo ' + (i + 1) + ' of ' + ids.length);
        });
      }, Promise.resolve()).then(function () { return zip.generateAsync({ type: 'blob', compression: 'STORE' }); });
    }).then(function (blob) {
      offerFile(new Blob([blob], { type: 'application/octet-stream' }), safeName() + '.zine');
      setProgress(1, 'Done.');
    }).catch(function (e) { setProgress(0, 'Could not save: ' + (e && e.message || e)); }).then(function () { S.busy = null; });
  }

  zineInput.addEventListener('change', function () {
    var f = zineInput.files && zineInput.files[0]; zineInput.value = '';
    if (!f) return;
    toast('Opening project…', 0);
    JSZip.loadAsync(f).then(function (zip) {
      var pj = zip.file('project.json'); if (!pj) throw new Error('not a zine file');
      return pj.async('string').then(function (txt) {
        var p = JSON.parse(txt), oldPhotos = p.photos || {}, newId = Z.newId();
        p.id = newId; p.name = p.name || 'Imported zine'; p.s = Z.normalizeSettings(p.s); p.pages = p.pages || {};
        p.spread = p.spread || { photo: null, crop: { cx: 0.5, cy: 0.5, z: 1 } };
        p.wrap = p.wrap || { photo: null, crop: { cx: 0.5, cy: 0.5, z: 1 } };
        S.proj = p; p.photos = {};
        var ids = Object.keys(oldPhotos);
        return ids.reduce(function (chain, id, i) {
          return chain.then(function () {
            var zf = zip.file('photos/' + id); if (!zf) return;
            return zf.async('blob').then(function (b) {
              var file = new File([b], oldPhotos[id].name || 'photo', { type: oldPhotos[id].type || 'image/jpeg' });
              toast('Importing photo ' + (i + 1) + ' of ' + ids.length + '…', 0);
              return ingestAs(file, id);
            });
          });
        }, Promise.resolve()).then(function () { return Store.putProject({ id: p.id, name: p.name, updated: Date.now(), data: p }); }).then(function () { return p.id; });
      });
    }).then(function (id) { hideToast(); S.proj = null; return openProject(id); })
      .catch(function (e) { S.proj = null; toast('Could not open that file: ' + (e && e.message || e), 6000); });
  });

  function ingestAs(file, keepId) {
    var proj = S.proj;
    return ingest(file).then(function (newId) {
      // rename the photo to keep references in the project data valid
      return Store.getPhoto(proj.id, newId).then(function (rec) {
        var meta = proj.photos[newId]; delete proj.photos[newId];
        var url = S.urls[newId]; delete S.urls[newId]; if (url) URL.revokeObjectURL(url);
        proj.photos[keepId] = meta;
        return Store.putPhoto({ key: proj.id + '|' + keepId, projId: proj.id, id: keepId, orig: rec.orig, prev: rec.prev, w: rec.w, h: rec.h })
          .then(function () { return Store.deletePhoto(proj.id, newId); });
      });
    });
  }

  /* ---------- go ---------- */
  function init() {
    Store.open().then(function () {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () { });
      if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function () { });
      return showHome();
    });
    window.addEventListener('pagehide', function () { flushSave(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) flushSave(); });
  }
  window.__zine = { S: S, Z: Z };
  init();
})();
