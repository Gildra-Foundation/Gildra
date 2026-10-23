"use client";

import React, { useId } from "react";

import { fieldLabel, type Lang, type Schema } from "../../blocks/contract";
import { formatIssue, type BlockIssue } from "../../blocks/validate";
import { Button } from "../../components/valyro-ui/basic/Button";
import { IconButton } from "../../components/valyro-ui/basic/IconButton";
import { Select } from "../../components/valyro-ui/forms/Select";
import { Switch } from "../../components/valyro-ui/forms/Switch";
import { Textarea } from "../../components/valyro-ui/forms/Textarea";
import { TextInput } from "../../components/valyro-ui/forms/TextInput";
import { PlusIcon, TrashIcon } from "../../components/valyro-ui/icons";
import { Sortable, SortableHandle } from "../../components/valyro-ui/layout/Sortable";
import type { EditorText } from "./copy";
import { controlFor, defaultFor, setProp } from "./model";
import { useKeyedList } from "./useKeyedList";

/**
 * Form generated from a block's props contract: strings, enums, numbers,
 * booleans, nested objects and lists, each with the inline error the
 * validator reports for that field path.
 */
export type FormContext = { lang: Lang; t: EditorText; readOnly: boolean; issues: BlockIssue[] };

/** Issues whose field is exactly `path` (errors of nested fields show next to those fields). */
export function issuesAt(issues: BlockIssue[], path: string): BlockIssue[] {
  return issues.filter((issue) => issue.field === path);
}

export function FieldShell({ label, optional, hint, errors, ctx, htmlFor, children }: {
  label: string;
  optional?: boolean;
  hint?: string | null;
  errors: BlockIssue[];
  ctx: FormContext;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="gd-bfield" data-invalid={errors.length > 0 || undefined}>
      <label className="gd-bfield__label" htmlFor={htmlFor}>
        {label}
        {optional ? <span className="gd-bfield__optional"> · {ctx.t.optional}</span> : null}
      </label>
      {children}
      {hint ? <p className="gd-bfield__hint">{hint}</p> : null}
      {errors.map((issue, index) => (
        <p key={index} className="gd-bfield__error" role="alert">
          {formatIssue(issue, ctx.lang)}
        </p>
      ))}
    </div>
  );
}

function ScalarControl({ id, name, schema, value, onChange, invalid, ctx }: {
  id: string;
  name: string;
  schema: Schema;
  value: unknown;
  onChange: (value: unknown) => void;
  invalid: boolean;
  ctx: FormContext;
}) {
  const control = controlFor(name, schema);
  switch (control.kind) {
    case "text":
      return control.multiline ? (
        <Textarea id={id} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} autoResize minRows={3} maxRows={14} invalid={invalid} disabled={ctx.readOnly} />
      ) : (
        <TextInput id={id} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} invalid={invalid} disabled={ctx.readOnly} />
      );
    case "number":
      return <TextInput id={id} type="number" value={typeof value === "number" ? String(value) : ""} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} invalid={invalid} disabled={ctx.readOnly} />;
    case "boolean":
      return <Switch id={id} checked={value === true} onCheckedChange={(checked) => onChange(checked)} invalid={invalid} disabled={ctx.readOnly} />;
    case "choice": {
      const current = value === undefined || value === null ? "" : String(value);
      const options = [{ value: "", label: ctx.t.none }, ...control.options.map((option) => ({ value: option, label: option }))];
      if (control.free && current && !control.options.includes(current)) options.push({ value: current, label: `${current} (${ctx.t.custom})` });
      return <Select id={id} options={options} value={current} placeholder={ctx.t.none} onValueChange={(next) => onChange(next === "" ? undefined : next)} invalid={invalid} disabled={ctx.readOnly} />;
    }
    default:
      return <p className="gd-bfield__hint">{ctx.t.unsupported}</p>;
  }
}

