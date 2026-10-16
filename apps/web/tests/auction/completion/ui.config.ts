import { defineConfig } from "playwright/test";

export default defineConfig({
  testDir: process.env.AUCTION_COMPLETION_UI_LEGACY ? "../reliability" : ".", testMatch: process.env.AUCTION_COMPLETION_UI_LEGACY ? ["ui.spec.ts", "ui-capture.spec.ts"] : ["ui.spec.ts"], timeout: 40_000,
  expect: { timeout: 2500 }, fullyParallel: true, workers: 2, retries: 0,
  reporter: [["line"], ["json", { outputFile: process.env.AUCTION_UI_RAW_REPORT }]],
  outputDir: process.env.AUCTION_UI_RESULTS,
  use: { baseURL: process.env.AUCTION_UI_BASE_URL, headless: true, contextOptions: { reducedMotion: "reduce" },
    screenshot: "only-on-failure", trace: "retain-on-failure",
    launchOptions: { ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}), args: ["--no-sandbox"] } },
  projects: ["en", "ru"].flatMap(locale => [390, 1440].map(width => ({
    name: `${locale}-${width}`, use: { locale: locale === "ru" ? "ru-RU" : "en-US", viewport: { width, height: 1000 } },
    metadata: { language: locale, width },
  }))),
});
