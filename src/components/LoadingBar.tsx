// src/components/LoadingBar.tsx

/**
 * A 2px indeterminate progress bar in the accent color. The shared
 * in-page loading indicator: it sits at the top of a content area whose
 * shell (header, back link) is already on screen, so navigating between
 * pages never blanks the frame. Same visual language as the video-upload
 * progress bar (the `indeterminate` keyframe in theme.css).
 *
 * `role="status"` plus the label keeps the state announced to screen
 * readers now that there is no visible "Loading..." text.
 */
export function LoadingBar() {
  return (
    <div
      role="status"
      aria-label="Loading"
      style={{
        height: '2px',
        background: 'var(--color-accent-200)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: '40%',
          background: 'var(--color-accent)',
          animation: 'indeterminate 1.2s ease-in-out infinite',
        }}
      />
    </div>
  );
}
