import React, { useId, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Image as ImageIcon,
  ListChecks,
  Play,
  RotateCw,
  Trash2,
  Video,
} from 'lucide-react';
import { MEDIA_LIMITS, type MediaKind } from '../../../lib/media-limits';
import type { VideoMode } from '../../../lib/schemas/domain';
import type { ValidationIssue } from './upload';
import type { UploadItem } from './useUploads';
import { Alert, WidgetButton } from './primitives';
import { useWidget } from './WidgetThemeProvider';

type UploaderProps = {
  items: UploadItem[];
  onAdd: (files: FileList | File[]) => void;
  onRetry: (localId: string) => void;
  onRemove: (localId: string) => void;
  disabled?: boolean;
};

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadList({ items, onRetry, onRemove }: Pick<UploaderProps, 'items' | 'onRetry' | 'onRemove'>) {
  const { t } = useWidget();
  if (!items.length) return null;

  return (
    <ul className="ti-uploads">
      {items.map((i) => {
        const isPhoto = i.kind === 'photo';
        const isVideo = i.kind === 'video';
        const formattedSize = i.file?.size ? formatFileSize(i.file.size) : '';
        const statusAnnouncement =
          i.status === 'uploading'
            ? t('form.evidence.uploading', { name: i.name, percent: i.progress })
            : i.status === 'processing'
            ? t('form.evidence.processing', { name: i.name })
            : i.status === 'ready'
            ? t('form.evidence.ready', { name: i.name })
            : t('form.evidence.failed', { name: i.name });

        return (
          <li key={i.localId} className="ti-upload" data-status={i.status}>
            {/* Visual Media Preview */}
            <div className="ti-upload__preview-wrap">
              {isPhoto && i.previewUrl ? (
                <img className="ti-upload__thumb" src={i.previewUrl} alt={i.name} />
              ) : isVideo && i.previewUrl ? (
                <>
                  <video
                    className="ti-upload__thumb ti-upload__thumb--video"
                    src={i.previewUrl}
                    preload="metadata"
                    muted
                    playsInline
                  />
                  <span className="ti-upload__video-tag" aria-hidden="true">
                    <Play size={9} fill="currentColor" />
                    VIDEO
                  </span>
                </>
              ) : (
                <div className="ti-upload__placeholder" aria-hidden="true">
                  {isVideo ? <Video size={28} /> : <ImageIcon size={28} />}
                </div>
              )}

              {/* Status Badge in Top-Left */}
              <div className="ti-upload__badge-bar">
                {i.status === 'ready' && (
                  <span className="ti-upload__badge ti-upload__badge--ready">
                    <Check size={11} strokeWidth={3} aria-hidden="true" />
                    Ready
                  </span>
                )}
                {i.status === 'uploading' && (
                  <span className="ti-upload__badge ti-upload__badge--uploading">
                    <span className="ti-upload__spinner" aria-hidden="true" />
                    {i.progress}%
                  </span>
                )}
                {i.status === 'processing' && (
                  <span className="ti-upload__badge ti-upload__badge--processing">
                    <span className="ti-upload__spinner" aria-hidden="true" />
                    Processing
                  </span>
                )}
                {i.status === 'failed' && (
                  <span className="ti-upload__badge ti-upload__badge--failed">
                    Failed
                  </span>
                )}
              </div>

              {/* Top-Right Remove Button with Lucide Trash2 Icon */}
              <button
                type="button"
                className="ti-upload__remove-btn"
                onClick={() => onRemove(i.localId)}
                aria-label={`${t('common.remove')}: ${i.name}`}
                title={t('common.remove')}
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>

              {/* Bottom Progress Bar during upload */}
              {i.status === 'uploading' && (
                <div
                  className="ti-upload__progress-wrap"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={i.progress}
                  aria-label={i.name}
                >
                  <div className="ti-upload__progress-fill" style={{ inlineSize: `${i.progress}%` }} />
                </div>
              )}
            </div>

            {/* Information Card Body */}
            <div className="ti-upload__body">
              <p className="ti-upload__filename" title={i.name}>{i.name}</p>
              <div className="ti-upload__meta-row">
                {formattedSize && <span className="ti-upload__filesize">{formattedSize}</span>}
                {i.status === 'ready' && <span className="ti-upload__statustext">Uploaded</span>}
                {i.status === 'uploading' && <span className="ti-upload__statustext">Uploading…</span>}
                {i.status === 'processing' && <span className="ti-upload__statustext">Finalizing…</span>}
              </div>

              {/* Accessible Announcement for screen readers */}
              <span className="ti-visually-hidden" aria-live="polite">{statusAnnouncement}</span>

              {/* Error state & Retry */}
              {i.status === 'failed' && (
                <div className="ti-upload__error-block">
                  {i.error && <p className="ti-field-error">{t(i.error.key, i.error.vars)}</p>}
                  <WidgetButton
                    variant="secondary"
                    onClick={() => onRetry(i.localId)}
                    style={{ minBlockSize: 32, padding: '4px 10px', fontSize: '0.82em', inlineSize: 'auto', gap: 6 }}
                  >
                    <RotateCw size={12} aria-hidden="true" />
                    {t('common.retry')}
                  </WidgetButton>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function FileDropzone({
  kind,
  label,
  onAdd,
  disabled,
  describedBy,
  maxSeconds,
  currentCount,
  maxCount,
}: {
  kind: MediaKind;
  label: string;
  onAdd: (f: FileList | File[]) => void;
  disabled?: boolean;
  describedBy?: string;
  maxSeconds?: number;
  currentCount: number;
  maxCount: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled) return;
    if (e.dataTransfer.files?.length) {
      onAdd(e.dataTransfer.files);
    }
  };

  const isVideo = kind === 'video';

  return (
    <div
      className={`ti-dropzone ${isDragOver ? 'ti-dropzone--active' : ''}`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-describedby={describedBy}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        id={id}
        className="ti-visually-hidden"
        type="file"
        tabIndex={-1}
        accept={MEDIA_LIMITS[kind].mimeTypes.join(',')}
        multiple={kind === 'photo'}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.files?.length) onAdd(e.target.files);
          e.target.value = '';
        }}
      />

      <div className="ti-dropzone__icon-bubble" aria-hidden="true">
        {isVideo ? <Video size={22} /> : <ImageIcon size={22} />}
      </div>

      <div className="ti-dropzone__content">
        <p className="ti-dropzone__title">
          Drag & drop {isVideo ? 'video' : 'photos'} here, or{' '}
          <span className="ti-dropzone__link">{label}</span>
        </p>
        <p className="ti-dropzone__subtext">
          {isVideo
            ? `MP4, MOV, WebM • Max ${maxSeconds ?? 60}s • Up to 500MB`
            : `JPEG, PNG, WebP, HEIC • Up to 15MB each (${currentCount}/${maxCount})`}
        </p>
      </div>

      <WidgetButton
        variant="secondary"
        onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.click();
        }}
        disabled={disabled}
        aria-describedby={describedBy}
        style={{ minBlockSize: 36, padding: '6px 14px', fontSize: '0.85em', inlineSize: 'auto' }}
      >
        {label}
      </WidgetButton>
    </div>
  );
}

export function PhotoUploader({ minimum, ...props }: UploaderProps & { minimum: number }) {
  const { t, style } = useWidget();
  const helpId = useId();
  const activeCount = props.items.filter((i) => i.status !== 'failed').length;
  const atLimit = activeCount >= MEDIA_LIMITS.photo.maxCount;

  return (
    <section className="ti-fields" aria-labelledby={`${helpId}-h`}>
      <div className="ti-row ti-row--between" style={{ alignItems: 'baseline' }}>
        <h3 id={`${helpId}-h`} className="ti-subheading">{t('form.evidence.photos')}</h3>
        <span className="ti-badge">
          {activeCount}/{MEDIA_LIMITS.photo.maxCount}
        </span>
      </div>
      {style.content.showHelperText && (
        <p id={helpId} className="ti-helper">
          {t('form.evidence.photosHelp', { count: minimum })}
        </p>
      )}
      {!atLimit ? (
        <FileDropzone
          kind="photo"
          label={t('form.evidence.addPhotos')}
          onAdd={props.onAdd}
          disabled={props.disabled}
          describedBy={helpId}
          currentCount={activeCount}
          maxCount={MEDIA_LIMITS.photo.maxCount}
        />
      ) : (
        <p className="ti-helper" style={{ textAlign: 'center', padding: '8px' }}>
          Maximum {MEDIA_LIMITS.photo.maxCount} photos reached
        </p>
      )}
      <UploadList items={props.items} onRetry={props.onRetry} onRemove={props.onRemove} />
    </section>
  );
}

export function VideoUploader({ mode, maxSeconds, ...props }: UploaderProps & { mode: VideoMode; maxSeconds: number }) {
  const { t } = useWidget();
  const helpId = useId();
  if (mode === 'off') return null;

  const activeCount = props.items.filter((i) => i.status !== 'failed').length;
  const atLimit = activeCount >= MEDIA_LIMITS.video.maxCount;

  return (
    <section className="ti-fields" aria-labelledby={`${helpId}-h`}>
      <div className="ti-row ti-row--between" style={{ alignItems: 'baseline' }}>
        <h3 id={`${helpId}-h`} className="ti-subheading">
          {t('form.evidence.video')}
          {mode === 'optional' && <span className="ti-helper"> ({t('common.optional')})</span>}
        </h3>
        {mode === 'required' && <span className="ti-badge ti-badge--required">Required</span>}
      </div>
      {/* Requirement text is essential, so it is shown regardless of the help-text toggle. */}
      <p id={helpId} className="ti-helper">
        {mode === 'required'
          ? t('form.evidence.videoHelpRequired', { seconds: maxSeconds })
          : t('form.evidence.videoHelpOptional', { seconds: maxSeconds })}
      </p>
      {!atLimit ? (
        <FileDropzone
          kind="video"
          label={t('form.evidence.addVideo')}
          onAdd={props.onAdd}
          disabled={props.disabled}
          describedBy={helpId}
          maxSeconds={maxSeconds}
          currentCount={activeCount}
          maxCount={MEDIA_LIMITS.video.maxCount}
        />
      ) : null}
      <UploadList items={props.items} onRetry={props.onRetry} onRemove={props.onRemove} />
    </section>
  );
}

export function UploadChecklist({
  photosReady,
  photoMinimum,
  videoMode,
  videoReady,
}: {
  photosReady: number;
  photoMinimum: number;
  videoMode: VideoMode;
  videoReady: boolean;
}) {
  const { t } = useWidget();
  const photosDone = photosReady >= photoMinimum;
  const videoDone = videoMode !== 'required' || videoReady;
  const allDone = photosDone && videoDone;
  const totalRequired = (photoMinimum > 0 ? 1 : 0) + (videoMode === 'required' ? 1 : 0);
  const totalCompleted = (photosDone && photoMinimum > 0 ? 1 : 0) + (videoReady && videoMode === 'required' ? 1 : 0);

  return (
    <div className="ti-checklist-card" role="region" aria-label={t('form.evidence.checklist')}>
      <div className="ti-checklist-header">
        <div className="ti-checklist-title-group">
          <ListChecks size={18} className="ti-checklist-icon" aria-hidden="true" />
          <span className="ti-label" style={{ margin: 0 }}>{t('form.evidence.checklist')}</span>
        </div>
        {totalRequired > 0 && (
          <span className={`ti-checklist-summary-badge ${allDone ? 'ti-checklist-summary-badge--done' : ''}`}>
            {allDone ? '✓ All requirements met' : `${totalCompleted} of ${totalRequired} completed`}
          </span>
        )}
      </div>

      <ul className="ti-checklist">
        {photoMinimum > 0 && (
          <li className={`ti-checklist-item ${photosDone ? 'ti-checklist-item--done' : ''}`} data-done={photosDone}>
            <span className="ti-checklist-indicator" aria-hidden="true">
              {photosDone ? (
                <Check size={11} strokeWidth={3} />
              ) : (
                <span className="ti-checklist-dot" />
              )}
            </span>
            <span className="ti-checklist-text">
              {t('form.evidence.photosProgress', { count: photosReady, required: photoMinimum })}
            </span>
          </li>
        )}
        {videoMode === 'required' && (
          <li className={`ti-checklist-item ${videoReady ? 'ti-checklist-item--done' : ''}`} data-done={videoReady}>
            <span className="ti-checklist-indicator" aria-hidden="true">
              {videoReady ? (
                <Check size={11} strokeWidth={3} />
              ) : (
                <span className="ti-checklist-dot" />
              )}
            </span>
            <span className="ti-checklist-text">
              {videoReady ? t('form.evidence.videoDone') : t('form.evidence.videoProgressRequired')}
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}

export function UploadRejections({ issues }: { issues: ValidationIssue[] }) {
  const { t } = useWidget();
  if (!issues.length) return null;
  return (
    <Alert tone="error">
      <ul style={{ margin: 0, paddingInlineStart: 18 }}>
        {issues.map((i, n) => (
          <li key={n}>{t(i.key, i.vars)}</li>
        ))}
      </ul>
    </Alert>
  );
}
