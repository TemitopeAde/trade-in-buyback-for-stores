import React from 'react';
import type { ComponentProps, FC } from 'react';
import {
  useIsEditMode,
  withDefaults,
  withFallbackPlaceholder,
} from '@wix/react-component-utils';
import { DesignModeContext } from '../../../../components/editor-blocks/embedding';
import Component from './trade-in-status-block';
import { defaultProps } from './trade-in-status-block.props';

// In design mode the embedded widget renders sample content and makes no backend calls.
const TradeInStatusBlockPreview: FC<ComponentProps<typeof Component>> = (props) => {
  const isEditMode = useIsEditMode();
  return (
    <DesignModeContext.Provider value={isEditMode}>
      <Component {...props} />
    </DesignModeContext.Provider>
  );
};

const TradeInStatusBlockPreviewWithFallback = withFallbackPlaceholder(TradeInStatusBlockPreview, {
  requiredDataFields: ['title'],
  rootClassName: 'trade-in-status-block',
});

export default withDefaults(
  TradeInStatusBlockPreviewWithFallback,
  defaultProps
);
