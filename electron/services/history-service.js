'use strict';
const fs = require('fs');
const path = require('path');

/**
 * Local generation history. Uses SQLite via Node's built-in node:sqlite when
 * available (Electron 39 / Node 22+); otherwise falls back to an equivalent
 * JSON store in the same directory. The API is identical either way, records
 * survive restarts, and history is preserved across Excel imports and app
 * upgrades. Deleting a record never deletes the image file unless the caller
 * explicitly passes deleteFile to the file service.
 */
class HistoryService {
  constructor(userDataDir) {
    this.dir = path.join(userDataDir, 'database');
    fs.mkdirSync(this.dir, { recursive: true });
    this.db = null;
    this.jsonFile = path.join(this.dir, 'history.json');
    this.backend = 'json';
    try {
      const { DatabaseSync } = require('node:sqlite');
      this.db = new DatabaseSync(path.join(this.dir, 'history.sqlite'));
      this.db.exec(`CREATE TABLE IF NOT EXISTS generations (
        id TEXT PRIMARY KEY, prompt TEXT, negative_prompt TEXT,
        provider_id TEXT, provider_name TEXT, model_id TEXT, model_name TEXT,
        created_at TEXT, image_path TEXT, width INTEGER, height INTEGER,
        format TEXT, status TEXT, settings_json TEXT, favorite INTEGER DEFAULT 0
      )`);
      this.backend = 'sqlite';
    } catch { this.db = null; }
  }
  _jsonAll() {
    try { return JSON.parse(fs.readFileSync(this.jsonFile, 'utf8')); } catch { return []; }
  }
  _jsonSave(rows) { fs.writeFileSync(this.jsonFile, JSON.stringify(rows, null, 2)); }
  add(rec) {
    const row = { favorite: 0, ...rec };
    if (this.db) {
      this.db.prepare(`INSERT OR REPLACE INTO generations
        (id,prompt,negative_prompt,provider_id,provider_name,model_id,model_name,created_at,image_path,width,height,format,status,settings_json,favorite)
        VALUES (@id,@prompt,@negative_prompt,@provider_id,@provider_name,@model_id,@model_name,@created_at,@image_path,@width,@height,@format,@status,@settings_json,@favorite)`)
        .run({
          id: row.id, prompt: row.prompt || '', negative_prompt: row.negative_prompt || '',
          provider_id: row.provider_id || '', provider_name: row.provider_name || '',
          model_id: row.model_id || '', model_name: row.model_name || '',
          created_at: row.created_at, image_path: row.image_path,
          width: row.width ?? null, height: row.height ?? null,
          format: row.format || '', status: row.status || 'success',
          settings_json: JSON.stringify(row.settings || {}), favorite: row.favorite ? 1 : 0,
        });
    } else {
      const rows = this._jsonAll(); rows.unshift(row); this._jsonSave(rows);
    }
    return row;
  }
  list({ search = '', providerId = '', modelId = '', favoritesOnly = false } = {}) {
    let rows;
    if (this.db) {
      rows = this.db.prepare('SELECT * FROM generations ORDER BY created_at DESC').all()
        .map((r) => ({ ...r, settings: JSON.parse(r.settings_json || '{}'), favorite: !!r.favorite }));
    } else rows = this._jsonAll();
    const q = search.toLowerCase();
    return rows.filter((r) =>
      (!q || (r.prompt || '').toLowerCase().includes(q)) &&
      (!providerId || r.provider_id === providerId) &&
      (!modelId || r.model_id === modelId) &&
      (!favoritesOnly || r.favorite));
  }
  get(id) { return this.list().find((r) => r.id === id) || null; }
  remove(id) {
    const rec = this.get(id);
    if (!rec) return null;
    if (this.db) this.db.prepare('DELETE FROM generations WHERE id = ?').run(id);
    else this._jsonSave(this._jsonAll().filter((r) => r.id !== id));
    return rec;
  }
  toggleFavorite(id) {
    if (this.db) {
      const r = this.get(id); if (!r) return null;
      this.db.prepare('UPDATE generations SET favorite = ? WHERE id = ?').run(r.favorite ? 0 : 1, id);
    } else {
      const rows = this._jsonAll(); const r = rows.find((x) => x.id === id); if (!r) return null;
      r.favorite = r.favorite ? 0 : 1; this._jsonSave(rows);
    }
    return this.get(id);
  }
  clear() {
    if (this.db) this.db.prepare('DELETE FROM generations').run();
    else this._jsonSave([]);
  }
  count() { return this.list().length; }
}
module.exports = { HistoryService };
