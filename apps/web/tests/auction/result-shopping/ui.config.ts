import { defineConfig } from "playwright/test";
export default defineConfig({ testDir: ".", testMatch: ["ui.spec.ts"], timeout: 40_000, expect: { timeout: 5000 }, fullyParallel: true, workers: 2,
  reporter: [["line"], ["json", { outputFile: process.env.AUCTION_UI_RAW_REPORT }]], outputDir: process.env.AUCTION_UI_RESULTS,
  use: { baseURL: process.env.AUCTION_UI_BASE_URL, headless: true, contextOptions: { reducedMotion: "reduce", permissions: ["clipboard-read", "clipboard-write"] },
    screenshot: "only-on-failure", trace: "retain-on-failure", launchOptions: { ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}), args: ["--no-sandbox"] } },
  projects: ["en", "ru"].flatMap(language => [390, 1440].map(width => ({ name: `${language}-${width}`, use: { locale: language === "ru" ? "ru-RU" : "en-GB", viewport: { width, height: 1000 } }, metadata: { language, width } }))),
});
