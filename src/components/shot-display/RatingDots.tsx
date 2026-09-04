// src/components/shot-display/RatingDots.tsx
type Props = {
  rating: number;
  size?: number;
};

export function RatingDots({ rating, size = 7 }: Props) {
  return (
    <div className="flex" style={{ gap: '4px' }} aria-label={`Rating ${rating} of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: i < rating ? 'var(--color-accent)' : 'transparent',
            border: i < rating ? 'none' : '1px solid var(--color-neutral-400)',
          }}
        />
      ))}
    </div>
  );
}
