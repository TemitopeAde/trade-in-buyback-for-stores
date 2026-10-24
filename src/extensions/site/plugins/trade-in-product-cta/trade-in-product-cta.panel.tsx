import React, { type FC } from 'react';
import { TradeInWidgetSettingsPanel } from '../../../../components/editor/TradeInWidgetSettingsPanel';

const Panel: FC = () => <TradeInWidgetSettingsPanel kind="product-cta" defaults={{ primaryLabel: 'cta.label' }} />;

export default Panel;
