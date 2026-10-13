"use client";

import React from "react";

type Node = {
  type?: string;
  tag?: string;
  listType?: string;
  text?: string;
  format?: number | string;
  children?: Node[];
  fields?: Record<string, unknown>;
  root?: Node;
};

const BOLD = 1;
const ITALIC = 2;
const STRIKE = 4;
const UNDERLINE = 8;
const CODE = 16;

function Text({ node }: { node: Node }) {
  let out: React.ReactNode = node.text ?? "";
  const format = typeof node.format === "number" ? node.format : 0;
  if (format & CODE) out = <code>{out}</code>;
  if (format & BOLD) out = <strong>{out}</strong>;
  if (format & ITALIC) out = <em>{out}</em>;
  if (format & UNDERLINE) out = <u>{out}</u>;
  if (format & STRIKE) out = <s>{out}</s>;
  return <>{out}</>;
}

/** Plain text of a block's fields (titles, bodies, list items) so the comparison shows every word. */
function blockText(fields: Record<string, unknown> | undefined): string[] {
  const out: string[] = [];
  const visit = (value: unknown, key: string) => {
    if (["url", "blockType", "blockName", "id", "tone", "style", "embed"].includes(key)) return;
    if (typeof value === "string" && value.trim()) out.push(value.trim());
    else if (Array.isArray(value)) value.forEach((item) => visit(item, ""));
    else if (value && typeof value === "object") {
      const rich = value as Node;
      if (rich.root) out.push(plainText(rich.root));
      else for (const [k, v] of Object.entries(value)) visit(v, k);
    }
  };
  for (const [key, value] of Object.entries(fields ?? {})) visit(value, key);
  return out.filter(Boolean);
}

function plainText(node: Node | undefined): string {
  if (!node) return "";
  if (typeof node.text === "string") return node.text;
  return (node.children ?? []).map(plainText).join(node.type === "paragraph" ? "" : " ");
}

function Children({ nodes }: { nodes?: Node[] }) {
  return <>{(nodes ?? []).map((child, index) => <LexicalNode key={index} node={child} />)}</>;
}

function LexicalNode({ node }: { node: Node }): React.ReactElement | null {
  switch (node.type) {
    case "text":
      return <Text node={node} />;
    case "linebreak":
      return <br />;
    case "tab":
      return <>{"\t"}</>;
    case "paragraph":
      return (
        <p>
          <Children nodes={node.children} />
        </p>
      );
    case "heading": {
      const Tag = (["h2", "h3", "h4", "h5", "h6"].includes(node.tag ?? "") ? node.tag : "h2") as "h2";
      return (
        <Tag>
          <Children nodes={node.children} />
        </Tag>
      );
    }
    case "quote":
      return (
        <blockquote>
          <Children nodes={node.children} />
        </blockquote>
      );
    case "list": {
      const Tag = node.listType === "number" ? "ol" : "ul";
      return (
        <Tag>
          <Children nodes={node.children} />
        </Tag>
      );
    }
    case "listitem":
      return (
        <li>
          <Children nodes={node.children} />
        </li>
      );
    // Links stay text: this panel is for reading, and a pasted URL must never run in the admin.
    case "link":
    case "autolink":
      return (
        <span className="gd-ref__link">
          <Children nodes={node.children} />
        </span>
      );
    case "upload":
      return <p className="gd-ref__media">[изображение / image]</p>;
    case "relationship":
      return <p className="gd-ref__media">[ссылка на материал / linked item]</p>;
    case "horizontalrule":
      return <hr />;
    case "block":
    case "inlineBlock": {
      const lines = blockText(node.fields);
      const kind = typeof node.fields?.blockType === "string" ? node.fields.blockType : "block";
      return (
        <div className="gd-ref__block">
          <span>{kind}</span>
          {lines.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
      );
    }
    default:
      return node.children ? <Children nodes={node.children} /> : null;
  }
}

/** Read-only rendering of a Lexical document: React escapes every text, no HTML is injected. */
export function LexicalPreview({ value }: { value: unknown }) {
  const root = (value as Node | null)?.root;
  if (!root?.children?.length) return null;
  return (
    <div className="gd-ref__body">
      <Children nodes={root.children} />
    </div>
  );
}
