// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/errors";
import { MESSAGES } from "@/domain/rules";
import type { Booking } from "@/domain/types";
import { createTestWrapper, FakeBookingsApi } from "../bookings/test-utils";
import { resetNowForTests, setNowForTests } from "../clock";
import { DayView, type DateChangeMode } from "./day-view";

// Экран дня с тестовой реализацией BookingsApi (S2). Сейчас — 2026-10-08 10:10 по Бишкеку
// (testing.md, правило 4). Вывод ожиданий — docs/traces/stage-4.md.

const TODAY = "2026-10-08";
const YESTERDAY = "2026-10-07";
const TOMORROW = "2026-10-09";

const LOCKED_NOTE = MESSAGES.BOOKING_LOCKED;
const PAST_DATE_NOTE = "Прошедшая дата, бронирование недоступно";

const booking = (id: string, date: string, start: string, end: string, title?: string): Booking =>
  title === undefined ? { id, date, start, end } : { id, date, start, end, title };

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

/** Экран с обвязкой URL: dateParam хранится в состоянии, как ?date у роутера. */
function renderDay(api: FakeBookingsApi, initialParam: string | null) {
  const changes: { date: string; mode: DateChangeMode }[] = [];
  const { wrapper: Wrapper } = createTestWrapper(api);
  let setParam: (param: string | null) => void = () => {};
  function Harness() {
    const [param, set] = useState(initialParam);
    setParam = set;
    return (
      <DayView
        dateParam={param}
        onDateChange={(date, mode) => {
          changes.push({ date, mode });
          set(date);
        }}
      />
    );
  }
  render(
    <Wrapper>
      <Harness />
    </Wrapper>,
  );
  return { changes, setUrl: (param: string | null) => act(() => setParam(param)) };
}

const schedule = () => screen.getByRole("region", { name: "Расписание дня" });
const bookingItems = async () => within(await screen.findByRole("list", { name: "Брони" })).getAllByRole("listitem");
const itemWith = async (text: string) => (await bookingItems()).find((item) => item.textContent?.includes(text));
const shownDate = () => document.querySelector("time")?.getAttribute("dateTime");
const lastListDate = (api: FakeBookingsApi) => api.listCalls.at(-1)?.date;

