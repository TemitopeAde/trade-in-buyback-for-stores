import React from 'react';
import { useWidget } from './WidgetThemeProvider';

/** Step indicator: numbers, progress bar or labels per the widget's layout setting. */
export function TradeInStepper({ steps, current }: { steps: string[]; current: number }) {
  const { style, t } = useWidget();
  const mode = style.layout.stepIndicator;
  const showLabels = style.content.showStepLabels;
  const summary = t('common.stepOf', { current: current + 1, total: steps.length });

  if (mode === 'progress') {
    const pct = Math.round(((current + 1) / steps.length) * 100);
    return (
      <div className="ti-fields" style={{ gap: 6 }}>
        <div
          className="ti-progress"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={current + 1}
          aria-valuetext={`${summary}: ${steps[current]}`}
        >
          <div className="ti-progress__bar" style={{ inlineSize: `${pct}%` }} />
        </div>
        <p className="ti-helper">{showLabels ? `${summary}: ${steps[current]}` : summary}</p>
      </div>
    );
  }

  return (
    <nav aria-label={summary}>
      <ol className="ti-stepper">
        {steps.map((label, i) => (
          <li
            key={label}
            className="ti-stepper__item"
            aria-current={i === current ? 'step' : undefined}
            data-state={i < current ? 'done' : i === current ? 'current' : 'todo'}
          >
            {mode === 'numbers' && <span className="ti-stepper__dot" aria-hidden="true">{i + 1}</span>}
            {/* Labels stay available to screen readers even when visually hidden. */}
            <span className={showLabels || mode === 'labels' ? undefined : 'ti-visually-hidden'}>{label}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
