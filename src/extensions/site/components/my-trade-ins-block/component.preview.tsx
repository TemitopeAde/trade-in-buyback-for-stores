import React from 'react';
import type { ComponentProps, FC } from 'react';
import {
  useIsEditMode,
  withDefaults,
  withFallbackPlaceholder,
} from '@wix/react-component-utils';
import { DesignModeContext } from '../../../../components/editor-blocks/embedding';
import Component from './my-trade-ins-block';
import { defaultProps } from './my-trade-ins-block.props';

// In design mode the embedded widget renders sample content and makes no backend calls.
const MyTradeInsBlockPreview: FC<ComponentProps<typeof Component>> = (props) => {
  const isEditMode = useIsEditMode();
  return (
    <DesignModeContext.Provider value={isEditMode}>
      <Component {...props} />
    </DesignModeContext.Provider>
  );
};

const MyTradeInsBlockPreviewWithFallback = withFallbackPlaceholder(MyTradeInsBlockPreview, {
  requiredDataFields: ['title'],
  rootClassName: 'my-trade-ins-block',
});

export default withDefaults(
  MyTradeInsBlockPreviewWithFallback,
  defaultProps
);
