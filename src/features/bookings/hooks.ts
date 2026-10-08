// Хуки сценариев бронирования на TanStack Query. Список — по ключу ["bookings", date];
// после мутаций — инвалидация без оптимистичных изменений (Q15).
"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { BookingPatch, RequestOptions } from "@/api/bookings-api";
import { isConflict, isNotFound, type ApiError } from "@/api/errors";
import type { Booking, BookingInput } from "@/domain/types";
import { useBookingsApi } from "./api-context";

export const bookingsKey = (date: string) => ["bookings", date] as const;

export interface CreateVariables {
  input: BookingInput;
  request?: RequestOptions;
}

export interface UpdateVariables {
  id: string;
  patch: BookingPatch;
  /** Дата брони до правки: при смене даты инвалидируются обе (Q5). */
  previousDate: string;
  request?: RequestOptions;
}

export interface DeleteVariables {
  id: string;
  date: string;
  request?: RequestOptions;
}

export function useDayBookings(date: string): UseQueryResult<Booking[], ApiError> {
  const api = useBookingsApi();
  return useQuery<Booking[], ApiError>({
    queryKey: bookingsKey(date),
    queryFn: ({ signal }) => api.list(date, signal),
    // При смене даты прежний список виден, пока грузится новый (индикатор — isFetching).
    placeholderData: keepPreviousData,
  });
}

/** Перезапрос списков дат: после успеха, 409 (Q15, B8) и 404 (брони уже нет, F5, F6). Остальные ошибки список не трогают (D4). */
function useInvalidateDays() {
  const queryClient = useQueryClient();
  return (dates: readonly string[]) =>
    Promise.all([...new Set(dates)].map((date) => queryClient.invalidateQueries({ queryKey: bookingsKey(date) })));
}

export function useCreateBooking(): UseMutationResult<Booking, ApiError, CreateVariables> {
  const api = useBookingsApi();
  const invalidate = useInvalidateDays();
  return useMutation<Booking, ApiError, CreateVariables>({
    mutationFn: ({ input, request }) => api.create(input, request),
    onSuccess: (_booking, { input }) => invalidate([input.date]),
    onError: (error, { input }) => (isConflict(error) ? invalidate([input.date]) : undefined),
  });
}

export function useUpdateBooking(): UseMutationResult<Booking, ApiError, UpdateVariables> {
  const api = useBookingsApi();
  const invalidate = useInvalidateDays();
  return useMutation<Booking, ApiError, UpdateVariables>({
    mutationFn: ({ id, patch, request }) => api.update(id, patch, request),
    onSuccess: (_booking, { patch, previousDate }) => invalidate([previousDate, patch.date ?? previousDate]),
    // 409: список на дату из формы (Q7). 404: брони больше нет — список её даты.
    onError: (error, { patch, previousDate }) =>
      isConflict(error) ? invalidate([patch.date ?? previousDate]) : isNotFound(error) ? invalidate([previousDate]) : undefined,
  });
}

export function useDeleteBooking(): UseMutationResult<void, ApiError, DeleteVariables> {
  const api = useBookingsApi();
  const invalidate = useInvalidateDays();
  return useMutation<void, ApiError, DeleteVariables>({
    mutationFn: ({ id, request }) => api.remove(id, request),
    onSuccess: (_result, { date }) => invalidate([date]),
    // 404: бронь уже удалена — для UI это мягкий успех (F6), список устарел.
    onError: (error, { date }) => (isNotFound(error) ? invalidate([date]) : undefined),
  });
}
