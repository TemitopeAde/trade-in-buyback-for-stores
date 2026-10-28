import React, { useEffect, useRef, useState } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { useDashboard } from './context';
import { Button } from './ui/button';
import { Textarea } from './ui/input';

// Loaded lazily from the Settings page: Quill needs `document`, so it never renders on the server.

const MODULES = {
  toolbar: [
    [{ header: [2, 3, 4, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link', 'blockquote'],
    [{ align: [] }],
    ['clean'],
  ],
};

type Mode = 'editor' | 'html';

export default function TermsEditor({ id, value, onChange, describedBy }: { id: string; value: string; onChange: (html: string) => void; describedBy?: string }) {
  const { t } = useDashboard();
  const [mode, setMode] = useState<Mode>('editor');
  const quill = useRef<ReactQuill>(null);

  // Quill's contenteditable isn't a labelable element, so name it explicitly.
  useEffect(() => {
    const root = quill.current?.getEditor().root;
    if (!root) return;
    root.setAttribute('aria-label', t('dash.settings.terms'));
    root.setAttribute('aria-multiline', 'true');
    root.setAttribute('role', 'textbox');
    if (describedBy) root.setAttribute('aria-describedby', describedBy);
  }, [mode, t, describedBy]);

  return (
    <div className="grid gap-2">
      <div role="group" aria-label={t('dash.settings.termsMode')} className="flex gap-1">
        {(['editor', 'html'] as const).map((m) => (
          <Button key={m} type="button" size="sm" variant={mode === m ? 'secondary' : 'ghost'} aria-pressed={mode === m} onClick={() => setMode(m)}>
            {t(m === 'editor' ? 'dash.settings.termsEditorTab' : 'dash.settings.termsHtmlTab')}
          </Button>
        ))}
      </div>
      {mode === 'editor' ? (
        <div className="terms-editor" id={id}>
          <ReactQuill ref={quill} theme="snow" value={value} modules={MODULES} onChange={(html, _delta, source) => { if (source === 'user') onChange(html); }} />
        </div>
      ) : (
        <>
          <Textarea
            id={id}
            rows={14}
            className="font-mono text-xs"
            spellCheck={false}
            value={value}
            maxLength={50_000}
            aria-describedby={describedBy ? `${describedBy} ${id}-html-note` : `${id}-html-note`}
            onChange={(e) => onChange(e.target.value)}
          />
          <p id={`${id}-html-note`} className="text-xs text-muted-foreground">{t('dash.settings.termsHtmlNote')}</p>
        </>
      )}
    </div>
  );
}
