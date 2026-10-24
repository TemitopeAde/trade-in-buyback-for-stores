import React from 'react';
import * as ReactDOM from 'react-dom/client';
import reactToWebComponent from 'react-to-webcomponent';
import { TradeInFormWidget } from '../../../../components/widgets/TradeInFormWidget';

// `style-config` is the per-instance design saved by the settings panel (widget.setProp).
export default reactToWebComponent(TradeInFormWidget, React, ReactDOM, {
  props: { styleConfig: 'string' },
});
