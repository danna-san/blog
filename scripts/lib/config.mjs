// 設定の読み込み。blog.config.json をデフォルト値とマージして返す。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');

const DEFAULTS = {
  site: { title: 'My Diary', description: '', author: '', baseUrl: '', language: 'ja' },
  publish: {
    mode: 'direct',
    timezone: 'Asia/Tokyo',
    dayStartHour: 4,
    allowedAuthors: [],
    publishedLabel: 'published',
    skipLabels: ['draft', 'no-blog'],
    systemLabels: ['published', 'draft', 'no-blog', 'meta'],
    prBranch: 'blog/publish',
  },
  ai: { provider: 'github-models', model: 'openai/gpt-4.1', temperature: 0.8, rewriteLevel: 'medium', lintRetries: 1 },
  images: { maxWidth: 1600, quality: 82, maxVideoMB: 25 },
  ui: { headerTagCount: 12, indexPostCount: 10, feedPostCount: 20 },
};

export function loadConfig(path = join(ROOT, 'blog.config.json')) {
  const user = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  const cfg = {};
  for (const key of Object.keys(DEFAULTS)) cfg[key] = { ...DEFAULTS[key], ...(user[key] || {}) };
  cfg.site.baseUrl = String(cfg.site.baseUrl || '').replace(/\/+$/, '');
  if (!['direct', 'pull-request'].includes(cfg.publish.mode)) {
    throw new Error(`publish.mode は "direct" か "pull-request" です: ${cfg.publish.mode}`);
  }
  if (!['light', 'medium', 'full'].includes(cfg.ai.rewriteLevel)) {
    throw new Error(`ai.rewriteLevel は light / medium / full のいずれかです: ${cfg.ai.rewriteLevel}`);
  }
  return cfg;
}

export function readTextIfExists(path, fallback = '') {
  return existsSync(path) ? readFileSync(path, 'utf8') : fallback;
}
