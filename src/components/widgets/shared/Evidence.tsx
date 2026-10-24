import React, { useId, useRef } from 'react';
import { MEDIA_LIMITS, type MediaKind } from '../../../lib/media-limits';
import type { VideoMode } from '../../../lib/schemas/domain';
import type { ValidationIssue } from './upload';
import type { UploadItem } from './useUploads';
import { Alert, WidgetButton } from './primitives';
import { useWidget } from './WidgetThemeProvider';

type UploaderProps = {
  items: UploadItem[];
  onAdd: (files: FileList) => void;
  onRetry: (localId: string) => void;
  onRemove: (localId: string) => void;
  disabled?: boolean;
};

function UploadList({ items, onRetry, onRemove }: Pick<UploaderProps, 'items' | 'onRetry' | 'onRemove'>) {
  const { t } = useWidget();
  if (!items.length) return null;
  return (
    <ul className="ti-uploads">
      {items.map((i) => {
        const status =
          i.status === 'uploading' ? t('form.evidence.uploading', { name: i.name, percent: i.progress })
          : i.status === 'processing' ? t('form.evidence.processing', { name: i.name })
          : i.status === 'ready' ? t('form.evidence.ready', { name: i.name })
          : t('form.evidence.failed', { name: i.name });
        return (
          <li key={i.localId} className="ti-upload" data-status={i.status}>
            {i.previewUrl ? <img className="ti-upload__thumb" src={i.previewUrl} alt="" /> : <span className="ti-upload__thumb" aria-hidden="true" />}
            {i.status === 'uploading' && (
              <div className="ti-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={i.progress} aria-label={i.name}>
                <div className="ti-progress__bar" style={{ inlineSize: `${i.progress}%` }} />
              </div>
            )}
            <p className="ti-helper" aria-live="polite">{status}</p>
            {i.status === 'failed' && i.error && <p className="ti-field-error">{t(i.error.key, i.error.vars)}</p>}
            <div className="ti-row">
              {i.status === 'failed' && <WidgetButton variant="link" onClick={() => onRetry(i.localId)}>{t('common.retry')}</WidgetButton>}
              <WidgetButton variant="link" onClick={() => onRemove(i.localId)} aria-label={`${t('common.remove')}: ${i.name}`}>{t('common.remove')}</WidgetButton>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function FilePickerButton({ kind, label, onAdd, disabled, describedBy }: { kind: MediaKind; label: string; onAdd: (f: FileList) => void; disabled?: boolean; describedBy?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  return (
    <>
      <input
        ref={inputRef}
        id={id}
        className="ti-visually-hidden"
        type="file"
        tabIndex={-1}
        accept={MEDIA_LIMITS[kind].mimeTypes.join(',')}
        multiple={kind === 'photo'}
        onChange={(e) => {
          if (e.target.files?.length) onAdd(e.target.files);
          e.target.value = '';
        }}
      />
      <WidgetButton variant="secondary" onClick={() => inputRef.current?.click()} disabled={disabled} aria-describedby={describedBy}>{label}</WidgetButton>
    </>
  );
}

export function PhotoUploader({ minimum, ...props }: UploaderProps & { minimum: number }) {
  const { t, style } = useWidget();
  const helpId = useId();
  return (
    <section className="ti-fields" aria-labelledby={`${helpId}-h`}>
      <h3 id={`${helpId}-h`} className="ti-subheading">{t('form.evidence.photos')}</h3>
      {style.content.showHelperText && <p id={helpId} className="ti-helper">{t('form.evidence.photosHelp', { count: minimum })}</p>}
      <div className="ti-dropzone">
        <FilePickerButton kind="photo" label={t('form.evidence.addPhotos')} onAdd={props.onAdd} disabled={props.disabled} describedBy={helpId} />
      </div>
      <UploadList items={props.items} onRetry={props.onRetry} onRemove={props.onRemove} />
    </section>
  );
}

export function VideoUploader({ mode, maxSeconds, ...props }: UploaderProps & { mode: VideoMode; maxSeconds: number }) {
  const { t } = useWidget();
  const helpId = useId();
  if (mode === 'off') return null;
  const atLimit = props.items.filter((i) => i.status !== 'failed').length >= MEDIA_LIMITS.video.maxCount;
  return (
    <section className="ti-fields" aria-labelledby={`${helpId}-h`}>
      <h3 id={`${helpId}-h`} className="ti-subheading">
        {t('form.evidence.video')}
        {mode === 'optional' && <span className="ti-helper"> ({t('common.optional')})</span>}
      </h3>
      {/* Requirement text is essential, so it is shown regardless of the help-text toggle. */}
      <p id={helpId} className="ti-helper">
        {mode === 'required' ? t('form.evidence.videoHelpRequired', { seconds: maxSeconds }) : t('form.evidence.videoHelpOptional', { seconds: maxSeconds })}
      </p>
      {!atLimit && (
        <div className="ti-dropzone">
          <FilePickerButton kind="video" label={t('form.evidence.addVideo')} onAdd={props.onAdd} disabled={props.disabled} describedBy={helpId} />
        </div>
      )}
      <UploadList items={props.items} onRetry={props.onRetry} onRemove={props.onRemove} />
    </section>
  );
}

export function UploadChecklist({ photosReady, photoMinimum, videoMode, videoReady }: { photosReady: number; photoMinimum: number; videoMode: VideoMode; videoReady: boolean }) {
  const { t } = useWidget();
  const photosDone = photosReady >= photoMinimum;
  return (
    <div className="ti-fields" style={{ gap: 6 }}>
      <p className="ti-label">{t('form.evidence.checklist')}</p>
      <ul className="ti-checklist">
        <li data-done={photosDone}>
          <span aria-hidden="true">{photosDone ? '✓' : '○'}</span>
          {t('form.evidence.photosProgress', { count: photosReady, required: photoMinimum })}
        </li>
        {videoMode === 'required' && (
          <li data-done={videoReady}>
            <span aria-hidden="true">{videoReady ? '✓' : '○'}</span>
            {videoReady ? t('form.evidence.videoDone') : t('form.evidence.videoProgressRequired')}
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
      <ul>{issues.map((i, n) => <li key={n}>{t(i.key, i.vars)}</li>)}</ul>
    </Alert>
  );
}
