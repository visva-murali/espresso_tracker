import { describe, it, expect } from 'vitest';
import { validateVideoSize, MAX_VIDEO_BYTES } from './videos';

function makeFile(sizeBytes: number, name = 'pour.mp4', type = 'video/mp4'): File {
  const blob = new Blob([new Uint8Array(sizeBytes)]);
  return new File([blob], name, { type });
}

describe('validateVideoSize', () => {
  it('accepts a file under the size cap', () => {
    const result = validateVideoSize(makeFile(1024));
    expect(result.valid).toBe(true);
  });

  it('rejects a file over the size cap', () => {
    const result = validateVideoSize(makeFile(MAX_VIDEO_BYTES + 1));
    expect(result.valid).toBe(false);
  });
});
