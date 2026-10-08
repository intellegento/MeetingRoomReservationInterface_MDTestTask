# Stage 3 — трейс

## Команда заказчика

> Этап 3 по docs/plan.md, таймбокс 20 мин. Прочитай AGENTS.md, docs/architecture.md,
> docs/testing.md и строки S1, S2, U3, F4, F5, F6 из docs/requirements.md, а также
> формат ошибок в разделе «Решения» (Q11) и допущение O3 (conflictWith). Выполни date
> в формате из AGENTS.md, запиши старт в time-log.
>
> Шаг 1. План в docs/traces/stage-3.md: цель, файлы, список тестов (название + ID).
> src/api: интерфейс BookingsApi { list(date, signal), create, update, remove },
> реализация httpBookingsApi (baseUrl из NEXT_PUBLIC_API_URL, по умолчанию /api; fetch
> разрешён только здесь). Класс ApiError { status, code, message, field?, conflictWith? }
> и type guards isConflict, isValidation, isNotFound, isNetwork. Сетевой сбой, таймаут
> и не-JSON ответ превращаются в ApiError с code NETWORK или PARSE. Dev-заголовки
> (X-Mock-Force-Conflict, X-Mock-Delay) передаются через опциональный параметр запроса,
> а не зашиты в клиент.
> src/features/bookings/hooks.ts на TanStack Query: BookingsApi приходит через
> React-контекст (провайдер), реализацию хуки напрямую не импортируют. Хуки:
> useDayBookings(date) (queryKey ["bookings", date], signal прокидывается),
> useCreateBooking, useUpdateBooking, useDeleteBooking. Инвалидация ["bookings", date]
> после успеха и после 409; для PATCH со сменой даты инвалидируются обе даты.
> Зависимость TanStack Query сначала запиши в architecture.md (точные версии).
> Тесты: маппинг ошибок (400/404/409/422/5xx), offline, не-JSON, таймаут, отмена
> через signal; хуки работают с fake-реализацией BookingsApi (S2); инвалидация при
> успехе и при 409; гонка: медленный ответ на дату A не перезаписывает B.
>
> Шаг 2. Напиши тесты, покажи красный прогон по нужной причине, таблицу
> «ID -> число тестов». Реализацию не пиши. СТОП.

Старт: `2026-10-08 21:22:34 +0600` (см. `docs/time-log.md`).

## Шаг 1. План

### Цель

UI работает с сервером только через интерфейс `BookingsApi` (S2) и хуки `src/features` на TanStack Query. Ошибки приходят как типизированная `ApiError` (U3, Q11). Список кэшируется по `["bookings", date]`, после мутаций и 409 — перезапрос без оптимистичных изменений (Q15, B8), смена даты без гонок (F1, T9).

### ID требований

S1 (fetch только в `src/api`, lint-граница — проверка намеренным нарушением на шаге 7), S2, U3, F1 (гонка, отмена), F4, F5, F6 (перезапрос), B8 (409 → перезапрос; dev-заголовки Q8).

### Сигнатура `BookingsApi` (`src/api/bookings-api.ts`)

```ts
interface RequestOptions { signal?: AbortSignal; headers?: Readonly<Record<string, string>> }
type BookingPatch = Partial<BookingInput>;
interface BookingsApi {
  list(date: string, signal?: AbortSignal): Promise<Booking[]>;
  create(input: BookingInput, options?: RequestOptions): Promise<Booking>;
  update(id: string, patch: BookingPatch, options?: RequestOptions): Promise<Booking>;
  remove(id: string, options?: RequestOptions): Promise<void>;
}
```

Dev-заголовки — общий `headers` в `RequestOptions`: клиент не знает имён `X-Mock-*`, их собирает dev-панель (этап dev-панели).

### `ApiError` (`src/api/errors.ts`)

`class ApiError extends Error { status; code; message; field?; details?; conflictWith? }`, `code` — коды сервера + `NETWORK` | `PARSE`.

