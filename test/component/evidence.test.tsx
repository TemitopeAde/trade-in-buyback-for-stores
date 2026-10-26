// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhotoUploader, UploadChecklist, VideoUploader } from '../../src/components/widgets/shared/Evidence';
import { WidgetThemeProvider } from '../../src/components/widgets/shared/WidgetThemeProvider';
import type { UploadItem } from '../../src/components/widgets/shared/useUploads';

afterEach(() => {
  cleanup();
});

function wrap(ui: React.ReactElement) {
  return render(
    <WidgetThemeProvider locale="en" kind="form">
      {ui}
    </WidgetThemeProvider>
  );
}

describe('Evidence Redesign Components', () => {
  it('renders UploadChecklist with progress badges and updates completion', () => {
    const { rerender } = wrap(
      <UploadChecklist photosReady={1} photoMinimum={2} videoMode="required" videoReady={false} />
    );

    expect(screen.getByText('Upload checklist')).toBeTruthy();
    expect(screen.getByText('0 of 2 completed')).toBeTruthy();
    expect(screen.getByText('1 of 2 photos')).toBeTruthy();
    expect(screen.getByText('Video required')).toBeTruthy();

    rerender(
      <WidgetThemeProvider locale="en" kind="form">
        <UploadChecklist photosReady={2} photoMinimum={2} videoMode="required" videoReady={true} />
      </WidgetThemeProvider>
    );

    expect(screen.getByText('✓ All requirements met')).toBeTruthy();
    expect(screen.getByText('Video added')).toBeTruthy();
  });

  it('renders PhotoUploader with dropzone and triggers onAdd when file selected', () => {
    const onAdd = vi.fn();
    const onRetry = vi.fn();
    const onRemove = vi.fn();

    const { container } = wrap(
      <PhotoUploader minimum={2} items={[]} onAdd={onAdd} onRetry={onRetry} onRemove={onRemove} />
    );

    expect(screen.getByRole('heading', { name: 'Photos' })).toBeTruthy();
    expect(screen.getByText('0/10')).toBeTruthy();
    expect(screen.getByText(/Drag & drop photos here/)).toBeTruthy();

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    const file = new File(['dummy'], 'photo1.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('renders uploaded photo cards with preview, filename, and remove action', () => {
    const onAdd = vi.fn();
    const onRetry = vi.fn();
    const onRemove = vi.fn();

    const photoItem: UploadItem = {
      localId: 'u1',
      kind: 'photo',
      name: 'screenshot-mac.png',
      previewUrl: 'blob:http://localhost/dummy-photo',
      status: 'ready',
      progress: 100,
      file: new File(['dummy content'], 'screenshot-mac.png', { type: 'image/png' }),
    };

    wrap(
      <PhotoUploader minimum={2} items={[photoItem]} onAdd={onAdd} onRetry={onRetry} onRemove={onRemove} />
    );

    expect(screen.getByText('screenshot-mac.png')).toBeTruthy();
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.getByText('Uploaded')).toBeTruthy();

    const removeBtn = screen.getByRole('button', { name: /Remove: screenshot-mac.png/i });
    expect(removeBtn).toBeTruthy();
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith('u1');
  });

  it('renders video upload with preview, video tag, progress bar, and handles retry on failure', () => {
    const onAdd = vi.fn();
    const onRetry = vi.fn();
    const onRemove = vi.fn();

    const uploadingVideo: UploadItem = {
      localId: 'v1',
      kind: 'video',
      name: 'screen-recording.mp4',
      previewUrl: 'blob:http://localhost/dummy-video',
      status: 'uploading',
      progress: 54,
      file: new File(['video content'], 'screen-recording.mp4', { type: 'video/mp4' }),
    };

    const { rerender } = wrap(
      <VideoUploader mode="required" maxSeconds={60} items={[uploadingVideo]} onAdd={onAdd} onRetry={onRetry} onRemove={onRemove} />
    );

    expect(screen.getByText('screen-recording.mp4')).toBeTruthy();
    expect(screen.getByText('54%')).toBeTruthy();
    expect(screen.getByText('VIDEO')).toBeTruthy();

    // Rerender as failed to test retry
    const failedVideo: UploadItem = {
      ...uploadingVideo,
      status: 'failed',
      error: { key: 'error.generic' },
    };

    rerender(
      <WidgetThemeProvider locale="en" kind="form">
        <VideoUploader mode="required" maxSeconds={60} items={[failedVideo]} onAdd={onAdd} onRetry={onRetry} onRemove={onRemove} />
      </WidgetThemeProvider>
    );

    expect(screen.getByText('Failed')).toBeTruthy();
    const retryBtn = screen.getByRole('button', { name: 'Try again' });
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledWith('v1');
  });
});
