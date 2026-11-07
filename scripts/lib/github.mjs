// GitHub REST API の薄いラッパー（fetch のみ使用）。
const API = process.env.GITHUB_API_URL || 'https://api.github.com';

export function createGitHub({ token = process.env.GITHUB_TOKEN, repository = process.env.GITHUB_REPOSITORY } = {}) {
  if (!token) throw new Error('GITHUB_TOKEN がありません');
  if (!repository || !repository.includes('/')) throw new Error('GITHUB_REPOSITORY (owner/repo) がありません');
  const [owner, repo] = repository.split('/');
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'issue-diary-blog',
  };

  async function call(method, path, body) {
    const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`GitHub API ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  async function paginate(path) {
    const all = [];
    for (let page = 1; page < 50; page++) {
      const sep = path.includes('?') ? '&' : '?';
      const items = await call('GET', `${path}${sep}per_page=100&page=${page}`);
      all.push(...items);
      if (items.length < 100) break;
    }
    return all;
  }

  const base = `/repos/${owner}/${repo}`;
  return {
    owner, repo,
    async listIssues({ state = 'open', since } = {}) {
      const q = new URLSearchParams({ state, sort: 'created', direction: 'asc' });
      if (since) q.set('since', since);
      const items = await paginate(`${base}/issues?${q}`);
      return items.filter((i) => !i.pull_request);
    },
    getIssue: (n) => call('GET', `${base}/issues/${n}`),
    listComments: (n) => paginate(`${base}/issues/${n}/comments`),
    comment: (n, body) => call('POST', `${base}/issues/${n}/comments`, { body }),
    close: (n, reason = 'completed') => call('PATCH', `${base}/issues/${n}`, { state: 'closed', state_reason: reason }),
    addLabels: (n, labels) => call('POST', `${base}/issues/${n}/labels`, { labels }),
    async ensureLabel(name, color = '8b949e', description = '') {
      try { await call('POST', `${base}/labels`, { name, color, description }); }
      catch (e) { if (e.status !== 422) throw e; } // 422 = 既に存在
    },
    async upsertPullRequest({ head, base: baseBranch, title, body }) {
      const open = await call('GET', `${base}/pulls?state=open&head=${owner}:${encodeURIComponent(head)}`);
      if (open.length) return call('PATCH', `${base}/pulls/${open[0].number}`, { title, body });
      return call('POST', `${base}/pulls`, { head, base: baseBranch, title, body });
    },
  };
}
