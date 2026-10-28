import { MEDIA_LIMITS, mediaKindAllows, type MediaKind } from '../../lib/media-limits';
import { COLLECTIONS } from '../collections';
import { randomToken } from '../crypto';
import { AppError } from '../errors';
import type { Doc, Repo } from '../repo';
import type { WixMediaService } from './WixMediaService';

// Evidence uploads happen before a trade-in exists, so they're grouped by an upload session
// (a 256-bit random id held only by the uploading browser). At submission the server attaches
// only media from that session that are confirmed in the Media Manager and not yet attached.

export type MediaReadyStatus = 'requested' | 'processing' | 'ready' | 'failed';

export type TradeInMediaDoc = Doc & {
  instanceId: string;
  tradeInId?: string;
  uploadSessionId: string;
  mediaType: MediaKind;
  mediaManagerFileId?: string;
  readyStatus: MediaReadyStatus;
  fileSize: number;
  mimeType: string;
  durationSeconds?: number;
  deleteAfter?: Date;
  deletedAt?: Date;
  /** Set when a newer upload replaced this one; terminal, so it can never count toward the limit again. */
  supersededAt?: Date;
};

export type PublicMedia = { mediaId: string; kind: MediaKind; status: MediaReadyStatus };

const SESSION_RE = /^[A-Za-z0-9_-]{40,64}$/;

export class TradeInMediaService {
  constructor(
    private readonly repo: Repo,
    private readonly wixMedia: WixMediaService,
  ) {}

  async requestUpload(instanceId: string, input: {
    uploadSessionId?: string;
    kind: MediaKind;
    mimeType: string;
    fileName: string;
    sizeBytes: number;
    durationSeconds?: number;
  }) {
    const limits = MEDIA_LIMITS[input.kind];
    if (!mediaKindAllows(input.kind, input.mimeType)) throw new AppError('bad_request', 'unsupported type', { file: 'type' });
    if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > limits.maxBytes) {
      throw new AppError('bad_request', 'bad size', { file: 'size' });
    }
    const session = input.uploadSessionId ?? randomToken();
    if (!SESSION_RE.test(session)) throw new AppError('bad_request', 'bad session');

    const existing = await this.repo.find<TradeInMediaDoc>(COLLECTIONS.media, { instanceId, uploadSessionId: session }, { sort: [{ field: '_createdDate', order: 'asc' }], limit: 100 });
    if (existing.items.some((m) => m.tradeInId)) throw new AppError('conflict', 'session already submitted');
    if (existing.items.length >= MEDIA_LIMITS.maxUploadRequestsPerSession) throw new AppError('rate_limited', 'too many uploads');
    let active = existing.items.filter((m) => m.mediaType === input.kind && m.readyStatus !== 'failed' && !m.supersededAt);
    if (active.length >= limits.maxCount) {
      // If an upload was requested but not confirmed, or an unattached video is being replaced,
      // supersede it (oldest first) so retries or replacements do not fail with too many files.
      const replaceable = active.filter((m) => !m.tradeInId && (!m.mediaManagerFileId || input.kind === 'video'));
      if (replaceable.length > 0) {
        const toSupersede = replaceable.slice(0, active.length - limits.maxCount + 1);
        const now = new Date();
        await this.repo.bulkUpdate<TradeInMediaDoc>(COLLECTIONS.media, toSupersede.map((m) => ({ ...m, readyStatus: 'failed', supersededAt: now })));
        const supersededIds = new Set(toSupersede.map((m) => m._id));
        active = active.filter((m) => !supersededIds.has(m._id));
      }
    }
    if (active.length >= limits.maxCount) throw new AppError('bad_request', 'too many files', { file: 'count' });

