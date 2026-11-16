import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LoginPage } from './LoginPage';

afterEach(() => window.history.replaceState({}, '', '/'));

describe('LoginPage', () => {
  it('links the buttons to the SSO start endpoints', () => {
    render(<LoginPage />);
    expect(screen.getByRole('link', { name: /continue with google/i })).toHaveAttribute('href', '/auth/google/start');
    expect(screen.getByRole('link', { name: /continue with github/i })).toHaveAttribute('href', '/auth/github/start');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a readable message for ?error=', () => {
    window.history.replaceState({}, '', '/login?error=invalid_state');
    render(<LoginPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(/expired or was invalid/i);
  });
});
