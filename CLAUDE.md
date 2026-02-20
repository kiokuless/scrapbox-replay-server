# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow

コード変更後は自動的にコミットして push すること。

## Commands

- `npm run dev` — ローカル開発サーバー起動（wrangler dev）。シークレットは `.dev.vars` に定義
- `npm test` — テスト実行（`vitest run`）
- `npm run test:watch` — テストのウォッチモード
- `npm run typecheck` — TypeScript型チェック（`tsc --noEmit`）
- `npm run deploy` — Cloudflare Workers へデプロイ（`wrangler deploy`）

単一テストファイルの実行: `npx vitest run src/index.test.ts`

## Architecture

単一ファイルの Cloudflare Worker (`src/index.ts`)。iOSショートカットから音声メモテキストを受け取り、Scrapbox (Cosense) の Import API でページを自動作成する。

### リクエストフロー

1. `POST /` で `{"text": "..."}` を受信、`Authorization: Bearer` で認証
2. `GET https://scrapbox.io/api/users/me` で CSRF トークンを取得（レスポンスJSON の `csrfToken` フィールド）
3. `POST https://scrapbox.io/api/page-data/import/<project>.json` に **multipart/form-data** で `import-file` フィールドにJSONを添付してページ作成

### Scrapbox Import API の注意点

- リクエストは `application/json` ではなく `multipart/form-data`（`import-file` フィールドにJSONファイルを添付）
- CSRF トークンは `/api/users/me` から取得し `X-CSRF-TOKEN` ヘッダーで送信
- 認証は `Cookie: connect.sid=<SID>` ヘッダー

### 環境変数（wrangler secrets）

- `API_TOKEN` — Bearer認証トークン
- `SCRAPBOX_PROJECT` — Scrapboxプロジェクト名
- `SCRAPBOX_SID` — Scrapboxの `connect.sid` Cookie値

## Testing

テストは `src/index.test.ts` に vitest で記述。外部API（Scrapbox）は `vi.spyOn(globalThis, "fetch")` でモック。テストファイルは `tsconfig.json` の exclude に指定されており `tsc --noEmit` の対象外。

## CI/CD

main push で GitHub Actions が `tsc --noEmit` → `npm test` → `wrangler deploy` を実行。リポジトリシークレット `CLOUDFLARE_API_TOKEN` が必要。
