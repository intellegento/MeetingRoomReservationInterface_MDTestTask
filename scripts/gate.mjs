#!/usr/bin/env node
// npm run gate — единственный критерий «зелёного» (docs/testing.md, правило 7).
// Шаги идут по порядку; первый упавший шаг делает gate красным.
// Печатает число тестов в каждом прогоне (правило 8).

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPORT_DIR = ".gate";

const hasTestFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).some((entry) =>
    entry.isDirectory()
      ? hasTestFiles(join(dir, entry.name))
      : /\.test\.tsx?$/.test(entry.name),
  );

/** Запуск vitest с JSON-отчётом; число тестов берётся из отчёта, а не из текста. */
function vitestStep(name, tz, filters) {
  const report = join(REPORT_DIR, `vitest-${tz.replace("/", "-")}.json`);
  return {
    name,
    cmd: "npx",
    args: ["vitest", "run", ...filters, "--reporter=default", "--reporter=json", `--outputFile.json=${report}`],
    env: { TZ: tz },
    after: () => {
      const { numTotalTests, numPassedTests, numFailedTests } = JSON.parse(readFileSync(report, "utf8"));
      return `тестов: ${numTotalTests} (passed ${numPassedTests}, failed ${numFailedTests})`;
    },
  };
}

const testsExist = hasTestFiles("src");

const steps = [
  { name: "tsc --noEmit", cmd: "npx", args: ["tsc", "--noEmit"] },
  { name: "eslint", cmd: "npx", args: ["eslint", "--max-warnings", "0", "."] },
  { name: "policy-check", cmd: "node", args: ["scripts/policy-check.mjs"] },
  ...(testsExist
    ? [
        vitestStep("тесты, TZ=UTC", "UTC", []),
        // domain и тесты, помеченные как зависящие от пояса (*.tz.test.ts) — T1.
        vitestStep("тесты domain и *.tz.test, TZ=America/Los_Angeles", "America/Los_Angeles", ["src/domain", ".tz.test."]),
      ]
    : []),
  { name: "next build", cmd: "npx", args: ["next", "build"] },
];

mkdirSync(REPORT_DIR, { recursive: true });
const summary = [];
if (!testsExist) summary.push("тесты: в src нет файлов *.test.ts(x) — 0 тестов");

for (const step of steps) {
  console.log(`\n=== gate: ${step.name} ===`);
  const res = spawnSync(step.cmd, step.args, {
    stdio: "inherit",
    env: { ...process.env, ...step.env },
  });
  if (res.status !== 0) {
    summary.push(`FAIL ${step.name}`);
    console.error(`\n=== gate: КРАСНЫЙ ===\n${summary.join("\n")}`);
    process.exit(1);
  }
  summary.push(`ok   ${step.name}${step.after ? ` — ${step.after()}` : ""}`);
}

console.log(`\n=== gate: ЗЕЛЁНЫЙ ===\n${summary.join("\n")}`);
