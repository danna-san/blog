// 設定の読み込み。blog.config.json を既定値とマージし、値を検証して返す。
// 秘密情報はここで扱わない（GitHub Secrets → 環境変数で渡す）。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');

const DEFAULTS = {
  site: { title: 'My Diary', description: '', author: '', baseUrl: '', language: 'ja' },
  publish: {
    timezone: 'Asia/Tokyo',
    dayStartHour: 4,
    allowedAuthors: [],
    publishedLabel: 'published',
    skipLabels: ['draft', 'no-blog'],
    systemLabels: ['published', 'draft', 'no-blog'],
    lookbackDays: 14,
  },
  ai: {
    provider: 'claude-code',
    model: '',
    rewriteLevel: 'medium',
    sampleMaxChars: 6000,
    fallback: { provider: 'github-models', model: 'openai/gpt-4.1', temperature: 0.8, lintRetries: 1 },
  },
  images: { maxWidth: 1600, quality: 82, maxVideoMB: 25 },
  ui: { headerTagCount: 12, indexPostCount: 10, feedPostCount: 20 },
};

export function loadConfig(path = join(ROOT, 'blog.config.json')) {
  const user = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  return normalizeConfig(user);
}

export function normalizeConfig(user = {}) {
  const cfg = {};
  for (const key of Object.keys(DEFAULTS)) cfg[key] = { ...DEFAULTS[key], ...(user[key] || {}) };
  cfg.ai.fallback = { ...DEFAULTS.ai.fallback, ...((user.ai && user.ai.fallback) || {}) };
  cfg.site.baseUrl = String(cfg.site.baseUrl || '').replace(/\/+$/, '');
  const h = cfg.publish.dayStartHour;
  if (!Number.isInteger(h) || h < 0 || h > 12) throw new Error(`publish.dayStartHour は 0〜12 の整数です: ${h}`);
  if (!['claude-code', 'github-models', 'mock', 'none'].includes(cfg.ai.provider)) {
    throw new Error(`ai.provider は claude-code / github-models / mock / none のいずれかです: ${cfg.ai.provider}`);
  }
  if (!['github-models', 'mock', 'none'].includes(cfg.ai.fallback.provider)) {
    throw new Error(`ai.fallback.provider は github-models / mock / none のいずれかです: ${cfg.ai.fallback.provider}`);
  }
  if (!['light', 'medium', 'full'].includes(cfg.ai.rewriteLevel)) {
    throw new Error(`ai.rewriteLevel は light / medium / full のいずれかです: ${cfg.ai.rewriteLevel}`);
  }
  return cfg;
}

export function readTextIfExists(path, fallback = '') {
  return existsSync(path) ? readFileSync(path, 'utf8') : fallback;
}
