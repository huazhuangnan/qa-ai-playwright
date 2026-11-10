import { serve } from '@hono/node-server';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp } from './app.ts';
import { createDatabase } from './db/client.ts';

const appRoot = fileURLToPath(new URL('../../', import.meta.url));
const distRoot = resolve(appRoot, 'dist');
const database = createDatabase();
const app = createApp({
  database,
  staticRoot: existsSync(distRoot) ? distRoot : undefined,
});

const port = Number(process.env.PORT ?? 8787);
const server = serve(
  {
    fetch: app.fetch,
    port,
    hostname: '127.0.0.1',
  },
  (info) => {
    console.log(`QA Ticket API listening on http://127.0.0.1:${info.port}`);
  },
);

function shutdown(): void {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
