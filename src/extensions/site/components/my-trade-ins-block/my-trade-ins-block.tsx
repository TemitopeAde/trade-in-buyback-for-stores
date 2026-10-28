import React from 'react';
import type { FC } from 'react';
import clsx from 'clsx';
import { EMBEDDED_STYLE_CONFIG, useDesignMode } from '../../../../components/editor-blocks/embedding';
import { MyTradeInsWidget } from '../../../../components/widgets/MyTradeInsWidget';
import styles from './my-trade-ins-block.module.css';
import type { MyTradeInsBlockProps } from './my-trade-ins-block.props';

// The title and description are editor-owned parts; the trade-in flow below them is the same
// widget the custom element renders, embedded so it skips its own header and landmark.
const MyTradeInsBlock: FC<MyTradeInsBlockProps> = (props) => {
  const { id, className, direction, title, description, elementProps } = props;
  const designMode = useDesignMode();
  const titleId = `${id}-title`;

  return (
    <section
      id={id}
      dir={direction}
      aria-labelledby={titleId}
      className={clsx('my-trade-ins-block', styles.root, styles.fallbackDirection, className)}
    >
      <header className={styles.header}>
        <h2
          {...elementProps?.myTradeInsBlockTitle}
          id={titleId}
          className={clsx('my-trade-ins-block-title', styles.title, elementProps?.myTradeInsBlockTitle?.className)}
        >
          {title}
        </h2>
        <p
          {...elementProps?.myTradeInsBlockDescription}
          className={clsx('my-trade-ins-block-description', styles.description, elementProps?.myTradeInsBlockDescription?.className)}
        >
          {description}
        </p>
      </header>
      <div className={styles.body}>
        <MyTradeInsWidget embedded designMode={designMode} styleConfig={EMBEDDED_STYLE_CONFIG} />
      </div>
    </section>
  );
};

export default MyTradeInsBlock;
