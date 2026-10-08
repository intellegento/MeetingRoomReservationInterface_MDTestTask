// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/errors";
import { MESSAGES } from "@/domain/rules";
import type { Booking } from "@/domain/types";
import { createTestWrapper, FakeBookingsApi } from "../bookings/test-utils";
import { resetNowForTests, setNowForTests } from "../clock";
import { DayView } from "../day-view/day-view";

// Форма брони на экране дня с тестовой реализацией BookingsApi (S2). Сейчас — 2026-10-08 10:10
// по Бишкеку (testing.md, правило 4). Вывод ожиданий — docs/traces/stage-5.md.

const TODAY = "2026-10-08";
const TOMORROW = "2026-10-09";
const LATE_NOTE = "На сегодня бронирование уже недоступно";
const NO_ENDS_NOTE = "Нет доступного окончания для этого начала";

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
  vi.restoreAllMocks();
  fetchSpy.mockClear();
  resetNowForTests();
});

function renderDay(api: FakeBookingsApi, date: string) {
  const { wrapper: Wrapper, queryClient } = createTestWrapper(api);
  function Harness() {
    const [param, set] = useState<string | null>(date);
    return <DayView dateParam={param} onDateChange={(next) => set(next)} />;
  }
  render(
    <Wrapper>
      <Harness />
    </Wrapper>,
  );
  return { queryClient };
}

const dialog = () => screen.getByRole("dialog");
const field = (label: string) => within(dialog()).getByLabelText(label) as HTMLInputElement;
const startInput = () => field("Начало");
const endSelect = () => within(dialog()).getByLabelText("Окончание") as HTMLSelectElement;
const titleInput = () => field("Название");
const saveButton = () => within(dialog()).getByRole("button", { name: /Сохран/ }) as HTMLButtonElement;
const endOptions = () => Array.from(endSelect().options).filter((option) => option.value !== "");
const availableEnds = () => endOptions().filter((option) => !option.disabled).map((option) => option.value);
const optionFor = (end: string) => endOptions().find((option) => option.value === end);

