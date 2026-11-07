// API 型の文章生成（予備用）。fetch のみで実装し、SDK には依存しない。
//   github-models : GitHub Models（GITHUB_TOKEN + permissions: models: read）。無料枠あり。
//   mock          : テスト用。素材をそのまま返す。
// 主の生成（Claude サブスク）は claude-code-action がワークフロー上で行うので、ここには無い。
import { buildPrompt, lint, isUsable } from './writer.mjs';

export async function complete({ provider, model, temperature, system, user }) {
  if (provider === 'github-models') return githubModels({ model, temperature, system, user });
  if (provider === 'mock') return mock({ user });
  throw new Error(`API で生成できない provider です: ${provider}`);
}

async function githubModels({ model, temperature, system, user }) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN がありません');
  const body = {
    model,
    temperature,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: { type: 'json_object' },
  };
  const send = (b) => fetch('https://models.github.ai/inference/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(b),
  });
  let res = await send(body);
  if (res.status === 400) { delete body.response_format; res = await send(body); } // JSON モード非対応のモデル向け
  if (!res.ok) throw new Error(`GitHub Models ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? '';
}

function mock({ user }) {
  const entries = [];
  const re = /^\[(e\d+)\] (\S+)(?: 見出し: (.*))?\n([\s\S]*?)(?=^\[e\d+\] |^=== 素材ここまで)/gm;
  for (const m of user.matchAll(re)) entries.push({ id: m[1], heading: m[3] || '', body: m[4].trim() });
  return JSON.stringify({ title: 'テストの日', description: 'テスト用の紹介文。', entries, closing: '' });
}

/** モデルの出力から JSON を取り出す（前後に余計な文があっても拾う） */
export function parseJsonLoose(text) {
  if (!text || typeof text !== 'string') return null;
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  const direct = tryParse(text.trim());
  if (direct) return direct;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { const v = tryParse(fenced[1]); if (v) return v; }
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  return s >= 0 && e > s ? tryParse(text.slice(s, e + 1)) : null;
}

/** 予備の生成。lint で引っかかれば lintRetries 回まで直してもらう。失敗時は null */
export async function generateFallback(day, { config, style, log = console }) {
  const fb = config.ai.fallback;
  if (fb.provider === 'none') return null;
  const { system, user } = buildPrompt(day, { style, rewriteLevel: config.ai.rewriteLevel });
  let message = user;
  let best = null;
  for (let attempt = 0; attempt <= fb.lintRetries; attempt++) {
    let text;
    try {
      text = await complete({ provider: fb.provider, model: fb.model, temperature: fb.temperature, system, user: message });
    } catch (e) {
      log.warn?.(`${day.date}: 予備の生成に失敗しました: ${e.message}`);
      return best;
    }
    const parsed = parseJsonLoose(text);
    if (isUsable(parsed, day.entries)) best = parsed;
    const problems = lint(parsed, day.entries, style.banned);
    if (!problems.length) return parsed;
    log.warn?.(`${day.date}: 予備の生成結果を直してもらいます: ${problems.join(' / ')}`);
    message = `${user}\n\n前回の出力には次の問題がありました。直して JSON だけを出し直してください。\n- ${problems.join('\n- ')}\n\n前回の出力:\n${text}`;
  }
  return best;
}
