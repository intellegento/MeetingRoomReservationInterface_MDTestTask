import { describe, expect, it } from "vitest";
import { overlaps } from "./overlap";
import { validateBooking } from "./rules";
import type { Booking, BookingInput, RoomNow, ValidationResult } from "./types";

const NOW: RoomNow = { date: "2026-10-08", minutes: 610 };
const TOMORROW = "2026-10-09";

const at = (start: number, end: number) => ({ start, end });

describe("overlaps: [s1,e1) и [s2,e2) пересекаются, если s1 < e2 && s2 < e1", () => {
  it.each([
    ["касание справа 10:00–11:00 / 11:00–12:00", false, at(600, 660), at(660, 720)],
    ["касание слева 11:00–12:00 / 10:00–11:00", false, at(660, 720), at(600, 660)],
    ["разнесены 09:00–09:30 / 11:00–12:00", false, at(540, 570), at(660, 720)],
    ["пересечение на 1 минуту 10:00–11:01 / 11:00–12:00", true, at(600, 661), at(660, 720)],
    ["пересечение справа 10:00–11:00 / 10:30–11:30", true, at(600, 660), at(630, 690)],
    ["пересечение слева 10:00–11:00 / 09:30–10:30", true, at(600, 660), at(570, 630)],
    ["совпадение 10:00–11:00 / 10:00–11:00", true, at(600, 660), at(600, 660)],
    ["вложение 10:00–11:00 / 10:15–10:45", true, at(600, 660), at(615, 645)],
    ["накрытие 10:00–11:00 / 09:30–11:30", true, at(600, 660), at(570, 690)],
  ])("B5, T3: %s → пересекаются: %s", (_name, expected, a, b) => {
    expect(overlaps(a, b)).toBe(expected);
    expect(overlaps(b, a)).toBe(expected);
  });
});

const input = (start: string, end: string, date = TOMORROW): BookingInput => ({ date, start, end });
const validate = (value: BookingInput, bookings: Booking[], editingId?: string): ValidationResult =>
  validateBooking(value, editingId === undefined ? { bookings, now: NOW } : { bookings, now: NOW, editingId });

describe("B5: пересечения с существующей бронью 10:00–11:00 на 2026-10-09", () => {
  const existing: Booking = { id: "1", date: TOMORROW, start: "10:00", end: "11:00" };

  it.each([
    ["11:00", "12:00", TOMORROW, "касание справа"],
    ["09:00", "10:00", TOMORROW, "касание слева"],
    ["10:00", "11:00", "2026-10-10", "другая дата"],
  ])("B5: %s–%s (%s) → принято (%s)", (start, end, date) => {
    expect(validate(input(start, end, date), [existing])).toEqual({ ok: true });
  });

  it.each([
    ["10:30", "11:30", "пересечение справа"],
    ["09:30", "10:30", "пересечение слева"],
    ["10:00", "11:00", "совпадает"],
    ["10:15", "10:45", "внутри существующей"],
    ["09:30", "11:30", "накрывает существующую"],
  ])("B5: %s–%s → OVERLAP с conflictWith (%s)", (start, end) => {
    const result = validate(input(start, end), [existing]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ code: "OVERLAP", conflictWith: existing });
  });
});

describe("B7: редактирование — бронь не конфликтует сама с собой", () => {
  const planning: Booking = { id: "1", date: TOMORROW, start: "10:00", end: "11:00", title: "Планёрка" };
  const next: Booking = { id: "2", date: TOMORROW, start: "11:00", end: "12:00" };
  const bookings = [planning, next];

  it.each([
    ["10:00", "10:30", "сжатие"],
    ["09:30", "10:30", "сдвиг влево внутри себя"],
    ["10:00", "11:00", "те же значения"],
  ])("B7, T4: id=1 → %s–%s → принято (%s)", (start, end) => {
    expect(validate(input(start, end), bookings, "1")).toEqual({ ok: true });
  });

  it("B7, T4: без editingId 10:00–10:30 конфликтует с id=1 (самоконфликт исключается только при редактировании)", () => {
    const result = validate(input("10:00", "10:30"), bookings);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({ code: "OVERLAP", conflictWith: { id: "1" } });
  });

  it.each([
    ["10:30", "11:30"],
    ["11:00", "11:30"],
  ])("B7: id=1 → %s–%s → OVERLAP, conflictWith.id = 2", (start, end) => {
    const result = validate(input(start, end), bookings, "1");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({ code: "OVERLAP", conflictWith: { id: "2" } });
  });

  it("B7: id=1 → 10:00–10:50 → DURATION_STEP (склеенный результат 50 мин)", () => {
    const result = validate(input("10:00", "10:50"), bookings, "1");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({ code: "DURATION_STEP", field: "end" });
  });
});
