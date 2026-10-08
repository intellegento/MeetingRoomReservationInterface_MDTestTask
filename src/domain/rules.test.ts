import { afterEach, describe, expect, it, vi } from "vitest";
import { ROOM_TIMEZONE } from "./constants";
import { MESSAGES, bookingsOverlap, isBookingLocked, normalizeTitle, validateBooking, validateStart } from "./rules";
import { getRoomNow } from "./time";
import type { Booking, BookingInput, RoomNow, ValidationContext, ValidationErrorCode, ValidationResult } from "./types";

// «Сейчас» по умолчанию — 2026-10-08 (чт) 10:10:00 по Бишкеку (docs/requirements.md, «Общие условия»).
const NOW: RoomNow = { date: "2026-10-08", minutes: 610 };
const TODAY = "2026-10-08";
const YESTERDAY = "2026-10-07";
const TOMORROW = "2026-10-09";
const SATURDAY = "2026-10-10";

const input = (start: string, end: string, date = TOMORROW, title?: string): BookingInput =>
  title === undefined ? { date, start, end } : { date, start, end, title };

const validate = (value: BookingInput, context: Partial<ValidationContext> = {}): ValidationResult =>
  validateBooking(value, { bookings: [], now: NOW, ...context });

const codes = (result: ValidationResult): ValidationErrorCode[] => (result.ok ? [] : result.errors.map((e) => e.code));

/** Первая ошибка: её возвращает сервер (порядок проверок). */
const firstError = (result: ValidationResult) => {
  expect(result.ok).toBe(false);
  const [first] = result.ok ? [] : result.errors;
  if (first === undefined) throw new Error("ожидалась хотя бы одна ошибка валидации");
  return first;
};

const expectOk = (result: ValidationResult) => expect(result).toEqual({ ok: true });

describe("B1: рабочий день 09:00–18:00", () => {
  it.each([
    ["09:00", "09:30", TOMORROW],
    ["17:30", "18:00", TOMORROW],
    ["09:00", "09:30", SATURDAY],
  ])("B1: %s–%s (%s) → принято", (start, end, date) => {
    expectOk(validate(input(start, end, date)));
  });

  it.each([
    ["08:59", "09:29", "start"],
    ["08:30", "09:30", "start"],
    ["17:59", "18:29", "end"],
    ["18:00", "18:30", "end"],
    ["18:30", "19:00", "start"],
  ] as const)("B1: %s–%s → OUTSIDE_WORKING_HOURS у поля %s", (start, end, field) => {
    expect(firstError(validate(input(start, end)))).toMatchObject({ code: "OUTSIDE_WORKING_HOURS", field });
  });

  it.each([
    [input("9:00", "09:30"), "start"],
    [input("25:00", "09:30"), "start"],
    [input("10:60", "11:00"), "start"],
    [input("10:00", "10:60"), "end"],
    [input("", "09:30"), "start"],
    [input("09:00", ""), "end"],
    [input("09:00", "09:30", "2026-13-01"), "date"],
    [input("09:00", "09:30", ""), "date"],
  ] as const)("B1: формат %j → INVALID_REQUEST у поля %s (400)", (value, field) => {
    expect(firstError(validate(value))).toMatchObject({ code: "INVALID_REQUEST", field });
  });
});

describe("B2: start < end", () => {
  it.each([
    ["10:00", "10:00"],
    ["11:00", "10:00"],
  ])("B2: %s–%s → START_NOT_BEFORE_END у поля end", (start, end) => {
    expect(firstError(validate(input(start, end)))).toMatchObject({ code: "START_NOT_BEFORE_END", field: "end" });
  });

  it("B2: 10:00–10:30 → принято", () => {
    expectOk(validate(input("10:00", "10:30")));
  });

  it("B2: при start ≥ end проверки длительности не добавляют ошибок", () => {
    expect(codes(validate(input("11:00", "10:00")))).toEqual(["START_NOT_BEFORE_END"]);
  });
});

