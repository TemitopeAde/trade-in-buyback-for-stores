// Shared by the widget (pre-upload validation, UX) and the server (authoritative checks).

export const MEDIA_LIMITS = {
  photo: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
    maxBytes: 15 * 1024 * 1024,
    maxCount: 10,
  },
  video: {
    mimeTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
    maxBytes: 500 * 1024 * 1024,
    maxCount: 1,
    /** Above this size the client uses the resumable (tus) upload flow. */
    resumableThresholdBytes: 8 * 1024 * 1024,
  },
  /** Upload URLs a single upload session may request (abuse guard). */
  maxUploadRequestsPerSession: 30,
} as const;

export type MediaKind = 'photo' | 'video';

export function mediaKindAllows(kind: MediaKind, mimeType: string): boolean {
  return (MEDIA_LIMITS[kind].mimeTypes as readonly string[]).includes(mimeType.toLowerCase());
}
