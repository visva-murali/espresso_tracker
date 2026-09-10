// src/components/Logo.tsx
import type { SVGProps } from 'react';

type LogoProps = SVGProps<SVGSVGElement> & { size?: number };

/**
 * The app's cup-with-crema mark. Stroke-based like the interface icons in
 * icons.tsx, so it inherits color from `currentColor` - callers set the
 * color (accent brown in the login and list headers).
 */
export function Logo({ size = 16, strokeWidth = 1.5, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <ellipse cx="10.5" cy="8" rx="5.5" ry="2" />
      <path d="M5 8v4a5.5 5.5 0 0 0 11 0V8" />
      <path d="M16 9a2.75 2.75 0 0 1 0 5.5" />
      <line x1="3.5" y1="18.5" x2="17.5" y2="18.5" />
    </svg>
  );
}
