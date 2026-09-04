import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { NewShotPage } from './NewShotPage';
import { createShot, listShots } from '../lib/shots';

vi.mock('../lib/shots', () => ({
  createShot: vi.fn(),
  listShots: vi.fn(),
}));

vi.mock('../lib/videos', () => ({
  validateVideoFile: vi.fn().mockResolvedValue({ valid: true }),
  uploadShotVideo: vi.fn(),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const referenceShot = {
  id: 'shot-ref',
  user_id: 'user-1',
  grind_setting: '18.0',
  dose_g: 18,
  yield_g: 36,
  pull_time_s: 28,
  bean_name: 'Kenya Nyeri AA',
  roast_date: '2026-08-23',
  rating: 4,
  tasting_note: null,
  created_at: '2026-09-03T07:42:00Z',
  updated_at: '2026-09-03T07:42:00Z',
};

describe('NewShotPage', () => {
  it('pre-fills the form from the most recently active bag\'s reference shot', async () => {
    vi.mocked(listShots).mockResolvedValue([referenceShot]);

    render(
      <MemoryRouter>
        <NewShotPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Kenya Nyeri AA')).toBeInTheDocument());
    expect(screen.getByLabelText('Dose')).toHaveValue('18');
  });

  it('creates a shot with the working values and navigates to its detail page', async () => {
    vi.mocked(listShots).mockResolvedValue([referenceShot]);
    vi.mocked(createShot).mockResolvedValue({ ...referenceShot, id: 'shot-new' });

    render(
      <MemoryRouter>
        <NewShotPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByLabelText('Dose')).toHaveValue('18'));
    fireEvent.click(screen.getByRole('button', { name: 'Increase dose' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save shot' }));

    await waitFor(() =>
      expect(createShot).toHaveBeenCalledWith(
        expect.objectContaining({ dose_g: 18.1, bean_name: 'Kenya Nyeri AA' })
      )
    );
    expect(navigateMock).toHaveBeenCalledWith('/shots/shot-new');
  });

  it('asks for a bean name and roast date first when there are no bags yet, then lets the first shot be logged', async () => {
    vi.mocked(listShots).mockResolvedValue([]);
    vi.mocked(createShot).mockResolvedValue({
      ...referenceShot,
      id: 'shot-first',
      bean_name: 'Colombia Huila',
      roast_date: '',
      grind_setting: '0.1',
      dose_g: 0.1,
      yield_g: 0.5,
      pull_time_s: 1,
    });

    render(
      <MemoryRouter>
        <NewShotPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByLabelText('Bean / origin')).toBeInTheDocument());
    expect(screen.queryByLabelText('Dose')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Bean / origin'), { target: { value: 'Colombia Huila' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByLabelText('Dose')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Increase dose' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save shot' }));

    await waitFor(() =>
      expect(createShot).toHaveBeenCalledWith(
        expect.objectContaining({ bean_name: 'Colombia Huila', dose_g: 0.1 })
      )
    );
  });

  it('lets a user with existing bags start a new bag instead of duplicating one', async () => {
    vi.mocked(listShots).mockResolvedValue([referenceShot]);

    render(
      <MemoryRouter>
        <NewShotPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Kenya Nyeri AA')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Start a new bag' }));

    expect(screen.getByLabelText('Bean / origin')).toHaveValue('');
    expect(screen.queryByLabelText('Dose')).not.toBeInTheDocument();
  });

  it('seeds the form from the shot named in ?from=, even when it is not the bag\'s most recent shot', async () => {
    const mostRecent = { ...referenceShot, id: 'shot-newest', dose_g: 20, created_at: '2026-09-04T07:42:00Z' };
    const olderShotBeingDuplicated = { ...referenceShot, id: 'shot-older', dose_g: 15, created_at: '2026-09-01T07:42:00Z' };
    vi.mocked(listShots).mockResolvedValue([mostRecent, olderShotBeingDuplicated]);

    render(
      <MemoryRouter initialEntries={['/shots/new?from=shot-older']}>
        <NewShotPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByLabelText('Dose')).toHaveValue('15'));
  });
});
