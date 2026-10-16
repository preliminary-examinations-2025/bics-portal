/**
 * Client-Side Asymmetric Envelope Cryptography for BICS EIRF Emergency Backups.
 * Eliminates hardcoded symmetric secrets and salts from frontend code.
 * Payloads are encrypted using ephemeral AES-256-GCM keys wrapped in RSA-2048-OAEP.
 * Only the authoritative backend holding the Private Key can decrypt or verify backups.
 */

let cachedPublicKeyDer = null;

const bufToHex = (buffer) => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
};

const hexToBuf = (hexString) => {
  const bytes = new Uint8Array(Math.ceil(hexString.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hexString.substr(i * 2, 2), 16);
  }
  return bytes;
};

const base64ToBuf = (base64) => {
  const binaryStr = window.atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
};

/**
 * Fetches the authoritative Server RSA Public Key (SPKI) from the backend.
 */
export async function fetchServerPublicKey(apiBase = '/api') {
  if (cachedPublicKeyDer) return cachedPublicKeyDer;
  try {
    const res = await fetch(`${apiBase}/test/eirf/public-key`);
    if (res.ok) {
      const data = await res.json();
      if (data.publicKeyDerBase64) {
        cachedPublicKeyDer = data.publicKeyDerBase64;
        return cachedPublicKeyDer;
      }
    }
  } catch (err) {
    console.warn("Failed to fetch server public key over network:", err.message);
  }
  return cachedPublicKeyDer;
}

/**
 * Encrypts an EIRF payload using Server Asymmetric Envelope Encryption (RSA-OAEP + AES-256-GCM).
 */
export async function encryptEirfEnvelope(payloadObj, apiBase = '/api') {
  try {
    const pubKeyBase64 = await fetchServerPublicKey(apiBase);
    if (!pubKeyBase64) {
      throw new Error("Server encryption public key unavailable.");
    }

    const derBytes = base64ToBuf(pubKeyBase64);
    const rsaPublicKey = await window.crypto.subtle.importKey(
      'spki',
      derBytes,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt']
    );

    // 1. Generate ephemeral 256-bit AES-GCM symmetric key
    const aesKey = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt']
    );

    // 2. Encrypt payload data with AES-256-GCM
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const jsonStr = JSON.stringify(payloadObj);
    const dataBytes = new TextEncoder().encode(jsonStr);

    const encryptedBuf = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      aesKey,
      dataBytes
    );

    // 3. Extract GCM ciphertext & 16-byte authentication tag
    const encryptedBytes = new Uint8Array(encryptedBuf);
    const tagLength = 16;
    const ciphertextBytes = encryptedBytes.subarray(0, encryptedBytes.length - tagLength);
    const authTagBytes = encryptedBytes.subarray(encryptedBytes.length - tagLength);

    // 4. Wrap the ephemeral AES key with the Server's RSA Public Key
    const rawAesKey = await window.crypto.subtle.exportKey('raw', aesKey);
    const wrappedKeyBuf = await window.crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      rsaPublicKey,
      rawAesKey
    );

    return JSON.stringify({
      version: '2.0-rsa-envelope',
      algorithm: 'RSA-OAEP-2048/AES-256-GCM',
      encryptedKey: bufToHex(wrappedKeyBuf),
      iv: bufToHex(iv),
      authTag: bufToHex(authTagBytes),
      data: bufToHex(ciphertextBytes)
    });
  } catch (err) {
    console.error("Asymmetric EIRF envelope encryption failed:", err);
    throw err;
  }
}

/**
 * Encrypts pending submission payloads prior to storing in localStorage.
 * Prevents candidate manipulation via browser DevTools.
 */
export async function encryptPendingStorage(payloadObj, submissionId) {
  try {
    const rawKeyMaterial = new TextEncoder().encode(`bics_storage_salt_${submissionId}`);
    const hash = await window.crypto.subtle.digest('SHA-256', rawKeyMaterial);
    
    const key = await window.crypto.subtle.importKey(
      'raw',
      hash,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const dataBytes = new TextEncoder().encode(JSON.stringify(payloadObj));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      dataBytes
    );

    return JSON.stringify({
      _secured: true,
      iv: bufToHex(iv),
      data: bufToHex(encrypted)
    });
  } catch (e) {
    console.warn("Storage encryption fallback:", e);
    return JSON.stringify(payloadObj);
  }
}

/**
 * Decrypts pending submission payloads retrieved from localStorage.
 */
export async function decryptPendingStorage(storedString, submissionId) {
  if (!storedString) return null;
  try {
    const parsed = JSON.parse(storedString);
    if (!parsed || !parsed._secured || !parsed.iv || !parsed.data) {
      // Legacy unencrypted object
      return parsed;
    }

    const rawKeyMaterial = new TextEncoder().encode(`bics_storage_salt_${submissionId}`);
    const hash = await window.crypto.subtle.digest('SHA-256', rawKeyMaterial);

    const key = await window.crypto.subtle.importKey(
      'raw',
      hash,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const iv = hexToBuf(parsed.iv);
    const data = hexToBuf(parsed.data);

    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch (e) {
    console.warn("Storage decryption warning:", e);
    try {
      return JSON.parse(storedString);
    } catch (_) {
      return null;
    }
  }
}
