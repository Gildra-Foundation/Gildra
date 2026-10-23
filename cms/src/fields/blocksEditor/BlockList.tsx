"use client";

import React, { useState } from "react";

import { BLOCKS, blockHint, blockLabel, type BlockInstance } from "../../blocks/contract";
import { formatIssue, type BlockIssue } from "../../blocks/validate";
import { Badge } from "../../components/valyro-ui/basic/Badge";
import { Button } from "../../components/valyro-ui/basic/Button";
import { IconButton } from "../../components/valyro-ui/basic/IconButton";
import { Accordion, AccordionContent, AccordionItemPart, AccordionTrigger } from "../../components/valyro-ui/data-display/Accordion";
import { ConfirmDialog } from "../../components/valyro-ui/feedback/ConfirmDialog";
import { PlusIcon, TrashIcon } from "../../components/valyro-ui/icons";
import { Sortable, SortableHandle } from "../../components/valyro-ui/layout/Sortable";
import { LegalForm } from "./LegalForm";
import { issuesWithin, newBlock } from "./model";
import { ObjectFields, type FormContext } from "./PropsForm";
import { useKeyedList } from "./useKeyedList";

type ListProps = {
  blocks: BlockInstance[];
  onChange: (blocks: BlockInstance[]) => void;
  /** Block types the page allows; `null` = every known type (legacy page). */
  allowed: readonly string[] | null;
  /** Position of the parent block ("2"), "" at the top. */
  parent: string;
  issues: Map<string, BlockIssue[]>;
  ctx: Omit<FormContext, "issues">;
  /** Label of the add button. */
  addLabel: string;
};

/** Field-less issues and those the forms cannot place (unknown fields, wrong types of the block itself). */
const cardLevel = (issue: BlockIssue) => !issue.field || issue.code === "unknown-field" || issue.field === "props" || issue.field === "children";

