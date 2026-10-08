import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/errors";
import type { Booking } from "@/domain/types";
import { presentApiError } from "./present-api-error";

// Тексты ошибок API (U3, B8, Q11). Таблица и вывод ожиданий — docs/traces/stage-6.md.

const PLANNING: Booking = { id: "b7", date: "2026-10-09", start: "10:00", end: "11:00", title: "Планёрка" };
const conflict = (conflictWith?: Booking) =>
  new ApiError(
    conflictWith === undefined
      ? { status: 409, code: "OVERLAP", message: "Время занято" }
      : { status: 409, code: "OVERLAP", message: "Время занято", conflictWith },
  );

describe("presentApiError: 409 (B8, Q25)", () => {
  it("B8: 409 с conflictWith 10:00–11:00 «Планёрка» → сообщение с интервалом и названием, пометка начала и конца", () => {
    expect(presentApiError(conflict(PLANNING))).toEqual({
      title: "Это время только что заняли: 10:00–11:00 «Планёрка». Выберите другой интервал",
      description: "Список броней обновлён",
      fieldErrors: {
        start: "Пересекается с бронью 10:00–11:00 «Планёрка»",
        end: "Пересекается с бронью 10:00–11:00 «Планёрка»",
      },
    });
  });

  it("B8: 409 с conflictWith без названия → интервал без кавычек", () => {
    const untitled: Booking = { id: PLANNING.id, date: PLANNING.date, start: PLANNING.start, end: PLANNING.end };
    const presented = presentApiError(conflict(untitled));
    expect(presented.title).toBe("Это время только что заняли: 10:00–11:00. Выберите другой интервал");
    expect(presented.fieldErrors).toEqual({
      start: "Пересекается с бронью 10:00–11:00",
      end: "Пересекается с бронью 10:00–11:00",
    });
  });

  it("B8, U3: 409 без conflictWith → общее сообщение о занятом времени, поля помечены", () => {
    const presented = presentApiError(conflict());
    expect(presented.title).toBe("Это время только что заняли. Выберите другой интервал");
    expect(presented.fieldErrors).toEqual({ start: "Интервал занят", end: "Интервал занят" });
  });
});

describe("presentApiError: остальные ошибки (U3, Q7, Q11)", () => {
  it("F5, Q7: 404 NOT_FOUND → «Бронь была удалена», данные можно сохранить как новую", () => {
    expect(presentApiError(new ApiError({ status: 404, code: "NOT_FOUND", message: "Бронь не найдена" }))).toEqual({
      title: "Бронь была удалена",
      description: "Введённые данные сохранены — их можно сохранить как новую бронь",
      fieldErrors: {},
    });
  });

  it("U3: 422 с field end → текст domain с сервера в заголовке и у поля", () => {
    const error = new ApiError({ status: 422, code: "DURATION_STEP", message: "Длительность кратна 30 минутам", field: "end" });
    expect(presentApiError(error)).toEqual({
      title: "Длительность кратна 30 минутам",
      fieldErrors: { end: "Длительность кратна 30 минутам" },
    });
  });

  it.each([
    { label: "без field", error: new ApiError({ status: 422, code: "OUTSIDE_WORKING_HOURS", message: "Вне рабочего дня" }) },
    { label: "field date", error: new ApiError({ status: 422, code: "DATE_IN_PAST", message: "Вне рабочего дня", field: "date" }) },
  ])("U3: 422 $label → только общий текст, полей формы нет", ({ error }) => {
    expect(presentApiError(error)).toEqual({ title: "Вне рабочего дня", fieldErrors: {} });
  });

  it.each([
    { label: "без field", error: new ApiError({ status: 400, code: "INVALID_REQUEST", message: "Unknown field foo" }) },
    { label: "с field", error: new ApiError({ status: 400, code: "INVALID_REQUEST", message: "Bad time", field: "start" }) },
  ])("U3, Q11: 400 $label → общий баннер «Сервер не принял запрос», полей нет", ({ error }) => {
    expect(presentApiError(error)).toEqual({
      title: "Сервер не принял запрос",
      description: "Проверьте введённые значения и повторите",
      fieldErrors: {},
    });
  });

  it("U3: NETWORK → «Нет связи с сервером»", () => {
    expect(presentApiError(new ApiError({ status: 0, code: "NETWORK", message: "offline" }))).toEqual({
      title: "Нет связи с сервером",
      description: "Проверьте подключение и повторите",
      fieldErrors: {},
    });
  });

  it.each([500, 503])("U3: статус %i (PARSE) → «Ошибка сервера»", (status) => {
    expect(presentApiError(new ApiError({ status, code: "PARSE", message: "html" }))).toEqual({
      title: "Ошибка сервера",
      description: "Повторите попытку",
      fieldErrors: {},
    });
  });

  it("U3: PARSE со статусом 200 → «Сервер вернул неожиданный ответ»", () => {
    expect(presentApiError(new ApiError({ status: 200, code: "PARSE", message: "not json" })).title).toBe(
      "Сервер вернул неожиданный ответ",
    );
  });

  it("U3: не ApiError → «Что-то пошло не так»", () => {
    expect(presentApiError(new TypeError("boom"))).toEqual({
      title: "Что-то пошло не так",
      description: "Повторите попытку",
      fieldErrors: {},
    });
  });
});
