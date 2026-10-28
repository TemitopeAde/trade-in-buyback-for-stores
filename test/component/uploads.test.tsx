// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Each upload resolves on the next tick and echoes the session it was given, like the server.
const sessions: (string | undefined)[] = [];
vi.mock('../../src/components/widgets/shared/upload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/components/widgets/shared/upload')>()),
  uploadEvidence: async (p: { uploadSessionId?: string }) => {
    sessions.push(p.uploadSessionId);
    await new Promise((r) => setTimeout(r, 5));
    return { uploadSessionId: p.uploadSessionId ?? `server-${sessions.length}`.padEnd(43, 'x'), media: { mediaId: `m${sessions.length}`, status: 'ready' } };
  },
}));

const { useUploads } = await import('../../src/components/widgets/shared/useUploads');

describe('useUploads', () => {
  it('puts files uploaded at the same time in one session', async () => {
    const { result } = renderHook(() => useUploads(60));
    const photo = (name: string) => new File(['x'], name, { type: 'image/jpeg' });
    await act(async () => { await result.current.add('photo', [photo('a.jpg'), photo('b.jpg')]); });
    await waitFor(() => expect(result.current.items.every((i) => i.status === 'ready')).toBe(true));

    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(sessions[1]).toBe(sessions[0]);
    expect(result.current.uploadSessionId()).toBe(sessions[0]);
  });
});
