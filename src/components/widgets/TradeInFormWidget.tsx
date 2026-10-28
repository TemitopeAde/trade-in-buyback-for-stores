import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { MessageKey } from '../../lib/i18n';
import { toPublicMediaUrl } from '../../lib/media';
import { formatMoney } from '../../lib/money';
import type { CatalogItem, EstimateResponse, FormConfig, SubmitResponse } from '../../lib/schemas/api';
import type { ConditionAnswers, HandoffMethod } from '../../lib/schemas/domain';
import { ApiClientError, errorMessageKey, widgetApi } from './shared/api';
import { ConditionQuestionGroup } from './shared/ConditionQuestionGroup';
import { currentMemberEmail, newIdempotencyKey, readQueryParam, useSiteEnv } from './shared/env';
import { PhotoUploader, UploadChecklist, UploadRejections, VideoUploader } from './shared/Evidence';
import { HandoffMethodSelector, OfferSummary } from './shared/Offer';
import { Alert, Loading, TradeInErrorState, WidgetButton, WidgetCard, WidgetField, WidgetHeader } from './shared/primitives';
import { ProductPicker } from './shared/ProductPicker';
import { TradeInStepper } from './shared/TradeInStepper';
import { useUploads } from './shared/useUploads';
import { useWidget, WidgetThemeProvider } from './shared/WidgetThemeProvider';
import { TradeInStatusView } from './TradeInStatusWidget';

export type TradeInFormWidgetProps = {
  styleConfig?: string | null;
  catalogLayout?: 'grid' | 'table';
  embedded?: boolean;
  designMode?: boolean;
};

// `embedded`: rendered inside an Editor React component, which owns the title, description and
// region landmark. `designMode`: the host knows it is in Editor design mode, so show the preview.
export function TradeInFormWidget({ styleConfig, catalogLayout, embedded, designMode }: TradeInFormWidgetProps) {
  const env = useSiteEnv();
  const isEditor = !!designMode || env.isEditor;
  return (
    <WidgetThemeProvider
      styleConfig={styleConfig}
      locale={env.locale}
      isEditor={isEditor}
      as={embedded ? 'div' : 'section'}
      hostHeader={embedded}
      labelledBy={embedded ? undefined : 'ti-form-title'}
    >
      {!env.ready && !designMode ? null : isEditor ? <FormEditorPreview /> : <FormFlow catalogLayout={catalogLayout} />}
    </WidgetThemeProvider>
  );
}

// ---- State -------------------------------------------------------------------------

type Contact = { name: string; email: string; phone: string };
type State = {
  step: number;
  item?: CatalogItem;
  config?: FormConfig;
  configLoading: boolean;
  answers: ConditionAnswers;
  handoff?: HandoffMethod;
  contact: Contact;
  acceptTerms: boolean;
};
type Action =
  | { type: 'select'; item: CatalogItem }
  | { type: 'enrich_item'; item: Partial<CatalogItem> }
  | { type: 'config'; config?: FormConfig; loading: boolean }
  | { type: 'answer'; questionId: string; optionId: string }
  | { type: 'handoff'; value: HandoffMethod }
  | { type: 'contact'; field: keyof Contact; value: string }
  | { type: 'prefill_email'; email: string }
  | { type: 'terms'; value: boolean }
  | { type: 'step'; step: number }
  | { type: 'reset' };

const initial: State = { step: 0, configLoading: false, answers: {}, contact: { name: '', email: '', phone: '' }, acceptTerms: false };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'select':
      // A different product invalidates answers (questions differ per rule); other input is kept.
      return { ...state, item: action.item, answers: state.item?.productId === action.item.productId ? state.answers : {}, config: undefined };
    case 'enrich_item':
      return { ...state, item: state.item ? { ...state.item, ...action.item } : undefined };
    case 'config': {
      const methods = action.config?.handoffMethods ?? [];
      const handoff = state.handoff && methods.some((m) => m.method === state.handoff) ? state.handoff : methods.length === 1 ? methods[0].method : undefined;
      return { ...state, config: action.config, configLoading: action.loading, handoff };
    }
    case 'answer':
      return { ...state, answers: { ...state.answers, [action.questionId]: action.optionId } };
    case 'handoff':
      return { ...state, handoff: action.value };
    case 'prefill_email':
      return state.contact.email ? state : { ...state, contact: { ...state.contact, email: action.email } };
    case 'contact':
      return { ...state, contact: { ...state.contact, [action.field]: action.value } };
    case 'terms':
      return { ...state, acceptTerms: action.value };
    case 'step':
      return { ...state, step: action.step };
    case 'reset':
      return initial;
  }
}

