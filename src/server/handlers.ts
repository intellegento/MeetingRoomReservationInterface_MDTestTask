// Обработчики mock API: Request → Response. Route-файлы src/app/api/** — тонкие обёртки над ними.
// Каждое правило проверяется через src/domain: клиенту сервер не доверяет (Q1, T10).
import { ROOM_TIMEZONE } from "@/domain/constants";
import { MESSAGES, bookingsOverlap, isBookingLocked, normalizeTitle, validateBooking } from "@/domain/rules";
import { getRoomNow, isValidDate } from "@/domain/time";
import type { Booking, BookingInput } from "@/domain/types";
import { getNow } from "./clock";
import { applyDelay, isForcedConflict } from "./dev-tools";
import { errorResponse, invalidRequest, notFound } from "./errors";
import { parseBookingCreate, parseBookingPatch } from "./request";
import { findBooking, listAll, listByDate, newBookingId, removeBooking, saveBooking } from "./store";

/** Серверное «сейчас» в поясе комнаты — главные часы (B9). */
const roomNow = () => getRoomNow(getNow(), ROOM_TIMEZONE);

const toInput = (date: string, start: string, end: string, title: string | undefined): BookingInput =>
  title === undefined ? { date, start, end } : { date, start, end, title };

/** Первая ошибка domain в порядке проверок или null. */
function validationFailure(input: BookingInput, editingId?: string): Response | null {
  const result = validateBooking(input, { bookings: listAll(), now: roomNow(), editingId });
  if (result.ok) return null;
  const [first] = result.errors;
  return first === undefined ? null : errorResponse(first);
}

/**
 * X-Mock-Force-Conflict (B8): «чужая» бронь на запрошенном интервале и 409. Она кладётся в store,
 * кроме PATCH, где интервал пересекает исходный интервал самой брони (Q21): тогда только в ответе.
 */
function forcedConflict(request: Request, input: BookingInput, own?: Booking): Response | null {
  if (!isForcedConflict(request)) return null;
  const foreign: BookingInput = { date: input.date, start: input.start, end: input.end };
  const conflictWith =
    own !== undefined && bookingsOverlap(foreign, own) ? { id: newBookingId(), ...foreign } : saveBooking(newBookingId(), foreign);
  return errorResponse({ code: "OVERLAP", message: MESSAGES.OVERLAP, conflictWith });
}

export async function handleGetBookings(request: Request): Promise<Response> {
  await applyDelay(request);
  const date = new URL(request.url).searchParams.get("date");
  if (date === null || !isValidDate(date)) return invalidRequest("Параметр date должен быть в формате ГГГГ-ММ-ДД", "date");
  return Response.json(listByDate(date));
}

export async function handleCreateBooking(request: Request): Promise<Response> {
  await applyDelay(request);
  const parsed = await parseBookingCreate(request);
  if (!parsed.ok) return parsed.response;
  const { date, start, end, title } = parsed.value;
  const input = toInput(date, start, end, normalizeTitle(title));

  const failure = validationFailure(input) ?? forcedConflict(request, input);
  if (failure) return failure;
  return Response.json(saveBooking(newBookingId(), input), { status: 201 });
}

export async function handleUpdateBooking(request: Request, id: string): Promise<Response> {
  await applyDelay(request);
  const original = findBooking(id);
  if (!original) return notFound();
  const parsed = await parseBookingPatch(request);
  if (!parsed.ok) return parsed.response;

  // Q12: частичный PATCH — склейка старого и нового, title стирается пустой строкой.
  const patch = parsed.value;
  const merged = toInput(
    patch.date ?? original.date,
    patch.start ?? original.start,
    patch.end ?? original.end,
    "title" in patch ? normalizeTitle(patch.title) : original.title,
  );

  const failure = validationFailure(merged, id) ?? forcedConflict(request, merged, original);
  if (failure) return failure;
  return Response.json(saveBooking(id, merged));
}

export async function handleDeleteBooking(request: Request, id: string): Promise<Response> {
  await applyDelay(request);
  const booking = findBooking(id);
  if (!booking) return notFound();
  if (isBookingLocked(booking, roomNow())) return errorResponse({ code: "BOOKING_LOCKED", message: MESSAGES.BOOKING_LOCKED });
  removeBooking(id);
  return new Response(null, { status: 204 });
}
