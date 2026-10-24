import React from 'react';
import * as ReactDOM from 'react-dom/client';
import reactToWebComponent from 'react-to-webcomponent';
import { MyTradeInsWidget } from '../../../../components/widgets/MyTradeInsWidget';

export default reactToWebComponent(MyTradeInsWidget, React, ReactDOM, {
  props: { styleConfig: 'string' },
});
