import type { A11y, Direction } from '@wix/editor-react-types';

export type MyTradeInsBlockProps = {
  id: string;
  className?: string;
  direction?: Direction;
  a11y?: A11y;

  title?: string;
  description?: string;

  elementProps?: {
    myTradeInsBlockTitle?: { className?: string };
    myTradeInsBlockDescription?: { className?: string };
  };
};

export const defaultProps = {
  title: 'My trade-ins',
  description: 'All trade-ins linked to your account.',
} as const satisfies Omit<MyTradeInsBlockProps, 'id' | 'className'>;
