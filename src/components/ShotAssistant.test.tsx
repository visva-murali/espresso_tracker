import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShotAssistant } from './ShotAssistant';
import { analyzeShot, AnalyzeError, type ShotAnalysis } from '../lib/analyses';

vi.mock('../lib/analyses', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/analyses')>();
  return { ...actual, analyzeShot: vi.fn() };
});

const analyzeShotMock = vi.mocked(analyzeShot);

const analysis: ShotAnalysis = {
  id: 'a1',
  shot_id: 's1',
  user_id: 'u1',
  diagnosis: 'Running fast, under-extracted.',
  adjustment: 'Grind finer, aim for 30-32s.',
  model: 'llama-3.3-70b-versatile',
  history_count: 3,
  created_at: '2026-09-04T07:42:00Z',
  updated_at: '2026-09-04T07:42:00Z',
};

beforeEach(() => {
  analyzeShotMock.mockReset();
});

describe('ShotAssistant', () => {
  it('offers analysis when there is none yet', () => {
    render(<ShotAssistant shotId="s1" initialAnalysis={null} />);
    expect(screen.getByText('Barista assistant')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze this shot' })).toBeInTheDocument();
  });

  it('renders the diagnosis, adjustment, and metadata line for an existing analysis', () => {
    render(<ShotAssistant shotId="s1" initialAnalysis={analysis} />);
    expect(screen.getByText(/Running fast, under-extracted\./)).toBeInTheDocument();
    expect(screen.getByText(/Grind finer, aim for 30-32s\./)).toBeInTheDocument();
    expect(screen.getByText(/llama-3\.3-70b-versatile/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-analyze' })).toBeInTheDocument();
  });

  it('shows the running label while analysis is in flight, then the result', async () => {
    let resolve: (v: ShotAnalysis) => void = () => {};
    analyzeShotMock.mockReturnValue(new Promise((r) => (resolve = r)));

    render(<ShotAssistant shotId="s1" initialAnalysis={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Analyze this shot' }));

    expect(screen.getByRole('button', { name: 'Analyzing...' })).toBeDisabled();
    resolve(analysis);
    await waitFor(() => expect(screen.getByText(/Grind finer/)).toBeInTheDocument());
  });

  it('shows the 422 message and keeps an existing analysis visible', async () => {
    analyzeShotMock.mockRejectedValue(new AnalyzeError(422, 'server text'));
    render(<ShotAssistant shotId="s1" initialAnalysis={analysis} />);

    fireEvent.click(screen.getByRole('button', { name: 'Re-analyze' }));
    await waitFor(() =>
      expect(screen.getByText("This shot's numbers can't be analyzed.")).toBeInTheDocument()
    );
    expect(screen.getByText(/Running fast, under-extracted\./)).toBeInTheDocument();
  });

  it('shows the generic message on a 502', async () => {
    analyzeShotMock.mockRejectedValue(new AnalyzeError(502, 'anything'));
    render(<ShotAssistant shotId="s1" initialAnalysis={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Analyze this shot' }));
    await waitFor(() =>
      expect(
        screen.getByText('The assistant is unavailable right now. Try again.')
      ).toBeInTheDocument()
    );
  });
});
