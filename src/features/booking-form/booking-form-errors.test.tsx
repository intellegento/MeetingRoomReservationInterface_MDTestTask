// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/errors";
import type { Booking } from "@/domain/types";
import { createTestWrapper, FakeBookingsApi } from "../bookings/test-utils";
import { resetNowForTests, setNowForTests } from "../clock";
import { DayView } from "../day-view/day-view";

// Ошибки сервера в форме брони (B8, U3, Q7, D4) с тестовой реализацией BookingsApi (S2).
// Сейчас — 2026-10-08 10:10 по Бишкеку (testing.md, правило 4). Вывод ожиданий — docs/traces/stage-6.md.

const TOMORROW = "2026-10-09";
const CONFLICT_TEXT = "Это время только что заняли: 14:00–15:00 «Чужая». Выберите другой интервал";

const booking = (id: string, date: string, start: string, end: string, title?: string): Booking =>
  title === undefined ? { id, date, start, end } : { id, date, start, end, title };

const OTHER = booking("x1", TOMORROW, "14:00", "15:00", "Чужая");
const conflictWith = (other: Booking) =>
  new ApiError({ status: 409, code: "OVERLAP", message: "Время занято", conflictWith: other });

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
  setNowForTests(new Date("2026-10-08T04:10:00Z"));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchSpy.mockClear();
  resetNowForTests();
});

function renderDay(api: FakeBookingsApi, date: string) {
  const { wrapper: Wrapper } = createTestWrapper(api);
  function Harness() {
    const [param, set] = useState<string | null>(date);
    return <DayView dateParam={param} onDateChange={(next) => set(next)} />;
  }
  render(
    <Wrapper>
      <Harness />
    </Wrapper>,
  );
}

const dialog = () => screen.getByRole("dialog");
const startInput = () => within(dialog()).getByLabelText("Начало") as HTMLInputElement;
const endSelect = () => within(dialog()).getByLabelText("Окончание") as HTMLSelectElement;
const titleInput = () => within(dialog()).getByLabelText("Название") as HTMLInputElement;
const button = (name: string | RegExp) => within(dialog()).getByRole("button", { name }) as HTMLButtonElement;
const optionFor = (end: string) => Array.from(endSelect().options).find((option) => option.value === end);
const description = (element: HTMLElement) =>
  (element.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
/** Тексты броней в сетке; сетка за модальным диалогом скрыта от a11y-дерева (aria-hidden), поэтому hidden: true. */
const gridTexts = () => screen.queryAllByRole("listitem", { hidden: true }).map((item) => item.textContent ?? "");

const setStart = (value: string) => fireEvent.change(startInput(), { target: { value } });
const setEnd = (value: string) => fireEvent.change(endSelect(), { target: { value } });
const setTitle = (value: string) => fireEvent.change(titleInput(), { target: { value } });

async function openCreate(api: FakeBookingsApi) {
  renderDay(api, TOMORROW);
  const create = await screen.findByRole("button", { name: "Новая бронь" });
  await waitFor(() => expect(api.listCallsFor(TOMORROW)).toBe(1));
  fireEvent.click(create);
  await screen.findByRole("dialog", { name: "Новая бронь" });
}

async function openEdit(api: FakeBookingsApi, time: string) {
  renderDay(api, TOMORROW);
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(`^Изменить бронь ${time}`) }));
  await screen.findByRole("dialog", { name: "Изменить бронь" });
  await waitFor(() => expect(api.listCallsFor(TOMORROW)).toBe(1));
}

async function fillAndSave(api: FakeBookingsApi) {
  await openCreate(api);
  setStart("14:00");
  setEnd("15:00");
  setTitle("Демо");
  fireEvent.click(button("Сохранить"));
}

const expectDataKept = (start: string, end: string, title: string) => {
  expect(startInput().value).toBe(start);
  expect(endSelect().value).toBe(end);
  expect(titleInput().value).toBe(title);
};

