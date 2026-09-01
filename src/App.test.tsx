import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';

vi.mock('./lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn(),
      signInWithOAuth: vi.fn(),
    },
  },
}));

describe('App', () => {
  it('redirects a signed out user to the login page', async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText(/sign in with google/i)).toBeInTheDocument()
    );
  });
});
