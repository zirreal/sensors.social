import { x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";
import bs58 from "bs58";

import { cryptoWaitReady, decodeAddress, mnemonicToMiniSecret } from "@polkadot/util-crypto";
import { getOwnerEd25519Seed } from "@/composables/useAccounts";
import { MEASUREMENT_GROUPS } from "../measurements/groups";

const ENCRYPTED_PREFIX = "e.";
const HKDF_SALT = "robonomics-network";
const HKDF_INFO = "aesgcm256";
const PASCAL_TO_MMHG = 133.32;

const FIELD_PASCAL_THRESHOLD = 3000;

const P = (1n << 255n) - 19n;

export function isEncryptedSensorValue(value) {
  return typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX);
}

function hasEncryptedFields(measurement) {
  if (!measurement || typeof measurement !== "object") return false;
  return Object.values(measurement).some(isEncryptedSensorValue);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function bytesToBigIntLE(bytes) {
  let value = 0n;
  for (let i = bytes.length - 1; i >= 0; i -= 1) {
    value = (value << 8n) | BigInt(bytes[i]);
  }
  return value;
}

function bigIntToBytesLE(value, len = 32) {
  const out = new Uint8Array(len);
  let v = value;
  for (let i = 0; i < len; i += 1) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function modPow(base, exp, mod) {
  let result = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return result;
}

function modInv(a, mod) {
  return modPow(a, mod - 2n, mod);
}

/** Ed25519 compressed public key -> X25519 Montgomery u (RFC 7748 / libcps). */
function ed25519PublicToX25519(edPk) {
  const yLe = new Uint8Array(edPk);
  yLe[31] &= 0x7f;
  const y = bytesToBigIntLE(yLe);
  const one = 1n;
  const num = (one + y) % P;
  const den = (one - y + P) % P;
  const u = (num * modInv(den, P)) % P;
  return bigIntToBytesLE(u, 32);
}

function ed25519SeedToX25519Scalar(seed) {
  const hash = sha512(seed);
  const scalar = hash.slice(0, 32);
  scalar[0] &= 248;
  scalar[31] &= 127;
  scalar[31] |= 64;
  return scalar;
}

function deriveSharedSecret(ownerSeed, deviceEdPk) {
  const scalar = ed25519SeedToX25519Scalar(ownerSeed);
  const theirX = ed25519PublicToX25519(deviceEdPk);
  return x25519.getSharedSecret(scalar, theirX);
}

function hkdfAesGcmKey(shared) {
  return hkdf(sha256, shared, HKDF_SALT, HKDF_INFO, 32);
}

async function importAesGcmKey(rawKey) {
  return crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
}

function parseCpsPayload(wire) {
  try {
    const raw = base64ToBytes(wire.slice(ENCRYPTED_PREFIX.length));
    const text = new TextDecoder().decode(raw);
    if (!text.startsWith("{")) return null;
    const json = JSON.parse(text);
    if (json?.version !== 1 || json?.algorithm !== "aesgcm256") return null;
    return json;
  } catch {
    return null;
  }
}

async function resolveDevicePublicKey(fromField) {
  const raw = String(fromField || "").trim();
  if (!raw) return null;
  await cryptoWaitReady();
  try {
    const pk = decodeAddress(raw, false, 32);
    if (pk instanceof Uint8Array && pk.length === 32) return pk;
  } catch {
    // legacy raw base58 pubkey in `from`
  }
  try {
    const pk = bs58.decode(raw);
    if (pk.length === 32) return pk;
  } catch {
    return null;
  }
  return null;
}

async function decryptCpsValue(wire, ownerSeed) {
  const json = parseCpsPayload(wire);
  if (!json?.from || !json?.nonce || !json?.ciphertext) return null;

  const devicePk = await resolveDevicePublicKey(json.from);
  if (!devicePk) return null;

  const shared = deriveSharedSecret(ownerSeed, devicePk);
  const aesKey = hkdfAesGcmKey(shared);
  const nonce = base64ToBytes(json.nonce);
  const ciphertext = base64ToBytes(json.ciphertext);

  try {
    const key = await importAesGcmKey(aesKey);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ciphertext);
    return new TextDecoder().decode(new Uint8Array(plain));
  } catch {
    return null;
  }
}

function normalizeDecryptedField(fieldName, plain) {
  const num = Number(plain);
  if (!Number.isFinite(num)) return plain;

  const field = String(fieldName || "").toLowerCase();
  if (field === "pressure" && num >= FIELD_PASCAL_THRESHOLD) {
    return num / PASCAL_TO_MMHG;
  }
  return num;
}

async function decryptSensorValue(wire, ownerSeed) {
  if (!isEncryptedSensorValue(wire)) return null;
  return decryptCpsValue(wire, ownerSeed);
}

async function resolveOwnerSeed(ownerAccount) {
  if (!ownerAccount || typeof ownerAccount !== "object") return null;
  if (ownerAccount.seed instanceof Uint8Array && ownerAccount.seed.length === 32) {
    return ownerAccount.seed;
  }
  const seedHex = String(ownerAccount.seedHex || "").trim().replace(/^0x/i, "");
  if (/^[0-9a-fA-F]{64}$/.test(seedHex)) {
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i += 1) {
      out[i] = parseInt(seedHex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }
  const phrase = String(ownerAccount.phrase || "").trim();
  if (phrase) {
    await cryptoWaitReady();
    const seed = mnemonicToMiniSecret(phrase);
    if (seed instanceof Uint8Array && seed.length >= 32) {
      return seed.slice(0, 32);
    }
  }
  const address = String(ownerAccount.address || "").trim();
  if (!address) return null;
  return getOwnerEd25519Seed(address);
}

/**
 * Decrypt encrypted measurement fields when the logged-in owner seed is available.
 * @param {string} sensorId
 * @param {Object} measurement
 * @param {{ address?: string, seed?: Uint8Array }} ownerAccount
 */
export async function decryptMeasurementBag(sensorId, measurement, ownerAccount) {
  if (!measurement || typeof measurement !== "object" || !hasEncryptedFields(measurement)) {
    return measurement;
  }

  const ownerSeed = await resolveOwnerSeed(ownerAccount);
  if (!ownerSeed) return measurement;

  const out = { ...measurement };
  await Promise.all(
    Object.entries(measurement).map(async ([field, value]) => {
      if (!isEncryptedSensorValue(value)) return;
      const plain = await decryptSensorValue(value, ownerSeed);
      if (plain == null) return;
      out[field] = normalizeDecryptedField(field, plain);
    })
  );
  return out;
}

export function measurementBagHasEncryptedValues(measurement) {
  return hasEncryptedFields(measurement);
}

function legendMemberIds(legendKey) {
  const key = String(legendKey || "").toLowerCase();
  const group = MEASUREMENT_GROUPS[key];
  if (group?.members?.length) {
    return group.members.map((m) => String(m).toLowerCase());
  }
  return key ? [key] : [];
}

function readBagValue(bag, memberId) {
  if (!bag || memberId == null) return undefined;
  const id = String(memberId).toLowerCase();
  if (bag[id] !== undefined) return bag[id];
  for (const [k, v] of Object.entries(bag)) {
    if (String(k).toLowerCase() === id) return v;
  }
  return undefined;
}

export function bagHasEncryptedForLegend(bag, legendKey) {
  if (!bag || !legendKey) return false;
  return legendMemberIds(legendKey).some((memberId) =>
    isEncryptedSensorValue(readBagValue(bag, memberId))
  );
}

export function logHasEncryptedForLegend(log, legendKey) {
  if (!Array.isArray(log) || !legendKey) return false;
  return log.some((entry) => bagHasEncryptedForLegend(entry?.data, legendKey));
}
