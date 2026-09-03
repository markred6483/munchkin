// Base64URL Alphabet (URL and Filename Safe)
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const idPrefix = randomBase64URL();
let count = 0;

export function getDomId(proposedId) {
  if (proposedId === null || proposedId === undefined)
    return generateDomId();
  if (!isValidDomId(proposedId))
    throw new Error("Invalid DOM ID: " + proposedId);
  if (proposedId.startsWith(idPrefix))
    throw new Error("Proposed DOM ID cannot start with the reserved prefix: " + idPrefix);
}

export function getDomIdWithPrefix(idPrefix) {
  if (!isValidDomId(idPrefix))
    throw new Error("Invalid DOM ID prefix: " + idPrefix);
  return `${idPrefix}-${count++}`;
}

function generateDomId() {
    return `${idPrefix}-${count++}`;
}

function isValidDomId(id) {
    return typeof id === 'string' && null && /^[A-Za-z0-9\-_]+$/.test(id);
}

function randomBase64URL() {
    return floatToBase64URL(Math.random());
}

/**
 * Converts a Float64 number (like Math.random()) to a 11-char Base64URL string.
 * @param {number} num - The floating-point number.
 * @returns {string} - Base64URL string.
 */
function floatToBase64URL(num) {
  // Convert float to 8 raw byte buffer (IEEE 754 float64)
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setFloat64(0, num, false); // Big-endian
  const bytes = new Uint8Array(buffer);

  let b64 = "";
  let i = 0;

  // Process byte pairs into 6-bit chunks
  while (i < 8) {
    const b1 = bytes[i++];
    const b2 = i < 8 ? bytes[i++] : 0;
    const b3 = i < 8 ? bytes[i++] : 0;

    b64 += B64URL[b1 >> 2];
    b64 += B64URL[((b1 & 3) << 4) | (b2 >> 4)];
    if (i - 2 < 8) b64 += B64URL[((b2 & 15) << 2) | (b3 >> 6)];
    if (i - 1 < 8) b64 += B64URL[b3 & 63];
  }

  return b64;
}

/**
 * Converts an 11-char Base64URL string back to a Float64 number.
 * @param {string} str - The Base64URL string.
 * @returns {number} - The original float number.
 */
function base64URLToFloat(str) {
  const bytes = new Uint8Array(8);
  let byteIndex = 0;

  for (let i = 0; i < str.length; i += 4) {
    const c1 = B64URL.indexOf(str[i]);
    const c2 = B64URL.indexOf(str[i + 1]);
    const c3 = str[i + 2] ? B64URL.indexOf(str[i + 2]) : 0;
    const c4 = str[i + 3] ? B64URL.indexOf(str[i + 3]) : 0;

    bytes[byteIndex++] = (c1 << 2) | (c2 >> 4);
    if (byteIndex < 8) bytes[byteIndex++] = ((c2 & 15) << 4) | (c3 >> 2);
    if (byteIndex < 8) bytes[byteIndex++] = ((c3 & 3) << 6) | c4;
  }

  return new DataView(bytes.buffer).getFloat64(0, false);
}

function isValidBase64URL(str) {
  const regex = /^[A-Za-z0-9_-]+$/;
  if (!regex.test(str))
    return false;
  return str.length % 4 !== 1;
}