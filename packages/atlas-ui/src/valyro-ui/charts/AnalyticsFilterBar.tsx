'use client';

import { useEffect, useRef, useState, type ComponentPropsWithRef, type KeyboardEvent, type ReactNode } from 'react';
import { CalendarIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, XIcon } from '../icons';
import { cx, Floating, getDirection, inlineArrowStep, useControllableState, useListNavigation } from '../primitives';
import { Button } from '../basic/Button';
import { ButtonGroup } from '../basic/ButtonGroup';
import './AnalyticsFilterBar.css';
import { withRef, useId } from '../primitives/react-compat';

export interface AnalyticsFilter {
  /** Matches `AnalyticsFilterField.field`. */
  field: string;
  value: string;
}

export interface AnalyticsFilterField {
  field: string;
  label: string;
  options: string[];
  icon?: ReactNode;
}

export interface AnalyticsFilterBarValue {
  /** A preset `value` from `ranges`, or `"custom"`. */
  range: string;
  filters: AnalyticsFilter[];
  compare: boolean;
  /** A `value` from `granularities`. */
  granularity: string;
}

export interface AnalyticsFilterOption {
  value: string;
  label: string;
}

export interface AnalyticsFilterBarLabels {
  /** Accessible name of the toolbar (an `aria-label` prop takes precedence). */
  group: string;
  dateRange: string;
  addFilter: string;
  /** Accessible name of the field menu. */
  filterBy: string;
  /** Accessible name of a field's value menu. */
  fieldValues: (field: string) => string;
  /** Accessible name of a chip's remove button. */
  removeFilter: (field: string, value: string) => string;
  compare: string;
  granularity: string;
  /** The custom-range segment while another range is selected (its dates show once it is picked). Default "Custom…". */
  customRange: string;
}

const DEFAULT_LABELS: AnalyticsFilterBarLabels = {
  group: 'Analytics filters',
  dateRange: 'Date range',
  addFilter: 'Add filter',
  filterBy: 'Filter by',
  fieldValues: (field) => `${field} values`,
  removeFilter: (field, value) => `Remove filter ${field}: ${value}`,
  compare: 'Compare',
  granularity: 'Granularity',
  customRange: 'Custom…',
};

export interface AnalyticsFilterBarProps extends Omit<ComponentPropsWithRef<'div'>, 'defaultValue' | 'onChange' | 'children'> {
  /** Gildra: hide controls the analytics API does not support. */
  showCompare?: boolean;
  showGranularity?: boolean;
  value?: AnalyticsFilterBarValue;
  defaultValue?: AnalyticsFilterBarValue;
  onValueChange?: (value: AnalyticsFilterBarValue) => void;
  /** Date-range presets. Default 24h / 7d / 30d / 90d. */
  ranges?: AnalyticsFilterOption[];
  /**
   * Adds a "custom" segment; selecting it sets range to "custom". It reads `labels.customRange`
   * ("Custom…") until then and shows these dates (e.g. "Mar 1 – Mar 14") while selected.
   */
  customRangeLabel?: string;
  /** Fields offered by "Add filter". */
  fields?: AnalyticsFilterField[];
  /** Default Hourly / Daily / Weekly / Monthly. */
  granularities?: AnalyticsFilterOption[];
  /** Right-aligned slot, e.g. an export button. */
  actions?: ReactNode;
  /** Overrides for the built-in strings. */
  labels?: Partial<AnalyticsFilterBarLabels>;
}

const DEFAULT_RANGES: AnalyticsFilterOption[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
];

const DEFAULT_GRANULARITIES: AnalyticsFilterOption[] = [
  { value: 'hour', label: 'Hourly' },
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
];

const DEFAULT_VALUE: AnalyticsFilterBarValue = { range: '7d', filters: [], compare: false, granularity: 'day' };

