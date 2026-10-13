import type { CmsLocale, PublicArticle, RichTextNode } from "@/lib/cms/contract";

/**
 * Design fixture for the article page (`/dev/article`, dev gallery only): an
 * editors' style guide that uses every node and block the CMS editor offers,
 * so the reading layout can be judged without a published article. It talks
 * only about the editor itself — no game data. Cover and figure use a project
 * asset; they render when the media origin is allowed (CMS_PUBLIC_URL = the
 * local server in screenshots).
 */
const text = (value: string, format = 0): RichTextNode => ({ type: "text", text: value, format });
const p = (...children: RichTextNode[]): RichTextNode => ({ type: "paragraph", children });
const heading = (tag: "h2" | "h3", value: string): RichTextNode => ({ type: "heading", tag, children: [text(value)] });
const link = (url: string, value: string): RichTextNode => ({ type: "link", fields: { linkType: "custom", url }, children: [text(value)] });
const list = (type: "bullet" | "number" | "check", items: Array<string | [string, boolean]>): RichTextNode => ({
  type: "list",
  listType: type,
  tag: type === "number" ? "ol" : "ul",
  children: items.map((item) => (Array.isArray(item) ? { type: "listitem", checked: item[1], children: [text(item[0])] } : { type: "listitem", children: [text(item)] })),
});
const block = (fields: Record<string, unknown>): RichTextNode => ({ type: "block", fields });
const ART = "/assets/wow/loading/city.webp";
const media = (caption: string | null, alt: string) => ({ id: "fixture", url: ART, alt, caption, width: 1920, height: 1080, mimeType: "image/webp" });

