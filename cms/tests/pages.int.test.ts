import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SKIP_REVALIDATION } from "../src/editorial/policy";
import { seedSites } from "../src/seed/sites";
import { as, bootPayload, callEndpoint, makeStaff } from "./helpers/payload";

let payload: Payload;
const sites: Record<string, number> = {};
let owner: Awaited<ReturnType<typeof makeStaff>>;

const legal = (lang: "en" | "ru") => ({
  type: "legal",
  props:
    lang === "ru"
      ? { title: "Политика конфиденциальности", updated: "Обновлено: 22 октября 2026", sections: [{ heading: "Что мы храним", text: "Настройки интерфейса." }], backLabel: "← Назад на Gildra" }
      : { title: "Privacy Policy", updated: "Last updated: October 22, 2026", sections: [{ heading: "What we store", text: "Interface preferences." }], backLabel: "← Back to Gildra" },
});

const quiet = { context: { [SKIP_REVALIDATION]: true } };

/** Message of a rejected write (ValidationError keeps per-field messages in `data.errors`). */
async function rejection(write: Promise<unknown>): Promise<string> {
  try {
    await write;
  } catch (error) {
    const e = error as { message?: string; data?: { errors?: { path: string; message: string }[] } };
    return [e.message, ...(e.data?.errors ?? []).map((x) => `${x.path}: ${x.message}`)].join("\n");
  }
  throw new Error("write was accepted");
}

const publicPage = (site: string, slug: string, locale: string) =>
  callEndpoint(payload, "/public/:site/page", "get", { params: { site }, query: { slug, locale } });

beforeAll(async () => {
  ({ payload } = await bootPayload("pages"));
  await seedSites(payload);
  for (const site of (await payload.find({ collection: "sites", overrideAccess: true })).docs) sites[site.slug] = site.id;
  owner = await makeStaff(payload, { email: "owner@pages.test", owner: true });
});

afterAll(async () => {
  await payload?.db.destroy?.();
});

