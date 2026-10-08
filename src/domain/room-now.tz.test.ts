// B9: «браузер в Europe/Moscow». Пояс процесса меняется на время файла;
// vitest изолирует файлы по воркерам, поэтому смена не протекает в другие тесты.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROOM_TIMEZONE } from "./constants";
import { validateBooking } from "./rules";
import { getRoomNow } from "./time";

describe("B9: процесс в TZ=Europe/Moscow, комната в Asia/Bishkek", () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "Europe/Moscow";
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it("B9: пояс процесса действительно Europe/Moscow (UTC+3) — предусловие теста", () => {
    expect(new Date("2026-10-08T04:10:00Z").getTimezoneOffset()).toBe(-180);
    expect(new Date("2026-10-08T04:10:00Z").getHours()).toBe(7);
  });

  it("B9: 2026-10-08T04:10:00Z → «сейчас» комнаты 2026-10-08 10:10, а не московские 07:10", () => {
    expect(getRoomNow(new Date("2026-10-08T04:10:00Z"), ROOM_TIMEZONE)).toEqual({ date: "2026-10-08", minutes: 610 });
  });

  it("B9: клиентская валидация пропускает старт 10:10 по Бишкеку", () => {
    const now = getRoomNow(new Date("2026-10-08T04:10:00Z"), ROOM_TIMEZONE);
    expect(validateBooking({ date: "2026-10-08", start: "10:10", end: "10:40" }, { bookings: [], now })).toEqual({
      ok: true,
    });
  });

  it("B9: клиентская валидация отклоняет старт 10:09 по Бишкеку", () => {
    const now = getRoomNow(new Date("2026-10-08T04:10:00Z"), ROOM_TIMEZONE);
    const result = validateBooking({ date: "2026-10-08", start: "10:09", end: "10:39" }, { bookings: [], now });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({ code: "START_IN_PAST", field: "start" });
  });

  it("B9, T1: 2026-10-07T19:30Z (Москва 22:30 07.10) → «сегодня» комнаты 2026-10-08", () => {
    expect(getRoomNow(new Date("2026-10-07T19:30:00Z"), ROOM_TIMEZONE)).toEqual({ date: "2026-10-08", minutes: 90 });
  });
});
