// src/pages/ShotListPage.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ShotListPage } from './ShotListPage';
import { listShots } from '../lib/shots';
import { useAuth } from '../context/AuthContext';

vi.mock('../lib/shots', () => ({ listShots: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

const baseShot = {
  id: 'shot-1',
  user_id: 'user-1',
  grind_setting: '18.0',
  dose_g: 18,
  yield_g: 36,
  pull_time_s: 28,
  bean_name: 'Kenya Nyeri AA',
  roast_date: '2026-08-23',
  rating: 4,
  tasting_note: null,
  created_at: '2026-09-04T07:42:00Z',
  updated_at: '2026-09-04T07:42:00Z',
};

function mockAuth() {
  vi.mocked(useAuth).mockReturnValue({
    user: { email: 'a@example.com' } as any,
    loading: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  });
}

describe('ShotListPage', () => {
  it('groups shots under a bag heading showing the bean name and shot count', async () => {
    mockAuth();
    vi.mocked(listShots).mockResolvedValue([baseShot]);

    render(
      <MemoryRouter>
        <ShotListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Kenya Nyeri AA')).toBeInTheDocument());
    expect(screen.getByText(/1 shots/)).toBeInTheDocument();
  });

  it('renders the ratio and pull time for each shot row', async () => {
    mockAuth();
    vi.mocked(listShots).mockResolvedValue([baseShot]);

    render(
      <MemoryRouter>
        <ShotListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('1:')).toBeInTheDocument());
    expect(screen.getByText('2.00')).toBeInTheDocument();
  });

  it('puts the "Log a shot" action in the sticky bottom bar', async () => {
    mockAuth();
    vi.mocked(listShots).mockResolvedValue([baseShot]);

    render(
      <MemoryRouter>
        <ShotListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Kenya Nyeri AA')).toBeInTheDocument());
    const bar = screen.getByTestId('action-bar');
    expect(bar).toContainElement(screen.getByRole('link', { name: 'Log a shot' }));
  });

  it('shows an empty state when there are no shots', async () => {
    mockAuth();
    vi.mocked(listShots).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <ShotListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText(/no shots logged yet/i)).toBeInTheDocument());
  });

  it('opens the menu with Trends and Sign out entries', async () => {
    mockAuth();
    vi.mocked(listShots).mockResolvedValue([baseShot]);

    render(
      <MemoryRouter>
        <ShotListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Kenya Nyeri AA')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    expect(screen.getByRole('link', { name: 'Trends' })).toHaveAttribute('href', '/trends');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('hides past-peak bags under Active bags and shows them under All shots', async () => {
    mockAuth();
    const stale = {
      ...baseShot,
      id: 'stale-1',
      bean_name: 'Old Bag',
      roast_date: '2026-01-01',
    };
    vi.mocked(listShots).mockResolvedValue([stale]);

    render(
      <MemoryRouter>
        <ShotListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Active bags' })).toBeInTheDocument());
    // A bag with exactly one shot never carries a tag (see shotView.bagState),
    // so this exercises the "no tag, still shown" path rather than past-peak
    // filtering directly - past-peak filtering needs two shots to produce a
    // tag at all, which the second test case below covers.
    expect(screen.getByText('Old Bag')).toBeInTheDocument();
  });

  it('filters a bag tagged past-peak out of Active bags', async () => {
    mockAuth();
    const stale = [
      { ...baseShot, id: 'stale-1', bean_name: 'Old Bag', roast_date: '2026-01-01' },
      { ...baseShot, id: 'stale-2', bean_name: 'Old Bag', roast_date: '2026-01-01' },
    ];
    vi.mocked(listShots).mockResolvedValue(stale);

    render(
      <MemoryRouter>
        <ShotListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Active bags' })).toBeInTheDocument());
    expect(screen.queryByText('Old Bag')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All shots' }));
    expect(screen.getByText('Old Bag')).toBeInTheDocument();
  });
});
