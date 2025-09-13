# 次回の開始ポイント（v2 / AI 補足）

このメモは「次回なにから始めるか」を短くまとめたものです。ローカル開発用の手順も一緒に残しています。

## 直近の優先タスク

1) CSE（Programmable Search Engine）の設定と接続確認（精度UP）
- CSE_ID と CSE_API_KEY を取得し、`.env` に設定
- `cd server && npm run dev` → ログに「CSE: configured」と出ること
- 参考: コントロールパネルで「ウェブ全体を検索」を有効化し、`gogo.gs/*` 等を優先サイトに設定

2) 要約の表示整形（見出し・引用・日付）
- フォーカスパネルの「AI要約」を、見出し（概要/価格傾向/良い点/注意点/出典）で表示
- 出典の `quote` と `date` を併記（長文は折りたたみ）

3) /api/enrich のキャッシュとレート制限（速度・コスト）
- place_id 単位で 6 時間キャッシュ（メモリでOK）
- 単位時間あたりの呼び出し数を制限（429 応答）

4) 収集先の優先度調整（安定化）
- server/index.js の `preferred` を見直し（gogo.gs、Googleマップ、地域掲示板など）
- CSE の対象サイト/除外設定も合わせて調整

## ローカル起動メモ

- サーバ（必須）
  - `cd server && npm install`（初回）
  - `.env` に `GEMINI_API_KEY`（必須）と `CSE_ID/CSE_API_KEY`（任意）を設定
  - `npm run dev` → `http://localhost:8787/` でフロントも同時に配信

- フロント（v2）
  - ブラウザで `http://localhost:8787/`
  - 検索 → 「AIで調べる」 → 上部パネル → 「AI要約を取得」

## セキュリティ＆公開前チェック（再掲）

- `.env` と `web_v2/config.js` は `.gitignore` 済み（鍵はコミットしない）
- Maps キーは HTTP リファラ制限＋API制限（JS/Places/Embed）
- 本番は CORS を許可ドメインに限定（server の `cors()`）
- ログに機密が残らないことを確認

## 参考リンク

- CSE 作成: https://programmablesearchengine.google.com/controlpanel/create
- Custom Search JSON API: https://console.cloud.google.com/

---

## web_ver2 開発キックオフ TODO（次回ここから）

目的: 「AI を使った検索・要約つき Web v2」を最短で形にする。

初手（最初の30分）
- リポジトリ確認: `web_v2/` と `server/` の現状をざっと読む（API 形・UI の雰囲気）。
- 使う鍵の確認: `.env` の `GEMINI_API_KEY`, `CSE_ID`, `CSE_API_KEY` を設定（ローカル）。
- ローカル起動: `cd server && npm install && npm run dev`（`http://localhost:8787/`）。

最小スコープ（MVP）
- 検索 → 候補表示 → 1件を選ぶ → 「AI要約を取得」ボタンで要約を出す。
- 出典URLと引用（短い抜粋）を並べる。NGワードや私見を避けて中立に。

実装タスクリスト（順序）
1) API 叩き台の確認/整備
   - `server/index.js` に `GET /api/search`（CSE）と `POST /api/enrich`（要約）を用意。
   - レート制限とメモリキャッシュ（place_id or URL単位で数時間）。
2) フロントの配線（`web_v2/`）
   - 検索フォーム → `/api/search` → リスト表示 → 詳細カードに「AI要約」ボタン。
   - フィードバック表示（読み込み中/エラー/再試行）。
3) UI 最低限の整形
   - 見出し（概要/価格傾向/良い点/注意点/出典）。長文は折りたたみ。
4) 品質と安全
   - 入出力をログ（要約テキストはPIIが無いか簡易チェック）。
   - `.env` と鍵はコミット禁止。ブラウザ側に出す鍵はリファラ制限。

確認基準（Doneの定義）
- ローカルで「検索→1件選択→AI要約表示」が 10秒以内に完了。
- エラー時にユーザー向けメッセージが表示され、再試行ができる。
- Lint/フォーマットが通る。`.env` に秘密情報がのみ存在（git 無視）。

次の伸ばしどころ（任意）
- 出典スコアリング（信頼性・鮮度・重複排除）。
- 価格情報の抽出と比較（スキーマ化）。
- 端末保存（最近の検索/要約の履歴）。
