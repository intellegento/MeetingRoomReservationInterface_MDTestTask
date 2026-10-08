# Stage 1 — трейс

## Команда заказчика

> Этап 1 по docs/plan.md. Прочитай AGENTS.md, docs/architecture.md, docs/testing.md и
> строки B1-B12, S1, S3, T1 из docs/requirements.md. Выполни date в формате,
> закреплённом в AGENTS.md, и запиши старт в docs/time-log.md.
>
> Шаг 1. Только инфраструктура, без которой нельзя запустить тесты (допускается по
> AGENTS.md): Next.js App Router, TypeScript strict, Vitest, ESLint, скрипты gate и
> policy-check, git-хук pre-commit. Gate прогоняет тесты в двух поясах:
> TZ=UTC и TZ=America/Los_Angeles. Покажи в трейсе пробное нарушение каждого
> lint-правила (границы слоёв, Date.now/new Date вне файлов-часов, литералы времени
> вне domain, fetch вне src/api, ts-ignore, any) и откати.
>
> Шаг 2. План в docs/traces/stage-1.md: цель, файлы, список тестов (название + ID).
> Domain без React и Next: […] getRoomNow(instant, timeZone) -> { date, minutes } через Intl;
> overlaps(a, b): строго aStart < bEnd && bStart < aEnd; validateBooking(input, { bookings, now, editingId? }) -> […];
> getAvailableEnds(start, bookings, now, editingId?) -> допустимые end; коды ошибок включают DURATION_STEP,
> минутную точность и запрет правки начавшейся брони. Тесты: 09:00, 18:00, 08:30, 18:30; длительности
> 29/30/31/45/60/90/120/121; касание границ; вложение; самоконфликт; старт 10:10 при now=10:10 допустим, 10:09
> недопустим; старт 10:40 после брони 10:10-10:40 допустим; сегодня/вчера/завтра; переход через полночь;
> B9 при TZ=Europe/Moscow.
>
> Шаг 3. Напиши тесты, запусти, покажи, что они красные по нужной причине, а не из-за
> ошибки импорта. Код реализации не пиши. СТОП.

Старт: `2026-10-08 20:28:43 +0600` (см. `docs/time-log.md`).

## Шаг 1. Инфраструктура

### Зависимости