/** Текст элементов, на которые ссылается aria-describedby. */
const description = (element: HTMLElement) =>
  (element.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");

const setStart = (value: string) => fireEvent.change(startInput(), { target: { value } });
const setEnd = (value: string) => fireEvent.change(endSelect(), { target: { value } });
const setTitle = (value: string) => fireEvent.change(titleInput(), { target: { value } });
const submit = () => fireEvent.click(saveButton());

async function openCreate(api: FakeBookingsApi, date: string) {
  const rendered = renderDay(api, date);
  const button = await screen.findByRole("button", { name: "Новая бронь" });
  await waitFor(() => expect(api.listCallsFor(date)).toBe(1));
  fireEvent.click(button);
  await screen.findByRole("dialog", { name: "Новая бронь" });
  return { ...rendered, button };
}

async function openEdit(api: FakeBookingsApi, date: string, time: string) {
  const rendered = renderDay(api, date);
  const button = await screen.findByRole("button", { name: new RegExp(`Изменить бронь ${time}`) });
  fireEvent.click(button);
  await screen.findByRole("dialog", { name: "Изменить бронь" });
  return { ...rendered, button };
}

const validation = (code: ApiError["code"], message: string, field?: "date" | "start" | "end" | "title") =>
  new ApiError(field === undefined ? { status: 422, code, message } : { status: 422, code, message, field });

describe("Форма: открытие и фокус (A2)", () => {
  it("A2, F4: «Новая бронь» открывает диалог: фокус в «Начало», «Дата» только для чтения, ошибок до ввода нет", async () => {
    await openCreate(new FakeBookingsApi(), TOMORROW);

    expect(document.activeElement).toBe(startInput());
    expect(field("Дата").value).toBe(TOMORROW);
    expect(field("Дата").readOnly).toBe(true);
    expect(startInput().type).toBe("time");
    expect(endSelect().tagName).toBe("SELECT");
    expect(dialog().querySelector('[aria-invalid="true"]')).toBeNull();
  });

  it("A2: Esc закрывает диалог, фокус возвращается на «Новая бронь»", async () => {
    const { button } = await openCreate(new FakeBookingsApi(), TOMORROW);

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(button);
  });

  it("A2, F5: «Отмена» закрывает правку, фокус возвращается на кнопку брони", async () => {
    const { button } = await openEdit(new FakeBookingsApi([booking("b1", TOMORROW, "14:00", "15:00")]), TOMORROW, "14:00–15:00");

    fireEvent.click(within(dialog()).getByRole("button", { name: "Отмена" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(button);
  });

  it("F4, U2: «Забронировать» в пустом дне открывает форму создания", async () => {
    renderDay(new FakeBookingsApi(), TOMORROW);

    fireEvent.click(await screen.findByRole("button", { name: "Забронировать" }));

    expect(await screen.findByRole("dialog", { name: "Новая бронь" })).toBeTruthy();
    expect(field("Дата").value).toBe(TOMORROW);
  });
});

describe("Форма: начало и варианты конца (F3, B10)", () => {
  it.each([
    { date: TODAY, label: "сегодня в 10:10", min: "10:10" },
    { date: TOMORROW, label: "завтра", min: "09:00" },
  ])("F3, B6: подсказка-минимум начала: $label → $min", async ({ date, min }) => {
    await openCreate(new FakeBookingsApi(), date);

    expect(startInput().min).toBe(min);
    expect(description(startInput())).toContain(`Не раньше ${min}`);
  });

  it("B2, B3, B4, B10: завтра, старт 12:00 → доступны ровно 12:30, 13:00, 13:30, 14:00", async () => {
    await openCreate(new FakeBookingsApi(), TOMORROW);

    setStart("12:00");

    expect(availableEnds()).toEqual(["12:30", "13:00", "13:30", "14:00"]);
    expect(endOptions()).toHaveLength(4);
  });

  it("B1, B10: старт 16:10 → доступны 16:40, 17:10, 17:40; 18:10 недоступен с причиной", async () => {
    await openCreate(new FakeBookingsApi(), TOMORROW);

    setStart("16:10");

    expect(availableEnds()).toEqual(["16:40", "17:10", "17:40"]);
    expect(optionFor("18:10")?.disabled).toBe(true);
    expect(optionFor("18:10")?.textContent).toContain(MESSAGES.OUTSIDE_WORKING_HOURS);
  });

  it("B5, B10: старт 10:45 при брони 11:00–12:00 → вариантов нет, пояснение и причина у опций", async () => {
    await openCreate(new FakeBookingsApi([booking("x", TOMORROW, "11:00", "12:00")]), TOMORROW);

    setStart("10:45");

    expect(availableEnds()).toEqual([]);
    expect(within(dialog()).getByText(NO_ENDS_NOTE)).toBeTruthy();
    expect(optionFor("11:15")?.textContent).toContain(MESSAGES.OVERLAP);
  });

  it("B5: бронь 10:00–11:00 — касание слева и справа доступно, пересечение нет; 11:00–11:30 создаётся", async () => {
    const api = new FakeBookingsApi([booking("x", TOMORROW, "10:00", "11:00")]);
    const create = vi.spyOn(api, "create");
    await openCreate(api, TOMORROW);

    setStart("09:00");
    expect(availableEnds()).toEqual(["09:30", "10:00"]);

    setStart("11:00");
    expect(availableEnds()).toEqual(["11:30", "12:00", "12:30", "13:00"]);
    setEnd("11:30");
    submit();

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]?.[0]).toEqual({ date: TOMORROW, start: "11:00", end: "11:30" });
  });

  it("F3: смена начала — допустимый конец сохраняется", async () => {
    await openCreate(new FakeBookingsApi(), TOMORROW);
    setStart("12:00");
    setEnd("14:00");

    setStart("12:30");

    expect(endSelect().value).toBe("14:00");
    expect(within(dialog()).queryByText(/Окончание сброшено/)).toBeNull();
  });

  it("F3: смена начала — недопустимый конец сбрасывается с подсказкой, отправка без конца не уходит", async () => {
    const api = new FakeBookingsApi();
    const create = vi.spyOn(api, "create");
    await openCreate(api, TOMORROW);
    setStart("12:00");
    setEnd("14:00");

    setStart("12:15");

    expect(endSelect().value).toBe("");
    expect(within(dialog()).getByText(/Окончание сброшено/)).toBeTruthy();
    expect(description(endSelect())).toMatch(/Окончание сброшено/);

    submit();
    expect(endSelect().getAttribute("aria-invalid")).toBe("true");
    expect(create).not.toHaveBeenCalled();
  });
});

describe("Форма: правила domain (B1, B6, B12)", () => {
  it("B1: старт 08:59 — ошибка у «Начало» после blur, aria-invalid, aria-describedby; отправки нет", async () => {
    const api = new FakeBookingsApi();
    const create = vi.spyOn(api, "create");
    await openCreate(api, TOMORROW);

    setStart("08:59");
    expect(startInput().getAttribute("aria-invalid")).toBeNull();

    fireEvent.blur(startInput());
    expect(startInput().getAttribute("aria-invalid")).toBe("true");
    expect(description(startInput())).toContain(MESSAGES.OUTSIDE_WORKING_HOURS);

    submit();
    expect(create).not.toHaveBeenCalled();
    expect(dialog()).toBeTruthy();
  });

  it.each([
    { start: "09:00", end: "09:30" },
    { start: "17:30", end: "18:00" },
  ])("B1: граница рабочего дня $start–$end создаётся", async ({ start, end }) => {
    const api = new FakeBookingsApi();
    const create = vi.spyOn(api, "create");
    await openCreate(api, TOMORROW);

    setStart(start);
    expect(availableEnds()).toContain(end);
    setEnd(end);
    submit();

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]?.[0]).toEqual({ date: TOMORROW, start, end });
  });

  it("B6, B12: сегодня в 10:10:00 старт 10:09 — ошибка START_IN_PAST у «Начало», отправки нет", async () => {
    const api = new FakeBookingsApi();
    const create = vi.spyOn(api, "create");
    await openCreate(api, TODAY);

    setStart("10:09");
    submit();

    expect(startInput().getAttribute("aria-invalid")).toBe("true");
    expect(description(startInput())).toContain(MESSAGES.START_IN_PAST);
    expect(create).not.toHaveBeenCalled();
  });

  it.each(["2026-10-08T04:10:00Z", "2026-10-08T04:10:59Z"])(
    "B6, B12: сегодня старт 10:10 при сейчас %s создаётся",
    async (instant) => {
      setNowForTests(new Date(instant));
      const api = new FakeBookingsApi();
      const create = vi.spyOn(api, "create");
      await openCreate(api, TODAY);

      setStart("10:10");
      setEnd("10:40");
      submit();

      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      expect(create.mock.calls[0]?.[0]).toEqual({ date: TODAY, start: "10:10", end: "10:40" });
    },
  );

  it("B12: сейчас 10:11:00, старт 10:10 — ошибка у «Начало», отправки нет", async () => {
    setNowForTests(new Date("2026-10-08T04:11:00Z"));
    const api = new FakeBookingsApi();
    const create = vi.spyOn(api, "create");
    await openCreate(api, TODAY);

    setStart("10:10");
    submit();

    expect(startInput().getAttribute("aria-invalid")).toBe("true");
    expect(description(startInput())).toContain(MESSAGES.START_IN_PAST);
    expect(create).not.toHaveBeenCalled();
  });

  it("A2, F3: отправка пустой формы — сводка role=alert, ошибки у «Начало» и «Окончание», запроса нет", async () => {
    const api = new FakeBookingsApi();
    const create = vi.spyOn(api, "create");
    await openCreate(api, TOMORROW);

    submit();

    const summary = within(dialog()).getByRole("alert");
    expect(summary.textContent).toContain("Исправьте ошибки");
    expect(summary.textContent).toContain("Укажите время начала");
    expect(summary.textContent).toContain("Выберите время окончания");
    expect(startInput().getAttribute("aria-invalid")).toBe("true");
    expect(endSelect().getAttribute("aria-invalid")).toBe("true");
    expect(description(startInput())).toContain("Укажите время начала");
    expect(description(endSelect())).toContain("Выберите время окончания");
    expect(create).not.toHaveBeenCalled();
  });
});

