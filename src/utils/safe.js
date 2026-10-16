/**
 * Guards for objects used as dictionaries keyed by outside data (market ids
 * from the API, the snapshot, a URL or localStorage). A plain `obj[id]`
 * lookup finds inherited members for ids like "constructor", and assigning
 * "__proto__" changes the object's prototype, so ids are checked on the way
 * in and looked up as own properties only.
 */
const RESERVED = new Set(['__proto__', 'constructor', 'prototype'])
const hasOwn = Object.prototype.hasOwnProperty

/** A usable dictionary key: a non-empty, reasonably short string that isn't reserved. */
export const isSafeKey = (k) => typeof k === 'string' && k.length > 0 && k.length <= 256 && !RESERVED.has(k)

/** obj[key] if it is the object's own property, else undefined. */
export const own = (obj, key) => (obj != null && hasOwn.call(obj, key) ? obj[key] : undefined)
