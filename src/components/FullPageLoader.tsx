// src/components/FullPageLoader.tsx
import { Logo } from './Logo';

/**
 * Full-viewport loading state, used only where there is no page shell yet
 * to hang a LoadingBar on - the auth check in ProtectedRoute before any
 * route renders. The cup mark pulses gently (the `pulse` keyframe in
 * theme.css) so the screen reads as deliberate rather than broken.
 */
export function FullPageLoader() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex items-center justify-center min-h-[100dvh]"
    >
      <Logo
        size={44}
        style={{
          color: 'var(--color-accent)',
          animation: 'pulse 1.6s ease-in-out infinite',
        }}
      />
    </div>
  );
}