describe("B3, B4, B10: длительность 30–120 минут, шаг 30", () => {
  it.each([
    [29, "10:00", "10:29", "DURATION_TOO_SHORT"],
    [30, "10:00", "10:30", null],
    [31, "10:00", "10:31", "DURATION_STEP"],
    [45, "10:00", "10:45", "DURATION_STEP"],
    [60, "10:00", "11:00", null],
    [90, "10:00", "11:30", null],
    [120, "10:00", "12:00", null],
    [121, "10:00", "12:01", "DURATION_TOO_LONG"],
    [150, "10:00", "12:30", "DURATION_TOO_LONG"],
  ] as const)("B3/B4/B10: %i мин (%s–%s) → %s", (_minutes, start, end, code) => {
    const result = validate(input(start, end));
    if (code === null) expectOk(result);
    else expect(firstError(result)).toMatchObject({ code, field: "end" });
  });

  it.each([
    ["10:10", "10:40"],
    ["10:10", "11:40"],
    ["10:10", "12:10"],
  ])("B10: начало — любая минута: %s–%s → принято", (start, end) => {
    expectOk(validate(input(start, end)));
  });

  it.each([
    ["10:10", "10:50"],
    ["10:00", "11:15"],
    ["16:10", "18:00"],
  ])("B10: %s–%s → DURATION_STEP", (start, end) => {
    expect(firstError(validate(input(start, end)))).toMatchObject({ code: "DURATION_STEP", field: "end" });
  });

  it("B4, B10: 121 мин нарушает оба правила, первым идёт DURATION_TOO_LONG (порядок B4 → B10)", () => {
    expect(codes(validate(input("10:00", "12:01")))).toEqual(["DURATION_TOO_LONG", "DURATION_STEP"]);
  });
});

describe("B6, B12: прошедшее время с точностью до минуты", () => {
  it("B6: сегодня 10:10–10:40 при now=10:10 → принято (старт = сейчас)", () => {
    expectOk(validate(input("10:10", "10:40", TODAY)));
  });

  it("B6, B12: сегодня 10:09–10:39 при now=10:10 → START_IN_PAST у поля start", () => {
    expect(firstError(validate(input("10:09", "10:39", TODAY)))).toMatchObject({ code: "START_IN_PAST", field: "start" });
  });

  it("B6: сегодня 10:00–10:30 при now=10:10 (слот уже начался) → START_IN_PAST", () => {
    expect(firstError(validate(input("10:00", "10:30", TODAY)))).toMatchObject({ code: "START_IN_PAST", field: "start" });
  });

  it("B6: завтра 09:00–09:30 → принято", () => {
    expectOk(validate(input("09:00", "09:30", TOMORROW)));
  });

  it("B6: вчера 14:00–14:30 → DATE_IN_PAST у поля date", () => {
    expect(firstError(validate(input("14:00", "14:30", YESTERDAY)))).toMatchObject({ code: "DATE_IN_PAST", field: "date" });
  });

  it("B6: вчера 09:00–09:30 (старт и раньше now) → только DATE_IN_PAST, без START_IN_PAST", () => {
    expect(codes(validate(input("09:00", "09:30", YESTERDAY)))).toEqual(["DATE_IN_PAST"]);
  });

  it("B6: завтра 09:00–09:30 (старт раньше now по минутам) → принято: START_IN_PAST только для сегодня", () => {
    expectOk(validate(input("09:00", "09:30", TOMORROW)));
  });

  it("B6: 2099-12-31 09:00–09:30 → принято (горизонта нет, Q14)", () => {
    expectOk(validate(input("09:00", "09:30", "2099-12-31")));
  });

  it("B6: старт 10:40 после брони 10:10–10:40 при now=10:10 → принято", () => {
    const bookings: Booking[] = [{ id: "1", date: TODAY, start: "10:10", end: "10:40" }];
    expectOk(validate(input("10:40", "11:10", TODAY), { bookings }));
  });

  it.each([
    ["2026-10-08T04:10:00Z", true],
    ["2026-10-08T04:10:59Z", true],
    ["2026-10-08T04:11:00Z", false],
  ])("B12: сегодня старт 10:10, сейчас %s → принято: %s", (instant, accepted) => {
    const now = getRoomNow(new Date(instant), ROOM_TIMEZONE);
    const result = validate(input("10:10", "10:40", TODAY), { now });
    if (accepted) expectOk(result);
    else expect(firstError(result)).toMatchObject({ code: "START_IN_PAST", field: "start" });
  });

  it("B9, T1: сейчас 2026-10-07T19:30Z (по Бишкеку 08.10 01:30): 2026-10-07 — прошедшая дата", () => {
    const now = getRoomNow(new Date("2026-10-07T19:30:00Z"), ROOM_TIMEZONE);
    expect(firstError(validate(input("09:00", "09:30", "2026-10-07"), { now }))).toMatchObject({
      code: "DATE_IN_PAST",
      field: "date",
    });
  });

  it("B9, T1: сейчас 2026-10-07T19:30Z: 2026-10-08 09:00–09:30 — сегодня и ещё не прошло", () => {
    const now = getRoomNow(new Date("2026-10-07T19:30:00Z"), ROOM_TIMEZONE);
    expectOk(validate(input("09:00", "09:30", "2026-10-08"), { now }));
  });
});

