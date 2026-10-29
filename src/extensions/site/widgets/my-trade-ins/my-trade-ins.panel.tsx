import React, { type FC } from 'react';
import { TradeInWidgetSettingsPanel } from '../../../../components/editor/TradeInWidgetSettingsPanel';

const Panel: FC = () => (
  <TradeInWidgetSettingsPanel kind="my-trade-ins" defaults={{ title: 'mine.title', description: 'mine.description' }} />
);

export default Panel;
