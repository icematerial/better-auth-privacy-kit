# better-auth-privacy-kit

[English README](./README.md)

[Better Auth](https://better-auth.com) 向けのPrivacy機能をまとめたプラグインです。ユーザーデータExport、同意履歴、アカウント匿名化、任意の完全削除を追加できます。

> **ステータス:** 初期版 / `0.x`。このパッケージはPrivacy対応を実装するための部品です。導入するだけでGDPR、CCPA/CPRA、日本の個人情報保護法などへの法的準拠が保証されるものではありません。

## 何を解決するもの？

認証まわりでは、次のようなPrivacy機能をサービスごとに何度も実装しがちです。

- 「自分に紐づくデータをダウンロードしたい」
- 「どのバージョンの利用規約・Privacy Policyに同意したか残したい」
- 「個人情報を匿名化してログインできない状態にしたい」
- 「認証データを完全に削除したい」

`better-auth-privacy-kit` は、こうした共通処理をBetter Authプラグインとしてまとめます。

## 主な機能

- **ユーザーデータExport**
  - User情報
  - OAuth/認証シークレットを除外した連携Account情報
  - セッショントークンを除外したSession情報
  - 同意履歴
  - アプリ固有データの追加Export
- **同意履歴**
  - purpose
  - 規約・ポリシーのversion
  - 同意/撤回
  - source
  - metadata
  - 日時
- **アカウント匿名化**
  - 先に全Sessionを無効化
  - OAuth/credential Accountを削除
  - 名前・メール・画像を匿名値へ変更
  - 独自Userカラムも追加処理可能
- **完全削除**
  - 初期状態では無効
  - 明示的な確認文字列が必要
- Better Auth Clientの型推論対応
- Better Authの各DB Adapterで利用するためのPlugin Schema

## 必要環境

- Better Auth `>=1.7.0 <2`
- Node.js `>=22.12.0`
- Zod `4.x`

Better Auth `1.7.x` を対象に開発しています。

## インストール

```bash
npm install better-auth-privacy-kit
```

### Server側

```ts
import { betterAuth } from "better-auth";
import { privacyKit } from "better-auth-privacy-kit";

export const auth = betterAuth({
  database: /* Better Authで利用しているDB */,
  plugins: [
    privacyKit({
      consent: {
        purposes: ["privacy-policy", "terms", "marketing"],
      },
    }),
  ],
});
```

### Schemaを生成・Migration

このプラグインは `privacyConsent` モデルを追加します。

```bash
npx auth@latest generate
```

Better Auth側の構成がmigrationに対応している場合は、次でもOKです。

```bash
npx auth@latest migrate
```

### Client側

```ts
import { createAuthClient } from "better-auth/client";
import { privacyKitClient } from "better-auth-privacy-kit/client";

export const authClient = createAuthClient({
  plugins: [privacyKitClient()],
});
```

## 使い方

### 現在のユーザーのデータをExport

```ts
const { data, error } = await authClient.privacy.export();
```

返却イメージ:

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

Session token、OAuth access token、refresh token、ID token、credentialのpasswordフィールドなどはExport対象から除外します。

### アプリ独自データもExportする

プラグイン側から「どのテーブルがユーザーのものか」を勝手に推測するのは危険なので、必要なものだけ明示的に追加します。

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

`extend()` からAPIキーなどのシークレットを返さないようにしてください。

### 同意を記録する

```ts
await authClient.privacy.consent({
  purpose: "privacy-policy",
  version: "2026-09-01",
  granted: true,
  source: "signup",
  metadata: {
    locale: "ja",
  },
});
```

同意撤回も新しい履歴として追加します。

```ts
await authClient.privacy.consent({
  purpose: "marketing",
  version: "2026-09-01",
  granted: false,
  source: "settings",
});
```

履歴取得:

```ts
const { data } = await authClient.privacy.consents();
```

### アカウントを匿名化する

```ts
await authClient.privacy.anonymize({
  confirmation: "ANONYMIZE",
});
```

名前やメールを書き換える前に、全Sessionを無効化し、紐づくOAuth/credential Accountを削除します。そのため、匿名化後はその認証情報ではログインできません。

独自のUserカラムに個人情報がある場合は、そのフィールドも明示的に置換します。

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

初期設定では、同意履歴は匿名化された内部User IDに紐づけたまま保持します。匿名化時に同意履歴も消したい場合は `keepConsentHistory: false` にしてください。

### 完全削除する

完全削除は初期状態では**無効**です。削除直前の本人確認などを重視する場合は、Better Auth標準の `delete-user` を利用する方が適切なことがあります。

有効化する場合:

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

実行:

```ts
await authClient.privacy.delete({
  confirmation: "DELETE",
});
```

## 設定一覧

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

## Endpoint

| Method | Path | 内容 |
|---|---|---|
| `GET` | `/privacy/export` | ログイン中ユーザーのPrivacy/AuthデータをExport |
| `POST` | `/privacy/consent` | 同意・撤回履歴を追加 |
| `GET` | `/privacy/consents` | 同意履歴を取得 |
| `POST` | `/privacy/anonymize` | 認証を無効化して個人情報を匿名化 |
| `POST` | `/privacy/delete` | Better Auth上のユーザーを完全削除（要opt-in） |

すべてBetter Authのログイン済みSessionが必要です。

## セキュリティ方針

Privacy系Endpointは影響が大きいため、初期設計を安全寄りにしています。

1. 全EndpointでBetter Auth Sessionを必須にする
2. ExportにSession tokenやOAuth/credential secretを含めない
3. 匿名化では個人情報変更より先にSessionとAccountを無効化する
4. 破壊的操作には確認文字列を要求する
5. 完全削除は明示的に有効化しない限り使えない
6. 破壊的Endpointにはrate limitを設定する
7. Consent metadataにはUTF-8 byte数上限を設定する

「削除直前にパスワード再入力」「MFAを再要求」「確認メールを踏ませる」などが必要なサービスでは、アプリ側で追加確認を入れるか、プラグインの完全削除ではなくBetter Auth標準の削除フローを利用してください。

## このプラグインがやらないこと

- 法令準拠の判定
- アプリ独自DBテーブルの自動探索
- 独自Userカラムの個人情報判定
- Cookie BannerやAnalytics同意UI
- Privacy関連メール送信
- データ保持期間ポリシーそのものの策定

## 開発

```bash
npm install
npm run check
```

## License

MIT
