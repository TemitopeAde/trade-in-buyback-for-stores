import React, { type FC } from 'react';
import { TradeInWidgetSettingsPanel } from '../../../../components/editor/TradeInWidgetSettingsPanel';

const Panel: FC = () => (
  <TradeInWidgetSettingsPanel
    kind="status"
    defaults={{ title: 'status.title', description: 'status.description', primaryLabel: 'status.trackingSubmit', secondaryLabel: 'status.cancel' }}
  />
);

export default Panel;
