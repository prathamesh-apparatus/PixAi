'use strict';
/** IPC input validation helpers — every handler validates before acting. */
function str(v, { max = 500, name = 'value' } = {}) {
  if (typeof v !== 'string') throw new Error(`${name} must be a string.`);
  if (v.length > max) throw new Error(`${name} is too long (max ${max}).`);
  return v;
}
function id(v, name = 'id') { return str(v, { max: 300, name }); }
function bool(v, name = 'value') {
  if (typeof v !== 'boolean') throw new Error(`${name} must be a boolean.`);
  return v;
}
function obj(v, name = 'payload') {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${name} must be an object.`);
  return v;
}
module.exports = { str, id, bool, obj };
