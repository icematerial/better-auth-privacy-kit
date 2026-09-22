# better-auth-privacy-kit

[日本語 README](./README.ja.md)

Privacy primitives for [Better Auth](https://better-auth.com): user data export, consent history, account anonymization, and optional hard deletion.

> **Status:** early-stage / `0.x`. This package helps implement privacy workflows. It does **not** make an application compliant with GDPR, CCPA/CPRA, APPI, or any other law by itself.

## Why

Authentication data is often the first place privacy work gets repetitive:

- “Let me download the data associated with my account.”
- “Keep a history of which policy/terms version I accepted.”
- “Anonymize my identity and revoke access.”
- “Delete my auth identity completely.”

`better-auth-privacy-kit` packages those common pieces as a Better Auth plugin with conservative defaults.

## Features

- **Data export** for the authenticated user
  - user data
  - linked accounts, with OAuth/credential secrets removed
  - sessions, with bearer session tokens removed
  - consent history
  - optional application-specific export data
- **Consent history** with purpose, document/version, grant/withdrawal state, source, metadata, and timestamp
- **Account anonymization**
  - revokes all sessions first
  - removes linked OAuth/credential accounts
  - replaces name/email/image with anonymous values
  - supports application-specific user fields
- **Optional hard deletion**
  - disabled by default
  - explicit confirmation required
- Better Auth client type inference
- Adapter-agnostic Better Auth schema

## Requirements

- Better Auth `>=1.7.0 <2`
- Node.js `>=22.12.0`
- Zod `4.x`

The project is developed against Better Auth `1.7.x`.

## Installation

```bash
npm install better-auth-privacy-kit
```

### Server

```ts
import { betterAuth } from "better-auth";
import { privacyKit } from "better-auth-privacy-kit";

export const auth = betterAuth({
  database: /* your Better Auth database */,
  plugins: [
    privacyKit({
      consent: {
        purposes: ["privacy-policy", "terms", "marketing"],
      },
    }),
  ],
});
```

### Generate or migrate the schema

The plugin adds a `privacyConsent` model.

```bash
npx auth@latest generate
```

or, when your Better Auth database setup supports migrations:

```bash
npx auth@latest migrate
```

### Client

```ts
import { createAuthClient } from "better-auth/client";
import { privacyKitClient } from "better-auth-privacy-kit/client";

export const authClient = createAuthClient({
  plugins: [privacyKitClient()],
});
```

## Usage

### Export the current user's auth/privacy data

```ts
const { data, error } = await authClient.privacy.export();
```

Example response shape:

```json
{
  "exportedAt": "2026-09-22T00:00:00.000Z",
  "user": {
    "id": "user_123",
    "name": "Example User",
    "email": "user@example.com"
  },
  "accounts": [
    {
      "id": "account_123",
      "providerId": "google",
      "accountId": "provider-user-id"
    }
  ],
  "sessions": [
    {
      "id": "session_123",
      "ipAddress": "203.0.113.1",
      "userAgent": "Example Browser"
    }
  ],
  "consents": []
}
```

The plugin intentionally strips session tokens, OAuth access tokens, refresh tokens, ID tokens, and credential password fields from exports.

### Add application-specific data to exports

The plugin cannot safely guess which of your application tables belong to a user. Add them explicitly:

```ts
privacyKit({
  export: {
    extend: async ({ userId }) => {
      return {
        profile: await db.profile.findUnique({ where: { userId } }),
        preferences: await db.preferences.findMany({ where: { userId } }),
      };
    },
  },
});
```

Do not return secrets from `extend()`.

### Record consent or withdrawal

```ts
await authClient.privacy.consent({
  purpose: "privacy-policy",
  version: "2026-09-01",
  granted: true,
  source: "signup",
  metadata: {
    locale: "en",
  },
});
```

A later withdrawal is another history event:

```ts
await authClient.privacy.consent({
  purpose: "marketing",
  version: "2026-09-01",
  granted: false,
  source: "settings",
});
```

List the history:

```ts
const { data } = await authClient.privacy.consents();
```

### Anonymize an account

```ts
await authClient.privacy.anonymize({
  confirmation: "ANONYMIZE",
});
```

Before changing identity fields, the plugin revokes sessions and removes linked accounts. The user will need a new account to authenticate again.

If your `user` table has application-specific personal fields, explicitly replace them too:

```ts
privacyKit({
  anonymize: {
    additionalUserFields: async () => ({
      phoneNumber: null,
      displayUsername: null,
      bio: null,
    }),
  },
});
```

By default, consent history is retained against the now-anonymized internal user ID. Set `keepConsentHistory: false` if your application should remove it as part of anonymization.

### Hard-delete an account

Hard deletion is deliberately disabled by default. Better Auth's built-in `delete-user` flow may be preferable when you want its verification behavior.

To opt in:

```ts
privacyKit({
  hardDelete: {
    enabled: true,
    before: async ({ userId }) => {
      await deleteApplicationData(userId);
    },
  },
});
```

Then:

```ts
await authClient.privacy.delete({
  confirmation: "DELETE",
});
```

## Options

```ts
privacyKit({
  export: {
    enabled: true,
    includeAccounts: true,
    includeSessions: true,
    extend: async ({ userId }) => ({}),
  },
  consent: {
    enabled: true,
    purposes: ["privacy-policy", "terms", "marketing"],
    maxMetadataBytes: 4096,
  },
  anonymize: {
    enabled: true,
    placeholderName: "Deleted User",
    keepConsentHistory: true,
    additionalUserFields: async ({ userId, user }) => ({}),
    before: async ({ userId }) => {},
    after: async ({ userId }) => {},
  },
  hardDelete: {
    enabled: false,
    before: async ({ userId }) => {},
    after: async ({ userId }) => {},
  },
  schema: {
    consentModelName: "privacyConsent",
  },
});
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/privacy/export` | Export the authenticated user's privacy/auth data |
| `POST` | `/privacy/consent` | Append a consent/withdrawal event |
| `GET` | `/privacy/consents` | List consent history |
| `POST` | `/privacy/anonymize` | Revoke access and anonymize identity |
| `POST` | `/privacy/delete` | Permanently delete the Better Auth identity (opt-in) |

All endpoints require an authenticated Better Auth session.

## Security model

Privacy endpoints are security-sensitive. The project therefore uses these defaults:

1. Every endpoint requires a valid Better Auth session.
2. Export never includes bearer session tokens or OAuth/credential secrets.
3. Anonymization revokes sessions and removes accounts before mutating the user identity.
4. Destructive requests require an explicit confirmation value.
5. Hard deletion is disabled unless the application opts in.
6. Destructive endpoints have a plugin-level rate limit.
7. Consent metadata is bounded by UTF-8 byte size.

If your threat model requires re-authentication, password confirmation, MFA, or email confirmation immediately before a destructive action, implement that at the application layer or use Better Auth's built-in deletion flow instead of enabling this plugin's hard-delete endpoint.

## What this plugin does not do

- It does not determine whether your product is legally compliant.
- It does not discover arbitrary application tables automatically.
- It does not know which custom fields in your app contain personal data.
- It does not implement cookie banners or analytics consent UIs.
- It does not send legal/privacy emails.
- It does not replace a data-retention policy.

## Development

```bash
npm install
npm run check
```

## License

MIT
