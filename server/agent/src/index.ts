import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { getDefaultModel } from '@openai/agents';
import { createOpenAIRunner } from './analyzeIncident.js';
import { createApp } from './app.js';
import { readGitHubConfig } from './github.js';

// Secrets live in server/agent/.env (gitignored) or the shell environment. They never leave this process.
if (existsSync('.env')) process.loadEnvFile('.env');

const port = Number(process.env.PORT ?? 3002);
// Loopback only by default: this server holds the OpenAI and GitHub credentials.
const hostname = process.env.HOST ?? '127.0.0.1';
const model = process.env.OPENAI_MODEL?.trim() || getDefaultModel();
const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS ?? 20_000);
const corsOrigins = (process.env.CORS_ORIGINS ?? 'chrome-extension://*,http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const github = readGitHubConfig(process.env);
const app = createApp({
  analyzer: { runner: process.env.OPENAI_API_KEY ? createOpenAIRunner(model) : undefined, model, timeoutMs },
  github: github.config,
  githubUnavailableReason: github.reason,
  corsOrigins,
});

serve({ fetch: app.fetch, port, hostname }, () => {
  console.log(`REPRO agent API listening on http://localhost:${port}`);
  console.log(`  OpenAI: ${process.env.OPENAI_API_KEY ? `configured (${model})` : 'not configured, deterministic fallback only'}`);
  console.log(`  GitHub: ${github.config ? `configured (${github.config.owner}/${github.config.repo})` : `not configured (${github.reason})`}`);
});
