import { auth } from '@wix/essentials';
import { files } from '@wix/media';

// Thin wrapper over the Wix Media Manager. Trade-in evidence is uploaded as *private* files in
// an app folder; dashboard viewing uses short-lived signed download URLs.

export const MEDIA_ORIGIN = 'trade-in-app';
const FOLDER = '/trade-in-evidence';

const elevated = {
  uploadUrl: auth.elevate(files.generateFileUploadUrl),
  resumableUrl: auth.elevate(files.generateFileResumableUploadUrl),
  getFile: auth.elevate(files.getFileDescriptor),
  downloadUrl: auth.elevate(files.generateFileDownloadUrl),
  bulkDelete: auth.elevate(files.bulkDeleteFiles),
};

export type FileInfo = { fileId: string; mimeTypeFamily: 'IMAGE' | 'VIDEO' | 'OTHER'; sizeBytes: number; isPrivate: boolean; status: 'READY' | 'PENDING' | 'FAILED' };

export class WixMediaService {
  async createUploadUrl(p: { mimeType: string; fileName: string; sizeBytes: number; mediaId: string }): Promise<{ uploadUrl: string }> {
    const res = await elevated.uploadUrl(p.mimeType, {
      fileName: p.fileName,
      sizeInBytes: String(p.sizeBytes),
      private: true,
      filePath: FOLDER,
      externalInfo: { origin: MEDIA_ORIGIN, externalIds: [p.mediaId] },
    });
    if (!res.uploadUrl) throw new Error('no upload url');
    return { uploadUrl: res.uploadUrl };
  }

  async createResumableUploadUrl(p: { mimeType: string; fileName: string; sizeBytes: number; mediaId: string }): Promise<{ uploadUrl: string; uploadToken: string }> {
    const res = await elevated.resumableUrl(p.mimeType, {
      fileName: p.fileName,
      sizeInBytes: String(p.sizeBytes),
      private: true,
      filePath: FOLDER,
      uploadProtocol: 'TUS',
      // The installed SDK doesn't accept externalInfo here (docs say it does); resumable uploads
      // are correlated by fileId, which the client reports after finalizing the upload.
    });
    if (!res.uploadUrl || !res.uploadToken) throw new Error('no resumable upload url');
    return { uploadUrl: res.uploadUrl, uploadToken: res.uploadToken };
  }

  async getFile(fileId: string): Promise<FileInfo | undefined> {
    try {
      const f = await elevated.getFile(fileId);
      return {
        fileId,
        mimeTypeFamily: f.mediaType === 'IMAGE' ? 'IMAGE' : f.mediaType === 'VIDEO' ? 'VIDEO' : 'OTHER',
        sizeBytes: Number(f.sizeInBytes ?? 0),
        isPrivate: !!f.private,
        status: (f.operationStatus ?? 'PENDING') as FileInfo['status'],
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Short-lived signed URL for an authorized dashboard viewer; never stored or emailed. The
   * download URL plays inline in <video> on all browsers (HLS streaming URLs don't, outside Safari).
   */
  async viewUrl(fileId: string): Promise<string | undefined> {
    const res = await elevated.downloadUrl(fileId, { expirationInMinutes: 30 });
    return res.downloadUrls?.[0]?.url;
  }

  async deletePermanently(fileIds: string[]): Promise<void> {
    if (fileIds.length) await elevated.bulkDelete(fileIds, { permanent: true });
  }
}
