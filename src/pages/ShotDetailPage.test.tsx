import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ShotDetailPage } from './ShotDetailPage';
import { getShot, deleteShot } from '../lib/shots';
import { getVideoForShot, getVideoPlaybackUrl } from '../lib/videos';

vi.mock('../lib/shots', () => ({ getShot: vi.fn(), deleteShot: vi.fn() }));
vi.mock('../lib/videos', () => ({ getVideoForShot: vi.fn(), getVideoPlaybackUrl: vi.fn() }));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

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
  beforeEach(() => {
    vi.mocked(getVideoForShot).mockResolvedValue(null);
  });

  it('renders the shot fields', async () => {
    vi.mocked(getShot).mockResolvedValue({
      id: 'shot-1',
      user_id: 'user-1',
      grind_setting: '18',
      dose_g: 18,
      yield_g: 36,
      pull_time_s: 28,
      bean_name: 'Colombia Huila',
      roast_date: null,
      rating: 4,
      tasting_note: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    renderAtShot('shot-1');

    await waitFor(() => expect(screen.getByText('Colombia Huila')).toBeInTheDocument());
    expect(screen.getByText('18 g')).toBeInTheDocument();
    expect(screen.getByText('36 g')).toBeInTheDocument();
  });

  it('shows a not-found message when the shot does not exist', async () => {
    vi.mocked(getShot).mockResolvedValue(null);

    renderAtShot('missing');

    await waitFor(() => expect(screen.getByText(/shot not found/i)).toBeInTheDocument());
  });

  it('deletes the shot after confirmation and navigates to the list', async () => {
    vi.mocked(getShot).mockResolvedValue({
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
    });
    vi.mocked(deleteShot).mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderAtShot('shot-1');

    await waitFor(() => expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(deleteShot).toHaveBeenCalledWith('shot-1'));
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('renders a video player when a video is attached', async () => {
    vi.mocked(getShot).mockResolvedValue({
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
    });
    vi.mocked(getVideoForShot).mockResolvedValue({
      id: 'video-1',
      shot_id: 'shot-1',
      user_id: 'user-1',
      storage_key: 'user-1/shot-1/abc.mp4',
      content_type: 'video/mp4',
      size_bytes: 1000,
      uploaded_at: '2026-01-01T00:00:00Z',
    });
    vi.mocked(getVideoPlaybackUrl).mockResolvedValue('https://example.test/signed-url');

    renderAtShot('shot-1');

    await waitFor(() => {
      const player = screen.getByTestId('pour-video');
      expect(player).toHaveAttribute('src', 'https://example.test/signed-url');
    });
  });

  it('renders no video player when no video is attached', async () => {
    vi.mocked(getShot).mockResolvedValue({
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
    });
    vi.mocked(getVideoForShot).mockResolvedValue(null);

    renderAtShot('shot-1');

    await waitFor(() => expect(screen.getByText('18 g')).toBeInTheDocument());
    expect(screen.queryByTestId('pour-video')).not.toBeInTheDocument();
  });
});
