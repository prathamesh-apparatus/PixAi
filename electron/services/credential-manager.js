'use strict';
const fs = require('fs');
const path = require('path');

/**
 * Stores provider API keys separately from the provider inventory, encrypted
 * with Electron safeStorage (OS-backed: DPAPI on Windows, Keychain on macOS)
 * when available. Keys are never written into image-providers.json, never sent
 * to the renderer, and never logged.
 *
 * Honest note: on the user's own machine, a determined owner of that machine
 * can ultimately access their own credentials — safeStorage protects keys at
 * rest against casual disclosure, it does not make them unrecoverable.
 */
class CredentialManager {
  /** @param {string} credentialsDir @param {object|null} safeStorage electron.safeStorage or null */
  constructor(credentialsDir, safeStorage = null) {
    this.dir = credentialsDir;
    this.file = path.join(credentialsDir, 'credentials.json');
    this.safeStorage = safeStorage;
    this.cache = null;
  }
  _load() {
    if (this.cache) return this.cache;
    try { this.cache = JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch { this.cache = {}; }
    return this.cache;
  }
  _save() {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.cache, null, 2));
    fs.renameSync(tmp, this.file);
  }
  _encryptionAvailable() {
    try { return !!(this.safeStorage && this.safeStorage.isEncryptionAvailable()); }
    catch { return false; }
  }
  setKey(providerId, key) {
    if (!providerId || !key) return;
    const store = this._load();
    if (this._encryptionAvailable()) {
      store[providerId] = { enc: this.safeStorage.encryptString(key).toString('base64'), secure: true };
    } else {
      // Fallback only when the OS store is unavailable; marked as not secure.
      store[providerId] = { enc: Buffer.from(key, 'utf8').toString('base64'), secure: false };
    }
    this._save();
  }
  getKey(providerId) {
    const entry = this._load()[providerId];
    if (!entry) return null;
    try {
      if (entry.secure && this.safeStorage) return this.safeStorage.decryptString(Buffer.from(entry.enc, 'base64'));
      return Buffer.from(entry.enc, 'base64').toString('utf8');
    } catch { return null; }
  }
  hasKey(providerId) { return !!this._load()[providerId]; }
  isSecure(providerId) { const e = this._load()[providerId]; return !!(e && e.secure); }
  deleteKey(providerId) { const s = this._load(); delete s[providerId]; this._save(); }
  /** Main-process only: used to detect credential changes during import diffing. */
  allKeys() {
    const out = {};
    for (const id of Object.keys(this._load())) out[id] = this.getKey(id);
    return out;
  }
}
module.exports = { CredentialManager };
