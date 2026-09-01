import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ShotListPage } from './ShotListPage';
import { listShots } from '../lib/shots';
import { useAuth } from '../context/AuthContext';

vi.mock('../lib/shots', () => ({ listShots: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

describe('ShotListPage', () => {
  it('renders each shot in the list', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'a@example.com' } as any,
      loading: false,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
    });
    vi.mocked(listShots).mockResolvedValue([
      {
        id: 'shot-1',
        user_id: 'user-1',
        grind_setting: '18',
        dose_g: 18,
        yield_g: 36,
        pull_time_s: 28,
        bean_name: null,
        roast_date: null,
        rating: null,
        tasting_note: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);

    render(
      <MemoryRouter>
        <ShotListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText(/18g in \/ 36g out/i)).toBeInTheDocument());
  });

  it('shows an empty state when there are no shots', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'a@example.com' } as any,
      loading: false,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
    });
    vi.mocked(listShots).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <ShotListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText(/no shots logged yet/i)).toBeInTheDocument());
  });
});
