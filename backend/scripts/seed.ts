import { parseArgs } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { createSampleData } from '../src/lib/sample.js';

const { values } = parseArgs({
  options: { email: { type: 'string' }, tz: { type: 'string', default: 'UTC' } },
});
if (!values.email) {
  console.error('Usage: npm run seed -- --email you@example.com [--tz Europe/Berlin]');
  process.exit(1);
}

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL ?? 'file:./dev.db' });
const user = await prisma.user.findFirst({ where: { email: values.email } });
if (!user) {
  console.error(`No user with email ${values.email}. Log in once via SSO first.`);
  process.exit(1);
}
const result = await createSampleData(prisma, user.id, new Date(), values.tz);
console.log(`Created ${result.lists} lists and ${result.tasks} tasks for ${user.displayName}.`);
await prisma.$disconnect();