/** Dashboard toolbar: date range, removable filter chips, compare toggle, granularity and actions. */
export const AnalyticsFilterBar = withRef(function AnalyticsFilterBar({
  showCompare = true,
  showGranularity = true,
  value: valueProp,
  defaultValue = DEFAULT_VALUE,
  onValueChange,
  ranges = DEFAULT_RANGES,
  customRangeLabel,
  fields = [],
  granularities = DEFAULT_GRANULARITIES,
  actions,
  labels,
  className,
  ...rest
}: AnalyticsFilterBarProps) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const [value, setValue] = useControllableState({ value: valueProp, defaultValue, onChange: onValueChange });
  const update = (patch: Partial<AnalyticsFilterBarValue>) => setValue((prev) => ({ ...prev, ...patch }));

  const fieldLabel = (field: string) => fields.find((f) => f.field === field)?.label ?? field;
  const hasFilter = (f: AnalyticsFilter) => value.filters.some((x) => x.field === f.field && x.value === f.value);
  const granularity = granularities.find((g) => g.value === value.granularity);

  return (
    <div {...rest} className={cx('ui-analytics-filter-bar', className)} role="group" aria-label={rest['aria-label'] ?? text.group}>
      <ButtonGroup attached label={text.dateRange} className="ui-analytics-filter-bar__ranges">
        {ranges.map((r) => (
          <Button
            key={r.value}
            size="sm"
            variant="secondary"
            className="ui-analytics-filter-bar__segment"
            aria-pressed={value.range === r.value}
            onClick={() => update({ range: r.value })}
          >
            {r.label}
          </Button>
        ))}
        {customRangeLabel && (
          <Button
            size="sm"
            variant="secondary"
            className="ui-analytics-filter-bar__segment"
            leftIcon={<CalendarIcon size={14} />}
            aria-pressed={value.range === 'custom'}
            onClick={() => update({ range: 'custom' })}
          >
            {value.range === 'custom' ? customRangeLabel : text.customRange}
          </Button>
        )}
      </ButtonGroup>

      <div className="ui-analytics-filter-bar__filters">
        {value.filters.map((f) => (
          <span key={`${f.field}:${f.value}`} className="ui-analytics-filter-bar__chip">
            <span className="ui-analytics-filter-bar__chip-field">{fieldLabel(f.field)}</span>
            <span className="ui-analytics-filter-bar__chip-value">{f.value}</span>
            <button
              type="button"
              className="ui-analytics-filter-bar__chip-remove"
              aria-label={text.removeFilter(fieldLabel(f.field), f.value)}
              onClick={() => update({ filters: value.filters.filter((x) => x !== f) })}
            >
              <XIcon size={12} />
            </button>
          </span>
        ))}
        {fields.length > 0 && (
          <AddFilterMenu fields={fields} labels={text} isApplied={hasFilter} onAdd={(f) => update({ filters: [...value.filters, f] })} />
        )}
      </div>

      <div className="ui-analytics-filter-bar__end">
        {showCompare && <button
          type="button"
          role="switch"
          aria-checked={value.compare}
          className="ui-analytics-filter-bar__switch"
          onClick={() => update({ compare: !value.compare })}
        >
          <span className="ui-analytics-filter-bar__switch-track" aria-hidden="true">
            <span className="ui-analytics-filter-bar__switch-thumb" />
          </span>
          {text.compare}
        </button>}
        {showGranularity && <SelectMenu
          label={text.granularity}
          options={granularities}
          value={value.granularity}
          triggerLabel={granularity?.label ?? value.granularity}
          onChange={(g) => update({ granularity: g })}
        />}
        {actions}
      </div>
    </div>
  );
});

/* ───────────────────────── Menus ───────────────────────── */