describe("Форма: создание и название (F4, U4)", () => {
  it("F4: название — maxLength 100 и счётчик N/100", async () => {
    await openCreate(new FakeBookingsApi(), TOMORROW);

    expect(titleInput().maxLength).toBe(100);
    expect(description(titleInput())).toContain("0/100");

    setTitle("  Демо  ");
    expect(description(titleInput())).toContain("8/100");
  });

  it("F4, U4, A2: создание завтра 14:00–15:00 «  Демо  » → create с title «Демо», диалог закрыт, aria-live «Бронь создана», список перезапрошен", async () => {
    const api = new FakeBookingsApi();
    const create = vi.spyOn(api, "create");
    await openCreate(api, TOMORROW);

    setStart("14:00");
    setEnd("15:00");
    setTitle("  Демо  ");
    submit();

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]).toEqual({ date: TOMORROW, start: "14:00", end: "15:00", title: "Демо" });
    expect(screen.getByText("Бронь создана").closest("[aria-live]")).not.toBeNull();
    expect(await screen.findByText(/14:00–15:00/)).toBeTruthy();
    expect(api.listCallsFor(TOMORROW)).toBe(2);
  });

  it("F4: название из пробелов → create без title", async () => {
    const api = new FakeBookingsApi();
    const create = vi.spyOn(api, "create");
    await openCreate(api, TOMORROW);

    setStart("14:00");
    setEnd("15:00");
    setTitle("   ");
    submit();

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]?.[0]).toEqual({ date: TOMORROW, start: "14:00", end: "15:00" });
  });

  it("F4: название из 100 символов → create с этим названием", async () => {
    const api = new FakeBookingsApi();
    const create = vi.spyOn(api, "create");
    await openCreate(api, TOMORROW);

    setStart("14:00");
    setEnd("15:00");
    setTitle("я".repeat(100));
    submit();

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]?.[0].title).toHaveLength(100);
  });

  it("U4, T8: отправка — «Сохраняем…», кнопка disabled, поля только чтение, второй клик не шлёт запрос", async () => {
    const api = new FakeBookingsApi();
    const release = api.holdMutations();
    await openCreate(api, TOMORROW);
    setStart("14:00");
    setEnd("15:00");

    const button = saveButton();
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(button.textContent).toBe("Сохраняем…"));
    expect(button.disabled).toBe(true);
    expect(startInput().readOnly).toBe(true);
    expect(titleInput().readOnly).toBe(true);
    expect(endSelect().disabled).toBe(true);
    fireEvent.click(button);
    expect(api.mutationCalls.filter((call) => call.method === "create")).toHaveLength(1);

    release();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.mutationCalls.filter((call) => call.method === "create")).toHaveLength(1);
  });
});

