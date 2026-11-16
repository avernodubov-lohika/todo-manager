import { GitHub, Google } from 'arctic';
import type { Config } from '../config.js';

export interface Profile {
  providerUserId: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
}

export interface OAuthProvider {
  createAuthUrl(state: string, verifier: string): URL;
  exchange(code: string, verifier: string): Promise<Profile>;
}

export type ProviderName = 'google' | 'github';
export type Providers = Partial<Record<ProviderName, OAuthProvider>>;

async function getJson<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'User-Agent': 'todo-manager',
    },
  });
  if (!res.ok) throw new Error(`Request to ${url} failed: ${res.status}`);
  return (await res.json()) as T;
}

export function googleProvider(config: Config): OAuthProvider {
  const client = new Google(
    config.GOOGLE_CLIENT_ID!,
    config.GOOGLE_CLIENT_SECRET!,
    `${config.APP_URL}/auth/google/callback`,
  );
  return {
    createAuthUrl: (state, verifier) =>
      client.createAuthorizationURL(state, verifier, ['openid', 'profile', 'email']),
    async exchange(code, verifier) {
      const tokens = await client.validateAuthorizationCode(code, verifier);
      const info = await getJson<{
        sub: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
        picture?: string;
      }>('https://openidconnect.googleapis.com/v1/userinfo', tokens.accessToken());
      return {
        providerUserId: info.sub,
        email: info.email_verified === false ? null : (info.email ?? null),
        displayName: info.name || info.email || 'Google user',
        avatarUrl: info.picture ?? null,
      };
    },
  };
}

export function githubProvider(config: Config): OAuthProvider {
  const client = new GitHub(
    config.GITHUB_CLIENT_ID!,
    config.GITHUB_CLIENT_SECRET!,
    `${config.APP_URL}/auth/github/callback`,
  );
  return {
    // GitHub OAuth apps do not use PKCE; the verifier is accepted for interface symmetry.
    createAuthUrl: (state) => client.createAuthorizationURL(state, ['read:user', 'user:email']),
    async exchange(code) {
      const tokens = await client.validateAuthorizationCode(code);
      const token = tokens.accessToken();
      const user = await getJson<{
        id: number;
        login: string;
        name?: string | null;
        avatar_url?: string;
        email?: string | null;
      }>('https://api.github.com/user', token);
      let email: string | null = null;
      try {
        const emails = await getJson<{ email: string; primary: boolean; verified: boolean }[]>(
          'https://api.github.com/user/emails',
          token,
        );
        email = emails.find((e) => e.primary && e.verified)?.email ?? null;
      } catch {
        email = null;
      }
      return {
        providerUserId: String(user.id),
        email,
        displayName: user.name || user.login,
        avatarUrl: user.avatar_url ?? null,
      };
    },
  };
}

export function createProviders(config: Config): Providers {
  const providers: Providers = {};
  if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET) providers.google = googleProvider(config);
  if (config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET) providers.github = githubProvider(config);
  return providers;
}
