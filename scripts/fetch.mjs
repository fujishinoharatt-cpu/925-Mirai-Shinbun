import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

// 未来新聞 — RSS 収集
// RSS 2.0 と Atom の両方を、外部パッケージなしで解析する

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
  // media:description は YouTube の Atom が動画の説明文を入れる独自タグ
  const raw = tagText(block, 'description')
    || tagText(block, 'summary')
    || tagText(block, 'media:description')
    || '';
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

// 一時的な通信エラーで欠けるフィードがあるため、1度だけ取り直す
async function fetchFeedWithRetry(feed) {
  try {
    return await fetchFeed(feed);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return fetchFeed(feed);
  }
}

// YouTube Data API から動画を取得
async function fetchYouTubeChannel(feed) {
  if (!process.env.YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY が設定されていません');
  }

  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${feed.channelId}&maxResults=15&order=date&type=video&key=${process.env.YOUTUBE_API_KEY}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    return data.items.map(item => ({
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      title: item.snippet.title,
      description: item.snippet.description,
      source: feed.name,
      category: feed.category,
      publishedAt: new Date(item.snippet.publishedAt),
    }));
  } catch (e) {
    throw new Error(`${feed.name}: ${e.message}`);
  }
}

export async function collectArticles(config, seenUrls = new Set()) {
  // RSS と YouTube を区別するラッパー関数
  const fetchFeed = async (feed) => {
    if (feed.type === 'youtube') {
      return await fetchYouTubeChannel(feed);
    } else {
      return await fetchFeedWithRetry(feed);
    }
  };

  const results = await Promise.allSettled(config.feeds.map(fetchFeed));

  const collected = [];
  const failures = [];
  const feedResults = [];
  results.forEach((r, i) => {
    const feed = config.feeds[i];
    if (r.status === 'fulfilled') {
      collected.push(...r.value);
      feedResults.push({ ...feed, ok: true, count: r.value.length });
      console.log(`  OK   ${feed.name} … ${r.value.length}件`);
    } else {
      failures.push(feed.name);
      feedResults.push({ ...feed, ok: false, error: r.reason.message });
      console.log(`  NG   ${feed.name} … ${r.reason.message}`);
    }
  });

  // 収集対象より古いものを除外（日付が取れないフィードは残す）
  const limit = Date.now() - config.maxAgeHours * 3600 * 1000;
  const fresh = collected.filter((a) => !a.publishedAt || a.publishedAt.getTime() >= limit);

  // 今回の収集内での重複を除去
  const inThisRun = new Set();
  const unique = fresh.filter((a) => !inThisRun.has(a.url) && inThisRun.add(a.url));

  // 過去に掲載済みの記事を除外する。枠を新着で埋めたいので件数を絞る前に行う
  const unseen = unique.filter((a) => !seenUrls.has(a.url));
  const skipped = unique.length - unseen.length;

  unseen.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));

  // 1サイトが大量配信する日でも紙面が偏らないように、媒体ごとの本数を制限する
  const perSource = new Map();
  const balanced = unseen.filter((a) => {
    const n = perSource.get(a.source) ?? 0;
    if (n >= config.maxPerSource) return false;
    perSource.set(a.source, n + 1);
    return true;
  });

  const articles = balanced.slice(0, config.maxItems);

  return {
    articles,
    failures,
    feedResults,
    config,
    total: collected.length,
    skipped,
    retentionDays: config.seenRetentionDays,
    // 1385件→28件の間で何が起きたかを画面に出すための段階別件数
    stages: [
      ['RSSから取得', collected.length],
      [`${config.maxAgeHours}時間以内`, fresh.length],
      ['重複を除く', unique.length],
      ['掲載済みを除く', unseen.length],
      [`1媒体${config.maxPerSource}件まで`, balanced.length],
      ['掲載', articles.length],
    ],
  };
}
