import { describe, expect, it } from "vitest";
import { getAvailableEnds, getEndOptions } from "./end-options";
import type { Booking, RoomNow } from "./types";

const NOW: RoomNow = { date: "2026-10-08", minutes: 610 };
const TODAY = "2026-10-08";
const TOMORROW = "2026-10-09";

const ends = (start: string, options: { date?: string; bookings?: Booking[]; now?: RoomNow; editingId?: string } = {}) =>
  getAvailableEnds({ date: options.date ?? TOMORROW, start }, options.bookings ?? [], options.now ?? NOW, options.editingId);

describe("B10: варианты конца для select", () => {
  it("B10: завтра, броней нет, старт 12:00 → 12:30, 13:00, 13:30, 14:00", () => {
    expect(ends("12:00")).toEqual(["12:30", "13:00", "13:30", "14:00"]);
  });

  it("B10: старт 16:10 → 16:40, 17:10, 17:40 (не позже 18:00)", () => {
    expect(ends("16:10")).toEqual(["16:40", "17:10", "17:40"]);
  });

  it("B10: старт 16:00 → до 18:00 включительно", () => {
    expect(ends("16:00")).toEqual(["16:30", "17:00", "17:30", "18:00"]);
  });

  it("B10: старт 17:30 → только 18:00", () => {
    expect(ends("17:30")).toEqual(["18:00"]);
  });

  it("B10: старт 17:31 → вариантов нет", () => {
    expect(ends("17:31")).toEqual([]);
  });

  it("B10, B6: сегодня в 10:10, есть бронь 11:00–12:00, старт 10:10 → только 10:40", () => {
    const bookings: Booking[] = [{ id: "1", date: TODAY, start: "11:00", end: "12:00" }];
    expect(ends("10:10", { date: TODAY, bookings })).toEqual(["10:40"]);
  });

  it("B10: старт 10:45, есть бронь 11:00–12:00 → вариантов нет", () => {
    const bookings: Booking[] = [{ id: "1", date: TOMORROW, start: "11:00", end: "12:00" }];
    expect(ends("10:45", { bookings })).toEqual([]);
  });

  it("B5, B10: касание следующей брони допустимо: старт 10:00, бронь 11:00–12:00 → 10:30, 11:00", () => {
    const bookings: Booking[] = [{ id: "1", date: TOMORROW, start: "11:00", end: "12:00" }];
    expect(ends("10:00", { bookings })).toEqual(["10:30", "11:00"]);
  });

  it("B10: старт внутри чужой брони → вариантов нет", () => {
    const bookings: Booking[] = [{ id: "1", date: TOMORROW, start: "10:00", end: "11:00" }];
    expect(ends("10:30", { bookings })).toEqual([]);
  });

  it("B10: бронь на другую дату не ограничивает", () => {
    const bookings: Booking[] = [{ id: "1", date: "2026-10-10", start: "12:30", end: "13:00" }];
    expect(ends("12:00", { bookings })).toEqual(["12:30", "13:00", "13:30", "14:00"]);
  });
});

describe("B7: собственная бронь не ограничивает конец", () => {
  const own: Booking = { id: "1", date: TOMORROW, start: "10:00", end: "11:00" };
  const later: Booking = { id: "2", date: TOMORROW, start: "13:00", end: "14:00" };

  it("B7, T4: редактирование id=1 10:00–11:00, старт 10:00 → 10:30, 11:00, 11:30, 12:00", () => {
    expect(ends("10:00", { bookings: [own, later], editingId: "1" })).toEqual(["10:30", "11:00", "11:30", "12:00"]);
  });

  it("B7: та же ситуация без editingId → вариантов нет (своя бронь занимает слот)", () => {
    expect(ends("10:00", { bookings: [own, later] })).toEqual([]);
  });

  it("B7: при редактировании чужая бронь ограничивает: старт 12:00 → 12:30, 13:00", () => {
    expect(ends("12:00", { bookings: [own, later], editingId: "1" })).toEqual(["12:30", "13:00"]);
  });
});

