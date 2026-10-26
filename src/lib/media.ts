/**
 * Resolves Wix media URIs (e.g. wix:image://v1/..., bare media IDs, or media/ paths)
 * or standard external URLs into a browser-loadable https:// URL.
 */
export function toPublicMediaUrl(src?: string | null): string | undefined {
  if (!src || typeof src !== 'string') return undefined;
  const trimmed = src.trim();
  if (!trimmed) return undefined;

  // Already an absolute HTTP(S) URL
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  // Protocol-relative URL
  if (trimmed.startsWith('//')) return `https:${trimmed}`;

  // Wix image protocol: wix:image://v1/<uri>/<filename>#originWidth=<w>&originHeight=<h>
  // e.g. wix:image://v1/3c76e2_c5331f937348492a97df87b~mv2.jpg/file.jpg#originWidth=500&originHeight=500
  if (trimmed.startsWith('wix:image://')) {
    const match = trimmed.match(/^wix:image:\/\/v1\/([^/#]+)/i);
    if (match?.[1]) {
      return `https://static.wixstatic.com/media/${match[1]}`;
    }
  }

  // Bare Wix media file ID or media/ path (e.g. 11062b_xxx~mv2.jpg or media/uuid~mv2.png)
  const cleaned = trimmed.replace(/^media\//i, '');
  if (
    /^[a-zA-Z0-9_.-]+~mv2(\.[a-zA-Z0-9]+)?$/i.test(cleaned) ||
    /^[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp|gif|svg|avif)$/i.test(cleaned)
  ) {
    return `https://static.wixstatic.com/media/${cleaned}`;
  }

  return trimmed;
}
