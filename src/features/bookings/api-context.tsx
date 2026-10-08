// BookingsApi приходит через контекст (S2): хуки не импортируют реализацию.
"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { BookingsApi } from "@/api/bookings-api";

const BookingsApiContext = createContext<BookingsApi | null>(null);

export function BookingsApiProvider({ api, children }: { api: BookingsApi; children: ReactNode }) {
  return <BookingsApiContext.Provider value={api}>{children}</BookingsApiContext.Provider>;
}

export function useBookingsApi(): BookingsApi {
  const api = useContext(BookingsApiContext);
  if (!api) throw new Error("useBookingsApi: нет BookingsApiProvider выше по дереву");
  return api;
}