describe("DayView: дата по умолчанию", () => {
  it("B9, F1: без ?date открыта сегодняшняя дата по Бишкеку, list(2026-10-08), URL не меняется", async () => {
    const api = new FakeBookingsApi([booking("b1", TODAY, "11:00", "12:00")]);
    const { changes } = renderDay(api, null);

    expect(await screen.findByText(/11:00–12:00/)).toBeTruthy();
    expect(api.listCalls.map((call) => call.date)).toEqual([TODAY]);
    expect(shownDate()).toBe(TODAY);
    expect(changes).toEqual([]);
  });

  it("B9, U2: в 01:30 по Бишкеку (2026-10-07T19:30Z) сегодня = 2026-10-08: пусто, «Забронировать», «Новая бронь» доступна, нет баннера прошедшей даты", async () => {
    setNowForTests(new Date("2026-10-07T19:30:00Z"));
    const api = new FakeBookingsApi();
    renderDay(api, null);

    expect(await screen.findByText("На эту дату броней нет")).toBeTruthy();
    expect(api.listCalls.map((call) => call.date)).toEqual([TODAY]);
    expect(shownDate()).toBe(TODAY);
    expect(screen.getByRole("button", { name: "Забронировать" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Новая бронь" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(PAST_DATE_NOTE)).toBeNull();
  });
});

describe("DayView: состояния", () => {
  it("U1: пока list не ответил — skeleton «Загрузка…» role=status, aria-busy=true, кнопки даты доступны; после ответа — брони", async () => {
    const api = new FakeBookingsApi([booking("b1", TOMORROW, "11:00", "12:00")]);
    const release = api.holdList(TOMORROW);
    renderDay(api, TOMORROW);

    expect((await screen.findByRole("status")).textContent).toContain("Загрузка…");
    expect(schedule().getAttribute("aria-busy")).toBe("true");
    for (const name of ["Назад", "Сегодня", "Вперёд"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(false);
    }

    release();
    expect(await screen.findByText(/11:00–12:00/)).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(schedule().getAttribute("aria-busy")).toBe("false");
  });

  it("F2: брони по возрастанию начала, без названия — «Без названия»", async () => {
    const api = new FakeBookingsApi([
      booking("b2", TOMORROW, "11:00", "12:00"),
      booking("b1", TOMORROW, "09:00", "10:00", "Планёрка"),
    ]);
    renderDay(api, TOMORROW);

    const items = await bookingItems();
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain("09:00–10:00");
    expect(items[0]!.textContent).toContain("Планёрка");
    expect(items[1]!.textContent).toContain("11:00–12:00");
    expect(items[1]!.textContent).toContain("Без названия");
  });

  it("F2: сетка — 18 рядов по 30 минут от 09:00 до 17:30", async () => {
    const api = new FakeBookingsApi([booking("b1", TOMORROW, "11:00", "12:00")]);
    renderDay(api, TOMORROW);
    await screen.findByText(/11:00–12:00/);

    const labels = within(schedule())
      .getAllByText(/^\d{2}:\d{2}$/)
      .map((label) => label.textContent);
    const expected = Array.from({ length: 18 }, (_, i) => {
      const minutes = 9 * 60 + i * 30;
      return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    });
    expect(expected[0]).toBe("09:00");
    expect(expected[17]).toBe("17:30");
    expect(labels).toEqual(expected);
  });

  it("U2: пустая будущая дата — «На эту дату броней нет» и «Забронировать»", async () => {
    renderDay(new FakeBookingsApi(), TOMORROW);

    expect(await screen.findByText("На эту дату броней нет")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Забронировать" })).toBeTruthy();
  });

  it.each([
    { label: "500", error: new ApiError({ status: 500, code: "PARSE", message: "Сервер вернул неожиданный ответ" }) },
    { label: "NETWORK", error: new ApiError({ status: 0, code: "NETWORK", message: "Нет соединения" }) },
  ])("U3: ошибка загрузки ($label) — role=alert «Не удалось загрузить брони», «Повторить» повторяет list и показывает брони", async ({ error }) => {
    const api = new FakeBookingsApi([booking("b1", TOMORROW, "11:00", "12:00")]);
    api.failList(TOMORROW, error);
    renderDay(api, TOMORROW);

    expect((await screen.findByRole("alert")).textContent).toContain("Не удалось загрузить брони");
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));

    expect(await screen.findByText(/11:00–12:00/)).toBeTruthy();
    expect(api.listCallsFor(TOMORROW)).toBe(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("DayView: прошедшее и только чтение", () => {
  it("B6, F1: прошедшая дата — баннер, «Новая бронь» disabled с aria-describedby на пояснение, брони видны только для чтения", async () => {
    const api = new FakeBookingsApi([booking("b1", YESTERDAY, "14:00", "14:30", "Ретро")]);
    renderDay(api, YESTERDAY);

    const item = await itemWith("14:00–14:30");
    expect(item?.textContent).toContain("Ретро");
    expect(item?.textContent).toContain(LOCKED_NOTE);
    expect(within(item!).queryByRole("button", { name: /^Изменить бронь/ })).toBeNull();
    expect(within(item!).getByRole("button", { name: /^Посмотреть бронь 14:00–14:30/ })).toBeTruthy();
    expect(within(item!).queryByRole("button", { name: /Удалить/ })).toBeNull();

    expect(screen.getByText(PAST_DATE_NOTE)).toBeTruthy();
    const create = screen.getByRole("button", { name: "Новая бронь" }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    const describedBy = create.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toContain("бронирование недоступно");
  });

  it("U2, B6: пустая прошедшая дата — «На эту дату броней нет» без «Забронировать»", async () => {
    renderDay(new FakeBookingsApi(), YESTERDAY);

    expect(await screen.findByText("На эту дату броней нет")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Забронировать" })).toBeNull();
  });

  it("B6: сегодня прошедшее время подписано «Прошедшее время», на будущей дате полосы нет", async () => {
    const api = new FakeBookingsApi([
      booking("b1", TODAY, "11:00", "12:00"),
      booking("b2", TOMORROW, "11:00", "12:00"),
    ]);
    const { setUrl } = renderDay(api, TODAY);
    await screen.findByText(/11:00–12:00/);
    expect(within(schedule()).getByText("Прошедшее время")).toBeTruthy();

    setUrl(TOMORROW);
    await waitFor(() => expect(shownDate()).toBe(TOMORROW));
    await waitFor(() => expect(lastListDate(api)).toBe(TOMORROW));
    await screen.findByText(/11:00–12:00/);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(within(schedule()).queryByText("Прошедшее время")).toBeNull();
  });

  it.each([
    { start: "09:00", end: "10:00", locked: true },
    { start: "10:00", end: "10:30", locked: true },
    { start: "10:10", end: "10:40", locked: true },
    { start: "10:11", end: "10:41", locked: false },
  ])("B11: сегодня в 10:10 бронь $start–$end — только чтение: $locked", async ({ start, end, locked }) => {
    renderDay(new FakeBookingsApi([booking("b1", TODAY, start, end)]), TODAY);

    const item = await itemWith(`${start}–${end}`);
    expect(item).toBeTruthy();
    expect(item!.textContent?.includes(LOCKED_NOTE)).toBe(locked);
    // Решение 2 этапа 5: начавшаяся бронь открывается только для просмотра, без правки и удаления.
    const edit = within(item!).queryByRole("button", { name: new RegExp(`^Изменить бронь ${start}–${end}`) });
    const view = within(item!).queryByRole("button", { name: new RegExp(`^Посмотреть бронь ${start}–${end}`) });
    const remove = within(item!).queryByRole("button", { name: /Удалить/ });
    expect(edit === null).toBe(locked);
    expect(view === null).toBe(!locked);
    expect(locked && remove !== null).toBe(false);
  });
});

describe("DayView: смена даты", () => {
  it.each([
    { button: "Вперёд", from: TODAY, to: TOMORROW },
    { button: "Назад", from: TODAY, to: YESTERDAY },
    { button: "Сегодня", from: "2026-10-12", to: TODAY },
  ])("F1: кнопка «$button» с $from → onDateChange($to, push) и list($to)", async ({ button, from, to }) => {
    const api = new FakeBookingsApi([booking("b1", to, "16:00", "17:00")]);
    const { changes } = renderDay(api, from);
    await screen.findByText("На эту дату броней нет");

    fireEvent.click(screen.getByRole("button", { name: button }));

    expect(changes).toEqual([{ date: to, mode: "push" }]);
    expect(await screen.findByText(/16:00–17:00/)).toBeTruthy();
    expect(lastListDate(api)).toBe(to);
    expect(shownDate()).toBe(to);
  });

  it("F1: смена ?date в URL → list новой даты и её брони", async () => {
    const api = new FakeBookingsApi([booking("b1", "2026-10-20", "16:00", "17:00")]);
    const { setUrl } = renderDay(api, TOMORROW);
    await screen.findByText("На эту дату броней нет");

    setUrl("2026-10-20");

    expect(await screen.findByText(/16:00–17:00/)).toBeTruthy();
    expect(api.listCallsFor("2026-10-20")).toBe(1);
    expect(shownDate()).toBe("2026-10-20");
  });

  it.each(["2026-13-01", "2026-02-30", "abc", ""])(
    "F1: невалидная дата в URL «%s» заменяется сегодняшней (replace), list(невалидной) не вызывается",
    async (bad) => {
      const api = new FakeBookingsApi([booking("b1", TODAY, "16:00", "17:00")]);
      const { changes } = renderDay(api, bad);

      expect(await screen.findByText(/16:00–17:00/)).toBeTruthy();
      expect(changes).toEqual([{ date: TODAY, mode: "replace" }]);
      expect(api.listCallsFor(bad)).toBe(0);
      expect(api.listCallsFor(TODAY)).toBeGreaterThan(0);
      expect(shownDate()).toBe(TODAY);
    },
  );

  it("F1: выбор в поле «Дата» → onDateChange(2026-10-20, push), list(2026-10-20) и её брони", async () => {
    const api = new FakeBookingsApi([booking("b1", "2026-10-20", "16:00", "17:00")]);
    const { changes } = renderDay(api, TOMORROW);
    await screen.findByText("На эту дату броней нет");

    fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-10-20" } });

    expect(changes).toEqual([{ date: "2026-10-20", mode: "push" }]);
    expect(await screen.findByText(/16:00–17:00/)).toBeTruthy();
    expect(lastListDate(api)).toBe("2026-10-20");
    expect(shownDate()).toBe("2026-10-20");
  });

  it("F1: пустое значение поля «Дата» оставляет текущую дату, onDateChange не вызывается", async () => {
    const api = new FakeBookingsApi([booking("b1", TOMORROW, "16:00", "17:00")]);
    const { changes } = renderDay(api, TOMORROW);
    await screen.findByText(/16:00–17:00/);

    fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "" } });

    expect(changes).toEqual([]);
    expect(shownDate()).toBe(TOMORROW);
    expect((screen.getByLabelText("Дата") as HTMLInputElement).value).toBe(TOMORROW);
    expect(api.listCalls.map((call) => call.date)).toEqual([TOMORROW]);
    expect(screen.getByText(/16:00–17:00/)).toBeTruthy();
  });

  it("F1: поле «Дата» синхронизировано с кнопками и URL", async () => {
    const api = new FakeBookingsApi();
    const { setUrl } = renderDay(api, TOMORROW);
    const input = () => (screen.getByLabelText("Дата") as HTMLInputElement).value;
    await screen.findByText("На эту дату броней нет");
    expect(input()).toBe(TOMORROW);

    fireEvent.click(screen.getByRole("button", { name: "Вперёд" }));
    expect(input()).toBe("2026-10-10");

    fireEvent.click(screen.getByRole("button", { name: "Сегодня" }));
    expect(input()).toBe(TODAY);

    setUrl("2026-10-20");
    expect(input()).toBe("2026-10-20");
  });

  it("F1, U1: при смене даты прежние брони видны с «Загрузка…» и aria-busy, затем брони новой даты (keepPreviousData)", async () => {
    const next = "2026-10-10";
    const api = new FakeBookingsApi([
      booking("b1", TOMORROW, "11:00", "12:00"),
      booking("b2", next, "15:00", "16:00"),
    ]);
    renderDay(api, TOMORROW);
    await screen.findByText(/11:00–12:00/);
    const release = api.holdList(next);

    fireEvent.click(screen.getByRole("button", { name: "Вперёд" }));

    expect((await screen.findByRole("status")).textContent).toContain("Загрузка…");
    expect(screen.getByText(/11:00–12:00/)).toBeTruthy();
    expect(schedule().getAttribute("aria-busy")).toBe("true");

    release();
    expect(await screen.findByText(/15:00–16:00/)).toBeTruthy();
    expect(screen.queryByText(/11:00–12:00/)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("F1, T9: гонка — A медленно, B быстро: показан B, поздний ответ A экран не меняет", async () => {
    const A = "2026-10-10";
    const B = "2026-10-11";
    const api = new FakeBookingsApi([booking("a1", A, "12:00", "13:00"), booking("b1", B, "15:00", "16:00")]);
    renderDay(api, TOMORROW);
    await screen.findByText("На эту дату броней нет");
    const releaseA = api.holdList(A);

    fireEvent.click(screen.getByRole("button", { name: "Вперёд" }));
    await waitFor(() => expect(api.listCallsFor(A)).toBe(1));
    fireEvent.click(screen.getByRole("button", { name: "Вперёд" }));

    expect(await screen.findByText(/15:00–16:00/)).toBeTruthy();
    await act(async () => releaseA());
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.queryByText(/12:00–13:00/)).toBeNull();
    expect(screen.getByText(/15:00–16:00/)).toBeTruthy();
    expect(shownDate()).toBe(B);
  });

  it("F1, U3: отмена запроса A при переходе на B не показывает ошибку (D2)", async () => {
    const A = TOMORROW;
    const B = "2026-10-10";
    const api = new FakeBookingsApi([booking("b1", B, "15:00", "16:00")]);
    api.hangList(A);
    renderDay(api, A);
    await waitFor(() => expect(api.listCallsFor(A)).toBe(1));

    fireEvent.click(screen.getByRole("button", { name: "Вперёд" }));

    expect(await screen.findByText(/15:00–16:00/)).toBeTruthy();
    await waitFor(() => expect(api.listCalls.find((call) => call.date === A)?.signal?.aborted).toBe(true));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Не удалось загрузить брони")).toBeNull();
  });
});

describe("DayView: прежний список во время загрузки (J3)", () => {
  // Вывод ожидания: пока у запроса isPlaceholderData (видны брони прежней даты), все кнопки броней disabled
  // и через aria-describedby ссылаются на пояснение STALE_NOTE; после ответа — кнопки новой даты активны, без пояснения.
  const STALE_NOTE = "Брони выбранной даты загружаются — действия недоступны";
  const describedText = (element: HTMLElement) =>
    (element.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
  const isDisabled = (element: HTMLElement) => (element as HTMLButtonElement).disabled;

  it("F1, U1: сегодня 10:10 → «Вперёд», пока грузится завтра: «Посмотреть» 09:30–10:30, «Изменить» и «Удалить» 11:00–12:00 disabled с пояснением", async () => {
    const api = new FakeBookingsApi([
      booking("t1", TODAY, "09:30", "10:30", "Планёрка"),
      booking("t2", TODAY, "11:00", "12:00", "Созвон"),
      booking("n1", TOMORROW, "15:00", "16:00", "Демо"),
    ]);
    renderDay(api, TODAY);
    await screen.findByText(/11:00–12:00/);
    const release = api.holdList(TOMORROW);

    fireEvent.click(screen.getByRole("button", { name: "Вперёд" }));
    await screen.findByRole("status");

    const stale = [
      screen.getByRole("button", { name: /^Посмотреть бронь 09:30–10:30/ }),
      screen.getByRole("button", { name: /^Изменить бронь 11:00–12:00/ }),
      screen.getByRole("button", { name: /^Удалить бронь 11:00–12:00/ }),
    ];
    for (const button of stale) {
      expect(isDisabled(button)).toBe(true);
      expect(describedText(button)).toBe(STALE_NOTE);
    }
    fireEvent.click(stale[1]!);
    fireEvent.click(stale[2]!);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();

    release();
    const edit = await screen.findByRole("button", { name: /^Изменить бронь 15:00–16:00/ });
    const remove = screen.getByRole("button", { name: /^Удалить бронь 15:00–16:00/ });
    for (const button of [edit, remove]) {
      expect(isDisabled(button)).toBe(false);
      expect(button.getAttribute("aria-describedby")).toBeNull();
    }
    expect(screen.queryByText(STALE_NOTE)).toBeNull();
  });

  it("F1, B6: с завтра на прошедшую дату — пока грузится, под баннером «Прошедшая дата» нет активных «Изменить»/«Удалить»", async () => {
    const api = new FakeBookingsApi([booking("n1", TOMORROW, "11:00", "12:00", "Ретро")]);
    const { setUrl } = renderDay(api, TOMORROW);
    await screen.findByText(/11:00–12:00/);
    const release = api.holdList(YESTERDAY);

    setUrl(YESTERDAY);
    expect(await screen.findByText(PAST_DATE_NOTE)).toBeTruthy();

    const actions = within(schedule()).getAllByRole("button", { name: /^(Изменить|Удалить) бронь 11:00–12:00/ });
    expect(actions).toHaveLength(2);
    for (const button of actions) {
      expect(isDisabled(button)).toBe(true);
      expect(describedText(button)).toBe(STALE_NOTE);
    }

    release();
    expect(await screen.findByText("На эту дату броней нет")).toBeTruthy();
  });

  it("F1, U1: завтра → «Вперёд», пока грузится 2026-10-10: «Новая бронь» disabled с пояснением, клик не открывает форму; после ответа — доступна", async () => {
    const api = new FakeBookingsApi([booking("n1", TOMORROW, "11:00", "12:00"), booking("s1", "2026-10-10", "15:00", "16:00")]);
    renderDay(api, TOMORROW);
    await screen.findByText(/11:00–12:00/);
    const release = api.holdList("2026-10-10");

    fireEvent.click(screen.getByRole("button", { name: "Вперёд" }));
    await screen.findByRole("status");

    const create = screen.getByRole("button", { name: "Новая бронь" });
    expect(isDisabled(create)).toBe(true);
    expect(describedText(create)).toBe(STALE_NOTE);
    fireEvent.click(create);
    expect(screen.queryByRole("dialog")).toBeNull();

    release();
    await screen.findByText(/15:00–16:00/);
    expect(isDisabled(create)).toBe(false);
    expect(create.getAttribute("aria-describedby")).toBeNull();
  });

  it("F1, U2: пустое завтра → «Вперёд», пока грузится 2026-10-10: «Забронировать» прежнего пустого дня disabled с пояснением; после ответа — доступна", async () => {
    const api = new FakeBookingsApi();
    renderDay(api, TOMORROW);
    await screen.findByText("На эту дату броней нет");
    const release = api.holdList("2026-10-10");

    fireEvent.click(screen.getByRole("button", { name: "Вперёд" }));
    await screen.findByRole("status");

    const book = screen.getByRole("button", { name: "Забронировать" });
    expect(isDisabled(book)).toBe(true);
    expect(describedText(book)).toBe(STALE_NOTE);
    fireEvent.click(book);
    expect(screen.queryByRole("dialog")).toBeNull();

    release();
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    const fresh = screen.getByRole("button", { name: "Забронировать" });
    expect(isDisabled(fresh)).toBe(false);
    expect(fresh.getAttribute("aria-describedby")).toBeNull();
  });

  it("F1: список своей даты (не placeholder) — кнопки активны, пояснения нет", async () => {
    const api = new FakeBookingsApi([booking("n1", TOMORROW, "11:00", "12:00")]);
    renderDay(api, TOMORROW);
    const edit = await screen.findByRole("button", { name: /^Изменить бронь 11:00–12:00/ });
    expect(isDisabled(edit)).toBe(false);
    expect(edit.getAttribute("aria-describedby")).toBeNull();
    expect(screen.queryByText(STALE_NOTE)).toBeNull();
  });
});
