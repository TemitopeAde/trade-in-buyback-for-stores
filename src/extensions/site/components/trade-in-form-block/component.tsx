// This file wires your component with its default props and exports it for use by the extension.
// Please do not modify the structure or logic of this file

import { withDefaults } from '@wix/react-component-utils';
import Component from './trade-in-form-block';
import { defaultProps } from './trade-in-form-block.props';

const TradeInFormBlock = withDefaults(
  Component,
  defaultProps
);

export default TradeInFormBlock;
