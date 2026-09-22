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
        max: 5,
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

          const records = await ctx.context.adapter.findMany<ConsentRecord>({
            model: "privacyConsent",
            where: [
              { field: "userId", value: ctx.context.session.user.id },
            ],
            sortBy: { field: "createdAt", direction: "desc" },
          });

          return ctx.json(records.map(serializeConsent));
        },
      ),

      anonymizePrivacyAccount: createAuthEndpoint(
        "/privacy/anonymize",
        {
          method: "POST",
          body: confirmationSchema,
          use: [sessionMiddleware],
        },
        async (ctx) => {
          if (!anonymizeEnabled) forbidden("Account anonymization is disabled.");
          if (ctx.body.confirmation !== "ANONYMIZE") {
            badRequest('Set confirmation to "ANONYMIZE" to continue.');
          }

          const userId = ctx.context.session.user.id;
          const currentUser = toPlainRecord(ctx.context.session.user);

          await options.anonymize?.before?.({ userId });

          const additionalUserFields =
            (await options.anonymize?.additionalUserFields?.({
              userId,
              user: currentUser,
            })) ?? {};

          // Revoke access first so an anonymized identity cannot keep using an
          // old session or linked OAuth/credential account.
          await ctx.context.internalAdapter.deleteSessions([userId]);
          await ctx.context.internalAdapter.deleteAccounts(userId);

          await ctx.context.adapter.update({
            model: "user",
            where: [{ field: "id", value: userId }],
            update: {
              ...additionalUserFields,
              name: options.anonymize?.placeholderName ?? "Deleted User",
              email: createAnonymousEmail(),
              emailVerified: false,
              image: null,
              updatedAt: new Date(),
            },
          });

          if (!keepConsentHistory && consentEnabled) {
            await ctx.context.adapter.deleteMany({
              model: "privacyConsent",
              where: [{ field: "userId", value: userId }],
            });
          }

          await options.anonymize?.after?.({ userId });

          return ctx.json({
            success: true,
            userId,
            mode: "anonymized" as const,
          });
        },
      ),

      deletePrivacyAccount: createAuthEndpoint(
        "/privacy/delete",
        {
          method: "POST",
          body: confirmationSchema,
          use: [sessionMiddleware],
        },
        async (ctx) => {
          if (!hardDeleteEnabled) {
            forbidden(
              "Hard deletion is disabled. Enable hardDelete explicitly or use Better Auth's built-in delete-user flow.",
            );
          }
          if (ctx.body.confirmation !== "DELETE") {
            badRequest('Set confirmation to "DELETE" to continue.');
          }

          const userId = ctx.context.session.user.id;
          await options.hardDelete?.before?.({ userId });

          if (consentEnabled) {
            await ctx.context.adapter.deleteMany({
              model: "privacyConsent",
              where: [{ field: "userId", value: userId }],
            });
          }

          // Better Auth's internal deleteUser handles sessions/accounts/user.
          await ctx.context.internalAdapter.deleteUser(userId);
          await options.hardDelete?.after?.({ userId });

          return ctx.json({
            success: true,
            userId,
            mode: "deleted" as const,
          });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
};
