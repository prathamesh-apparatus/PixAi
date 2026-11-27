'use strict';
const fs = require('fs');
const path = require('path');
const { slugify } = require('./excel-importer');

/** Read pixel dimensions from PNG / JPEG / WebP headers without dependencies. */
function imageSize(buf) {
  try {
    if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), format: 'png' };
    }
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (marker >= 0xc0 && marker <= 0xc3) {
          return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5), format: 'jpg' };
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
    if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
      return { width: (buf[26] << 8 | buf[25]) + 1, height: (buf[28] << 8 | buf[27]) + 1, format: 'webp' };
    }
  } catch { /* dimensions are best-effort */ }
  return { width: null, height: null, format: null };
}

function meaningfulFilename(modelName, prompt, format) {
  const words = String(prompt || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 4).join('-');
  const date = new Date().toISOString().slice(0, 10);
  const base = `${slugify(modelName) || 'image'}${words ? `-${words}` : ''}-${date}`;
  return `${base}.${format || 'png'}`;
}

class ImageService {
  /**
   * @param {string} userDataDir fallback location
   * @param {string} [imagesDir] where generated images live — by default the
   * user's Documents/PixAi Images folder (Ray's requirement: the media team
   * must find generated images in Documents, not buried in app data).
   */
  constructor(userDataDir, imagesDir) {
    this.dir = imagesDir || path.join(userDataDir, 'generated-images');
    fs.mkdirSync(this.dir, { recursive: true });
  }
  save(buffer, modelName, prompt, formatHint) {
    const size = imageSize(buffer);
    const format = size.format || formatHint || 'png';
    let name = meaningfulFilename(modelName, prompt, format);
    let full = path.join(this.dir, name);
    let n = 2;
    while (fs.existsSync(full)) { name = meaningfulFilename(modelName, prompt, format).replace(/\.(\w+)$/, `-${n++}.$1`); full = path.join(this.dir, name); }
    fs.writeFileSync(full, buffer);
    return { path: full, name, width: size.width, height: size.height, format };
  }
  async downloadRemote(url, modelName, prompt) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not download the generated image (HTTP ${res.status}).`);
    const buf = Buffer.from(await res.arrayBuffer());
    return this.save(buf, modelName, prompt, null);
  }
  /** Copy a stored image to a user-chosen location (Download). Original untouched. */
  copyTo(imagePath, destPath) {
    if (!imagePath.startsWith(this.dir)) throw new Error('Refusing to copy a file outside the generated-images folder.');
    fs.copyFileSync(imagePath, destPath);
    return destPath;
  }
  deleteFile(imagePath) {
    if (imagePath && imagePath.startsWith(this.dir) && fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
  }
}
module.exports = { ImageService, imageSize, meaningfulFilename };
