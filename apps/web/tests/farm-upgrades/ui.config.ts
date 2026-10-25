import { defineConfig } from "playwright/test";
export default defineConfig({
  testDir: ".", testMatch: "ui.spec.ts", timeout: 30_000, fullyParallel: true, workers: 2,
  reporter: [["line"], ["json", { outputFile: process.env.FARM_UI_REPORT }]], outputDir: process.env.FARM_UI_RESULTS,
  use: { baseURL: process.env.FARM_UI_BASE_URL, headless: true, contextOptions: { reducedMotion: "reduce" }, screenshot: "only-on-failure",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ["--no-sandbox"] } },
  projects: ["en", "ru"].flatMap(locale => [390, 1440].map(width => ({ name: `${locale}-${width}`,
    use: { viewport: { width, height: 1000 }, locale: locale === "ru" ? "ru-RU" : "en-US" }, metadata: { locale } }))),
});
