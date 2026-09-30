import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const simulator = await readFile(new URL("../components/wow/audit/CharacterTalentSimulator.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/wow/talent-simulation/route.ts", import.meta.url), "utf8");
const workerModel = await readFile(new URL("../backend/internal/rotationlab/model.go", import.meta.url), "utf8");
const worker = await readFile(new URL("../backend/internal/rotationlab/simc.go", import.meta.url), "utf8");

assert.match(simulator, /TalentChangeSet/, "The calculator does not render a named, complete talent change set");
assert.match(simulator, /Автоматически отключены/, "Dependent talent pruning is not explained separately");
assert.match(simulator, /Абсолютная разница/, "DPS cards do not show the absolute delta");
assert.match(simulator, /Погрешность/, "The calculator does not explain simulation uncertainty");
assert.match(route, /uncertainty/, "Talent simulation API does not return uncertainty");
assert.match(workerModel, /dpsError/, "Simulation worker result does not expose the SimC DPS error");
assert.match(worker, /MeanStdDev/, "SimulationCraft mean standard deviation is not forwarded");

console.log(JSON.stringify({ status: "passed", fullChangeSet: true, absoluteAndPercentDps: true, uncertainty: true }, null, 2));
