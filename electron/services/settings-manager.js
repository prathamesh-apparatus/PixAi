'use strict';
const fs = require('fs');
const path = require('path');

/** Simple persistent app preferences in userData/settings/settings.json. */
const DEFAULTS = {
  defaultProviderId: '', defaultModelId: '', defaultAspectRatio: '1:1',
  saveDirectory: '', theme: 'dark', animations: true,
  watchExcelEnabled: false, watchExcelPath: '',
};
class SettingsManager {
  constructor(userDataDir) {
    this.file = path.join(userDataDir, 'settings', 'settings.json');
  }
  getAll() {
    try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) }; }
    catch { return { ...DEFAULTS }; }
  }
  set(patch) {
    const next = { ...this.getAll(), ...patch };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
    fs.renameSync(tmp, this.file);
    return next;
  }
}
module.exports = { SettingsManager, DEFAULTS };
