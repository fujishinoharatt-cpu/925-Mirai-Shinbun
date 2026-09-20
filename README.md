# 925-Mirai-Shinbun（未来新聞）

毎朝 5:30 に自動でニュースを集め、スマホ向けページとして GitHub Pages に公開する汎用ニュースまとめアプリ。

仕様は [metadata.md](./metadata.md) を参照。

---

## 現在の状態

**全 Step 完了。** 毎朝 5:30 に自動で更新されます。

| Step | 内容 | 状態 |
| :--- | :--- | :--- |
| 1 | cron 起動 → HTML を生成 → Pages で公開 | **完了**（2026-09-20 実機検証済み） |
| 2 | RSS から記事を取得して一覧化 | **完了** |
| 3 | Gemini による日本語要約を追加 | **完了**（2026-09-20 実機検証済み） |
| 4 | 既出記事の持ち越し除外（`data/seen.json`） | **完了** |

### 処理の状況表示

ページ下部の「**処理の状況**」を開くと、その朝の実行結果と処理の仕様が確認できます。

- 実行時刻 / 取得件数 / 除外件数 / 掲載件数
- **12サイトそれぞれの取得結果**（失敗したサイトは理由も表示）
- **AI要約の成否とモデル名**
- 掲載済みの記録件数
- 処理の仕様（実行時刻・対象期間・上限・再掲しない期間など）

要約が失敗しても Actions は緑のままなので、**GitHub を開かずに異常へ気づくための窓口**として用意しています。

### Step 4 で入ったもの

- `scripts/seen.mjs` … 掲載済み URL を `data/seen.json` に記録し、翌日以降は除外する
- 記録は **14日で自動削除**（収集対象が直近96時間なので、それより長く持てば十分）
- ページを書き出せてから記録する（途中で失敗した記事を取りこぼさないため）
- 新着ゼロの日は**正常終了して前回のページを据え置く**（Actions は緑のまま）
- フィード取得は一時的な通信エラーに備えて **1度だけ再試行**する

### Step 3 で入ったもの

- `scripts/summarize.mjs` … 全記事を **1リクエストにまとめて** Gemini に送る
- 英語記事の見出しを日本語化し、2〜3文の要約を付ける
- API キーは `GEMINI_API_KEY`（GitHub Secrets）。コードには書かない
- **要約に失敗してもページは出す**（RSS の説明文に戻るだけ）
- ページ上部のバッジで `AI要約つき` / `AI要約なし（RSS原文）` が分かる

使用モデルは `scripts/summarize.mjs` 冒頭の `MODEL` 定数で変更できます。

### Step 2 で入ったもの

- `config/feeds.json` … 収集対象 12 フィード（企業発表 / 海外 / 国内 / 開発者 / 論文）
- `scripts/fetch.mjs` … RSS 2.0 と Atom の両方を外部パッケージなしで解析
- 直近 96 時間・最大 28 件に絞り込み、URL 重複を除去
- 1 媒体あたり最大 4 件に制限（1 サイトが紙面を埋めるのを防ぐ）
- 全フィード失敗時は異常終了し、前回のページを残す

---

## セットアップ手順（初回のみ）

### 1. GitHub にリポジトリを作る

`921-Live_Scribe_TV` と同じ要領で、**public** リポジトリ `925-Mirai-Shinbun` を作成します。

```bash
git init
git add .
git commit -m "初回コミット: Step 1 パイプライン疎通"
git branch -M main
git remote add origin https://github.com/fujishinoharatt-cpu/925-Mirai-Shinbun.git
git push -u origin main
```

### 2. GitHub Pages を有効にする

リポジトリの **Settings → Pages** で以下を設定します。

| 項目 | 値 |
| :--- | :--- |
| Source | Deploy from a branch |
| Branch | `main` |
| Folder | **`/docs`** |

数分後、次の URL で公開されます。

```
https://fujishinoharatt-cpu.github.io/925-Mirai-Shinbun/
```

### 3. Actions に書き込み権限を与える

**Settings → Actions → General → Workflow permissions** で
**Read and write permissions** を選択して Save。

> 生成した HTML をリポジトリに書き戻すために必要です。これが無いと自動コミットで失敗します。

### 4. 動作確認（タイマーを待たずに実行する）

**Actions タブ → 「毎朝の未来新聞ビルド」→ Run workflow** を押します。
GAS のエディタで関数を手動実行するのと同じ感覚です。

成功すると、公開ページの「最終更新」の時刻が押した時刻に変わります。

---

## ローカルでの確認

```bash
node scripts/build.mjs
```

`docs/index.html` が生成されるので、ブラウザで開いて見た目を確認できます。
Actions を回さなくても HTML の調整ができます。

---

## 日々の更新方法

```bash
git push
```

push した時点で反映されます。`clasp push` / `clasp deploy` / バージョン定数の更新は不要です。

---

## 注意事項

- **公開範囲**: public リポジトリのため、`docs/` に置いたものは誰でも閲覧できます。社内データは載せないでください。
- **cron の実行時刻**: GitHub 側の混雑状況により、定刻から数分〜数十分遅れることがあります。
- **API キー**: Step 3 で Gemini を追加する際は、**Settings → Secrets and variables → Actions** に `GEMINI_API_KEY` として登録します。コードへの直書きは禁止です（Agent-T / Secrets-Management）。