describe("B6, B12, B1: недопустимый старт → вариантов нет", () => {
  it("B6: сегодня старт 10:09 при now=10:10 → вариантов нет", () => {
    expect(ends("10:09", { date: TODAY })).toEqual([]);
  });

  it("B12: сегодня старт 10:10 при now=10:10 → 10:40 … 12:10", () => {
    expect(ends("10:10", { date: TODAY })).toEqual(["10:40", "11:10", "11:40", "12:10"]);
  });

  it("B6: сейчас 17:31, сегодня старт 17:31 → вариантов нет (до 18:00 меньше 30 мин)", () => {
    expect(ends("17:31", { date: TODAY, now: { date: TODAY, minutes: 17 * 60 + 31 } })).toEqual([]);
  });

  it("B6: вчерашняя дата → вариантов нет", () => {
    expect(ends("12:00", { date: "2026-10-07" })).toEqual([]);
  });

  it.each(["08:30", "18:00", "9:00", ""])("B1: старт «%s» → вариантов нет", (start) => {
    expect(ends(start)).toEqual([]);
  });
});

describe("getEndOptions: кандидаты конца с причиной недоступности", () => {
  const options = (start: string, opts: { date?: string; bookings?: Booking[]; editingId?: string } = {}) =>
    getEndOptions({ date: opts.date ?? TOMORROW, start }, opts.bookings ?? [], NOW, opts.editingId).map((option) =>
      option.available
        ? { end: option.end, code: null, conflictId: null }
        : { end: option.end, code: option.reason.code, conflictId: option.reason.conflictWith?.id ?? null },
    );
  const ok = (end: string) => ({ end, code: null, conflictId: null });
  const no = (end: string, code: string, conflictId: string | null = null) => ({ end, code, conflictId });

  it("B10, B1: старт 16:10 → 16:40, 17:10, 17:40 доступны, 18:10 — OUTSIDE_WORKING_HOURS", () => {
    expect(options("16:10")).toEqual([ok("16:40"), ok("17:10"), ok("17:40"), no("18:10", "OUTSIDE_WORKING_HOURS")]);
  });

  it("B10, B5: старт 10:45, бронь 11:00–12:00 → все четыре недоступны, OVERLAP", () => {
    const bookings: Booking[] = [{ id: "1", date: TOMORROW, start: "11:00", end: "12:00" }];
    expect(options("10:45", { bookings })).toEqual([
      no("11:15", "OVERLAP", "1"),
      no("11:45", "OVERLAP", "1"),
      no("12:15", "OVERLAP", "1"),
      no("12:45", "OVERLAP", "1"),
    ]);
  });

  it("B7: правка id=1 10:00–11:00 рядом с id=2 11:00–12:00 → 10:30, 11:00 доступны, 11:30 и 12:00 — OVERLAP с id=2", () => {
    const bookings: Booking[] = [
      { id: "1", date: TOMORROW, start: "10:00", end: "11:00" },
      { id: "2", date: TOMORROW, start: "11:00", end: "12:00" },
    ];
    expect(options("10:00", { bookings, editingId: "1" })).toEqual([
      ok("10:30"),
      ok("11:00"),
      no("11:30", "OVERLAP", "2"),
      no("12:00", "OVERLAP", "2"),
    ]);
  });

  it("B6, B12: сегодня 10:10, старт 10:09 → все недоступны, START_IN_PAST", () => {
    expect(options("10:09", { date: TODAY })).toEqual([
      no("10:39", "START_IN_PAST"),
      no("11:09", "START_IN_PAST"),
      no("11:39", "START_IN_PAST"),
      no("12:09", "START_IN_PAST"),
    ]);
  });

  it.each([
    { start: "12:00", bookings: [] as Booking[], expected: ["12:30", "13:00", "13:30", "14:00"] },
    { start: "16:10", bookings: [] as Booking[], expected: ["16:40", "17:10", "17:40"] },
    { start: "10:45", bookings: [{ id: "1", date: TOMORROW, start: "11:00", end: "12:00" }], expected: [] },
  ])("B10: доступные из getEndOptions совпадают с getAvailableEnds (старт $start)", ({ start, bookings, expected }) => {
    const available = getEndOptions({ date: TOMORROW, start }, bookings, NOW).filter((o) => o.available).map((o) => o.end);
    expect(available).toEqual(expected);
    expect(ends(start, { bookings })).toEqual(expected);
  });
});