describe("Форма: 409 при сохранении (B8, Q7)", () => {
  it("B8, T6, T7: слот свободен в UI → 409 → данные на месте, ровно один перезапрос list на дату формы, сообщение с фокусом, пометка снимается после смены времени", async () => {
    const api = new FakeBookingsApi();
    const create = vi.spyOn(api, "create");
    await openCreate(api);
    // Другой пользователь занял 14:00–15:00 после загрузки списка: в UI слот свободен.
    api.bookings.push(OTHER);
    setStart("14:00");
    expect(optionFor("15:00")?.disabled).toBe(false);
    setEnd("15:00");
    setTitle("Демо");
    api.failNext("create", conflictWith(OTHER));
    fireEvent.click(button("Сохранить"));

    const alert = await within(dialog()).findByRole("alert");
    expect(alert.textContent).toContain(CONFLICT_TEXT);
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expectDataKept("14:00", "15:00", "Демо");
    expect(screen.getByRole("dialog", { name: "Новая бронь" })).toBeTruthy();

    await waitFor(() => expect(api.listCallsFor(TOMORROW)).toBe(2));
    await waitFor(() => expect(gridTexts().some((text) => text.includes("14:00–15:00") && text.includes("Чужая"))).toBe(true));
    await waitFor(() => expect(optionFor("15:00")?.disabled).toBe(true));
    expect(api.listCalls.map((call) => call.date)).toEqual([TOMORROW, TOMORROW]);

    for (const element of [startInput(), endSelect()]) {
      expect(element.getAttribute("aria-invalid")).toBe("true");
      expect(description(element)).toContain("Пересекается с бронью 14:00–15:00 «Чужая»");
    }
    expect(startInput().readOnly).toBe(false);
    expect(endSelect().disabled).toBe(false);
    expect(button("Сохранить").disabled).toBe(false);

    setStart("15:00");
    expect(startInput().getAttribute("aria-invalid")).toBeNull();
    expect(description(startInput())).not.toContain("Пересекается");
    expect(description(endSelect())).not.toContain("Пересекается");
    expect(within(dialog()).queryByText(CONFLICT_TEXT)).toBeNull();

    setEnd("16:00");
    expect(dialog().querySelector('[aria-invalid="true"]')).toBeNull();
    fireEvent.click(button("Сохранить"));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1]?.[0]).toEqual({ date: TOMORROW, start: "15:00", end: "16:00", title: "Демо" });
  });

  it("B8: смена только окончания тоже снимает пометку конфликта с обоих полей", async () => {
    const api = new FakeBookingsApi();
    api.failNext("create", conflictWith(booking("x2", TOMORROW, "14:30", "15:00", "Чужая")));
    await fillAndSave(api);
    await within(dialog()).findByRole("alert");
    await waitFor(() => expect(startInput().getAttribute("aria-invalid")).toBe("true"));

    setEnd("14:30");

    expect(startInput().getAttribute("aria-invalid")).toBeNull();
    expect(endSelect().getAttribute("aria-invalid")).toBeNull();
    expect(within(dialog()).queryByText(/Это время только что заняли/)).toBeNull();
  });

  it("B8, Q7: 409 при правке → остаются изменённые значения, перезапрос list на дату брони, сообщение с фокусом", async () => {
    const api = new FakeBookingsApi([booking("b1", TOMORROW, "14:00", "15:00", "Демо")]);
    const other = booking("x1", TOMORROW, "16:00", "17:00", "Чужая");
    await openEdit(api, "14:00–15:00");
    setStart("16:00");
    setEnd("17:00");
    api.bookings.push(other);
    api.failNext("update", conflictWith(other));
    fireEvent.click(button("Сохранить"));

    const alert = await within(dialog()).findByRole("alert");
    expect(alert.textContent).toContain("Это время только что заняли: 16:00–17:00 «Чужая». Выберите другой интервал");
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expectDataKept("16:00", "17:00", "Демо");
    await waitFor(() => expect(api.listCallsFor(TOMORROW)).toBe(2));
    expect(startInput().getAttribute("aria-invalid")).toBe("true");
    expect(endSelect().getAttribute("aria-invalid")).toBe("true");
    expect(button("Сохранить").disabled).toBe(false);
  });

  it("B8, U3: перезапрос списка после 409 упал → форма открыта, данные и сообщение о конфликте на месте", async () => {
    const api = new FakeBookingsApi();
    await openCreate(api);
    api.failList(TOMORROW, new ApiError({ status: 500, code: "PARSE", message: "html" }));
    api.failNext("create", conflictWith(OTHER));
    setStart("14:00");
    setEnd("15:00");
    setTitle("Демо");
    fireEvent.click(button("Сохранить"));

    await waitFor(() => expect(api.listCallsFor(TOMORROW)).toBe(2));
    await waitFor(() => expect(screen.getByText("Не удалось загрузить брони")).toBeTruthy());
    expect(screen.getByRole("dialog", { name: "Новая бронь" })).toBeTruthy();
    expect(within(dialog()).getByRole("alert").textContent).toContain(CONFLICT_TEXT);
    expectDataKept("14:00", "15:00", "Демо");
  });
});

