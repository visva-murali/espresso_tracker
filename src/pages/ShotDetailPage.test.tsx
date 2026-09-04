// src/pages/ShotDetailPage.test.tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ShotDetailPage } from './ShotDetailPage';
import { getShot, listShots } from '../lib/shots';
import { getVideoForShot, getVideoPlaybackUrl } from '../lib/videos';

vi.mock('../lib/shots', () => ({ getShot: vi.fn(), listShots: vi.fn(), deleteShot: vi.fn() }));
vi.mock('../lib/videos', () => ({
  getVideoForShot: vi.fn(),
  getVideoPlaybackUrl: vi.fn(),
  validateVideoFile: vi.fn(),
  uploadShotVideo: vi.fn(),
}));

const previousShot = {
  id: 'shot-0',
  user_id: 'user-1',
  grind_setting: '18.2',
  dose_g: 18,
  yield_g: 32,
  pull_time_s: 24,
  bean_name: 'Kenya Nyeri AA',
  roast_date: '2026-08-23',
  rating: null,
  tasting_note: null,
  created_at: '2026-09-03T07:42:00Z',
  updated_at: '2026-09-03T07:42:00Z',
};

const shot = {
  ...previousShot,
  id: 'shot-1',
  grind_setting: '18.0',
  dose_g: 18,
  yield_g: 36,
  pull_time_s: 28,
  tasting_note: 'Bright, a little sharp',
  created_at: '2026-09-04T07:42:00Z',
  updated_at: '2026-09-04T07:42:00Z',
};

function renderAtShot(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/shots/${id}`]}>
      <Routes>
        <Route path="/shots/:id" element={<ShotDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ShotDetailPage', () => {
  it('renders the hero ratio, pull time, and delta block against the previous shot on the bag', async () => {
    vi.mocked(getShot).mockResolvedValue(shot);
    vi.mocked(listShots).mockResolvedValue([shot, previousShot]);
    vi.mocked(getVideoForShot).mockResolvedValue(null);

    renderAtShot('shot-1');

    await waitFor(() => expect(screen.getByText('Kenya Nyeri AA')).toBeInTheDocument());
    expect(screen.getByText('2.00')).toBeInTheDocument();
    expect(screen.getByText(/Against the previous shot/)).toBeInTheDocument();
    expect(screen.getByText('+4.0 g yield')).toBeInTheDocument();
  });

  it('omits the delta block for a bag\'s first shot', async () => {
    vi.mocked(getShot).mockResolvedValue(shot);
    vi.mocked(listShots).mockResolvedValue([shot]);
    vi.mocked(getVideoForShot).mockResolvedValue(null);

    renderAtShot('shot-1');

    await waitFor(() => expect(screen.getByText('Kenya Nyeri AA')).toBeInTheDocument());
    expect(screen.queryByText(/Against the previous shot/)).not.toBeInTheDocument();
  });

  it('renders the tasting note in italics', async () => {
    vi.mocked(getShot).mockResolvedValue(shot);
    vi.mocked(listShots).mockResolvedValue([shot]);
    vi.mocked(getVideoForShot).mockResolvedValue(null);

    renderAtShot('shot-1');

    await waitFor(() => expect(screen.getByText('Bright, a little sharp')).toBeInTheDocument());
  });

  it('plays the video when one is attached', async () => {
    vi.mocked(getShot).mockResolvedValue(shot);
    vi.mocked(listShots).mockResolvedValue([shot]);
    vi.mocked(getVideoForShot).mockResolvedValue({
      id: 'video-1',
      shot_id: 'shot-1',
      user_id: 'user-1',
      storage_key: 'user-1/shot-1/pour.mp4',
      content_type: 'video/mp4',
      size_bytes: 1000,
      uploaded_at: '2026-09-04T07:43:00Z',
    });
    vi.mocked(getVideoPlaybackUrl).mockResolvedValue('https://example.test/signed');

    renderAtShot('shot-1');

    await waitFor(() => expect(screen.getByTestId('pour-video')).toBeInTheDocument());
  });

  it('shows an unplayable message when the video element fails to load', async () => {
    vi.mocked(getShot).mockResolvedValue(shot);
    vi.mocked(listShots).mockResolvedValue([shot]);
    vi.mocked(getVideoForShot).mockResolvedValue({
      id: 'video-1',
      shot_id: 'shot-1',
      user_id: 'user-1',
      storage_key: 'user-1/shot-1/pour.mov',
      content_type: 'video/quicktime',
      size_bytes: 1000,
      uploaded_at: '2026-09-04T07:43:00Z',
    });
    vi.mocked(getVideoPlaybackUrl).mockResolvedValue('https://example.test/signed');

    renderAtShot('shot-1');

    await waitFor(() => expect(screen.getByTestId('pour-video')).toBeInTheDocument());
    fireEvent.error(screen.getByTestId('pour-video'));

    await waitFor(() => expect(screen.getByText(/can't preview this format/i)).toBeInTheDocument());
  });

  it('shows a not-found message when the shot does not exist', async () => {
    vi.mocked(getShot).mockResolvedValue(null);
    vi.mocked(listShots).mockResolvedValue([]);

    renderAtShot('missing');

    await waitFor(() => expect(screen.getByText(/shot not found/i)).toBeInTheDocument());
  });
});
