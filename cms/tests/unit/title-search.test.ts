import { describe, expect, it } from "vitest";
import { searchTitlesInAllLocales } from "../../src/admin/localeSearch";
import { announcePublish } from "../../src/admin/publishCopy";

describe("list search", () => {
  const titleMatch = async () => [7];
  it("also accepts documents whose title matches in another language", async () => {
    expect(await searchTitlesInAllLocales({ or: [{ title: { like: "воин" } }, { slug: { like: "воин" } }] }, titleMatch)).toEqual({
      or: [
        { and: [{ or: [{ title: { like: "воин" } }, { id: { in: [7] } }] }] },
        { slug: { like: "воин" } },
      ],
    });
  });

  it("leaves queries without a title match alone", async () => {
    const where = { site: { equals: 1 } };
    expect(await searchTitlesInAllLocales(where, titleMatch)).toEqual(where);
    expect(await searchTitlesInAllLocales(undefined, titleMatch)).toBeUndefined();
  });
});

describe("publish toast", () => {
  const run = (data: Record<string, unknown>, operation: "update" | "create") => {
    const req = { t: (key: string) => key } as never as { t: (key: string) => string };
    announcePublish({ data, operation, req, collection: {} as never, context: {} } as never);
    return req.t("general:updatedSuccessfully");
  };
  it("says published for a publishing save only", () => {
    expect(run({ _status: "published" }, "update")).toBe("version:publishedSuccessfully");
    expect(run({ _status: "draft" }, "update")).toBe("general:updatedSuccessfully");
    expect(run({ _status: "published" }, "create")).toBe("general:updatedSuccessfully");
  });
});
