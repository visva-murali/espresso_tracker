// src/components/shot-display/RatioFigure.tsx
type Props = {
  value: number;
  size?: 'l' | 'xl';
};

const MAIN_SIZE: Record<'l' | 'xl', string> = { l: '24px', xl: '44px' };
const PREFIX_SIZE: Record<'l' | 'xl', string> = { l: '16px', xl: '27px' };

export function RatioFigure({ value, size = 'l' }: Props) {
  return (
    <span className="fig inline-flex items-baseline" style={{ fontSize: MAIN_SIZE[size] }}>
      <span
        className="fig"
        style={{ fontSize: PREFIX_SIZE[size], fontWeight: 400, color: 'var(--color-neutral-700)' }}
      >
        1:
      </span>
      {value.toFixed(2)}
    </span>
  );
}
