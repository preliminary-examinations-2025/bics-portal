const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEYS_DIR = path.resolve(__dirname, '..', 'keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'eirf_private_key.pem');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'eirf_public_key.pem');

let cachedPrivateKey = null;
let cachedPublicKey = null;

/**
 * Initializes or loads the server-side RSA-2048 keypair.
 * If keys do not exist on disk and are not in env vars, generates a new keypair.
 */
function initKeys() {
    if (cachedPrivateKey && cachedPublicKey) {
        return { privateKey: cachedPrivateKey, publicKey: cachedPublicKey };
    }

    // 1. Check environment variables
    const envPriv = process.env.EIRF_RSA_PRIVATE_KEY;
    const envPub = process.env.EIRF_RSA_PUBLIC_KEY;
    if (envPriv && envPub) {
        cachedPrivateKey = envPriv.replace(/\\n/g, '\n');
        cachedPublicKey = envPub.replace(/\\n/g, '\n');
        return { privateKey: cachedPrivateKey, publicKey: cachedPublicKey };
    }

    // 2. Check disk files
    if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
        try {
            cachedPrivateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
            cachedPublicKey = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
            return { privateKey: cachedPrivateKey, publicKey: cachedPublicKey };
        } catch (e) {
            console.warn("Failed to read existing RSA key files, regenerating...", e.message);
        }
    }

    // 3. Generate fresh RSA-2048 keypair
    if (!fs.existsSync(KEYS_DIR)) {
        fs.mkdirSync(KEYS_DIR, { recursive: true });
    }

    console.log("--> [RSAKeyManager] Generating authoritative RSA-2048 keypair for EIRF asymmetric encryption...");
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
        }
    });

    try {
        fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });
        fs.writeFileSync(PUBLIC_KEY_PATH, publicKey, { mode: 0o644 });
    } catch (writeErr) {
        console.warn("Could not write RSA keys to disk (read-only environment?):", writeErr.message);
    }

    cachedPrivateKey = privateKey;
    cachedPublicKey = publicKey;
    console.log("--> [RSAKeyManager] RSA-2048 keypair initialized successfully.");
    return { privateKey: cachedPrivateKey, publicKey: cachedPublicKey };
}

// Initial load
initKeys();

function getPublicKeyPem() {
    initKeys();
    return cachedPublicKey;
}

function getPublicKeyDerBase64() {
    const pem = getPublicKeyPem();
    return pem
        .replace(/-----BEGIN PUBLIC KEY-----/g, '')
        .replace(/-----END PUBLIC KEY-----/g, '')
        .replace(/\s+/g, '');
}

/**
 * Decrypts a buffer using RSA-OAEP with SHA-256 padding and the authoritative server private key.
 */
function decryptWithPrivateKey(encryptedBuffer) {
    initKeys();
    const buf = Buffer.isBuffer(encryptedBuffer) 
        ? encryptedBuffer 
        : Buffer.from(encryptedBuffer, 'hex');

    return crypto.privateDecrypt(
        {
            key: cachedPrivateKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
        },
        buf
    );
}

/**
 * Encrypts a buffer using RSA-OAEP with SHA-256 padding and the server public key.
 */
function encryptWithPublicKey(dataBuffer) {
    initKeys();
    const buf = Buffer.isBuffer(dataBuffer) 
        ? dataBuffer 
        : Buffer.from(dataBuffer);

    return crypto.publicEncrypt(
        {
            key: cachedPublicKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
        },
        buf
    );
}

module.exports = {
    initKeys,
    getPublicKeyPem,
    getPublicKeyDerBase64,
    decryptWithPrivateKey,
    encryptWithPublicKey
};
