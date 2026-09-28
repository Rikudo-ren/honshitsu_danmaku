#!/bin/sh
# プレビュー配信の常駐ラッパ：落ちても即座に再起動する（依存なし・ビルド不要）
cd "$(dirname "$0")/.." || exit 1
while :; do
  node tools/serve.mjs
  echo "[preview] server exited (code $?) — 0.5 秒後に再起動"
  sleep 0.5
done
