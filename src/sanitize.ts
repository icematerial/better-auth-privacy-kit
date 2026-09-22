import type { ConsentRecord, JsonValue, PrivacyExport } from "./types.js";

const ACCOUNT_SECRET_KEYS = new Set([
  "accessToken",
  "refreshToken",
  "idToken",
  "password",
  "accessTokenExpiresAt",
  "refreshTokenExpiresAt",
]);

const SESSION_SECRET_KEYS = new Set(["token"]);

export function omitKeys(
  record: Record<string, unknown>,
  keys: ReadonlySet<string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !keys.has(key)),
  );
}

export function sanitizeAccount(
  account: Record<string, unknown>,
): Record<string, unknown> {
  return omitKeys(account, ACCOUNT_SECRET_KEYS);
}

export function sanitizeSession(
  session: Record<string, unknown>,
): Record<string, unknown> {
  return omitKeys(session, SESSION_SECRET_KEYS);
}

export function safeParseJson(value: string | null | undefined): JsonValue | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return value;
  }
}

export function serializeConsent(record: ConsentRecord): PrivacyExport["consents"][number] {
  return {
    id: record.id,
    purpose: record.purpose,
    version: record.version,
    granted: record.granted,
    source: record.source ?? null,
    metadata: safeParseJson(record.metadata),
    createdAt:
      record.createdAt instanceof Date
        ? record.createdAt.toISOString()
        : new Date(record.createdAt).toISOString(),
  };
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
