// Тестовая in-memory реализация BookingsApi без HTTP (S2) и обёртка для renderHook.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { BookingPatch, BookingsApi, RequestOptions } from "@/api/bookings-api";
import type { ApiError } from "@/api/errors";
import type { Booking, BookingInput } from "@/domain/types";
import { parseTime } from "@/domain/time";
import { BookingsApiProvider } from "./api-context";

const minutes = (time: string) => parseTime(time) ?? Number.NaN;

type Mutation = "create" | "update" | "remove";

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}

export class FakeBookingsApi implements BookingsApi {
  readonly listCalls: { date: string; signal?: AbortSignal }[] = [];
  readonly mutationCalls: { method: Mutation; options?: RequestOptions }[] = [];
  private readonly listGates = new Map<string, Promise<void>>();
  private readonly listFailures = new Map<string, ApiError>();
  private readonly hangingDates = new Set<string>();
  private mutationGate: Promise<void> = Promise.resolve();
  private readonly failures = new Map<Mutation, ApiError>();
  private nextId = 100;

  constructor(public bookings: Booking[] = []) {}

  listCallsFor(date: string): number {
    return this.listCalls.filter((call) => call.date === date).length;
  }

  /** Следующие ответы list(date) ждут release(). signal не учитывается — как сервер, который уже ответил. */
  holdList(date: string): () => void {
    const gate = deferred();
    this.listGates.set(date, gate.promise);
    return () => {
      this.listGates.delete(date);
      gate.release();
    };
  }

  /** Следующий вызов list(date) отклоняется error. */
  failList(date: string, error: ApiError): void {
    this.listFailures.set(date, error);
  }

  /** list(date) не отвечает, пока не отменён signal; затем AbortError — как http-клиент (D2). */
  hangList(date: string): void {
    this.hangingDates.add(date);
  }

  /** Мутации ждут release(). */
  holdMutations(): () => void {
    const gate = deferred();
    this.mutationGate = gate.promise;
    return gate.release;
  }

  /** Следующий вызов method отклоняется error. */
  failNext(method: Mutation, error: ApiError): void {
    this.failures.set(method, error);
  }

  async list(date: string, signal?: AbortSignal): Promise<Booking[]> {
    this.listCalls.push({ date, signal });
    const failure = this.listFailures.get(date);
    if (failure) {
      this.listFailures.delete(date);
      throw failure;
    }
    if (this.hangingDates.has(date)) {
      await new Promise<never>((_resolve, reject) => {
        const abort = () => reject(new DOMException("The operation was aborted.", "AbortError"));
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
      });
    }
    // Контракт BookingsApi.list: по возрастанию start (как сервер, F2), сравнение в минутах (T5).
    const snapshot = () =>
      this.bookings
        .filter((b) => b.date === date)
        .sort((x, y) => minutes(x.start) - minutes(y.start))
        .map((b) => ({ ...b }));
    const gate = this.listGates.get(date);
    if (gate) {
      // Снимок на момент запроса: поздний ответ несёт старые данные.
      const early = snapshot();
      await gate;
      return early;
    }
    return snapshot();
  }

  async create(input: BookingInput, options?: RequestOptions): Promise<Booking> {
    await this.begin("create", options);
    const booking = { id: `b${this.nextId++}`, ...input };
    this.bookings.push(booking);
    return booking;
  }

  async update(id: string, patch: BookingPatch, options?: RequestOptions): Promise<Booking> {
    await this.begin("update", options);
    const index = this.bookings.findIndex((b) => b.id === id);
    const updated = { ...this.bookings[index]!, ...patch };
    this.bookings[index] = updated;
    return updated;
  }

  async remove(id: string, options?: RequestOptions): Promise<void> {
    await this.begin("remove", options);
    this.bookings = this.bookings.filter((b) => b.id !== id);
  }

  private async begin(method: Mutation, options?: RequestOptions): Promise<void> {
    this.mutationCalls.push({ method, options });
    await this.mutationGate;
    const failure = this.failures.get(method);
    if (failure) {
      this.failures.delete(method);
      throw failure;
    }
  }
}

export function createTestWrapper(api: BookingsApi) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <BookingsApiProvider api={api}>{children}</BookingsApiProvider>
      </QueryClientProvider>
    );
  }
  return { queryClient, wrapper: Wrapper };
}
