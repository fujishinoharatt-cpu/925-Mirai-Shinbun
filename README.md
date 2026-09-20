# 925-Mirai-Shinbun（未来新聞）

毎朝 5:30 に自動でニュースを集め、スマホ向けページとして GitHub Pages に公開する汎用ニュースまとめアプリ。

仕様は [metadata.md](./metadata.md) を参照。

---

## 現在の状態

**Step 1: パイプライン疎通**（固定データで公開まで通す段階）
RSS 取得と Gemini 要約はまだ入っていません。

| Step | 内容 | 状態 |
| :--- | :--- | :--- |
| 1 | cron 起動 → 固定 HTML を生成 → Pages で公開 | 実装済み |
| 2 | RSS から記事を取得して一覧化 | 未着手 |
| 3 | Gemini による要約を追加 | 未着手 |
| 4 | 複数サイト対応・重複除けの実装 | 未着手 |

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
