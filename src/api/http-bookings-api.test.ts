import { afterEach, describe, expect, it, vi } from "vitest";
import type { Booking } from "@/domain/types";
import { ApiError, isConflict, isNetwork, isNotFound, isValidation } from "./errors";
import { createHttpBookingsApi } from "./http-bookings-api";

// Сеть подменяется через параметр fetch (testing.md, правило 5); domain настоящий.

const BOOKING: Booking = { id: "b1", date: "2026-10-09", start: "14:00", end: "15:00", title: "Демо" };
const OTHER: Booking = { id: "b2", date: "2026-10-09", start: "14:30", end: "15:30" };

type FetchCall = { url: string; init: RequestInit };

function fakeFetch(respond: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call = { url: String(input), init };
    calls.push(call);
    return respond(call);
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const errorBody = (error: Record<string, unknown>, status: number) => json({ error }, status);

/** fetch, который не отвечает, пока не отменён его signal. */
function hangingFetch() {
  return fakeFetch(
    ({ init }) =>
      new Promise<Response>((_, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }),
  );
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("ожидалось отклонение промиса");
}

const headerOf = (init: RequestInit, name: string) => new Headers(init.headers).get(name);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("httpBookingsApi: запросы", () => {
  it("S2: list → GET {baseUrl}/bookings?date=2026-10-09, ответ — массив броней", async () => {
    const net = fakeFetch(() => json([BOOKING]));
    const api = createHttpBookingsApi({ baseUrl: "https://rooms.example.test/v1", fetch: net.fetch });

    await expect(api.list("2026-10-09")).resolves.toEqual([BOOKING]);
    expect(net.calls).toHaveLength(1);
    expect(net.calls[0]?.url).toBe("https://rooms.example.test/v1/bookings?date=2026-10-09");
    expect(net.calls[0]?.init.method ?? "GET").toBe("GET");
  });

  it("S2: baseUrl по умолчанию — /api", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    const net = fakeFetch(() => json([]));
    await createHttpBookingsApi({ fetch: net.fetch }).list("2026-10-09");
    expect(net.calls[0]?.url).toBe("/api/bookings?date=2026-10-09");
  });

  it("S2: baseUrl берётся из NEXT_PUBLIC_API_URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://backend.example.test/api");
    const net = fakeFetch(() => json([]));
    await createHttpBookingsApi({ fetch: net.fetch }).list("2026-10-09");
    expect(net.calls[0]?.url).toBe("https://backend.example.test/api/bookings?date=2026-10-09");
  });

  it("F4: create → POST /bookings с JSON-телом, 201 → Booking", async () => {
    const net = fakeFetch(() => json(BOOKING, 201));
    const api = createHttpBookingsApi({ baseUrl: "/api", fetch: net.fetch });
    const input = { date: "2026-10-09", start: "14:00", end: "15:00", title: "Демо" };

    await expect(api.create(input)).resolves.toEqual(BOOKING);
    const call = net.calls[0];
    expect(call?.url).toBe("/api/bookings");
    expect(call?.init.method).toBe("POST");
    expect(headerOf(call!.init, "Content-Type")).toBe("application/json");
    expect(JSON.parse(String(call?.init.body))).toEqual(input);
  });

  it("F5: update → PATCH /bookings/b1 с частичным телом, 200 → Booking", async () => {
    const updated = { ...BOOKING, start: "15:00", end: "16:00" };
    const net = fakeFetch(() => json(updated));
    const api = createHttpBookingsApi({ baseUrl: "/api", fetch: net.fetch });

    await expect(api.update("b1", { start: "15:00", end: "16:00" })).resolves.toEqual(updated);
    const call = net.calls[0];
    expect(call?.url).toBe("/api/bookings/b1");
    expect(call?.init.method).toBe("PATCH");
    expect(headerOf(call!.init, "Content-Type")).toBe("application/json");
    expect(JSON.parse(String(call?.init.body))).toEqual({ start: "15:00", end: "16:00" });
  });

  it("F6: remove → DELETE /bookings/b1, 204 → без значения", async () => {
    const net = fakeFetch(() => new Response(null, { status: 204 }));
    const api = createHttpBookingsApi({ baseUrl: "/api", fetch: net.fetch });

    await expect(api.remove("b1")).resolves.toBeUndefined();
    expect(net.calls[0]?.url).toBe("/api/bookings/b1");
    expect(net.calls[0]?.init.method).toBe("DELETE");
  });

  it("B8: заголовки из параметра запроса (dev-панель, Q8) уходят в fetch как есть", async () => {
    const net = fakeFetch(() => json(BOOKING, 201));
    const api = createHttpBookingsApi({ baseUrl: "/api", fetch: net.fetch });
    const input = { date: "2026-10-09", start: "14:00", end: "15:00" };

    await api.create(input, { headers: { "X-Mock-Force-Conflict": "1", "X-Mock-Delay": "2000" } });
    expect(headerOf(net.calls[0]!.init, "X-Mock-Force-Conflict")).toBe("1");
    expect(headerOf(net.calls[0]!.init, "X-Mock-Delay")).toBe("2000");
  });

  it("B8: без параметра запроса заголовков X-Mock-* нет (клиент их не зашивает)", async () => {
    const net = fakeFetch(({ init }) => (init.method === "DELETE" ? new Response(null, { status: 204 }) : json(BOOKING)));
    const api = createHttpBookingsApi({ baseUrl: "/api", fetch: net.fetch });

    await api.list("2026-10-09");
    await api.create({ date: "2026-10-09", start: "14:00", end: "15:00" });
    await api.update("b1", { end: "15:30" });
    await api.remove("b1");
    for (const { init } of net.calls) {
      const names = [...new Headers(init.headers).keys()];
      expect(names.filter((name) => name.toLowerCase().startsWith("x-mock-"))).toEqual([]);
    }
  });
});

