// This file wires your component with its default props and exports it for use by the extension.
// Please do not modify the structure or logic of this file

import { withDefaults } from '@wix/react-component-utils';
import Component from './my-trade-ins-block';
import { defaultProps } from './my-trade-ins-block.props';

const MyTradeInsBlock = withDefaults(
  Component,
  defaultProps
);

export default MyTradeInsBlock;
