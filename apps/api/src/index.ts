import { serve } from '@hono/node-server';
import { app } from './app.js';
import { initStore } from './db.js';
import { warmupDrapiToken } from './drapi.js';

const port = Number(process.env.PORT || 8787);

await initStore();
void warmupDrapiToken();
console.log(`Dongham API listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