/** A list property: sortable rows, each a scalar or an object form. */
export function ListControl({ name, path, item, value, onChange, ctx, renderItem }: {
  name: string;
  path: string;
  item: Schema;
  value: unknown;
  onChange: (value: unknown[]) => void;
  ctx: FormContext;
  renderItem?: (entry: { item: unknown; index: number; path: string; onChange: (next: unknown) => void }) => React.ReactNode;
}) {
  const list = Array.isArray(value) ? value : [];
  const keyed = useKeyedList(list);
  return (
    <div className="gd-blist">
      <Sortable
        items={keyed.keyed}
        getKey={(entry) => entry.key}
        handle
        disabled={ctx.readOnly}
        getItemLabel={(entry) => `${fieldLabel(name, ctx.lang)} ${entry.index + 1}`}
        onReorder={(next) => onChange(keyed.reorder(next.map((entry) => entry.key)))}
        className="gd-blist__items"
      >
        {(entry) => {
          const itemPath = `${path}[${entry.index + 1}]`;
          const change = (next: unknown) => onChange(keyed.replace(entry.index, next));
          return (
            <div className="gd-blist__row">
              <SortableHandle className="gd-handle" />
              <div className="gd-blist__body">
                {renderItem ? (
                  renderItem({ item: entry.item, index: entry.index, path: itemPath, onChange: change })
                ) : item.type === "object" ? (
                  <ObjectFields schema={item} value={entry.item as Record<string, unknown>} path={itemPath} onChange={change} ctx={ctx} />
                ) : (
                  <ScalarControl id={`${itemPath}`} name={name} schema={item} value={entry.item} onChange={change} invalid={issuesAt(ctx.issues, itemPath).length > 0} ctx={ctx} />
                )}
              </div>
              {!ctx.readOnly ? (
                <IconButton icon={<TrashIcon />} label={ctx.t.removeItem} variant="ghost" size="sm" onClick={() => onChange(keyed.remove(entry.index))} />
              ) : null}
            </div>
          );
        }}
      </Sortable>
      {!ctx.readOnly ? (
        <Button variant="ghost" size="sm" leftIcon={<PlusIcon />} className="gd-dashed" onClick={() => onChange(keyed.insert(defaultFor(item)))}>
          {ctx.t.addItem}
        </Button>
      ) : null}
    </div>
  );
}

/** Every property of an object schema, in contract order. */
export function ObjectFields({ schema, value, path, onChange, ctx }: {
  schema: Schema;
  value: Record<string, unknown> | undefined;
  path: string;
  onChange: (value: Record<string, unknown> | undefined) => void;
  ctx: FormContext;
}) {
  const baseId = useId();
  const required = new Set(schema.required ?? []);
  return (
    <div className="gd-bform">
      {Object.entries(schema.properties ?? {}).map(([key, property]) => {
        const fieldPath = path ? `${path}.${key}` : key;
        const errors = issuesAt(ctx.issues, fieldPath);
        const set = (next: unknown) => onChange(setProp(value, key, next, required.has(key)));
        const control = controlFor(key, property);
        const id = `${baseId}-${key}`;
        return (
          <FieldShell key={key} label={fieldLabel(key, ctx.lang)} optional={!required.has(key)} errors={errors} ctx={ctx} htmlFor={control.kind === "list" || control.kind === "group" ? undefined : id}>
            {control.kind === "list" ? (
              <ListControl name={key} path={fieldPath} item={control.item} value={value?.[key]} onChange={set} ctx={ctx} />
            ) : control.kind === "group" ? (
              <ObjectFields schema={control.schema} value={value?.[key] as Record<string, unknown> | undefined} path={fieldPath} onChange={set} ctx={ctx} />
            ) : (
              <ScalarControl id={id} name={key} schema={property} value={value?.[key]} onChange={set} invalid={errors.length > 0} ctx={ctx} />
            )}
          </FieldShell>
        );
      })}
    </div>
  );
}
