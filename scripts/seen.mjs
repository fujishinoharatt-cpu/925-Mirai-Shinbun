// 未来新聞 — 掲載済み記事の記録
// 毎朝ページを作り直すため、「どの記事を既に出したか」だけが唯一の永続データになる。
// 紙面ごとに独立したファイルを持ち、互いに干渉しないようにする

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const seenFile = (editionId) => join(ROOT, 'data', `seen.${editionId}.json`);

export async function loadSeen(editionId) {
  try {
    const parsed = JSON.parse(await readFile(seenFile(editionId), 'utf8'));
    return parsed.urls ?? {};
  } catch {
    return {}; // 初回はファイルが存在しない
  }
}

// 件数をページに載せる都合で、計算（mergeSeen）と保存（writeSeen）を分けている。
// 計算だけ先に済ませればページに正しい件数を出せ、保存はページ書き出しの後に回せる
export function mergeSeen(previous, publishedUrls, retentionDays) {
  const now = new Date();
  const limit = now.getTime() - retentionDays * 86400 * 1000;

  // 収集対象が直近数日なので、それより長く保持すれば重複は防げる。
  // 残し続けるとファイルが際限なく育つため、古い記録は捨てる
  const kept = Object.fromEntries(
    Object.entries(previous).filter(([, iso]) => new Date(iso).getTime() >= limit)
  );
  for (const url of publishedUrls) kept[url] = now.toISOString();
  return kept;
}

export async function writeSeen(editionId, urls) {
  const file = seenFile(editionId);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify({ urls }, null, 1)}\n`, 'utf8');
}
