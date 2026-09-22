import express from 'express';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

const CONFIG_DIR = join(__dirname, '..', 'config');

app.use(express.json());
app.use(express.static(join(__dirname, '..', 'web')));

// 全紙面データを読み込む
function loadAllEditions() {
  try {
    const editionsFile = join(CONFIG_DIR, 'editions.json');
    const editionsConfig = JSON.parse(readFileSync(editionsFile, 'utf8'));

    const result = { editions: editionsConfig.editions };

    for (const editionId of editionsConfig.editions) {
      const editionFile = join(CONFIG_DIR, `edition.${editionId}.json`);
      try {
        result[editionId] = JSON.parse(readFileSync(editionFile, 'utf8'));
      } catch (e) {
        console.error(`Failed to load edition ${editionId}:`, e.message);
      }
    }

    return result;
  } catch (e) {
    console.error('Failed to load editions:', e.message);
    return { editions: [] };
  }
}

// 紙面設定を保存
function saveEditions(data) {
  try {
    const editionsConfig = { _comment: '紙面を増やすときは config/edition.<id>.json を作り、この一覧に id を足す', editions: data.editions };
    writeFileSync(join(CONFIG_DIR, 'editions.json'), JSON.stringify(editionsConfig, null, 2) + '\n');

    for (const editionId of data.editions) {
      if (data[editionId]) {
        const editionFile = join(CONFIG_DIR, `edition.${editionId}.json`);
        writeFileSync(editionFile, JSON.stringify(data[editionId], null, 2) + '\n');
      }
    }
  } catch (e) {
    console.error('Failed to save editions:', e.message);
    throw e;
  }
}

// API: すべての紙面を取得
app.get('/api/editions', (req, res) => {
  const data = loadAllEditions();
  res.json(data);
});

// API: 新しい紙面を作成
app.post('/api/editions', (req, res) => {
  const { id, label } = req.body;

  if (!id || !label) {
    return res.status(400).json({ error: 'id と label は必須です' });
  }

  const data = loadAllEditions();

  if (data.editions.includes(id)) {
    return res.status(400).json({ error: '紙面ID が既に存在します' });
  }

  data.editions.push(id);
  data[id] = {
    label,
    output: `${id}.html`,
    maxAgeHours: 168,
    maxItems: 12,
    maxPerSource: 4,
    seenRetentionDays: 7,
    feeds: []
  };

  try {
    saveEditions(data);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: 紙面を削除
app.delete('/api/editions/:id', (req, res) => {
  const { id } = req.params;
  const data = loadAllEditions();

  if (!data.editions.includes(id)) {
    return res.status(404).json({ error: '紙面が見つかりません' });
  }

  data.editions = data.editions.filter(e => e !== id);
  delete data[id];

  try {
    saveEditions(data);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: チャンネルを追加
app.post('/api/editions/:id/channels', (req, res) => {
  const { id } = req.params;
  const { name, channelId, category } = req.body;

  if (!name || !channelId || !category) {
    return res.status(400).json({ error: 'name, channelId, category は必須です' });
  }

  const data = loadAllEditions();

  if (!data[id]) {
    return res.status(404).json({ error: '紙面が見つかりません' });
  }

  const feed = {
    name,
    category,
    type: 'youtube',
    channelId
  };

  data[id].feeds.push(feed);

  try {
    saveEditions(data);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: チャンネルを削除
app.delete('/api/editions/:id/channels/:channelId', (req, res) => {
  const { id, channelId } = req.params;
  const data = loadAllEditions();

  if (!data[id]) {
    return res.status(404).json({ error: '紙面が見つかりません' });
  }

  data[id].feeds = data[id].feeds.filter(f => f.channelId !== channelId);

  try {
    saveEditions(data);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`
📰 未来新聞 - 紙面管理ツール
ブラウザで開く: http://localhost:${PORT}
  `);
});
