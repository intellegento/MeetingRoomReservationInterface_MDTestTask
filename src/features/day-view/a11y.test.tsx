// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { axe, type AxeRunOptions } from "jest-axe";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/errors";
import type { Booking } from "@/domain/types";
import { createTestWrapper, FakeBookingsApi } from "../bookings/test-utils";
import { resetNowForTests, setNowForTests } from "../clock";
import { DayView } from "./day-view";

// Базовая доступность (A2): axe-core через jest-axe на экране дня, форме и диалоге удаления в разных
// состояниях; не больше одного role="alert" одновременно. Сейчас — 2026-10-08 10:10 по Бишкеку
// (testing.md, правило 4). Вывод ожиданий — docs/traces/stage-7.md.
// jsdom без раскладки: контраст (color-contrast) jest-axe выключает, размеры целей — ручная проверка.

const TODAY = "2026-10-08";
const TOMORROW = "2026-10-09";

const booking = (id: string, date: string, start: string, end: string, title?: string): Booking =>
  title === undefined ? { id, date, start, end } : { id, date, start, end, title };

// WCAG 2.5.3 «Label in Name» (уровень A): в axe правило экспериментальное и по умолчанию выключено.
const AXE_OPTIONS: AxeRunOptions = { rules: { "label-content-name-mismatch": { enabled: true } } };

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
  setNowForTests(new Date("2026-10-08T04:10:00Z"));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchSpy.mockClear();
  resetNowForTests();
});

/** Экран в той же обёртке, что src/app/page.tsx: main и h1 (структуру страницы проверяет тест ниже). */
function renderDay(api: FakeBookingsApi, date: string) {
  const { wrapper: Wrapper } = createTestWrapper(api);
  function Harness() {
    const [param, set] = useState<string | null>(date);
    return <DayView dateParam={param} onDateChange={(next) => set(next)} />;
  }
  render(
    <Wrapper>
      <main className="page">
        <h1>Бронирование переговорной</h1>
        <Harness />
      </main>
    </Wrapper>,
  );
}

