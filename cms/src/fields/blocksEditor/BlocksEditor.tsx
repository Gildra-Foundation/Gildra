"use client";

import { FieldError, useField, useLocale } from "@payloadcms/ui";
import type { JSONFieldClientComponent } from "payload";
import React, { useMemo } from "react";

import type { BlockInstance } from "../../blocks/contract";
import { AdminSurface } from "../../components/AdminSurface";
import { Badge } from "../../components/valyro-ui/basic/Badge";
import { EmptyState } from "../../components/valyro-ui/data-display/EmptyState";
import { BlockList } from "./BlockList";
import { editorText } from "./copy";
import { issuesByBlock } from "./model";
import { useSitePage } from "./useSitePage";
import "./blocksEditor.css";

/**
 * The `blocks` field of a page as a block editor instead of raw JSON: sortable
 * blocks, "add block" limited to the page's allowed blocks, forms generated
 * from the shared contract (hand-tuned for `legal`), live validation with the
 * same rules as the server and the site. The stored value is unchanged:
 * the web app's `BlockInstance[]` for the current language.
 */
export const BlocksEditor: JSONFieldClientComponent = ({ path, readOnly }) => {
  const { value, setValue, showError, errorMessage } = useField<unknown>({ path });
  const { page, pageId, lang, loading } = useSitePage();
  const locale = useLocale();
  const t = editorText(lang);
  const allowed = page?.blocks ?? null;
  const blocks = Array.isArray(value) ? (value as BlockInstance[]) : [];
  const issues = useMemo(() => issuesByBlock(value, allowed), [value, allowed]);
  const total = [...issues.values()].reduce((n, list) => n + list.length, 0);
  // Until the site is known the allowed list is unknown: show the blocks read-only rather than every type.
  const ctx = { lang, t, readOnly: Boolean(readOnly) || loading };

  let body: React.ReactNode;
  if (!pageId) body = <EmptyState size="sm" bordered title={t.choosePage[0]} description={t.choosePage[1]} />;
  else if (value !== null && value !== undefined && !Array.isArray(value)) body = <p className="gd-bfield__error" role="alert">{t.notList}</p>;
  else
    body = (
      <>
        {blocks.length === 0 ? <EmptyState size="sm" icon={null} title={t.empty[0]} description={t.empty[1]} /> : null}
        <BlockList blocks={blocks} onChange={(next) => setValue(next)} allowed={allowed} parent="" issues={issues} ctx={ctx} addLabel={t.add} />
      </>
    );

  return (
    <AdminSurface lang={lang}>
      <section className="gd-blocks field-type" aria-label={t.blocks}>
        <header className="gd-blocks__head">
          <h2 className="gd-blocks__title">
            {t.blocks} <span className="gd-blocks__locale">· {String(locale?.code ?? "").toUpperCase()}</span>
          </h2>
          {blocks.length ? <Badge size="sm" color={total ? "red" : "gray"} variant="outline">{total ? t.issues(total) : t.count(blocks.length)}</Badge> : null}
        </header>
        {body}
        {showError && errorMessage ? <FieldError path={path} message={errorMessage} showError /> : null}
      </section>
    </AdminSurface>
  );
};
