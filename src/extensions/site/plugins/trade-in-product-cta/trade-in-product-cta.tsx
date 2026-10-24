import React from 'react';
import * as ReactDOM from 'react-dom/client';
import reactToWebComponent from 'react-to-webcomponent';
import { TradeInProductButtonWidget } from '../../../../components/widgets/TradeInProductButtonWidget';

// `productId` is provided by the Wix Stores product page plugin API (as the product-id
// attribute or productId property); `style-config` is the per-instance design.
export default reactToWebComponent(TradeInProductButtonWidget, React, ReactDOM, {
  props: { styleConfig: 'string', productId: 'string' },
});
