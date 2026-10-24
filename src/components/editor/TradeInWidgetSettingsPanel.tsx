import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import { info, inputs } from '@wix/editor';
import {
  Accordion,
  accordionItemBuilder,
  Box,
  Button,
  Dropdown,
  FillPreview,
  FormField,
  Input,
  InputArea,
  Loader,
  SectionHelper,
  SegmentedToggle,
  SidePanel,
  Slider,
  Text,
  TextButton,
  ToggleSwitch,
  WixDesignSystemProvider,
} from '@wix/design-system';
import '@wix/design-system/styles.global.css';
import { createTranslator, resolveLocale, type MessageKey, type Translate } from '../../lib/i18n';
import {
  applyTheme,
  CONTENT_KEYS_BY_WIDGET,
  FONT_WEIGHTS,
  fontFamilyFromShorthand,
  RANGES,
  sectionDefaults,
  TEXT_LIMITS,
  THEMES,
  themeDefaults,
  type FontWeight,
  type RangeKey,
  type StyleSection,
  type TradeInWidgetStyle,
  type WidgetKind,
} from '../../lib/style/style-config';
import { contrastWarnings } from '../../lib/style/theme-vars';
import { useWidgetStyleProp } from './useWidgetStyleProp';

// Editor settings panel shared by all trade-in widgets. Controls map 1:1 to the validated
// TradeInWidgetStyle schema; values are persisted on the selected widget instance through
// @wix/editor widget.setProp, so each instance keeps its own design. Presentation only:
// pricing, questions and hand-off methods live in the dashboard.

export type TradeInWidgetSettingsPanelProps = {
  kind: WidgetKind;
  /** Localized default texts, shown as placeholders for the overridable labels. */
  defaults: { title?: MessageKey; description?: MessageKey; primaryLabel?: MessageKey; secondaryLabel?: MessageKey };
};

type ColorKey = keyof TradeInWidgetStyle['colors'];
const COLOR_KEYS = Object.keys(themeDefaults().colors) as ColorKey[];
const CTA_COLOR_KEYS: ColorKey[] = ['primary', 'background', 'text', 'mutedText', 'buttonBackground', 'buttonText', 'buttonHoverBackground', 'buttonBorder', 'link'];