describe("B9, T2: системные часы не влияют на domain", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(["2020-01-01T00:00:00Z", "2030-06-15T12:00:00Z"])(
    "B9: при системном времени %s результат определяется только переданным now",
    (systemTime) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(systemTime));
      expectOk(validate(input("10:10", "10:40", TODAY)));
      expect(firstError(validate(input("10:09", "10:39", TODAY)))).toMatchObject({ code: "START_IN_PAST" });
      expect(isBookingLocked({ id: "1", date: TODAY, start: "10:11", end: "10:41" }, NOW)).toBe(false);
    },
  );
});

describe("B11: начавшиеся и прошедшие брони только для чтения", () => {
  it.each([
    [TODAY, "10:00", "10:30", true, "идёт"],
    [TODAY, "10:10", "10:40", true, "начинается сейчас"],
    [TODAY, "10:11", "10:41", false, "начнётся через минуту"],
    [YESTERDAY, "14:00", "14:30", true, "вчера"],
    [TOMORROW, "09:00", "09:30", false, "завтра"],
  ])("B11: бронь %s %s–%s → заблокирована: %s (%s)", (date, start, end, locked) => {
    expect(isBookingLocked({ id: "1", date, start, end }, NOW)).toBe(locked);
  });

  it("B11: правка начавшейся брони → BOOKING_LOCKED, даже если новые значения допустимы", () => {
    const bookings: Booking[] = [{ id: "1", date: TODAY, start: "10:00", end: "10:30" }];
    expect(firstError(validate(input("11:00", "11:30", TODAY), { bookings, editingId: "1" }))).toMatchObject({
      code: "BOOKING_LOCKED",
    });
  });

  it("B11: правка брони, начинающейся сейчас (10:10) → BOOKING_LOCKED", () => {
    const bookings: Booking[] = [{ id: "1", date: TODAY, start: "10:10", end: "10:40" }];
    expect(firstError(validate(input("11:00", "11:30", TODAY), { bookings, editingId: "1" }))).toMatchObject({
      code: "BOOKING_LOCKED",
    });
  });

  it("B11: правка вчерашней брони на завтра → BOOKING_LOCKED", () => {
    const bookings: Booking[] = [{ id: "1", date: YESTERDAY, start: "14:00", end: "14:30" }];
    expect(firstError(validate(input("14:00", "14:30", TOMORROW), { bookings, editingId: "1" }))).toMatchObject({
      code: "BOOKING_LOCKED",
    });
  });

  it("B11: правка брони 10:11–10:41 (ещё не началась) → принято", () => {
    const bookings: Booking[] = [{ id: "1", date: TODAY, start: "10:11", end: "10:41" }];
    expectOk(validate(input("10:30", "11:00", TODAY), { bookings, editingId: "1" }));
  });

  it("B11: блокировка проверяется первой — раньше формата и B1", () => {
    const bookings: Booking[] = [{ id: "1", date: TODAY, start: "10:00", end: "10:30" }];
    expect(firstError(validate(input("08:00", "9:00", TODAY), { bookings, editingId: "1" }))).toMatchObject({
      code: "BOOKING_LOCKED",
    });
  });
});

describe("F4: название", () => {
  it.each([
    ["Демо", true],
    ["  Демо  ", true],
    ["", true],
    ["   ", true],
    ["а".repeat(100), true],
    [` ${"а".repeat(100)} `, true],
    ["а".repeat(101), false],
  ])("F4: title %j → принято: %s", (title, accepted) => {
    const result = validate(input("10:00", "10:30", TOMORROW, title));
    if (accepted) expectOk(result);
    else expect(firstError(result)).toMatchObject({ code: "TITLE_TOO_LONG", field: "title" });
  });
});

