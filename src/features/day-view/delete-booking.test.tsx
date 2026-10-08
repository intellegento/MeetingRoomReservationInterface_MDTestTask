// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/errors";
import type { Booking } from "@/domain/types";
import { createTestWrapper, FakeBookingsApi } from "../bookings/test-utils";
import { resetNowForTests, setNowForTests } from "../clock";
import { DayView } from "./day-view";

// Удаление брони (F6, B11, Q4, Q15, U3, A2) с тестовой реализацией BookingsApi (S2).
// Сейчас — 2026-10-08 10:10 по Бишкеку (testing.md, правило 4). Вывод ожиданий — docs/traces/stage-6.md.

const TODAY = "2026-10-08";
const TOMORROW = "2026-10-09";
const DEMO: Booking = { id: "b1", date: TOMORROW, start: "14:00", end: "15:00", title: "Демо" };
const DELETE_NAME = /^Удалить бронь 14:00–15:00/;

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

const confirmDialog = () => screen.getByRole("alertdialog", { name: "Удалить бронь?" });
const removeCalls = (api: FakeBookingsApi) => api.mutationCalls.filter((call) => call.method === "remove").length;
const gridTexts = () => screen.queryAllByRole("listitem", { hidden: true }).map((item) => item.textContent ?? "");
const announced = (text: string) => expect(screen.getByText(text).closest("[aria-live]")).not.toBeNull();

async function openDelete(api: FakeBookingsApi) {
  renderDay(api, TOMORROW);
  const trigger = await screen.findByRole("button", { name: DELETE_NAME });
  await waitFor(() => expect(api.listCallsFor(TOMORROW)).toBe(1));
  fireEvent.click(trigger);
  await screen.findByRole("alertdialog", { name: "Удалить бронь?" });
  return trigger;
}

describe("Удаление: кнопка и подтверждение (F6, B11, A2)", () => {
  it("F6, B11, Q4: сегодня в 10:10 «Удалить» есть у брони 11:00–12:00 и нет у начавшейся 10:00–10:30", async () => {
    renderDay(
      new FakeBookingsApi([
        { id: "b1", date: TODAY, start: "10:00", end: "10:30" },
        { id: "b2", date: TODAY, start: "11:00", end: "12:00" },
      ]),
      TODAY,
    );

    expect(await screen.findByRole("button", { name: /^Удалить бронь 11:00–12:00/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Удалить бронь 10:00–10:30/ })).toBeNull();
  });

  it("F6, A2: у кнопки «Удалить» aria-label с временем и названием брони — «Удалить бронь 14:00–15:00, Демо»", async () => {
    renderDay(new FakeBookingsApi([DEMO]), TOMORROW);
    await waitFor(() => expect(gridTexts().some((text) => text.includes("14:00–15:00"))).toBe(true));

    const item = screen.getAllByRole("listitem").find((element) => element.textContent?.includes("14:00–15:00"));
    const remove = within(item!).getByRole("button", { name: /^Удалить/ });
    expect(remove.getAttribute("aria-label")).toBe("Удалить бронь 14:00–15:00, Демо");
  });

  it("F6, A2: «Удалить» открывает alertdialog с описанием брони, фокус на «Отмена», window.confirm не вызывается, DELETE не ушёл", async () => {
    const confirm = vi.spyOn(window, "confirm").mockImplementation(() => true);
    const api = new FakeBookingsApi([DEMO]);
    await openDelete(api);

    expect(confirmDialog().textContent).toContain("14:00–15:00");
    expect(confirmDialog().textContent).toContain("Демо");
    expect(document.activeElement).toBe(within(confirmDialog()).getByRole("button", { name: "Отмена" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(removeCalls(api)).toBe(0);
  });

  it("F6, A2: «Отмена» закрывает диалог без DELETE, бронь на месте, фокус на кнопке «Удалить» этой брони", async () => {
    const api = new FakeBookingsApi([DEMO]);
    const trigger = await openDelete(api);

    fireEvent.click(within(confirmDialog()).getByRole("button", { name: "Отмена" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(removeCalls(api)).toBe(0);
    expect(gridTexts().some((text) => text.includes("14:00–15:00"))).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });
});

describe("Удаление: отправка и исходы (F6, U3, U4, Q15)", () => {
  it("F6, U4, A2: подтверждение → «Удаляем…» disabled, второй клик без второго DELETE; успех → диалог закрыт, list перезапрошен, брони нет, aria-live «Бронь удалена», фокус на «Новая бронь»", async () => {
    const api = new FakeBookingsApi([DEMO]);
    await openDelete(api);
    const release = api.holdMutations();

    fireEvent.click(within(confirmDialog()).getByRole("button", { name: "Удалить" }));
    const pending = await within(confirmDialog()).findByRole("button", { name: "Удаляем…" });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(pending);
    expect(removeCalls(api)).toBe(1);

    release();

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(api.listCallsFor(TOMORROW)).toBe(2));
    await waitFor(() => expect(gridTexts().some((text) => text.includes("14:00–15:00"))).toBe(false));
    expect(removeCalls(api)).toBe(1);
    announced("Бронь удалена");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Новая бронь" }));
  });

  it("F6, U3: DELETE → 500 → в диалоге role=alert «Ошибка сервера», бронь в списке, «Повторить» шлёт DELETE снова и удаляет", async () => {
    const api = new FakeBookingsApi([DEMO]);
    api.failNext("remove", new ApiError({ status: 500, code: "PARSE", message: "html" }));
    await openDelete(api);

    fireEvent.click(within(confirmDialog()).getByRole("button", { name: "Удалить" }));

    const alert = await within(confirmDialog()).findByRole("alert");
    expect(alert.textContent).toContain("Ошибка сервера");
    expect(gridTexts().some((text) => text.includes("14:00–15:00"))).toBe(true);
    expect(api.listCallsFor(TOMORROW)).toBe(1);

    fireEvent.click(within(confirmDialog()).getByRole("button", { name: "Повторить" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(removeCalls(api)).toBe(2);
    await waitFor(() => expect(gridTexts().some((text) => text.includes("14:00–15:00"))).toBe(false));
    announced("Бронь удалена");
  });

  it("F6: DELETE → 404 — мягкий успех: диалог закрыт без ошибки, aria-live «Бронь уже удалена», list перезапрошен, фокус на «Новая бронь»", async () => {
    const api = new FakeBookingsApi([DEMO]);
    await openDelete(api);
    api.bookings = [];
    api.failNext("remove", new ApiError({ status: 404, code: "NOT_FOUND", message: "Бронь не найдена" }));

    fireEvent.click(within(confirmDialog()).getByRole("button", { name: "Удалить" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
    announced("Бронь уже удалена");
    await waitFor(() => expect(api.listCallsFor(TOMORROW)).toBe(2));
    await waitFor(() => expect(gridTexts().some((text) => text.includes("14:00–15:00"))).toBe(false));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Новая бронь" }));
  });
});
