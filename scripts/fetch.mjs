// 未来新聞 — RSS 収集
// RSS 2.0 と Atom の両方を、外部パッケージなしで解析する

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 15000;

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  '#39': "'", '#8217': '’', '#8216': '‘', '#8220': '“', '#8221': '”',
};

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function clean(raw) {
  return decodeEntities(
    raw
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]*>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

function tagText(block, tag) {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? clean(m[1]) : '';
}

// Atom は <link href="..."/> 形式。rel="alternate" か rel 無しを本文リンクとして扱う
function atomLink(block) {
  const links = block.match(/<link\b[^>]*>/gi) || [];
  for (const tag of links) {
    const rel = (tag.match(/\brel="([^"]*)"/i) || [])[1];
    if (rel && rel !== 'alternate') continue;
    const href = (tag.match(/\bhref="([^"]*)"/i) || [])[1];
    if (href) return decodeEntities(href);
  }
  return '';
}

function parseDate(block) {
  for (const tag of ['pubDate', 'published', 'updated', 'dc:date', 'date']) {
    const v = tagText(block, tag);
    if (!v) continue;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

// RSS の説明文には本文URLやコメントURLが混ざる媒体があるため、URL を落としてから使う
function summaryText(block) {
  const raw = tagText(block, 'description') || tagText(block, 'summary') || '';
  const stripped = raw
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\b[\w ]{0,20}URL:\s*/gi, '') // URL を消した後に残る「Article URL:」等のラベル
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length > 140 ? `${stripped.slice(0, 140)}…` : stripped;
}

function parseFeed(xml, feed) {
  const blocks = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) || [];
  const items = [];
  for (const block of blocks) {
    const title = tagText(block, 'title');
    const link = tagText(block, 'link') || atomLink(block);
    if (!title || !link) continue;
    items.push({
      title,
      url: link,
      source: feed.name,
      category: feed.category,
      publishedAt: parseDate(block),
      // Step 3 で Gemini の要約に差し替える。それまでは RSS の説明文を流用する
      summary: summaryText(block),
    });
  }
  return items;
}

async function fetchFeed(feed) {
  const res = await fetch(feed.url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': 'Mirai-Shinbun/1.0 (+https://github.com/fujishinoharatt-cpu/925-Mirai-Shinbun)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeed(await res.text(), feed);
}

export async function collectArticles() {
  const config = JSON.parse(await readFile(join(ROOT, 'config', 'feeds.json'), 'utf8'));
  const results = await Promise.allSettled(config.feeds.map(fetchFeed));

  const collected = [];
  const failures = [];
  results.forEach((r, i) => {
    const feed = config.feeds[i];
    if (r.status === 'fulfilled') {
      collected.push(...r.value);
      console.log(`  OK   ${feed.name} … ${r.value.length}件`);
    } else {
      failures.push(feed.name);
      console.log(`  NG   ${feed.name} … ${r.reason.message}`);
    }
  });

  // 96時間より古いものを除外（日付が取れないフィードは残す）
  const limit = Date.now() - config.maxAgeHours * 3600 * 1000;
  const fresh = collected.filter((a) => !a.publishedAt || a.publishedAt.getTime() >= limit);

  // 同じ URL の重複を除去
  const seen = new Set();
  const unique = fresh.filter((a) => !seen.has(a.url) && seen.add(a.url));

  unique.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));

  // 1サイトが大量配信する日でも紙面が偏らないように、媒体ごとの本数を制限する
  const perSource = new Map();
  const balanced = unique.filter((a) => {
    const n = perSource.get(a.source) ?? 0;
    if (n >= config.maxPerSource) return false;
    perSource.set(a.source, n + 1);
    return true;
  });

  return { articles: balanced.slice(0, config.maxItems), failures, total: collected.length };
}