describe("Порядок проверок: B11 → формат → B1 → B2 → B3 → B4 → B10 → B6 → B12 → title → B5", () => {
  const busy: Booking[] = [{ id: "9", date: TODAY, start: "09:00", end: "12:00" }];

  it("B1 раньше B2: 18:30–18:00 → OUTSIDE_WORKING_HOURS", () => {
    expect(firstError(validate(input("18:30", "18:00")))).toMatchObject({ code: "OUTSIDE_WORKING_HOURS" });
  });

  it("B2 раньше B3: 10:00–10:00 → START_NOT_BEFORE_END, а не DURATION_TOO_SHORT", () => {
    expect(firstError(validate(input("10:00", "10:00")))).toMatchObject({ code: "START_NOT_BEFORE_END" });
  });

  it("B10 раньше B6: сегодня 09:00–09:45 → DURATION_STEP, затем START_IN_PAST", () => {
    expect(codes(validate(input("09:00", "09:45", TODAY)))).toEqual(["DURATION_STEP", "START_IN_PAST"]);
  });

  it("B6 раньше title и B5: сегодня 10:00–10:30, 101 символ, занято → START_IN_PAST, TITLE_TOO_LONG, OVERLAP", () => {
    expect(codes(validate(input("10:00", "10:30", TODAY, "а".repeat(101)), { bookings: busy }))).toEqual([
      "START_IN_PAST",
      "TITLE_TOO_LONG",
      "OVERLAP",
    ]);
  });

  it("B1: при неверном формате (400) остальные правила не проверяются", () => {
    expect(codes(validate(input("9:00", "18:30", YESTERDAY), { bookings: busy }))).toEqual(["INVALID_REQUEST"]);
  });
});

describe("Сообщения на русском (Q17)", () => {
  const lockedBookings: Booking[] = [{ id: "1", date: TODAY, start: "10:00", end: "10:30" }];
  const busy: Booking[] = [{ id: "2", date: TOMORROW, start: "10:00", end: "11:00" }];

  it.each([
    ["B11", "BOOKING_LOCKED", input("11:00", "11:30", TODAY), { bookings: lockedBookings, editingId: "1" }],
    ["B1", "INVALID_REQUEST", input("9:00", "09:30"), {}],
    ["B1", "OUTSIDE_WORKING_HOURS", input("08:30", "09:30"), {}],
    ["B2", "START_NOT_BEFORE_END", input("10:00", "10:00"), {}],
    ["B3", "DURATION_TOO_SHORT", input("10:00", "10:29"), {}],
    ["B4", "DURATION_TOO_LONG", input("10:00", "12:30"), {}],
    ["B10", "DURATION_STEP", input("10:00", "10:45"), {}],
    ["B6", "DATE_IN_PAST", input("10:00", "10:30", YESTERDAY), {}],
    ["B12", "START_IN_PAST", input("10:00", "10:30", TODAY), {}],
    ["F4", "TITLE_TOO_LONG", input("10:00", "10:30", TOMORROW, "а".repeat(101)), {}],
    ["B5", "OVERLAP", input("10:30", "11:30"), { bookings: busy }],
  ] as const)("%s: %s — непустое сообщение на русском", (_id, code, value, context) => {
    const error = firstError(validate(value, context));
    expect(error.code).toBe(code);
    expect(error.message).toMatch(/[А-Яа-яЁё]{3,}/);
  });
});

describe("F4: normalizeTitle (Q6)", () => {
  it.each([
    ["пробелы по краям", "  Демо  ", "Демо"],
    ["пробелы внутри сохраняются", "  Демо  дня ", "Демо  дня"],
    ["пустая строка → нет названия", "", undefined],
    ["строка из пробелов → нет названия", "   ", undefined],
    ["undefined → нет названия", undefined, undefined],
  ])("F4: %s: %j → %j", (_case, title, expected) => {
    expect(normalizeTitle(title)).toBe(expected);
  });

  it("F4: ровно 100 символов — без изменений, validateBooking принимает", () => {
    const title = normalizeTitle(` ${"я".repeat(100)} `);
    expect(title).toBe("я".repeat(100));
    expectOk(validate(input("10:00", "10:30", TOMORROW, title)));
  });

  it("F4: 101 символ — normalizeTitle не обрезает, validateBooking → TITLE_TOO_LONG", () => {
    const title = normalizeTitle("я".repeat(101));
    expect(title).toBe("я".repeat(101));
    expect(firstError(validate(input("10:00", "10:30", TOMORROW, title)))).toMatchObject({ code: "TITLE_TOO_LONG", field: "title" });
  });
});

