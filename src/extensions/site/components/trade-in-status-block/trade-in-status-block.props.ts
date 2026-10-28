import type { A11y, Direction } from '@wix/editor-react-types';

export type TradeInStatusBlockProps = {
  id: string;
  className?: string;
  direction?: Direction;
  a11y?: A11y;

  title?: string;
  description?: string;

  elementProps?: {
    tradeInStatusBlockTitle?: { className?: string };
    tradeInStatusBlockDescription?: { className?: string };
  };
};

export const defaultProps = {
  title: 'Your trade-in',
  description: 'Track the progress of your trade-in.',
} as const satisfies Omit<TradeInStatusBlockProps, 'id' | 'className'>;
