/**
 * Client-Side AES-GCM Encryption Helpers for Offline Pending Submissions.
 * Secures offline examination state stored in browser storage before auto-sync.
 */

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