| Ответ | `status` | `code` | guard |
|-------|----------|--------|-------|
| 400 + тело Q11 | 400 | из тела | — |
| 404 + тело Q11 | 404 | из тела | `isNotFound` |
| 409 + тело Q11 | 409 | из тела, `conflictWith` | `isConflict` |
| 422 + тело Q11 | 422 | из тела | `isValidation` |
| любой статус, тело не JSON или не `{ error: { code, message } }` (в т. ч. 5xx с HTML, пустое тело) | статус ответа | `PARSE` | — |
| `fetch` отклонён (офлайн), таймаут | 0 | `NETWORK` | `isNetwork` |
| отмена через внешний `signal` | — | не `ApiError`: пробрасывается `AbortError` | — |

### Файлы

| Файл | Что | Состояние на шаге 2 |
|------|-----|---------------------|
| `src/api/bookings-api.ts` | интерфейс `BookingsApi`, `RequestOptions`, `BookingPatch` | **готово** (контракт, только типы) |
| `src/api/errors.ts` | класс `ApiError`, коды; guards `isConflict`, `isValidation`, `isNotFound`, `isNetwork` | класс готов (контракт), guards — заглушки |
| `src/api/http-bookings-api.ts` | `createHttpBookingsApi({ baseUrl?, timeoutMs?, fetch? })`, `DEFAULT_TIMEOUT_MS = 15 000` (больше предела `X-Mock-Delay` 10 000); на шаге 5 — `export const httpBookingsApi = createHttpBookingsApi()`. baseUrl: параметр → `NEXT_PUBLIC_API_URL` → `/api` | заглушка |
| `src/features/bookings/api-context.tsx` | `BookingsApiProvider({ api })`, `useBookingsApi()` | **готово** (без провайдера хуки не отрендерить в тестах) |
| `src/features/bookings/hooks.ts` | `bookingsKey(date)`, `useDayBookings(date)`, `useCreateBooking()`, `useUpdateBooking()`, `useDeleteBooking()` и типы переменных мутаций | заглушки |
| `src/features/bookings/test-utils.tsx` | `FakeBookingsApi` (in-memory, без HTTP; задержка ответов, отказ следующей мутации) и `createTestWrapper(api)` | **готово** (тестовая инфраструктура) |
| `src/api/http-bookings-api.test.ts`, `src/features/bookings/hooks.test.tsx` | тесты | готово |
| `.env.example` | строка `NEXT_PUBLIC_API_URL=` | готово |
| `docs/architecture.md` | журнал зависимостей | готово |

Переменные мутаций:
- `useCreateBooking`: `{ input, request? }` → инвалидация `input.date` при успехе и 409.
- `useUpdateBooking`: `{ id, patch, previousDate, request? }` → при успехе инвалидация `previousDate` и `patch.date ?? previousDate` (обе, если дата сменилась); при 409 — дата из формы `patch.date ?? previousDate` (Q7).
- `useDeleteBooking`: `{ id, date, request? }` → инвалидация `date` при успехе.
- `request` (`RequestOptions`) передаётся в `BookingsApi` как есть.

### Зависимости (записаны в журнал до установки)

| Пакет | Версия | Тип | Основание |
|-------|--------|-----|-----------|
| `@tanstack/react-query` | 5.104.1 | prod | команда этапа |
| `@testing-library/react` | 16.3.3 | dev | **D1 — нужно подтверждение**: тесты хуков невозможны без рендера (`renderHook`) |
| `@testing-library/dom` | 10.4.2 | dev | peer `@testing-library/react` — D1 |
| `jsdom` | 30.1.2 | dev | DOM-окружение только для `hooks.test.tsx` (`// @vitest-environment jsdom`) — D1 |

## Шаг 2. Тесты

api-тесты клиента: `fetch` подменяется параметром `fetch` фабрики (правило 5 testing.md), domain настоящий. ui-тесты хуков: `renderHook` в jsdom с `FakeBookingsApi`, глобальный `fetch` заменён шпионом и проверяется, что он не вызван (S2). `QueryClient` в тестах с `retry: false`.

### Список тестов

**api/http-bookings-api.test.ts** (21, из них 5 — строки `it.each`)