describe("Форма: 404 при правке (Q7)", () => {
  it("F5, Q7: PATCH → 404 → «Бронь была удалена», изменённые данные на месте, «Сохранить как новую бронь» создаёт бронь", async () => {
    const api = new FakeBookingsApi([booking("b1", TOMORROW, "14:00", "15:00", "Демо")]);
    const create = vi.spyOn(api, "create");
    await openEdit(api, "14:00–15:00");
    setStart("16:00");
    setEnd("17:00");
    setTitle("Демо 2");
    api.bookings = [];
    api.failNext("update", new ApiError({ status: 404, code: "NOT_FOUND", message: "Бронь не найдена" }));
    fireEvent.click(button("Сохранить"));

    const alert = await within(dialog()).findByRole("alert");
    expect(alert.textContent).toContain("Бронь была удалена");
    expectDataKept("16:00", "17:00", "Демо 2");
    expect(within(dialog()).queryByRole("button", { name: "Сохранить" })).toBeNull();

    fireEvent.click(button("Сохранить как новую бронь"));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]).toEqual({ date: TOMORROW, start: "16:00", end: "17:00", title: "Демо 2" });
    expect(screen.getByText("Бронь создана").closest("[aria-live]")).not.toBeNull();
  });
});

describe("Форма: 5xx, сеть и 400 (U3, D4)", () => {
  it("U3, D4: create → 500 → баннер «Ошибка сервера», данные на месте, «Повторить» повторяет create с теми же данными без перезапроса list", async () => {
    const api = new FakeBookingsApi();
    const create = vi.spyOn(api, "create");
    api.failNext("create", new ApiError({ status: 500, code: "PARSE", message: "html" }));
    await fillAndSave(api);

    const alert = await within(dialog()).findByRole("alert");
    expect(alert.textContent).toContain("Ошибка сервера");
    expectDataKept("14:00", "15:00", "Демо");
    expect(api.listCallsFor(TOMORROW)).toBe(1);

    fireEvent.click(within(alert).getByRole("button", { name: "Повторить" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]?.[0]).toEqual(create.mock.calls[0]?.[0]);
    expect(create.mock.calls[1]?.[0]).toEqual({ date: TOMORROW, start: "14:00", end: "15:00", title: "Демо" });
  });

  it("U3, D4: update → NETWORK → «Нет связи с сервером», «Повторить» повторяет update с тем же patch, list не перезапрашивается до успеха", async () => {
    const api = new FakeBookingsApi([booking("b1", TOMORROW, "14:00", "15:00", "Демо")]);
    const update = vi.spyOn(api, "update");
    await openEdit(api, "14:00–15:00");
    setStart("15:00");
    setEnd("16:00");
    api.failNext("update", new ApiError({ status: 0, code: "NETWORK", message: "offline" }));
    fireEvent.click(button("Сохранить"));

    const alert = await within(dialog()).findByRole("alert");
    expect(alert.textContent).toContain("Нет связи с сервером");
    expectDataKept("15:00", "16:00", "Демо");
    expect(api.listCallsFor(TOMORROW)).toBe(1);

    fireEvent.click(within(alert).getByRole("button", { name: "Повторить" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1]?.slice(0, 2)).toEqual(["b1", { start: "15:00", end: "16:00" }]);
  });

  it("U3, Q11: create → 400 → общий баннер «Сервер не принял запрос», данные на месте, без «Повторить»", async () => {
    const api = new FakeBookingsApi();
    api.failNext("create", new ApiError({ status: 400, code: "INVALID_REQUEST", message: "Unknown field foo" }));
    await fillAndSave(api);

    const alert = await within(dialog()).findByRole("alert");
    expect(alert.textContent).toContain("Сервер не принял запрос");
    expect(within(alert).queryByRole("button", { name: "Повторить" })).toBeNull();
    expectDataKept("14:00", "15:00", "Демо");
    expect(button("Сохранить").disabled).toBe(false);
  });
});
