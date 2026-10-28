import React, { useId } from 'react';
import { formatMoney } from '../../../lib/money';
import type { FormConfig } from '../../../lib/schemas/api';
import type { HandoffMethod } from '../../../lib/schemas/domain';
import { useWidget } from './WidgetThemeProvider';

/** Live estimate display. The figure is informational; the server recomputes on submission. */
export function OfferSummary(props: { amountMinor?: number; currency?: string; calculating?: boolean; unavailable?: boolean }) {
  const { t, locale, style } = useWidget();
  if (!style.content.showOfferEstimate && !props.unavailable) return null;
  return (
    <div className="ti-offer" role="status" aria-live="polite">
      <span className="ti-label">{t('form.offer.estimate')}</span>
      {props.unavailable ? (
        <span>{t('form.offer.unavailable')}</span>
      ) : props.calculating || props.amountMinor === undefined || !props.currency ? (
        <span className="ti-helper">{t('form.offer.calculating')}</span>
      ) : (
        <span className="ti-offer__amount">{formatMoney(props.amountMinor, props.currency, locale)}</span>
      )}
      {style.content.showHelperText && <span className="ti-helper">{t('form.offer.estimateHelp')}</span>}
    </div>
  );
}

/** Only methods enabled in the dashboard are offered; the panel cannot add methods. */
export function HandoffMethodSelector(props: {
  methods: FormConfig['handoffMethods'];
  value?: HandoffMethod;
  error?: string;
  onChange: (m: HandoffMethod) => void;
}) {
  const { t, style } = useWidget();
  const id = useId();
  return (
    <fieldset className="ti-fields" style={{ border: 0, padding: 0, margin: 0, gap: 8 }} aria-describedby={props.error ? `${id}-e` : undefined}>
      <legend className="ti-label" style={{ marginBlockEnd: 8 }}>
        {t('form.handoff.label')}
        <span className="ti-required" aria-hidden="true">*</span>
      </legend>
      <div className="ti-choices">
        {props.methods.map(({ method }) => (
          <label key={method} className="ti-choice">
            <input type="radio" name={`${id}-handoff`} value={method} checked={props.value === method} required onChange={() => props.onChange(method)} />
            <span className="ti-choice__body">
              <span className="ti-choice__title">{t(method === 'drop_off' ? 'handoff.drop_off' : 'handoff.ship_in')}</span>
              {style.content.showHelperText && (
                <span className="ti-helper">{t(method === 'drop_off' ? 'handoff.drop_off.description' : 'handoff.ship_in.description')}</span>
              )}
            </span>
          </label>
        ))}
      </div>
      {props.error && <p id={`${id}-e`} className="ti-field-error">{props.error}</p>}
    </fieldset>
  );
}
