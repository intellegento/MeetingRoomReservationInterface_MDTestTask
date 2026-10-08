// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Booking } from "@/domain/types";
import { createTestWrapper, FakeBookingsApi } from "../bookings/test-utils";
import { resetNowForTests, setNowForTests } from "../clock";
import { DayView } from "./day-view";

// Dev-панель (Q8, B8, U4): флаг клиента NEXT_PUBLIC_ENABLE_DEV_TOOLS, заголовки X-Mock-* через
// параметр запроса BookingsApi. Сейчас — 2026-10-08 10:10 по Бишкеку. Вывод ожиданий — docs/traces/stage-6.md.

const FLAG = "NEXT_PUBLIC_ENABLE_DEV_TOOLS";
const TOMORROW = "2026-10-09";
const CONFLICT_TOGGLE = "Симулировать конфликт при следующем сохранении";
const SLOW_TOGGLE = "Медленная сеть";
const DEMO: Booking = { id: "b1", date: TOMORROW, start: "16:00", end: "17:00", title: "Демо" };

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
  setNowForTests(new Date("2026-10-08T04:10:00Z"));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchSpy.mockClear();
  resetNowForTests();
});

function renderDay(api: FakeBookingsApi) {
  const { wrapper: Wrapper } = createTestWrapper(api);
  function Harness() {
    const [param, set] = useState<string | null>(TOMORROW);
    return <DayView dateParam={param} onDateChange={(next) => set(next)} />;
  }
  render(
    <Wrapper>
      <Harness />
    </Wrapper>,
  );
}

const toggle = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;
const headersOf = (api: FakeBookingsApi, method: "create" | "update" | "remove") =>
  api.mutationCalls.filter((call) => call.method === method).map((call) => call.options?.headers ?? {});

async function createBooking(start: string, end: string) {
  fireEvent.click(screen.getByRole("button", { name: "Новая бронь" }));
  const dialog = await screen.findByRole("dialog", { name: "Новая бронь" });
  fireEvent.change(within(dialog).getByLabelText("Начало"), { target: { value: start } });
  fireEvent.change(within(dialog).getByLabelText("Окончание"), { target: { value: end } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

describe("Dev-панель: флаг (Q8, Q24)", () => {
  it.each([undefined, "false", "1"])("B8, Q8: NEXT_PUBLIC_ENABLE_DEV_TOOLS=%s → панели нет в DOM", async (value) => {
    vi.stubEnv(FLAG, value);
    const api = new FakeBookingsApi();
    renderDay(api);
    await waitFor(() => expect(api.listCallsFor(TOMORROW)).toBe(1));
    await screen.findByText("На эту дату броней нет");

    expect(screen.queryByRole("region", { name: "Инструменты разработчика" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: CONFLICT_TOGGLE })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: SLOW_TOGGLE })).toBeNull();
  });

  it("B8, U4, Q8: NEXT_PUBLIC_ENABLE_DEV_TOOLS=true → панель с двумя выключенными переключателями", async () => {
    vi.stubEnv(FLAG, "true");
    renderDay(new FakeBookingsApi());

    const panel = await screen.findByRole("region", { name: "Инструменты разработчика" });
    expect((within(panel).getByRole("checkbox", { name: CONFLICT_TOGGLE }) as HTMLInputElement).checked).toBe(false);
    expect((within(panel).getByRole("checkbox", { name: SLOW_TOGGLE }) as HTMLInputElement).checked).toBe(false);
  });
});

describe("Dev-панель: заголовки запросов (B8, U4)", () => {
  it("B8, Q8: «Симулировать конфликт» → create уходит с X-Mock-Force-Conflict: 1 один раз, переключатель снимается, следующее сохранение без заголовка", async () => {
    vi.stubEnv(FLAG, "true");
    const api = new FakeBookingsApi();
    renderDay(api);
    await screen.findByText("На эту дату броней нет");

    fireEvent.click(toggle(CONFLICT_TOGGLE));
    expect(toggle(CONFLICT_TOGGLE).checked).toBe(true);
    await createBooking("14:00", "15:00");

    expect(headersOf(api, "create")[0]).toEqual({ "X-Mock-Force-Conflict": "1" });
    expect(toggle(CONFLICT_TOGGLE).checked).toBe(false);

    await createBooking("15:00", "16:00");

    expect(headersOf(api, "create")).toHaveLength(2);
    expect(headersOf(api, "create")[1]).toEqual({});
  });

  it("B8, Q8: «Симулировать конфликт» действует и на правку (update)", async () => {
    vi.stubEnv(FLAG, "true");
    const api = new FakeBookingsApi([DEMO]);
    renderDay(api);

    const edit = await screen.findByRole("button", { name: /^Изменить бронь 16:00–17:00/ });
    // Пока открыт модальный диалог, фон (и панель) скрыт от a11y-дерева: переключатель — до открытия.
    fireEvent.click(toggle(CONFLICT_TOGGLE));
    fireEvent.click(edit);
    const dialog = await screen.findByRole("dialog", { name: "Изменить бронь" });
    fireEvent.change(within(dialog).getByLabelText("Окончание"), { target: { value: "16:30" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(headersOf(api, "update")).toHaveLength(1));
    expect(headersOf(api, "update")[0]).toEqual({ "X-Mock-Force-Conflict": "1" });
  });

  it("U4, Q8: «Медленная сеть» → create и remove уходят с X-Mock-Delay: 2000, переключатель остаётся включённым", async () => {
    vi.stubEnv(FLAG, "true");
    const api = new FakeBookingsApi([DEMO]);
    renderDay(api);
    await screen.findByRole("button", { name: /^Изменить бронь 16:00–17:00/ });

    fireEvent.click(toggle(SLOW_TOGGLE));
    await createBooking("14:00", "15:00");
    fireEvent.click(screen.getByRole("button", { name: /^Удалить бронь 16:00–17:00/ }));
    const confirm = await screen.findByRole("alertdialog", { name: "Удалить бронь?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    expect(headersOf(api, "create")).toEqual([{ "X-Mock-Delay": "2000" }]);
    expect(headersOf(api, "remove")).toEqual([{ "X-Mock-Delay": "2000" }]);
    expect(toggle(SLOW_TOGGLE).checked).toBe(true);
  });
});
