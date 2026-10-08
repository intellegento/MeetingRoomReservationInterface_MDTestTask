// B9 на сервере: «сегодня» — по поясу комнаты, а не процесса и не UTC (T1).
// Файл *.tz.test.ts: gate гоняет его с TZ=UTC и TZ=America/Los_Angeles.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listOn, postBooking, readError } from "./api-test-utils";
import { resetNowForTests, setNowForTests } from "./clock";
import { resetStore } from "./store";

// 2026-10-07T19:30Z = 2026-10-08 01:30 по Бишкеку.
const NIGHT = new Date("2026-10-07T19:30:00Z");

beforeEach(() => {
  setNowForTests(NIGHT);
  vi.stubEnv("DISABLE_MOCK_DELAY", "true");
  resetStore([]);
});

afterEach(() => {
  resetNowForTests();
  vi.unstubAllEnvs();
});

describe("серверное «сегодня» в поясе комнаты (B9)", () => {
  it("B9: сейчас 2026-10-07T19:30Z → POST на 2026-10-07 → 422 DATE_IN_PAST", async () => {
    const response = await postBooking({ date: "2026-10-07", start: "14:00", end: "14:30" });
    expect(response.status).toBe(422);
    expect(await readError(response)).toMatchObject({ code: "DATE_IN_PAST", field: "date" });
  });

  it("B9: сейчас 2026-10-07T19:30Z → POST на 2026-10-08 09:00–09:30 (сегодня по Бишкеку) → 201", async () => {
    expect((await postBooking({ date: "2026-10-08", start: "09:00", end: "09:30" })).status).toBe(201);
  });

  it("F2: seed считается от «сегодня» по Бишкеку: 2026-10-08 и 2026-10-09 непустые, 2026-10-07 пустой", async () => {
    resetStore();
    expect((await listOn("2026-10-08")).length).toBeGreaterThan(0);
    expect((await listOn("2026-10-09")).length).toBeGreaterThan(0);
    expect(await listOn("2026-10-07")).toEqual([]);
  });

  it("F2, J2: сейчас 2026-10-07T19:30Z → id seed от 2026-10-08 (Бишкек): seed-2026-10-08-1, seed-2026-10-08-2", async () => {
    // Вывод ожидания: сегодня по Бишкеку 2026-10-08 (не 2026-10-07 по UTC/LA) → id seed-2026-10-08-<n>, n по порядку createSeed.
    resetStore();
    expect((await listOn("2026-10-08")).map((b) => b.id)).toEqual(["seed-2026-10-08-1", "seed-2026-10-08-2"]);
    expect((await listOn("2026-10-09")).map((b) => b.id)).toEqual(["seed-2026-10-08-3", "seed-2026-10-08-4", "seed-2026-10-08-5"]);
  });
});
