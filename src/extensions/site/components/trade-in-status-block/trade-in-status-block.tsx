import React from 'react';
import type { FC } from 'react';
import clsx from 'clsx';
import { EMBEDDED_STYLE_CONFIG, useDesignMode } from '../../../../components/editor-blocks/embedding';
import { TradeInStatusWidget } from '../../../../components/widgets/TradeInStatusWidget';
import styles from './trade-in-status-block.module.css';
import type { TradeInStatusBlockProps } from './trade-in-status-block.props';

// The title and description are editor-owned parts; the trade-in flow below them is the same
// widget the custom element renders, embedded so it skips its own header and landmark.
const TradeInStatusBlock: FC<TradeInStatusBlockProps> = (props) => {
  const { id, className, direction, title, description, elementProps } = props;
  const designMode = useDesignMode();
  const titleId = `${id}-title`;

  return (
    <section
      id={id}
      dir={direction}
      aria-labelledby={titleId}
      className={clsx('trade-in-status-block', styles.root, styles.fallbackDirection, className)}
    >
      <header className={styles.header}>
        <h2
          {...elementProps?.tradeInStatusBlockTitle}
          id={titleId}
          className={clsx('trade-in-status-block-title', styles.title, elementProps?.tradeInStatusBlockTitle?.className)}
        >
          {title}
        </h2>
        <p
          {...elementProps?.tradeInStatusBlockDescription}
          className={clsx('trade-in-status-block-description', styles.description, elementProps?.tradeInStatusBlockDescription?.className)}
        >
          {description}
        </p>
      </header>
      <div className={styles.body}>
        <TradeInStatusWidget embedded designMode={designMode} styleConfig={EMBEDDED_STYLE_CONFIG} />
      </div>
    </section>
  );
};

export default TradeInStatusBlock;
