import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  sessionMiddleware,
} from "better-auth/api";
import * as z from "zod";
import {
  sanitizeAccount,
  sanitizeSession,
  serializeConsent,
  utf8ByteLength,
} from "./sanitize.js";
import type {
  ConsentRecord,
  PrivacyExport,
  PrivacyKitOptions,
} from "./types.js";

export type {
  ConsentRecord,
  JsonPrimitive,
  JsonValue,
  PrivacyExport,
  PrivacyKitOptions,
} from "./types.js";

const confirmationSchema = z.object({
  confirmation: z.string(),
});

const consentBodySchema = z.object({
  purpose: z.string().trim().min(1).max(64),
  version: z.string().trim().min(1).max(64),
  granted: z.boolean(),
  source: z.string().trim().min(1).max(64).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const DEFAULT_MAX_METADATA_BYTES = 4096;

function forbidden(message: string): never {
  throw new APIError("FORBIDDEN", { message });
}

function badRequest(message: string): never {
  throw new APIError("BAD_REQUEST", { message });
}

function toPlainRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return { ...(value as Record<string, unknown>) };
}

function createAnonymousEmail(): string {
  return `deleted-${crypto.randomUUID()}@privacy.invalid`;
}

/**
 * Better Auth privacy helper plugin.
 *
 * This package provides privacy primitives; it does not by itself make an
 * application compliant with GDPR, CCPA/CPRA, APPI, or any other law.
 */
export const privacyKit = (options: PrivacyKitOptions = {}) => {
  const exportEnabled = options.export?.enabled ?? true;
  const includeAccounts = options.export?.includeAccounts ?? true;
  const includeSessions = options.export?.includeSessions ?? true;
  const consentEnabled = options.consent?.enabled ?? true;
  const anonymizeEnabled = options.anonymize?.enabled ?? true;
  const hardDeleteEnabled = options.hardDelete?.enabled ?? false;
  const keepConsentHistory = options.anonymize?.keepConsentHistory ?? true;
  const allowedPurposes = new Set(options.consent?.purposes ?? []);
  const maxMetadataBytes =
    options.consent?.maxMetadataBytes ?? DEFAULT_MAX_METADATA_BYTES;

  return {
    id: "privacy-kit",

    schema: {
      privacyConsent: {
        modelName: options.schema?.consentModelName ?? "privacyConsent",
        fields: {
          userId: {
            type: "string",
            required: true,
            references: {
              model: "user",
              field: "id",
              onDelete: "cascade",
            },
          },
          purpose: {
            type: "string",
            required: true,
          },
          version: {
            type: "string",
            required: true,
          },
          granted: {
            type: "boolean",
            required: true,
          },
          source: {
            type: "string",
            required: false,
          },
          metadata: {
            type: "string",
            required: false,
          },
          createdAt: {
            type: "date",
            required: true,
          },
        },
      },
    },

    rateLimit: [
      {
        pathMatcher: (path: string) =>
          path === "/privacy/anonymize" || path === "/privacy/delete",
        window: 60,
        limit: 5,
      },
    ],

    endpoints: {
      privacyExport: createAuthEndpoint(
        "/privacy/export",
        {
          method: "GET",
          use: [sessionMiddleware],
        },
        async (ctx) => {
          if (!exportEnabled) forbidden("Privacy export is disabled.");

          const userId = ctx.context.session.user.id;
          const user = toPlainRecord(ctx.context.session.user);

          const [accounts, sessions, consents, application] = await Promise.all([
            includeAccounts
              ? ctx.context.internalAdapter.findAccounts(userId)
              : Promise.resolve([]),
            includeSessions
              ? ctx.context.internalAdapter.listSessions(userId)
              : Promise.resolve([]),
            consentEnabled
              ? ctx.context.adapter.findMany<ConsentRecord>({
                  model: "privacyConsent",
                  where: [{ field: "userId", value: userId }],
                  sortBy: { field: "createdAt", direction: "desc" },
                })
              : Promise.resolve([] as ConsentRecord[]),
            options.export?.extend
              ? options.export.extend({ userId })
              : Promise.resolve(undefined),
          ]);

          const payload: PrivacyExport = {
            exportedAt: new Date().toISOString(),
            user,
            accounts: accounts.map((account: unknown) =>
              sanitizeAccount(toPlainRecord(account)),
            ),
            sessions: sessions.map((session: unknown) =>
              sanitizeSession(toPlainRecord(session)),
            ),
            consents: consents.map(serializeConsent),
            ...(application ? { application } : {}),
          };

          return ctx.json(payload);
        },
      ),

      recordPrivacyConsent: createAuthEndpoint(
        "/privacy/consent",
        {
          method: "POST",
          body: consentBodySchema,
          use: [sessionMiddleware],
        },
        async (ctx) => {
          if (!consentEnabled) forbidden("Consent history is disabled.");

          const { purpose, version, granted, source, metadata } = ctx.body;
          if (allowedPurposes.size > 0 && !allowedPurposes.has(purpose)) {
            badRequest(`Unknown consent purpose: ${purpose}`);
          }

          const serializedMetadata = metadata
            ? JSON.stringify(metadata)
            : undefined;
          if (
            serializedMetadata &&
            utf8ByteLength(serializedMetadata) > maxMetadataBytes
          ) {
            badRequest(
              `Consent metadata exceeds ${maxMetadataBytes} UTF-8 bytes.`,
            );
          }

          const record = await ctx.context.adapter.create<ConsentRecord>({
            model: "privacyConsent",
            data: {
              userId: ctx.context.session.user.id,
              purpose,
              version,
              granted,
              ...(source ? { source } : {}),
              ...(serializedMetadata ? { metadata: serializedMetadata } : {}),
              createdAt: new Date(),
            },
          });

          return ctx.json(serializeConsent(record));
        },
      ),

      listPrivacyConsents: createAuthEndpoint(
        "/privacy/consents",
        {
          method: "GET",
          use: [sessionMiddleware],
        },
        async (ctx) => {
          if (!consentEnabled) forbidden("Consent history is disabled.");

         ÛÛœİ™XÛÜ™ÈH]ØZ]İ˜ÛÛ^˜Y\\‹™š[™X[OÛÛœÙ[™XÛÜ™ŠÂˆ[Ù[ˆœš]˜XŞPÛÛœÙ[‹ˆÚ\™NˆÂˆÈšY[ˆ\Ù\’Y‹˜[YNˆİ˜ÛÛ^œÙ\ÜÚ[Û‹\Ù\‹šYKˆKˆÛÜNˆÈšY[ˆ˜Ü™X]Y]‹\™Xİ[Ûˆ™\ØÈˆKˆJNÂ‚ˆ™]\›ˆİšœÛÛŠ™XÛÜ™Ë›X\
Ù\šX[^™PÛÛœÙ[
JNÂˆKˆ
K‚ˆ[›Û[Z^™Tš]˜XŞPXØÛİ[ˆÜ™X]P]][™Ú[
ˆ‹Üš]˜XŞKØ[›Û[Z^™H‹ˆÂˆY]Ùˆ”ÔÕ‹ˆ›ÙNˆÛÛ™š\›X][Û”ØÚ[XKˆ\ÙNˆÜÙ\ÜÚ[Û“ZY]Ø\™WKˆKˆ\Ş[˜È
İ
HOˆÂˆYˆ
X[›Û[Z^™Q[˜X›Y
H›Ü˜šY[ŠXØÛİ[[›Û[Z^˜][Ûˆ\È\ØX›YˆŠNÂˆYˆ
İ˜›ÙK˜ÛÛ™š\›X][ÛˆOOHS“Ó–SRV‘HŠHÂˆ˜Y™\]Y\İ
	ÔÙ]ÛÛ™š\›X][ÛˆÈS“Ó–SRV‘HˆÈÛÛ[YK‰ÊNÂˆB‚ˆÛÛœİ\Ù\’YHİ˜ÛÛ^œÙ\ÜÚ[Û‹\Ù\‹šYÂˆÛÛœİİ\œ™[\Ù\ˆHÔZ[”™XÛÜ™
İ˜ÛÛ^œÙ\ÜÚ[Û‹\Ù\ŠNÂ‚ˆ]ØZ]Ü[ÛœË˜[›Û[Z^™OË˜™Y›Ü™OËŠÈ\Ù\’YJNÂ‚ˆÛÛœİY][Û˜[\Ù\‘šY[ÈBˆ
]ØZ]Ü[ÛœË˜[›Û[Z^™OË˜Y][Û˜[\Ù\‘šY[ÏËŠÂˆ\Ù\’Yˆ\Ù\ˆİ\œ™[\Ù\‹ˆJJHÏÈßNÂ‚ˆËÈ™]›ÚÙHXØÙ\ÜÈš\œİÛÈ[ˆ[›Û[Z^™YY[]HØ[››İÙY\\Ú[™È[‚ˆËÈÛÙ\ÜÚ[ÛˆÜˆ[šÙYĞ]]ØÜ™Y[X[XØÛİ[‚ˆ]ØZ]İ˜ÛÛ^š[\›˜[Y\\‹™[]TÙ\ÜÚ[ÛœÊ\Ù\’Y
NÂˆ]ØZ]İ˜ÛÛ^š[\›˜[Y\\‹™[]PXØÛİ[Ê\Ù\’Y
NÂ‚ˆ]ØZ]İ˜ÛÛ^˜Y\\‹\]JÂˆ[Ù[ˆ\Ù\ˆ‹ˆÚ\™NˆŞÈšY[ˆšY‹˜[YNˆ\Ù\’YWKˆ\]NˆÂˆ‹‹˜Y][Û˜[\Ù\‘šY[Ëˆ˜[YNˆÜ[ÛœË˜[›Û[Z^™OËœXÙZÛ\“˜[YHÏÈ‘[]Y\Ù\ˆ‹ˆ[XZ[ˆÜ™X]P[›Û[[İ\Ñ[XZ[

Kˆ[XZ[™\šYšYYˆ˜[ÙKˆ[XYÙNˆ[ˆ\]Y]ˆ™]È]J
KˆKˆJNÂ‚ˆYˆ
ZÙY\ÛÛœÙ[\İÜH	‰ˆÛÛœÙ[[˜X›Y
HÂˆ]ØZ]İ˜ÛÛ^˜Y\\‹™[]SX[JÂˆ[Ù[ˆœš]˜XŞPÛÛœÙ[‹ˆÚ\™NˆŞÈšY[ˆ\Ù\’Y‹˜[YNˆ\Ù\’YWKˆJNÂˆB‚ˆ]ØZ]Ü[ÛœË˜[›Û[Z^™OË˜Y\ËŠÈ\Ù\’YJNÂ‚ˆ™]\›ˆİšœÛÛŠÂˆİXØÙ\ÜÎˆYKˆ\Ù\’Yˆ[ÙNˆ˜[›Û[Z^™Yˆ\ÈÛÛœİˆJNÂˆKˆ
K‚ˆ[]Tš]˜XŞPXØÛİ[ˆÜ™X]P]][™Ú[
ˆ‹Üš]˜XŞKÙ[]H‹ˆÂˆY]Ùˆ”ÔÕ‹ˆ›ÙNˆÛÛ™š\›X][Û”ØÚ[XKˆ\ÙNˆÜÙ\ÜÚ[Û“ZY]Ø\™WKˆKˆ\Ş[˜È
İ
HOˆÂˆYˆ
Z\™[]Q[˜X›Y
HÂˆ›Ü˜šY[Šˆ’\™[][Ûˆ\È\ØX›Yˆ[˜X›H\™[]H^XÚ]HÜˆ\ÙH™]\ˆ]]	ÜÈZ[Z[ˆ[]K]\Ù\ˆ›İËˆ‹ˆ
NÂˆBˆYˆ
İ˜›ÙK˜ÛÛ™š\›X][ÛˆOOH‘SUHŠHÂˆ˜Y™\]Y\İ
	ÔÙ]ÛÛ™š\›X][ÛˆÈ‘SUHˆÈÛÛ[YK‰ÊNÂˆB‚ˆÛÛœİ\Ù\’YHİ˜ÛÛ^œÙ\ÜÚ[Û‹\Ù\‹šYÂˆ]ØZ]Ü[ÛœËš\™[]OË˜™Y›Ü™OËŠÈ\Ù\’YJNÂ‚ˆYˆ
ÛÛœÙ[[˜X›Y
HÂˆ]ØZ]İ˜ÛÛ^˜Y\\‹™[]SX[JÂˆ[Ù[ˆœš]˜XŞPÛÛœÙ[‹ˆÚ\™NˆŞÈšY[ˆ\Ù\’Y‹˜[YNˆ\Ù\’YWKˆJNÂˆB‚ˆËÈ™]\ˆ]]	ÜÈ[\›˜[[]U\Ù\ˆ[™\ÈÙ\ÜÚ[ÛœËØXØÛİ[Ëİ\Ù\‹‚ˆ]ØZ]İ˜ÛÛ^š[\›˜[Y\\‹™[]U\Ù\Š\Ù\’Y
NÂˆ]ØZ]Ü[ÛœËš\™[]OË˜Y\ËŠÈ\Ù\’YJNÂ‚ˆ™]\›ˆİšœÛÛŠÂˆİXØÙ\ÜÎˆYKˆ\Ù\’Yˆ[ÙNˆ™[]Yˆ\ÈÛÛœİˆJNÂˆKˆ
KˆKˆHØ]\ÙšY\È™]\]]YÚ[ÂŸNÂ