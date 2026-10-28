import React from 'react';
import type { FC } from 'react';
import clsx from 'clsx';
import { EMBEDDED_STYLE_CONFIG, useDesignMode } from '../../../../components/editor-blocks/embedding';
import { TradeInFormWidget } from '../../../../components/widgets/TradeInFormWidget';
import styles from './trade-in-form-block.module.css';
import type { TradeInFormBlockProps } from './trade-in-form-block.props';

// The title and description are editor-owned parts; the trade-in flow below them is the same
// widget the custom element renders, embedded so it skips its own header and landmark.
const TradeInFormBlock: FC<TradeInFormBlockProps> = (props) => {
  const { id, className, direction, title, description, elementProps } = props;
  const designMode = useDesignMode();
  const titleId = `${id}-title`;

  return (
    <section
      id={id}
      dir={direction}
      aria-labelledby={titleId}
      className={clsx('trade-in-form-block', styles.root, styles.fallbackDirection, className)}
    >
      <header className={styles.header}>
        <h2
          {...elementProps?.tradeInFormBlockTitle}
          id={titleId}
          className={clsx('trade-in-form-block-title', styles.title, elementProps?.tradeInFormBlockTitle?.className)}
        >
          {title}
        </h2>
        <p
          {...elementProps?.tradeInFormBlockDescription}
          className={clsx('trade-in-form-block-description', styles.description, elementProps?.tradeInFormBlockDescription?.className)}
        >
          {description}
        </p>
      </header>
      <div className={styles.body}>
        <TradeInFormWidget embedded designMode={designMode} styleConfig={EMBEDDED_STYLE_CONFIG} />
      </div>
    </section>
  );
};

export default TradeInFormBlock;
