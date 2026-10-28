import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import { application, info, inputs } from '@wix/editor';
import {
  APP_ID,
  getPlanEntitlements,
  getUpgradeUrl,
  normalizePlanTier,
  type InstancePlanStatus,
  type PlanEntitlements,
  type PlanTier,
} from '../../lib/plans';
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
  fontFamilyFromShorthand,
  RANGES,
  resetText,
  resetTextElement,
  sectionDefaults,
  TEXT_COLOR_KEYS,
  TEXT_ELEMENTS,
  TEXT_LIMITS,
  THEMES,
  themeDefaults,
  type RangeKey,
  type StyleSection,
  type TextElement,
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
  planStatusOverride?: Partial<InstancePlanStatus>;
};

type ColorKey = keyof TradeInWidgetStyle['colors'];
// Text colors are set per element in the Text section; the theme section keeps the rest.
const THEME_COLOR_KEYS = (Object.keys(themeDefaults().colors) as ColorKey[]).filter((k) => !TEXT_COLOR_KEYS.includes(k));
const TEXT_ELEMENT_KEYS = Object.keys(TEXT_ELEMENTS) as TextElement[];

export function TradeInWidgetSettingsPanel({ kind, defaults, planStatusOverride }: TradeInWidgetSettingsPanelProps) {
  const [locale, setLocale] = useState('en');
  const [planStatus, setPlanStatus] = useState<InstancePlanStatus>(() => ({
    appId: planStatusOverride?.appId || APP_ID,
    instanceId: planStatusOverride?.instanceId || '',
    plan: planStatusOverride?.plan || 'basic',
    isFree: planStatusOverride?.isFree !== false,
    freeTrialAvailable: planStatusOverride?.freeTrialAvailable ?? true,
    upgradeUrl: planStatusOverride?.upgradeUrl || getUpgradeUrl(planStatusOverride?.appId || APP_ID, planStatusOverride?.instanceId),
    entitlements: planStatusOverride?.entitlements || getPlanEntitlements(planStatusOverride?.plan || 'basic'),
  }));

  useEffect(() => {
    info.getLanguageCode().then((l: string) => setLocale(resolveLocale(l)), () => undefined);
  }, []);

  useEffect(() => {
    if (planStatusOverride) return;
    let active = true;
    async function loadPlan() {
      try {
        if (typeof application?.getAppInstance === 'function') {
          const raw = await application.getAppInstance();
          let parsed: any;
          if (typeof raw === 'string' && raw.includes('.')) {
            const payload = raw.split('.')[1];
            const decoded = typeof atob === 'function' ? atob(payload) : '';
            if (decoded) parsed = JSON.parse(decoded);
          } else if (typeof raw === 'object' && raw !== null) {
            parsed = raw;
          }
          const instanceId = parsed?.instanceId || '';
          const appId = parsed?.appDefId || APP_ID;
          const isFree = parsed?.isFree !== false;
          const plan: PlanTier = isFree ? 'basic' : normalizePlanTier(parsed?.billing?.packageName ?? 'pro');
          if (active) {
            setPlanStatus({
              appId,
              instanceId,
              plan,
              isFree,
              freeTrialAvailable: isFree,
              upgradeUrl: getUpgradeUrl(appId, instanceId),
              entitlements: getPlanEntitlements(plan),
            });
          }
        }
      } catch {
        // default to basic
      }
    }
    void loadPlan();
    return () => { active = false; };
  }, [planStatusOverride]);

  const t = useMemo(() => createTranslator(locale), [locale]);
  const { style, saveError, update, replace } = useWidgetStyleProp(kind);
  const isBasic = planStatus.plan === 'basic';

  return (
    <WixDesignSystemProvider>
      <SidePanel width="300" height="100vh">
        <SidePanel.Header
          title={t('panel.title')}
          suffix={
            isBasic ? (
              <Button
                size="tiny"
                skin="premium"
                priority="primary"
                onClick={() => window.open(planStatus.upgradeUrl, '_blank', 'noopener,noreferrer')}
              >
                {t('panel.startTrial')}
              </Button>
            ) : undefined
          }
        />
        <SidePanel.Content noPadding stretchVertically>
          {!style ? (
            <Box align="center" padding="SP4"><Loader size="small" /></Box>
          ) : (
            <PanelBody
              kind={kind}
              defaults={defaults}
              style={style}
              update={update}
              replace={replace}
              t={t}
              entitlements={planStatus.entitlements}
              isBasic={isBasic}
            />
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
  entitlements: PlanEntitlements;
  isBasic: boolean;
};

function PanelBody({ kind, defaults, style, update, replace, t, entitlements, isBasic }: BodyProps) {
  const set = <S extends StyleSection, K extends keyof TradeInWidgetStyle[S]>(section: S, key: K, value: TradeInWidgetStyle[S][K]) =>
    update((s) => ({ ...s, [section]: { ...s[section], [key]: value } }));
  const resetSection = (section: StyleSection) => update((s) => ({ ...s, [section]: sectionDefaults(s.theme, section, kind) }));
  const isCta = kind === 'product-cta';

  const items = [
    accordionItemBuilder({
      title: t('panel.section.theme'),
      initiallyOpen: true,
      children: (
        <ThemeSection
          style={style}
          set={set}
          update={update}
          isCta={isCta}
          t={t}
          disabledCustom={!entitlements.advancedStyling}
        />
      ),
    }),
    accordionItemBuilder({
      title: t('panel.section.typography'),
      children: (
        <TextSection
          style={style}
          set={set}
          update={update}
          kind={kind}
          t={t}
          disabledCustom={!entitlements.advancedStyling}
        />
      ),
    }),
    accordionItemBuilder({ title: t('panel.section.buttons'), children: <ButtonsSection style={style} set={set} reset={() => resetSection('buttons')} t={t} /> }),
    accordionItemBuilder({ title: t('panel.section.layout'), children: <LayoutSection style={style} set={set} reset={() => resetSection('layout')} kind={kind} t={t} /> }),
    accordionItemBuilder({ title: t('panel.section.surfaces'), children: <SurfacesSection style={style} set={set} reset={() => resetSection('surfaces')} t={t} /> }),
    accordionItemBuilder({ title: t('panel.section.content'), children: <ContentSection style={style} set={set} reset={() => resetSection('content')} kind={kind} defaults={defaults} t={t} /> }),
    ...(kind === 'form' ? [accordionItemBuilder({ title: t('panel.section.form'), children: <FormSection style={style} set={set} t={t} /> })] : []),
    accordionItemBuilder({
      title: t('panel.section.advanced'),
      children: (
        <AdvancedSection
          replace={replace}
          t={t}
          disabled={!entitlements.advancedStyling}
        />
      ),
    }),
  ];

  return <Accordion skin="light" hideShadow size="small" multiple={false} items={items} />;
}

type SetFn = <S extends StyleSection, K extends keyof TradeInWidgetStyle[S]>(section: S, key: K, value: TradeInWidgetStyle[S][K]) => void;
type SectionProps = { style: TradeInWidgetStyle; set: SetFn; t: Translate; reset?: () => void; disabledCustom?: boolean };

// ---- Reusable controls ----------------------------------------------------------

function Group({ children, onReset, t }: { children: ReactNode; onReset?: () => void; t: Translate }) {
  return (
    <Box direction="vertical" gap="SP3" paddingBottom="SP2">
      {children}
      {onReset && <TextButton size="small" onClick={onReset}>{t('panel.resetSection')}</TextButton>}
    </Box>
  );
}

function ColorField({ label, name = label, value, onChange, t, disabled, tooltip }: { label: string; name?: string; value: string; onChange: (v: string) => void; t: Translate; disabled?: boolean; tooltip?: string }) {
  return (
    <FormField label={label} labelPlacement="left" labelWidth="1fr" inputWidth="30px" statusMessage={tooltip} status={disabled ? 'warning' : undefined}>
      <Box width="30px" height="30px">
        <FillPreview
          fill={value}
          aria-label={t('panel.color.change', { name })}
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            inputs.selectColor(value, { onChange: (v) => v && onChange(v) });
          }}
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

function FontField({ label, value, onChange, t, disabled, tooltip }: { label: string; value: string; onChange: (v: string) => void; t: Translate; disabled?: boolean; tooltip?: string }) {
  const family = value ? fontFamilyFromShorthand(value) : undefined;
  const unsupported = !!value && !family;
  return (
    <FormField label={label} statusMessage={disabled ? tooltip : unsupported ? t('panel.font.unsupported') : undefined} status={disabled ? 'warning' : unsupported ? 'warning' : undefined}>
      <Box direction="vertical" gap="SP1">
        <Text size="small" secondary ellipsis>{family?.split(',')[0]?.replace(/["']/g, '') || t('panel.font.siteDefault')}</Text>
        <Box gap="SP2">
          <Button
            size="small"
            priority="secondary"
            disabled={disabled}
            title={tooltip}
            onClick={() => {
              if (disabled) return;
              inputs.selectFont(value ? { font: value, textDecoration: '' } : undefined, { onChange: (v) => v?.font && onChange(v.font) });
            }}
          >
            {t('panel.font.change')}
          </Button>
          {value && (
            <TextButton size="small" disabled={disabled} onClick={() => { if (!disabled) onChange(''); }}>
              {t('panel.font.siteDefault')}
            </TextButton>
          )}
        </Box>
      </Box>
    </FormField>
  );
}

// ---- Sections --------------------------------------------------------------------

function ThemeSection({ style, set, update, isCta, t, disabledCustom }: SectionProps & { update: BodyProps['update']; isCta: boolean; disabledCustom?: boolean }) {
  return (
    <Group t={t}>
      <Select
        label={t('panel.theme')}
        value={style.theme}
        options={THEMES.map((th) => ({ value: th, label: t(`panel.theme.${th}`) }))}
        onChange={(theme) => update((s) => applyTheme(s, theme, isCta ? 'product-cta' : undefined))}
      />
      <Text size="tiny" secondary>{t('panel.theme.applyNote')}</Text>
      {THEME_COLOR_KEYS.map((k) => (
        <ColorField
          key={k}
          label={t(`panel.color.${k}`)}
          value={style.colors[k]}
          onChange={(v) => set('colors', k, v)}
          t={t}
          disabled={disabledCustom}
          tooltip={disabledCustom ? t('panel.plan.requiresPro') : undefined}
        />
      ))}
      <ContrastWarnings style={style} t={t} />
      <TextButton
        size="small"
        onClick={() => update((s) => {
          const d = sectionDefaults(s.theme, 'colors', isCta ? 'product-cta' : undefined);
          return { ...s, colors: { ...d, ...Object.fromEntries(TEXT_COLOR_KEYS.map((k) => [k, s.colors[k]])) } };
        })}
      >
        {t('panel.resetToTheme')}
      </TextButton>
    </Group>
  );
}

function ContrastWarnings({ style, t }: { style: TradeInWidgetStyle; t: Translate }) {
  const warnings = contrastWarnings(style);
  if (!warnings.length) return null;
  return (
    <SectionHelper appearance="warning" title={t('panel.contrast.title')}>
      {warnings.map((w) => (
        <div key={w.pair}>{t('panel.contrast.warning', { pair: t(`panel.contrast.${w.pair}`), ratio: w.ratio, required: w.required })}</div>
      ))}
    </SectionHelper>
  );
}

function TextSection({ style, set, update, kind, t, disabledCustom }: SectionProps & { update: BodyProps['update']; kind: WidgetKind }) {
  const tooltip = disabledCustom ? t('panel.plan.requiresPro') : undefined;
  return (
    <Group t={t}>
      <Text size="tiny" secondary>{t('panel.text.note')}</Text>
      {TEXT_ELEMENT_KEYS.map((el) => {
        const { font, color } = TEXT_ELEMENTS[el];
        const name = t(`panel.text.${el}`);
        return (
          <Box key={el} direction="vertical" gap="SP2" paddingTop="SP2" dataHook={`text-element-${el}`}>
            <Text size="small" weight="bold">{name}</Text>
            <ColorField
              label={t('panel.text.color')}
              name={name}
              value={style.colors[color]}
              onChange={(v) => set('colors', color, v)}
              t={t}
              disabled={disabledCustom}
              tooltip={tooltip}
            />
            <FontField
              label={t('panel.text.font')}
              value={style.typography[font]}
              onChange={(v) => set('typography', font, v)}
              t={t}
              disabled={disabledCustom}
              tooltip={tooltip}
            />
            <Box>
              <TextButton size="small" ariaLabel={t('panel.text.resetAria', { name })} onClick={() => update((s) => resetTextElement(s, el, kind))}>
                {t('panel.text.reset')}
              </TextButton>
            </Box>
          </Box>
        );
      })}
      <Segmented
        label={t('panel.headingAlign')}
        value={style.typography.headingAlign}
        options={[{ value: 'start', label: t('panel.align.start') }, { value: 'center', label: t('panel.align.center') }]}
        onChange={(v) => set('typography', 'headingAlign', v)}
      />
      <ContrastWarnings style={style} t={t} />
      <TextButton size="small" onClick={() => update((s) => resetText(s, kind))}>{t('panel.text.resetAll')}</TextButton>
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
      <SliderField label={t('panel.layout.sectionGap')} rangeKey="layout.sectionGap" value={l.sectionGap} onChange={(v) => set('layout', 'sectionGap', v)} />
      {kind === 'form' && <SliderField label={t('panel.layout.fieldGap')} rangeKey="layout.fieldGap" value={l.fieldGap} onChange={(v) => set('layout', 'fieldGap', v)} />}
      <SliderField label={isCta ? t('panel.layout.spacing') : t('panel.layout.buttonGap')} rangeKey="layout.buttonGap" value={l.buttonGap} onChange={(v) => set('layout', 'buttonGap', v)} />
      <Segmented
        label={t('panel.layout.alignment')}
        value={l.alignment}
        options={[{ value: 'start', label: t('panel.align.start') }, { value: 'center', label: t('panel.align.center') }]}
        onChange={(v) => set('layout', 'alignment', v)}
      />
      <Select
        label={t('panel.layout.cardStyle')}
        value={l.cardStyle}
        options={(['flat', 'bordered', 'elevated'] as const).map((v) => ({ value: v, label: t(`panel.layout.cardStyle.${v}`) }))}
        onChange={(v) => set('layout', 'cardStyle', v)}
      />
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

function AdvancedSection({ replace, t, disabled }: { replace: (s: TradeInWidgetStyle) => void; t: Translate; disabled?: boolean }) {
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
        <Button
          size="small"
          priority="secondary"
          disabled={disabled}
          title={disabled ? t('panel.plan.requiresPro') : undefined}
          onClick={() => {
            if (!disabled) setConfirming(true);
          }}
        >
          {t('panel.resetAll')}
        </Button>
      )}
      <Text size="tiny" secondary>{disabled ? t('panel.plan.requiresPro') : t('panel.advanced.deferred')}</Text>
    </Group>
  );
}
