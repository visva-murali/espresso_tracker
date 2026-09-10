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

  it('keeps the rating bars inside the chart viewBox when few shots are rated', async () => {
    const twoRated = [
      { ...shots[0], id: 'r1', rating: 2 },
      { ...shots[1], id: 'r2', rating: 5 },
    ];
    vi.mocked(listShots).mockResolvedValue(twoRated);

    render(
      <MemoryRouter>
        <TrendsPage />
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(screen.getByText('Rating by shot on this bag')).toBeInTheDocument()
    );

    const ratingSvg = screen.getByText('Rating by shot on this bag').parentElement!.querySelector('svg')!;
    const bars = ratingSvg.querySelectorAll('rect');
    expect(bars.length).toBe(2);
    bars.forEach((bar) => {
      const x = Number(bar.getAttribute('x'));
      const width = Number(bar.getAttribute('width'));
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(340);
    });
  });

  it('spreads the ratio scatter instead of collapsing it when shots are near-identical', async () => {
    const nearIdentical = [24, 24, 25, 24, 25].map((t, i) => ({
      ...shots[0],
      id: `n${i}`,
      pull_time_s: t,
      yield_g: 36,
    }));
    vi.mocked(listShots).mockResolvedValue(nearIdentical);

    render(
      <MemoryRouter>
        <TrendsPage />
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(screen.getByText('Ratio against time')).toBeInTheDocument()
    );

    const scatter = screen.getByText('Ratio against time').parentElement!.querySelector('svg')!;
    const cxs = [...scatter.querySelectorAll('circle')].map((c) => Number(c.getAttribute('cx')));
    // 24s and 25s must land at visibly different x positions, not stacked on the axis.
    const distinct = new Set(cxs.map((v) => Math.round(v)));
    expect(distinct.size).toBeGreaterThan(1);
    cxs.forEach((cx) => {
      expect(cx).toBeGreaterThanOrEqual(34);
      expect(cx).toBeLessThanOrEqual(330);
    });
  });

  it('states the running median in the pull-time consistency caption', async () => {
    const timed = [26, 24, 28, 24, 30].map((t, i) => ({
      ...shots[0],
      id: `t${i}`,
      pull_time_s: t,
    }));
    vi.mocked(listShots).mockResolvedValue(timed);

    render(
      <MemoryRouter>
        <TrendsPage />
      </MemoryRouter>
    );

    // median of [26,24,28,24,30] is 26
    await waitFor(() => expect(screen.getByText(/median of 26s/i)).toBeInTheDocument());
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