    const media = await this.repo.insert<TradeInMediaDoc>(COLLECTIONS.media, {
      instanceId,
      uploadSessionId: session,
      mediaType: input.kind,
      readyStatus: 'requested',
      fileSize: input.sizeBytes,
      mimeType: input.mimeType.toLowerCase(),
      durationSeconds: input.durationSeconds,
    });
    const fileName = sanitizeFileName(input.fileName, input.mimeType);
    const resumable = input.kind === 'video' && input.sizeBytes > MEDIA_LIMITS.video.resumableThresholdBytes;
    const target = resumable
      ? { protocol: 'tus' as const, ...(await this.wixMedia.createResumableUploadUrl({ mimeType: input.mimeType, fileName, sizeBytes: input.sizeBytes, mediaId: media._id })) }
      : { protocol: 'put' as const, ...(await this.wixMedia.createUploadUrl({ mimeType: input.mimeType, fileName, sizeBytes: input.sizeBytes, mediaId: media._id })) };
    return { uploadSessionId: session, mediaId: media._id, fileName, ...target };
  }

  /** Client reports the Media Manager file ID returned by the upload; we verify it with Wix. */
  async confirmUpload(instanceId: string, input: { uploadSessionId: string; mediaId: string; fileId: string }): Promise<PublicMedia> {
    const media = await this.loadOwned(instanceId, input.uploadSessionId, input.mediaId);
    if (media.supersededAt) throw new AppError('conflict', 'upload was replaced');
    if (media.mediaManagerFileId && media.mediaManagerFileId !== input.fileId) throw new AppError('conflict', 'different file already confirmed');
    const file = await this.wixMedia.getFile(input.fileId);
    if (!file) throw new AppError('bad_request', 'file not found', { file: 'missing' });
    const expectedFamily = media.mediaType === 'photo' ? 'IMAGE' : 'VIDEO';
    if (file.mimeTypeFamily !== expectedFamily || !file.isPrivate || file.sizeBytes > MEDIA_LIMITS[media.mediaType].maxBytes) {
      await this.repo.update<TradeInMediaDoc>(COLLECTIONS.media, { ...media, readyStatus: 'failed' });
      throw new AppError('bad_request', 'file rejected', { file: 'rejected' });
    }
    // A fileId may only ever belong to one media record (prevents re-using another visitor's upload).
    const claimed = await this.repo.find<TradeInMediaDoc>(COLLECTIONS.media, { mediaManagerFileId: input.fileId }, { limit: 2 });
    if (claimed.items.some((m) => m._id !== media._id)) throw new AppError('conflict', 'file already used');

    const readyStatus: MediaReadyStatus = file.status === 'READY' ? 'ready' : file.status === 'FAILED' ? 'failed' : 'processing';
    const saved = await this.repo.update<TradeInMediaDoc>(COLLECTIONS.media, { ...media, mediaManagerFileId: input.fileId, fileSize: file.sizeBytes, readyStatus });
    return toPublic(saved);
  }

  async sessionStatus(instanceId: string, uploadSessionId: string): Promise<PublicMedia[]> {
    if (!SESSION_RE.test(uploadSessionId)) throw new AppError('not_found');
    const res = await this.repo.find<TradeInMediaDoc>(COLLECTIONS.media, { instanceId, uploadSessionId }, { limit: 100 });
    return res.items.map(toPublic);
  }

  /** Called from the Media Manager File Ready / File Failed events. */
  async markFromEvent(e: { fileId?: string; mediaId?: string; status: 'ready' | 'failed' }): Promise<void> {
    let media: TradeInMediaDoc | null | undefined;
    if (e.mediaId) media = await this.repo.get<TradeInMediaDoc>(COLLECTIONS.media, e.mediaId);
    if (!media && e.fileId) media = (await this.repo.find<TradeInMediaDoc>(COLLECTIONS.media, { mediaManagerFileId: e.fileId }, { limit: 1 })).items[0];
    if (!media || media.supersededAt || media.readyStatus === e.status) return;
    // Only advance a confirmed file; an unconfirmed record gets its fileId from confirmUpload.
    if (e.status === 'ready' && !media.mediaManagerFileId) return;
    await this.repo.update<TradeInMediaDoc>(COLLECTIONS.media, { ...media, readyStatus: e.status });
  }

  /**
   * Validates and attaches the session's media to a new trade-in. Requirements come from the
   * matching rule; media must be confirmed (ready or still processing in the Media Manager).
   */
  async validateForSubmission(instanceId: string, uploadSessionId: string | undefined, mediaIds: string[], req: { photoMinimum: number; videoMode: 'off' | 'optional' | 'required'; videoMaxSeconds: number }) {
    const unique = [...new Set(mediaIds)];
    let docs: TradeInMediaDoc[] = [];
    if (unique.length) {
      if (!uploadSessionId || !SESSION_RE.test(uploadSessionId)) throw new AppError('bad_request', 'missing upload session', { media: 'session' });
      // One query for the whole session (sub-request budget), then match the requested IDs.
      const session = await this.repo.find<TradeInMediaDoc>(COLLECTIONS.media, { instanceId, uploadSessionId }, { limit: 100 });
      docs = unique.map((id) => session.items.find((m) => m._id === id)).filter((m): m is TradeInMediaDoc => !!m);
      if (docs.length !== unique.length) throw new AppError('not_found');
    }
    const usable = docs.filter((d) => !d.tradeInId && !d.supersededAt && d.mediaManagerFileId && (d.readyStatus === 'ready' || d.readyStatus === 'processing'));
    if (usable.length !== docs.length) throw new AppError('bad_request', 'media not uploaded', { media: 'incomplete' });
    const photos = usable.filter((d) => d.mediaType === 'photo');
    const videos = usable.filter((d) => d.mediaType === 'video');
    if (photos.length > MEDIA_LIMITS.photo.maxCount || videos.length > MEDIA_LIMITS.video.maxCount) throw new AppError('bad_request', 'too many files', { file: 'count' });
    if (photos.length < req.photoMinimum) throw new AppError('bad_request', 'photos', { media: 'photos_min' });
    if (req.videoMode === 'required' && videos.length === 0) throw new AppError('bad_request', 'video', { media: 'video_required' });
    if (req.videoMode === 'off' && videos.length > 0) throw new AppError('bad_request', 'video not accepted', { media: 'video_off' });
    if (videos.some((v) => v.durationSeconds !== undefined && v.durationSeconds > req.videoMaxSeconds + 1)) {
      throw new AppError('bad_request', 'video too long', { media: 'video_duration' });
    }
    return usable;
  }

  async attach(docs: TradeInMediaDoc[], tradeInId: string): Promise<void> {
    await this.repo.bulkUpdate<TradeInMediaDoc>(COLLECTIONS.media, docs.map((d) => ({ ...d, tradeInId })));
  }

  async forTradeIn(instanceId: string, tradeInId: string): Promise<TradeInMediaDoc[]> {
    return (await this.repo.find<TradeInMediaDoc>(COLLECTIONS.media, { instanceId, tradeInId }, { limit: 50 })).items;
  }

  /** Dashboard-only: signed, short-lived view URLs. */
  async viewable(instanceId: string, tradeInId: string) {
    const docs = await this.forTradeIn(instanceId, tradeInId);
    return Promise.all(
      docs
        .filter((d) => d.mediaManagerFileId && !d.deletedAt)
        .map(async (d) => ({
          mediaId: d._id,
          kind: d.mediaType,
          status: d.readyStatus,
          url: d.readyStatus === 'ready' ? await this.wixMedia.viewUrl(d.mediaManagerFileId!).catch(() => undefined) : undefined,
        })),
    );
  }

  /** Schedules deletion for a closed trade-in's media per the retention setting. */
  async scheduleRetention(instanceId: string, tradeInId: string, retentionDays: number, now = new Date()): Promise<void> {
    const deleteAfter = new Date(now.getTime() + retentionDays * 86_400_000);
    const pending = (await this.forTradeIn(instanceId, tradeInId)).filter((d) => !d.deleteAfter && !d.deletedAt);
    await this.repo.bulkUpdate<TradeInMediaDoc>(COLLECTIONS.media, pending.map((d) => ({ ...d, deleteAfter })));
  }

  /** Permanently deletes evidence whose retention period has passed (bounded per call). */
  async purgeDue(instanceId: string, now = new Date(), limit = 20): Promise<number> {
    const due = (await this.repo.find<TradeInMediaDoc>(COLLECTIONS.media, { instanceId, deleteAfter: { $lte: now } }, { limit: limit * 2 }))
      .items.filter((d) => !d.deletedAt).slice(0, limit);
    if (!due.length) return 0;
    await this.wixMedia.deletePermanently(due.map((d) => d.mediaManagerFileId).filter((x): x is string => !!x));
    await this.repo.bulkUpdate<TradeInMediaDoc>(COLLECTIONS.media, due.map((d) => ({ ...d, deletedAt: now, readyStatus: 'failed' as const })));
    return due.length;
  }

  /** Permanently deletes a request's evidence files and their records (request deletion). */
  async removeForTradeIn(instanceId: string, tradeInId: string): Promise<void> {
    const docs = await this.forTradeIn(instanceId, tradeInId);
    await this.wixMedia.deletePermanently(docs.filter((d) => !d.deletedAt).map((d) => d.mediaManagerFileId).filter((x): x is string => !!x));
    await this.repo.bulkRemove(COLLECTIONS.media, docs.map((d) => d._id));
  }

  private async loadOwned(instanceId: string, uploadSessionId: string, mediaId: string): Promise<TradeInMediaDoc> {
    const media = await this.repo.get<TradeInMediaDoc>(COLLECTIONS.media, mediaId);
    if (!media || media.instanceId !== instanceId || media.uploadSessionId !== uploadSessionId) throw new AppError('not_found');
    return media;
  }
}

function toPublic(d: TradeInMediaDoc): PublicMedia {
  return { mediaId: d._id, kind: d.mediaType, status: d.readyStatus };
}

function sanitizeFileName(name: string, mimeType: string): string {
  const ext = (mimeType.split('/')[1] ?? 'bin').replace('quicktime', 'mov').replace('jpeg', 'jpg');
  const base = name.replace(/\.[^.]*$/, '').replace(/[^\w.-]+/g, '-').slice(0, 60) || 'evidence';
  return `${base}.${ext}`;
}
