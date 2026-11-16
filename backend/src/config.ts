import { z } from 'zod';

const optionalString = z.string().optional().transform((v) => (v ? v : undefined));

export const configSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().default(3000),
  APP_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().default('file:./dev.db'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GITHUB_CLIENT_ID: optionalString,
  GITHUB_CLIENT_SECRET: optionalString,
  NOTIFY_INTERVAL_SEC: z.coerce.number().int().min(10).max(3600).default(60),
  /** Directory with the built frontend; when set the backend serves it. */
  STATIC_DIR: optionalString,
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${msg}`);
  }
  return parsed.data;
}