describe("Форма: ошибки 422 сервера (U3)", () => {
  async function submitFilled(api: FakeBookingsApi) {
    await openCreate(api, TOMORROW);
    setStart("14:00");
    setEnd("15:00");
    setTitle("Демо");
    submit();
    await waitFor(() => expect(api.mutationCalls).toHaveLength(1));
  }

  const expectDataKept = () => {
    expect(startInput().value).toBe("14:00");
    expect(endSelect().value).toBe("15:00");
    expect(titleInput().value).toBe("Демо");
  };

  it("F4, U3: 422 TITLE_TOO_LONG (field: title) → ошибка у «Название», данные сохранены", async () => {
    const api = new FakeBookingsApi();
    api.failNext("create", validation("TITLE_TOO_LONG", "Сервер: название слишком длинное", "title"));
    await submitFilled(api);

    await waitFor(() => expect(titleInput().getAttribute("aria-invalid")).toBe("true"));
    expect(description(titleInput())).toContain("Сервер: название слишком длинное");
    expectDataKept();
  });

  it("B10, U3: 422 DURATION_STEP (field: end) → ошибка у «Окончание»", async () => {
    const api = new FakeBookingsApi();
    api.failNext("create", validation("DURATION_STEP", "Сервер: шаг 30 минут", "end"));
    await submitFilled(api);

    await waitFor(() => expect(endSelect().getAttribute("aria-invalid")).toBe("true"));
    expect(description(endSelect())).toContain("Сервер: шаг 30 минут");
    expectDataKept();
  });

  it("U3: 422 без field → сообщение над формой, данные сохранены", async () => {
    const api = new FakeBookingsApi();
    api.failNext("create", validation("OUTSIDE_WORKING_HOURS", "Сервер: общее нарушение"));
    await submitFilled(api);

    const alert = await within(dialog()).findByRole("alert");
    expect(alert.textContent).toContain("Сервер: общее нарушение");
    expectDataKept();
  });

  it("B12, U3: граница минуты — 422 START_IN_PAST (field: start) → ошибка у «Начало», данные сохранены, повторная отправка уходит", async () => {
    setNowForTests(new Date("2026-10-08T04:10:40Z"));
    const api = new FakeBookingsApi();
    const create = vi.spyOn(api, "create");
    api.failNext("create", validation("START_IN_PAST", MESSAGES.START_IN_PAST, "start"));
    await openCreate(api, TODAY);
    setStart("10:10");
    setEnd("10:40");
    setTitle("Демо");
    submit();

    await waitFor(() => expect(startInput().getAttribute("aria-invalid")).toBe("true"));
    expect(description(startInput())).toContain(MESSAGES.START_IN_PAST);
    expect(startInput().value).toBe("10:10");
    expect(endSelect().value).toBe("10:40");
    expect(titleInput().value).toBe("Демо");

    setStart("10:20");
    setEnd("10:50");
    submit();

    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1]?.[0]).toEqual({ date: TODAY, start: "10:20", end: "10:50", title: "Демо" });
  });
});

