import React, { type FC } from 'react';
import { TradeInWidgetSettingsPanel } from '../../../../components/editor/TradeInWidgetSettingsPanel';

const Panel: FC = () => (
  <TradeInWidgetSettingsPanel
    kind="form"
    defaults={{ title: 'form.title', description: 'form.description', primaryLabel: 'form.submit', secondaryLabel: 'common.back' }}
  />
);

export default Panel;
