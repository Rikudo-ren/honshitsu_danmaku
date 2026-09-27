# honshitsu_danmaku

Vite + React の静的サイトです。

## ローカルで確認

```sh
npm ci
npm run dev
```

## Vercel で公開

1. このリポジトリを GitHub に push します。
2. [Vercel](https://vercel.com/new) で **Add New → Project** を選び、この GitHub リポジトリをインポートします。
3. Framework Preset は **Vite**、Root Directory はリポジトリのルートにします。`vercel.json` にビルドコマンド `npm run build` と出力先 `dist` を設定済みです。環境変数は不要です。
4. **Deploy** を押すと、発行された `*.vercel.app` の URL から開けます。以後は接続したブランチへの push で再デプロイできます。

手元で本番ビルドを確認する場合は `npm run build` を実行してください。
