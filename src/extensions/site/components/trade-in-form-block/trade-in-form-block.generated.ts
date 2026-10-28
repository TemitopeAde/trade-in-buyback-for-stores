/**
 * THIS FILE IS AUTO-GENERATED — DO NOT EDIT.
 * It contains the `editorElement` portion of the manifest, automatically derived from your component's
 * source code, prop types, and CSS rules.
 * Update your source code and run `npx wix build && npx wix generate manifest` to regenerate it.
 * If you need to override specific manifest values (sizing, layout, etc.),
 * you can do so in trade-in-form-block.extension.ts.
 */

import type { EditorElement } from '@wix/react-component-schema';

export const editorElement = {
  "selector": ".trade-in-form-block",
  "displayName": "Trade In Form Block",
  "data": {
    "direction": {
      "displayName": "Direction",
      "dataType": "direction"
    },
    "title": {
      "displayName": "Title",
      "dataType": "text",
      "text": {}
    },
    "description": {
      "displayName": "Description",
      "dataType": "text",
      "text": {}
    }
  },
  "elements": {
    "tradeInFormBlockTitle": {
      "elementType": "inlineElement",
      "inlineElement": {
        "selector": ".trade-in-form-block-title",
        "displayName": "Title",
        "behaviors": {
          "removable": true,
          "selectable": false
        },
        "cssProperties": {
          "font": {
            "defaultValue": "700 28px/1.25 'Helvetica Neue',Arial,sans-serif"
          },
          "lineHeight": {
            "defaultValue": "1.25"
          },
          "letterSpacing": {},
          "textDecorationLine": {},
          "textTransform": {},
          "textAlign": {
            "defaultValue": "start"
          },
          "textShadow": {},
          "color": {
            "defaultValue": "#111827"
          },
          "marginTop": {
            "defaultValue": "0"
          },
          "marginBottom": {
            "defaultValue": "0"
          },
          "marginInlineStart": {
            "defaultValue": "0"
          },
          "marginInlineEnd": {
            "defaultValue": "0"
          },
          "display": {
            "display": {
              "displayValues": [
                "none",
                "block"
              ]
            }
          },
          "alignSelf": {}
        }
      }
    },
    "tradeInFormBlockDescription": {
      "elementType": "inlineElement",
      "inlineElement": {
        "selector": ".trade-in-form-block-description",
        "displayName": "Description",
        "behaviors": {
          "removable": true,
          "selectable": false
        },
        "cssProperties": {
          "font": {
            "defaultValue": "16px/1.5 'Helvetica Neue',Arial,sans-serif"
          },
          "lineHeight": {
            "defaultValue": "1.5"
          },
          "letterSpacing": {},
          "textDecorationLine": {},
          "textTransform": {},
          "textAlign": {
            "defaultValue": "start"
          },
          "textShadow": {},
          "color": {
            "defaultValue": "#4b5563"
          },
          "marginTop": {
            "defaultValue": "0"
          },
          "marginBottom": {
            "defaultValue": "0"
          },
          "marginInlineStart": {
            "defaultValue": "0"
          },
          "marginInlineEnd": {
            "defaultValue": "0"
          },
          "display": {
            "display": {
              "displayValues": [
                "none",
                "block"
              ]
            }
          },
          "alignSelf": {}
        }
      }
    },
    "tiRoot": {
      "elementType": "inlineElement",
      "inlineElement": {
        "selector": ".ti-root",
        "displayName": "Ti Root",
        "behaviors": {
          "removable": true,
          "selectable": false
        },
        "cssProperties": {
          "background": {
            "defaultValue": "var(--ti-background)"
          },
          "borderTop": {},
          "borderBottom": {},
          "borderInlineStart": {},
          "borderInlineEnd": {},
          "paddingTop": {
            "defaultValue": "var(--ti-padding)"
          },
          "paddingBottom": {
            "defaultValue": "var(--ti-padding)"
          },
          "paddingInlineStart": {
            "defaultValue": "var(--ti-padding)"
          },
          "paddingInlineEnd": {
            "defaultValue": "var(--ti-padding)"
          },
          "borderStartStartRadius": {},
          "borderStartEndRadius": {},
          "borderEndStartRadius": {},
          "borderEndEndRadius": {},
          "boxShadow": {},
          "width": {},
          "height": {},
          "overflow": {},
          "mixBlendMode": {
            "defaultValue": "normal"
          },
          "marginTop": {},
          "marginBottom": {},
          "marginInlineStart": {
            "defaultValue": "var(--ti-margin-inline)"
          },
          "marginInlineEnd": {
            "defaultValue": "var(--ti-margin-inline)"
          },
          "display": {
            "display": {
              "displayValues": [
                "none",
                "block"
              ]
            }
          },
          "alignSelf": {}
        }
      }
    }
  },
  "cssProperties": {
    "background": {
      "defaultValue": "#ffffff"
    },
    "borderTop": {
      "defaultValue": "1px solid #e5e7eb"
    },
    "borderBottom": {
      "defaultValue": "1px solid #e5e7eb"
    },
    "borderInlineStart": {
      "defaultValue": "1px solid #e5e7eb"
    },
    "borderInlineEnd": {
      "defaultValue": "1px solid #e5e7eb"
    },
    "paddingTop": {
      "defaultValue": "0"
    },
    "paddingBottom": {
      "defaultValue": "0"
    },
    "paddingInlineStart": {
      "defaultValue": "0"
    },
    "paddingInlineEnd": {
      "defaultValue": "0"
    },
    "borderStartStartRadius": {
      "defaultValue": "12px"
    },
    "borderStartEndRadius": {
      "defaultValue": "12px"
    },
    "borderEndStartRadius": {
      "defaultValue": "12px"
    },
    "borderEndEndRadius": {
      "defaultValue": "12px"
    },
    "boxShadow": {},
    "overflow": {},
    "mixBlendMode": {
      "defaultValue": "normal"
    },
    "gap": {
      "defaultValue": "0"
    },
    "justifyContent": {},
    "alignItems": {}
  },
  "cssCustomProperties": {}
} as EditorElement;