describe("B5: bookingsOverlap", () => {
  const at = (start: string, end: string, date = TOMORROW): BookingInput => ({ date, start, end });

  it.each([
    ["касание справа", false, at("10:00", "11:00"), at("11:00", "12:00")],
    ["касание слева", false, at("11:00", "12:00"), at("10:00", "11:00")],
    ["вложение", true, at("10:15", "10:45"), at("10:00", "11:00")],
    ["накрывает", true, at("09:30", "11:30"), at("10:00", "11:00")],
    ["равные интервалы", true, at("10:00", "11:00"), at("10:00", "11:00")],
    ["частичное пересечение", true, at("10:30", "11:30"), at("10:00", "11:00")],
    ["равные интервалы на разных датах", false, at("10:00", "11:00", TOMORROW), at("10:00", "11:00", SATURDAY)],
  ])("B5: %s → %s", (_case, expected, a, b) => {
    expect(bookingsOverlap(a, b)).toBe(expected);
    expect(bookingsOverlap(b, a)).toBe(expected);
  });
});

describe("U3: у каждого кода ошибки есть сообщение в MESSAGES", () => {
  /** Полный список кодов: если в ValidationErrorCode добавят код, tsc упадёт на exhaustive. */
  const ALL_CODES = [
    "BOOKING_LOCKED",
    "INVALID_REQUEST",
    "OUTSIDE_WORKING_HOURS",
    "START_NOT_BEFORE_END",
    "DURATION_TOO_SHORT",
    "DURATION_TOO_LONG",
    "DURATION_STEP",
    "DATE_IN_PAST",
    "START_IN_PAST",
    "TITLE_TOO_LONG",
    "OVERLAP",
  ] as const satisfies readonly ValidationErrorCode[];
  const exhaustive: Exclude<ValidationErrorCode, (typeof ALL_CODES)[number]> extends never ? true : false = true;

  /** INVALID_REQUEST — формат: сообщения отдельно для даты и времени. */
  const messageKeys = (code: ValidationErrorCode): string[] =>
    code === "INVALID_REQUEST" ? ["INVALID_DATE", "INVALID_TIME"] : [code];

  it("U3: список кодов полный", () => {
    expect(exhaustive).toBe(true);
  });

  it.each(ALL_CODES)("U3: %s — непустое сообщение в MESSAGES", (code) => {
    const messages: Record<string, string> = MESSAGES;
    for (const key of messageKeys(code)) {
      expect(messages[key], key).toEqual(expect.stringMatching(/[а-яё]/i));
    }
  });
});

describe("validateStart: ошибки начала и даты без конца (форма, F3)", () => {
  const codes = (result: ValidationResult) => (result.ok ? [] : result.errors.map((e) => `${e.code} / ${e.field}`));
  it.each([
    { date: TOMORROW, start: "08:59", expected: ["OUTSIDE_WORKING_HOURS / start"] },
    { date: TOMORROW, start: "09:00", expected: [] },
    { date: TOMORROW, start: "17:30", expected: [] },
    { date: TOMORROW, start: "18:00", expected: [] },
    { date: TOMORROW, start: "18:01", expected: ["OUTSIDE_WORKING_HOURS / start"] },
    { date: TODAY, start: "10:10", expected: [] },
    { date: TODAY, start: "10:09", expected: ["START_IN_PAST / start"] },
    { date: YESTERDAY, start: "12:00", expected: ["DATE_IN_PAST / date"] },
    { date: TOMORROW, start: "9:00", expected: ["INVALID_REQUEST / start"] },
    { date: TOMORROW, start: "", expected: ["INVALID_REQUEST / start"] },
  ])("B1, B6, B12: validateStart($date, «$start») при сейчас 2026-10-08 10:10 → $expected", ({ date, start, expected }) => {
    expect(codes(validateStart(date, start, NOW))).toEqual(expected);
  });
});
