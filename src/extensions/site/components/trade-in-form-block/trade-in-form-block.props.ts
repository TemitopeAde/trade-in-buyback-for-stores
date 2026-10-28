import type { A11y, Direction } from '@wix/editor-react-types';

export type TradeInFormBlockProps = {
  id: string;
  className?: string;
  direction?: Direction;
  a11y?: A11y;

  title?: string;
  description?: string;

  elementProps?: {
    tradeInFormBlockTitle?: { className?: string };
    tradeInFormBlockDescription?: { className?: string };
  };
};

export const defaultProps = {
  title: 'Trade in your item',
  description: 'Get store credit for products you no longer use. Answer a few questions to see your estimate.',
} as const satisfies Omit<TradeInFormBlockProps, 'id' | 'className'>;
