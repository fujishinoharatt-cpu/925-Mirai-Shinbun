// 未来新聞 — Gemini による日本語要約
// 記事ごとに呼ぶと回数が増えるため、全記事を1リクエストにまとめて1日1回だけ呼ぶ

// モデルを変えたいときはここを書き換える
const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const TIMEOUT_MS = 60000;

const INSTRUCTION = `あなたは日本語ニュースアプリの編集者です。
渡された記事一覧について、日本語の見出しと要約を作成してください。

- title: 日本語の見出し。40文字以内。英語の記事は自然な日本語に翻訳する。
- summary: 日本語の要約。2〜3文、120文字程度。
- id: 入力された id をそのまま返す。

厳守すること:
- 入力に書かれていない事実を補わない。推測で内容を作らない。
- 元の情報が少なく内容を判断できない場合は、見出しの言い換えにとどめる。
- 誇張した表現や煽り文句を使わない。`;

const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      id: { type: 'INTEGER' },
      title: { type: 'STRING' },
      summary: { type: 'STRING' },
    },
    required: ['id', 'title', 'summary'],
  },
};

async function callGemini(apiKey, articles) {
  const input = articles.map((a, i) => ({
    id: i,
    title: a.title,
    description: a.summary,
    source: a.source,
  }));

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${INSTRUCTION}\n\n${JSON.stringify(input, null, 1)}` }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.2,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const body = await res.json();
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`応答に本文がありません: ${JSON.stringify(body).slice(0, 300)}`);

  return JSON.parse(text);
}

export async function summarizeArticles(articles) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('  GEMINI_API_KEY が未設定のため、RSS の説明文をそのまま使います');
    return { articles, summarized: false };
  }

  try {
    console.log(`  ${MODEL} に ${articles.length}件をまとめて送ります`);
    const results = await callGemini(apiKey, articles);

    const byId = new Map(results.map((r) => [r.id, r]));
    const merged = articles.map((a, i) => {
      const r = byId.get(i);
      if (!r?.title || !r?.summary) return a;
      return { ...a, title: r.title, summary: r.summary };
    });

    const hits = merged.filter((a, i) => a.title !== articles[i].title).length;
    console.log(`  要約できました（見出しを差し替えた記事: ${hits}件）`);
    return { articles: merged, summarized: true };
  } catch (e) {
    // 要約が落ちた日でも新聞は出す。見出しは英語のままになる
    console.error(`  要約に失敗しました。RSS の説明文で続行します: ${e.message}`);
    return { articles, summarized: false };
  }
}
