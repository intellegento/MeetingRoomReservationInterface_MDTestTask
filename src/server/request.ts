// Разбор тела запроса (400): JSON-объект, известные поля, типы и формат. Бизнес-правила — в src/domain.
import { isValidDate, parseTime } from "@/domain/time";
import type { BookingField, BookingInput } from "@/domain/types";
import { invalidRequest } from "./errors";

export type BookingPatch = Partial<BookingInput>;

type Parsed<T> = { ok: true; value: T } | { ok: false; response: Response };

const FIELDS: readonly BookingField[] = ["date", "start", "end", "title"];
const REQUIRED: readonly BookingField[] = ["date", "start", "end"];

const fail = (response: Response): { ok: false; response: Response } => ({ ok: false, response });
const isField = (key: string): key is BookingField => (FIELDS as readonly string[]).includes(key);

function checkFormat(field: BookingField, value: string): boolean {
  if (field === "date") return isValidDate(value);
  if (field === "start" || field === "end") return parseTime(value) !== null;
  return true;
}

/** Тело PATCH: любые из полей date, start, end, title; других полей нет. */
export async function parseBookingPatch(request: Request): Promise<Parsed<BookingPatch>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(invalidRequest("Тело запроса — не JSON"));
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return fail(invalidRequest("Тело запроса должно быть объектом"));
  }

  const entries = Object.entries(body);
  const unknownFields = entries.map(([key]) => key).filter((key) => !isField(key));
  if (unknownFields.length > 0) {
    return fail(invalidRequest(`Неизвестные поля: ${unknownFields.join(", ")}`, undefined, { unknownFields }));
  }

  const patch: BookingPatch = {};
  for (const [key, value] of entries) {
    if (!isField(key)) continue;
    if (typeof value !== "string") return fail(invalidRequest(`Поле ${key} должно быть строкой`, key));
    if (!checkFormat(key, value)) {
      return fail(invalidRequest(key === "date" ? "Дата должна быть в формате ГГГГ-ММ-ДД" : "Время должно быть в формате ЧЧ:ММ", key));
    }
    patch[key] = value;
  }
  return { ok: true, value: patch };
}

/** Тело POST: как PATCH, плюс обязательные date, start, end. */
export async function parseBookingCreate(request: Request): Promise<Parsed<BookingInput>> {
  const parsed = await parseBookingPatch(request);
  if (!parsed.ok) return parsed;
  const { date, start, end, title } = parsed.value;
  if (date === undefined || start === undefined || end === undefined) {
    const missing = REQUIRED.find((field) => parsed.value[field] === undefined);
    return fail(invalidRequest(`Нет обязательного поля ${missing}`, missing));
  }
  return { ok: true, value: title === undefined ? { date, start, end } : { date, start, end, title } };
}
