import { files } from '@wix/media';
import { media } from '../../../../server/container';
import { sanitizeErrorForLog } from '../../../../server/errors';
import { MEDIA_ORIGIN } from '../../../../server/services/WixMediaService';

// Marks trade-in evidence as ready once the Media Manager finishes processing it.
// Idempotent: repeated deliveries leave an already-ready record unchanged.
export default files.onFileDescriptorFileReady(async (event) => {
  try {
    const info = event.data?.externalInfo;
    const fileId = event.data?.file?._id ?? undefined;
    if (info?.origin && info.origin !== MEDIA_ORIGIN) return;
    // Resumable uploads carry no externalInfo; they are matched by fileId (unknown files are ignored).
    await media.markFromEvent({ fileId, mediaId: info?.externalIds?.[0], status: 'ready' });
  } catch (err) {
    console.error('[trade-in] media ready', sanitizeErrorForLog(err));
  }
});
