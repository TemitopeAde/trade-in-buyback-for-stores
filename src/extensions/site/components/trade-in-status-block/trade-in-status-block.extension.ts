import { extensions } from '@wix/astro/builders'
import { LAYOUT } from '@wix/react-component-schema';
import { merge, withEditorElementDefaults } from '@wix/react-component-utils';
import { editorElement } from './trade-in-status-block.generated';
import { defaultProps } from './trade-in-status-block.props';
import componentUrl from './component.tsx?url';
import componentPreviewUrl from './component.preview.tsx?url';

const editorElementWithDefaults = withEditorElementDefaults(
  editorElement,
  defaultProps
);

export default extensions.editorReactComponent({
  id: '28b5e576-8e8f-4aef-96c3-cff0a388475e',
  type: 'trade_in_buyback_for_stores.TradeInStatusBlock',
  displayName: 'Trade-in Status',
  description: 'Shows a shopper the live status of a submitted trade-in, its timeline and any revised offer, opened from the link in their confirmation email.',
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
        pixels: 640,
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