describe("Форма: правка (F5, B7)", () => {
  it("F5: клик по брони → «Изменить бронь», поля предзаполнены, дата только чтение, «Сохранить» disabled", async () => {
    await openEdit(new FakeBookingsApi([booking("b1", TOMORROW, "14:00", "15:00", "Демо")]), TOMORROW, "14:00–15:00");

    expect(field("Дата").value).toBe(TOMORROW);
    expect(field("Дата").readOnly).toBe(true);
    expect(startInput().value).toBe("14:00");
    expect(endSelect().value).toBe("15:00");
    expect(titleInput().value).toBe("Демо");
    expect(saveButton().disabled).toBe(true);
  });

  it("F5: правка на 15:00–16:00 → update(b1, {start, end}), диалог закрыт, «Изменения сохранены», в списке 15:00–16:00", async () => {
    const api = new FakeBookingsApi([booking("b1", TOMORROW, "14:00", "15:00", "Демо")]);
    const update = vi.spyOn(api, "update");
    await openEdit(api, TOMORROW, "14:00–15:00");

    setStart("15:00");
    setEnd("16:00");
    expect(saveButton().disabled).toBe(false);
    submit();

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[0]).toBe("b1");
    expect(update.mock.calls[0]?.[1]).toEqual({ start: "15:00", end: "16:00" });
    expect(screen.getByText("Изменения сохранены").closest("[aria-live]")).not.toBeNull();
    expect(await screen.findByText(/15:00–16:00/)).toBeTruthy();
    expect(screen.queryByText(/14:00–15:00/)).toBeNull();
  });

  it("F5: возврат к исходным значениям снова отключает «Сохранить»", async () => {
    await openEdit(new FakeBookingsApi([booking("b1", TOMORROW, "14:00", "15:00", "Демо")]), TOMORROW, "14:00–15:00");

    expect(saveButton().disabled).toBe(true);
    setEnd("14:30");
    expect(saveButton().disabled).toBe(false);
    setEnd("15:00");
    expect(saveButton().disabled).toBe(true);
  });

  it("B7, T4: самоконфликт — своя бронь не ограничивает конец, сдвиг 10:00→10:30 сохраняется", async () => {
    const api = new FakeBookingsApi([booking("b1", TOMORROW, "10:00", "11:00"), booking("b2", TOMORROW, "11:00", "12:00")]);
    const update = vi.spyOn(api, "update");
    await openEdit(api, TOMORROW, "10:00–11:00");

    expect(availableEnds()).toEqual(["10:30", "11:00"]);

    setStart("10:30");
    expect(availableEnds()).toEqual(["11:00"]);
    expect(endSelect().value).toBe("11:00");
    submit();

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]?.[0]).toBe("b1");
    expect(update.mock.calls[0]?.[1]).toEqual({ start: "10:30" });
  });

  it("F5, B7: стёртое название → update(b1, {title: \"\"})", async () => {
    const api = new FakeBookingsApi([booking("b1", TOMORROW, "14:00", "15:00", "Демо")]);
    const update = vi.spyOn(api, "update");
    await openEdit(api, TOMORROW, "14:00–15:00");

    setTitle("");
    submit();

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]?.[1]).toEqual({ title: "" });
  });

  it("F5, Q7: перезапрос списка не меняет значения открытой формы", async () => {
    const api = new FakeBookingsApi([booking("b1", TOMORROW, "14:00", "15:00", "Демо")]);
    const { queryClient } = await openEdit(api, TOMORROW, "14:00–15:00");
    setEnd("14:30");

    api.bookings = [booking("b1", TOMORROW, "14:00", "16:00", "Чужая правка")];
    await act(() => queryClient.invalidateQueries({ queryKey: ["bookings", TOMORROW] }));

    await waitFor(() => expect(api.listCallsFor(TOMORROW)).toBe(2));
    expect(endSelect().value).toBe("14:30");
    expect(titleInput().value).toBe("Демо");
  });
});