export function TradeInWidgetSettingsPanel({ kind, defaults }: TradeInWidgetSettingsPanelProps) {
  const [locale, setLocale] = useState('en');
  useEffect(() => {
    info.getLanguageCode().then((l: string) => setLocale(resolveLocale(l)), () => undefined);
  }, []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const { style, saveError, update, replace } = useWidgetStyleProp(kind);

  return (
    <WixDesignSystemProvider>
      <SidePanel width="300" height="100vh">
        <SidePanel.Header title={t('panel.title')} />
        <SidePanel.Content noPadding stretchVertically>
          {!style ? (
            <Box align="center" padding="SP4"><Loader size="small" /></Box>
          ) : (
            <PanelBody kind={kind} defaults={defaults} style={style} update={update} replace={replace} t={t} />
          )}
        </SidePanel.Content>
        <SidePanel.Footer noPadding>
          {saveError ? (
            <SectionHelper fullWidth appearance="danger" border="topBottom">{t('panel.saveError')}</SectionHelper>
          ) : (
            <SectionHelper fullWidth appearance="standard" border="topBottom">{t('panel.previewNote')}</SectionHelper>
          )}
        </SidePanel.Footer>
      </SidePanel>
    </WixDesignSystemProvider>
  );
}

type BodyProps = TradeInWidgetSettingsPanelProps & {
  style: TradeInWidgetStyle;
  update: (fn: (s: TradeInWidgetStyle) => TradeInWidgetStyle) => void;
  replace: (s: TradeInWidgetStyle) => void;
  t: Translate;
};

function PanelBody({ kind, defaults, style, update, replace, t }: BodyProps) {
  const set = <S extends StyleSection, K extends keyof TradeInWidgetStyle[S]>(section: S, key: K, value: TradeInWidgetStyle[S][K]) =>
    update((s) => ({ ...s, [section]: { ...s[section], [key]: value } }));
  const resetSection = (section: StyleSection) => update((s) => ({ ...s, [section]: sectionDefaults(s.theme, section) }));
  const isCta = kind === 'product-cta';

  const items = [
    accordionItemBuilder({ title: t('panel.section.theme'), initiallyOpen: true, children: <ThemeSection style={style} set={set} update={update} isCta={isCta} t={t} /> }),
    accordionItemBuilder({ title: t('panel.section.typography'), children: <TypographySection style={style} set={set} reset={() => resetSection('typography')} isCta={isCta} t={t} /> }),
    accordionItemBuilder({ title: t('panel.section.buttons'), children: <ButtonsSection style={style} set={set} reset={() => resetSection('buttons')} t={t} /> }),
    accordionItemBuilder({ title: t('panel.section.layout'), children: <LayoutSection style={style} set={set} reset={() => resetSection('layout')} kind={kind} t={t} /> }),
    ...(isCta ? [] : [accordionItemBuilder({ title: t('panel.section.surfaces'), children: <SurfacesSection style={style} set={set} reset={() => resetSection('surfaces')} t={t} /> })]),
    accordionItemBuilder({ title: t('panel.section.content'), children: <ContentSection style={style} set={set} reset={() => resetSection('content')} kind={kind} defaults={defaults} t={t} /> }),
    ...(kind === 'form' ? [accordionItemBuilder({ title: t('panel.section.form'), children: <FormSection style={style} set={set} t={t} /> })] : []),
    accordionItemBuilder({ title: t('panel.section.advanced'), children: <AdvancedSection replace={replace} t={t} /> }),
  ];

  return <Accordion skin="light" hideShadow size="small" multiple={false} items={items} />;
}

type SetFn = <S extends StyleSection, K extends keyof TradeInWidgetStyle[S]>(section: S, key: K, value: TradeInWidgetStyle[S][K]) => void;
type SectionProps = { style: TradeInWidgetStyle; set: SetFn; t: Translate; reset?: () => void };

// ---- Reusable controls ----------------------------------------------------------

function Group({ children, onReset, t }: { children: ReactNode; onReset?: () => void; t: Translate }) {
  return (
    <Box direction="vertical" gap="SP3" paddingBottom="SP2">
      {children}
      {onReset && <TextButton size="small" onClick={onReset}>{t('panel.resetSection')}</TextButton>}
    </Box>
  );
}

function ColorField({ label, value, onChange, t }: { label: string; value: string; onChange: (v: string) => void; t: Translate }) {
  return (
    <FormField label={label} labelPlacement="left" labelWidth="1fr" inputWidth="30px">
      <Box width="30px" height="30px">
        <FillPreview
          fill={value}
          aria-label={t('panel.color.change', { name: label })}
          onClick={() => inputs.selectColor(value, { onChange: (v) => v && onChange(v) })}
        />
      </Box>
    </FormField>
  );
}

function SliderField({ label, rangeKey, value, onChange, scale = 1, unit = 'px' }: { label: string; rangeKey: RangeKey; value: number; onChange: (v: number) => void; scale?: number; unit?: string }) {
  const [min, max] = RANGES[rangeKey];
  return (
    <FormField label={label} suffix={<Text size="small" secondary>{`${value}${unit}`}</Text>}>
      <Slider
        min={min * scale}
        max={max * scale}
        step={1}
        value={Math.round(value * scale)}
        displayMarks={false}
        ariaLabelForHandle={label}
        onChange={(v) => onChange((Array.isArray(v) ? v[0] : v) / scale)}
      />
    </FormField>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <FormField label={label}>
      <SegmentedToggle size="small" selected={value} ariaLabel={label} onClick={(_e, v) => onChange(v as T)}>
        {options.map((o) => <SegmentedToggle.Button key={o.value} value={o.value}>{o.label}</SegmentedToggle.Button>)}
      </SegmentedToggle>
    </FormField>
  );
}

function Select<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <FormField label={label}>
      <Dropdown
        size="small"
        selectedId={String(value)}
        options={options.map((o) => ({ id: String(o.value), value: o.label }))}
        onSelect={(opt) => {
          const match = options.find((o) => String(o.value) === String(opt.id));
          if (match) onChange(match.value);
        }}
      />
    </FormField>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <FormField label={label} labelPlacement="left" labelWidth="1fr" inputWidth="auto">
      <ToggleSwitch size="small" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </FormField>
  );
}