- S2: list → GET {baseUrl}/bookings?date=2026-10-09, ответ — массив броней
- S2: baseUrl по умолчанию — /api
- S2: baseUrl берётся из NEXT_PUBLIC_API_URL
- F4: create → POST /bookings с JSON-телом, 201 → Booking
- F5: update → PATCH /bookings/b1 с частичным телом, 200 → Booking
- F6: remove → DELETE /bookings/b1, 204 → без значения
- B8: заголовки из параметра запроса (dev-панель, Q8) уходят в fetch как есть
- B8: без параметра запроса заголовков X-Mock-* нет (клиент их не зашивает)
- U3: 400 INVALID_REQUEST с field → ApiError с полями тела и статусом
- U3: 404 NOT_FOUND → ApiError с полями тела и статусом
- U3: 409 OVERLAP с conflictWith → ApiError с полями тела и статусом
- U3: 422 DURATION_STEP с field end → ApiError с полями тела и статусом
- U3: 422 без field, с details → ApiError с полями тела и статусом
- U3: GET → 500 с HTML-телом → ApiError PARSE, статус 500, общее сообщение
- U3: DELETE → 503 без тела → ApiError PARSE, статус 503
- U3: 422 с JSON не в формате Q11 → ApiError PARSE, статус 422, не валидация
- U3: 200 с не-JSON телом → ApiError PARSE, статус 200
- U3: офлайн (fetch отклонён TypeError) → ApiError NETWORK, статус 0
- U3: нет ответа дольше timeoutMs → ApiError NETWORK, запрос fetch отменён
- F1: отмена через signal → AbortError, а не ApiError (отменённый запрос не ошибка для UI)
- U3: type guards на не-ApiError возвращают false

**features/bookings/hooks.test.tsx** (15)

- S2: возвращает брони даты из тестовой реализации BookingsApi, без HTTP
- S2: данные лежат в кэше под ключом ["bookings", date]
- F1: signal запроса прокидывается в BookingsApi.list
- F1: смена даты A → B отменяет запрос A через signal
- F1: медленный ответ на дату A не перезаписывает список даты B (T9)
- U3: ошибка BookingsApi.list доходит до хука как ApiError
- F4: после успешного create список даты перезапрашивается ровно один раз
- F4: оптимистичных изменений нет — до ответа create новой брони в списке нет
- B8: create → 409: список даты из формы перезапрошен, чужая бронь видна, ошибка — конфликт
- U3: create → 422: список не перезапрашивается, ошибка — валидация
- B8: заголовки из request (dev-панель, Q8) доходят до BookingsApi.create
- F5: после успешного update без смены даты список даты перезапрашивается один раз
- F5: update со сменой даты A → B перезапрашивает списки обеих дат (Q5)
- B8: update → 409 перезапрашивает список даты из формы
- F6: после успешного delete список даты перезапрашивается, брони в нём нет

### Таблица «ID → число тестов» (отчёт vitest, `src/api` + `src/features`)

| ID | Тестов |
|----|--------|
| U3 | 14 |
| S2 | 5 |
| B8 | 5 |
| F1 | 4 |
| F4 | 3 |
| F5 | 3 |
| F6 | 2 |
| **Всего** | **36** |

S1 тестами не покрывается: проверяется lint-правилами (шаг 7 — намеренное нарушение: импорт `@/api` из `src/components` и `fetch` в `src/features`).

### Красный прогон

`npx vitest run src/api src/features` → `Tests 36 failed (36)`. Причины (из JSON-отчёта, первая строка ошибки):

```
'Error: Не реализовано: createHttpBookingsApi (этап 3, шаг 5)': 20,
'Error: Не реализовано: useDayBookings (этап 3, шаг 5)': 14,
'Error: Не реализовано: useCreateBooking (этап 3, шаг 5)': 1,
'Error: Не реализовано: isConflict (этап 3, шаг 5)': 1
```

Ошибок импорта и окружения нет: `tsc --noEmit` — OK, `eslint src/api src/features` — OK, `policy-check` — OK. Полный прогон: `Tests 36 failed | 359 passed (395)` — прежние 359 тестов зелёные.

## Вопросы заказчику

