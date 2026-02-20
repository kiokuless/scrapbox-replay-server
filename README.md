# scrapbox-replay-server

iOSショートカットから音声メモのテキストを受け取り、Scrapboxにページを自動作成するCloudflare Worker。

## セットアップ

```bash
npm install
```

## ローカル開発

```bash
# .dev.vars にシークレットを定義
cat > .dev.vars <<'EOF'
API_TOKEN=your-bearer-token
SCRAPBOX_PROJECT=your-project
SCRAPBOX_SID=your-connect-sid
EOF

npm run dev
```

## デプロイ

### 手動デプロイ

```bash
# シークレットを設定（初回のみ）
npx wrangler secret put API_TOKEN
npx wrangler secret put SCRAPBOX_PROJECT
npx wrangler secret put SCRAPBOX_SID

# デプロイ
npm run deploy
```

### GitHub Actions による自動デプロイ

mainブランチへのpushで自動デプロイされる。

リポジトリの **Settings > Secrets and variables > Actions** に以下を設定:

| Secret | 説明 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API トークン（Workers の編集権限が必要） |

Worker のシークレット (`API_TOKEN`, `SCRAPBOX_PROJECT`, `SCRAPBOX_SID`) は事前に `wrangler secret put` で設定しておく。

## API

### `POST /`

```bash
curl -X POST https://scrapbox-replay-server.<your-subdomain>.workers.dev/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <API_TOKEN>" \
  -d '{"text": "音声メモのテキスト"}'
```

レスポンス:

```json
{"ok": true, "title": "メモ_2025-01-15_1430"}
```

## iOSショートカット設定

1. ショートカットアプリで新規作成
2. 「テキストを音声入力」アクションを追加
3. 「URLの内容を取得」アクションを追加:
   - URL: Worker の URL
   - 方法: POST
   - ヘッダー: `Authorization: Bearer <API_TOKEN>`
   - 本文: JSON `{"text": "音声入力の結果"}`