type Issue = { key: MessageKey; vars?: Record<string, string | number>; field?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---- Flow --------------------------------------------------------------------------

export function FormFlow({
  initialProductId,
  onClose,
  isModal = false,
  catalogLayout,
}: {
  initialProductId?: string;
  onClose?: () => void;
  isModal?: boolean;
  catalogLayout?: 'grid' | 'table';
} = {}) {
  const { t, style, locale } = useWidget();
  const [state, dispatch] = useReducer(reducer, initial);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [estimate, setEstimate] = useState<EstimateResponse>();
  const [estimating, setEstimating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [result, setResult] = useState<SubmitResponse>();
  const [configError, setConfigError] = useState<string>();
  // One key per submission attempt: retries after a network error replay instead of duplicating.
  const submissionKey = useRef(newIdempotencyKey());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const uploads = useUploads(state.config?.media.videoMaxSeconds ?? 60);

  const steps = [t('form.step.item'), t('form.step.condition'), t('form.step.evidence'), t('form.step.offer')];
  // Without uploads on the store's plan the evidence step (index 2) is skipped; step numbers stay
  // the same internally and only the stepper shows three steps.
  const skipEvidence = state.config?.uploads === false;
  const shownSteps = skipEvidence ? steps.filter((_, i) => i !== 2) : steps;
  const shownCurrent = skipEvidence && state.step > 2 ? state.step - 1 : state.step;

  // Prefill from initialProductId or ?product= (e.g. from the product page CTA). Still verified by the server.
  useEffect(() => {
    const pid = initialProductId || readQueryParam('product');
    if (pid && /^[A-Za-z0-9-]{1,64}$/.test(pid)) dispatch({ type: 'select', item: { productId: pid, title: '', source: 'catalog' } });
  }, [initialProductId]);

  // Prefill the email for signed-in members; anything the visitor already typed wins.
  useEffect(() => {
    let alive = true;
    currentMemberEmail().then((email) => {
      if (alive && email) dispatch({ type: 'prefill_email', email });
    });
    return () => {
      alive = false;
    };
  }, []);

  const productId = state.item?.productId;
  const loadConfig = () => {
    if (!productId) return;
    setConfigError(undefined);
    dispatch({ type: 'config', loading: true });
    widgetApi.formConfig(productId).then(
      (config) => {
        dispatch({ type: 'config', config, loading: false });
        if (config.eligible && config.product) {
          dispatch({
            type: 'enrich_item',
            item: {
              title: config.product.title,
              imageUrl: toPublicMediaUrl(config.product.imageUrl),
            },
          });
        }
      },
      (err) => {
        dispatch({ type: 'config', loading: false });
        setConfigError(t(errorMessageKey(err)));
      },
    );
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadConfig, [productId]);

  // Live estimate (debounced). Display only — the server recomputes at submission.
  useEffect(() => {
    if (!productId || !state.config?.eligible) return;
    setEstimating(true);
    const timer = setTimeout(() => {
      widgetApi.estimate(productId, state.answers).then(setEstimate, () => setEstimate(undefined)).finally(() => setEstimating(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [productId, state.config?.eligible, state.answers]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [state.step]);

  const config = state.config;
  const photos = uploads.items.filter((i) => i.kind === 'photo');
  const videos = uploads.items.filter((i) => i.kind === 'video');
  const usable = (i: { status: string }) => i.status === 'ready' || i.status === 'processing';

  const validateStep = (step: number): Issue[] => {
    const out: Issue[] = [];
    if (step === 0) {
      if (!state.item || !config) out.push({ key: 'validation.selectItem' });
      else if (!config.eligible) out.push({ key: 'form.item.notEligible' });
      else if (config.accepting === false) out.push({ key: 'form.notAccepting' });
    }
    if (step === 1 && config) {
      for (const q of config.questions) {
        if (q.required && !state.answers[q.id]) out.push({ key: 'validation.answerQuestion', vars: { question: q.label }, field: q.id });
      }
      if (estimate && !estimate.eligible) out.push({ key: 'form.offer.unavailable' });
    }
    if (step === 2 && config && !skipEvidence) {
      if (uploads.items.some((i) => i.status === 'uploading')) out.push({ key: 'validation.uploadsInProgress' });
      if (photos.filter(usable).length < config.media.photoMinimum) out.push({ key: 'validation.photosMin', vars: { count: config.media.photoMinimum } });
      if (config.media.videoMode === 'required' && !videos.some(usable)) out.push({ key: 'validation.videoRequired' });
    }
    if (step === 3) {
      if (!state.handoff) out.push({ key: 'validation.handoff', field: 'handoff' });
      if (!state.contact.name.trim()) out.push({ key: 'validation.required', vars: { field: t('form.contact.name') }, field: 'name' });
      if (!EMAIL_RE.test(state.contact.email.trim())) out.push({ key: 'validation.email', field: 'email' });
      if (!state.acceptTerms) out.push({ key: 'validation.terms', field: 'terms' });
    }
    return out;
  };

  const showIssues = (found: Issue[]) => {
    setIssues(found);
    // The visible summary takes focus (scrolling it into view, also inside the drawer) and is
    // announced once; it stays until the issues are fixed.
    if (found.length) requestAnimationFrame(() => summaryRef.current?.focus());
  };

  const next = () => {
    const found = validateStep(state.step);
    showIssues(found);
    if (!found.length) dispatch({ type: 'step', step: skipEvidence && state.step === 1 ? 3 : state.step + 1 });
  };
  const back = () => {
    setIssues([]);
    dispatch({ type: 'step', step: skipEvidence && state.step === 3 ? 1 : Math.max(0, state.step - 1) });
  };

  const submit = async () => {
    const found = [0, 1, 2, 3].flatMap(validateStep);
    showIssues(found);
    if (found.length || !state.item || !state.handoff || submitting) return;
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      const res = await widgetApi.submit({
        submissionKey: submissionKey.current,
        productId: state.item.productId,
        orderId: state.item.orderId,
        answers: state.answers,
        uploadSessionId: uploads.uploadSessionId(),
        mediaIds: uploads.items.filter(usable).map((i) => i.mediaId!).filter(Boolean),
        handoffMethod: state.handoff,
        contact: { name: state.contact.name.trim(), email: state.contact.email.trim(), phone: state.contact.phone.trim() || undefined },
        acceptTerms: true,
        locale,
      });
      setResult(res);
    } catch (err) {
      // Validation failures mean the input must change, so the next attempt gets a new key.
      if (err instanceof ApiClientError && err.status === 400) submissionKey.current = newIdempotencyKey();
      setSubmitError(t(submitErrorKey(err)));
    } finally {
      setSubmitting(false);
    }
  };

  const fieldError = (field: string) => {
    const issue = issues.find((i) => i.field === field);
    return issue ? t(issue.key, issue.vars) : undefined;
  };

  if (result) return <SubmissionSuccess result={result} statusPageUrl={config?.statusPageUrl} onAnother={() => { setResult(undefined); submissionKey.current = newIdempotencyKey(); dispatch({ type: 'reset' }); }} />;

  return (
    <div className="ti-stack">
      <WidgetHeader id="ti-form-title" defaultTitle={t('form.title')} defaultDescription={t('form.description')} />
      <TradeInStepper steps={shownSteps} current={shownCurrent} />

      <div ref={summaryRef} tabIndex={-1} style={{ outline: 'none' }}>
        {issues.length > 0 && (
          <Alert tone="error" title={t('form.errorSummary')}>
            <ul>{issues.map((i, n) => <li key={n}>{t(i.key, i.vars)}</li>)}</ul>
          </Alert>
        )}
      </div>

      <WidgetCard as="section">
        <div className="ti-stack">
          <h3 ref={headingRef} tabIndex={-1} className="ti-subheading" style={{ outline: 'none' }}>{steps[state.step]}</h3>

          {state.step === 0 && (
            <>
              <ProductPicker
                selected={state.item}
                onSelect={(item) => dispatch({ type: 'select', item })}
                layout={catalogLayout ?? (isModal ? 'table' : 'grid')}
              />
              {state.configLoading && <Loading />}
              {configError && <TradeInErrorState message={configError} onRetry={loadConfig} />}
              {config && !config.eligible && <Alert tone="info">{t('form.item.notEligible')}</Alert>}
              {config?.eligible && config.accepting === false && <Alert tone="info">{t('form.notAccepting')}</Alert>}
              {config?.eligible && config.product && (
                <p className="ti-helper" role="status">
                  {t('form.item.selected')}: <strong>{config.product.title}</strong>
                </p>
              )}
            </>
          )}

          {state.step > 0 && config?.product && (
            <div className="ti-selected-item-banner">
              {toPublicMediaUrl(config.product.imageUrl) ? (
                <img
                  className="ti-selected-item-banner__image"
                  src={toPublicMediaUrl(config.product.imageUrl)}
                  alt=""
                  loading="lazy"
                />
              ) : null}
              <div className="ti-selected-item-banner__info">
                <span className="ti-selected-item-banner__label">{t('form.item.selected')}</span>
                <strong className="ti-selected-item-banner__title">{config.product.title}</strong>
              </div>
            </div>
          )}

          {state.step === 1 && config && (
            <>
              {style.content.showHelperText && <p className="ti-helper">{t('form.condition.help')}</p>}
              <ConditionQuestionGroup
                questions={config.questions}
                answers={state.answers}
                errors={Object.fromEntries(issues.filter((i) => i.field).map((i) => [i.field!, t(i.key, i.vars)]))}
                onChange={(questionId, optionId) => dispatch({ type: 'answer', questionId, optionId })}
              />
              <OfferSummary
                calculating={estimating}
                unavailable={estimate?.eligible === false}
                amountMinor={estimate?.eligible ? estimate.offerMinor : undefined}
                currency={estimate?.eligible ? estimate.currency : undefined}
              />
            </>
          )}

          {state.step === 2 && config && (
            <>
              <UploadChecklist
                photosReady={photos.filter(usable).length}
                photoMinimum={config.media.photoMinimum}
                videoMode={config.media.videoMode}
                videoReady={videos.some(usable)}
              />
              <UploadRejections issues={uploads.rejections} />
              <PhotoUploader minimum={config.media.photoMinimum} items={photos} onAdd={(f) => uploads.add('photo', f)} onRetry={uploads.retry} onRemove={uploads.remove} />
              <VideoUploader mode={config.media.videoMode} maxSeconds={config.media.videoMaxSeconds} items={videos} onAdd={(f) => uploads.add('video', f)} onRetry={uploads.retry} onRemove={uploads.remove} />
            </>
          )}

          {state.step === 3 && config && (
            <>
              <OfferSummary amountMinor={estimate?.eligible ? estimate.offerMinor : undefined} currency={estimate?.eligible ? estimate.currency : undefined} unavailable={estimate?.eligible === false} />
              <HandoffMethodSelector methods={config.handoffMethods} value={state.handoff} error={fieldError('handoff')} onChange={(value) => dispatch({ type: 'handoff', value })} />
              <div className="ti-fields">
                <WidgetField label={t('form.contact.name')} required error={fieldError('name')}>
                  {(a11y) => <input {...a11y} className="ti-input" autoComplete="name" value={state.contact.name} onChange={(e) => dispatch({ type: 'contact', field: 'name', value: e.target.value })} maxLength={120} />}
                </WidgetField>
                <WidgetField label={t('form.contact.email')} required help={t('form.contact.emailHelp')} error={fieldError('email')}>
                  {(a11y) => <input {...a11y} className="ti-input" type="email" autoComplete="email" value={state.contact.email} onChange={(e) => dispatch({ type: 'contact', field: 'email', value: e.target.value })} maxLength={200} />}
                </WidgetField>
                {style.content.showOptionalFields && (
                  <WidgetField label={t('form.contact.phone')}>
                    {(a11y) => <input {...a11y} className="ti-input" type="tel" autoComplete="tel" value={state.contact.phone} onChange={(e) => dispatch({ type: 'contact', field: 'phone', value: e.target.value })} maxLength={40} />}
                  </WidgetField>
                )}
              </div>
              <TermsField text={config.termsText} checked={state.acceptTerms} error={fieldError('terms')} onChange={(value) => dispatch({ type: 'terms', value })} />
              {submitError && <Alert tone="error">{submitError}</Alert>}
            </>
          )}

          <hr className="ti-divider" />
          <div className="ti-row ti-row--between">
            {state.step > 0 ? <WidgetButton variant="secondary" onClick={back} disabled={submitting}>{style.content.secondaryLabel || t('common.back')}</WidgetButton> : <span />}
            {state.step < 3 ? (
              <WidgetButton onClick={next} disabled={state.configLoading}>{t('common.next')}</WidgetButton>
            ) : (
              <WidgetButton onClick={submit} busy={submitting}>{style.content.primaryLabel || t('form.submit')}</WidgetButton>
            )}
          </div>
        </div>
      </WidgetCard>
    </div>
  );
}

function submitErrorKey(err: unknown): MessageKey {
  if (err instanceof ApiClientError && err.status === 400) {
    const f = err.fields ?? {};
    if (f.media === 'photos_min') return 'validation.photosMin';
    if (f.media === 'video_required') return 'validation.videoRequired';
    if (f.answers) return 'form.offer.unavailable';
    if (f.handoffMethod) return 'validation.handoff';
    if (f.form === 'not_accepting') return 'form.notAccepting';
  }
  return errorMessageKey(err);
}

function TermsField({ text, checked, error, onChange }: { text: string; checked: boolean; error?: string; onChange: (v: boolean) => void }) {
  const { t } = useWidget();
  // Legal terms are never hidden by appearance settings.
  return (
    <div className="ti-fields" style={{ gap: 6 }}>
      {text && (
        <details>
          <summary className="ti-button ti-button--link">{t('form.terms.show')}</summary>
          <p className="ti-helper" style={{ whiteSpace: 'pre-wrap' }}>{text}</p>
        </details>
      )}
      <label className="ti-choice">
        <input type="checkbox" checked={checked} required aria-invalid={error ? true : undefined} aria-describedby={error ? 'ti-terms-error' : undefined} onChange={(e) => onChange(e.target.checked)} />
        <span className="ti-choice__body">{t('form.terms.accept')}<span className="ti-required" aria-hidden="true">*</span></span>
      </label>
      {error && <p id="ti-terms-error" className="ti-field-error">{error}</p>}
    </div>
  );
}

function SubmissionSuccess({ result, statusPageUrl, onAnother }: { result: SubmitResponse; statusPageUrl?: string; onAnother: () => void }) {
  const { t } = useWidget();
  const statusHref = useMemo(() => {
    if (!statusPageUrl) return undefined;
    try {
      const url = new URL(statusPageUrl);
      url.searchParams.set('ti', result.accessToken);
      return url.toString();
    } catch {
      return undefined;
    }
  }, [statusPageUrl, result.accessToken]);
  return (
    <div className="ti-stack">
      <Alert tone="success" title={t('form.success.title')} live>
        <p style={{ margin: '6px 0 0' }}>{t('form.success.body', { reference: result.reference })}</p>
      </Alert>
      {statusHref ? (
        <div className="ti-row">
          <a className="ti-button ti-button--primary" href={statusHref}>{t('form.success.viewStatus')}</a>
          <WidgetButton variant="secondary" onClick={onAnother}>{t('form.success.another')}</WidgetButton>
        </div>
      ) : (
        <>
          <TradeInStatusView accessToken={result.accessToken} />
          <WidgetButton variant="secondary" onClick={onAnother}>{t('form.success.another')}</WidgetButton>
        </>
      )}
    </div>
  );
}

/** Editor-only preview: shows every styled element with neutral sample content, no data calls. */
export function FormEditorPreview() {
  const { t, style, locale } = useWidget();
  const steps = [t('form.step.item'), t('form.step.condition'), t('form.step.evidence'), t('form.step.offer')];
  return (
    <div className="ti-stack">
      <WidgetHeader id="ti-form-title" defaultTitle={t('form.title')} defaultDescription={t('form.description')} />
      <TradeInStepper steps={steps} current={1} />
      <WidgetCard as="section">
        <div className="ti-stack">
          <h3 className="ti-subheading">{steps[1]}</h3>
          {style.content.showHelperText && <p className="ti-helper">{t('form.condition.help')}</p>}
          <ConditionQuestionGroup
            questions={[{ id: 'preview', label: t('preview.question'), helpText: t('preview.questionHelp'), required: true, options: [{ id: 'a', label: t('preview.optionA') }, { id: 'b', label: t('preview.optionB') }] }]}
            answers={{ preview: 'a' }}
            errors={{}}
            onChange={() => undefined}
          />
          <WidgetField label={t('form.contact.email')} required help={t('form.contact.emailHelp')}>
            {(a11y) => <input {...a11y} className="ti-input" readOnly value="" />}
          </WidgetField>
          <div className="ti-offer">
            <span className="ti-label">{t('form.offer.estimate')}</span>
            <span className="ti-offer__amount">{formatMoney(12000, 'USD', locale)}</span>
          </div>
          <Alert tone="info">{t('common.editorPlaceholder')}</Alert>
          <hr className="ti-divider" />
          <div className="ti-row ti-row--between">
            <WidgetButton variant="secondary">{style.content.secondaryLabel || t('common.back')}</WidgetButton>
            <WidgetButton>{style.content.primaryLabel || t('common.next')}</WidgetButton>
          </div>
        </div>
      </WidgetCard>
    </div>
  );
}
