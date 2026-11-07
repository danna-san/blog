// 文章生成プロバイダ。fetch のみで実装し、SDK には依存しない。
//   github-models : GitHub Models（GITHUB_TOKEN + permissions: models: read）。無料枠あり。
//   anthropic     : Anthropic API（Secrets に ANTHROPIC_API_KEY）。従量課金。
//   none          : 生成しない（本人の文章をほぼそのまま使う）
//   mock          : テスト用

export async function complete({ provider, model, temperature, system, user }) {
  switch (provider) {
    case 'github-models': return githubModels({ model, temperature, system, user });
    case 'anthropic': return anthropic({ model, temperature, system, user });
    case 'mock': return mock({ user });
    case 'none': return null;
    default: throw new Error(`未知の ai.provider: ${provider}`);
  }
}

async function githubModels({ model, temperature, system, user }) {
  const token = process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GitHub Models 用のトークンがありません');
  const body = {
    model, temperature,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: { type: 'json_object' },
  };
  const send = (b) => fetch('https://models.github.ai/inference/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(b),
  });
  let res = await send(body);
  if (res.status === 400) { delete body.response_format; res = await send(body); } // JSON モード非対応モデル向け
  if (!res.ok) throw new Error(`GitHub Models ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? '';
}

async function anthropic({ model, temperature, system, user }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY がありません');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 4000, temperature, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return (json.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
}

// 入力のエントリをそのまま JSON にして返すだけのモック
function mock({ user }) {
  const entries = [];
  const re = /^\[(e\d+)\] (\d\d:\d\d)(?: 見出し: (.*))?\n([\s\S]*?)(?=^\[e\d+\] |^=== 素材ここまで|$(?![\s\S]))/gm;
  for (const m of user.matchAll(re)) entries.push({ id: m[1], heading: m[3] || '', body: m[4].trim() });
  return JSON.stringify({ title: 'モックのタイトル', description: 'モックの説明文。', entries, closing: '' });
}

/** モデルの出力から JSON を取り出す（前後に余計な文があっても拾う） */
export function parseJsonLoose(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* 続行 */ }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch { /* 続行 */ } }
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s >= 0 && e > s) { try { return JSON.parse(text.slice(s, e + 1)); } catch { /* 続行 */ } }
  return null;
}
