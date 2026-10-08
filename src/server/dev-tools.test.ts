// api-тесты dev-заголовков (Q8): X-Mock-Force-Conflict (B8) и X-Mock-Delay / задержка по умолчанию (U4, U1).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Booking } from "@/domain/types";
import { getBookings, listOn, patchBooking, postBooking, readError } from "./api-test-utils";
import { resetNowForTests, setNowForTests } from "./clock";
import { DEFAULT_DELAY_MAX_MS, DEFAULT_DELAY_MIN_MS, MOCK_DELAY_MAX_MS } from "./dev-tools";
import { resetStore } from "./store";

const NOW = new Date("2026-10-08T04:10:00Z");
const TOMORROW = "2026-10-09";
const DEMO = { date: TOMORROW, start: "14:00", end: "15:00", title: "Демо" };
const FORCE = { "X-Mock-Force-Conflict": "1" };

/** Значения ENABLE_DEV_TOOLS, при которых dev-заголовки игнорируются: включает только строка «true» (Q24). */
const FLAG_OFF: [string, string | undefined][] = [
  ["не задан", undefined],
  ["false", "false"],
  ["1", "1"],
  ["yes", "yes"],
  ["True", "True"],
];

beforeEach(() => {
  setNowForTests(NOW);
  vi.stubEnv("DISABLE_MOCK_DELAY", "true");
  vi.stubEnv("ENABLE_DEV_TOOLS", "true");
  resetStore([]);
});

afterEach(() => {
  vi.useRealTimers();
  resetNowForTests();
  vi.unstubAllEnvs();
});

describe("X-Mock-Force-Conflict (B8)", () => {
  it("B8: флаг включён, POST 14:00–15:00 «Демо» с заголовком → 409, в store «чужая» бронь 14:00–15:00", async () => {
    const response = await postBooking(DEMO, FORCE);
    expect(response.status).toBe(409);
    const error = await readError(response);
    expect(error).toMatchObject({ code: "OVERLAP", conflictWith: { id: expect.any(String), date: TOMORROW, start: "14:00", end: "15:00" } });
    expect(error.conflictWith).not.toHaveProperty("title", "Демо");
    expect(await listOn(TOMORROW)).toEqual([error.conflictWith]);
  });

  it("B8: флаг включён, интервал уже занят → обычный 409, новая бронь не создаётся", async () => {
    const existing: Booking = { id: "1", date: TOMORROW, start: "14:00", end: "15:00" };
    resetStore([existing]);
    const response = await postBooking(DEMO, FORCE);
    expect(response.status).toBe(409);
    expect(await readError(response)).toMatchObject({ conflictWith: existing });
    expect(await listOn(TOMORROW)).toEqual([existing]);
  });

  it("B8: флаг включён, запрос нарушает правила → 422, «чужая» бронь не создаётся", async () => {
    const response = await postBooking({ date: TOMORROW, start: "08:00", end: "08:30" }, FORCE);
    expect(response.status).toBe(422);
    expect(await listOn(TOMORROW)).toEqual([]);
  });

  it("B8: флаг включён, PATCH 14:00–15:00 → 16:00–17:00 с заголовком → 409 с «чужой» 16:00–17:00, бронь не изменена", async () => {
    const own: Booking = { id: "1", date: TOMORROW, start: "14:00", end: "15:00", title: "Демо" };
    resetStore([own]);
    const response = await patchBooking("1", { start: "16:00", end: "17:00" }, FORCE);
    expect(response.status).toBe(409);
    const error = await readError(response);
    expect(error.conflictWith).toMatchObject({ date: TOMORROW, start: "16:00", end: "17:00" });
    expect(error.conflictWith?.id).not.toBe("1");
    expect(await listOn(TOMORROW)).toEqual([own, error.conflictWith]);
  });

  it("B8: флаг включён, PATCH 10:00–11:00 → {end: 10:30} с заголовком (пересекает исходный интервал) → 409 без «чужой» брони в store (Q21)", async () => {
    const own: Booking = { id: "1", date: TOMORROW, start: "10:00", end: "11:00", title: "Планёрка" };
    resetStore([own]);
    const response = await patchBooking("1", { end: "10:30" }, FORCE);
    expect(response.status).toBe(409);
    const error = await readError(response);
    expect(error).toMatchObject({ code: "OVERLAP", conflictWith: { date: TOMORROW, start: "10:00", end: "10:30" } });
    expect(error.conflictWith?.id).not.toBe("1");
    expect(await listOn(TOMORROW)).toEqual([own]);
  });

  it("B8: флаг включён, значение заголовка не «1» → заголовок игнорируется, 201", async () => {
    expect((await postBooking(DEMO, { "X-Mock-Force-Conflict": "0" })).status).toBe(201);
  });

  it.each(FLAG_OFF)("B8: ENABLE_DEV_TOOLS %s → X-Mock-Force-Conflict игнорируется, 201", async (_case, value) => {
    vi.stubEnv("ENABLE_DEV_TOOLS", value);
    const response = await postBooking(DEMO, FORCE);
    expect(response.status).toBe(201);
    expect(await listOn(TOMORROW)).toHaveLength(1);
  });
});

