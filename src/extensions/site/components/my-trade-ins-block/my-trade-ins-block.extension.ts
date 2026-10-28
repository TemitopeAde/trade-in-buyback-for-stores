import { extensions } from '@wix/astro/builders'
import { LAYOUT } from '@wix/react-component-schema';
import { merge, withEditorElementDefaults } from '@wix/react-component-utils';
import { editorElement } from './my-trade-ins-block.generated';
import { defaultProps } from './my-trade-ins-block.props';
import componentUrl from './component.tsx?url';
import componentPreviewUrl from './component.preview.tsx?url';

const editorElementWithDefaults = withEditorElementDefaults(
  editorElement,
  defaultProps
);

export default extensions.editorReactComponent({
  id: 'eaa81248-0164-4a9e-a67b-daec69cb11db',
  type: 'trade_in_buyback_for_stores.MyTradeInsBlock',
  displayName: 'My Trade-ins',
  description: 'Lists a signed-in member’s trade-in requests with status and credit amounts, with a shortcut to start a new trade-in. Place it on a members page.',
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
