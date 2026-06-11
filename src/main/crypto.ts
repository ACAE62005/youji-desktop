import { app, safeStorage } from "electron";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const FALLBACK_PREFIX = "aes:";
const SAFE_PREFIX = "safe:";

function getFallbackKey(): Buffer {
  const keyPath = path.join(app.getPath("userData"), "credential.key");
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath);
  }

  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, key, { mode: 0o600 });
  return key;
}

export function encryptSecret(value: string): string {
  if (!value) {
    return "";
  }

  if (safeStorage.isEncryptionAvailable()) {
    return SAFE_PREFIX + safeStorage.encryptString(value).toString("base64");
  }

  const key = getFallbackKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return FALLBACK_PREFIX + Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(value: string): string {
  if (!value) {
    return "";
  }

  if (value.startsWith(SAFE_PREFIX)) {
    const payload = Buffer.from(value.slice(SAFE_PREFIX.length), "base64");
    return safeStorage.decryptString(payload);
  }

  if (!value.startsWith(FALLBACK_PREFIX)) {
    return "";
  }

  const raw = Buffer.from(value.slice(FALLBACK_PREFIX.length), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getFallbackKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