interface MenuEntry {
  key: string;
  text: string;
  icon?: ReactNode;
  hint?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

interface MenuListProps {
  role: 'menu' | 'listbox';
  label: string;
  entries: MenuEntry[];
  /** Tab leaves the menu: close it and return focus to the trigger. */
  onClose: () => void;
  /** Extra keys (e.g. the inline-start arrow to go back) handled before list navigation. */
  onKeyDown?: (event: KeyboardEvent) => void;
}

/** Keyboard-navigable list inside a Floating layer; DOM focus stays on the list. */
function MenuList({ role, label, entries, onClose, onKeyDown }: MenuListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const selectedIndex = entries.findIndex((e) => e.selected);
  const nav = useListNavigation({
    count: entries.length,
    isDisabled: (i) => !!entries[i].disabled,
    getLabel: (i) => entries[i].text,
    onSelect: (i) => entries[i].onSelect(),
    initialIndex: role === 'listbox' && selectedIndex >= 0 ? selectedIndex : 0,
  });

  useEffect(() => {
    // Floating stays visibility:hidden until its first measurement, and hidden elements can't take focus.
    const frame = requestAnimationFrame(() => listRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      ref={listRef}
      role={role}
      aria-label={label}
      tabIndex={-1}
      className="ui-analytics-filter-bar__list"
      aria-activedescendant={nav.activeIndex >= 0 ? `${id}-${nav.activeIndex}` : undefined}
      onKeyDown={(event) => {
        if (event.key === 'Tab') {
          event.preventDefault();
          onClose();
          return;
        }
        onKeyDown?.(event);
        if (!event.defaultPrevented) nav.onKeyDown(event);
      }}
    >
      {entries.map((entry, i) => (
        <div
          key={entry.key}
          id={`${id}-${i}`}
          role={role === 'menu' ? 'menuitem' : 'option'}
          aria-selected={role === 'listbox' ? !!entry.selected : undefined}
          aria-disabled={entry.disabled || undefined}
          className="ui-menu-item"
          data-highlighted={nav.activeIndex === i || undefined}
          onPointerMove={() => !entry.disabled && nav.setActiveIndex(i)}
          onClick={() => !entry.disabled && entry.onSelect()}
        >
          {entry.icon && <span className="ui-menu-item__icon">{entry.icon}</span>}
          <span className="ui-menu-item__label">{entry.text}</span>
          {entry.hint && <span className="ui-menu-item__hint">{entry.hint}</span>}
        </div>
      ))}
    </div>
  );
}

interface AddFilterMenuProps {
  fields: AnalyticsFilterField[];
  labels: AnalyticsFilterBarLabels;
  isApplied: (filter: AnalyticsFilter) => boolean;
  onAdd: (filter: AnalyticsFilter) => void;
}

/** Two steps in one popover: pick a field, then one of its values. */
function AddFilterMenu({ fields, labels, isApplied, onAdd }: AddFilterMenuProps) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<AnalyticsFilterField | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const entries: MenuEntry[] = field
    ? [
        {
          key: '__back',
          text: field.label,
          icon: <ChevronLeftIcon />,
          onSelect: () => setField(null),
        },
        ...field.options.map((option) => {
          const applied = isApplied({ field: field.field, value: option });
          return {
            key: option,
            text: option,
            hint: applied ? <CheckIcon size={14} /> : undefined,
            disabled: applied,
            onSelect: () => {
              onAdd({ field: field.field, value: option });
              close();
            },
          };
        }),
      ]
    : fields.map((f) => ({
        key: f.field,
        text: f.label,
        icon: f.icon,
        hint: <ChevronRightIcon size={14} />,
        onSelect: () => setField(f),
      }));

  return (
    <>
      <Button
        ref={triggerRef}
        size="sm"
        variant="ghost"
        className="ui-analytics-filter-bar__add"
        leftIcon={<PlusIcon size={14} />}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setField(null);
          setOpen((o) => !o);
        }}
      >
        {labels.addFilter}
      </Button>
      <Floating
        open={open}
        anchorRef={triggerRef}
        placement="bottom-start"
        onDismiss={(reason) => (reason === 'escape' ? close() : setOpen(false))}
        className="ui-analytics-filter-bar__popover"
      >
        <MenuList
          key={field?.field ?? '__fields'}
          role="menu"
          label={field ? labels.fieldValues(field.label) : labels.filterBy}
          entries={entries}
          onClose={close}
          onKeyDown={(event) => {
            // Back towards the inline start: ArrowLeft, or ArrowRight under dir="rtl".
            if (field && inlineArrowStep(event.key, getDirection(event.currentTarget)) === -1) {
              event.preventDefault();
              setField(null);
            }
          }}
        />
      </Floating>
    </>
  );
}

interface SelectMenuProps {
  label: string;
  options: AnalyticsFilterOption[];
  value: string;
  triggerLabel: string;
  onChange: (value: string) => void;
}

function SelectMenu({ label, options, value, triggerLabel, onChange }: SelectMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <Button
        ref={triggerRef}
        size="sm"
        variant="secondary"
        rightIcon={<ChevronDownIcon size={14} />}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${triggerLabel}`}
        onClick={() => setOpen((o) => !o)}
      >
        {triggerLabel}
      </Button>
      <Floating
        open={open}
        anchorRef={triggerRef}
        placement="bottom-end"
        onDismiss={(reason) => (reason === 'escape' ? close() : setOpen(false))}
        className="ui-analytics-filter-bar__popover"
      >
        <MenuList
          role="listbox"
          label={label}
          onClose={close}
          entries={options.map((o) => ({
            key: o.value,
            text: o.label,
            selected: o.value === value,
            hint: o.value === value ? <CheckIcon size={14} /> : undefined,
            onSelect: () => {
              onChange(o.value);
              close();
            },
          }))}
        />
      </Floating>
    </>
  );
}
