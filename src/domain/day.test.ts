import { describe, expect, it } from "vitest";
import { getEarliestStart, getPastUntil, isPastDate } from "./day";
import type { RoomNow } from "./types";

// Сейчас 2026-10-08 10:10 по Бишкеку (testing.md, правило 4); 01:30 — случай T1.
const AT_1010: RoomNow = { date: "2026-10-08", minutes: 10 * 60 + 10 };
const AT_0130: RoomNow = { date: "2026-10-08", minutes: 60 + 30 };
const AT_1830: RoomNow = { date: "2026-10-08", minutes: 18 * 60 + 30 };

describe("isPastDate", () => {
  it.each([
    { date: "2026-10-07", now: AT_1010, label: "10:10", expected: true },
    { date: "2026-10-08", now: AT_1010, label: "10:10", expected: false },
    { date: "2026-10-09", now: AT_1010, label: "10:10", expected: false },
    { date: "2026-10-07", now: AT_0130, label: "01:30 (T1)", expected: true },
  ])("B6: isPastDate($date) при сейчас 2026-10-08 $label → $expected", ({ date, now, expected }) => {
    expect(isPastDate(date, now)).toBe(expected);
  });
});

describe("getPastUntil", () => {
  it.each([
    { date: "2026-10-08", now: AT_1010, label: "сегодня, 10:10", expected: 610 },
    { date: "2026-10-08", now: AT_0130, label: "сегодня, 01:30 → начало дня", expected: 540 },
    { date: "2026-10-08", now: AT_1830, label: "сегодня, 18:30 → конец дня", expected: 1080 },
    { date: "2026-10-07", now: AT_1010, label: "вчера → весь день", expected: 1080 },
    { date: "2026-10-09", now: AT_1010, label: "завтра → ничего", expected: 540 },
  ])("B6: getPastUntil($date), $label → $expected", ({ date, now, expected }) => {
    expect(getPastUntil(date, now)).toBe(expected);
  });
});

describe("getEarliestStart", () => {
  const at = (minutes: number): RoomNow => ({ date: "2026-10-08", minutes });
  it.each([
    { date: "2026-10-09", now: AT_1010, label: "завтра → начало рабочего дня", expected: "09:00" },
    { date: "2026-10-08", now: AT_1010, label: "сегодня, 10:10 → сейчас", expected: "10:10" },
    { date: "2026-10-08", now: AT_0130, label: "сегодня, 01:30 → начало рабочего дня", expected: "09:00" },
    { date: "2026-10-08", now: at(17 * 60 + 30), label: "сегодня, 17:30 → ещё 30 мин до 18:00", expected: "17:30" },
    { date: "2026-10-08", now: at(17 * 60 + 31), label: "сегодня, 17:31 → до 18:00 меньше 30 мин", expected: null },
    { date: "2026-10-08", now: AT_1830, label: "сегодня, 18:30 → день кончился", expected: null },
    { date: "2026-10-07", now: AT_1010, label: "вчера → прошедшая дата", expected: null },
  ])("B6, B1: getEarliestStart($date), $label → $expected", ({ date, now, expected }) => {
    expect(getEarliestStart(date, now)).toBe(expected);
  });
});
