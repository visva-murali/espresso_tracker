// src/pages/TrendsPage.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { TrendsPage } from './TrendsPage';
import { listShots } from '../lib/shots';

vi.mock('../lib/shots', () => ({ listShots: vi.fn() }));

const shots = [
  {
    id: 'shot-2',
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
  },
  {
    id: 'shot-1',
    user_id: 'user-1',
    grind_setting: '18.2',
    dose_g: 18,
    yield_g: 32,
    pull_time_s: 24,
    bean_name: 'Kenya Nyeri AA',
    roast_date: '2026-08-23',
    rating: 3,
    tasting_note: null,
    created_at: '2026-09-03T07:42:00Z',
    updated_at: '2026-09-03T07:42:00Z',
  },
];

describe('TrendsPage', () => {
  it('renders the three charts for the default (most recently active) bag', async () => {
    vi.mocked(listShots).mockResolvedValue(shots);

    render(
      <MemoryRouter>
        <TrendsPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Ratio against time')).toBeInTheDocument());
    expect(screen.getByText('Pull time consistency')).toBeInTheDocument();
    expect(screen.getByText('Rating by shot on this bag')).toBeInTheDocument();
    expect(document.querySelectorAll('svg')).toHaveLength(3);
  });

  it('shows an empty state when the selected bag has no shots yet', async () => {
    vi.mocked(listShots).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <TrendsPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText(/no shots logged yet/i)).toBeInTheDocument());
  });
});