/** Отслеживает, завершился ли ответ, пока время двигают fake timers. Ошибка обработчика пробрасывается в тест. */
function track(promise: Promise<Response>) {
  const state: { done: boolean; error?: unknown } = { done: false };
  promise.then(
    () => {
      state.done = true;
    },
    (error: unknown) => {
      state.error = error;
    },
  );
  return {
    get settled() {
      if (state.error !== undefined) throw state.error;
      return state.done;
    },
  };
}

describe("X-Mock-Delay и задержка по умолчанию (U4, U1)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  it("U4: флаг включён, X-Mock-Delay: 2000 → ответ не раньше 2000 мс", async () => {
    const state = track(postBooking(DEMO, { "X-Mock-Delay": "2000" }));
    await vi.advanceTimersByTimeAsync(1999);
    expect(state.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.settled).toBe(true);
  });

  it("U4: флаг включён, X-Mock-Delay действует и на GET", async () => {
    const state = track(getBookings(TOMORROW, { "X-Mock-Delay": "2000" }));
    await vi.advanceTimersByTimeAsync(1999);
    expect(state.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.settled).toBe(true);
  });

  it("U4: X-Mock-Delay больше предела → задержка ограничена MOCK_DELAY_MAX_MS", async () => {
    const state = track(postBooking(DEMO, { "X-Mock-Delay": "600000" }));
    await vi.advanceTimersByTimeAsync(MOCK_DELAY_MAX_MS - 1);
    expect(state.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.settled).toBe(true);
  });

  it.each(["abc", "-5", ""])("U4: некорректный X-Mock-Delay %j → игнорируется, ответ без задержки", async (value) => {
    const state = track(postBooking(DEMO, { "X-Mock-Delay": value }));
    await vi.advanceTimersByTimeAsync(0);
    expect(state.settled).toBe(true);
  });

  it.each(FLAG_OFF)("U4: ENABLE_DEV_TOOLS %s → X-Mock-Delay игнорируется, ответ без задержки", async (_case, value) => {
    vi.stubEnv("ENABLE_DEV_TOOLS", value);
    const state = track(postBooking(DEMO, { "X-Mock-Delay": "2000" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(state.settled).toBe(true);
  });

  it("U1: без DISABLE_MOCK_DELAY ответ задержан на 300–800 мс", async () => {
    vi.stubEnv("DISABLE_MOCK_DELAY", undefined);
    vi.stubEnv("ENABLE_DEV_TOOLS", undefined);
    const state = track(getBookings(TOMORROW));
    await vi.advanceTimersByTimeAsync(DEFAULT_DELAY_MIN_MS - 1);
    expect(state.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(DEFAULT_DELAY_MAX_MS - DEFAULT_DELAY_MIN_MS + 1);
    expect(state.settled).toBe(true);
  });

  it("U1: DISABLE_MOCK_DELAY=true → ответ без задержки", async () => {
    vi.stubEnv("ENABLE_DEV_TOOLS", undefined);
    const state = track(getBookings(TOMORROW));
    await vi.advanceTimersByTimeAsync(0);
    expect(state.settled).toBe(true);
  });
});
