// 未来新聞 — ページ生成スクリプト
// RSS で集めた記事を Gemini に要約させて HTML に組み立てる

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectArticles } from './fetch.mjs';
import { summarizeArticles } from './summarize.mjs';
import { loadSeen, saveSeen } from './seen.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = join(ROOT, 'docs', 'index.html');

function toJstText(date) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);

function toShortDate(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function renderArticle(article) {
  const summary = article.summary
    ? `\n          <p class="card-summary">${escapeHtml(article.summary)}</p>`
    : '';
  return `      <article class="card">
        <a class="card-link" href="${escapeHtml(article.url)}" target="_blank" rel="noopener">
          <span class="card-badge">${escapeHtml(article.category)}</span>
          <h2 class="card-title">${escapeHtml(article.title)}</h2>${summary}
          <span class="card-source">${escapeHtml(article.source)}</span>
          <span class="card-date">${escapeHtml(toShortDate(article.publishedAt))}</span>
        </a>
      </article>`;
}

function renderPage(items, builtAt, badge) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#0f1420">
<title>未来新聞</title>
<style>
  /* 開発中テーマ: ダーク系グラスモーフィズム（Agent-T / Theme-Policy）
     運用移行時は :root の変数セットを差し替えるだけで済むようにする */
  :root {
    --bg: #0f1420;
    --bg-glow: #1d2b45;
    --surface: rgba(255, 255, 255, 0.06);
    --surface-hover: rgba(255, 255, 255, 0.10);
    --border: rgba(255, 255, 255, 0.12);
    --text: #e8ecf4;
    --text-dim: #93a0b8;
    --accent: #6ea8ff;
    --shadow: rgba(0, 0, 0, 0.35);
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    padding: 0 16px 48px;
    background: var(--bg);
    background-image: radial-gradient(circle at 50% 0%, var(--bg-glow), var(--bg) 60%);
    background-attachment: fixed;
    color: var(--text);
    font-family: system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif;
    line-height: 1.7;
  }

  .wrap { max-width: 720px; margin: 0 auto; }

  header { padding: 32px 0 24px; text-align: center; }

  .title {
    margin: 0;
    font-size: 1.75rem;
    letter-spacing: 0.08em;
  }

  .built-at {
    margin: 8px 0 0;
    color: var(--text-dim);
    font-size: 0.8rem;
  }

  .step-badge {
    display: inline-block;
    margin-top: 12px;
    padding: 4px 12px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--accent);
    font-size: 0.75rem;
  }

  .card {
    margin-bottom: 16px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--surface);
    backdrop-filter: blur(12px);
    box-shadow: 0 4px 16px var(--shadow);
    transition: background 0.2s;
  }

  .card:hover { background: var(--surface-hover); }

  .card-link {
    display: block;
    padding: 20px;
    color: inherit;
    text-decoration: none;
  }

  .card-badge {
    display: inline-block;
    margin-bottom: 10px;
    padding: 2px 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--text-dim);
    font-size: 0.7rem;
  }

  /* 長い URL や英単語がはみ出して横スクロールが出るのを防ぐ */
  .card-title, .card-summary { overflow-wrap: anywhere; }

  .card-title { margin: 0 0 8px; font-size: 1.05rem; }

  .card-summary { margin: 0 0 12px; color: var(--text-dim); font-size: 0.9rem; }

  .card-source { color: var(--accent); font-size: 0.75rem; }

  .card-date { margin-left: 10px; color: var(--text-dim); font-size: 0.75rem; }

  footer {
    padding-top: 24px;
    color: var(--text-dim);
    font-size: 0.75rem;
    text-align: center;
  }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1 class="title">未来新聞</h1>
      <p class="built-at">最終更新 ${escapeHtml(builtAt)}</p>
      <span class="step-badge">${escapeHtml(badge)}</span>
    </header>

    <main>
${items.map(renderArticle).join('\n')}
    </main>

    <footer>925-Mirai-Shinbun / GitHub Actions により自動生成</footer>
  </div>
</body>
</html>
`;
}

const previousSeen = await loadSeen();
console.log(`RSS を収集します（掲載済み ${Object.keys(previousSeen).length}件を除外）`);
const { articles: collected, failures, total, skipped, retentionDays } =
  await collectArticles(new Set(Object.keys(previousSeen)));

// 全フィードが落ちた日にページを空で上書きしないよう、異常終了して前回分を残す
if (total === 0) {
  console.error('どのフィードからも記事を取得できませんでした。ページは更新しません。');
  process.exit(1);
}

// 取得はできたが新着が無い日は、正常終了して前回のページをそのまま残す
if (collected.length === 0) {
  console.log(`新着記事はありませんでした（掲載済みとして ${skipped}件を除外）。ページは据え置きます。`);
  process.exit(0);
}

console.log('Gemini で日本語要約を作ります');
const { articles, summarized } = await summarizeArticles(collected);

const badge = summarized ? 'AI要約つき' : 'AI要約なし（RSS原文）';
const builtAt = toJstText(new Date());
await mkdir(dirname(OUT_FILE), { recursive: true });
await writeFile(OUT_FILE, renderPage(articles, builtAt, badge), 'utf8');

// ページを書き出せてから記録する。先に記録すると、失敗した記事が二度と出せなくなる
const seenCount = await saveSeen(previousSeen, articles.map((a) => a.url), retentionDays);

console.log(`生成しました: ${OUT_FILE}`);
console.log(`ビルド時刻 (JST): ${builtAt}`);
console.log(`取得 ${total}件 → 掲載済み除外 ${skipped}件 → 掲載 ${articles.length}件 / 失敗フィード ${failures.length}件`);
console.log(`掲載済み記録: ${seenCount}件（${retentionDays}日で自動削除）`);