/** Нарушения axe по всему body (диалоги Radix — в портале вне main): id правила и цели. */
async function violations() {
  const results = await axe(document.body, AXE_OPTIONS);
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => JSON.stringify(n.target)).join(", ")}`);
}

/** Видимые (не aria-hidden) role="alert". */
const alertCount = () => screen.queryAllByRole("alert").length;

const dialog = () => screen.getByRole("dialog");
const startInput = () => within(dialog()).getByLabelText("Начало") as HTMLInputElement;
const endSelect = () => within(dialog()).getByLabelText("Окончание") as HTMLSelectElement;
const titleInput = () => within(dialog()).getByLabelText("Название") as HTMLInputElement;
const submitForm = () => fireEvent.submit(dialog().querySelector("form")!);

async function openCreate(api: FakeBookingsApi) {
  renderDay(api, TOMORROW);
  const create = await screen.findByRole("button", { name: "Новая бронь" });
  await waitFor(() => expect(api.listCallsFor(TOMORROW)).toBe(1));
  fireEvent.click(create);
  await screen.findByRole("dialog", { name: "Новая бронь" });
}

async function fillAndSave(api: FakeBookingsApi) {
  await openCreate(api);
  fireEvent.change(startInput(), { target: { value: "14:00" } });
  fireEvent.change(endSelect(), { target: { value: "15:00" } });
  fireEvent.change(titleInput(), { target: { value: "Демо" } });
  submitForm();
}

describe("A2: axe — экран дня", () => {
  it("A2, U1: загрузка (skeleton, role=status, aria-busy) — нарушений axe 0, role=alert 0", async () => {
    const api = new FakeBookingsApi();
    api.hangList(TOMORROW);
    renderDay(api, TOMORROW);
    await screen.findByRole("status");

    expect(await violations()).toEqual([]);
    expect(alertCount()).toBe(0);
  });

  it("A2, U2: пустой день — нарушений axe 0, role=alert 0", async () => {
    renderDay(new FakeBookingsApi(), TOMORROW);
    await screen.findByText("На эту дату броней нет");

    expect(await violations()).toEqual([]);
    expect(alertCount()).toBe(0);
  });

  it("A2, F2, B11: сегодня с прошедшей, начавшейся и будущей бронью — нарушений axe 0 (вкл. label-content-name-mismatch), role=alert 0", async () => {
    const api = new FakeBookingsApi([
      booking("b1", TODAY, "09:00", "10:00", "Планёрка"),
      booking("b2", TODAY, "10:00", "11:00"),
      booking("b3", TODAY, "14:00", "15:00", "Демо"),
    ]);
    renderDay(api, TODAY);
    await screen.findByRole("button", { name: /^Удалить бронь 14:00–15:00/ });

    expect(await violations()).toEqual([]);
    expect(alertCount()).toBe(0);
  });

  it("A2, U3: ошибка загрузки — нарушений axe 0, ровно один role=alert", async () => {
    const api = new FakeBookingsApi();
    api.failList(TOMORROW, new ApiError({ status: 500, code: "PARSE", message: "html" }));
    renderDay(api, TOMORROW);
    await screen.findByRole("button", { name: "Повторить" });

    expect(await violations()).toEqual([]);
    expect(alertCount()).toBe(1);
  });
});

describe("A2: axe — форма брони", () => {
  it("A2, F3: открытая пустая форма — нарушений axe 0, role=alert 0", async () => {
    await openCreate(new FakeBookingsApi());

    expect(await violations()).toEqual([]);
    expect(alertCount()).toBe(0);
  });

  it("A2, F3: отправка пустой формы (сводка, aria-invalid) — нарушений axe 0, ровно один role=alert", async () => {
    await openCreate(new FakeBookingsApi());
    submitForm();
    await within(dialog()).findByRole("alert");

    expect(await violations()).toEqual([]);
    expect(alertCount()).toBe(1);
  });

  it("A2, B8: после 409 (баннер, конфликтные поля, занятые опции disabled) — нарушений axe 0, ровно один role=alert", async () => {
    const api = new FakeBookingsApi();
    const other = booking("x1", TOMORROW, "14:00", "15:00", "Чужая");
    api.failNext("create", new ApiError({ status: 409, code: "OVERLAP", message: "Время занято", conflictWith: other }));
    await openCreate(api);
    // Другой пользователь занял 14:00–15:00 после загрузки списка.
    api.bookings.push(other);
    fireEvent.change(startInput(), { target: { value: "14:00" } });
    fireEvent.change(endSelect(), { target: { value: "15:00" } });
    fireEvent.change(titleInput(), { target: { value: "Демо" } });
    submitForm();
    await within(dialog()).findByRole("alert");
    await waitFor(() => expect(api.listCallsFor(TOMORROW)).toBe(2));

    expect(await violations()).toEqual([]);
    expect(alertCount()).toBe(1);
  });

  it("A2, U3: баннер сервера (500), затем «Начало» очищено после отправки — сводка валидации скрыта, ровно один role=alert", async () => {
    const api = new FakeBookingsApi();
    api.failNext("create", new ApiError({ status: 500, code: "PARSE", message: "html" }));
    await fillAndSave(api);
    const banner = await within(dialog()).findByRole("alert");
    expect(banner.textContent).toContain("Ошибка сервера");

    // Без повторной отправки: новая отправка снимает баннер (этап 6), и сводка тогда законна.
    fireEvent.change(startInput(), { target: { value: "" } });

    expect(startInput().getAttribute("aria-invalid")).toBe("true");
    expect(within(dialog()).queryByText("Исправьте ошибки:")).toBeNull();
    expect(alertCount()).toBe(1);
    expect(screen.getByRole("alert").textContent).toContain("Ошибка сервера");
  });
});

describe("A2: axe — диалог удаления", () => {
  const DEMO = booking("b1", TOMORROW, "14:00", "15:00", "Демо");

  async function openDelete(api: FakeBookingsApi) {
    renderDay(api, TOMORROW);
    const trigger = await screen.findByRole("button", { name: /^Удалить бронь 14:00–15:00/ });
    await waitFor(() => expect(api.listCallsFor(TOMORROW)).toBe(1));
    fireEvent.click(trigger);
    return screen.findByRole("alertdialog", { name: "Удалить бронь?" });
  }

  it("A2, F6: открытый диалог — нарушений axe 0, role=alert 0", async () => {
    await openDelete(new FakeBookingsApi([DEMO]));

    expect(await violations()).toEqual([]);
    expect(alertCount()).toBe(0);
  });

  it("A2, F6, U3: ошибка удаления (500) — нарушений axe 0, ровно один role=alert", async () => {
    const api = new FakeBookingsApi([DEMO]);
    api.failNext("remove", new ApiError({ status: 500, code: "PARSE", message: "html" }));
    const confirm = await openDelete(api);
    fireEvent.click(within(confirm).getByRole("button", { name: "Удалить" }));
    await within(confirm).findByRole("alert");

    expect(await violations()).toEqual([]);
    expect(alertCount()).toBe(1);
  });
});
