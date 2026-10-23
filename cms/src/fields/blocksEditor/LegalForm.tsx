"use client";

import React, { useId, useState } from "react";

import { BLOCKS, fieldLabel } from "../../blocks/contract";
import { Accordion, AccordionContent, AccordionItemPart, AccordionTrigger } from "../../components/valyro-ui/data-display/Accordion";
import { Textarea } from "../../components/valyro-ui/forms/Textarea";
import { TextInput } from "../../components/valyro-ui/forms/TextInput";
import { FieldShell, issuesAt, ListControl, type FormContext } from "./PropsForm";
import { setProp } from "./model";

type Section = { heading?: string; text?: string };

/**
 * Hand-tuned form of the `legal` block (privacy policy and the like): title
 * and date side by side, sections as a sortable list whose rows open into
 * heading + text, the back link last. Same contract, same stored props.
 */
export function LegalForm({ value, onChange, ctx }: {
  value: Record<string, unknown> | undefined;
  onChange: (value: Record<string, unknown> | undefined) => void;
  ctx: FormContext;
}) {
  const id = useId();
  const schema = BLOCKS.legal.props;
  const sections = Array.isArray(value?.sections) ? (value?.sections as Section[]) : [];
  const [open, setOpen] = useState<string[]>([]);
  const set = (key: string) => (next: unknown) => onChange(setProp(value, key, next, true));
  const text = (key: "title" | "updated" | "backLabel") => {
    const errors = issuesAt(ctx.issues, key);
    return (
      <FieldShell label={fieldLabel(key, ctx.lang)} errors={errors} ctx={ctx} htmlFor={`${id}-${key}`}>
        <TextInput id={`${id}-${key}`} value={typeof value?.[key] === "string" ? (value[key] as string) : ""} onChange={(e) => set(key)(e.target.value)} invalid={errors.length > 0} disabled={ctx.readOnly} />
      </FieldShell>
    );
  };
  return (
    <div className="gd-bform">
      <div className="gd-bform__pair">
        {text("title")}
        {text("updated")}
      </div>
      <FieldShell label={ctx.t.sections(sections.length)} errors={issuesAt(ctx.issues, "sections")} ctx={ctx}>
        <ListControl
          name="sections"
          path="sections"
          item={schema.properties!.sections.items!}
          value={sections}
          onChange={set("sections")}
          ctx={{ ...ctx, t: { ...ctx.t, addItem: ctx.t.addSection } }}
          renderItem={({ item, path, onChange: change }) => {
            const section = (item ?? {}) as Section;
            const headingErrors = issuesAt(ctx.issues, `${path}.heading`);
            const textErrors = issuesAt(ctx.issues, `${path}.text`);
            const invalid = headingErrors.length + textErrors.length > 0;
            return (
              <Accordion type="multiple" value={open} onValueChange={setOpen} headingLevel={4} className="gd-legal-section" data-invalid={invalid || undefined}>
                <AccordionItemPart value={path}>
                  <AccordionTrigger>
                    <span className="gd-legal-section__title">{section.heading || ctx.t.untitled}</span>
                    <span className="gd-legal-section__excerpt">{section.text || ctx.t.emptyText}</span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <FieldShell label={fieldLabel("heading", ctx.lang)} errors={headingErrors} ctx={ctx} htmlFor={`${id}-${path}-h`}>
                      <TextInput id={`${id}-${path}-h`} value={section.heading ?? ""} onChange={(e) => change({ ...section, heading: e.target.value })} invalid={headingErrors.length > 0} disabled={ctx.readOnly} />
                    </FieldShell>
                    <FieldShell label={fieldLabel("text", ctx.lang)} errors={textErrors} ctx={ctx} htmlFor={`${id}-${path}-t`}>
                      <Textarea id={`${id}-${path}-t`} value={section.text ?? ""} onChange={(e) => change({ ...section, text: e.target.value })} autoResize minRows={3} maxRows={16} invalid={textErrors.length > 0} disabled={ctx.readOnly} />
                    </FieldShell>
                  </AccordionContent>
                </AccordionItemPart>
              </Accordion>
            );
          }}
        />
      </FieldShell>
      {text("backLabel")}
    </div>
  );
}
