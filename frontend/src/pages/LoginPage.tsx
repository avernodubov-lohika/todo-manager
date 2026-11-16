import { CheckSquare } from 'lucide-react';

const ERRORS: Record<string, string> = {
  invalid_state: 'Your login session expired or was invalid. Please try again.',
  access_denied: 'Login was cancelled.',
  oauth_failed: 'The identity provider rejected the login. Please try again.',
  provider_not_configured: 'This login provider is not configured on the server.',
};

const GoogleLogo = () => (
  <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
    <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.4-4.7 3.4-8z" />
    <path fill="#34A853" d="M12 23c3 0 5.4-1 7.2-2.7l-3.5-2.7c-1 .7-2.2 1-3.7 1-2.8 0-5.2-1.9-6-4.5H2.4v2.8A11 11 0 0 0 12 23z" />
    <path fill="#FBBC05" d="M6 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.4a11 11 0 0 0 0 9.8L6 14.1z" />
    <path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.2 1.6l3.1-3.1A11 11 0 0 0 2.4 7.1L6 9.9c.8-2.600 3.200-4.500 6-4.500z" />
  </svg>
);
const GitHubLogo = () => (
  <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" fill="currentColor">
    <path d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.200.7-3.900-1.500-3.900-1.500-.5-1.300-1.300-1.700-1.300-1.700-1-.7.1-.7.1-.7 1.200.1 1.800 1.200 1.800 1.200 1 1.800 2.700 1.300 3.300 1 .1-.8.4-1.300.7-1.600-2.600-.3-5.300-1.300-5.300-5.700 0-1.300.5-2.300 1.200-3.100-.1-.3-.5-1.500.1-3.100 0 0 1-.3 3.200 1.200a11 11 0 0 1 5.800 0C17.100 5.700 18 6 18 6c.6 1.600.2 2.800.1 3.100.8.8 1.200 1.800 1.200 3.100 0 4.400-2.700 5.400-5.300 5.700.4.400.8 1.100.8 2.200v3.200c0 .3.2.7.8.6A11.500 11.500 0 0 0 12 .5z" />
  </svg>
);

export function LoginPage() {
  const code = new URLSearchParams(window.location.search).get('error');
  const error = code ? (ERRORS[code] ?? 'Login failed. Please try again.') : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-8">
        <div className="flex flex-col items-center text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-accent-600 text-white">
            <CheckSquare className="size-6" />
          </span>
          <h1 className="mt-4 text-xl font-semibold">Todo Manager</h1>
          <p className="mt-1 text-sm text-neutral-500">Sign in to manage your lists and tasks.</p>
        </div>

        {error && (
          <p role="alert" className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="mt-6 space-y-3">
          <a href="/auth/google/start" className="btn-secondary h-10 w-full">
            <GoogleLogo /> Continue with Google
          </a>
          <a href="/auth/github/start" className="btn-secondary h-10 w-full">
            <GitHubLogo /> Continue with GitHub
          </a>
        </div>
      </div>
    </main>
  );
}
