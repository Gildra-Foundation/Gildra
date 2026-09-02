import { t } from "@/lib/i18n";
import type { BlockComponentProps } from "@/lib/blocks/types";
import type { ExampleData, ExampleProps } from "./schema";

/** Presentational only: props + data + lang + game → JSX. */
export function Example({ data, lang, compact }: BlockComponentProps<ExampleProps, ExampleData>) {
  const tt = t(lang);
  return (
    <div className={compact ? "panel panel-compact" : "panel"}>
      <div className="panel-head">
        <span className="t">{data.title}</span>
      </div>
      <ul>
        {data.items.map((item) => (
          <li key={item}>{tt(item)}</li>
        ))}
      </ul>
    </div>
  );
}
