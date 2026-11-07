// テスト・プレビュー用の偽 GitHub。fixture の JSON から Issue とコメントを返し、書き込みは記録だけする。
import { readFileSync } from 'node:fs';

export function createFixtureGitHub(path) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const issues = data.issues.map((i) => ({ state: 'open', labels: [], html_url: `https://github.com/${data.owner}/blog/issues/${i.number}`, ...i }));
  const calls = [];
  return {
    owner: data.owner,
    calls,
    async listIssues({ state = 'open', since } = {}) {
      return issues.filter((i) => (state === 'all' || i.state === state) && (!since || (i.updated_at || i.created_at) >= since));
    },
    async getIssue(n) {
      const i = issues.find((x) => x.number === n);
      if (!i) throw Object.assign(new Error('not found'), { status: 404 });
      return i;
    },
    async listComments(n) { return issues.find((x) => x.number === n)?.comments || []; },
    async ensureLabel(name) { calls.push(['ensureLabel', name]); },
    async addLabels(n, labels) { calls.push(['addLabels', n, labels]); },
    async close(n) { calls.push(['close', n]); },
    async comment(n, body) { calls.push(['comment', n, body]); },
  };
}
