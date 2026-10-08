#!/usr/bin/env node
// Проверки правил AGENTS.md, которые не покрывают tsc и ESLint (docs/testing.md,
// «Автоматические проверки правил AGENTS.md»). Без зависимостей.
//
//   node scripts/policy-check.mjs           — gate: файл time-log + история коммитов
//   node scripts/policy-check.mjs --staged  — git-хук pre-commit: индекс перед коммитом
//
// Сейчас реализована проверка time-log. Остальные проверки добавляются на этапе 1.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const TIME_LOG = "docs/time-log.md";

// Коммиты, сделанные до появления правила «любая работа с коммитом пишет date»
// (инцидент INC-2). Проверяются только коммиты после последнего из них.
const BASELINE_COMMIT = "7158d59";

// Строки, у которых время официально не измерено (INC-2). Новые сюда не добавляются.
const UNMEASURED_ROWS = new Set(["0b"]);
const NOT_RECORDED = "не записан";
const NOT_MEASURED = "не измерен";

const DATE_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/;

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });

/** "2026-10-08 20:16:35 +0600" → Date; null, если формат не совпадает. */
function parseDateOutput(value) {
  const m = DATE_RE.exec(value);
  if (!m) return null;
  const [, day, time, sign, hh, mm] = m;
  return new Date(`${day}T${time}${sign}${hh}:${mm}`);
}

function formatDuration(ms) {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Строки таблицы time-log: только строки данных, без заголовка и разделителя. */
function parseRows(markdown) {
  return markdown
    .split("\n")
    .filter((line) => line.startsWith("|") && !/^\|\s*-/.test(line))
    .map((line) => line.slice(1, line.lastIndexOf("|")).split("|").map((c) => c.trim()))
    .filter((cells) => cells[0] !== "этап")
    .map(([stage, start, end, fact, notes]) => ({ stage, start, end, fact, notes }));
}

const rowKey = (row) => row.stage.split(":")[0].trim();

/** Ошибки одной строки time-log. requireComplete — строка должна быть закрыта. */
function checkRow(row, { requireComplete }) {
  const errors = [];
  const where = `${TIME_LOG}, строка «${row.stage}»`;
  const unmeasured = UNMEASURED_ROWS.has(rowKey(row));

  const start = parseDateOutput(row.start);
  if (!start && !(unmeasured && row.start === NOT_RECORDED)) {
    errors.push(`${where}: старт «${row.start}» не в формате date '+%Y-%m-%d %H:%M:%S %z'`);
  }

  if (row.end === "") {
    if (requireComplete) errors.push(`${where}: нет конца — коммит возможен только после записи date`);
    return errors;
  }
  const end = parseDateOutput(row.end);
  if (!end) {
    errors.push(`${where}: конец «${row.end}» не в формате date '+%Y-%m-%d %H:%M:%S %z'`);
    return errors;
  }

  if (unmeasured) {
    if (row.fact !== NOT_MEASURED) errors.push(`${where}: факт должен быть «${NOT_MEASURED}»`);
  } else if (start) {
    if (end < start) errors.push(`${where}: конец раньше старта`);
    const expected = formatDuration(end - start);
    if (row.fact !== expected) errors.push(`${where}: факт «${row.fact}», а конец − старт = ${expected}`);
  }
  return errors;
}

function checkTimeLogFile(content, { requireComplete }) {
  const rows = parseRows(content);
  if (rows.length === 0) return [`${TIME_LOG}: нет ни одной строки`];
  return rows.flatMap((row) => checkRow(row, { requireComplete }));
}

/** Строки time-log, добавленные или изменённые в диффе. */
const changedRows = (diff) =>
  parseRows(
    diff
      .split("\n")
      .filter((l) => l.startsWith("+|"))
      .map((l) => l.slice(1))
      .join("\n"),
  );

function checkStaged() {
  const staged = git("diff", "--cached", "--name-only").split("\n").filter(Boolean);
  if (staged.length === 0) return [];
  if (!staged.includes(TIME_LOG)) {
    return [`коммит не меняет ${TIME_LOG}: у любой работы с коммитом должна быть строка с date (AGENTS.md, «Время — для любой работы»)`];
  }
  const content = git("show", `:${TIME_LOG}`);
  const errors = checkTimeLogFile(content, { requireComplete: false });
  for (const row of changedRows(git("diff", "--cached", "-U0", "--", TIME_LOG))) {
    errors.push(...checkRow(row, { requireComplete: true }));
  }
  return errors;
}

function checkHistory() {
  const commits = git("rev-list", "--reverse", `${BASELINE_COMMIT}..HEAD`).split("\n").filter(Boolean);
  const errors = [];
  for (const sha of commits) {
    const short = sha.slice(0, 7);
    const files = git("show", "--name-only", "--format=", sha).split("\n");
    if (!files.includes(TIME_LOG)) {
      errors.push(`коммит ${short} не меняет ${TIME_LOG}`);
      continue;
    }
    const committedAt = new Date(git("show", "-s", "--format=%cI", sha).trim());
    for (const row of changedRows(git("show", "-U0", "--format=", sha, "--", TIME_LOG))) {
      const rowErrors = checkRow(row, { requireComplete: true });
      errors.push(...rowErrors.map((e) => `коммит ${short}: ${e}`));
      const end = parseDateOutput(row.end);
      if (end && committedAt < end) {
        errors.push(`коммит ${short}: сделан раньше конца строки «${row.stage}» (${row.end})`);
      }
    }
  }
  return errors;
}

function main() {
  const staged = process.argv.includes("--staged");
  // Одна и та же ошибка строки может прийти и из проверки файла, и из проверки диффа.
  const errors = [
    ...new Set(
      staged
        ? checkStaged()
        : [...checkTimeLogFile(readFileSync(TIME_LOG, "utf8"), { requireComplete: false }), ...checkHistory()],
    ),
  ];

  if (errors.length > 0) {
    console.error(`policy-check${staged ? " --staged" : ""}: FAIL`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`policy-check${staged ? " --staged" : ""}: OK`);
}

main();
