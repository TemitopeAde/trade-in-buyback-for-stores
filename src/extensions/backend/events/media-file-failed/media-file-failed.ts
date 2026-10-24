import { files } from '@wix/media';
import { media } from '../../../../server/container';
import { sanitizeErrorForLog } from '../../../../server/errors';
import { MEDIA_ORIGIN } from '../../../../server/services/WixMediaService';

// Marks trade-in evidence as failed so the customer can retry the upload.
export default files.onFileDescriptorFileFailed(async (event) => {
  try {
    const info = event.data?.externalInfo;
    if (info?.origin !== MEDIA_ORIGIN) return; // only uploads we tagged can be matched here
    await media.markFromEvent({ mediaId: info.externalIds?.[0], status: 'failed' });
  } catch (err) {
    console.error('[trade-in] media failed', sanitizeErrorForLog(err));
  }
});
