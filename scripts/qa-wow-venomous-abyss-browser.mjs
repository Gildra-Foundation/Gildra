import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const root = process.cwd();
const baseUrl = (process.env.QA_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const reportPath = process.env.QA_REPORT
  ? path.resolve(root, process.env.QA_REPORT)
  : path.join(root, "docs/reports/wow/venomous-abyss-browser-verification.json");
const sourceAudit = JSON.parse(await fs.readFile(path.join(root, "data/wow/venomous-abyss-source-audit.json"), "utf8"));
const descriptionAudit = JSON.parse(await fs.readFile(path.join(root, "data/wow/venomous-abyss-description-audit.json"), "utf8"));
const issues = [];
const routes = [];
const totals = { pages: 0, abilityCards: 0, publishedDescriptions: 0, withheldDescriptions: 0, images: 0 };
const normalizeRenderedText = (value) => value?.normalize("NFC").replace(/\s+/gu, " ").trim();

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];
  const badResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`));
  page.on("response", (response) => {
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
  });

  for (const locale of ["en", "ru"]) {
    for (const encounter of sourceAudit.encounters) {
      const route = `${locale === "ru" ? "/ru" : ""}/wow/raids/venomous-abyss/${encounter.canonicalSlug}`;
      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 30_000 });
      const routeIssues = [];
      if (response?.status() !== 200) routeIssues.push(`http-status:${response?.status() ?? "none"}`);
      const list = page.getByTestId("verified-ability-list");
      if (await list.count() !== 1) routeIssues.push("verified-ability-list-missing");
      const cards = page.getByTestId("verified-ability");
      const expectedCards = encounter.overviewAbilities.length;
      const actualCards = await cards.count();
      if (actualCards !== expectedCards) routeIssues.push(`ability-card-count:${actualCards}/${expectedCards}`);
      totals.pages += 1;
      totals.abilityCards += actualCards;

      for (const expectedAbility of encounter.overviewAbilities) {
        const auditAbility = descriptionAudit.abilities.find((candidate) => candidate.spellId === expectedAbility.spellId);
        const card = page.locator(`[data-testid="verified-ability"][data-spell-id="${expectedAbility.spellId}"]`);
        if (await card.count() !== 1) {
          routeIssues.push(`ability-card-missing:${expectedAbility.spellId}`);
          continue;
        }
        const expectedStatus = auditAbility?.publicationSafe ? "verified" : "withheld_unresolved_tokens";
        if (await card.getAttribute("data-description-status") !== expectedStatus) {
          routeIssues.push(`description-status-mismatch:${expectedAbility.spellId}`);
        }
        const published = card.getByTestId("verified-ability-description");
        const withheld = card.getByTestId("withheld-ability-description");
        if (auditAbility?.publicationSafe) {
          totals.publishedDescriptions += 1;
          if (await published.count() !== 1 || await withheld.count() !== 0) routeIssues.push(`published-state-invalid:${expectedAbility.spellId}`);
          const expectedText = normalizeRenderedText(auditAbility.publicationCandidate.descriptions[locale]);
          const actualText = normalizeRenderedText(await published.textContent());
          if (actualText !== expectedText) routeIssues.push(`published-text-mismatch:${expectedAbility.spellId}`);
          if (actualText?.includes("$")) routeIssues.push(`published-token-leak:${expectedAbility.spellId}`);
        } else {
          totals.withheldDescriptions += 1;
          if (await withheld.count() !== 1 || await published.count() !== 0) routeIssues.push(`withheld-state-invalid:${expectedAbility.spellId}`);
        }
        const image = card.locator("img");
        if (await image.count() !== 1) routeIssues.push(`ability-image-missing:${expectedAbility.spellId}`);
        else {
          totals.images += 1;
          const rendered = await image.evaluate((element) => ({
            complete: element.complete,
            naturalWidth: element.naturalWidth,
            naturalHeight: element.naturalHeight,
          }));
          if (!rendered.complete || rendered.naturalWidth <= 0 || rendered.naturalHeight <= 0) {
            routeIssues.push(`ability-image-broken:${expectedAbility.spellId}`);
          }
        }
      }
      routes.push({ route, locale, expectedCards, actualCards, issues: routeIssues });
      issues.push(...routeIssues.map((issue) => `${route}:${issue}`));
    }
  }

  const expectedTotals = {
    pages: 16,
    abilityCards: 74,
    publishedDescriptions: 24,
    withheldDescriptions: 50,
    images: 74,
  };
  for (const [key, expected] of Object.entries(expectedTotals)) {
    if (totals[key] !== expected) issues.push(`total-${key}:${totals[key]}/${expected}`);
  }
  issues.push(...consoleErrors.map((issue) => `console-error:${issue}`));
  issues.push(...pageErrors.map((issue) => `page-error:${issue}`));
  issues.push(...requestFailures.map((issue) => `request-failed:${issue}`));
  issues.push(...badResponses.map((issue) => `bad-response:${issue}`));

  const report = {
    summary: {
      generatedAt: new Date().toISOString(),
      baseUrl,
      viewport: { width: 390, height: 844 },
      ...totals,
      consoleErrors: consoleErrors.length,
      pageErrors: pageErrors.length,
      requestFailures: requestFailures.length,
      badResponses: badResponses.length,
      verified: issues.length === 0,
      violations: issues.length,
    },
    routes,
    issues,
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.summary, null, 2));
} finally {
  await browser.close();
}

if (issues.length) process.exitCode = 1;