Записаны в [журнал architecture.md](../architecture.md#журнал-зависимостей) **до** `npm install`, версии закреплены точно (`--save-exact`).

| Пакет | Версия | Тип |
|-------|--------|-----|
| next / react / react-dom | 16.4.0 / 19.3.0 / 19.3.0 | prod |
| typescript | 6.0.3 | dev — не 7.x: `typescript-eslint@8.71.1` требует `typescript <6.1` |
| @types/react, @types/react-dom, @types/node | 19.3.0, 19.3.0, 22.20.5 | dev |
| vitest, vite | 5.0.3, 8.3.4 | dev — `vite` обязательная peer-зависимость vitest 5 |
| eslint, typescript-eslint | 10.12.0, 8.71.1 | dev |

### Файлы каркаса

| Файл | Что |
|------|-----|
| `package.json` | скрипты `dev`, `build`, `typecheck`, `lint`, `policy`, `test` (`TZ=UTC`), `test:tz` (`TZ=America/Los_Angeles`, `src/domain` и `*.tz.test.*`), `gate`, `prepare` (`git config core.hooksPath .githooks` для свежих клонов) |
| `tsconfig.json` | `strict: true`, `noUncheckedIndexedAccess`, алиас `@/*` → `src/*` (S3) |
| `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx` | минимальное App Router-приложение, чтобы работал `next build` |
| `vitest.config.ts` | `include: src/**/*.test.{ts,tsx}`, `allowOnly: false`, `passWithNoTests: false`, алиас `@` |
| `eslint.config.mjs` | правила из testing.md «Автоматические проверки» (ниже) |
| `scripts/gate.mjs` | состав gate (ниже), печатает число тестов из JSON-отчёта vitest |
| `scripts/policy-check.mjs` | добавлены проверки поиском (ниже) к существующей проверке time-log |
| `.githooks/pre-commit` | `policy-check --staged`, затем `npm run gate` |
| `.gitignore` | + `next-env.d.ts`, `*.tsbuildinfo`, `.gate` |

### Состав `npm run gate`

1. `tsc --noEmit`
2. `eslint --max-warnings 0 .`
3. `node scripts/policy-check.mjs` — time-log, история коммитов, поиск
4. `vitest run` с `TZ=UTC` — все тесты
5. `vitest run src/domain .tz.test.` с `TZ=America/Los_Angeles` — domain и тесты, помеченные как зависящие от пояса (T1)
6. `next build`

Первый упавший шаг делает gate красным (код 1). Шаги 4–5 печатают «тестов: N (passed, failed)». Если в `src` нет ни одного `*.test.ts(x)`, шаги 4–5 пропускаются с пометкой «0 тестов»; если файлы есть, а vitest их не нашёл — шаг падает (`passWithNoTests: false`).

Gate на пустом наборе тестов (до шага 2):

```
=== gate: ЗЕЛЁНЫЙ ===
тесты: в src нет файлов *.test.ts(x) — 0 тестов
ok   tsc --noEmit
ok   eslint
ok   policy-check
ok   next build
```

### Lint-правила и пробные нарушения

Правила (`eslint.config.mjs`):

| Правило | Где действует | ID |
|---------|---------------|----|
| `no-restricted-imports` (regex `^(@/\|(\.\./)+)<слой>(/\|$)`) по матрице architecture.md; в domain ещё `react`, `react-dom`, `next` | по слоям | S1 |
| `no-restricted-syntax`: `Date.now()`, `new Date()` без аргументов, `Date()` | `src/**`, кроме `src/server/clock.ts`, `src/features/clock.ts` | B9, T2 |
| `no-restricted-syntax`: литералы `"09:00"`/`"9:00"`/`"18:00"` (строка и шаблон) | `src/**`, кроме `src/domain` и тестов | S1 |
| `no-restricted-globals` `fetch`, `no-restricted-properties` `window.fetch`, `globalThis.fetch` | `src/**`, кроме `src/api` | S1 |
| `@typescript-eslint/ban-ts-comment`: `ts-ignore`, `ts-nocheck` запрещены, `ts-expect-error` только с описанием ≥ 10 символов | всё | S3 |
| `@typescript-eslint/no-explicit-any`: error | всё | S3 |
| `reportUnusedDisableDirectives: error` | всё | S3 |

Пробные файлы (созданы во временных `src/components`, `src/features`, `src/api`, `src/server`, `src/app/api/x`, `src/domain/probe-*.ts`), вывод `npx eslint --max-warnings 0 src`:

```

src/app/probe-page.tsx
  1:1  error  '@/server/store' import is restricted from being used by a pattern. src/server импортируют только src/app/api/** (S1)  no-restricted-imports

src/components/ProbeLayers.tsx
  1:1  error  '@/api/client' import is restricted from being used by a pattern. Компоненты не ходят в сеть: только через хуки src/features (AGENTS.md, S1)     no-restricted-imports
  2:1  error  '../server/store' import is restricted from being used by a pattern. Компоненты не ходят в сеть: только через хуки src/features (AGENTS.md, S1)  no-restricted-imports
  3:1  error  '@/features/use-day' import is restricted from being used by a pattern. Компоненты получают данные и колбэки через props                         no-restricted-imports

src/components/probe-literal.ts
  1:21  error  Границы рабочего дня — бизнес-правило: берите константы из src/domain, а не литерал времени (S1)  no-restricted-syntax
  2:22  error  Границы рабочего дня — бизнес-правило: берите константы из src/domain, а не литерал времени (S1)  no-restricted-syntax

src/domain/probe-layers.ts
  1:1  error  'react' import is restricted from being used by a pattern. src/domain не зависит от React и Next.js                              no-restricted-imports
  2:1  error  '@/api/client' import is restricted from being used by a pattern. src/domain — чистые функции, без зависимостей от других слоёв  no-restricted-imports

src/domain/probe-now.ts
  1:18  error  «Сейчас» берётся только из файлов-часов (src/server/clock.ts, src/features/clock.ts) и передаётся параметром (B9, AGENTS.md)  no-restricted-syntax
  2:18  error  «Сейчас» берётся только из файлов-часов (src/server/clock.ts, src/features/clock.ts) и передаётся параметром (B9, AGENTS.md)  no-restricted-syntax

src/domain/probe-ts.ts
  1:1   error  Use "@ts-expect-error" instead of "@ts-ignore", as "@ts-ignore" will do nothing if the following line is error-free                                             @typescript-eslint/ban-ts-comment
  3:1   error  Include a description after the "@ts-expect-error" directive to explain why the @ts-expect-error is necessary. The description must be 10 characters or longer  @typescript-eslint/ban-ts-comment
  7:17  error  Unexpected any. Specify a different type                                                                                                                        @typescript-eslint/no-explicit-any

src/features/probe-fetch.ts
  1:18  error  Unexpected use of 'fetch'. fetch вызывается только в src/api (S1)                         no-restricted-globals
  2:18  error  'window.fetch' is restricted from being used. fetch вызывается только в src/api (S1)      no-restricted-properties
  3:18  error  'globalThis.fetch' is restricted from being used. fetch вызывается только в src/api (S1)  no-restricted-properties

src/features/probe-now.ts
  1:18  error  «Сейчас» берётся только из файлов-часов (src/server/clock.ts, src/features/clock.ts) и передаётся параметром (B9, AGENTS.md)  no-restricted-syntax
  2:18  error  «Сейчас» берётся только из файлов-часов (src/server/clock.ts, src/features/clock.ts) и передаётся параметром (B9, AGENTS.md)  no-restricted-syntax

src/features/probe-server.ts
  1:1  error  '@/server/store' import is restricted from being used by a pattern. src/server импортируют только src/app/api/** (S1)  no-restricted-imports

✖ 19 problems (19 errors, 0 warnings)

exit=1
```

Разрешённые случаи в тех же пробах **не** дали ошибок: `fetch` в `src/api/probe-fetch.ts`; `Date.now()`/`new Date()` в `src/server/clock.ts`; `new Date("2026-10-08T04:10:00Z")` с аргументом в domain; литерал `"09:00"` в `src/domain/probe-literal.ts`; импорт `@/server/store` из `src/app/api/x/route.ts`; `@ts-expect-error` с описанием.

Откат: `rm -rf src/components src/features src/api src/server src/app/api src/app/probe-page.tsx src/domain/probe-*.ts`; после отката `eslint` — 0 ошибок.

### policy-check: новые проверки и пробные нарушения

Добавлено в `scripts/policy-check.mjs` (без зависимостей): `.env*` в git только `.env.example`, в нём только `ИМЯ=`; нет `.skip/.only/.todo/xit/xdescribe/fit/fdescribe` в тестах; `eslint-disable` только с ` -- <причина>`; нет `@ts-ignore`/`@ts-nocheck`; нет `vi.mock`/`jest.mock` с `domain`; каждая зависимость `package.json` есть в журнале architecture.md; нет секретов в `docs/traces/chats/`.

Проба: тест-файл с `vi.mock("@/domain/rules")`, `it.only`, `it.skip`, `xit`, `eslint-disable` без причины и с причиной; `left-pad` в `devDependencies`; `API_KEY=abc` в `.env.example`:

```
policy-check: FAIL
  - .env.example:1: только «ИМЯ=» без значения
  - src/domain/probe.test.ts:3: it.only("probe", () => {}); — .skip/.only/.todo/xit запрещены (AGENTS.md)
  - src/domain/probe.test.ts:4: it.skip("probe", () => {}); — .skip/.only/.todo/xit запрещены (AGENTS.md)
  - src/domain/probe.test.ts:5: xit("probe", () => {}); — .skip/.only/.todo/xit запрещены (AGENTS.md)
  - src/domain/probe.test.ts:6: // eslint-disable-next-line @typescript-eslint/no-explicit-any — eslint-disable без « -- <причина>» (S3)
  - src/domain/probe.test.ts:2: vi.mock("@/domain/rules"); — мокать src/domain нельзя (AGENTS.md)
  - зависимость left-pad не записана в журнал docs/architecture.md
exit=1
```

Строка `eslint-disable-next-line … -- причина записана` не попала в вывод — так и задумано. Откат: файл удалён, `package.json` восстановлен из копии, `.env.example` снова пустой; `policy-check: OK`.

## Шаг 2. План domain

**Цель.** Все бизнес-правила B1–B7, B9–B12 — чистые функции `src/domain` без React, Next, `Date.now()`, `new Date()` без аргумента и `toISOString`. Время — минуты от полуночи, даты — строки `YYYY-MM-DD`.

**ID требований.** B1, B2, B3, B4, B5, B6, B7, B9, B10, B11, B12 (unit), F4 (длина `title` — часть порядка проверок), S1, S3, ловушки T1, T2, T3, T4, T5.

### Файлы

| Файл | Содержимое |
|------|-----------|
| `src/domain/constants.ts` | `ROOM_TIMEZONE`, 09:00/18:00 в минутах, 30/120/шаг 30, `TITLE_MAX_LENGTH` — **готово (контракт)** |
| `src/domain/types.ts` | `Booking`, `BookingInput`, `RoomNow`, `Interval`, `BookingField`, `ValidationErrorCode`, `ValidationError`, `ValidationResult`, `ValidationContext` — **готово (контракт)** |
| `src/domain/time.ts` | `parseTime`, `formatTime`, `isValidDate`, `addDays`, `getRoomNow(instant, timeZone)` — заглушки |
| `src/domain/overlap.ts` | `overlaps(a, b)` — заглушка |
| `src/domain/rules.ts` | `validateBooking(input, { bookings, now, editingId? })`, `isBookingLocked(booking, now)` — заглушки |
| `src/domain/end-options.ts` | `getAvailableEnds({ date, start }, bookings, now, editingId?)` — заглушка |
| `src/domain/*.test.ts` | тесты (ниже) |

Заглушки только бросают `Error("Не реализовано: <функция> (этап 1, шаг 5)")`: модули и типы существуют, поэтому красный прогон падает на вызове функции, а не на импорте или компиляции.

### Решения по контракту

- **Коды ошибок** (`ValidationErrorCode`) в порядке проверок: `BOOKING_LOCKED` (B11, запрет правки начавшейся брони) → `INVALID_REQUEST` (формат, 400) → `OUTSIDE_WORKING_HOURS` (B1) → `START_NOT_BEFORE_END` (B2) → `DURATION_TOO_SHORT` (B3) → `DURATION_TOO_LONG` (B4) → `DURATION_STEP` (B10) → `DATE_IN_PAST` (B6: прошедшая дата, `field: "date"`) → `START_IN_PAST` (B6/B12: сегодня, старт `< floor(now)`, `field: "start"`) → `TITLE_TOO_LONG` → `OVERLAP` (B5, с `conflictWith`).
- **`errors` — все нарушения по порядку**, сервер возвращает `errors[0]`. Исключения: ошибка формата или `BOOKING_LOCKED` — дальше не проверяем; при `start ≥ end` (B2) проверки длительности B3/B4/B10 не добавляются.
- **Поле ошибки B1**: старт вне `[09:00, 18:00]` → `start`, иначе конец вне → `end`. B2–B4, B10 → `end`.
- **`getRoomNow`** отбрасывает секунды: `minutes = floor(now, минута)`. Тогда B12 «`start ≥ floor(now)` допустим» — это просто `start ≥ now.minutes` на сегодняшней дате.
- **`getAvailableEnds`** определён через `validateBooking`: конец `start + 30/60/90/120` попадает в список, только если вся бронь проходит валидацию. Поэтому он сам учитывает 18:00, следующую бронь, прошлое и собственную бронь (B7).

### Отклонения от команды и решения заказчика

| # | Команда | Предложено | Решение заказчика |
|---|---------|------------|-------------------|
| D1 | `getAvailableEnds(start, bookings, now, editingId?)` | `getAvailableEnds({ date, start }, bookings, now, editingId?)`: без даты функция не знает, сегодня ли слот, и какие брони на этой дате | **Принято** — Q20 в `docs/open-questions.md` |
| D2 | «коды ошибок включают … минутную точность» | Один код `IN_PAST` для B6 и B12 | **Разделить**: `DATE_IN_PAST` (прошлая дата) и `START_IN_PAST` (старт раньше текущей минуты сегодня) — Q19 |

Цитата ответа: «Решения: (1) сигнатура getAvailableEnds({ date, start }, bookings, now, editingId?) принята. (2) Раздели IN_PAST на DATE_IN_PAST (прошлая дата) и START_IN_PAST (старт раньше текущей минуты сегодня), обнови types.ts, тесты и requirements.md (перечисли изменённые ID). Реализацию пока не начинай.»

### Правки по решению Q19

- `src/domain/types.ts`: `IN_PAST` → `DATE_IN_PAST` и `START_IN_PAST`, порядок B6 → B12.
- Тесты: ожидания `IN_PAST` заменены (дата → `DATE_IN_PAST`, старт → `START_IN_PAST`), строка «сообщения на русском» разделена на два кода. Добавлены 2 теста на границу между кодами: «B6: вчера 09:00–09:30 … → только DATE_IN_PAST, без START_IN_PAST» и «B6: завтра 09:00–09:30 … START_IN_PAST только для сегодня».
- Названия без ID (правило 1 testing.md), найденные при подсчёте: «формат: при неверном формате…» → «B1: при неверном формате (400)…»; «B1–B12: %s — сообщение…» → «%s: %s — …» с конкретным ID каждой строки (B11, B1, B2, B3, B4, B10, B6, B12, F4, B5). Ни один `expect` не изменён.
- `docs/requirements.md`, **изменённые ID**: «Общие условия» (список кодов, порядок проверок), **B6**, **B9**, **B12** + раздел журнала «коды прошедшего времени (этап 1, решение Q19)».
- `docs/open-questions.md`: решения Q19, Q20.

## Шаг 3. Тесты

Все тесты в `src/domain`, `src/domain` не мокается, «сейчас» передаётся параметром (базовая точка `2026-10-08 10:10` по Бишкеку). Шаблоны `it.each` разворачиваются в **187** тестов (было 184: +2 теста границы DATE/START_IN_PAST, +1 строка «сообщений» после разделения кода).

| Файл | Шаблонов | Тестов | ID |
|------|---------|--------|----|
| `time.test.ts` | 14 | 52 | B1 (формат, T5), B6 (`addDays`: вчера/завтра, переход месяца и года), B9 (T1, полночь), B12 |
| `rules.test.ts` | 36 | 85 | B1, B2, B3, B4, B6, B9 (T1, T2), B10, B11, B12, F4, порядок проверок, русские сообщения |
| `overlap.test.ts` | 7 | 24 | B5 (T3, все 8 случаев), B7 (T4, самоконфликт) |
| `end-options.test.ts` | 18 | 21 | B10, B5, B6, B7 (T4), B12, B1 |
| `room-now.tz.test.ts` | 5 | 5 | B9 при `TZ=Europe/Moscow`, T1 |

Как просьбы команды покрыты:

| Из команды | Тест |
|------------|------|
| 09:00, 18:00, 08:30, 18:30 | `rules`: «B1: 09:00–09:30 → принято», «B1: 17:30–18:00», «B1: 08:30–09:30 → OUTSIDE_WORKING_HOURS у поля start», «B1: 18:00–18:30 → … end», «B1: 18:30–19:00 → … start»; `time`: «B1: «09:00» → 540», ««18:00» → 1080»; `end-options`: «B1: старт «08:30»/«18:00» → вариантов нет» |
| длительности 29/30/31/45/60/90/120/121 | `rules`: «B3/B4/B10: %i мин …» (+150) и «B4, B10: 121 мин … первым DURATION_TOO_LONG» |
| касание границ, вложение | `overlap`: «B5, T3: касание справа/слева …», «вложение», «накрытие»; «B5: 11:00–12:00 → принято (касание справа)»; `end-options`: «B5, B10: касание следующей брони допустимо» |
| самоконфликт | `overlap`: «B7, T4: id=1 → … → принято», «B7, T4: без editingId 10:00–10:30 конфликтует с id=1»; `end-options`: «B7, T4: редактирование id=1 …» |
| 10:10 при now=10:10 допустим, 10:09 нет | `rules`: «B6: сегодня 10:10–10:40 …», «B6, B12: сегодня 10:09–10:39 → START_IN_PAST»; `end-options`: «B6: сегодня старт 10:09 …», «B12: сегодня старт 10:10 …»; `room-now.tz` |
| старт 10:40 после брони 10:10–10:40 | `rules`: «B6: старт 10:40 после брони 10:10–10:40 при now=10:10 → принято» |
| сегодня/вчера/завтра | `rules`: «B6: завтра 09:00–09:30», «B6: вчера 14:00–14:30 → DATE_IN_PAST у поля date», «B6: вчера 09:00–09:30 → только DATE_IN_PAST», B11 вчера/сегодня/завтра; `time`: «B6: 2026-10-08 −1/+1 дн.» |
| переход через полночь | `time`: «B9: переход через полночь по Бишкеку: 17:59:59Z → 23:59», «18:00:00Z → 00:00 следующего дня», «переход через Новый год»; «B9, T1: 2026-10-07T19:30Z → 2026-10-08 01:30» |
| B9 при TZ=Europe/Moscow | `room-now.tz.test.ts`: процесс переключается на `Europe/Moscow` в `beforeAll`, предусловие проверяется (`getTimezoneOffset() === -180`), 10:10 по Бишкеку проходит, 10:09 — `START_IN_PAST` |

### ID → число тестов

Считается по развёрнутым тестам JSON-отчёта vitest: ID — все `B*/F*/U*/S*/A*/D*` в названии до первого «:». Тест с несколькими ID (например, «B3/B4/B10») засчитан каждому.

| ID | тестов |
|----|--------|
| B1 | 59 |
| B2 | 7 |
| B3 | 11 |
| B4 | 11 |
| B5 | 20 |
| B6 | 23 |
| B7 | 10 |
| B9 | 15 |
| B10 | 28 |
| B11 | 11 |
| B12 | 10 |
| F4 | 8 |
| S1 | 0 |
| S3 | 0 |

Без тестов: **S1, S3** — проверяются не unit-тестами, а шагами gate (lint, `tsc`, `policy-check`); пробные нарушения — в шаге 1. Тестов без ID в названии: 0.

### Список тестов (названия шаблонов `it.each` до подстановки)

**`src/domain/end-options.test.ts`** — 18

- B10: завтра, броней нет, старт 12:00 → 12:30, 13:00, 13:30, 14:00
- B10: старт 16:10 → 16:40, 17:10, 17:40 (не позже 18:00)
- B10: старт 16:00 → до 18:00 включительно
- B10: старт 17:30 → только 18:00
- B10: старт 17:31 → вариантов нет
- B10, B6: сегодня в 10:10, есть бронь 11:00–12:00, старт 10:10 → только 10:40
- B10: старт 10:45, есть бронь 11:00–12:00 → вариантов нет
- B5, B10: касание следующей брони допустимо: старт 10:00, бронь 11:00–12:00 → 10:30, 11:00
- B10: старт внутри чужой брони → вариантов нет
- B10: бронь на другую дату не ограничивает
- B7, T4: редактирование id=1 10:00–11:00, старт 10:00 → 10:30, 11:00, 11:30, 12:00
- B7: та же ситуация без editingId → вариантов нет (своя бронь занимает слот)
- B7: при редактировании чужая бронь ограничивает: старт 12:00 → 12:30, 13:00
- B6: сегодня старт 10:09 при now=10:10 → вариантов нет
- B12: сегодня старт 10:10 при now=10:10 → 10:40 … 12:10
- B6: сейчас 17:31, сегодня старт 17:31 → вариантов нет (до 18:00 меньше 30 мин)
- B6: вчерашняя дата → вариантов нет
- B1: старт «%s» → вариантов нет

**`src/domain/overlap.test.ts`** — 7

- B5, T3: %s → пересекаются: %s
- B5: %s–%s (%s) → принято (%s)
- B5: %s–%s → OVERLAP с conflictWith (%s)
- B7, T4: id=1 → %s–%s → принято (%s)
- B7, T4: без editingId 10:00–10:30 конфликтует с id=1 (самоконфликт исключается только при редактировании)
- B7: id=1 → %s–%s → OVERLAP, conflictWith.id = 2
- B7: id=1 → 10:00–10:50 → DURATION_STEP (склеенный результат 50 мин)

**`src/domain/room-now.tz.test.ts`** — 5

- B9: пояс процесса действительно Europe/Moscow (UTC+3) — предусловие теста
- B9: 2026-10-08T04:10:00Z → «сейчас» комнаты 2026-10-08 10:10, а не московские 07:10
- B9: клиентская валидация пропускает старт 10:10 по Бишкеку
- B9: клиентская валидация отклоняет старт 10:09 по Бишкеку
- B9, T1: 2026-10-07T19:30Z (Москва 22:30 07.10) → «сегодня» комнаты 2026-10-08

**`src/domain/rules.test.ts`** — 36

- B1: %s–%s (%s) → принято
- B1: %s–%s → OUTSIDE_WORKING_HOURS у поля %s
- B1: формат %j → INVALID_REQUEST у поля %s (400)
- B2: %s–%s → START_NOT_BEFORE_END у поля end
- B2: 10:00–10:30 → принято
- B2: при start ≥ end проверки длительности не добавляют ошибок
- B3/B4/B10: %i мин (%s–%s) → %s
- B10: начало — любая минута: %s–%s → принято
- B10: %s–%s → DURATION_STEP
- B4, B10: 121 мин нарушает оба правила, первым идёт DURATION_TOO_LONG (порядок B4 → B10)
- B6: сегодня 10:10–10:40 при now=10:10 → принято (старт = сейчас)
- B6, B12: сегодня 10:09–10:39 при now=10:10 → START_IN_PAST у поля start
- B6: сегодня 10:00–10:30 при now=10:10 (слот уже начался) → START_IN_PAST
- B6: завтра 09:00–09:30 → принято
- B6: вчера 14:00–14:30 → DATE_IN_PAST у поля date
- B6: вчера 09:00–09:30 (старт и раньше now) → только DATE_IN_PAST, без START_IN_PAST
- B6: завтра 09:00–09:30 (старт раньше now по минутам) → принято: START_IN_PAST только для сегодня
- B6: 2099-12-31 09:00–09:30 → принято (горизонта нет, Q14)
- B6: старт 10:40 после брони 10:10–10:40 при now=10:10 → принято
- B12: сегодня старт 10:10, сейчас %s → принято: %s
- B9, T1: сейчас 2026-10-07T19:30Z (по Бишкеку 08.10 01:30): 2026-10-07 — прошедшая дата
- B9, T1: сейчас 2026-10-07T19:30Z: 2026-10-08 09:00–09:30 — сегодня и ещё не прошло
- B9: при системном времени %s результат определяется только переданным now
- B11: бронь %s %s–%s → заблокирована: %s (%s)
- B11: правка начавшейся брони → BOOKING_LOCKED, даже если новые значения допустимы
- B11: правка брони, начинающейся сейчас (10:10) → BOOKING_LOCKED
- B11: правка вчерашней брони на завтра → BOOKING_LOCKED
- B11: правка брони 10:11–10:41 (ещё не началась) → принято
- B11: блокировка проверяется первой — раньше формата и B1
- F4: title %j → принято: %s
- B1 раньше B2: 18:30–18:00 → OUTSIDE_WORKING_HOURS
- B2 раньше B3: 10:00–10:00 → START_NOT_BEFORE_END, а не DURATION_TOO_SHORT
- B10 раньше B6: сегодня 09:00–09:45 → DURATION_STEP, затем START_IN_PAST
- B6 раньше title и B5: сегодня 10:00–10:30, 101 символ, занято → START_IN_PAST, TITLE_TOO_LONG, OVERLAP
- B1: при неверном формате (400) остальные правила не проверяются
- %s: %s — непустое сообщение на русском

**`src/domain/time.test.ts`** — 14

- B1: «%s» → %i минут
- B1: неверный формат «%s» → null (400)
- «10:00»; сравнение идёт в минутах
- B1: %i минут → «%s»
- B1: «%s» — дата
- B1: «%s» — неверная дата (400)
- B6: %s %+i дн. → %s
- B9: 2026-10-08T04:10:00Z → по Бишкеку 2026-10-08 10:10
- B12: %s → %i минут (секунды отброшены)
- B9, T1: 2026-10-07T19:30Z → «сегодня» 2026-10-08 01:30, а не дата UTC
- B9: переход через полночь по Бишкеку: 17:59:59Z → 23:59 того же дня
- B9: переход через полночь по Бишкеку: 18:00:00Z → 00:00 следующего дня
- B9: переход через Новый год по Бишкеку: 2026-12-31T18:00Z → 2027-01-01 00:00
- B9: пояс берётся из параметра, а не из процесса: тот же момент в UTC — 2026-10-07 19:30

### Красный прогон (после решения Q19)

`tsc --noEmit`, `eslint --max-warnings 0 .`, `policy-check` — 0 ошибок.

`TZ=UTC npx vitest run`:

```
⎯⎯⎯⎯⎯⎯ Failed Tests 186 ⎯⎯⎯⎯⎯⎯
 Test Files  5 failed (5)
      Tests  186 failed | 1 passed (187)
```

`TZ=America/Los_Angeles npx vitest run src/domain .tz.test.`:

```
⎯⎯⎯⎯⎯⎯ Failed Tests 186 ⎯⎯⎯⎯⎯⎯
 Test Files  5 failed (5)
      Tests  186 failed | 1 passed (187)
```

Причины падений (JSON-отчёт vitest, первая строка сообщения):

```
Error: Не реализовано: getAvailableEnds: 21
Error: Не реализовано: overlaps: 9
Error: Не реализовано: validateBooking: 90
Error: Не реализовано: getRoomNow: 19
Error: Не реализовано: isBookingLocked: 5
Error: Не реализовано: parseTime: 17
Error: Не реализовано: formatTime: 5
Error: Не реализовано: isValidDate: 13
Error: Не реализовано: addDays: 7
ошибок загрузки файлов: 0
```

Все 186 падений — вызов заглушки нужной функции, ни один файл не упал на загрузке. Единственный зелёный тест — «B9: пояс процесса действительно Europe/Moscow (UTC+3) — предусловие теста»: он проверяет окружение (что смена `process.env.TZ` сработала), а не код domain, поэтому проходит до реализации. Если бы он падал, тесты B9 «при TZ=Europe/Moscow» ничего бы не доказывали.

Почему заглушки бросают исключение, а не возвращают «пустое» значение: при `return { ok: true }` / `false` / `[]` часть тестов («принято», «касание → false», «вариантов нет») стала бы зелёной без реализации. Ошибки утверждений (`expected … to be …`) появятся при ручных мутациях после реализации.

### Нет моков domain и «сейчас» в тестах

- `grep -rnE '\b(vi|jest)\.(mock|doMock)\(' src/domain` → нет совпадений; `policy-check` (поиск `vi.mock(…domain`) → OK.
- `grep -rnE 'Date\.now\(|new Date\(\s*\)|(^|[^A-Za-z. ])Date\(' src/domain` → только комментарий `time.ts:1`. Все `new Date(...)` в тестах — с аргументом-строкой (14 мест). ESLint `no-restricted-syntax` для `src/domain/**` и тестов → 0 ошибок.
- `vi.useFakeTimers`/`vi.setSystemTime` в тесте «B9: при системном времени %s …» подменяет системные часы, а не domain: проверяется, что результат зависит только от переданного `now` (T2).

## Шаг 5. Реализация

Команда: «Тесты одобрены. Реализуй минимум кода до зелёного: заглушки заменяются реализацией, тесты не менять. Если тест кажется неверным, остановись и объясни, не правь его. […]»

| Файл | Что |
|------|-----|
| `src/domain/time.ts` | `parseTime` (строгий `^([01]\d\|2[0-3]):[0-5]\d$`), `formatTime`, `isValidDate` (календарь с високосными годами), `addDays` (`Date.UTC` + `getUTC*`, без пояса процесса), `getRoomNow` (`Intl.DateTimeFormat.formatToParts`, `hourCycle: "h23"`, кэш форматтеров по поясу) |
| `src/domain/overlap.ts` | `a.start < b.end && b.start < a.end` |
| `src/domain/rules.ts` | `isBookingLocked`, `validateBooking` в порядке B11 → формат → B1 → B2 → B3/B4/B10 → B6 → B12 → title → B5; сообщения на русском |
| `src/domain/end-options.ts` | `start + 30…120` с шагом 30, не дальше 18:00, каждый вариант проходит `validateBooking` |

Тесты не менялись: mtime всех `*.test.ts` (последний — `rules.test.ts` 20:41:49) раньше файлов реализации (20:46:46–20:47:30). Первый прогон после реализации: `Tests 187 passed (187)`. Ни один тест не показался неверным.

## Доказательства

### Gate (зелёный, после мутаций и отката)

```
=== gate: ЗЕЛЁНЫЙ ===
ok   tsc --noEmit
ok   eslint
ok   policy-check
ok   тесты, TZ=UTC — тестов: 187 (passed 187, failed 0)
ok   тесты domain и *.tz.test, TZ=America/Los_Angeles — тестов: 187 (passed 187, failed 0)
ok   next build
```

Число тестов: 187 (на шаге 3 было 184 → 187 после решения Q19; не уменьшилось).

### Ручные мутации

Каждая мутация вносилась отдельно (Python-замена ровно одного вхождения), затем `TZ=UTC npx vitest run`, затем откат из копии файла и сверка sha. Файлы ещё не в git, поэтому откат через копию, а не `git checkout`.

| # | Мутация | Упало тестов | Пример упавшего теста |
|---|---------|--------------|-----------------------|
| M1 | `<` → `<=` в `overlaps` (B5) | 8 | «B5, T3: касание справа 10:00–11:00 / 11:00–12:00 → пересекаются: false» |
| M2 | `>` → `>=` в проверке максимальной длительности (B4) | 8 | «B3/B4/B10: 120 мин (10:00–12:00) → null» |
| M3 | убран фильтр `b.id !== editingId` (B7) | 6 | «B7, T4: id=1 → 10:00–10:30 → принято (сжатие)» |
| M4 | убрана проверка кратности 30 (B10) | 9 | «B10: 10:10–10:50 → DURATION_STEP» |
| M5 | `<` → `<=` в проверке `START_IN_PAST` (B12) | 8 | «B6: сегодня 10:10–10:40 при now=10:10 → принято (старт = сейчас)» |
| M6 | доп. (DoD plan.md): «сегодня» через `toISOString().slice(0,10)` (B9, T1) | 5 | «B9, T1: 2026-10-07T19:30Z → «сегодня» 2026-10-08 01:30, а не дата UTC» |

Полный вывод:

#### M1: < → <= в overlaps (B5)
`src/domain/overlap.ts`: `return a.start < b.end && b.start < a.end;` → `return a.start <= b.end && b.start <= a.end;`
```
<   return a.start < b.end && b.start < a.end;
---
>   return a.start <= b.end && b.start <= a.end;
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 8 ⎯⎯⎯⎯⎯⎯⎯
src/domain/end-options.test.ts > B10: варианты конца для select > B5, B10: касание следующей брони допустимо: старт 10:00, бронь 11:00–12:00 → 10:30, 11:00
src/domain/end-options.test.ts > B7: собственная бронь не ограничивает конец > B7: при редактировании чужая бронь ограничивает: старт 12:00 → 12:30, 13:00
src/domain/overlap.test.ts > overlaps: [s1,e1) и [s2,e2) пересекаются, если s1 < e2 && s2 < e1 > B5, T3: касание справа 10:00–11:00 / 11:00–12:00 → пересекаются: false
src/domain/overlap.test.ts > overlaps: [s1,e1) и [s2,e2) пересекаются, если s1 < e2 && s2 < e1 > B5, T3: касание слева 11:00–12:00 / 10:00–11:00 → пересекаются: false
src/domain/overlap.test.ts > B5: пересечения с существующей бронью 10:00–11:00 на 2026-10-09 > B5: 11:00–12:00 (2026-10-09) → принято (касание справа)
src/domain/overlap.test.ts > B5: пересечения с существующей бронью 10:00–11:00 на 2026-10-09 > B5: 09:00–10:00 (2026-10-09) → принято (касание слева)
src/domain/overlap.test.ts > B7: редактирование — бронь не конфликтует сама с собой > B7, T4: id=1 → 10:00–11:00 → принято (те же значения)
src/domain/rules.test.ts > B6, B12: прошедшее время с точностью до минуты > B6: старт 10:40 после брони 10:10–10:40 при now=10:10 → принято
      Tests  8 failed | 179 passed (187)
```
откат: sha до 27bc1030d3bf, после 27bc1030d3bf

#### M2: > → >= в проверке максимальной длительности (B4)
`src/domain/rules.ts`: `if (duration > MAX_DURATION_MINUTES)` → `if (duration >= MAX_DURATION_MINUTES)`
```
<     if (duration > MAX_DURATION_MINUTES) errors.push({ code: "DURATION_TOO_LONG", field: "end", message: MESSAGES.DURATION_TOO_LONG });
---
>     if (duration >= MAX_DURATION_MINUTES) errors.push({ code: "DURATION_TOO_LONG", field: "end", message: MESSAGES.DURATION_TOO_LONG });
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 8 ⎯⎯⎯⎯⎯⎯⎯
src/domain/end-options.test.ts > B10: варианты конца для select > B10: завтра, броней нет, старт 12:00 → 12:30, 13:00, 13:30, 14:00
src/domain/end-options.test.ts > B10: варианты конца для select > B10: старт 16:00 → до 18:00 включительно
src/domain/end-options.test.ts > B10: варианты конца для select > B10: бронь на другую дату не ограничивает
src/domain/end-options.test.ts > B7: собственная бронь не ограничивает конец > B7, T4: редактирование id=1 10:00–11:00, старт 10:00 → 10:30, 11:00, 11:30, 12:00
src/domain/end-options.test.ts > B6, B12, B1: недопустимый старт → вариантов нет > B12: сегодня старт 10:10 при now=10:10 → 10:40 … 12:10
src/domain/overlap.test.ts > B5: пересечения с существующей бронью 10:00–11:00 на 2026-10-09 > B5: 09:30–11:30 → OVERLAP с conflictWith (накрывает существующую)
src/domain/rules.test.ts > B3, B4, B10: длительность 30–120 минут, шаг 30 > B3/B4/B10: 120 мин (10:00–12:00) → null
src/domain/rules.test.ts > B3, B4, B10: длительность 30–120 минут, шаг 30 > B10: начало — любая минута: 10:10–12:10 → принято
      Tests  8 failed | 179 passed (187)
```
откат: sha до a903bd796c86, после a903bd796c86

#### M3: убран фильтр editingId (B7)
`src/domain/rules.ts`: `b.date === input.date && b.id !== editingId && overlapsBooking` → `b.date === input.date && overlapsBooking`
```
<       (b) => b.date === input.date && b.id !== editingId && overlapsBooking({ start, end }, b),
---
>       (b) => b.date === input.date && overlapsBooking({ start, end }, b),
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 6 ⎯⎯⎯⎯⎯⎯⎯
src/domain/end-options.test.ts > B7: собственная бронь не ограничивает конец > B7, T4: редактирование id=1 10:00–11:00, старт 10:00 → 10:30, 11:00, 11:30, 12:00
src/domain/overlap.test.ts > B7: редактирование — бронь не конфликтует сама с собой > B7, T4: id=1 → 10:00–10:30 → принято (сжатие)
src/domain/overlap.test.ts > B7: редактирование — бронь не конфликтует сама с собой > B7, T4: id=1 → 09:30–10:30 → принято (сдвиг влево внутри себя)
src/domain/overlap.test.ts > B7: редактирование — бронь не конфликтует сама с собой > B7, T4: id=1 → 10:00–11:00 → принято (те же значения)
src/domain/overlap.test.ts > B7: редактирование — бронь не конфликтует сама с собой > B7: id=1 → 10:30–11:30 → OVERLAP, conflictWith.id = 2
src/domain/rules.test.ts > B11: начавшиеся и прошедшие брони только для чтения > B11: правка брони 10:11–10:41 (ещё не началась) → принято
      Tests  6 failed | 181 passed (187)
```
откат: sha до a903bd796c86, после a903bd796c86

#### M4: убрана проверка кратности 30 (B10)
`src/domain/rules.ts`: `    if (duration % DURATION_STEP_MINUTES !== 0) errors.push({ code: "DURATION_STEP", field: "end", message: MESSAGES.DURATION_STEP });
` → ``
```
<     if (duration % DURATION_STEP_MINUTES !== 0) errors.push({ code: "DURATION_STEP", field: "end", message: MESSAGES.DURATION_STEP });
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 9 ⎯⎯⎯⎯⎯⎯⎯
src/domain/overlap.test.ts > B7: редактирование — бронь не конфликтует сама с собой > B7: id=1 → 10:00–10:50 → DURATION_STEP (склеенный результат 50 мин)
src/domain/rules.test.ts > B3, B4, B10: длительность 30–120 минут, шаг 30 > B3/B4/B10: 31 мин (10:00–10:31) → DURATION_STEP
src/domain/rules.test.ts > B3, B4, B10: длительность 30–120 минут, шаг 30 > B3/B4/B10: 45 мин (10:00–10:45) → DURATION_STEP
src/domain/rules.test.ts > B3, B4, B10: длительность 30–120 минут, шаг 30 > B10: 10:10–10:50 → DURATION_STEP
src/domain/rules.test.ts > B3, B4, B10: длительность 30–120 минут, шаг 30 > B10: 10:00–11:15 → DURATION_STEP
src/domain/rules.test.ts > B3, B4, B10: длительность 30–120 минут, шаг 30 > B10: 16:10–18:00 → DURATION_STEP
src/domain/rules.test.ts > B3, B4, B10: длительность 30–120 минут, шаг 30 > B4, B10: 121 мин нарушает оба правила, первым идёт DURATION_TOO_LONG (порядок B4 → B10)
src/domain/rules.test.ts > Порядок проверок: B11 → формат → B1 → B2 → B3 → B4 → B10 → B6 → B12 → title → B5 > B10 раньше B6: сегодня 09:00–09:45 → DURATION_STEP, затем START_IN_PAST
src/domain/rules.test.ts > Сообщения на русском (Q17) > B10: DURATION_STEP — непустое сообщение на русском
      Tests  9 failed | 178 passed (187)
```
откат: sha до a903bd796c86, после a903bd796c86

#### M5: < → <= в проверке START_IN_PAST (B12)
`src/domain/rules.ts`: `input.date === now.date && start < now.minutes` → `input.date === now.date && start <= now.minutes`
```
<   else if (input.date === now.date && start < now.minutes) errors.push({ code: "START_IN_PAST", field: "start", message: MESSAGES.START_IN_PAST });
---
>   else if (input.date === now.date && start <= now.minutes) errors.push({ code: "START_IN_PAST", field: "start", message: MESSAGES.START_IN_PAST });
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 8 ⎯⎯⎯⎯⎯⎯⎯
src/domain/end-options.test.ts > B10: варианты конца для select > B10, B6: сегодня в 10:10, есть бронь 11:00–12:00, старт 10:10 → только 10:40
src/domain/end-options.test.ts > B6, B12, B1: недопустимый старт → вариантов нет > B12: сегодня старт 10:10 при now=10:10 → 10:40 … 12:10
src/domain/room-now.tz.test.ts > B9: процесс в TZ=Europe/Moscow, комната в Asia/Bishkek > B9: клиентская валидация пропускает старт 10:10 по Бишкеку
src/domain/rules.test.ts > B6, B12: прошедшее время с точностью до минуты > B6: сегодня 10:10–10:40 при now=10:10 → принято (старт = сейчас)
src/domain/rules.test.ts > B6, B12: прошедшее время с точностью до минуты > B12: сегодня старт 10:10, сейчас 2026-10-08T04:10:00Z → принято: true
src/domain/rules.test.ts > B6, B12: прошедшее время с точностью до минуты > B12: сегодня старт 10:10, сейчас 2026-10-08T04:10:59Z → принято: true
src/domain/rules.test.ts > B9, T2: системные часы не влияют на domain > B9: при системном времени 2020-01-01T00:00:00Z результат определяется только переданным now
src/domain/rules.test.ts > B9, T2: системные часы не влияют на domain > B9: при системном времени 2030-06-15T12:00:00Z результат определяется только переданным now
      Tests  8 failed | 179 passed (187)
```
откат: sha до a903bd796c86, после a903bd796c86

#### M6 (доп., DoD plan.md): «сегодня» через toISOString (B9, T1)
```
<     date: `${parts.year}-${parts.month}-${parts.day}`,
---
>     date: instant.toISOString().slice(0, 10),
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
src/domain/room-now.tz.test.ts > B9: процесс в TZ=Europe/Moscow, комната в Asia/Bishkek > B9, T1: 2026-10-07T19:30Z (Москва 22:30 07.10) → «сегодня» комнаты 2026-10-08
src/domain/rules.test.ts > B6, B12: прошедшее время с точностью до минуты > B9, T1: сейчас 2026-10-07T19:30Z (по Бишкеку 08.10 01:30): 2026-10-07 — прошедшая дата
src/domain/time.test.ts > getRoomNow > B9, T1: 2026-10-07T19:30Z → «сегодня» 2026-10-08 01:30, а не дата UTC
src/domain/time.test.ts > getRoomNow > B9: переход через полночь по Бишкеку: 18:00:00Z → 00:00 следующего дня
src/domain/time.test.ts > getRoomNow > B9: переход через Новый год по Бишкеку: 2026-12-31T18:00Z → 2027-01-01 00:00
      Tests  5 failed | 182 passed (187)
```
откат: sha до 2298effd59f8, после 2298effd59f8

После отката всех мутаций — gate выше, зелёный.

### «Сейчас» в domain

```
$ grep -rn "Date.now" src/domain        → пусто (exit 1)
$ grep -rnE "new Date\(\s*\)" src/domain → пусто (exit 1)
```

Первый прогон `grep -rn "Date.now"` нашёл комментарий `time.ts:1` («…без Date.now() / new Date()…»); комментарий переформулирован, после этого grep пуст. ESLint `no-restricted-syntax` (Date.now, `new Date()` без аргументов, `Date()`) действует на `src/domain/**`, включая тесты, — 0 ошибок.

### Чек-лист stage-gate

| Пункт | Доказательство |
|-------|----------------|
| ☑ Команда на этап была | Раздел «Команда заказчика» — цитата команды, сразу под заголовком трейса. Команды на шаги 4–5 тоже процитированы |
| ☑ Gate зелёный | «Gate» выше: `npm run gate` exit 0, все 6 шагов `ok` |
| ☑ Красный прогон был | «Красный прогон (после решения Q19)»: 186 failed / 1 passed, причина каждого падения — «Не реализовано: <функция>», 0 ошибок загрузки |
| ☑ Трейс заполнен | План, ID, файлы, тесты, красный и зелёный прогоны, мутации, отклонения — в этом файле |
| ☑ Время записано | `docs/time-log.md`, строка `1`: старт и конец — вывод `date`, факт = конец − старт, проверяется `policy-check` |
| ☑ Требования сверены | Таблица «ID → число тестов»: B1–B7, B9–B12, F4 — от 7 до 59 тестов; S1, S3 — шаги gate с пробными нарушениями (шаг 1). B8 к этапу 1 не относится (этапы 2, 6) |
| ☑ нет `.skip/.only/xit/it.todo` | `grep -rnE '\.(skip\|only\|todo)\(\|\b(xit\|xdescribe\|fit\|fdescribe)\(' src` → пусто; policy-check OK; `allowOnly: false` |
| ☑ нет `@ts-ignore` / `any` / `eslint-disable` | `grep -rnE '@ts-ignore\|@ts-expect-error\|@ts-nocheck\|eslint-disable\|: any\b\|as any\b' src` → пусто; ESLint `no-explicit-any`, `ban-ts-comment` → 0. Исключений этапа нет |
| ☑ тесты не ослаблены | Число тестов 184 → 187. Правки тестов внутри этапа — только до одобрения тестов (см. «Отклонения»), ни один `expect` не удалён и ожидаемые значения не ослаблены. После одобрения тесты не менялись (mtime) |
| ☑ бизнес-правила только в domain, без часов | Код есть только в `src/domain` и пустом `src/app/page.tsx`; grep `Date.now` / `new Date()` пуст; импортов `react`/`next` в domain нет (grep пуст, lint-правило) |
| ☑ domain не мокается | `grep -rnE '\b(vi\|jest)\.(mock\|doMock)\(' src` → пусто; policy-check OK |
| ☑ компоненты не импортируют `src/api` | `src/components` ещё нет; правило `no-restricted-imports` проверено пробой (шаг 1) |
| ☑ зависимости в журнале | 11 пакетов в журнале architecture.md; policy-check сверяет `package.json` с журналом — OK; проба с `left-pad` упала |
| ☑ `.env*` и `~/.ssh` не трогались | В git только `.env.example`, `git status -- '.env*'` пуст (в пробе policy-check файл временно менялся и восстановлен пустым — это `.env.example`, разрешённый файл). `~/.ssh` не читался |
| ☑ Инциденты | Нарушений правил и неожиданных поломок нет — в `incidents.md` не добавлялось. Мелкие отклонения — ниже |
| ☑ INDEX.md | Строка этапа 1 → `stage-1.md`, коммит `stage 1: domain (gate green)` |
| ☑ После коммита и push — СТОП | Коммит `c478544 stage 1: domain (gate green)` в `origin/main` (`git status -sb` → `## main...origin/main`). Отмечено в коммите этапа 2 (см. `stage-2.md`) |

## Отклонения от плана

| # | Что | Почему / последствия |
|---|-----|----------------------|
| O1 | **Правка тестов внутри этапа, № 1 (решение Q19).** `IN_PAST` разделён на `DATE_IN_PAST` и `START_IN_PAST`: ожидания заменены, строка «сообщения на русском» разделена, добавлены 2 теста границы между кодами | Решение заказчика по вопросу D2. 184 → 187 тестов. Изменены `types.ts`, `requirements.md` (Общие условия, B6, B9, B12), `open-questions.md` (Q19, Q20) |
| O2 | **Правка тестов внутри этапа, № 2 (ID в названиях).** «формат: при неверном формате…» → «B1: …»; «B1–B12: %s — сообщение…» → «%s: %s — …» с конкретным ID строки | Нарушали правило 1 testing.md (ID в начале названия); найдено при подсчёте «ID → тесты». `expect` не менялись |
| O3 | До первого отчёта о красном прогоне: исправлен порядок аргументов в названии `overlaps`-теста (второй `%s` выводил объект вместо ожидания) и типизация `firstError` (`tsc` `TS18048`) | Обнаружено до показа заказчику, поведение тестов не изменилось |
| O4 | Сигнатура `getAvailableEnds({ date, start }, …)` вместо `(start, …)` | Принято заказчиком (Q20) |
| O5 | **Перерасход на инфраструктуру — по объёму, не по времени.** Шаг 1 должен был дать «только инфраструктуру, без которой нельзя запустить тесты». Сделано больше: `policy-check` расширен шестью проверками поиском, хук запускает полный gate, `gate.mjs` с JSON-отчётом и числом тестов, пробы для каждой проверки | Всё это требует DoD этапа 1 в plan.md и раздел «Автоматические проверки» testing.md, но формально выходит за «минимум для запуска тестов». По времени перерасхода нет: шаг 1 — `20:28:43` → `20:33:52` (два вывода `date`, ≈ 5 мин), весь этап — см. time-log, таймбокс 50 мин |
| O6 | Таблица «файл → число тестов» в трейсе сначала была заполнена до подсчёта (три числа неверные); исправлена по JSON-отчёту vitest до показа заказчику | Числа в трейсе теперь только из отчёта vitest |
| O7 | Комментарий в `time.ts:1` содержал строку `Date.now()` и делал `grep -rn "Date.now" src/domain` непустым | Комментарий переформулирован; код не менялся |
| O8 | Мутация M6 (B9, `toISOString`) добавлена сверх списка из команды | Её требует DoD этапа 1 в plan.md (мутации B5, B7, B9, B10, B12) |
| O9 | Откат мутаций — копией файла и сверкой sha, а не `git checkout` (как в testing.md) | Файлы реализации ещё не были в git |
| O10 | `next-env.d.ts`, `*.tsbuildinfo`, `.gate/` добавлены в `.gitignore` | Генерируются `next build`, `tsc` и gate |

## Итог этапа 1

- Старт `2026-10-08 20:28:43 +0600`, конец `2026-10-08 20:48:57 +0600`, факт `0:20:14` (таймбокс 50 мин).
- Gate зелёный, 187 тестов в `TZ=UTC` и `TZ=America/Los_Angeles`.
- Мутации M1–M6 уронили тесты, после отката gate зелёный.
- Инцидентов нет.
