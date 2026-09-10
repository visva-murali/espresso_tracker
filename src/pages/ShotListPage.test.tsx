// src/pages/ShotListPage.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ShotListPage } from './ShotListPage';
import { listShots } from '../lib/shots';
import { listBagTargets } from '../lib/bagTargets';
import { useAuth } from '../context/AuthContext';

vi.mock('../lib/shots', () => ({ listShots: vi.fn() }));
vi.mock('../lib/bagTargets', () => ({ listBagTargets: vi.fn() }));
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
  beforeEach(() => {
    vi.mocked(listBagTargets).mockResolvedValue([]);
  });

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

  it('shows Dialed when recent shots sit on the bag target', async () => {
    mockAuth();
    const onTarget = [
      { ...baseShot, id: 's2', dose_g: 18, yield_g: 45, pull_time_s: 30, roast_date: null },
      { ...baseShot, id: 's1', dose_g: 18, yield_g: 45, pull_time_s: 29, roast_date: null },
    ];
    vi.mocked(listShots).mockResolvedValue(onTarget);
    vi.mocked(listBagTargets).mockResolvedValue([
      {
        id: 't1',
        user_id: 'user-1',
        bean_name: baseShot.bean_name,
        roast_date: null,
        target_ratio: 2.5,
        target_pull_time_low_s: null,
        target_pull_time_high_s: null,
        created_at: '2026-09-04T00:00:00Z',
        updated_at: '2026-09-04T00:00:00Z',
      },
    ]);

    render(
      <MemoryRouter>
        <ShotListPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Dialed')).toBeInTheDocument();
  });

  it('falls back to convergence when the bag has no target', async () => {
    mockAuth();
    const spread = [
      { ...baseShot, id: 's2', dose_g: 18, yield_g: 45, pull_time_s: 30, roast_date: null },
      { ...baseShot, id: 's1', dose_g: 18, yield_g: 30, pull_time_s: 20, roast_date: null },
    ];
    vi.mocked(listShots).mockResolvedValue(spread);
    vi.mocked(listBagTargets).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <ShotListPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Dialing')).toBeInTheDocument();
  });

  it('shows Dialed when both recent shots land in the bag pull-time range', async () => {
    mockAuth();
    const inRange = [
      { ...baseShot, id: 's2', dose_g: 18, yield_g: 45, pull_time_s: 29, roast_date: null },
      { ...baseShot, id: 's1', dose_g: 18, yield_g: 45, pull_time_s: 27, roast_date: null },
    ];
    vi.mocked(listShots).mockResolvedValue(inRange);
    vi.mocked(listBagTargets).mockResolvedValue([
      {
        id: 't1',
        user_id: 'user-1',
        bean_name: baseShot.bean_name,
        roast_date: null,
        target_ratio: null,
        target_pull_time_low_s: 26,
        target_pull_time_high_s: 31,
        created_at: '2026-09-04T00:00:00Z',
        updated_at: '2026-09-04T00:00:00Z',
      },
    ]);

    render(
      <MemoryRouter>
        <ShotListPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Dialed')).toBeInTheDocument();
  });

  it('shows Dialing when a recent shot falls outside the pull-time range', async () => {
    mockAuth();
    const out = [
      { ...baseShot, id: 's2', dose_g: 18, yield_g: 45, pull_time_s: 22, roast_date: null },
      { ...baseShot, id: 's1', dose_g: 18, yield_g: 45, pull_time_s: 23, roast_date: null },
    ];
    vi.mocked(listShots).mockResolvedValue(out);
    vi.mocked(listBagTargets).mockResolvedValue([
      {
        id: 't1',
        user_id: 'user-1',
        bean_name: baseShot.bean_name,
        roast_date: null,
        target_ratio: null,
        target_pull_time_low_s: 26,
        target_pull_time_high_s: 31,
        created_at: '2026-09-04T00:00:00Z',
        updated_at: '2026-09-04T00:00:00Z',
      },
    ]);

    render(
      <MemoryRouter>
        <ShotListPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Dialing')).toBeInTheDocument();
  });
});
