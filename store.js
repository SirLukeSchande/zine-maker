/* IndexedDB storage: projects (JSON) and photos (original + preview blobs). Falls back to memory. */
(function (root) {
  'use strict';
  var db = null, mem = { projects: {}, photos: {} }, useMem = false;

  function open() {
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) { useMem = true; return resolve(null); }
      var r;
      try { r = root.indexedDB.open('zine-maker', 1); } catch (e) { useMem = true; return resolve(null); }
      r.onupgradeneeded = function () {
        var d = r.result;
        d.createObjectStore('projects', { keyPath: 'id' });
        var p = d.createObjectStore('photos', { keyPath: 'key' });
        p.createIndex('projId', 'projId', { unique: false });
      };
      r.onsuccess = function () { db = r.result; resolve(db); };
      r.onerror = function () { useMem = true; resolve(null); };
      r.onblocked = function () { useMem = true; resolve(null); };
    });
  }

  function run(store, mode, fn) {
    return new Promise(function (resolve, reject) {
      var t = db.transaction(store, mode), st = t.objectStore(store), req = fn(st);
      t.oncomplete = function () { resolve(req ? req.result : undefined); };
      t.onerror = function () { reject(t.error); };
      t.onabort = function () { reject(t.error || new Error('aborted')); };
    });
  }

  var api = {
    open: open,
    isMemory: function () { return useMem; },
    listProjects: function () {
      if (useMem) return Promise.resolve(Object.keys(mem.projects).map(function (k) { return mem.projects[k]; }));
      return run('projects', 'readonly', function (s) { return s.getAll(); });
    },
    getProject: function (id) {
      if (useMem) return Promise.resolve(mem.projects[id]);
      return run('projects', 'readonly', function (s) { return s.get(id); });
    },
    putProject: function (rec) {
      if (useMem) { mem.projects[rec.id] = rec; return Promise.resolve(); }
      return run('projects', 'readwrite', function (s) { return s.put(rec); });
    },
    putPhoto: function (rec) {
      if (useMem) { mem.photos[rec.key] = rec; return Promise.resolve(); }
      return run('photos', 'readwrite', function (s) { return s.put(rec); });
    },
    getPhoto: function (projId, id) {
      var key = projId + '|' + id;
      if (useMem) return Promise.resolve(mem.photos[key]);
      return run('photos', 'readonly', function (s) { return s.get(key); });
    },
    listPhotoIds: function (projId) {
      if (useMem) return Promise.resolve(Object.keys(mem.photos).filter(function (k) { return mem.photos[k].projId === projId; }).map(function (k) { return mem.photos[k].id; }));
      return run('photos', 'readonly', function (s) { return s.index('projId').getAllKeys(IDBKeyRange.only(projId)); })
        .then(function (keys) { return keys.map(function (k) { return String(k).split('|').slice(1).join('|'); }); });
    },
    deletePhoto: function (projId, id) {
      var key = projId + '|' + id;
      if (useMem) { delete mem.photos[key]; return Promise.resolve(); }
      return run('photos', 'readwrite', function (s) { return s.delete(key); });
    },
    deleteProject: function (id) {
      if (useMem) {
        delete mem.projects[id];
        Object.keys(mem.photos).forEach(function (k) { if (mem.photos[k].projId === id) delete mem.photos[k]; });
        return Promise.resolve();
      }
      return api.listPhotoIds(id).then(function (ids) {
        return Promise.all(ids.map(function (p) { return api.deletePhoto(id, p); }));
      }).then(function () { return run('projects', 'readwrite', function (s) { return s.delete(id); }); });
    }
  };
  root.ZS = api;
})(typeof self !== 'undefined' ? self : this);
