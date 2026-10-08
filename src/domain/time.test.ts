import { describe, expect, it } from "vitest";
import { ROOM_TIMEZONE } from "./constants";
import { addDays, formatTime, getRoomNow, isValidDate, parseTime } from "./time";

describe("parseTime / formatTime", () => {
  it.each([
    ["00:00", 0],
    ["08:59", 539],
    ["09:00", 540],
    ["10:10", 610],
    ["18:00", 1080],
    ["23:59", 1439],
  ])("B1: «%s» → %i минут", (value, minutes) => {
    expect(parseTime(value)).toBe(minutes);
  });

  it.each(["9:00", "25:00", "24:00", "10:60", "", "10:00:00", " 10:00", "10-00", "1000", "aa:bb"])(
    "B1: неверный формат «%s» → null (400)",
    (value) => {
      expect(parseTime(value)).toBeNull();
    },
  );

  it("B1, T5: «9:30» отклоняется, хотя строкой «9:30» > «10:00»; сравнение идёт в минутах", () => {
    expect("9:30" > "10:00").toBe(true);
    expect(parseTime("9:30")).toBeNull();
    expect(parseTime("09:30")).toBeLessThan(parseTime("10:00") ?? -1);
  });

  it.each([
    [0, "00:00"],
    [540, "09:00"],
    [610, "10:10"],
    [1080, "18:00"],
    [1439, "23:59"],
  ])("B1: %i минут → «%s»", (minutes, value) => {
    expect(formatTime(minutes)).toBe(value);
  });
});

describe("isValidDate", () => {
  it.each(["2026-10-08", "2026-10-10", "2099-12-31", "2028-02-29"])("B1: «%s» — дата", (value) => {
    expect(isValidDate(value)).toBe(true);
  });

  it.each(["2026-13-01", "2026-02-30", "2027-02-29", "2026-00-10", "2026-10-32", "2026-2-01", "26-10-08", "", "2026-10-08T00:00"])(
    "B1: «%s» — неверная дата (400)",
    (value) => {
      expect(isValidDate(value)).toBe(false);
    },
  );
});

describe("addDays", () => {
  it.each([
    ["2026-10-08", -1, "2026-10-07"],
    ["2026-10-08", 1, "2026-10-09"],
    ["2026-10-08", 2, "2026-10-10"],
    ["2026-10-31", 1, "2026-11-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2027-01-01", -1, "2026-12-31"],
    ["2028-03-01", -1, "2028-02-29"],
  ])("B6: %s %+i дн. → %s", (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });
});

describe("getRoomNow", () => {
  it("B9: 2026-10-08T04:10:00Z → по Бишкеку 2026-10-08 10:10", () => {
    expect(getRoomNow(new Date("2026-10-08T04:10:00Z"), ROOM_TIMEZONE)).toEqual({ date: "2026-10-08", minutes: 610 });
  });

  it.each([
    ["2026-10-08T04:10:00.000Z", 610],
    ["2026-10-08T04:10:59.000Z", 610],
    ["2026-10-08T04:10:59.999Z", 610],
    ["2026-10-08T04:11:00.000Z", 611],
  ])("B12: %s → %i минут (секунды отброшены)", (instant, minutes) => {
    expect(getRoomNow(new Date(instant), ROOM_TIMEZONE)).toEqual({ date: "2026-10-08", minutes });
  });

  it("B9, T1: 2026-10-07T19:30Z → «сегодня» 2026-10-08 01:30, а не дата UTC", () => {
    const instant = new Date("2026-10-07T19:30:00Z");
    expect(getRoomNow(instant, ROOM_TIMEZONE)).toEqual({ date: "2026-10-08", minutes: 90 });
  });

  it("B9: переход через полночь по Бишкеку: 17:59:59Z → 23:59 того же дня", () => {
    expect(getRoomNow(new Date("2026-10-08T17:59:59Z"), ROOM_TIMEZONE)).toEqual({ date: "2026-10-08", minutes: 1439 });
  });

  it("B9: переход через полночь по Бишкеку: 18:00:00Z → 00:00 следующего дня", () => {
    expect(getRoomNow(new Date("2026-10-08T18:00:00Z"), ROOM_TIMEZONE)).toEqual({ date: "2026-10-09", minutes: 0 });
  });

  it("B9: переход через Новый год по Бишкеку: 2026-12-31T18:00Z → 2027-01-01 00:00", () => {
    expect(getRoomNow(new Date("2026-12-31T18:00:00Z"), ROOM_TIMEZONE)).toEqual({ date: "2027-01-01", minutes: 0 });
  });

  it("B9: пояс берётся из параметра, а не из процесса: тот же момент в UTC — 2026-10-07 19:30", () => {
    expect(getRoomNow(new Date("2026-10-07T19:30:00Z"), "UTC")).toEqual({ date: "2026-10-07", minutes: 1170 });
  });
});
