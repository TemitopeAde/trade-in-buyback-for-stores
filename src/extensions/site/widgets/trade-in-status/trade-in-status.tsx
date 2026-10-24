import React from 'react';
import * as ReactDOM from 'react-dom/client';
import reactToWebComponent from 'react-to-webcomponent';
import { TradeInStatusWidget } from '../../../../components/widgets/TradeInStatusWidget';

export default reactToWebComponent(TradeInStatusWidget, React, ReactDOM, {
  props: { styleConfig: 'string' },
});
