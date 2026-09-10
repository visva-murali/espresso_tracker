import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { NewShotPage } from './NewShotPage';
import { createShot, listShots } from '../lib/shots';
import { uploadShotVideo } from '../lib/videos';

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    // Grind, dose, yield, and pull time are all required (ShotForm rejects an
    // empty/zero submit), so every nudge-able field needs a nudge before Save
    // will actually persist anything on a brand-new bag with blank fields.
    fireEvent.click(screen.getByRole('button', { name: 'Increase grind' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase dose' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase yield' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase pull time' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save shot' }));

    await waitFor(() =>
      expect(createShot).toHaveBeenCalledWith({
        grind_setting: '0.1',
        dose_g: 0.1,
        yield_g: 0.5,
        pull_time_s: 1,
        bean_name: 'Colombia Huila',
        roast_date: null,
        rating: null,
        tasting_note: null,
      })
    );
  });

  it('puts "Save shot" in the sticky bottom bar, below the pour-video field', async () => {
    vi.mocked(listShots).mockResolvedValue([referenceShot]);

    render(
      <MemoryRouter>
        <NewShotPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByLabelText('Dose')).toHaveValue('18'));
    const bar = screen.getByTestId('action-bar');
    expect(bar).toContainElement(screen.getByRole('button', { name: 'Save shot' }));
    expect(bar).not.toContainElement(screen.getByLabelText(/pour video/i));
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

  it('reuses the created shot on retry after a failed video upload instead of creating a duplicate', async () => {
    vi.mocked(listShots).mockResolvedValue([referenceShot]);
    vi.mocked(createShot).mockResolvedValue({ ...referenceShot, id: 'shot-new' });
    vi.mocked(uploadShotVideo).mockRejectedValueOnce(new Error('upload failed'));

    render(
      <MemoryRouter>
        <NewShotPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByLabelText('Dose')).toHaveValue('18'));

    const videoInput = screen.getByLabelText(/pour video/i);
    const file = new File(['video-bytes'], 'pour.mp4', { type: 'video/mp4' });
    await waitFor(() => fireEvent.change(videoInput, { target: { files: [file] } }));

    fireEvent.click(screen.getByRole('button', { name: 'Save shot' }));

    await waitFor(() => expect(uploadShotVideo).toHaveBeenCalledTimes(1));
    expect(createShot).toHaveBeenCalledTimes(1);

    vi.mocked(uploadShotVideo).mockResolvedValueOnce({
      id: 'video-1',
      shot_id: 'shot-new',
      user_id: 'user-1',
      storage_key: 'user-1/shot-new/pour.mp4',
      content_type: 'video/mp4',
      size_bytes: 11,
      uploaded_at: '2026-01-01T00:00:00Z',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save shot' }));

    await waitFor(() => expect(uploadShotVideo).toHaveBeenCalledTimes(2));
    expect(createShot).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/shots/shot-new');
  });
});