- **D1.** Для тестов хуков добавлены dev-зависимости `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2, `jsdom` 30.1.2 (записаны в журнал до установки, пометка «ждёт подтверждения»). Без рендера хуки React не протестировать. Подтвердить или предложить замену (например, `happy-dom`).
- **D2.** Отмена через внешний `signal` пробрасывает `AbortError`, а не `ApiError` — TanStack Query тогда считает запрос отменённым, а не упавшим, и U3 не показывает ошибку при смене даты. Таймаут — `ApiError NETWORK`. Подтвердить.
- **D3.** `isValidation` — только 422; 400 (`INVALID_REQUEST`) отдельным guard не выделяется (UI отличит по `status === 400`, U3). Подтвердить или добавить `isBadRequest`.
- **D4.** Инвалидация при 409 для PATCH — только дата из формы (`patch.date ?? previousDate`, Q7), при успехе — обе даты. При 422/400/5xx список не перезапрашивается (есть тест на 422). Подтвердить.
- **D5.** Таймаут клиента по умолчанию 15 000 мс (больше предела `X-Mock-Delay` 10 000 мс, Q22). Подтвердить значение.

## Решения заказчика (после шага 2)

> Решения: D1-D5 приняты как предложено. Снимите пометку «ждёт подтверждения» у
> тестовых зависимостей в architecture.md, запишите причину (формы, диалоги и a11y
> на этапах 4-7). D4: добавь в requirements/трейс запись, что «Повторить» после
> 5xx и NETWORK повторяет мутацию, а не refetch списка (для этапа 6).

- D1–D5 приняты как предложено.
- `docs/architecture.md`: у `@testing-library/react`, `@testing-library/dom`, `jsdom` пометка снята, «Одобрено» — «Решение заказчика D1, этап 3», причина дополнена ui-тестами форм, диалогов и a11y на этапах 4–7.
- D4, дополнение для этапа 6: «Повторить» после 5xx и `NETWORK` у `POST`/`PATCH` повторяет **мутацию** с теми же данными формы, а не перезапрос списка; список после 5xx/`NETWORK` не инвалидируется. Записано в `docs/requirements.md`, U3.

## Шаг 5. Реализация (первая попытка: остановлено, D6)

> Тесты одобрены. Реализуй минимум до зелёного, тесты не менять. npm run gate с
> выводом. Мутации по одной с откатом по sha: (1) убери инвалидацию при 409,
> (2) убери прокидывание signal, (3) считай не-JSON ответ успехом. Покажи падающие
> тесты. Добавь в компонент пробный импорт src/api, покажи падение ESLint, откати.
> Stage-gate с доказательствами, трейс, date, time-log, коммит
> "stage 3: api client and hooks (gate green)", push. СТОП.

Реализованы `src/api/errors.ts` (guards по `code`; `isValidation` — 422 и не `PARSE`), `src/api/http-bookings-api.ts`, `src/features/bookings/hooks.ts`.

`npm run gate`: КРАСНЫЙ — `ok tsc`, `ok eslint`, `ok policy-check`, `FAIL тесты, TZ=UTC`: `Tests 1 failed | 394 passed (395)`. Падает «F5: update со сменой даты A → B перезапрашивает списки обеих дат (Q5)» на строке 217: `expected [ 'b1', 'b2' ] to deeply equal [ 'b2', 'b1' ]`. Ошибка в ожидании теста — [INC-3](incidents.md#inc-3-ошибка-в-ожидании-одобренного-теста-f5-порядок-броней).

- **D6.** Исправить ожидание на `["b1", "b2"]` (10:00 раньше 12:00, контракт «по возрастанию start») и добавить сортировку по `start` в `FakeBookingsApi.list`? Число тестов не меняется, проверка порядка остаётся.

## Решение D6 и продолжение

> D6 принят: (1) в тесте F5 замени ожидание ["b2","b1"] на ["b1","b2"]; (2) добавь
> сортировку по start в FakeBookingsApi.list. Это единственные правки тестового кода.
> Покажи git diff по тестовым файлам и подтверди, что число тестов осталось прежним
> и ни один expect не удалён. Добавь мутацию: убери сортировку в fake, покажи, что
> тест порядка падает, откати по sha.
>
> По INC-3 объясни, почему правило «тесты проверены до реализации» не поймало ошибку,
> и предложи правку правила (например, строка «вывод ожидания» в трейсе для тестов
> с порядком или конкретными значениями). Не вноси правку, жди одобрения.
>
> Затем продолжи по прежнему промту: gate, мутации (1) без инвалидации при 409,
> (2) без signal, (3) не-JSON как успех, (4) инвалидация только новой даты при PATCH
> со сменой даты; пробный импорт src/api в компонент с падением ESLint; stage-gate,
> трейс, date, time-log, коммит "stage 3: api client and hooks (gate green)", push.
> СТОП.

### Правки тестового кода (только D6)

Тестовые файлы не были в git, поэтому diff снят против одобренной версии (восстановлена обратной заменой):

```diff
--- approved/hooks.test.tsx
+++ src/features/bookings/hooks.test.tsx
@@ -214,7 +214,7 @@
-    expect(result.current.listB.data?.map((b) => b.id)).toEqual(["b2", "b1"]);
+    expect(result.current.listB.data?.map((b) => b.id)).toEqual(["b1", "b2"]);
--- approved/test-utils.tsx
+++ src/features/bookings/test-utils.tsx
+import { parseTime } from "@/domain/time";
+const minutes = (time: string) => parseTime(time) ?? Number.NaN;
@@ list
-    const snapshot = () => this.bookings.filter((b) => b.date === date).map((b) => ({ ...b }));
+    // Контракт BookingsApi.list: по возрастанию start (как сервер, F2), сравнение в минутах (T5).
+    const snapshot = () =>
+      this.bookings
+        .filter((b) => b.date === date)
+        .sort((x, y) => minutes(x.start) - minutes(y.start))
+        .map((b) => ({ ...b }));
```

Сортировка — в минутах через `parseTime` из domain, не строковым сравнением (ловушка T5). `hooks.test.tsx`: `expect(` — 45 до и 45 после, `it(` — 15 и 15. Тестов в `src/api` + `src/features`: 36 → 36; всего 395 → 395.

### Почему проверка до реализации не поймала INC-3

1. Красный прогон доказывает только, что тест падает «по правильной причине». Здесь причина — заглушка `Не реализовано` в первой строке теста (`renderHook` → `useDayBookings`), и **ни один `expect` не выполнился**. Значения ожиданий красный прогон не проверяет вообще.
2. Заказчик ревьюит тест по коду. Ожидание `["b2", "b1"]` выглядит правдоподобно (перенесённая бронь «в конце»), а данных для проверки рядом нет: время `b1` и `b2` задано в константах в начале файла, правило порядка — в контракте `BookingsApi`.
3. Ожидание вывелось из предположения о поведении fake (порядок вставки), а не из контракта («по возрастанию start»). Правило не требует связывать конкретное значение с источником.

**Предложение D7 (не внесено, ждёт одобрения).** В `docs/testing.md`, «Правила», добавить пункт:

> **Вывод ожидания.** Для теста, где ожидается конкретный порядок, список или вычисленное значение (не просто «ошибка/успех»), в трейсе этапа на шаге 2 записывается строка: `тест → входные данные → правило (ID/контракт) → ожидание`. Пример: `F5 обе даты → b1 10:00, b2 12:00 на B; list по возрастанию start (BookingsApi, F2) → ["b1", "b2"]`. Тестовая реализация (fake) реализует инварианты контракта, на которые опираются ожидания.

И в `docs/checklists/stage-gate.md` пункт «Красный прогон был» дополнить: «для тестов с конкретными значениями есть строка вывода ожидания».

### Gate

```
=== gate: ЗЕЛЁНЫЙ ===
ok   tsc --noEmit
ok   eslint
ok   policy-check
ok   тесты, TZ=UTC — тестов: 395 (passed 395, failed 0)
ok   тесты domain и *.tz.test, TZ=America/Los_Angeles — тестов: 216 (passed 216, failed 0)
ok   next build
```

Число тестов: 359 (этап 2b) → 395 (+36).

### Мутации

По одной: `git hash-object -w <файл>` сохраняет sha блоба, мутация вносится заменой строки, прогон `vitest run src/api src/features`, откат `git cat-file -p <sha> > <файл>` и сверка `git hash-object` с sha. Файлы этапа ещё не в коммите, поэтому откат по sha блоба, а не `git checkout`.

| # | Мутация | Файл (sha до) | Упавшие тесты | Итог |
|---|---------|---------------|---------------|------|
| M0 | убрать `.sort` в `FakeBookingsApi.list` | `test-utils.tsx` (`6d1b118`) | — | **0 / 36 — дыра, [INC-4](incidents.md#inc-4-мутация-без-сортировки-в-fakebookingsapi-не-уронила-ни-одного-теста), D8** |
| M1 | create: без инвалидации при 409 | `hooks.ts` (`314bf31`) | B8: create → 409: список даты из формы перезапрошен… (`expected 1 to be 2`) | 1 / 36 |
| M1b | update: без инвалидации при 409 | `hooks.ts` (`314bf31`) | B8: update → 409 перезапрашивает список даты из формы (`expected 1 to be 2`) | 1 / 15 |
| M2a | хук: `api.list(date)` без `signal` | `hooks.ts` (`314bf31`) | F1: signal запроса прокидывается в BookingsApi.list; F1: смена даты A → B отменяет запрос A через signal | 2 / 36 |
| M2b | клиент: в `fetch` только сигнал таймаута, внешний `signal` не учитывается | `http-bookings-api.ts` (`0442809`) | F1: отмена через signal → AbortError, а не ApiError (`Test timed out in 5000ms`) | 1 / 36 |
| M3 | не-JSON ответ → `return undefined` (успех) | `http-bookings-api.ts` (`0442809`) | U3: GET → 500 с HTML-телом…; U3: DELETE → 503 без тела…; U3: 200 с не-JSON телом… (`ожидалось отклонение промиса`) | 3 / 36 |
| M4 | PATCH со сменой даты: инвалидация только новой даты | `hooks.ts` (`314bf31`) | F5: update со сменой даты A → B перезапрашивает списки обеих дат (`expected [ 1, 2 ] to deeply equal [ 2, 2 ]`) | 1 / 36 |

После всех откатов: `Tests 36 passed (36)`, sha файлов совпадают с исходными.

Первый прогон M1 заменил только `(isConflict(error) ?` — это строка create; в update выражение без скобки на отдельной строке. Поэтому M1b прогнан отдельно.

**Предложение D8 (не внесено, ждёт одобрения).** Закрыть дыру M0, не ослабляя тест: в тесте F5 «обе даты» поменять порядок исходных данных на `new FakeBookingsApi([ON_B, MORNING])`. Тогда без сортировки на дате B будет `["b2", "b1"]`, тест упадёт; ожидание `["b1", "b2"]` не меняется.

### Проверка lint-границы (S1)

Временные файлы `src/components/LintProbe.tsx` (импорт `@/api/http-bookings-api` и `../api/bookings-api`) и `src/features/lint-probe.ts` (`fetch`):

```
src/components/LintProbe.tsx
  1:1  error  '@/api/http-bookings-api' import is restricted from being used by a pattern. Компоненты не ходят в сеть: только через хуки src/features (AGENTS.md, S1)  no-restricted-imports
  2:1  error  '../api/bookings-api' import is restricted from being used by a pattern. Компоненты не ходят в сеть: только через хуки src/features (AGENTS.md, S1)      no-restricted-imports
src/features/lint-probe.ts
  1:28  error  Unexpected use of 'fetch'. fetch вызывается только в src/api (S1)  no-restricted-globals
✖ 3 problems (3 errors, 0 warnings)
eslint exit=1
```

Откат: файлы удалены, `src/components` удалён (его не было), `eslint .` — OK.

### Как заменить mock на реальный API (заготовка для README)

- Тот же HTTP-контракт (`GET /bookings?date=`, `POST /bookings`, `PATCH|DELETE /bookings/:id`, ошибки `{ error: { code, message, field?, details?, conflictWith? } }`) — задать `NEXT_PUBLIC_API_URL=https://backend.example/api` при сборке. Код не меняется.
- Другой транспорт или контракт — написать свою реализацию интерфейса `BookingsApi` (`src/api/bookings-api.ts`) и передать её в `<BookingsApiProvider api={...}>` в одном месте (подключение — этап 4). Хуки и компоненты не меняются; тесты хуков уже работают на другой реализации (`FakeBookingsApi`, S2).

### Изменённые файлы

`src/api/{bookings-api,errors,http-bookings-api}.ts`, `src/api/http-bookings-api.test.ts`, `src/features/bookings/{api-context.tsx,hooks.ts,hooks.test.tsx,test-utils.tsx}`, `package.json`, `package-lock.json`, `.env.example`, `docs/architecture.md`, `docs/requirements.md` (U3, D4), `docs/time-log.md`, `docs/traces/{stage-3,incidents,INDEX}.md`.

## Чек-лист stage-gate

| Пункт | Доказательство |
|-------|----------------|
| ☑ Команда на этап была | Первая строка трейса — цитата; команды решений и шага 5 — тоже цитатами |
| ☑ Gate зелёный | Раздел «Gate»: 395 (UTC), 216 (LA), `next build` ok. Pre-commit-хук запускает gate ещё раз |
| ☑ Красный прогон был | «Красный прогон»: 36 failed, все — «Не реализовано» |
| ☑ Трейс заполнен | План, сигнатура `BookingsApi`, таблица ошибок, тесты, gate, мутации, lint-проба, README-заготовка, отклонения |
| ☑ Время записано | `docs/time-log.md`, строка 3: старт и конец — вывод `date` |
| ☑ Требования сверены | S1 — lint-проба; S2 (5), U3 (14), B8 (5), F1 (4), F4 (3), F5 (3), F6 (2). U3 на уровне UI (сообщения, «Повторить») — этапы 4–6 |
| ☑ нет `.skip`/`.only`/`xit`/`it.todo` | grep по `src/api`, `src/features` пусто; `policy-check` ok |
| ☑ нет `@ts-ignore`/`any`/`eslint-disable` | grep пусто (совпадение `\bany\b` только `AbortSignal.any`) |
| ☑ тесты не ослаблены | 359 → 395. После одобрения тестов — только правки D6 (diff выше): одно ожидание исправлено по контракту с разрешения заказчика, `expect` 45 → 45 |
| ☑ бизнес-правила в `src/domain` | В `src/api`/`src/features` правил бронирования нет; fake сравнивает время через `parseTime` |
| ☑ `Date.now`/`new Date()` | grep по `src/api`, `src/features` пусто |
| ☑ domain не мокается | grep `vi.mock` по `src` пусто |
| ☑ компоненты не импортируют `src/api` | Lint-проба выше |
| ☑ зависимости | 4 записи в журнале до установки, D1 одобрено; `policy-check` ok |
| ☑ `.env*` не трогались | Изменён только `.env.example` (`NEXT_PUBLIC_API_URL=`) |
| ☑ Инциденты | INC-3 (ошибка в ожидании теста), INC-4 (мутация M0 не поймана) |
| ☑ INDEX.md | Строка этапа 3 → `stage-3.md` |
| ☑ После коммита и push — СТОП | Коммит `d4e1bcc stage 3: api client and hooks (gate green)` в `origin/main` (`git push`: `2f70c77..d4e1bcc  main -> main`, `git status -sb` → `## main...origin/main`). Отмечено в коммите 3b |

## Отклонения от плана

| # | Что | Почему / последствия |
|---|-----|----------------------|
| O1 | Добавлены 3 dev-зависимости для тестов хуков | Без рендера хуки не протестировать. Одобрено (D1) |
| O2 | Одобренный тест F5 содержал неверное ожидание порядка | INC-3; исправлено по решению D6; предложение D7 |
| O3 | Мутация M0 не поймана | INC-4; закрыт в 3b (D8) |
| O4 | `isConflict`/`isNotFound` проверяют `code`, а не статус; `isValidation` — 422 и не `PARSE` | Тест «422 с JSON не в формате Q11 → … не валидация» требует, чтобы `PARSE`-ответ с 422 не считался валидацией |
| O5 | Проба lint дополнена `fetch` в `src/features` | Это вторая половина S1 (plan.md, DoD этапа 3), отдельный временный файл, удалён |

## Вопросы заказчику

- **D7.** Правило «вывод ожидания» в testing.md и stage-gate (текст выше). Внести?
- **D8.** Закрыть дыру M0: в тесте F5 «обе даты» исходные данные `[ON_B, MORNING]`, ожидание не меняется. Внести?

## 3b: D7, D8

### Команда заказчика

> D7 и D8 приняты.
> D7: добавь в testing.md правило «вывод ожидания» (обязательно для тестов с порядком,
> конкретными числами или временем: тест -> входные данные -> правило (ID или
> контракт) -> ожидание; записывается в трейс на шаге 2) и пункт в stage-gate в
> «Красный прогон был». Проверь, можно ли это проверять автоматически; если нет,
> так и запиши, автоматику не внося.
> D8: в тесте F5 «обе даты» задай брони в обратном порядке [ON_B, MORNING], ожидание
> не меняй. Покажи git diff по тесту, подтверди, что число тестов и expect прежние.
> Повтори мутацию M0 (убрать сортировку в fake): теперь тест должен упасть. Откати по
> sha, gate зелёный.
> Закрой пункт «После коммита и push» этапа 3 в трейсе. Закрой INC-4 в incidents.md
> (правило, причина, исправление). date, time-log отдельной строкой «3b: D7, D8»,
> коммит "stage 3b: expectation rule and fake ordering test (gate green)", push. СТОП.

Старт: `2026-10-08 21:37:01 +0600` (строка `3b: D7, D8` в `docs/time-log.md`).

### D7

- `docs/testing.md`, «Правила», пункт 9 «Вывод ожидания».
- `docs/checklists/stage-gate.md`, пункт «Красный прогон был» дополнен строками вывода ожидания.
- Автоматическая проверка: **не внесена, надёжно не автоматизируется** — записано строкой в таблице testing.md «Автоматические проверки правил AGENTS.md». Какой тест «с конкретным значением» и верно ли ожидание выведено из правила — смысловая проверка; поиск по `toEqual([`, числам и `HH:mm` в `expect` найдёт почти все тесты domain и api и не проверит правильность вывода. Проверяется чек-листом stage-gate и ревью.

### D8

```diff
@@ -201,7 +201,7 @@ describe("мутации: перезапрос списка (Q15)", () => {
   it("F5: update со сменой даты A → B перезапрашивает списки обеих дат (Q5)", async () => {
-    const api = new FakeBookingsApi([MORNING, ON_B]);
+    const api = new FakeBookingsApi([ON_B, MORNING]);
```

`hooks.test.tsx`: `expect(` 45 → 45, `it(` 15 → 15; всего тестов 395 → 395. Ожидание `["b1", "b2"]` не менялось.

Вывод ожидания (правило 9): `F5 обе даты → на B после переноса: b2 12:00 (индекс 0), b1 10:00 (индекс 1) → BookingsApi.list по возрастанию start (F2) → ["b1", "b2"]`.

Повтор M0 (убрать `.sort` в `FakeBookingsApi.list`, `test-utils.tsx`, sha `6d1b118`):

```
× F5: update со сменой даты A → B перезапрашивает списки обеих дат (Q5)
AssertionError: expected [ 'b2', 'b1' ] to deeply equal [ 'b1', 'b2' ]
Tests  1 failed | 35 passed (36)
```

Откат `git cat-file -p 6d1b118 > test-utils.tsx`, `git hash-object` = `6d1b118`, `Tests 36 passed (36)`.

Первая попытка правки D8 скриптом не применилась (неверный номер строки, сработала проверка `assert`) — тест не изменился, M0 в том прогоне прошла без падения, как до D8. Правка повторена поиском по названию теста, затем M0 повторена.

### Gate

```
=== gate: ЗЕЛЁНЫЙ ===
ok   tsc --noEmit
ok   eslint
ok   policy-check
ok   тесты, TZ=UTC — тестов: 395 (passed 395, failed 0)
ok   тесты domain и *.tz.test, TZ=America/Los_Angeles — тестов: 216 (passed 216, failed 0)
ok   next build
```

INC-4 закрыт (`incidents.md`). Пункт «После коммита и push» этапа 3 закрыт в чек-листе выше.
