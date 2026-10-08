// Провайдеры приложения: кэш TanStack Query и HTTP-реализация BookingsApi (S2).
// Страницы не импортируют src/api — реализация подключается здесь.
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { httpBookingsApi } from "@/api/http-bookings-api";
import { BookingsApiProvider } from "./bookings/api-context";

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }));
  return (
    <QueryClientProvider client={queryClient}>
      <BookingsApiProvider api={httpBookingsApi}>{children}</BookingsApiProvider>
    </QueryClientProvider>
  );
}
