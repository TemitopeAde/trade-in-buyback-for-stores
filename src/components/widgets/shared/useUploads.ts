import { useCallback, useEffect, useRef, useState } from 'react';
import { MEDIA_LIMITS, type MediaKind } from '../../../lib/media-limits';
import { errorMessageKey, widgetApi } from './api';
import { newUploadSessionId, readVideoDuration, uploadEvidence, validateFile, type ValidationIssue } from './upload';
import type { MessageKey } from '../../../lib/i18n';

export type UploadItem = {
  localId: string;
  kind: MediaKind;
  name: string;
  previewUrl?: string;
  status: 'uploading' | 'processing' | 'ready' | 'failed';
  progress: number;
  mediaId?: string;
  error?: { key: MessageKey; vars?: Record<string, string | number> };
  file: File;
  durationSeconds?: number;
};

let counter = 0;

/** Evidence upload state for one form session: progress, processing, retry and removal. */
export function useUploads(maxVideoSeconds: number) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [rejections, setRejections] = useState<ValidationIssue[]>([]);
  const sessionRef = useRef<string>();
  const controllers = useRef(new Map<string, AbortController>());

    const objectUrls = useRef(new Set<string>());

    const patch = (localId: string, p: Partial<UploadItem>) => setItems((list) => list.map((i) => (i.localId === localId ? { ...i, ...p } : i)));

  const start = useCallback(async (item: UploadItem) => {
    const controller = new AbortController();
    controllers.current.set(item.localId, controller);
    patch(item.localId, { status: 'uploading', progress: 0, error: undefined });
    // Set before the first await: files uploading at the same time must share one session, or
    // the submission (which names a single session) can't find the others' media.
    sessionRef.current ??= newUploadSessionId();
    try {
      const { uploadSessionId, media } = await uploadEvidence({
        kind: item.kind,
        file: item.file,
        uploadSessionId: sessionRef.current,
        durationSeconds: item.durationSeconds,
        signal: controller.signal,
        onProgress: (fraction) => patch(item.localId, { progress: Math.round(fraction * 100) }),
      });
      sessionRef.current = uploadSessionId;
      patch(item.localId, { mediaId: media.mediaId, progress: 100, status: media.status === 'ready' ? 'ready' : media.status === 'failed' ? 'failed' : 'processing' });
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
      patch(item.localId, { status: 'failed', error: { key: errorMessageKey(err) } });
    } finally {
      controllers.current.delete(item.localId);
    }
  }, []);

  const add = useCallback(async (kind: MediaKind, fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const issues: ValidationIssue[] = [];
    const current = items.filter((i) => i.kind === kind && i.status !== 'failed').length;
    const room = Math.max(0, MEDIA_LIMITS[kind].maxCount - current);
    if (files.length > room) issues.push({ key: 'validation.tooManyFiles', vars: { count: MEDIA_LIMITS[kind].maxCount } });
    const accepted: UploadItem[] = [];
    for (const file of files.slice(0, room)) {
      const durationSeconds = kind === 'video' ? await readVideoDuration(file) : undefined;
      const issue = validateFile(kind, file, maxVideoSeconds, durationSeconds);
      if (issue) {
        issues.push(issue);
        continue;
      }
      let previewUrl: string | undefined;
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        try {
          previewUrl = URL.createObjectURL(file);
          objectUrls.current.add(previewUrl);
        } catch {
          // Fallback if createObjectURL is unavailable or throws
        }
      }
      accepted.push({
        localId: `u${++counter}`,
        kind,
        name: file.name,
        previewUrl,
        status: 'uploading',
        progress: 0,
        file,
        durationSeconds,
      });
    }
    setRejections(issues);
    setItems((list) => [...list, ...accepted]);
    for (const item of accepted) void start(item);
  }, [items, maxVideoSeconds, start]);

  const retry = useCallback((localId: string) => {
    const item = items.find((i) => i.localId === localId);
    if (item) void start(item);
  }, [items, start]);

  const remove = useCallback((localId: string) => {
    controllers.current.get(localId)?.abort();
    setItems((list) => {
      const item = list.find((i) => i.localId === localId);
      if (item?.previewUrl) {
        objectUrls.current.delete(item.previewUrl);
        if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
          try { URL.revokeObjectURL(item.previewUrl); } catch {}
        }
      }
      return list.filter((i) => i.localId !== localId);
    });
  }, []);

  // Poll the backend while any file is still processing in the Media Manager.
  const processing = items.some((i) => i.status === 'processing');
  useEffect(() => {
    if (!processing || !sessionRef.current) return;
    const timer = setInterval(async () => {
      try {
        const statuses = await widgetApi.mediaStatus(sessionRef.current!);
        setItems((list) => list.map((i) => {
          const s = statuses.find((m) => m.mediaId === i.mediaId);
          if (!s || i.status !== 'processing') return i;
          return s.status === 'ready' ? { ...i, status: 'ready' } : s.status === 'failed' ? { ...i, status: 'failed', error: { key: 'error.generic' } } : i;
        }));
      } catch {
        // Transient; keep polling.
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [processing]);

  useEffect(() => () => {
    controllers.current.forEach((c) => c.abort());
    objectUrls.current.forEach((url) => {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try { URL.revokeObjectURL(url); } catch {}
      }
    });
  }, []);

  return { items, rejections, add, retry, remove, uploadSessionId: () => sessionRef.current };
}
