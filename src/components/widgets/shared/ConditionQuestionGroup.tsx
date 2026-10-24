import React, { useId } from 'react';
import type { PublicQuestion } from '../../../lib/schemas/api';
import type { ConditionAnswers } from '../../../lib/schemas/domain';
import { useWidget } from './WidgetThemeProvider';

/** Merchant-defined condition questions rendered as accessible radio groups. */
export function ConditionQuestionGroup(props: {
  questions: PublicQuestion[];
  answers: ConditionAnswers;
  errors: Record<string, string>;
  onChange: (questionId: string, optionId: string) => void;
}) {
  return (
    <div className="ti-stack">
      {props.questions.map((q) => (
        <Question key={q.id} question={q} value={props.answers[q.id]} error={props.errors[q.id]} onChange={(v) => props.onChange(q.id, v)} />
      ))}
    </div>
  );
}

function Question({ question, value, error, onChange }: { question: PublicQuestion; value?: string; error?: string; onChange: (v: string) => void }) {
  const { style, t } = useWidget();
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const showHelp = !!question.helpText && style.content.showHelperText;
  return (
    <fieldset
      className="ti-fields"
      style={{ border: 0, padding: 0, margin: 0, gap: 8 }}
      aria-describedby={[showHelp ? helpId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined}
    >
      <legend className="ti-label" style={{ marginBlockEnd: 8 }}>
        {question.label}
        {question.required ? <span className="ti-required" aria-hidden="true">*</span> : <span className="ti-helper"> ({t('common.optional')})</span>}
      </legend>
      {showHelp && <p id={helpId} className="ti-helper">{question.helpText}</p>}
      <div className="ti-choices">
        {question.options.map((o) => (
          <label key={o.id} className="ti-choice">
            <input type="radio" name={`${id}-q`} value={o.id} checked={value === o.id} required={question.required} onChange={() => onChange(o.id)} />
            <span className="ti-choice__body">{o.label}</span>
          </label>
        ))}
      </div>
      {error && <p id={errorId} className="ti-field-error">{error}</p>}
    </fieldset>
  );
}
