// api-тесты mock API (этап 2): каждое правило проверяется прямым запросом в обход UI (T10).
// «Сейчас» — 2026-10-08 10:10:00 по Бишкеку, подмена только через src/server/clock.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROOM_TIMEZONE } from "@/domain/constants";
import { bookingsOverlap, validateBooking } from "@/domain/rules";
import { getRoomNow } from "@/domain/time";
import type { Booking } from "@/domain/types";
import {
  deleteBooking,
  getBookings,
  listOn,
  patchBooking,
  postBooking,
  readBooking,
  readError,
} from "./api-test-utils";
import { resetNowForTests, setNowForTests } from "./clock";
import { resetStore } from "./store";

const NOW = new Date("2026-10-08T04:10:00Z");
const TODAY = "2026-10-08";
const YESTERDAY = "2026-10-07";
const TOMORROW = "2026-10-09";
const SATURDAY = "2026-10-10";

const booking = (id: string, start: string, end: string, date = TOMORROW, title?: string): Booking =>
  title === undefined ? { id, date, start, end } : { id, date, start, end, title };

/** B7: id=1 10:00–11:00 «Планёрка» и id=2 11:00–12:00 на завтра. */
const PLANNING = booking("1", "10:00", "11:00", TOMORROW, "Планёрка");
const NEXT = booking("2", "11:00", "12:00");

beforeEach(() => {
  setNowForTests(NOW);
  vi.stubEnv("DISABLE_MOCK_DELAY", "true");
  vi.stubEnv("ENABLE_DEV_TOOLS", "");
  resetStore([]);
});

afterEach(() => {
  resetNowForTests();
  vi.unstubAllEnvs();
});

