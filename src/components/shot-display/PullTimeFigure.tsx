// src/components/shot-display/PullTimeFigure.tsx
type Props = {
  seconds: number;
  size?: 'l' | 'xl';
};

const SIZE: Record<'l' | 'xl', string> = { l: '16px', xl: '34px' };

export function PullTimeFigure({ seconds, size = 'l' }: Props) {
  return (
    <span
      className="fig inline-flex items-baseline"
      style={{ fontSize: SIZE[size], color: 'var(--color-neutral-700)' }}
    >
      {Math.round(seconds)}
      <span style={{ fontSize: '12.5px', fontWeight: 400 }}>s</span>
    </span>
  );
}
