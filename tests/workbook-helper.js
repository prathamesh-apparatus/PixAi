'use strict';
const XLSX = require('xlsx');

const HEADERS = ['Provider account', 'Vendor / adapter', 'Base URL', 'API key',
  'One Time / monthly Recurring quota', 'Requests / minute (RPM)', 'Tokens / minute (TPM)',
  'Provider status', 'Model name (fx1)', 'Vendor model ID', 'Model status', 'Description', 'Model Type'];

/** Build a row in HEADERS order from a partial object keyed by friendly names. */
function row(o = {}) {
  return [o.provider || '', o.adapter || '', o.baseUrl || '', o.apiKey || '', o.quota || '',
    o.rpm || '', o.tpm || '', o.providerStatus || '', o.model || '', o.vendorId || '',
    o.modelStatus || '', o.description || '', o.type || ''];
}
function workbookBuffer(rows, sheetName = 'Fabrix1 Inventory') {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Notes'], ['internal']]), 'Notes');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
module.exports = { HEADERS, row, workbookBuffer, PNG_1PX };