describe("GET /api/bookings?date=", () => {
  it("F2: 200, только брони этой даты, по возрастанию start", async () => {
    resetStore([booking("a", "11:00", "12:00"), booking("b", "09:00", "10:00", TOMORROW, "Планёрка"), booking("c", "10:00", "11:00", SATURDAY)]);
    const response = await getBookings(TOMORROW);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([booking("b", "09:00", "10:00", TOMORROW, "Планёрка"), booking("a", "11:00", "12:00")]);
  });

  it("F2: дата без броней → 200 и пустой список", async () => {
    const response = await getBookings(SATURDAY);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("F2: прошедшую дату можно смотреть (Q13) → 200", async () => {
    resetStore([booking("y", "14:00", "14:30", YESTERDAY)]);
    const response = await getBookings(YESTERDAY);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([booking("y", "14:00", "14:30", YESTERDAY)]);
  });

  it("F2: без параметра date → 400 INVALID_REQUEST, field date", async () => {
    const response = await getBookings();
    expect(response.status).toBe(400);
    expect(await readError(response)).toMatchObject({ code: "INVALID_REQUEST", field: "date" });
  });

  it.each(["2026-13-01", "2026-02-30", "08.10.2026", "2026-10-8", ""])("F2: date=%j → 400 INVALID_REQUEST", async (date) => {
    const response = await getBookings(date);
    expect(response.status).toBe(400);
    expect(await readError(response)).toMatchObject({ code: "INVALID_REQUEST", field: "date" });
  });
});

describe("seed (Q16)", () => {
  it("F2: после старта GET на сегодня и на завтра по Бишкеку возвращает непустые списки", async () => {
    resetStore();
    const today = await listOn(TODAY);
    const tomorrow = await listOn(TOMORROW);
    expect(today.length).toBeGreaterThan(0);
    expect(tomorrow.length).toBeGreaterThan(0);
    expect(today.every((b) => b.date === TODAY)).toBe(true);
    expect(tomorrow.every((b) => b.date === TOMORROW)).toBe(true);
  });

  it("F2: seed-брони на завтра проходят правила domain и не пересекаются", async () => {
    resetStore();
    const tomorrow = await listOn(TOMORROW);
    const now = getRoomNow(NOW, ROOM_TIMEZONE);
    for (const b of tomorrow) {
      expect(validateBooking(b, { bookings: tomorrow, now, editingId: b.id })).toEqual({ ok: true });
    }
    expect(new Set(tomorrow.map((b) => b.id)).size).toBe(tomorrow.length);
  });
});

describe("seed: детерминированный (J2)", () => {
  // Вывод ожидания: id = seed-<сегодня по Бишкеку>-<номер в createSeed>, одинаковы в каждом инстансе (D3, Q9).
  const SEED_TODAY: Booking[] = [
    booking("seed-2026-10-08-1", "09:30", "10:30", TODAY, "Планёрка"),
    booking("seed-2026-10-08-2", "14:00", "15:00", TODAY, "Созвон с клиентом"),
  ];
  const SEED_TOMORROW: Booking[] = [
    booking("seed-2026-10-08-3", "10:00", "11:00", TOMORROW, "Ретро"),
    booking("seed-2026-10-08-4", "11:00", "12:00", TOMORROW),
    booking("seed-2026-10-08-5", "15:30", "17:00", TOMORROW, "Демо"),
  ];

  it("F2: сейчас 2026-10-08 10:10 Бишкек → seed на 2026-10-08 и 2026-10-09 с id seed-2026-10-08-1…5", async () => {
    resetStore();
    expect(await listOn(TODAY)).toEqual(SEED_TODAY);
    expect(await listOn(TOMORROW)).toEqual(SEED_TOMORROW);
    expect(await listOn(YESTERDAY)).toEqual([]);
    expect(await listOn(SATURDAY)).toEqual([]);
  });

  it("F2: повторный seed (новый инстанс) даёт те же id и брони", async () => {
    resetStore();
    const first = [...(await listOn(TODAY)), ...(await listOn(TOMORROW))];
    resetStore();
    const second = [...(await listOn(TODAY)), ...(await listOn(TOMORROW))];
    expect(second).toEqual(first);
    expect(second).toEqual([...SEED_TODAY, ...SEED_TOMORROW]);
  });

  it("F2, D3: PATCH и DELETE seed-брони по id из другого инстанса → 200 и 204", async () => {
    resetStore();
    const [ownedByInstanceA] = await listOn(TOMORROW);
    resetStore(); // инстанс B: свой seed
    const patched = await patchBooking(ownedByInstanceA?.id ?? "", { title: "Ретро-2" });
    expect(patched.status).toBe(200);
    expect(await readBooking(patched)).toEqual(booking("seed-2026-10-08-3", "10:00", "11:00", TOMORROW, "Ретро-2"));
    resetStore(); // инстанс C
    expect((await deleteBooking("seed-2026-10-08-3")).status).toBe(204);
  });

  it("F2: seed-брони сегодня и завтра не пересекаются между собой", async () => {
    resetStore();
    for (const list of [await listOn(TODAY), await listOn(TOMORROW)]) {
      for (const a of list) {
        for (const b of list) {
          if (a.id !== b.id) expect(bookingsOverlap(a, b), `${a.id} × ${b.id}`).toBe(false);
        }
      }
    }
  });
});

describe("POST /api/bookings", () => {
  it("F4: завтра 14:00–15:00 «Демо» → 201 Booking с id, затем видна в GET", async () => {
    const response = await postBooking({ date: TOMORROW, start: "14:00", end: "15:00", title: "Демо" });
    expect(response.status).toBe(201);
    const created = await readBooking(response);
    expect(created).toEqual({ id: expect.any(String), date: TOMORROW, start: "14:00", end: "15:00", title: "Демо" });
    expect(created.id).not.toBe("");
    expect(await listOn(TOMORROW)).toEqual([created]);
  });

  it("F4: две брони получают разные id", async () => {
    const first = await readBooking(await postBooking({ date: TOMORROW, start: "09:00", end: "09:30" }));
    const second = await readBooking(await postBooking({ date: TOMORROW, start: "09:30", end: "10:00" }));
    expect(first.id).not.toBe(second.id);
  });

  it("F4: title «  Демо  » сохраняется как «Демо»", async () => {
    const created = await readBooking(await postBooking({ date: TOMORROW, start: "14:00", end: "15:00", title: "  Демо  " }));
    expect(created.title).toBe("Демо");
  });

  it.each(["", "   "])("F4: title %j → у брони нет title", async (title) => {
    const response = await postBooking({ date: TOMORROW, start: "14:00", end: "15:00", title });
    expect(response.status).toBe(201);
    expect(await readBooking(response)).not.toHaveProperty("title");
    expect((await listOn(TOMORROW))[0]).not.toHaveProperty("title");
  });

  it("F4: title 100 символов → 201", async () => {
    const response = await postBooking({ date: TOMORROW, start: "14:00", end: "15:00", title: "я".repeat(100) });
    expect(response.status).toBe(201);
  });

  it("F4: title 100 символов с пробелами по краям → 201 (длина после trim)", async () => {
    const response = await postBooking({ date: TOMORROW, start: "14:00", end: "15:00", title: `  ${"я".repeat(100)}  ` });
    expect(response.status).toBe(201);
    expect((await readBooking(response)).title).toBe("я".repeat(100));
  });

  it("F4: title 101 символ → 422 TITLE_TOO_LONG, field title", async () => {
    const response = await postBooking({ date: TOMORROW, start: "14:00", end: "15:00", title: "я".repeat(101) });
    expect(response.status).toBe(422);
    expect(await readError(response)).toMatchObject({ code: "TITLE_TOO_LONG", field: "title" });
  });
});

describe("POST: 400 — битый запрос (Q11)", () => {
  it.each([
    ["start", { date: TOMORROW, start: "9:00", end: "10:00" }],
    ["start", { date: TOMORROW, start: "25:00", end: "10:00" }],
    ["end", { date: TOMORROW, start: "10:00", end: "10:60" }],
    ["start", { date: TOMORROW, start: "", end: "10:00" }],
    ["date", { date: "2026-13-01", start: "10:00", end: "10:30" }],
  ])("B1: неверный формат → 400 INVALID_REQUEST, field %s (%j)", async (field, body) => {
    const response = await postBooking(body);
    expect(response.status).toBe(400);
    expect(await readError(response)).toMatchObject({ code: "INVALID_REQUEST", field });
  });

  it("F4: невалидный JSON → 400 INVALID_REQUEST", async () => {
    const response = await postBooking("{ date: ");
    expect(response.status).toBe(400);
    expect(await readError(response)).toMatchObject({ code: "INVALID_REQUEST" });
  });

  it.each([[[]], ["строка"], [null], [42]])("F4: тело не объект (%j) → 400", async (body) => {
    const response = await postBooking(JSON.stringify(body));
    expect(response.status).toBe(400);
    expect(await readError(response)).toMatchObject({ code: "INVALID_REQUEST" });
  });

  it.each(["date", "start", "end"])("F4: нет обязательного поля %s → 400, field указывает на него", async (field) => {
    const body: Record<string, string> = { date: TOMORROW, start: "10:00", end: "10:30" };
    delete body[field];
    const response = await postBooking(body);
    expect(response.status).toBe(400);
    expect(await readError(response)).toMatchObject({ code: "INVALID_REQUEST", field });
  });

  it.each([
    ["start", { date: TOMORROW, start: 900, end: "10:30" }],
    ["date", { date: 20261009, start: "10:00", end: "10:30" }],
    ["title", { date: TOMORROW, start: "10:00", end: "10:30", title: 5 }],
    ["title", { date: TOMORROW, start: "10:00", end: "10:30", title: null }],
  ])("F4: неверный тип поля %s → 400", async (field, body) => {
    const response = await postBooking(body);
    expect(response.status).toBe(400);
    expect(await readError(response)).toMatchObject({ code: "INVALID_REQUEST", field });
  });

  it("F4: неизвестное поле → 400, details.unknownFields", async () => {
    const response = await postBooking({ date: TOMORROW, start: "10:00", end: "10:30", foo: 1 });
    expect(response.status).toBe(400);
    expect(await readError(response)).toMatchObject({ code: "INVALID_REQUEST", details: { unknownFields: ["foo"] } });
  });

  it("F4: клиент не задаёт id → поле id в POST → 400", async () => {
    const response = await postBooking({ id: "x", date: TOMORROW, start: "10:00", end: "10:30" });
    expect(response.status).toBe(400);
    expect(await readError(response)).toMatchObject({ code: "INVALID_REQUEST", details: { unknownFields: ["id"] } });
  });

  it("F4: после 400 бронь не создана", async () => {
    await postBooking({ date: TOMORROW, start: "9:00", end: "10:00" });
    expect(await listOn(TOMORROW)).toEqual([]);
  });
});

describe("POST: бизнес-правила на сервере (T10)", () => {
  const post = (start: string, end: string, date = TOMORROW) => postBooking({ date, start, end });

  it.each([
    ["09:00", "09:30", TOMORROW],
    ["17:30", "18:00", TOMORROW],
    ["09:00", "09:30", SATURDAY],
  ])("B1: %s–%s на %s → 201", async (start, end, date) => {
    expect((await post(start, end, date)).status).toBe(201);
  });

  it.each([
    ["08:59", "09:29", "start"],
    ["08:30", "09:30", "start"],
    ["17:59", "18:29", "end"],
    ["18:00", "18:30", "end"],
  ])("B1: %s–%s → 422 OUTSIDE_WORKING_HOURS, field %s", async (start, end, field) => {
    const response = await post(start, end);
    expect(response.status).toBe(422);
    expect(await readError(response)).toMatchObject({ code: "OUTSIDE_WORKING_HOURS", field });
  });

  it.each([
    ["10:00", "10:00"],
    ["11:00", "10:00"],
  ])("B2: %s–%s → 422 START_NOT_BEFORE_END", async (start, end) => {
    const response = await post(start, end);
    expect(response.status).toBe(422);
    expect(await readError(response)).toMatchObject({ code: "START_NOT_BEFORE_END", field: "end" });
  });

  it("B2: 10:00–10:30 → 201", async () => {
    expect((await post("10:00", "10:30")).status).toBe(201);
  });

  it("B3: 10:00–10:29 (29 мин) → 422 DURATION_TOO_SHORT", async () => {
    const response = await post("10:00", "10:29");
    expect(response.status).toBe(422);
    expect(await readError(response)).toMatchObject({ code: "DURATION_TOO_SHORT", field: "end" });
  });

  it("B3: 10:00–10:30 (30 мин) → 201", async () => {
    expect((await post("10:00", "10:30")).status).toBe(201);
  });

  it("B4: 10:00–12:00 (120 мин) → 201", async () => {
    expect((await post("10:00", "12:00")).status).toBe(201);
  });

  it.each([
    ["10:00", "12:30"],
    ["10:00", "12:01"],
  ])("B4: %s–%s → 422 DURATION_TOO_LONG (первым — B4, затем B10)", async (start, end) => {
    const response = await post(start, end);
    expect(response.status).toBe(422);
    expect(await readError(response)).toMatchObject({ code: "DURATION_TOO_LONG", field: "end" });
  });

  it.each([
    ["10:10", "10:40"],
    ["10:10", "11:40"],
  ])("B10: %s–%s (кратно 30) → 201", async (start, end) => {
    expect((await post(start, end)).status).toBe(201);
  });

  it.each([
    ["10:10", "10:50"],
    ["10:00", "11:15"],
    ["16:10", "18:00"],
  ])("B10: %s–%s → 422 DURATION_STEP", async (start, end) => {
    const response = await post(start, end);
    expect(response.status).toBe(422);
    expect(await readError(response)).toMatchObject({ code: "DURATION_STEP", field: "end" });
  });

  it.each([
    ["сегодня, старт = сейчас", TODAY, "10:10", "10:40"],
    ["завтра", TOMORROW, "09:00", "09:30"],
    ["без горизонта (Q14)", "2099-12-31", "09:00", "09:30"],
  ])("B6: %s (%s %s–%s) → 201", async (_case, date, start, end) => {
    expect((await post(start, end, date)).status).toBe(201);
  });

  it.each([
    [TODAY, "10:09", "10:39", "START_IN_PAST", "start"],
    [TODAY, "10:00", "10:30", "START_IN_PAST", "start"],
    [YESTERDAY, "14:00", "14:30", "DATE_IN_PAST", "date"],
  ])("B6: %s %s–%s → 422 %s, field %s", async (date, start, end, code, field) => {
    const response = await post(start, end, date);
    expect(response.status).toBe(422);
    expect(await readError(response)).toMatchObject({ code, field });
  });

  it("B6: после 422 бронь не создана", async () => {
    await post("10:00", "10:30", TODAY);
    expect(await listOn(TODAY)).toEqual([]);
  });

  it.each([
    ["10:10:00", "2026-10-08T04:10:00Z", 201],
    ["10:10:59", "2026-10-08T04:10:59Z", 201],
    ["10:11:00", "2026-10-08T04:11:00Z", 422],
    ["10:11:02 (граница минуты)", "2026-10-08T04:11:02Z", 422],
  ])("B12: сегодня старт 10:10, серверное сейчас %s → %i", async (_case, instant, status) => {
    setNowForTests(new Date(instant));
    const response = await post("10:10", "10:40", TODAY);
    expect(response.status).toBe(status);
    if (status === 422) expect(await readError(response)).toMatchObject({ code: "START_IN_PAST", field: "start" });
  });

  it("U3: тело 422 — { error: { code, message, field } } с непустым сообщением", async () => {
    const response = await post("08:30", "09:30");
    const body = (await response.json()) as unknown;
    expect(body).toEqual({ error: { code: "OUTSIDE_WORKING_HOURS", message: expect.any(String), field: "start" } });
    expect((body as { error: { message: string } }).error.message.length).toBeGreaterThan(0);
  });
});

describe("POST: пересечения → 409 (B5)", () => {
  const EXISTING = booking("1", "10:00", "11:00");

  beforeEach(() => resetStore([EXISTING]));

  it.each([
    ["касание справа", "11:00", "12:00", TOMORROW],
    ["касание слева", "09:00", "10:00", TOMORROW],
    ["другая дата", "10:00", "11:00", SATURDAY],
  ])("B5: %s %s–%s → 201", async (_case, start, end, date) => {
    expect((await postBooking({ date, start, end })).status).toBe(201);
  });

  it.each([
    ["пересечение справа", "10:30", "11:30"],
    ["пересечение слева", "09:30", "10:30"],
    ["совпадает", "10:00", "11:00"],
    ["внутри существующей", "10:15", "10:45"],
    ["накрывает существующую", "09:30", "11:30"],
  ])("B5: %s %s–%s → 409 OVERLAP с conflictWith", async (_case, start, end) => {
    const response = await postBooking({ date: TOMORROW, start, end });
    expect(response.status).toBe(409);
    expect(await readError(response)).toMatchObject({ code: "OVERLAP", conflictWith: EXISTING });
  });

  it("B5: после 409 бронь не создана", async () => {
    await postBooking({ date: TOMORROW, start: "10:30", end: "11:30" });
    expect(await listOn(TOMORROW)).toEqual([EXISTING]);
  });

  it("B5: тело 409 — { error: { code, message, conflictWith } }", async () => {
    const response = await postBooking({ date: TOMORROW, start: "10:00", end: "11:00" });
    expect(await response.json()).toEqual({ error: { code: "OVERLAP", message: expect.any(String), conflictWith: EXISTING } });
  });
});

describe("PATCH /api/bookings/:id (B7, Q12)", () => {
  beforeEach(() => resetStore([PLANNING, NEXT]));

  it("B7: {end: 10:30} → 200, склеенный результат 10:00–10:30 «Планёрка», виден в GET", async () => {
    const response = await patchBooking("1", { end: "10:30" });
    expect(response.status).toBe(200);
    const expected = booking("1", "10:00", "10:30", TOMORROW, "Планёрка");
    expect(await readBooking(response)).toEqual(expected);
    expect(await listOn(TOMORROW)).toEqual([expected, NEXT]);
  });

  it("B7: {start: 09:30, end: 10:30} внутри своего интервала → 200 (нет самоконфликта)", async () => {
    const response = await patchBooking("1", { start: "09:30", end: "10:30" });
    expect(response.status).toBe(200);
    expect(await readBooking(response)).toEqual(booking("1", "09:30", "10:30", TOMORROW, "Планёрка"));
  });

  it.each([
    ["пустое тело", {}],
    ["те же значения", { date: TOMORROW, start: "10:00", end: "11:00", title: "Планёрка" }],
  ])("B7: %s → 200 без изменений", async (_case, body) => {
    const response = await patchBooking("1", body);
    expect(response.status).toBe(200);
    expect(await readBooking(response)).toEqual(PLANNING);
  });

  it.each([
    ["10:30", "11:30"],
    ["11:00", "11:30"],
  ])("B7: {start: %s, end: %s} → 409, conflictWith.id = 2, бронь не изменена", async (start, end) => {
    const response = await patchBooking("1", { start, end });
    expect(response.status).toBe(409);
    expect(await readError(response)).toMatchObject({ code: "OVERLAP", conflictWith: NEXT });
    expect(await listOn(TOMORROW)).toEqual([PLANNING, NEXT]);
  });

  it("B7: {end: 10:50} → 422 DURATION_STEP (склеенный результат 50 мин)", async () => {
    const response = await patchBooking("1", { end: "10:50" });
    expect(response.status).toBe(422);
    expect(await readError(response)).toMatchObject({ code: "DURATION_STEP", field: "end" });
  });

  it("B7: {start: 08:30} → 422 OUTSIDE_WORKING_HOURS (склейка проверяется по B1)", async () => {
    const response = await patchBooking("1", { start: "08:30" });
    expect(response.status).toBe(422);
    expect(await readError(response)).toMatchObject({ code: "OUTSIDE_WORKING_HOURS", field: "start" });
  });

  it("B7: {start: 11:30} → 422 START_NOT_BEFORE_END (склейка 11:30–11:00)", async () => {
    const response = await patchBooking("1", { start: "11:30" });
    expect(response.status).toBe(422);
    expect(await readError(response)).toMatchObject({ code: "START_NOT_BEFORE_END", field: "end" });
  });

  it("B7: {title: \"\"} → 200, title стёрт", async () => {
    const response = await patchBooking("1", { title: "" });
    expect(response.status).toBe(200);
    expect(await readBooking(response)).toEqual(booking("1", "10:00", "11:00"));
    expect((await listOn(TOMORROW))[0]).not.toHaveProperty("title");
  });

  it("B7: {title: «  Ретро  »} → 200, title «Ретро»", async () => {
    const response = await patchBooking("1", { title: "  Ретро  " });
    expect(await readBooking(response)).toEqual(booking("1", "10:00", "11:00", TOMORROW, "Ретро"));
  });

  it("B7: {title: 101 символ} → 422 TITLE_TOO_LONG", async () => {
    const response = await patchBooking("1", { title: "я".repeat(101) });
    expect(response.status).toBe(422);
    expect(await readError(response)).toMatchObject({ code: "TITLE_TOO_LONG", field: "title" });
  });

  it.each([
    ["{foo: 1}", { foo: 1 }, { details: { unknownFields: ["foo"] } }],
    ["{id: \"5\"}", { id: "5" }, { details: { unknownFields: ["id"] } }],
    ["{title: null}", { title: null }, { field: "title" }],
    ["{start: \"9:00\"}", { start: "9:00" }, { field: "start" }],
    ["{date: \"2026-13-01\"}", { date: "2026-13-01" }, { field: "date" }],
  ])("B7: %s → 400 INVALID_REQUEST, бронь не изменена", async (_case, body, expected) => {
    const response = await patchBooking("1", body);
    expect(response.status).toBe(400);
    expect(await readError(response)).toMatchObject({ code: "INVALID_REQUEST", ...expected });
    expect(await listOn(TOMORROW)).toEqual([PLANNING, NEXT]);
  });

  it("B7: невалидный JSON → 400", async () => {
    const response = await patchBooking("1", "{ end: ");
    expect(response.status).toBe(400);
    expect(await readError(response)).toMatchObject({ code: "INVALID_REQUEST" });
  });
});

describe("PATCH: смена даты и 404 (F5)", () => {
  beforeEach(() => resetStore([PLANNING, NEXT]));

  it("F5: {date: суббота} → 200, бронь есть в GET субботы и нет в GET завтра (Q5)", async () => {
    const response = await patchBooking("1", { date: SATURDAY });
    expect(response.status).toBe(200);
    const moved = { ...PLANNING, date: SATURDAY };
    expect(await readBooking(response)).toEqual(moved);
    expect(await listOn(SATURDAY)).toEqual([moved]);
    expect(await listOn(TOMORROW)).toEqual([NEXT]);
  });

  it("F5: {date: вчера} → 422 DATE_IN_PAST (склейка проверяется по B6)", async () => {
    const response = await patchBooking("1", { date: YESTERDAY });
    expect(response.status).toBe(422);
    expect(await readError(response)).toMatchObject({ code: "DATE_IN_PAST", field: "date" });
  });

  it("F5: {date: суббота}, где есть пересекающаяся 10:30–11:30 → 409 с conflictWith брони субботы", async () => {
    const saturday = booking("3", "10:30", "11:30", SATURDAY);
    resetStore([PLANNING, NEXT, saturday]);
    const response = await patchBooking("1", { date: SATURDAY });
    expect(response.status).toBe(409);
    expect(await readError(response)).toMatchObject({ code: "OVERLAP", conflictWith: saturday });
  });

  it("F5: несуществующий id → 404 NOT_FOUND", async () => {
    const response = await patchBooking("missing", { end: "10:30" });
    expect(response.status).toBe(404);
    expect(await readError(response)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("F5: несуществующий id с битым телом → 404 (порядок: 404 раньше 400)", async () => {
    const response = await patchBooking("missing", { foo: 1 });
    expect(response.status).toBe(404);
    expect(await readError(response)).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("DELETE /api/bookings/:id (F6)", () => {
  beforeEach(() => resetStore([PLANNING, NEXT]));

  it("F6: DELETE → 204 без тела, брони нет в GET", async () => {
    const response = await deleteBooking("1");
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(await listOn(TOMORROW)).toEqual([NEXT]);
  });

  it("F6: повторный DELETE того же id → 404 NOT_FOUND", async () => {
    await deleteBooking("1");
    const response = await deleteBooking("1");
    expect(response.status).toBe(404);
    expect(await readError(response)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("F6: DELETE несуществующего id → 404, store не изменён", async () => {
    const response = await deleteBooking("missing");
    expect(response.status).toBe(404);
    expect(await listOn(TOMORROW)).toEqual([PLANNING, NEXT]);
  });
});

describe("начавшиеся и прошедшие брони (B11)", () => {
  it.each([
    ["идёт: сегодня 10:00–10:30", booking("L", "10:00", "10:30", TODAY)],
    ["начинается сейчас: сегодня 10:10–10:40", booking("L", "10:10", "10:40", TODAY)],
    ["вчера 14:00–14:30", booking("L", "14:00", "14:30", YESTERDAY)],
  ])("B11: %s → PATCH 422 BOOKING_LOCKED, бронь не изменена", async (_case, locked) => {
    resetStore([locked]);
    const response = await patchBooking("L", { title: "Новое" });
    expect(response.status).toBe(422);
    expect(await readError(response)).toMatchObject({ code: "BOOKING_LOCKED" });
    expect(await listOn(locked.date)).toEqual([locked]);
  });

  it.each([
    ["идёт: сегодня 10:00–10:30", booking("L", "10:00", "10:30", TODAY)],
    ["начинается сейчас: сегодня 10:10–10:40", booking("L", "10:10", "10:40", TODAY)],
    ["вчера 14:00–14:30", booking("L", "14:00", "14:30", YESTERDAY)],
  ])("B11: %s → DELETE 422 BOOKING_LOCKED, бронь осталась", async (_case, locked) => {
    resetStore([locked]);
    const response = await deleteBooking("L");
    expect(response.status).toBe(422);
    expect(await readError(response)).toMatchObject({ code: "BOOKING_LOCKED" });
    expect(await listOn(locked.date)).toEqual([locked]);
  });

  it("B11: PATCH {} начавшейся брони → 422 BOOKING_LOCKED", async () => {
    resetStore([booking("L", "10:00", "10:30", TODAY)]);
    const response = await patchBooking("L", {});
    expect(response.status).toBe(422);
    expect(await readError(response)).toMatchObject({ code: "BOOKING_LOCKED" });
  });

  it("B11: сегодня 10:11–10:41 (ещё не началась) → PATCH 200", async () => {
    resetStore([booking("F", "10:11", "10:41", TODAY)]);
    const response = await patchBooking("F", { title: "Новое" });
    expect(response.status).toBe(200);
  });

  it("B11: сегодня 10:11–10:41 (ещё не началась) → DELETE 204", async () => {
    resetStore([booking("F", "10:11", "10:41", TODAY)]);
    expect((await deleteBooking("F")).status).toBe(204);
  });

  it("B11: бронь 10:11–10:41 начинает блокироваться, когда серверное сейчас = 10:11:00", async () => {
    resetStore([booking("F", "10:11", "10:41", TODAY)]);
    setNowForTests(new Date("2026-10-08T04:11:00Z"));
    const response = await deleteBooking("F");
    expect(response.status).toBe(422);
    expect(await readError(response)).toMatchObject({ code: "BOOKING_LOCKED" });
  });

  it("B11: PATCH начавшейся брони с битым форматом → 400 (порядок: 400 раньше 422)", async () => {
    resetStore([booking("L", "10:00", "10:30", TODAY)]);
    const response = await patchBooking("L", { start: "9:00" });
    expect(response.status).toBe(400);
    expect(await readError(response)).toMatchObject({ code: "INVALID_REQUEST", field: "start" });
  });
});

describe("store на globalThis (Q9)", () => {
  it("D3: данные store переживают повторную загрузку модулей (HMR в dev)", async () => {
    resetStore([PLANNING]);
    vi.resetModules();
    const fresh = await import("./handlers");
    const response = await fresh.handleGetBookings(new Request(`http://localhost/api/bookings?date=${TOMORROW}`));
    expect(await response.json()).toEqual([PLANNING]);
  });
});
