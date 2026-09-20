// 未来新聞 — 掲載済み記事の記録
// 毎朝ページを作り直すため、「どの記事を既に出したか」だけが唯一の永続データになる

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEEN_FILE = join(ROOT, 'data', 'seen.json');

export async function loadSeen() {
  try {
    const parsed = JSON.parse(await readFile(SEEN_FILE, 'utf8'));
    return parsed.urls ?? {};
  } catch {
    return {}; // 初回はファイルが存在しない
  }
}

export async function saveSeen(previous, publishedUrls, retentionDays) {
  const now = new Date();
  const limit = now.getTime() - retentionDays * 86400 * 1000;

  // 収集対象が直近96時間なので、それより長く保持すれば重複は防げる。
  // 残し続けるとファイルが際限なく育つため、古い記録は捨てる
  const kept = Object.fromEntries(
    Object.entries(previous).filter(([, iso]) => new Date(iso).getTime() >= limit)
  );
  for (const url of publishedUrls) kept[url] = now.toISOString();

  await mkdir(dirname(SEEN_FILE), { recursive: true });
  await writeFile(SEEN_FILE, `${JSON.stringify({ urls: kept }, null, 1)}\n`, 'utf8');

  return Object.keys(kept).length;
}
