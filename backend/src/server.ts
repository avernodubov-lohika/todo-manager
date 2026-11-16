import { PrismaClient } from '@prisma/client';
import { buildApp } from './app.js';
import { createProviders } from './auth/providers.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const prisma = new PrismaClient({ datasourceUrl: config.DATABASE_URL });
const app = await buildApp({ prisma, config, providers: createProviders(config), logger: true });

const missing = (['google', 'github'] as const).filter((p) => !app.providers[p]);
if (missing.length) app.log.warn(`OAuth providers not configured (login disabled): ${missing.join(', ')}`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    void app.close().then(() => prisma.$disconnect()).then(() => process.exit(0));
  });
}

await app.listen({ port: config.PORT, host: '0.0.0.0' });