describe("Форма: только чтение (B11)", () => {
  it("B11: начавшаяся бронь открывается только для чтения с пояснением", async () => {
    renderDay(new FakeBookingsApi([booking("b1", TODAY, "10:00", "10:30", "Планёрка")]), TODAY);

    fireEvent.click(await screen.findByRole("button", { name: /Посмотреть бронь 10:00–10:30/ }));

    expect(await screen.findByRole("dialog", { name: "Бронь" })).toBeTruthy();
    expect(within(dialog()).getByText(MESSAGES.BOOKING_LOCKED)).toBeTruthy();
    expect(startInput().readOnly).toBe(true);
    expect(endSelect().disabled).toBe(true);
    expect(titleInput().readOnly).toBe(true);
    expect(within(dialog()).queryByRole("button", { name: /Сохран/ })).toBeNull();
    expect(within(dialog()).getByRole("button", { name: "Закрыть" })).toBeTruthy();
  });

  it("A2, B11: только чтение — фокус при открытии на «Закрыть», а не на недоступном поле", async () => {
    renderDay(new FakeBookingsApi([booking("b1", TODAY, "10:00", "10:30", "Планёрка")]), TODAY);

    fireEvent.click(await screen.findByRole("button", { name: /Посмотреть бронь 10:00–10:30/ }));
    await screen.findByRole("dialog", { name: "Бронь" });

    expect(document.activeElement).toBe(within(dialog()).getByRole("button", { name: "Закрыть" }));
  });

  it("B11, B12: бронь началась, пока форма открыта → отправки нет, только чтение", async () => {
    const api = new FakeBookingsApi([booking("b1", TODAY, "10:11", "10:41", "Демо")]);
    const update = vi.spyOn(api, "update");
    await openEdit(api, TODAY, "10:11–10:41");
    setTitle("Новое");

    setNowForTests(new Date("2026-10-08T04:11:00Z"));
    submit();

    expect(await within(dialog()).findByText(MESSAGES.BOOKING_LOCKED)).toBeTruthy();
    expect(within(dialog()).queryByRole("button", { name: /Сохран/ })).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it("B11, U3: 422 BOOKING_LOCKED с сервера → только чтение с пояснением", async () => {
    const api = new FakeBookingsApi([booking("b1", TOMORROW, "14:00", "15:00", "Демо")]);
    api.failNext("update", validation("BOOKING_LOCKED", MESSAGES.BOOKING_LOCKED));
    await openEdit(api, TOMORROW, "14:00–15:00");
    setTitle("Новое");
    submit();

    expect(await within(dialog()).findByText(MESSAGES.BOOKING_LOCKED)).toBeTruthy();
    expect(within(dialog()).queryByRole("button", { name: /Сохран/ })).toBeNull();
    expect(startInput().value).toBe("14:00");
    expect(titleInput().value).toBe("Новое");
  });
});

describe("Форма: сегодня после 17:30 (B6, пустой список стартов)", () => {
  it.each([
    { instant: "2026-10-08T11:31:00Z", label: "17:31" },
    { instant: "2026-10-08T12:30:00Z", label: "18:30" },
  ])("B6: сегодня в $label — «На сегодня бронирование уже недоступно», полей нет", async ({ instant }) => {
    setNowForTests(new Date(instant));
    const api = new FakeBookingsApi();
    const create = vi.spyOn(api, "create");
    await openCreate(api, TODAY);

    expect(within(dialog()).getByText(LATE_NOTE)).toBeTruthy();
    expect(within(dialog()).queryByLabelText("Начало")).toBeNull();
    expect(within(dialog()).queryByLabelText("Окончание")).toBeNull();
    expect(within(dialog()).queryByRole("button", { name: /Сохран/ })).toBeNull();
    expect(within(dialog()).getByRole("button", { name: "Закрыть" })).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it("B6, B10: сегодня в 17:30 — форма доступна, старт 17:30 → 18:00", async () => {
    setNowForTests(new Date("2026-10-08T11:30:00Z"));
    await openCreate(new FakeBookingsApi(), TODAY);

    expect(within(dialog()).queryByText(LATE_NOTE)).toBeNull();
    expect(startInput().min).toBe("17:30");
    setStart("17:30");
    expect(availableEnds()).toEqual(["18:00"]);
  });
});
