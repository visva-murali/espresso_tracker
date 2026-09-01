import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { NewShotPage } from './NewShotPage';
import { createShot } from '../lib/shots';
import { uploadShotVideo } from '../lib/videos';

vi.mock('../lib/shots', () => ({
  createShot: vi.fn(),
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

describe('NewShotPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a shot and navigates to its detail page', async () => {
    vi.mocked(createShot).mockResolvedValue({
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

    render(
      <MemoryRouter>
        <NewShotPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/grind setting/i), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText(/dose/i), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText(/yield/i), { target: { value: '36' } });
    fireEvent.change(screen.getByLabelText(/pull time/i), { target: { value: '28' } });
    fireEvent.click(screen.getByRole('button', { name: /save shot/i }));

    await waitFor(() =>
      expect(createShot).toHaveBeenCalledWith(
        expect.objectContaining({ grind_setting: '18', dose_g: 18, yield_g: 36, pull_time_s: 28 })
      )
    );
    expect(navigateMock).toHaveBeenCalledWith('/shots/shot-1');
  });

  it('reuses the created shot on retry after a failed video upload instead of creating a duplicate', async () => {
    vi.mocked(createShot).mockResolvedValue({
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
    vi.mocked(uploadShotVideo).mockRejectedValueOnce(new Error('upload failed'));

    render(
      <MemoryRouter>
        <NewShotPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/grind setting/i), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText(/dose/i), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText(/yield/i), { target: { value: '36' } });
    fireEvent.change(screen.getByLabelText(/pull time/i), { target: { value: '28' } });

    const videoInput = screen.getByLabelText(/pour video/i);
    const file = new File(['video-bytes'], 'pour.mp4', { type: 'video/mp4' });
    await waitFor(() => fireEvent.change(videoInput, { target: { files: [file] } }));

    fireEvent.click(screen.getByRole('button', { name: /save shot/i }));

    await waitFor(() => expect(uploadShotVideo).toHaveBeenCalledTimes(1));
    expect(createShot).toHaveBeenCalledTimes(1);

    // Retry: user clicks "Save shot" again after the upload failure.
    vi.mocked(uploadShotVideo).mockResolvedValueOnce({
      id: 'video-1',
      shot_id: 'shot-1',
      user_id: 'user-1',
      storage_key: 'user-1/shot-1/pour.mp4',
      content_type: 'video/mp4',
      size_bytes: 11,
      uploaded_at: '2026-01-01T00:00:00Z',
    });
    fireEvent.click(screen.getByRole('button', { name: /save shot/i }));

    await waitFor(() => expect(uploadShotVideo).toHaveBeenCalledTimes(2));
    expect(createShot).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/shots/shot-1');
  });
});
