import { extensions } from '@wix/astro/builders'
import { LAYOUT } from '@wix/react-component-schema';
import { merge, withEditorElementDefaults } from '@wix/react-component-utils';
import { editorElement } from './trade-in-form-block.generated';
import { defaultProps } from './trade-in-form-block.props';
import componentUrl from './component.tsx?url';
import componentPreviewUrl from './component.preview.tsx?url';

const editorElementWithDefaults = withEditorElementDefaults(
  editorElement,
  defaultProps
);

export default extensions.editorReactComponent({
  id: '65446131-8265-44b6-8150-06fa7f5159b6',
  type: 'trade_in_buyback_for_stores.TradeInFormBlock',
  displayName: 'Trade-in Form',
  description: 'A guided trade-in form where shoppers pick an item, answer condition questions, add photos and see a live store-credit estimate before submitting.',
  // `merge` keeps the EditorElement type (deepmerge-ts widens it to the override's shape).
  editorElement: merge(
    editorElementWithDefaults,
    {
      // The embedded widget's surface; its global class comes from the shared widget styles.
      elements: { tiRoot: { inlineElement: { displayName: 'Trade-in panel' } } },
      layout: {
        resizeDirection: LAYOUT.RESIZE_DIRECTION.horizontal,
        contentResizeDirection: LAYOUT.CONTENT_RESIZE_DIRECTION.vertical,
      },
    }
  ),
  installation: {
    staticContainer: 'HOMEPAGE',
    initialSize: {
      width: {
        sizingType: LAYOUT.SIZING_TYPE.pixels,
        pixels: 720,
      },
      height: {
        sizingType: LAYOUT.SIZING_TYPE.content,
      },
    },
  },
  resources: {
    client: {
      componentUrl,
    },
    editor: {
      componentUrl: componentPreviewUrl,
    },
  },
});
