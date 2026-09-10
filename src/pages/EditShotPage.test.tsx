import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EditShotPage } from './EditShotPage';
import { getShot, updateShot } from '../lib/shots';
import { listBagTargets, setBagTarget } from '../lib/bagTargets';

vi.mock('../lib/shots', () => ({ getShot: vi.fn(), updateShot: vi.fn() }));

vi.mock('../lib/bagTargets', () => ({
  listBagTargets: vi.fn(),
  setBagTarget: vi.fn(),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const shot = {
  id: 'shot-1',
  user_id: 'user-1',
  grind_setting: '18.0',
  dose_g: 18,
  yield_g: 36,
  pull_time_s: 28,
  bean_name: 'Kenya Nyeri AA',
  roast_date: '2026-08-23',
  rating: null,
  tasting_note: null,
  created_at: '2026-09-04T07:42:00Z',
  updated_at: '2026-09-04T07:42:00Z',
};

function renderAtShot(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/shots/${id}/edit`]}>
      <Routes>
        <Route path="/shots/:id/edit" element={<EditShotPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('EditShotPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listBagTargets).mockResolvedValue([]);
    vi.mocked(setBagTarget).mockResolvedValue(undefined);
  });

  it('keeps the back-to-shot link on screen while the shot is still loading', async () => {
    vi.mocked(getShot).mockReturnValue(new Promise(() => {}));

    renderAtShot('shot-1');

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Shot' })).toBeInTheDocument();
      expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
    });
  });

  it('pre-fills the nudge rows from the shot\'s saved values with no delta shown', async () => {
    vi.mocked(getShot).mockResolvedValue(shot);
    renderAtShot('shot-1');

    await waitFor(() => expect(screen.getByLabelText('Dose')).toHaveValue('18'));
    expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument();
  });

  it('saves an edited field and shows the delta against the saved value before submit', async () => {
    vi.mocked(getShot).mockResolvedValue(shot);
    vi.mocked(updateShot).mockResolvedValue({ ...shot, dose_g: 18.1 });
    renderAtShot('shot-1');

    await waitFor(() => expect(screen.getByLabelText('Dose')).toHaveValue('18'));
    fireEvent.click(screen.getByRole('button', { name: 'Increase dose' }));
    expect(screen.getByText('+0.1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(updateShot).toHaveBeenCalledWith('shot-1', expect.objectContaining({ dose_g: 18.1 }))
    );
    expect(navigateMock).toHaveBeenCalledWith('/shots/shot-1');
  });

  it('puts the "Save changes" action in the sticky bottom bar', async () => {
    vi.mocked(getShot).mockResolvedValue(shot);
    renderAtShot('shot-1');

    await waitFor(() => expect(screen.getByLabelText('Dose')).toHaveValue('18'));
    const bar = screen.getByTestId('action-bar');
    expect(bar).toContainElement(screen.getByRole('button', { name: 'Save changes' }));
  });

  it('shows an error message when loading the shot fails', async () => {
    vi.mocked(getShot).mockRejectedValue(new Error('Failed to load shot'));

    renderAtShot('shot-1');

    await waitFor(() => expect(screen.getByText('Failed to load shot')).toBeInTheDocument());
  });

  it('seeds the target from the shot\'s bag', async () => {
    vi.mocked(getShot).mockResolvedValue(shot);
    vi.mocked(listBagTargets).mockResolvedValue([
      {
        id: 't1',
        user_id: 'user-1',
        bean_name: shot.bean_name,
        roast_date: shot.roast_date,
        target_ratio: 2.5,
        target_pull_time_low_s: null,
        target_pull_time_high_s: null,
        created_at: '2026-09-04T00:00:00Z',
        updated_at: '2026-09-04T00:00:00Z',
      },
    ]);

    renderAtShot('shot-1');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Target 1:2.5' })).toHaveAttribute('aria-pressed', 'true')
    );
  });

  it('writes the target on save when it changed', async () => {
    vi.mocked(getShot).mockResolvedValue(shot);
    vi.mocked(updateShot).mockResolvedValue({ ...shot });
    vi.mocked(listBagTargets).mockResolvedValue([]);

    renderAtShot('shot-1');

    await waitFor(() => screen.getByRole('button', { name: 'Target 1:2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Target 1:2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(setBagTarget).toHaveBeenCalledWith(
        { bean_name: shot.bean_name, roast_date: shot.roast_date },
        { targetRatio: 2, pullTime: null }
      )
    );
  });

  it('does not write the target when it was not touched', async () => {
    vi.mocked(getShot).mockResolvedValue(shot);
    vi.mocked(updateShot).mockResolvedValue({ ...shot });
    vi.mocked(listBagTargets).mockResolvedValue([]);

    renderAtShot('shot-1');

    await waitFor(() => screen.getByRole('button', { name: 'Save changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateShot).toHaveBeenCalled());
    expect(setBagTarget).not.toHaveBeenCalled();
  });
});