function FontField({ label, value, onChange, t }: { label: string; value: string; onChange: (v: string) => void; t: Translate }) {
  const family = value ? fontFamilyFromShorthand(value) : undefined;
  const unsupported = !!value && !family;
  return (
    <FormField label={label} statusMessage={unsupported ? t('panel.font.unsupported') : undefined} status={unsupported ? 'warning' : undefined}>
      <Box direction="vertical" gap="SP1">
        <Text size="small" secondary ellipsis>{family?.split(',')[0]?.replace(/["']/g, '') || t('panel.font.siteDefault')}</Text>
        <Box gap="SP2">
          <Button
            size="small"
            priority="secondary"
            onClick={() => inputs.selectFont(value ? { font: value, textDecoration: '' } : undefined, { onChange: (v) => v?.font && onChange(v.font) })}
          >
            {t('panel.font.change')}
          </Button>
          {value && <TextButton size="small" onClick={() => onChange('')}>{t('panel.font.siteDefault')}</TextButton>}
        </Box>
      </Box>
    </FormField>
  );
}

const weightOptions = (t: Translate) => FONT_WEIGHTS.map((w) => ({ value: w, label: t(`panel.weight.${w}`) }));

// ---- Sections --------------------------------------------------------------------

function ThemeSection({ style, set, update, isCta, t }: SectionProps & { update: BodyProps['update']; isCta: boolean }) {
  const warnings = contrastWarnings(style);
  const keys = isCta ? CTA_COLOR_KEYS : COLOR_KEYS;
  return (
    <Group t={t}>
      <Select
        label={t('panel.theme')}
        value={style.theme}
        options={THEMES.map((th) => ({ value: th, label: t(`panel.theme.${th}`) }))}
        onChange={(theme) => update((s) => applyTheme(s, theme))}
      />
      <Text size="tiny" secondary>{t('panel.theme.applyNote')}</Text>
      {keys.map((k) => (
        <ColorField key={k} label={t(`panel.color.${k}`)} value={style.colors[k]} onChange={(v) => set('colors', k, v)} t={t} />
      ))}
      {warnings.length > 0 && (
        <SectionHelper appearance="warning" title={t('panel.contrast.title')}>
          {warnings.map((w) => (
            <div key={w.pair}>{t('panel.contrast.warning', { pair: t(`panel.contrast.${w.pair}`), ratio: w.ratio, required: w.required })}</div>
          ))}
        </SectionHelper>
      )}
      <TextButton size="small" onClick={() => update((s) => ({ ...s, colors: sectionDefaults(s.theme, 'colors') }))}>{t('panel.resetToTheme')}</TextButton>
    </Group>
  );
}

function TypographySection({ style, set, reset, isCta, t }: SectionProps & { isCta: boolean }) {
  const ty = style.typography;
  return (
    <Group t={t} onReset={reset}>
      {!isCta && <FontField label={t('panel.font.heading')} value={ty.headingFont} onChange={(v) => set('typography', 'headingFont', v)} t={t} />}
      <FontField label={t('panel.font.body')} value={ty.bodyFont} onChange={(v) => set('typography', 'bodyFont', v)} t={t} />
      {!isCta && <SliderField label={t('panel.size.heading')} rangeKey="typography.headingSize" value={ty.headingSize} onChange={(v) => set('typography', 'headingSize', v)} />}
      <SliderField label={t('panel.size.body')} rangeKey="typography.bodySize" value={ty.bodySize} onChange={(v) => set('typography', 'bodySize', v)} />
      {!isCta && <SliderField label={t('panel.size.label')} rangeKey="typography.labelSize" value={ty.labelSize} onChange={(v) => set('typography', 'labelSize', v)} />}
      <SliderField label={t('panel.size.helper')} rangeKey="typography.helperSize" value={ty.helperSize} onChange={(v) => set('typography', 'helperSize', v)} />
      <SliderField label={t('panel.size.button')} rangeKey="typography.buttonSize" value={ty.buttonSize} onChange={(v) => set('typography', 'buttonSize', v)} />
      {!isCta && <Select label={t('panel.weight.heading')} value={ty.headingWeight} options={weightOptions(t)} onChange={(v) => set('typography', 'headingWeight', v as FontWeight)} />}
      <Select label={t('panel.weight.body')} value={ty.bodyWeight} options={weightOptions(t)} onChange={(v) => set('typography', 'bodyWeight', v as FontWeight)} />
      <SliderField label={t('panel.lineHeight')} rangeKey="typography.lineHeight" value={ty.lineHeight} scale={100} unit="" onChange={(v) => set('typography', 'lineHeight', v)} />
      <SliderField label={t('panel.letterSpacing')} rangeKey="typography.letterSpacing" value={ty.letterSpacing} scale={100} unit="em" onChange={(v) => set('typography', 'letterSpacing', v)} />
      {!isCta && (
        <Segmented
          label={t('panel.headingAlign')}
          value={ty.headingAlign}
          options={[{ value: 'start', label: t('panel.align.start') }, { value: 'center', label: t('panel.align.center') }]}
          onChange={(v) => set('typography', 'headingAlign', v)}
        />
      )}
    </Group>
  );
}

function ButtonsSection({ style, set, reset, t }: SectionProps) {
  const b = style.buttons;
  return (
    <Group t={t} onReset={reset}>
      <Select
        label={t('panel.button.shape')}
        value={b.shape}
        options={(['square', 'slightly-rounded', 'rounded', 'pill'] as const).map((v) => ({ value: v, label: t(`panel.button.shape.${v}`) }))}
        onChange={(v) => set('buttons', 'shape', v)}
      />
      <Segmented
        label={t('panel.button.size')}
        value={b.size}
        options={(['small', 'medium', 'large'] as const).map((v) => ({ value: v, label: t(`panel.button.size.${v}`) }))}
        onChange={(v) => set('buttons', 'size', v)}
      />
      <Toggle label={t('panel.button.fullWidth')} checked={b.fullWidth} onChange={(v) => set('buttons', 'fullWidth', v)} />
      <SliderField label={t('panel.button.borderWidth')} rangeKey="buttons.borderWidth" value={b.borderWidth} onChange={(v) => set('buttons', 'borderWidth', v)} />
      <Select label={t('panel.weight.button')} value={b.textWeight} options={weightOptions(t)} onChange={(v) => set('buttons', 'textWeight', v as FontWeight)} />
      <Select
        label={t('panel.button.hover')}
        value={b.hoverStyle}
        options={(['darken', 'lift', 'none'] as const).map((v) => ({ value: v, label: t(`panel.button.hover.${v}`) }))}
        onChange={(v) => set('buttons', 'hoverStyle', v)}
      />
      <Text size="tiny" secondary>{t('panel.button.focusNote')}</Text>
    </Group>
  );
}

function LayoutSection({ style, set, reset, kind, t }: SectionProps & { kind: WidgetKind }) {
  const l = style.layout;
  const isCta = kind === 'product-cta';
  return (
    <Group t={t} onReset={reset}>
      {!isCta && <SliderField label={t('panel.layout.maxWidth')} rangeKey="layout.maxWidth" value={l.maxWidth} onChange={(v) => set('layout', 'maxWidth', v)} />}
      {!isCta && <SliderField label={t('panel.layout.padding')} rangeKey="layout.padding" value={l.padding} onChange={(v) => set('layout', 'padding', v)} />}
      {!isCta && <SliderField label={t('panel.layout.sectionGap')} rangeKey="layout.sectionGap" value={l.sectionGap} onChange={(v) => set('layout', 'sectionGap', v)} />}
      {kind === 'form' && <SliderField label={t('panel.layout.fieldGap')} rangeKey="layout.fieldGap" value={l.fieldGap} onChange={(v) => set('layout', 'fieldGap', v)} />}
      <SliderField label={t('panel.layout.buttonGap')} rangeKey="layout.buttonGap" value={l.buttonGap} onChange={(v) => set('layout', 'buttonGap', v)} />
      <Segmented
        label={t('panel.layout.alignment')}
        value={l.alignment}
        options={[{ value: 'start', label: t('panel.align.start') }, { value: 'center', label: t('panel.align.center') }]}
        onChange={(v) => set('layout', 'alignment', v)}
      />
      {!isCta && (
        <Select
          label={t('panel.layout.cardStyle')}
          value={l.cardStyle}
          options={(['flat', 'bordered', 'elevated'] as const).map((v) => ({ value: v, label: t(`panel.layout.cardStyle.${v}`) }))}
          onChange={(v) => set('layout', 'cardStyle', v)}
        />
      )}
      {kind === 'form' && (
        <Select
          label={t('panel.layout.stepIndicator')}
          value={l.stepIndicator}
          options={(['numbers', 'progress', 'labels'] as const).map((v) => ({ value: v, label: t(`panel.layout.stepIndicator.${v}`) }))}
          onChange={(v) => set('layout', 'stepIndicator', v)}
        />
      )}
      <Text size="tiny" secondary>{t('panel.layout.mobileNote')}</Text>
    </Group>
  );
}

function SurfacesSection({ style, set, reset, t }: SectionProps) {
  const s = style.surfaces;
  return (
    <Group t={t} onReset={reset}>
      <SliderField label={t('panel.surface.radius')} rangeKey="surfaces.radius" value={s.radius} onChange={(v) => set('surfaces', 'radius', v)} />
      <Toggle label={t('panel.surface.showCardBorder')} checked={s.showCardBorder} onChange={(v) => set('surfaces', 'showCardBorder', v)} />
      <SliderField label={t('panel.surface.borderWidth')} rangeKey="surfaces.borderWidth" value={s.borderWidth} onChange={(v) => set('surfaces', 'borderWidth', v)} />
      <Select
        label={t('panel.surface.shadow')}
        value={s.shadow}
        options={(['none', 'subtle', 'medium'] as const).map((v) => ({ value: v, label: t(`panel.surface.shadow.${v}`) }))}
        onChange={(v) => set('surfaces', 'shadow', v)}
      />
      <SliderField label={t('panel.surface.inputRadius')} rangeKey="surfaces.inputRadius" value={s.inputRadius} onChange={(v) => set('surfaces', 'inputRadius', v)} />
      <SliderField label={t('panel.surface.inputBorderWidth')} rangeKey="surfaces.inputBorderWidth" value={s.inputBorderWidth} onChange={(v) => set('surfaces', 'inputBorderWidth', v)} />
      <Toggle label={t('panel.surface.showDividers')} checked={s.showDividers} onChange={(v) => set('surfaces', 'showDividers', v)} />
    </Group>
  );
}

const CONTENT_TOGGLES = ['showTitle', 'showDescription', 'showOfferEstimate', 'showStepLabels', 'showHelperText', 'showProductEstimate', 'showTimelineDetails'] as const;
const CONTENT_TEXTS = ['title', 'description', 'primaryLabel', 'secondaryLabel'] as const;

function ContentSection({ style, set, reset, kind, defaults, t }: SectionProps & { kind: WidgetKind; defaults: TradeInWidgetSettingsPanelProps['defaults'] }) {
  const allowed = new Set<string>(CONTENT_KEYS_BY_WIDGET[kind]);
  const c = style.content;
  return (
    <Group t={t} onReset={reset}>
      {CONTENT_TEXTS.filter((k) => allowed.has(k)).map((k) => {
        const def = defaults[k];
        const props = {
          size: 'small' as const,
          value: c[k],
          maxLength: TEXT_LIMITS[k],
          placeholder: def ? t('panel.content.defaultPlaceholder', { text: t(def) }) : undefined,
        };
        return (
          <FormField key={k} label={t(`panel.content.${k}`)} charCount={TEXT_LIMITS[k] - c[k].length}>
            {k === 'description'
              ? <InputArea {...props} rows={3} onChange={(e) => set('content', k, e.target.value)} />
              : <Input {...props} onChange={(e) => set('content', k, e.target.value)} />}
          </FormField>
        );
      })}
      {CONTENT_TOGGLES.filter((k) => allowed.has(k)).map((k) => (
        <Toggle key={k} label={t(`panel.content.${k}`)} checked={c[k]} onChange={(v) => set('content', k, v)} />
      ))}
      <Text size="tiny" secondary>{t('panel.content.requiredNote')}</Text>
    </Group>
  );
}

function FormSection({ style, set, t }: SectionProps) {
  return (
    <Group t={t}>
      <Toggle label={t('panel.content.showOptionalFields')} checked={style.content.showOptionalFields} onChange={(v) => set('content', 'showOptionalFields', v)} />
      <SectionHelper appearance="standard">{t('panel.form.businessNote')}</SectionHelper>
    </Group>
  );
}

function AdvancedSection({ replace, t }: { replace: (s: TradeInWidgetStyle) => void; t: Translate }) {
  // Two-step confirmation inside the panel (native dialogs can be blocked in the Editor frame).
  const [confirming, setConfirming] = useState(false);
  return (
    <Group t={t}>
      {confirming ? (
        <Box direction="vertical" gap="SP2">
          <Text size="small">{t('panel.resetAllConfirm')}</Text>
          <Box gap="SP2">
            <Button size="small" skin="destructive" onClick={() => { replace(themeDefaults()); setConfirming(false); }}>{t('panel.resetAll')}</Button>
            <Button size="small" priority="secondary" onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
          </Box>
        </Box>
      ) : (
        <Button size="small" priority="secondary" onClick={() => setConfirming(true)}>{t('panel.resetAll')}</Button>
      )}
      <Text size="tiny" secondary>{t('panel.advanced.deferred')}</Text>
    </Group>
  );
}
