// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, isConflict, isValidation } from "@/api/errors";
import type { Booking } from "@/domain/types";
import { useCreateBooking, useDayBookings, useDeleteBooking, useUpdateBooking } from "./hooks";
import { createTestWrapper, FakeBookingsApi } from "./test-utils";

// Хуки работают с тестовой in-memory реализацией BookingsApi (S2): fetch не вызывается.

const A = "2026-10-09";
const B = "2026-10-10";
const MORNING: Booking = { id: "b1", date: A, start: "10:00", end: "11:00", title: "Планёрка" };
const ON_B: Booking = { id: "b2", date: B, start: "12:00", end: "13:00" };
const OTHER_USER: Booking = { id: "x1", date: A, start: "14:00", end: "15:00", title: "Чужая" };

const conflict = (conflictWith: Booking) =>
  new ApiError({ status: 409, code: "OVERLAP", message: "Время занято", field: "start", conflictWith });

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchSpy.mockClear();
});

/** Все запросы завершены: лишних перезапросов не будет. */
async function settled(queryClient: { isFetching(): number; isMutating(): number }) {
  await waitFor(() => expect(queryClient.isFetching() + queryClient.isMutating()).toBe(0));
}

describe("useDayBookings", () => {
  it("S2: возвращает брони даты из тестовой реализации BookingsApi, без HTTP", async () => {
    const api = new FakeBookingsApi([MORNING, ON_B]);
    const { wrapper } = createTestWrapper(api);
    const { result } = renderHook(() => useDayBookings(A), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([MORNING]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('S2: данные лежат в кэше под ключом ["bookings", date]', async () => {
    const api = new FakeBookingsApi([MORNING]);
    const { wrapper, queryClient } = createTestWrapper(api);
    const { result } = renderHook(() => useDayBookings(A), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(["bookings", A])).toEqual([MORNING]);
  });

  it("F1: signal запроса прокидывается в BookingsApi.list", async () => {
    const api = new FakeBookingsApi([MORNING]);
    const { wrapper } = createTestWrapper(api);
    const { result } = renderHook(() => useDayBookings(A), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.listCalls[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("F1: смена даты A → B отменяет запрос A через signal", async () => {
    const api = new FakeBookingsApi([MORNING, ON_B]);
    const releaseA = api.holdList(A);
    const { wrapper } = createTestWrapper(api);
    const { result, rerender } = renderHook(({ date }) => useDayBookings(date), {
      wrapper,
      initialProps: { date: A },
    });

    await waitFor(() => expect(api.listCallsFor(A)).toBe(1));
    rerender({ date: B });
    await waitFor(() => expect(result.current.data).toEqual([ON_B]));
    expect(api.listCalls.find((call) => call.date === A)?.signal?.aborted).toBe(true);
    releaseA();
  });

  it("F1: медленный ответ на дату A не перезаписывает список даты B (T9)", async () => {
    const api = new FakeBookingsApi([MORNING, ON_B]);
    const releaseA = api.holdList(A);
    const { wrapper, queryClient } = createTestWrapper(api);
    const { result, rerender } = renderHook(({ date }) => useDayBookings(date), {
      wrapper,
      initialProps: { date: A },
    });

    await waitFor(() => expect(api.listCallsFor(A)).toBe(1));
    rerender({ date: B });
    await waitFor(() => expect(result.current.data).toEqual([ON_B]));

    // Fake игнорирует signal: поздний ответ A всё равно приходит.
    await act(async () => releaseA());
    await settled(queryClient);
    expect(result.current.data).toEqual([ON_B]);
  });

  it("U3: ошибка BookingsApi.list доходит до хука как ApiError", async () => {
    const api = new FakeBookingsApi();
    const failure = new ApiError({ status: 500, code: "PARSE", message: "Не удалось загрузить брони" });
    api.list = vi.fn().mockRejectedValue(failure);
    const { wrapper } = createTestWrapper(api);
    const { result } = renderHook(() => useDayBookings(A), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(failure);
  });
});

describe("мутации: перезапрос списка (Q15)", () => {
  const input = { date: A, start: "14:00", end: "15:00", title: "Демо" };

  it("F4: после успешного create список даты перезапрашивается ровно один раз", async () => {
    const api = new FakeBookingsApi([MORNING]);
    const { wrapper, queryClient } = createTestWrapper(api);
    const { result } = renderHook(() => ({ list: useDayBookings(A), create: useCreateBooking() }), { wrapper });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    await act(() => result.current.create.mutateAsync({ input }));
    await settled(queryClient);

    expect(api.listCallsFor(A)).toBe(2);
    expect(result.current.list.data?.map((b) => b.title)).toEqual(["Планёрка", "Демо"]);
  });

  it("F4: оптимистичных изменений нет — до ответа create новой брони в списке нет", async () => {
    const api = new FakeBookingsApi([MORNING]);
    const release = api.holdMutations();
    const { wrapper, queryClient } = createTestWrapper(api);
    const { result } = renderHook(() => ({ list: useDayBookings(A), create: useCreateBooking() }), { wrapper });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    act(() => result.current.create.mutate({ input }));
    await waitFor(() => expect(result.current.create.isPending).toBe(true));
    expect(result.current.list.data).toEqual([MORNING]);
    expect(queryClient.getQueryData(["bookings", A])).toEqual([MORNING]);

    await act(async () => release());
    await settled(queryClient);
  });

  it("B8: create → 409: список даты из формы перезапрошен, чужая бронь видна, ошибка — конфликт", async () => {
    const api = new FakeBookingsApi([MORNING]);
    const { wrapper, queryClient } = createTestWrapper(api);
    const { result } = renderHook(() => ({ list: useDayBookings(A), create: useCreateBooking() }), { wrapper });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    api.bookings.push(OTHER_USER); // слот занял другой пользователь
    api.failNext("create", conflict(OTHER_USER));
    await act(() => result.current.create.mutateAsync({ input }).catch(() => undefined));
    await settled(queryClient);

    expect(isConflict(result.current.create.error)).toBe(true);
    expect(api.listCallsFor(A)).toBe(2);
    expect(result.current.list.data).toContainEqual(OTHER_USER);
  });

  it("U3: create → 422: список не перезапрашивается, ошибка — валидация", async () => {
    const api = new FakeBookingsApi([MORNING]);
    const { wrapper, queryClient } = createTestWrapper(api);
    const { result } = renderHook(() => ({ list: useDayBookings(A), create: useCreateBooking() }), { wrapper });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    api.failNext(
      "create",
      new ApiError({ status: 422, code: "DURATION_STEP", message: "Длительность кратна 30 минутам", field: "end" }),
    );
    await act(() => result.current.create.mutateAsync({ input }).catch(() => undefined));
    await settled(queryClient);

    expect(isValidation(result.current.create.error)).toBe(true);
    expect(api.listCallsFor(A)).toBe(1);
  });

  it("B8: заголовки из request (dev-панель, Q8) доходят до BookingsApi.create", async () => {
    const api = new FakeBookingsApi();
    const { wrapper } = createTestWrapper(api);
    const { result } = renderHook(() => useCreateBooking(), { wrapper });
    const request = { headers: { "X-Mock-Force-Conflict": "1" } };

    await act(() => result.current.mutateAsync({ input, request }));
    expect(api.mutationCalls[0]?.options?.headers).toEqual(request.headers);
  });

  it("F5: после успешного update без смены даты список даты перезапрашивается один раз", async () => {
    const api = new FakeBookingsApi([MORNING]);
    const { wrapper, queryClient } = createTestWrapper(api);
    const { result } = renderHook(() => ({ list: useDayBookings(A), update: useUpdateBooking() }), { wrapper });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    await act(() =>
      result.current.update.mutateAsync({ id: "b1", patch: { start: "11:00", end: "12:00" }, previousDate: A }),
    );
    await settled(queryClient);

    expect(api.listCallsFor(A)).toBe(2);
    expect(result.current.list.data).toEqual([{ ...MORNING, start: "11:00", end: "12:00" }]);
  });

  it("F5: update со сменой даты A → B перезапрашивает списки обеих дат (Q5)", async () => {
    const api = new FakeBookingsApi([ON_B, MORNING]);
    const { wrapper, queryClient } = createTestWrapper(api);
    const { result } = renderHook(
      () => ({ listA: useDayBookings(A), listB: useDayBookings(B), update: useUpdateBooking() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.listA.isSuccess && result.current.listB.isSuccess).toBe(true));

    await act(() => result.current.update.mutateAsync({ id: "b1", patch: { date: B }, previousDate: A }));
    await settled(queryClient);

    expect([api.listCallsFor(A), api.listCallsFor(B)]).toEqual([2, 2]);
    expect(result.current.listA.data).toEqual([]);
    expect(result.current.listB.data?.map((b) => b.id)).toEqual(["b1", "b2"]);
  });

  it("B8: update → 409 перезапрашивает список даты из формы", async () => {
    const api = new FakeBookingsApi([MORNING]);
    const { wrapper, queryClient } = createTestWrapper(api);
    const { result } = renderHook(() => ({ list: useDayBookings(A), update: useUpdateBooking() }), { wrapper });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    api.bookings.push(OTHER_USER);
    api.failNext("update", conflict(OTHER_USER));
    await act(() =>
      result.current.update
        .mutateAsync({ id: "b1", patch: { start: "14:00", end: "15:00" }, previousDate: A })
        .catch(() => undefined),
    );
    await settled(queryClient);

    expect(isConflict(result.current.update.error)).toBe(true);
    expect(api.listCallsFor(A)).toBe(2);
    expect(result.current.list.data).toContainEqual(OTHER_USER);
  });

  it("F6: после успешного delete список даты перезапрашивается, брони в нём нет", async () => {
    const api = new FakeBookingsApi([MORNING]);
    const { wrapper, queryClient } = createTestWrapper(api);
    const { result } = renderHook(() => ({ list: useDayBookings(A), remove: useDeleteBooking() }), { wrapper });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    await act(() => result.current.remove.mutateAsync({ id: "b1", date: A }));
    await settled(queryClient);

    expect(api.listCallsFor(A)).toBe(2);
    expect(result.current.list.data).toEqual([]);
  });
});

describe("мутации: 404 и 5xx (этап 6: F6, Q7, D4)", () => {
  const notFound = () => new ApiError({ status: 404, code: "NOT_FOUND", message: "Бронь не найдена" });

  it("F6: delete → 404 (бронь уже удалена): список даты перезапрошен, брони в нём нет", async () => {
    const api = new FakeBookingsApi([MORNING]);
    const { wrapper, queryClient } = createTestWrapper(api);
    const { result } = renderHook(() => ({ list: useDayBookings(A), remove: useDeleteBooking() }), { wrapper });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    api.bookings = [];
    api.failNext("remove", notFound());

    await act(() => result.current.remove.mutateAsync({ id: "b1", date: A }).catch(() => undefined));
    await settled(queryClient);

    expect(api.listCallsFor(A)).toBe(2);
    expect(result.current.list.data).toEqual([]);
  });

  it("F5, Q7: update → 404 (бронь удалена): список даты брони перезапрошен", async () => {
    const api = new FakeBookingsApi([MORNING]);
    const { wrapper, queryClient } = createTestWrapper(api);
    const { result } = renderHook(() => ({ list: useDayBookings(A), update: useUpdateBooking() }), { wrapper });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    api.bookings = [];
    api.failNext("update", notFound());

    await act(() =>
      result.current.update.mutateAsync({ id: "b1", patch: { end: "10:30" }, previousDate: A }).catch(() => undefined),
    );
    await settled(queryClient);

    expect(api.listCallsFor(A)).toBe(2);
    expect(result.current.list.data).toEqual([]);
  });

  it.each([
    { label: "create → 500", error: new ApiError({ status: 500, code: "PARSE", message: "html" }) },
    { label: "create → NETWORK", error: new ApiError({ status: 0, code: "NETWORK", message: "offline" }) },
  ])("U3, D4: $label — список не перезапрашивается", async ({ error }) => {
    const api = new FakeBookingsApi();
    const { wrapper, queryClient } = createTestWrapper(api);
    const { result } = renderHook(() => ({ list: useDayBookings(A), create: useCreateBooking() }), { wrapper });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    api.failNext("create", error);

    await act(() =>
      result.current.create.mutateAsync({ input: { date: A, start: "14:00", end: "15:00" } }).catch(() => undefined),
    );
    await settled(queryClient);

    expect(api.listCallsFor(A)).toBe(1);
  });
});