describe("localized page blocks", () => {
  let id: number;

  it("keeps a separate block list per language", async () => {
    const doc = await payload.create({ collection: "pages", ...as(owner), ...quiet, locale: "en", data: { site: sites.gildra, slug: "wow/privacy", title: "Privacy", blocks: [legal("en")], _status: "published" } as never });
    id = doc.id;
    expect(doc.game).toBe("wow");
    expect(doc.path).toBe("/privacy");
    // English only: the Russian page keeps its code config (no fallback to English blocks).
    const ruBefore = await publicPage("gildra", "wow/privacy", "ru");
    expect(ruBefore.status).toBe(200);
    expect(ruBefore.body.blocks).toBeNull();

    await payload.update({ collection: "pages", id, ...as(owner), ...quiet, locale: "ru", data: { title: "Конфиденциальность", blocks: [legal("ru")], _status: "published" } as never });
    const ru = await publicPage("gildra", "wow/privacy", "ru");
    const en = await publicPage("gildra", "wow/privacy", "en");
    expect(ru.body.blocks[0].props.title).toBe("Политика конфиденциальности");
    expect(en.body.blocks[0].props.title).toBe("Privacy Policy");
  });

  it("refuses a block type typo on publish and on draft saves, naming block and reason", async () => {
    const typo = [{ ...legal("ru"), type: "legall" }];
    const published = await rejection(payload.update({ collection: "pages", id, ...as(owner), ...quiet, locale: "ru", data: { blocks: typo, _status: "published" } as never }));
    expect(published).toMatch(/blocks: Блок 1 «legall»: неизвестный тип блока\. Для этой страницы доступны: legal\./);
    const draft = await rejection(payload.update({ collection: "pages", id, ...as(owner), ...quiet, locale: "ru", draft: true, data: { blocks: typo } as never }));
    expect(draft).toMatch(/«legall»/);
    // Nothing changed on the site.
    expect((await publicPage("gildra", "wow/privacy", "ru")).body.blocks[0].type).toBe("legal");
  });

  it("names the field and the reason for contract violations", async () => {
    const broken = { type: "legal", props: { title: "T", updated: "U", sections: [{ heading: 3, text: "x" }], backLabel: "B", extra: true } };
    const message = await rejection(payload.update({ collection: "pages", id, ...as(owner), ...quiet, data: { blocks: [broken] } as never }));
    expect(message).toMatch(/Блок 1 «legal» \(Юридический текст\), поле sections\[1\]\.heading: ожидается строка\./);
    expect(message).toMatch(/поле extra: сайт не знает такого поля\. Поля блока: title, updated, sections, backLabel\./);
    const notList = await rejection(payload.update({ collection: "pages", id, ...as(owner), ...quiet, data: { blocks: "{" } as never }));
    expect(notList).toMatch(/blocks: /);
  });

  it("uses the editor's language for messages", async () => {
    const { createLocalReq } = await import("payload");
    const local = await createLocalReq({ user: owner as never }, payload);
    local.i18n = { ...local.i18n, language: "en" } as never;
    const message = await rejection(payload.update({ collection: "pages", id, req: local, overrideAccess: false, user: owner as never, ...quiet, data: { blocks: [{ type: "legall" }, { type: "legal", props: { title: 1 } }] } as never }));
    expect(message).toMatch(/Block 1 "legall": unknown block type\. Allowed on this page: legal\./);
    expect(message).toMatch(/Block 2 "legal" \(Legal text\), field title: expected string\./);
  });

  it("only allows the page's own blocks and nesting on containers", async () => {
    const tier = await payload.create({ collection: "pages", ...as(owner), ...quiet, data: { site: sites.gildra, slug: "wow/tier-lists", title: "Tier lists", blocks: [{ type: "container", children: [{ type: "wow.tierWorkspace" }] }] } as never });
    expect(tier.blocks).toEqual([{ type: "container", children: [{ type: "wow.tierWorkspace" }] }]);
    const legalOnTier = await rejection(payload.update({ collection: "pages", id: tier.id, ...as(owner), ...quiet, data: { blocks: [legal("en")] } as never }));
    expect(legalOnTier).toMatch(/Блок 1 «legal» \(Юридический текст\): этот блок нельзя поставить на эту страницу\. Доступны: columns, container, sectionNav, wow\.tierWorkspace\./);
    const childOnLeaf = await rejection(payload.update({ collection: "pages", id: tier.id, ...as(owner), ...quiet, data: { blocks: [{ type: "wow.tierWorkspace", children: [] }] } as never }));
    expect(childOnLeaf).toMatch(/поле children: вложенные блоки есть только у контейнеров/);
    const nested = await rejection(payload.update({ collection: "pages", id: tier.id, ...as(owner), ...quiet, data: { blocks: [{ type: "container", children: [{ type: "sectionNav", props: { active: "nowhere" } }] }] } as never }));
    expect(nested).toMatch(/Блок 1 → 1 «sectionNav» \(Навигация по разделам\), поле active: ожидается "meta" \| "overview"/);
  });

  it("picks the page id from the site's list and keeps it fixed", async () => {
    const unknown = await rejection(payload.create({ collection: "pages", ...as(owner), ...quiet, data: { site: sites.gildra, slug: "wow/home", title: "Home" } as never }));
    expect(unknown).toMatch(/Страницу «wow\/home» нельзя переопределить из CMS\. Доступны: lol\/home, wow\/privacy, wow\/tier-lists\./);
    const otherSite = await rejection(payload.create({ collection: "pages", ...as(owner), ...quiet, data: { site: sites.riftden, slug: "wow/privacy", title: "Privacy" } as never }));
    expect(otherSite).toMatch(/Доступны: league-of-legends\/home/);
    const renamed = await rejection(payload.update({ collection: "pages", id, ...as(owner), ...quiet, data: { slug: "wow/tier-lists" } as never }));
    expect(renamed).toMatch(/нельзя сменить после создания/);
    const riftden = await payload.create({ collection: "pages", ...as(owner), ...quiet, data: { site: sites.riftden, slug: "league-of-legends/home", title: "Home", blocks: [{ type: "lol.hero", props: { eyebrow: "E", title: "T", description: "D" } }] } as never });
    expect(riftden.game).toBe("league-of-legends");
  });
});