function AddBlock({ allowed, onAdd, label, nested, ctx }: { allowed: readonly string[]; onAdd: (type: string) => void; label: string; nested: boolean; ctx: ListProps["ctx"] }) {
  const [choosing, setChoosing] = useState(false);
  if (ctx.readOnly || allowed.length === 0) return null;
  const types = allowed.join(", ");
  if (!choosing || allowed.length === 1) {
    return (
      <Button
        variant="ghost"
        className="gd-dashed gd-addblock"
        leftIcon={<PlusIcon />}
        onClick={() => (allowed.length === 1 ? onAdd(allowed[0]) : setChoosing(true))}
      >
        {label}
        {nested ? null : <span className="gd-addblock__types"> · {ctx.t.addAllowed(types)}</span>}
      </Button>
    );
  }
  return (
    <div className="gd-chooser" role="group" aria-label={ctx.t.chooseBlock}>
      <p className="gd-chooser__title">{ctx.t.chooseBlock}</p>
      <div className="gd-chooser__grid">
        {allowed.map((type) => (
          <button
            key={type}
            type="button"
            className="gd-chooser__option"
            onClick={() => {
              setChoosing(false);
              onAdd(type);
            }}
          >
            <span className="gd-chooser__name">{blockLabel(type, ctx.lang)}</span>
            <code>{type}</code>
            {blockHint(type, ctx.lang) ? <span className="gd-chooser__hint">{blockHint(type, ctx.lang)}</span> : null}
          </button>
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={() => setChoosing(false)}>
        {ctx.t.cancel}
      </Button>
    </div>
  );
}

function BlockCard({ block, position, onChange, onRemove, allowed, issues, ctx }: {
  block: BlockInstance;
  position: string;
  onChange: (block: BlockInstance) => void;
  onRemove: () => void;
  allowed: readonly string[] | null;
  issues: Map<string, BlockIssue[]>;
  ctx: ListProps["ctx"];
}) {
  const [open, setOpen] = useState<string[]>(["block"]);
  const [confirming, setConfirming] = useState(false);
  const own = issues.get(position) ?? [];
  const all = issuesWithin(issues, position);
  const contract = BLOCKS[block.type];
  const name = blockLabel(block.type, ctx.lang);
  const formCtx: FormContext = { ...ctx, issues: own };
  const setProps = (props: Record<string, unknown> | undefined) => {
    const next: BlockInstance = { ...block, props };
    if (!props) delete next.props;
    onChange(next);
  };
  const hasProps = Object.keys(contract?.props.properties ?? {}).length > 0;
  const hint = blockHint(block.type, ctx.lang);
  return (
    <article className="gd-block" data-invalid={all.length > 0 || undefined}>
      <div className="gd-block__bar">
        <SortableHandle className="gd-handle" />
        <div className="gd-block__status">
          {all.length ? <Badge color="red" variant="outline" size="sm">{ctx.t.issues(all.length)}</Badge> : <Badge color="green" variant="outline" size="sm">{ctx.t.ok}</Badge>}
          {!ctx.readOnly ? <IconButton icon={<TrashIcon />} label={ctx.t.remove} variant="ghost" size="sm" onClick={() => setConfirming(true)} /> : null}
        </div>
      </div>
      <Accordion type="multiple" value={open} onValueChange={setOpen} headingLevel={3} className="gd-block__accordion">
        <AccordionItemPart value="block">
          <AccordionTrigger>
            <span className="gd-block__name">{name}</span>
            <code className="gd-block__type">{block.type}</code>
          </AccordionTrigger>
          <AccordionContent>
            <div className="gd-block__body">
              {own.filter(cardLevel).map((issue, index) => (
                <p key={index} className="gd-bfield__error" role="alert">
                  {formatIssue(issue, ctx.lang)}
                </p>
              ))}
              {hint && !hasProps ? <p className="gd-block__hint">{hint}</p> : null}
              {block.type === "legal" ? (
                <LegalForm value={block.props} onChange={setProps} ctx={formCtx} />
              ) : hasProps ? (
                <ObjectFields schema={contract.props} value={block.props} path="" onChange={setProps} ctx={formCtx} />
              ) : !hint ? (
                <p className="gd-block__hint">{ctx.t.noFields}</p>
              ) : null}
              {contract?.container ? (
                <div className="gd-block__children">
                  <p className="gd-bfield__label">{ctx.t.children}</p>
                  <BlockList
                    blocks={Array.isArray(block.children) ? block.children : []}
                    onChange={(children) => onChange({ ...block, children })}
                    allowed={allowed}
                    parent={position}
                    issues={issues}
                    ctx={ctx}
                    addLabel={ctx.t.addChild}
                  />
                </div>
              ) : null}
            </div>
          </AccordionContent>
        </AccordionItemPart>
      </Accordion>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={ctx.t.removeTitle(name)}
        description={ctx.t.removeText}
        confirmLabel={ctx.t.removeConfirm}
        cancelLabel={ctx.t.cancel}
        variant="danger"
        onConfirm={() => {
          setConfirming(false);
          onRemove();
        }}
        onCancel={() => setConfirming(false)}
      />
    </article>
  );
}

/** Sortable list of blocks (the page, or a container's children) with the add control. */
export function BlockList({ blocks, onChange, allowed, parent, issues, ctx, addLabel }: ListProps) {
  const keyed = useKeyedList(blocks);
  const addable = (allowed ?? Object.keys(BLOCKS)).filter((type) => BLOCKS[type]);
  const position = (index: number) => (parent ? `${parent}.${index + 1}` : String(index + 1));
  return (
    <div className="gd-blocklist">
      {blocks.length === 0 && parent ? <p className="gd-block__hint">{ctx.t.noChildren}</p> : null}
      <Sortable
        items={keyed.keyed}
        getKey={(entry) => entry.key}
        handle
        disabled={ctx.readOnly}
        getItemLabel={(entry) => `${blockLabel(entry.item.type, ctx.lang)} (${entry.index + 1})`}
        onReorder={(next) => onChange(keyed.reorder(next.map((entry) => entry.key)))}
        className="gd-blocklist__items"
      >
        {(entry) => (
          <BlockCard
            block={entry.item}
            position={position(entry.index)}
            onChange={(block) => onChange(keyed.replace(entry.index, block))}
            onRemove={() => onChange(keyed.remove(entry.index))}
            allowed={allowed}
            issues={issues}
            ctx={ctx}
          />
        )}
      </Sortable>
      <AddBlock allowed={addable} onAdd={(type) => onChange(keyed.insert(newBlock(type)))} label={addLabel} nested={parent !== ""} ctx={ctx} />
    </div>
  );
}
