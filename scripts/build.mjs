// 未来新聞 — ページ生成スクリプト
// RSS で集めた記事を Gemini に要約させて HTML に組み立てる

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectArticles } from './fetch.mjs';
import { summarizeArticles, MODEL } from './summarize.mjs';
import { loadSeen, mergeSeen, writeSeen } from './seen.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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

function renderReport(r) {
  const feedRows = r.feedResults.map((f) => `
          <tr>
            <td class="feed-cat">${escapeHtml(f.category)}</td>
            <td>${escapeHtml(f.name)}</td>
            <td class="${f.ok ? 'stat-ok' : 'stat-ng'}">${f.ok ? `${f.count}件` : escapeHtml(f.error)}</td>
          </tr>`).join('');

  const ai = r.summarized
    ? `${escapeHtml(r.model)} に ${r.published}件をまとめて1回`
    : `要約なし（${escapeHtml(r.reason)}）`;

  const stageRows = r.stages.map(([label, count], i) => `
            <tr>
              <td class="stage-label">${i > 0 ? '↓ ' : ''}${escapeHtml(label)}</td>
              <td class="stage-count">${count}件</td>
            </tr>`).join('');

  return `
      <details class="report">
        <summary>処理の状況</summary>
        <div class="report-body">
          <h3>今朝の実行結果</h3>
          <dl class="kv">
            <dt>実行時刻</dt><dd>${escapeHtml(r.builtAt)}</dd>
            <dt>AI要約</dt><dd>${ai}</dd>
            <dt>掲載済みの記録</dt><dd>${r.seenCount}件</dd>
          </dl>

          <h3>絞り込みの内訳</h3>
          <table class="stages">${stageRows}
          </table>

          <h3>取得元 ${r.feedResults.length}サイト</h3>
          <table class="feeds">${feedRows}
          </table>

          <h3>処理の仕様</h3>
          <ul class="spec">
            <li>毎朝 5:30（日本時間）に GitHub Actions が自動実行</li>
            <li>直近 ${r.config.maxAgeHours} 時間以内に公開された記事が対象</li>
            <li>1媒体あたり最大 ${r.config.maxPerSource} 件、全体で最大 ${r.config.maxItems} 件</li>
            <li>一度掲載した記事は ${r.config.seenRetentionDays} 日間は再掲しない</li>
            <li>要約は全記事を1回のリクエストにまとめて送る（1日1回）</li>
            <li>要約に失敗した日は RSS の原文を表示し、ページ自体は更新する</li>
            <li>全サイトの取得に失敗した日は更新せず、前日の紙面を残す</li>
          </ul>
        </div>
      </details>`;
}

// 紙面が1つしかないうちはリンクを出さない
function renderNav(editions, currentId) {
  if (editions.length < 2) return '';
  const links = editions.map((e) => (e.id === currentId
    ? `<span class="nav-item nav-current">${escapeHtml(e.label)}</span>`
    : `<a class="nav-item" href="${escapeHtml(e.output)}">${escapeHtml(e.label)}</a>`)).join('\n        ');
  return `
      <nav class="nav">
        ${links}
      </nav>`;
}

