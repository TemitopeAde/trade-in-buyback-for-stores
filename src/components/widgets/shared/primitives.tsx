import React, { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useWidget } from './WidgetThemeProvider';

// Base building blocks. They carry no colors or fonts of their own — everything comes from
// the --ti-* variables set by WidgetThemeProvider, so every instance follows its saved style.

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'link';
  /** Shows a spinner and disables the button without changing its label. */
  busy?: boolean;
};

export function WidgetButton({ variant = 'primary', busy, disabled, children, className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={['ti-button', `ti-button--${variant}`, className].filter(Boolean).join(' ')}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy && <span className="ti-button__spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function WidgetCard({ children, className, as: Tag = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' }) {
  return <Tag className={['ti-card', className].filter(Boolean).join(' ')}>{children}</Tag>;
}

export function WidgetSectionHeading({ id, level = 2, children }: { id?: string; level?: 2 | 3; children: ReactNode }) {
  const Tag = level === 2 ? 'h2' : 'h3';
  return <Tag id={id} className={level === 2 ? 'ti-heading' : 'ti-subheading'}>{children}</Tag>;
}

/** Labeled input with help text and error, wired with aria-describedby / aria-invalid. */
export function WidgetField(props: {
  label: string;
  required?: boolean;
  help?: string;
  error?: string;
  children: (a11y: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean; 'aria-required'?: boolean }) => ReactNode;
}) {
  const { style, t } = useWidget();
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const showHelp = !!props.help && style.content.showHelperText;
  const describedBy = [showHelp ? helpId : '', props.error ? errorId : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="ti-fields" style={{ gap: 6 }}>
      <label className="ti-label" htmlFor={id}>
        {props.label}
        {props.required ? <span className="ti-required" aria-hidden="true">*</span> : <span className="ti-helper"> ({t('common.optional')})</span>}
      </label>
      {props.children({ id, 'aria-describedby': describedBy, 'aria-invalid': props.error ? true : undefined, 'aria-required': props.required || undefined })}
      {showHelp && <p id={helpId} className="ti-helper">{props.help}</p>}
      {props.error && <p id={errorId} className="ti-field-error">{props.error}</p>}
    </div>
  );
}

export function Alert({ tone = 'info', title, children, live }: { tone?: 'info' | 'error' | 'success'; title?: string; children?: ReactNode; live?: boolean }) {
  return (
    <div className={`ti-alert ti-alert--${tone}`} role={tone === 'error' ? 'alert' : live ? 'status' : undefined}>
      {title && <strong>{title}</strong>}
      {children}
    </div>
  );
}

export function TradeInEmptyState({ title, body, action }: { title?: string; body: string; action?: ReactNode }) {
  const { t } = useWidget();
  return (
    <div className="ti-card ti-stack" style={{ alignItems: 'center', textAlign: 'center' }}>
      <p className="ti-subheading">{title ?? t('empty.title')}</p>
      <p className="ti-description">{body}</p>
      {action}
    </div>
  );
}

export function TradeInErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useWidget();
  return (
    <Alert tone="error" title={t('error.title')}>
      <p style={{ margin: '4px 0 8px' }}>{message}</p>
      {onRetry && <WidgetButton variant="secondary" onClick={onRetry}>{t('common.retry')}</WidgetButton>}
    </Alert>
  );
}

export function Loading({ label, className }: { label?: string; className?: string }) {
  const { t } = useWidget();
  return (
    <p className={['ti-helper', className].filter(Boolean).join(' ')} role="status" aria-live="polite">
      <span className="ti-button__spinner" aria-hidden="true" style={{ display: 'inline-block', marginInlineEnd: 8, verticalAlign: 'middle' }} />
      {label ?? t('common.loading')}
    </p>
  );
}

/** Title + description block honoring the per-widget content visibility settings. */
export function WidgetHeader({ id, defaultTitle, defaultDescription }: { id: string; defaultTitle: string; defaultDescription: string }) {
  const { style } = useWidget();
  const c = style.content;
  if (!c.showTitle && !c.showDescription) {
    // Keep an accessible name for the region even when the visible title is hidden.
    return <h2 id={id} className="ti-visually-hidden">{c.title || defaultTitle}</h2>;
  }
  return (
    <header className="ti-fields" style={{ gap: 6 }}>
      {c.showTitle ? <WidgetSectionHeading id={id}>{c.title || defaultTitle}</WidgetSectionHeading> : <h2 id={id} className="ti-visually-hidden">{c.title || defaultTitle}</h2>}
      {c.showDescription && <p className="ti-description">{c.description || defaultDescription}</p>}
    </header>
  );
}
