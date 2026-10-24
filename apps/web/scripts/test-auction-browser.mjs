import { spawnSync } from "node:child_process";
for (const file of ["auctionBrowser.test.ts", "provider.test.ts"]) {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/atlas/resolve.mjs", `tests/auction/browser/${file}`], { cwd: new URL("../", import.meta.url), stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