function renderPage(items, builtAt, badge, report, edition, editions) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#0f1420">
<title>未来新聞 ${escapeHtml(edition.label)}</title>
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
    --warn: #f0a868;
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

  .nav {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 16px;
  }

  .nav-item {
    padding: 6px 16px;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--text-dim);
    font-size: 0.8rem;
    text-decoration: none;
  }

  .nav-current { background: var(--surface-hover); color: var(--text); }

  .report {
    margin-bottom: 20px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--surface);
  }

  .report summary {
    padding: 14px 20px;
    color: var(--text-dim);
    font-size: 0.85rem;
    cursor: pointer;
  }

  .report-body { padding: 0 20px 20px; font-size: 0.8rem; }

  .report-body h3 {
    margin: 20px 0 8px;
    color: var(--accent);
    font-size: 0.8rem;
    font-weight: 600;
  }

  .kv { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; margin: 0; }
  .kv dt { color: var(--text-dim); }
  .kv dd { margin: 0; }

  .stages { width: 100%; border-collapse: collapse; }
  .stages td { padding: 3px 0; }
  .stage-label { color: var(--text-dim); }
  .stage-count { text-align: right; white-space: nowrap; }
  .stages tr:last-child .stage-label,
  .stages tr:last-child .stage-count { color: var(--text); font-weight: 600; }

  .feeds { width: 100%; border-collapse: collapse; }
  .feeds td { padding: 4px 0; vertical-align: top; }
  .feed-cat { width: 5.5em; color: var(--text-dim); }
  .stat-ok { text-align: right; white-space: nowrap; }
  .stat-ng { text-align: right; color: var(--warn); overflow-wrap: anywhere; }

  .spec { margin: 0; padding-left: 1.2em; color: var(--text-dim); }
  .spec li { margin-bottom: 4px; }

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
      <p class="built-at">${escapeHtml(edition.label)}　最終更新 ${escapeHtml(builtAt)}</p>
      <span class="step-badge">${escapeHtml(badge)}</span>${renderNav(editions, edition.id)}
    </header>

${renderReport(report)}

    <main>
${items.map(renderArticle).join('\n')}
    </main>

    <footer>925-Mirai-Shinbun / GitHub Actions により自動生成</footer>
  </div>
</body>
</html>
`;
}

async function buildEdition(edition, editions) {
  const previousSeen = await loadSeen(edition.id);
  console.log(`  RSS を収集します（掲載済み ${Object.keys(previousSeen).length}件を除外）`);
  const { articles: collected, failures, feedResults, total, skipped, stages } =
    await collectArticles(edition, new Set(Object.keys(previousSeen)));

  // 全フィードが落ちた日にページを空で上書きしない。前回分を残す
  if (total === 0) {
    console.error('  どのフィードからも記事を取得できませんでした。この紙面は更新しません。');
    return false;
  }

  // 取得はできたが新着が無い日は、前回のページをそのまま残す（異常ではない）
  if (collected.length === 0) {
    console.log(`  新着記事はありません（掲載済みとして ${skipped}件を除外）。据え置きます。`);
    return true;
  }

  console.log('  Gemini で日本語要約を作ります');
  const { articles, summarized, reason } = await summarizeArticles(collected);

  const builtAt = toJstText(new Date());
  const nextSeen = mergeSeen(previousSeen, articles.map((a) => a.url), edition.seenRetentionDays);
  const seenCount = Object.keys(nextSeen).length;
  const outFile = join(ROOT, 'docs', edition.output);

  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, renderPage(
    articles,
    builtAt,
    summarized ? 'AI要約つき' : 'AI要約なし（RSS原文）',
    {
      builtAt, total, skipped, published: articles.length, stages,
      summarized, reason, model: MODEL, feedResults, config: edition, seenCount,
    },
    edition,
    editions,
  ), 'utf8');

  // ページを書き出せてから記録する。先に記録すると、失敗した記事が二度と出せなくなる
  await writeSeen(edition.id, nextSeen);

  console.log(`  生成: docs/${edition.output}`);
  console.log(`  取得 ${total}件 → 掲載済み除外 ${skipped}件 → 掲載 ${articles.length}件 / 失敗フィード ${failures.length}件`);
  console.log(`  掲載済み記録: ${seenCount}件（${edition.seenRetentionDays}日で自動削除）`);
  return true;
}

const { editions: editionIds } =
  JSON.parse(await readFile(join(ROOT, 'config', 'editions.json'), 'utf8'));

const editions = [];
for (const id of editionIds) {
  const config = JSON.parse(await readFile(join(ROOT, 'config', `edition.${id}.json`), 'utf8'));
  editions.push({ id, ...config });
}

let built = 0;
for (const edition of editions) {
  console.log(`\n===== ${edition.label}（${edition.id}） =====`);
  if (await buildEdition(edition, editions)) built += 1;
}

console.log(`\n${editions.length}紙面中 ${built}紙面を処理しました`);

// 1紙面でも作れていれば公開する。全滅したときだけ失敗として扱う
if (built === 0) process.exit(1);
