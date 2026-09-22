import { describe, expect, it } from "vitest";
import {
  safeParseJson,
  sanitizeAccount,
  sanitizeSession,
  serializeConsent,
  utf8ByteLength,
} from "../src/sanitize.js";

describe("sanitizeAccount", () => {
  it("removes OAuth and credential secrets", () => {
    expect(
      sanitizeAccount({
        id: "a1",
        providerId: "google",
        accountId: "google-user",
        accessToken: "secret-access",
        refreshToken: "secret-refresh",
        idToken: "secret-id",
        password: "hash",
        scope: "openid profile",
      }),
    ).toEqual({
      id: "a1",
      providerId: "google",
      accountId: "google-user",
      scope: "openid profile",
    });
  });
});

describe("sanitizeSession", () => {
  it("removes the bearer session token but preserves personal session data", () => {
    expect(
      sanitizeSession({
        id: "s1",
        token: "do-not-export",
        ipAddress: "203.0.113.1",
        userAgent: "Example Browser",
      }),
    ).toEqual({
      id: "s1",
      ipAddress: "203.0.113.1",
      userAgent: "Example Browser",
    });
  });
});

describe("consent serialization", () => {
  it("parses metadata and emits ISO dates", () => {
    expect(
      serializeConsent({
        id: "c1",
        userId: "u1",
        purpose: "privacy-policy",
        version: "2026-09-01",
        granted: true,
        source: "signup",
        metadata: '{"locale":"ja"}',
        createdAt: new Date("2026-09-22T00:00:00.000Z"),
      }),
    ).toEqual({
      id: "c1",
      purpose: "privacy-policy",
      version: "2026-09-01",
      granted: true,
      source: "signup",
      metadata: { locale: "ja" },
      createdAt: "2026-09-22T00:00:00.000Z",
    });
  });

  it("keeps malformed metadata as a string instead of throwing", () => {
    expect(safeParseJson("not-json")).toBe("not-json");
  });
});

describe("utf8ByteLength", () => {
  it("counts UTF-8 bytes, not JavaScript characters", () => {
    expect(utf8ByteLength("abc")).toBe(3);
    expect(utf8ByteLength("日本")).toBe(6);
  });
});
