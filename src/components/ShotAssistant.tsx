// src/components/ShotAssistant.tsx
import { useState } from 'react';
import { analyzeShot, AnalyzeError, type ShotAnalysis } from '../lib/analyses';

type Props = {
  shotId: string;
  initialAnalysis: ShotAnalysis | null;
};

const GENERIC_MESSAGE = 'The assistant is unavailable right now. Try again.';

function messageForError(err: unknown): string {
  if (err instanceof AnalyzeError) {
    if (err.status === 422) return "This shot's numbers can't be analyzed.";
    if (err.status === 429 || err.status === 502) return GENERIC_MESSAGE;
    return err.message || GENERIC_MESSAGE;
  }
  return GENERIC_MESSAGE;
}

function formatAnalyzedAt(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString(undefined, { weekday: 'short' });
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${day} ${time}`;
}

export function ShotAssistant({ shotId, initialAnalysis }: Props) {
  const [analysis, setAnalysis] = useState<ShotAnalysis | null>(initialAnalysis);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      setAnalysis(await analyzeShot(shotId));
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setRunning(false);
    }
  }

  const buttonLabel = running ? 'Analyzing...' : analysis ? 'Re-analyze' : 'Analyze this shot';

  return (
    <section
      className="border-t border-[var(--color-divider)]"
      style={{ padding: 'var(--space-3) var(--space-4)' }}
    >
      <div
        className="num"
        style={{
          fontSize: '11px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          opacity: 0.55,
        }}
      >
        Barista assistant
      </div>

      {analysis ? (
        <div style={{ marginTop: 'var(--space-2)' }}>
          <p style={{ fontSize: '13px', margin: 0 }}>
            <span style={{ color: 'var(--color-neutral-700)' }}>Diagnosis. </span>
            {analysis.diagnosis}
          </p>
          <p style={{ fontSize: '13px', margin: 'var(--space-1) 0 0' }}>
            <span style={{ color: 'var(--color-neutral-700)' }}>Next shot. </span>
            {analysis.adjustment}
          </p>
          <div className="num" style={{ fontSize: '11px', opacity: 0.5, marginTop: 'var(--space-2)' }}>
            Analyzed {formatAnalyzedAt(analysis.updated_at)} · {analysis.model}
          </div>
        </div>
      ) : (
        <p style={{ fontSize: '13px', opacity: 0.7, margin: 'var(--space-2) 0 0' }}>
          A read of this shot's numbers against the bag so far.
        </p>
      )}

      {error && (
        <p
          style={{
            color: 'var(--color-accent-800)',
            fontSize: '13px',
            marginTop: 'var(--space-2)',
          }}
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={run}
        disabled={running}
        className="h-9 px-3 flex items-center border rounded-[var(--radius-md)] text-sm hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
        style={{
          marginTop: 'var(--space-2)',
          borderColor: analysis ? 'var(--color-divider)' : 'var(--color-accent)',
          color: analysis ? 'var(--color-neutral-700)' : 'var(--color-accent)',
        }}
      >
        {buttonLabel}
      </button>
    </section>
  );
}