describe("httpBookingsApi: ошибки сервера (U3, Q11)", () => {
  const input = { date: "2026-10-09", start: "14:00", end: "15:00" };

  it.each([
    {
      name: "400 INVALID_REQUEST с field",
      status: 400,
      error: { code: "INVALID_REQUEST", message: "Неверный формат времени", field: "start" },
      guards: { conflict: false, validation: false, notFound: false, network: false },
    },
    {
      name: "404 NOT_FOUND",
      status: 404,
      error: { code: "NOT_FOUND", message: "Бронь не найдена" },
      guards: { conflict: false, validation: false, notFound: true, network: false },
    },
    {
      name: "409 OVERLAP с conflictWith",
      status: 409,
      error: { code: "OVERLAP", message: "Время занято", field: "start", conflictWith: OTHER },
      guards: { conflict: true, validation: false, notFound: false, network: false },
    },
    {
      name: "422 DURATION_STEP с field end",
      status: 422,
      error: { code: "DURATION_STEP", message: "Длительность кратна 30 минутам", field: "end" },
      guards: { conflict: false, validation: true, notFound: false, network: false },
    },
    {
      name: "422 без field, с details",
      status: 422,
      error: { code: "BOOKING_LOCKED", message: "Бронь уже началась", details: { reason: "started" } },
      guards: { conflict: false, validation: true, notFound: false, network: false },
    },
  ])("U3: $name → ApiError с полями тела и статусом", async ({ status, error, guards }) => {
    const net = fakeFetch(() => errorBody(error, status));
    const api = createHttpBookingsApi({ baseUrl: "/api", fetch: net.fetch });

    const thrown = await caught(api.create(input));
    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toMatchObject({ status, ...error });
    expect({
      conflict: isConflict(thrown),
      validation: isValidation(thrown),
      notFound: isNotFound(thrown),
      network: isNetwork(thrown),
    }).toEqual(guards);
  });

  it("U3: GET → 500 с HTML-телом → ApiError PARSE, статус 500, общее сообщение", async () => {
    const net = fakeFetch(() => new Response("<html>Internal Server Error</html>", { status: 500 }));
    const thrown = await caught(createHttpBookingsApi({ baseUrl: "/api", fetch: net.fetch }).list("2026-10-09"));

    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toMatchObject({ status: 500, code: "PARSE" });
    expect((thrown as ApiError).message).not.toBe("");
    expect(isNetwork(thrown)).toBe(false);
  });

  it("U3: DELETE → 503 без тела → ApiError PARSE, статус 503", async () => {
    const net = fakeFetch(() => new Response(null, { status: 503 }));
    const thrown = await caught(createHttpBookingsApi({ baseUrl: "/api", fetch: net.fetch }).remove("b1"));
    expect(thrown).toMatchObject({ status: 503, code: "PARSE" });
  });

  it("U3: 422 с JSON не в формате Q11 → ApiError PARSE, статус 422, не валидация", async () => {
    const net = fakeFetch(() => json({ message: "что-то не так" }, 422));
    const thrown = await caught(createHttpBookingsApi({ baseUrl: "/api", fetch: net.fetch }).create(input));

    expect(thrown).toMatchObject({ status: 422, code: "PARSE" });
    expect(isValidation(thrown)).toBe(false);
  });

  it("U3: 200 с не-JSON телом → ApiError PARSE, статус 200", async () => {
    const net = fakeFetch(() => new Response("not json", { status: 200 }));
    const thrown = await caught(createHttpBookingsApi({ baseUrl: "/api", fetch: net.fetch }).list("2026-10-09"));
    expect(thrown).toMatchObject({ status: 200, code: "PARSE" });
  });
});

describe("httpBookingsApi: сеть, таймаут, отмена", () => {
  it("U3: офлайн (fetch отклонён TypeError) → ApiError NETWORK, статус 0", async () => {
    const net = fakeFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    const thrown = await caught(createHttpBookingsApi({ baseUrl: "/api", fetch: net.fetch }).list("2026-10-09"));

    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toMatchObject({ status: 0, code: "NETWORK" });
    expect(isNetwork(thrown)).toBe(true);
  });

  it("U3: нет ответа дольше timeoutMs → ApiError NETWORK, запрос fetch отменён", async () => {
    const net = hangingFetch();
    const api = createHttpBookingsApi({ baseUrl: "/api", fetch: net.fetch, timeoutMs: 20 });

    const thrown = await caught(api.create({ date: "2026-10-09", start: "14:00", end: "15:00" }));
    expect(thrown).toMatchObject({ status: 0, code: "NETWORK" });
    expect(isNetwork(thrown)).toBe(true);
    expect(net.calls[0]?.init.signal?.aborted).toBe(true);
  });

  it("F1: отмена через signal → AbortError, а не ApiError (отменённый запрос не ошибка для UI)", async () => {
    const net = hangingFetch();
    const api = createHttpBookingsApi({ baseUrl: "/api", fetch: net.fetch });
    const controller = new AbortController();

    const pending = caught(api.list("2026-10-09", controller.signal));
    controller.abort();
    const thrown = await pending;

    expect(thrown).not.toBeInstanceOf(ApiError);
    expect((thrown as Error).name).toBe("AbortError");
    expect(net.calls[0]?.init.signal?.aborted).toBe(true);
  });

  it("U3: type guards на не-ApiError возвращают false", () => {
    for (const value of [new Error("x"), undefined, { status: 409, code: "OVERLAP" }]) {
      expect([isConflict(value), isValidation(value), isNotFound(value), isNetwork(value)]).toEqual([
        false,
        false,
        false,
        false,
      ]);
    }
  });
});
