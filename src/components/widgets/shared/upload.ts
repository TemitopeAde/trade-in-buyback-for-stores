import * as tus from 'tus-js-client';
import { MEDIA_LIMITS, mediaKindAllows, type MediaKind } from '../../../lib/media-limits';
import type { MediaStatus, UploadTarget } from '../../../lib/schemas/api';
import { widgetApi } from './api';

// Browser side of evidence upload:
//  1. ask the app backend for a private upload URL (it validates type/size/count),
//  2. upload straight to the Wix Media Manager (PUT with progress, or tus for large videos —
//     tus resumes interrupted uploads, including after a page reload where storage allows),
//  3. report the resulting file ID so the backend can verify it before submission.

export type UploadProgress = (fraction: number) => void;

type FileResponse = { file?: { id?: string } };

function putWithProgress(url: string, file: File, fileName: string, onProgress: UploadProgress, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const target = new URL(url);
    target.searchParams.set('filename', fileName);
    xhr.open('PUT', target.toString());
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) return reject(new Error(`upload ${xhr.status}`));
      try {
        const id = (JSON.parse(xhr.responseText) as FileResponse).file?.id;
        id ? resolve(id) : reject(new Error('no file id'));
      } catch {
        reject(new Error('bad upload response'));
      }
    };
    xhr.onerror = () => reject(new Error('network'));
    xhr.onabort = () => reject(new DOMException('aborted', 'AbortError'));
    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

function tusUpload(target: UploadTarget, file: File, onProgress: UploadProgress, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: target.uploadUrl,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      metadata: { filename: target.fileName, contentType: file.type, token: target.uploadToken ?? '' },
      onProgress: (sent, total) => onProgress(total ? sent / total : 0),
      onError: reject,
      onSuccess: async () => {
        try {
          // Finalize: PUT {uploadUrl}/{uploadToken}?filename=... returns the file descriptor.
          const finalize = new URL(`${target.uploadUrl.replace(/\/$/, '')}/${target.uploadToken}`);
          finalize.searchParams.set('filename', target.fileName);
          const res = await fetch(finalize.toString(), { method: 'PUT' });
          const id = ((await res.json()) as FileResponse).file?.id;
          id ? resolve(id) : reject(new Error('no file id'));
        } catch (err) {
          reject(err);
        }
      },
    });
    signal.addEventListener('abort', () => void upload.abort(), { once: true });
    upload.findPreviousUploads().then((previous) => {
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }, () => upload.start());
  });
}

export type ValidationIssue = { key: 'validation.fileType' | 'validation.fileSize' | 'validation.videoDuration' | 'validation.tooManyFiles'; vars: Record<string, string | number> };

export function validateFile(kind: MediaKind, file: File, maxVideoSeconds?: number, durationSeconds?: number): ValidationIssue | undefined {
  if (!mediaKindAllows(kind, file.type)) return { key: 'validation.fileType', vars: { name: file.name } };
  const maxBytes = MEDIA_LIMITS[kind].maxBytes;
  if (file.size > maxBytes) return { key: 'validation.fileSize', vars: { name: file.name, max: Math.round(maxBytes / 1024 / 1024) } };
  if (kind === 'video' && maxVideoSeconds && durationSeconds && durationSeconds > maxVideoSeconds + 1) {
    return { key: 'validation.videoDuration', vars: { name: file.name, seconds: maxVideoSeconds } };
  }
  return undefined;
}

/** Reads a video's duration from its metadata where the browser can decode it. */
export function readVideoDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const el = document.createElement('video');
    const url = URL.createObjectURL(file);
    const done = (v: number | undefined) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : undefined);
    el.onerror = () => done(undefined);
    setTimeout(() => done(undefined), 5000);
    el.src = url;
  });
}

export async function uploadEvidence(p: {
  kind: MediaKind;
  file: File;
  uploadSessionId?: string;
  durationSeconds?: number;
  onProgress: UploadProgress;
  signal: AbortSignal;
}): Promise<{ uploadSessionId: string; media: MediaStatus }> {
  const target = await widgetApi.uploadUrl({
    uploadSessionId: p.uploadSessionId,
    kind: p.kind,
    mimeType: p.file.type,
    fileName: p.file.name,
    sizeBytes: p.file.size,
    durationSeconds: p.durationSeconds,
  });
  const fileId = target.protocol === 'tus'
    ? await tusUpload(target, p.file, p.onProgress, p.signal)
    : await putWithProgress(target.uploadUrl, p.file, target.fileName, p.onProgress, p.signal);
  const media = await widgetApi.confirmUpload({ uploadSessionId: target.uploadSessionId, mediaId: target.mediaId, fileId });
  return { uploadSessionId: target.uploadSessionId, media };
}