const copy = {
  en: {
    title: "How Gildra articles are laid out",
    summary: "A reference article for editors: every block of the article editor, the way readers see it on the site.",
    category: "Editorial",
    tags: ["Editor", "Style guide"],
    body: [
      p(text("An article opens with its title, a one-sentence summary and a byline, then the text in one comfortable column. Headings of the second level build the table of contents on the right; on a phone it sits above the text.")),
      p(text("Inline styles stay quiet: "), text("bold", 1), text(" for a term the reader must not miss, "), text("italic", 2), text(" for a nuance, "), text("code", 16), text(" for an exact value, and "), link("/tier-lists", "links"), text(" to other pages of the site.")),
      heading("h2", "Text and lists"),
      p(text("Paragraphs keep a reading line of about seventy characters. Long sections are easier to scan when they are split by third-level headings and short lists.")),
      list("bullet", ["One idea per item.", "Items of a similar length read as a set.", "More than seven items usually want a table."]),
      heading("h3", "Ordered lists"),
      list("number", ["Write the summary first.", "Fill the SEO fields only when the defaults are not good enough.", "Preview the draft, then publish."]),
      heading("h3", "Checklists"),
      list("check", [["Summary fits in one sentence", true], ["Cover image has an alt text", true], ["Russian translation", false]]),
      { type: "quote", children: [text("A quote is for words someone else said: a developer note, a patch line, a reader question.")] },
      heading("h2", "Callouts"),
      block({ blockType: "callout", tone: "info", body: "A note adds context that the reader may skip." }),
      block({ blockType: "callout", tone: "tip", title: "Before you publish", body: "Open the preview from the editor: it is the same page the readers will get." }),
      block({ blockType: "callout", tone: "warning", body: "A warning is for things that cost the reader time or progress if they are missed." }),
      heading("h2", "Steps"),
      block({
        blockType: "steps",
        steps: [
          { title: "Create the article", body: "Admin → Articles → Create new. The slug becomes the address of the page." },
          { title: "Write and structure", body: "Second-level headings become the table of contents." },
          { title: "Preview and publish", body: "Preview shows the draft in the site design; Publish makes it public." },
        ],
      }),
      heading("h2", "Tables"),
      block({
        blockType: "dataTable",
        caption: "Editor blocks and what they are for",
        columns: [{ label: "Block" }, { label: "Use it for" }, { label: "Avoid" }],
        rows: [
          { cells: [{ value: "Callout" }, { value: "A note, tip or warning next to the text" }, { value: "Whole sections" }] },
          { cells: [{ value: "Steps" }, { value: "An order the reader follows" }, { value: "Unordered facts" }] },
          { cells: [{ value: "Table" }, { value: "Values compared across rows" }, { value: "Prose" }] },
          { cells: [{ value: "Spoiler" }, { value: "Detail most readers do not need" }, { value: "Key information" }] },
        ],
      }),
      heading("h2", "Pros and cons"),
      block({
        blockType: "prosCons",
        pros: [{ text: "Easy to scan" }, { text: "Shows a trade-off at a glance" }],
        cons: [{ text: "Loses nuance" }, { text: "Needs balanced items" }],
      }),
      heading("h2", "Images and spoilers"),
      { type: "upload", relationTo: "media", value: media("A figure takes the width of the text column; its caption sits below.", "City artwork of the articles section") },
      block({ blockType: "details", summary: "What a spoiler is for", body: "Long secondary detail — sources, edge cases, history — folds away instead of being deleted." }),
      { type: "horizontalrule" },
      p(text("An article can end with one action that leads somewhere real.")),
      block({ blockType: "button", url: "/wow/articles", label: "All articles" }),
    ],
  },
  ru: {
    title: "Как устроены статьи Gildra",
    summary: "Справочная статья для редакторов: все блоки редактора статей так, как их видят читатели на сайте.",
    category: "Редакция",
    tags: ["Редактор", "Оформление"],
    body: [
      p(text("Статья открывается заголовком, кратким описанием в одно предложение и строкой об авторе, затем идёт текст в одну удобную колонку. Заголовки второго уровня образуют содержание справа; на телефоне оно стоит над текстом.")),
      p(text("Выделения в тексте сдержанные: "), text("жирный", 1), text(" — для термина, который нельзя пропустить, "), text("курсив", 2), text(" — для оттенка смысла, "), text("код", 16), text(" — для точного значения, и "), link("/tier-lists", "ссылки"), text(" на другие страницы сайта.")),
      heading("h2", "Текст и списки"),
      p(text("Абзацы держат строку около семидесяти знаков. Длинные разделы легче просматривать, если их разбить заголовками третьего уровня и короткими списками.")),
      list("bullet", ["Одна мысль — один пункт.", "Пункты похожей длины читаются как набор.", "Больше семи пунктов обычно просят таблицу."]),
      heading("h3", "Нумерованные списки"),
      list("number", ["Сначала напишите краткое описание.", "Заполняйте поля SEO, только если значения по умолчанию не подходят.", "Посмотрите черновик, затем опубликуйте."]),
      heading("h3", "Чек-листы"),
      list("check", [["Описание укладывается в одно предложение", true], ["У обложки есть альтернативный текст", true], ["Английская версия", false]]),
      { type: "quote", children: [text("Цитата — для чужих слов: заметки разработчиков, строки патча, вопроса читателя.")] },
      heading("h2", "Выноски"),
      block({ blockType: "callout", tone: "info", body: "Заметка добавляет контекст, который читатель может пропустить." }),
      block({ blockType: "callout", tone: "tip", title: "Перед публикацией", body: "Откройте предпросмотр из редактора: это та же страница, которую получат читатели." }),
      block({ blockType: "callout", tone: "warning", body: "Предупреждение — для того, что стоит читателю времени или прогресса, если это пропустить." }),
      heading("h2", "Шаги"),
      block({
        blockType: "steps",
        steps: [
          { title: "Создайте статью", body: "Админка → Статьи → Создать. Слаг становится адресом страницы." },
          { title: "Напишите и разметьте", body: "Заголовки второго уровня становятся содержанием." },
          { title: "Проверьте и опубликуйте", body: "Предпросмотр показывает черновик в дизайне сайта; «Опубликовать» открывает его всем." },
        ],
      }),
      heading("h2", "Таблицы"),
      block({
        blockType: "dataTable",
        caption: "Блоки редактора и для чего они",
        columns: [{ label: "Блок" }, { label: "Для чего" }, { label: "Не для" }],
        rows: [
          { cells: [{ value: "Выноска" }, { value: "Заметка, совет или предупреждение рядом с текстом" }, { value: "Целых разделов" }] },
          { cells: [{ value: "Шаги" }, { value: "Порядок, которому следует читатель" }, { value: "Фактов без порядка" }] },
          { cells: [{ value: "Таблица" }, { value: "Значения, которые сравнивают по строкам" }, { value: "Связного текста" }] },
          { cells: [{ value: "Спойлер" }, { value: "Подробности, нужные немногим" }, { value: "Главной информации" }] },
        ],
      }),
      heading("h2", "Плюсы и минусы"),
      block({
        blockType: "prosCons",
        pros: [{ text: "Легко просмотреть" }, { text: "Компромисс виден сразу" }],
        cons: [{ text: "Теряются оттенки" }, { text: "Нужны соразмерные пункты" }],
      }),
      heading("h2", "Изображения и спойлеры"),
      { type: "upload", relationTo: "media", value: media("Иллюстрация занимает ширину колонки текста; подпись стоит под ней.", "Арт города раздела статей") },
      block({ blockType: "details", summary: "Для чего спойлер", body: "Длинные второстепенные подробности — источники, крайние случаи, история — сворачиваются, а не удаляются." }),
      { type: "horizontalrule" },
      p(text("Статья может закончиться одним действием, которое ведёт на настоящую страницу.")),
      block({ blockType: "button", url: "/wow/articles", label: "Все статьи" }),
    ],
  },
} as const;

export function articleFixture(lang: CmsLocale): PublicArticle {
  const c = copy[lang];
  return {
    id: "fixture",
    slug: "article-layout",
    title: c.title,
    summary: c.summary,
    publishedAt: "2026-10-13T09:00:00.000Z",
    updatedAt: "2026-10-13T09:00:00.000Z",
    legacyCategory: null,
    cover: media(null, ""),
    author: { name: "Gildra" },
    categories: [{ id: 1, slug: "editorial", title: c.category }],
    tags: c.tags.map((title, i) => ({ id: i + 1, slug: `tag-${i + 1}`, title })),
    game: { patch: null, season: null, lastReviewedAt: null, wowClass: null, wowSpec: null, wowInstance: null, lolChampion: null, lolRole: null, lolMentionedChampions: [] },
    seo: { title: null, description: null, image: null, noIndex: true },
    content: { root: { type: "root", children: [...c.body] as RichTextNode[] } },
    requestedLocale: lang,
    resolvedLocale: lang,
    availableLocales: ["en", "ru"],
  };
}
