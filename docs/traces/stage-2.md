# Stage 2 — трейс

## Команда заказчика

> Этап 2 по docs/plan.md, таймбокс 30 мин. Прочитай AGENTS.md, docs/architecture.md,
> docs/testing.md, раздел «Решения» в docs/open-questions.md и строки B1-B12, F2, F4, F5,
> F6, U3, U4 из docs/requirements.md. Выполни date в формате из AGENTS.md и запиши
> старт в docs/time-log.md. Заодно закрой пункт чек-листа этапа 1 «После коммита и
> push» в трейсе stage-1.md, если это можно сделать в коммите этапа 2.
>
> Шаг 1. План в docs/traces/stage-2.md: цель, файлы, список тестов (название + ID).
> Route Handlers: GET /api/bookings?date=, POST /api/bookings, PATCH и DELETE
> /api/bookings/[id]. Store: Map на globalThis, seed на сегодня и завтра (даты от
> «сегодня» в поясе комнаты). Серверное «сейчас» через getNow() с подменой в тестах
> (только через файл-часы). Сервер повторно валидирует через domain, клиенту не
> доверяет. Формат ошибки: { error: { code, message, field?, details?, conflictWith? } }.
> Статусы: 400 битый запрос (формат, неизвестные поля), 422 нарушение бизнес-правил
> (включая BOOKING_LOCKED для правки и удаления начавшихся броней), 404 нет брони,
> 409 только пересечение с conflictWith. PATCH частичный: склеить старое и новое,
> валидировать результат; title стирается пустой строкой; PATCH принимает date.
> Dev-заголовки работают только при ENABLE_DEV_TOOLS=true на сервере:
> X-Mock-Force-Conflict: 1 (сервер внутри этого же запроса создаёт «чужую» бронь на
> запрошенный интервал и отвечает 409), X-Mock-Delay: <мс> (с верхним пределом).
> Без флага заголовки игнорируются. Задержка по умолчанию 300-800 мс отключается env.
> Тесты вызывают handlers напрямую (Request -> Response): по тесту на каждый статус,
> на B1-B7 и B10-B12 на сервере; PATCH без изменения времени не даёт 409 (B7);
> PATCH со сменой даты; DELETE и PATCH начавшейся брони -> 422; заголовки с флагом и
> без; seed. Ручные curl-сценарии против dev-сервера (успех, 409, 422, 404) пойдут
> в трейс на шаге реализации.
>
> Шаг 2. Напиши тесты, запусти, покажи, что они красные по нужной причине (не из-за
> импортов), приложи таблицу «ID -> число тестов». Реализацию не пиши. СТОП.

Старт: `2026-10-08 20:52:09 +0600` (см. `docs/time-log.md`).

Пункт чек-листа этапа 1 «После коммита и push» закрыт в `stage-1.md` этим этапом: `git status -sb` → `## main...origin/main` (расхождений нет), `git log origin/main -1` → `c478544 stage 1: domain (gate green)`.

## Шаг 1. План

### Цель

Mock API на Route Handlers: сервер повторно проверяет каждое правило через `src/domain` (клиенту не доверяет), хранит брони в `Map` на `globalThis` с seed на сегодня и завтра по поясу комнаты, отвечает в едином формате ошибок. Серверное «сейчас» — только из `src/server/clock.ts`.

### ID требований

B1–B7, B10–B12 (api), B8 (серверная часть `X-Mock-Force-Conflict`), B9 (главные часы — серверные), F2 (GET, seed), F4, F5, F6 (api), U3 (формат тела ошибки), U4 (`X-Mock-Delay`), U1 (задержка по умолчанию — видна «Загрузка…»), D3 (store на `globalThis`).

### Файлы

| Файл | Что | Состояние на шаге 2 |
|------|-----|---------------------|
| `src/server/clock.ts` | `getNow()`, `setNowForTests(instant)`, `resetNowForTests()` — единственные системные часы сервера | **готово** (инфраструктура подмены часов, без неё тесты не запустить) |
| `src/server/store.ts` | `Map<string, Booking>` на `globalThis`, ленивый seed от `getRoomNow(getNow(), ROOM_TIMEZONE).date`, `resetStore(bookings?)` для тестов | заглушка (`resetStore` ничего не делает) |
| `src/server/seed.ts` | seed-брони на сегодня и завтра, даты через `addDays` | шаг 5 |
| `src/server/dev-tools.ts` | `MOCK_DELAY_MAX_MS = 10 000`, `DEFAULT_DELAY_MIN_MS = 300`, `DEFAULT_DELAY_MAX_MS = 800` — **готово (контракт)**; разбор флагов и заголовков | константы есть, логика — шаг 5 |
| `src/server/request.ts` | разбор тела: JSON, объект, типы полей, неизвестные поля, формат через `parseTime`/`isValidDate` → 400 | шаг 5 |
| `src/server/errors.ts` | `{ error: { code, message, field?, details?, conflictWith? } }`, код → статус (`INVALID_REQUEST` 400, `NOT_FOUND` 404, `OVERLAP` 409, остальные 422) | шаг 5 |
| `src/server/handlers.ts` | `handleGetBookings(request)`, `handleCreateBooking(request)`, `handleUpdateBooking(request, id)`, `handleDeleteBooking(request, id)` | заглушки: бросают `Error("Не реализовано: … (этап 2, шаг 5)")` |
| `src/app/api/bookings/route.ts`, `src/app/api/bookings/[id]/route.ts` | `GET`, `POST`, `PATCH`, `DELETE` — тонкие обёртки над `handlers.ts`, `dynamic = "force-dynamic"` | шаг 5 |
| `src/server/api-test-utils.ts` | построители `Request` и чтение тела для тестов | готово |
| `src/server/handlers.test.ts`, `src/server/dev-tools.test.ts`, `src/server/handlers.tz.test.ts` | тесты (ниже) | готово |
| `.env.example` | `ENABLE_DEV_TOOLS=`, `DISABLE_MOCK_DELAY=` (только имена) | шаг 5 |

### Решения по контракту (предложение исполнителя)

- **GET** `?date=YYYY-MM-DD` → `200` и **массив** `Booking[]` по возрастанию `start`. Без `date` или с неверной датой → `400 INVALID_REQUEST`, `field: "date"`. Прошедшие даты читаются (Q13).
- **POST** → `201` и созданный `Booking`; `id` назначает сервер. **PATCH** → `200` и склеенный `Booking`. **DELETE** → `204` без тела.
- **400 `INVALID_REQUEST`**: невалидный JSON; тело не объект; нет `date`/`start`/`end` в POST (`field`); неверный тип (`field`); `title: null`; неверный формат даты/времени (`field`, через `parseTime`/`isValidDate` из domain); неизвестные поля, включая `id` → `details: { unknownFields: [...] }`.
- **Порядок**: 404 → 400 → 422 (B11 → B1 → B2 → B3 → B4 → B10 → B6 → B12 → title) → 409, как в «Общих условиях» requirements.md. Сервер отдаёт первую ошибку `validateBooking`.
- **Пересчёт `title`**: trim, пустая строка — поле `title` удаляется (POST и PATCH).
- **Dev-заголовки** читаются, только если `process.env.ENABLE_DEV_TOOLS === "true"` (на каждый запрос).
  - `X-Mock-Force-Conflict: 1` (только значение `1`) в POST и PATCH: сначала обычная проверка; если есть ошибка (400/404/422/409) — она и возвращается; если запрос прошёл бы, сервер вставляет «чужую» бронь (новый `id`, без `title`) на запрошенный интервал и отвечает `409 OVERLAP` с `conflictWith` = этой бронью. Исходная бронь (PATCH) не меняется. **Исключение (Q21):** в `PATCH`, если запрошенный интервал пересекает исходный интервал этой же брони, «чужая» бронь не вставляется — ответ `409 OVERLAP`, `conflictWith` описывает «чужую» бронь на запрошенном интервале (новый `id`), store не меняется.
  - `X-Mock-Delay: <мс>` — целое `≥ 0`, ограничено `MOCK_DELAY_MAX_MS = 10 000`; некорректное значение игнорируется. Работает на всех методах, заменяет задержку по умолчанию.
- **Задержка по умолчанию** — случайная 300–800 мс на каждый ответ; `DISABLE_MOCK_DELAY=true` отключает (тесты, при желании демо).
- **Часы**: каждый обработчик берёт `getRoomNow(getNow(), ROOM_TIMEZONE)` один раз на запрос.

### Вопросы заказчику

Ответы заказчика записаны в `docs/open-questions.md` (Q21–Q24) и в requirements.md (B8, U4, журнал изменений).

> Решения: D1 — «чужая» бронь не должна создавать пересечение в store. Если новый
> интервал при PATCH с X-Mock-Force-Conflict пересекает исходный интервал этой же
> брони, отвечай 409 без создания «чужой» брони. Добавь красный тест на это.
> D2, D3, D4 приняты как предложено. Обнови stage-2.md и requirements.md, если
> затронуты критерии.

| # | Вопрос | Предложение | Влияние на тесты |
|---|--------|-------------|------------------|
| D1 | `PATCH` с `X-Mock-Force-Conflict`, когда запрошенный интервал пересекает **текущий** интервал самой брони (например `10:00–11:00` → `{end:"10:30"}`): «чужая» бронь `10:00–10:30` пересечёт ещё не изменённую исходную, store станет неконсистентным | Вставлять всё равно (только dev-режим, описать в README). Альтернатива: в этом случае отвечать 409 с «чужой» бронью, но не вставлять её | **Решено (Q21):** 409 без вставки. Добавлен тест «B8: … PATCH 10:00–11:00 → {end: 10:30} … (Q21)» |
| D2 | Имя env для отключения задержки и предел `X-Mock-Delay` | `DISABLE_MOCK_DELAY=true`; предел 10 000 мс | **Принято (Q22)** |
| D3 | `PATCH` начавшейся брони с битым форматом: 400 или 422 `BOOKING_LOCKED`? | 400 — по порядку из «Общих условий» (400 раньше 422) | **Принято (Q23)** |
| D4 | `ENABLE_DEV_TOOLS` включается только строкой `true`? | Да, `1`/`yes` — выключено | **Принято (Q24).** Добавлены значения флага `1`, `yes`, `True` для обоих заголовков |

### Ручные проверки (шаг реализации)

`curl` против `npm run dev`: `POST` успех → 201; тот же интервал → 409 с `conflictWith`; прошедшее время → 422; `PATCH`/`DELETE` несуществующего `id` → 404; с `ENABLE_DEV_TOOLS=true` — `X-Mock-Force-Conflict: 1` → 409. Мутация «удалить серверную проверку прошедшего времени» (DoD plan.md).

## Шаг 2. Тесты

Уровень api: обработчики вызываются напрямую (`Request` → `Response`), domain настоящий, подменяются только часы (`setNowForTests`), env (`vi.stubEnv`) и таймеры (`vi.useFakeTimers`, только `setTimeout`/`clearTimeout`) в тестах задержки. Базовое «сейчас» — `2026-10-08T04:10:00Z` (10:10:00 по Бишкеку); в `handlers.tz.test.ts` — `2026-10-07T19:30:00Z` (01:30 по Бишкеку), файл входит в прогон с `TZ=America/Los_Angeles`.

### Список тестов (из JSON-отчёта vitest)

**server/dev-tools.test.ts**

- B8: флаг включён, POST 14:00–15:00 «Демо» с заголовком → 409, в store «чужая» бронь 14:00–15:00
- B8: флаг включён, интервал уже занят → обычный 409, новая бронь не создаётся
- B8: флаг включён, запрос нарушает правила → 422, «чужая» бронь не создаётся
- B8: флаг включён, PATCH 14:00–15:00 → 16:00–17:00 с заголовком → 409 с «чужой» 16:00–17:00, бронь не изменена
- B8: флаг включён, PATCH 10:00–11:00 → {end: 10:30} с заголовком (пересекает исходный интервал) → 409 без «чужой» брони в store (Q21)
- B8: флаг включён, значение заголовка не «1» → заголовок игнорируется, 201
- B8: ENABLE_DEV_TOOLS не задан → X-Mock-Force-Conflict игнорируется, 201
- B8: ENABLE_DEV_TOOLS false → X-Mock-Force-Conflict игнорируется, 201
- B8: ENABLE_DEV_TOOLS 1 → X-Mock-Force-Conflict игнорируется, 201
- B8: ENABLE_DEV_TOOLS yes → X-Mock-Force-Conflict игнорируется, 201
- B8: ENABLE_DEV_TOOLS True → X-Mock-Force-Conflict игнорируется, 201
- U4: флаг включён, X-Mock-Delay: 2000 → ответ не раньше 2000 мс
- U4: флаг включён, X-Mock-Delay действует и на GET
- U4: X-Mock-Delay больше предела → задержка ограничена MOCK_DELAY_MAX_MS
- U4: некорректный X-Mock-Delay "abc" → игнорируется, ответ без задержки
- U4: некорректный X-Mock-Delay "-5" → игнорируется, ответ без задержки
- U4: некорректный X-Mock-Delay "" → игнорируется, ответ без задержки
- U4: ENABLE_DEV_TOOLS не задан → X-Mock-Delay игнорируется, ответ без задержки
- U4: ENABLE_DEV_TOOLS false → X-Mock-Delay игнорируется, ответ без задержки
- U4: ENABLE_DEV_TOOLS 1 → X-Mock-Delay игнорируется, ответ без задержки
- U4: ENABLE_DEV_TOOLS yes → X-Mock-Delay игнорируется, ответ без задержки
- U4: ENABLE_DEV_TOOLS True → X-Mock-Delay игнорируется, ответ без задержки
- U1: без DISABLE_MOCK_DELAY ответ задержан на 300–800 мс
- U1: DISABLE_MOCK_DELAY=true → ответ без задержки

**server/handlers.test.ts**

- F2: 200, только брони этой даты, по возрастанию start
- F2: дата без броней → 200 и пустой список
- F2: прошедшую дату можно смотреть (Q13) → 200
- F2: без параметра date → 400 INVALID_REQUEST, field date
- F2: date="2026-13-01" → 400 INVALID_REQUEST
- F2: date="2026-02-30" → 400 INVALID_REQUEST
- F2: date="08.10.2026" → 400 INVALID_REQUEST
- F2: date="2026-10-8" → 400 INVALID_REQUEST
- F2: date="" → 400 INVALID_REQUEST
- F2: после старта GET на сегодня и на завтра по Бишкеку возвращает непустые списки
- F2: seed-брони на завтра проходят правила domain и не пересекаются
- F4: завтра 14:00–15:00 «Демо» → 201 Booking с id, затем видна в GET
- F4: две брони получают разные id
- F4: title «  Демо  » сохраняется как «Демо»
- F4: title "" → у брони нет title
- F4: title "   " → у брони нет title
- F4: title 100 символов → 201
- F4: title 100 символов с пробелами по краям → 201 (длина после trim)
- F4: title 101 символ → 422 TITLE_TOO_LONG, field title
- B1: неверный формат → 400 INVALID_REQUEST, field start ({"date":"2026-10-09","start":"9:00","end":"10:00"})
- B1: неверный формат → 400 INVALID_REQUEST, field start ({"date":"2026-10-09","start":"25:00","end":"10:00"})
- B1: неверный формат → 400 INVALID_REQUEST, field end ({"date":"2026-10-09","start":"10:00","end":"10:60"})
- B1: неверный формат → 400 INVALID_REQUEST, field start ({"date":"2026-10-09","start":"","end":"10:00"})
- B1: неверный формат → 400 INVALID_REQUEST, field date ({"date":"2026-13-01","start":"10:00","end":"10:30"})
- F4: невалидный JSON → 400 INVALID_REQUEST
- F4: тело не объект ([]) → 400
- F4: тело не объект ("строка") → 400
- F4: тело не объект (null) → 400
- F4: тело не объект (42) → 400
- F4: нет обязательного поля date → 400, field указывает на него
- F4: нет обязательного поля start → 400, field указывает на него
- F4: нет обязательного поля end → 400, field указывает на него
- F4: неверный тип поля start → 400
- F4: неверный тип поля date → 400
- F4: неверный тип поля title → 400
- F4: неверный тип поля title → 400
- F4: неизвестное поле → 400, details.unknownFields
- F4: клиент не задаёт id → поле id в POST → 400
- F4: после 400 бронь не создана
- B1: 09:00–09:30 на 2026-10-09 → 201
- B1: 17:30–18:00 на 2026-10-09 → 201
- B1: 09:00–09:30 на 2026-10-10 → 201
- B1: 08:59–09:29 → 422 OUTSIDE_WORKING_HOURS, field start
- B1: 08:30–09:30 → 422 OUTSIDE_WORKING_HOURS, field start
- B1: 17:59–18:29 → 422 OUTSIDE_WORKING_HOURS, field end
- B1: 18:00–18:30 → 422 OUTSIDE_WORKING_HOURS, field end
- B2: 10:00–10:00 → 422 START_NOT_BEFORE_END
- B2: 11:00–10:00 → 422 START_NOT_BEFORE_END
- B2: 10:00–10:30 → 201
- B3: 10:00–10:29 (29 мин) → 422 DURATION_TOO_SHORT
- B3: 10:00–10:30 (30 мин) → 201
- B4: 10:00–12:00 (120 мин) → 201
- B4: 10:00–12:30 → 422 DURATION_TOO_LONG (первым — B4, затем B10)
- B4: 10:00–12:01 → 422 DURATION_TOO_LONG (первым — B4, затем B10)
- B10: 10:10–10:40 (кратно 30) → 201
- B10: 10:10–11:40 (кратно 30) → 201
- B10: 10:10–10:50 → 422 DURATION_STEP
- B10: 10:00–11:15 → 422 DURATION_STEP
- B10: 16:10–18:00 → 422 DURATION_STEP
- B6: сегодня, старт = сейчас (2026-10-08 10:10–10:40) → 201
- B6: завтра (2026-10-09 09:00–09:30) → 201
- B6: без горизонта (Q14) (2099-12-31 09:00–09:30) → 201
- B6: 2026-10-08 10:09–10:39 → 422 START_IN_PAST, field start
- B6: 2026-10-08 10:00–10:30 → 422 START_IN_PAST, field start
- B6: 2026-10-07 14:00–14:30 → 422 DATE_IN_PAST, field date
- B6: после 422 бронь не создана
- B12: сегодня старт 10:10, серверное сейчас 10:10:00 → 2026
- B12: сегодня старт 10:10, серверное сейчас 10:10:59 → 2026
- B12: сегодня старт 10:10, серверное сейчас 10:11:00 → 2026
- B12: сегодня старт 10:10, серверное сейчас 10:11:02 (граница минуты) → 2026
- U3: тело 422 — { error: { code, message, field } } с непустым сообщением
- B5: касание справа 11:00–12:00 → 201
- B5: касание слева 09:00–10:00 → 201
- B5: другая дата 10:00–11:00 → 201
- B5: пересечение справа 10:30–11:30 → 409 OVERLAP с conflictWith
- B5: пересечение слева 09:30–10:30 → 409 OVERLAP с conflictWith
- B5: совпадает 10:00–11:00 → 409 OVERLAP с conflictWith
- B5: внутри существующей 10:15–10:45 → 409 OVERLAP с conflictWith
- B5: накрывает существующую 09:30–11:30 → 409 OVERLAP с conflictWith
- B5: после 409 бронь не создана
- B5: тело 409 — { error: { code, message, conflictWith } }
- B7: {end: 10:30} → 200, склеенный результат 10:00–10:30 «Планёрка», виден в GET
- B7: {start: 09:30, end: 10:30} внутри своего интервала → 200 (нет самоконфликта)
- B7: пустое тело → 200 без изменений
- B7: те же значения → 200 без изменений
- B7: {start: 10:30, end: 11:30} → 409, conflictWith.id = 2, бронь не изменена
- B7: {start: 11:00, end: 11:30} → 409, conflictWith.id = 2, бронь не изменена
- B7: {end: 10:50} → 422 DURATION_STEP (склеенный результат 50 мин)
- B7: {start: 08:30} → 422 OUTSIDE_WORKING_HOURS (склейка проверяется по B1)
- B7: {start: 11:30} → 422 START_NOT_BEFORE_END (склейка 11:30–11:00)
- B7: {title: ""} → 200, title стёрт
- B7: {title: «  Ретро  »} → 200, title «Ретро»
- B7: {title: 101 символ} → 422 TITLE_TOO_LONG
- B7: {foo: 1} → 400 INVALID_REQUEST, бронь не изменена
- B7: {id: "5"} → 400 INVALID_REQUEST, бронь не изменена
- B7: {title: null} → 400 INVALID_REQUEST, бронь не изменена
- B7: {start: "9:00"} → 400 INVALID_REQUEST, бронь не изменена
- B7: {date: "2026-13-01"} → 400 INVALID_REQUEST, бронь не изменена
- B7: невалидный JSON → 400
- F5: {date: суббота} → 200, бронь есть в GET субботы и нет в GET завтра (Q5)
- F5: {date: вчера} → 422 DATE_IN_PAST (склейка проверяется по B6)
- F5: {date: суббота}, где есть пересекающаяся 10:30–11:30 → 409 с conflictWith брони субботы
- F5: несуществующий id → 404 NOT_FOUND
- F5: несуществующий id с битым телом → 404 (порядок: 404 раньше 400)
- F6: DELETE → 204 без тела, брони нет в GET
- F6: повторный DELETE того же id → 404 NOT_FOUND
- F6: DELETE несуществующего id → 404, store не изменён
- B11: идёт: сегодня 10:00–10:30 → PATCH 422 BOOKING_LOCKED, бронь не изменена
- B11: начинается сейчас: сегодня 10:10–10:40 → PATCH 422 BOOKING_LOCKED, бронь не изменена
- B11: вчера 14:00–14:30 → PATCH 422 BOOKING_LOCKED, бронь не изменена
- B11: идёт: сегодня 10:00–10:30 → DELETE 422 BOOKING_LOCKED, бронь осталась
- B11: начинается сейчас: сегодня 10:10–10:40 → DELETE 422 BOOKING_LOCKED, бронь осталась
- B11: вчера 14:00–14:30 → DELETE 422 BOOKING_LOCKED, бронь осталась
- B11: PATCH {} начавшейся брони → 422 BOOKING_LOCKED
- B11: сегодня 10:11–10:41 (ещё не началась) → PATCH 200
- B11: сегодня 10:11–10:41 (ещё не началась) → DELETE 204
- B11: бронь 10:11–10:41 начинает блокироваться, когда серверное сейчас = 10:11:00
- B11: PATCH начавшейся брони с битым форматом → 400 (порядок: 400 раньше 422)
- D3: данные store переживают повторную загрузку модулей (HMR в dev)

**server/handlers.tz.test.ts**

- B9: сейчас 2026-10-07T19:30Z → POST на 2026-10-07 → 422 DATE_IN_PAST
- B9: сейчас 2026-10-07T19:30Z → POST на 2026-10-08 09:00–09:30 (сегодня по Бишкеку) → 201
- F2: seed считается от «сегодня» по Бишкеку: 2026-10-08 и 2026-10-09 непустые, 2026-10-07 пустой

### ID → число тестов (из JSON-отчёта vitest)

| ID | Тестов | Файлы |
|----|--------|-------|
| B1 | 12 | handlers |
| B2 | 3 | handlers |
| B3 | 2 | handlers |
| B4 | 3 | handlers |
| B5 | 10 | handlers |
| B6 | 7 | handlers |
| B7 | 18 | handlers |
| B8 | 11 | dev-tools |
| B9 | 2 | handlers.tz |
| B10 | 5 | handlers |
| B11 | 11 | handlers |
| B12 | 4 | handlers |
| F2 | 12 | handlers (11), handlers.tz (1) |
| F4 | 23 | handlers |
| F5 | 5 | handlers |
| F6 | 3 | handlers |
| U1 | 2 | dev-tools |
| U3 | 1 | handlers |
| U4 | 11 | dev-tools |
| D3 | 1 | handlers |
| **Итого** | **146** | handlers.test.ts 119, dev-tools.test.ts 24, handlers.tz.test.ts 3 |

По файлам этапа 1 — 187 тестов, всего 333 (было 187, число не уменьшилось). После решений Q21–Q24: 138 → 146 (+1 тест Q21, +3 значения флага для `X-Mock-Force-Conflict`, +4 для `X-Mock-Delay`; ни одно ожидание не ослаблено).

### Красный прогон

`npx tsc --noEmit` → 0 ошибок, `npx eslint --max-warnings 0 .` → 0, `node scripts/policy-check.mjs` → `policy-check: OK`.

`TZ=UTC npx vitest run`:

```
 Test Files  3 failed | 5 passed (8)
      Tests  138 failed | 187 passed (325)
```

`TZ=UTC npx vitest run src/server` — причины падения (сгруппировано по первой строке ошибки из JSON-отчёта):

```
Error: Не реализовано: handleCreateBooking (этап 2, шаг 5)   84
Error: Не реализовано: handleUpdateBooking (этап 2, шаг 5)   30
Error: Не реализовано: handleGetBookings (этап 2, шаг 5)     16
Error: Не реализовано: handleDeleteBooking (этап 2, шаг 5)    8
```

Пример:

```
 FAIL  src/server/handlers.test.ts > GET /api/bookings?date= > F2: 200, только брони этой даты, по возрастанию start
Error: Не реализовано: handleGetBookings (этап 2, шаг 5)
 ❯ notImplemented src/server/handlers.ts:3:42
```

`TZ=America/Los_Angeles npx vitest run src/server/handlers.tz.test.ts` → `Tests  3 failed (3)`, та же причина.

Все 138 падают на вызове обработчика-заглушки: модули, типы и импорты на месте, `tsc` чистый. Ошибок импорта и необработанных отклонений промисов нет.

### Красный прогон после решений Q21–Q24

`tsc --noEmit` → 0, `eslint --max-warnings 0 .` → 0, `policy-check: OK`.

`TZ=UTC npx vitest run`:

```
 Test Files  3 failed | 5 passed (8)
      Tests  146 failed | 187 passed (333)
```

Причины (JSON-отчёт `src/server`):

```
Error: Не реализовано: handleCreateBooking (этап 2, шаг 5)   91
Error: Не реализовано: handleUpdateBooking (этап 2, шаг 5)   31
Error: Не реализовано: handleGetBookings (этап 2, шаг 5)     16
Error: Не реализовано: handleDeleteBooking (этап 2, шаг 5)    8
```

`TZ=America/Los_Angeles npx vitest run src/server/handlers.tz.test.ts` → `Tests  3 failed (3)`, та же причина.

### Проверка тестов на часы и моки

```
grep -rnE '(vi|jest)\.(mock|doMock|spyOn)\(' src/server   → пусто
grep -rn 'Date\.now' src/server                            → пусто
grep -rnE 'new Date\(\s*\)' src/server                     → src/server/clock.ts:8 (файл-часы)
```

`new Date(...)` в тестах только с ISO-строкой (константы `NOW`, `NIGHT` и аргументы `setNowForTests`). `vi.useFakeTimers` подменяет только `setTimeout`/`clearTimeout` в тестах задержки, «сейчас» сервера через него не меняется.

## Шаг 5. Реализация

### Команда заказчика

> Решение O3 подтверждено: при PATCH с X-Mock-Force-Conflict и интервалом, пересекающим
> собственный интервал брони, отвечай 409 с conflictWith = «чужая» бронь на запрошенном
> интервале с новым id, в store её не клади. Для остальных dev-конфликтов (POST, PATCH
> без самопересечения) conflictWith = созданная в store бронь. Зафиксируй это в
> requirements.md (B8) и в трейсе как допущение для README.
>
> Реализуй минимум кода до зелёного, тесты не менять. Если тест кажется неверным,
> остановись и объясни. Запусти npm run gate, приложи вывод (число тестов должно быть
> 333 в обоих поясах там, где применимо).
>
> В трейс добавь curl-сценарии против запущенного dev-сервера: успех, 409 пересечением,
> 409 через X-Mock-Force-Conflict (ENABLE_DEV_TOOLS=true), та же проверка без флага
> (заголовок игнорируется), 422, 404, 400.
>
> Мутации по одной с откатом (проверка sha) и падающим тестом: (1) убери серверную
> валидацию в POST, (2) убери фильтр editingId при PATCH, (3) обработай заголовок
> конфликта без проверки флага, (4) создавай «чужую» бронь при PATCH без проверки
> пересечения с собственным интервалом.
>
> Проверь: нет Date.now и new Date() без аргумента вне clock.ts, route.ts остаются
> тонкими обёртками. Пройди docs/checklists/stage-gate.md с доказательствами,
> заполни трейс, date, запиши конец и факт в time-log. Если gate зелёный: коммит
> "stage 2: mock api (gate green)", push. Следующий этап не начинай. СТОП.

Решение O3 записано как Q25 в `open-questions.md` и в критерий B8 `requirements.md` (+ журнал изменений).

### Что сделано

| Файл | Содержимое |
|------|-----------|
| `src/server/handlers.ts` | 4 обработчика. Порядок: задержка → (PATCH/DELETE) 404 → разбор тела 400 → `validateBooking` из domain (первая ошибка: 422 или 409) → dev-конфликт → запись. DELETE: `isBookingLocked` из domain → 422 `BOOKING_LOCKED` |
| `src/server/request.ts` | JSON, объект, неизвестные поля (`details.unknownFields`), строковые типы, формат через `isValidDate`/`parseTime`, обязательные поля POST → 400 |
| `src/server/errors.ts` | `{ error: {...} }`, код → статус: `INVALID_REQUEST` 400, `NOT_FOUND` 404, `OVERLAP` 409, прочие 422 |
| `src/server/store.ts` | `Map` на `globalThis[Symbol.for("meeting-room.bookings-store")]`, ленивый seed, `crypto.randomUUID()` для `id`, `listByDate` сортирует по минутам (`parseTime`), не по строке (T5) |
| `src/server/seed.ts` | 2 брони на сегодня, 3 на завтра; даты — `addDays(today, 1)` от `getRoomNow(getNow(), ROOM_TIMEZONE).date` |
| `src/server/dev-tools.ts` | `ENABLE_DEV_TOOLS === "true"` на каждый запрос; `X-Mock-Force-Conflict === "1"`; `X-Mock-Delay` `^\d+$`, `min(…, 10 000)`; по умолчанию 300–800 мс, `DISABLE_MOCK_DELAY=true` → 0 |
| `src/domain/rules.ts` | Добавлено: `normalizeTitle` (Q6: trim, пустая → нет), `bookingsOverlap` (B5 для двух броней, нужен для Q21), `MESSAGES` экспортирован (сервер берёт тексты ошибок из domain). Существующий код и тесты domain не менялись |
| `src/app/api/bookings/route.ts`, `[id]/route.ts` | 7 и 11 строк: `GET`/`POST`/`PATCH`/`DELETE` вызывают обработчик и возвращают его `Response`, `dynamic = "force-dynamic"`. Импорт только `@/server/handlers` |
| `.env.example` | `ENABLE_DEV_TOOLS=`, `DISABLE_MOCK_DELAY=` |
| `.claude/launch.json` | две конфигурации dev-сервера для ручных проверок: `dev-devtools` (`ENABLE_DEV_TOOLS=true`, :3101) и `dev` (:3100) |

Тесты не менялись: 333 зелёные с первого прогона после реализации.

### Таблица «метод + случай → статус → code»

| Метод | Случай | Статус | `code` |
|-------|--------|--------|--------|
| GET | `?date=` корректная (в т.ч. прошедшая) | 200 | — |
| GET | нет `date` / неверная дата | 400 | `INVALID_REQUEST` (`field: date`) |
| POST | успех | 201 | — |
| POST | битый JSON, не объект, нет поля, неверный тип, неизвестное поле, формат | 400 | `INVALID_REQUEST` |
| POST | B1 / B2 / B3 / B4 / B10 | 422 | `OUTSIDE_WORKING_HOURS` / `START_NOT_BEFORE_END` / `DURATION_TOO_SHORT` / `DURATION_TOO_LONG` / `DURATION_STEP` |
| POST | прошедшая дата / сегодня раньше текущей минуты | 422 | `DATE_IN_PAST` / `START_IN_PAST` |
| POST | `title` > 100 после trim | 422 | `TITLE_TOO_LONG` |
| POST | пересечение | 409 | `OVERLAP` + `conflictWith` |
| POST | `X-Mock-Force-Conflict: 1` + флаг, запрос валиден | 409 | `OVERLAP`, `conflictWith` — созданная «чужая» бронь |
| PATCH | успех (склейка) | 200 | — |
| PATCH | нет брони (даже с битым телом) | 404 | `NOT_FOUND` |
| PATCH | битое тело (даже у начавшейся брони) | 400 | `INVALID_REQUEST` |
| PATCH | бронь началась / прошла | 422 | `BOOKING_LOCKED` |
| PATCH | склейка нарушает B1–B6, B10, B12, title | 422 | как у POST |
| PATCH | склейка пересекает другую бронь | 409 | `OVERLAP` |
| PATCH | `X-Mock-Force-Conflict`, интервал пересекает свой исходный | 409 | `OVERLAP`, `conflictWith` не в store (Q21, Q25) |
| DELETE | успех | 204 | — |
| DELETE | нет брони | 404 | `NOT_FOUND` |
| DELETE | бронь началась / прошла | 422 | `BOOKING_LOCKED` |

### Gate

`npm run gate` → код 0:

```
 ✓ src/domain/time.test.ts (52 tests)
 ✓ src/domain/rules.test.ts (85 tests)
 ✓ src/server/handlers.tz.test.ts (3 tests)
 ✓ src/server/dev-tools.test.ts (24 tests)
 ✓ src/server/handlers.test.ts (119 tests)
 Test Files  8 passed (8)
      Tests  333 passed (333)
…
Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/bookings
└ ƒ /api/bookings/[id]

=== gate: ЗЕЛЁНЫЙ ===
ok   tsc --noEmit
ok   eslint
ok   policy-check
ok   тесты, TZ=UTC — тестов: 333 (passed 333, failed 0)
ok   тесты domain и *.tz.test, TZ=America/Los_Angeles — тестов: 190 (passed 190, failed 0)
ok   next build
```

333 — в прогоне `TZ=UTC` (все тесты). Прогон `TZ=America/Los_Angeles` по составу gate (testing.md, правило 7.5) берёт только `src/domain` и `*.tz.test.*`: 187 domain + 3 `handlers.tz.test.ts` = 190. Остальные серверные тесты фиксируют «сейчас» через `setNowForTests` и пояс процесса не используют; гонять их во втором поясе состав gate не требует.

### Ручные проверки curl

Dev-сервер через `.claude/launch.json` (preview_start), `$API` = `http://localhost:<порт>/api/bookings`. Сейчас — `2026-10-08 21:10:58 +0600`, поэтому брони на завтра `2026-10-09`. Задержка по умолчанию включена.

**`ENABLE_DEV_TOOLS=true`, порт 3101:**

```
$ curl "$API?date=2026-10-09"                     # seed на завтра
[{"id":"e127ff52-…","date":"2026-10-09","start":"10:00","end":"11:00","title":"Ретро"},{"id":"8ca1b0fb-…","date":"2026-10-09","start":"11:00","end":"12:00"},{"id":"4c5e745d-…","date":"2026-10-09","start":"15:30","end":"17:00","title":"Демо"}]
→ HTTP 200

$ curl -X POST $API -H 'content-type: application/json' -d '{"date":"2026-10-09","start":"13:00","end":"14:00","title":"Демо"}'
{"id":"4775df83-c02a-4769-bd99-7980335ef489","date":"2026-10-09","start":"13:00","end":"14:00","title":"Демо"}
→ HTTP 201

$ curl -X POST $API -H 'content-type: application/json' -d '{"date":"2026-10-09","start":"13:30","end":"14:30"}'
{"error":{"code":"OVERLAP","message":"Это время уже занято другой бронью","conflictWith":{"id":"4775df83-c02a-4769-bd99-7980335ef489","date":"2026-10-09","start":"13:00","end":"14:00","title":"Демо"}}}
→ HTTP 409

$ curl -X POST $API -H 'content-type: application/json' -H 'X-Mock-Force-Conflict: 1' -d '{"date":"2026-10-09","start":"14:00","end":"15:00","title":"Демо"}'
{"error":{"code":"OVERLAP","message":"Это время уже занято другой бронью","conflictWith":{"id":"6781acd8-6c60-43f2-b293-db02ff19b573","date":"2026-10-09","start":"14:00","end":"15:00"}}}
→ HTTP 409

$ curl "$API?date=2026-10-09"                     # «чужая» 14:00–15:00 в списке
[…,{"id":"4775df83-…","start":"13:00","end":"14:00","title":"Демо"},{"id":"6781acd8-…","start":"14:00","end":"15:00"},…]
→ HTTP 200

$ curl -X POST $API -H 'content-type: application/json' -d '{"date":"2026-10-07","start":"14:00","end":"14:30"}'
{"error":{"code":"DATE_IN_PAST","field":"date","message":"Нельзя бронировать на прошедшую дату"}}
→ HTTP 422

$ curl -X PATCH $API/missing -H 'content-type: application/json' -d '{"end":"10:30"}'
{"error":{"code":"NOT_FOUND","message":"Бронь не найдена — возможно, её уже удалили"}}
→ HTTP 404

$ curl -X DELETE $API/missing
{"error":{"code":"NOT_FOUND","message":"Бронь не найдена — возможно, её уже удалили"}}
→ HTTP 404

$ curl -X POST $API -H 'content-type: application/json' -d '{"date":"2026-10-09","start":"9:00","end":"10:00"}'
{"error":{"code":"INVALID_REQUEST","message":"Время должно быть в формате ЧЧ:ММ","field":"start"}}
→ HTTP 400

$ curl -X POST $API -H 'content-type: application/json' -d '{"date":"2026-10-09","start":"16:00","end":"16:30","foo":1}'
{"error":{"code":"INVALID_REQUEST","message":"Неизвестные поля: foo","details":{"unknownFields":["foo"]}}}
→ HTTP 400

$ curl -H 'X-Mock-Delay: 2000' "$API?date=2026-10-09"
X-Mock-Delay: 2000 → HTTP 200, 2.018011 s
```

**Без `ENABLE_DEV_TOOLS`, порт 3100 (новый процесс — новый store), `2026-10-08 21:11:20 +0600`:**

```
$ curl -X POST $API -H 'content-type: application/json' -H 'X-Mock-Force-Conflict: 1' -d '{"date":"2026-10-09","start":"14:00","end":"15:00","title":"Демо"}'
{"id":"249c750a-9c98-456f-9037-04db16ec4d92","date":"2026-10-09","start":"14:00","end":"15:00","title":"Демо"}
→ HTTP 201                                          # заголовок проигнорирован

$ curl -H 'X-Mock-Delay: 2000' "$API?date=2026-10-09"
X-Mock-Delay: 2000 → HTTP 200, 0.679516 s           # заголовок проигнорирован, задержка по умолчанию 300–800 мс
```

### Мутации

Каждая мутация — одна правка, прогон `TZ=UTC npx vitest run src/server`, откат копией файла и сверка `sha256` (первые 12 символов). Файлы новые (не в git), поэтому откат копией, а не `git checkout`. После всех откатов: `Tests 333 passed (333)`.

| # | Мутация | Файл, sha до → мутант → после отката | Упало | Пример упавшего теста |
|---|---------|---------------------------------------|-------|------------------------|
| M1 | POST без серверной валидации: `validationFailure(input) ?? forcedConflict(…)` → `forcedConflict(…)` | `handlers.ts` `4faa5f60d09f` → `c924e1ac2b9f` → `4faa5f60d09f` | 30 из 146 | `B10: 10:10–10:50 → 422 DURATION_STEP`, `B12: … 10:11:00 → 422`, `F4: title 101 символ → 422`, `B8: … запрос нарушает правила → 422` |
| M2 | PATCH без `editingId`: `validationFailure(merged, id)` → `validationFailure(merged)` | `handlers.ts` `4faa5f60d09f` → `40a745d95500` → `4faa5f60d09f` | 13 из 146 | `B7: {start: 09:30, end: 10:30} внутри своего интервала → 200 (нет самоконфликта)`, `B7: пустое тело → 200 без изменений` |
| M3 | Заголовок конфликта без флага: `devToolsEnabled() && request.headers.get(…)` → `request.headers.get(…)` | `dev-tools.ts` `9fe7378e9956` → `6ec13bb7e8a0` → `9fe7378e9956` | 5 из 146 | `B8: ENABLE_DEV_TOOLS {не задан, false, 1, yes, True} → X-Mock-Force-Conflict игнорируется, 201` |
| M4 | «Чужая» бронь при PATCH без проверки самопересечения: `own !== undefined && bookingsOverlap(foreign, own)` → `false` | `handlers.ts` `4faa5f60d09f` → `6dd98ac5628f` → `4faa5f60d09f` | 1 из 146 | `B8: … PATCH 10:00–11:00 → {end: 10:30} … → 409 без «чужой» брони в store (Q21)` |

M1 закрывает и мутацию из DoD plan.md («удалить серверную проверку прошедшего времени»): падают `B6`/`B12`-тесты 422 (`START_IN_PAST`, `DATE_IN_PAST`).

### Проверки правил

```
grep -rn 'Date\.now' src                       → пусто
grep -rnE 'new Date\(\s*\)' src                → src/server/clock.ts:8 (файл-часы)
grep -rnE '(vi|jest)\.(mock|doMock)\(' src     → пусто
grep -rnE '\.(skip|only|todo)\(|\b(xit|fit)\(' src → пусто
grep -rnE '@ts-(ignore|expect-error)|: any\b|as any\b|eslint-disable' src → пусто
```

`route.ts`: 7 и 11 строк, единственный импорт — `@/server/handlers`, логики нет (lint-граница `src/app/api/**` разрешает только `src/server` и `src/domain`).

## Допущения для README

- **Dev-конфликт (B8, Q21, Q25).** С `ENABLE_DEV_TOOLS=true` заголовок `X-Mock-Force-Conflict: 1` в POST/PATCH: если запрос иначе прошёл бы, сервер кладёт в store «чужую» бронь на запрошенный интервал и отвечает 409 с `conflictWith` = этой бронью. Исключение — PATCH, где запрошенный интервал пересекает исходный интервал самой брони: «чужая» бронь в store не кладётся (store без пересечений), `conflictWith` — бронь на запрошенном интервале с новым `id`, которой нет в списке.
- **Флаги.** `ENABLE_DEV_TOOLS` включается только строкой `true`; иначе `X-Mock-Force-Conflict` и `X-Mock-Delay` игнорируются. `X-Mock-Delay` ограничен 10 000 мс. Задержка по умолчанию 300–800 мс, `DISABLE_MOCK_DELAY=true` её отключает.
- **Store** живёт в памяти процесса на `globalThis`: переживает HMR, но сбрасывается при перезапуске и на serverless может отличаться между экземплярами (Q9).
- **Порядок ошибок**: 404 → 400 → 422 → 409; у начавшейся брони битый формат даёт 400, а не `BOOKING_LOCKED` (Q23).

## Чек-лист stage-gate

| Пункт | Доказательство |
|-------|----------------|
| ☑ Команда на этап была | Первая строка трейса — цитата команды; команды шагов 1–2, решений D1–D4 и шага 5 — тоже цитатами |
| ☑ Gate зелёный | Раздел «Gate»: код 0, `333` (UTC), `190` (LA), `next build` ok. Pre-commit-хук запускает gate ещё раз |
| ☑ Красный прогон был | «Красный прогон» и «Красный прогон после решений Q21–Q24»: 146 failed, все — «Не реализовано» |
| ☑ Трейс заполнен | План, ID, файлы, список тестов, таблица статусов, gate, curl, мутации, отклонения |
| ☑ Время записано | `docs/time-log.md`, строка 2: старт и конец — вывод `date`, факт — разность |
| ☑ Требования сверены | Таблица «ID → число тестов»: B1–B12, F2, F4–F6, U1, U3, U4, D3 — у каждого есть тесты. B9 на сервере — 2 теста, U3 на сервере — 1 (формат тела), остальное в U3 — уровень ui (этапы 3–6) |
| ☑ нет `.skip`/`.only`/`xit`/`it.todo` | grep пусто, `policy-check` ok |
| ☑ нет `@ts-ignore`/`any`/`eslint-disable` | grep пусто |
| ☑ тесты не ослаблены | 187 → 333; после шага 2 тесты не менялись (`git diff` тестов нет — файлы новые, изменения в них только до реализации: +8 тестов по Q21/Q24, ожидания не менялись) |
| ☑ бизнес-правила в `src/domain` | Сервер вызывает `validateBooking`, `isBookingLocked`, `normalizeTitle`, `bookingsOverlap`; M1/M2 показывают, что без вызова domain тесты падают |
| ☑ `Date.now`/`new Date()` только в файлах-часах | grep: только `src/server/clock.ts:8` |
| ☑ domain не мокается | grep `vi.mock` пусто |
| ☑ компоненты не импортируют `src/api` | Компонентов ещё нет; lint-правило в gate |
| ☑ зависимости | Новых нет, `package.json` не менялся |
| ☑ `.env*` не трогались | Изменён только `.env.example` (имена без значений, `policy-check` ok) |
| ☑ Инциденты | Нарушений правил и неожиданных поломок нет — `incidents.md` не менялся. Отклонения — ниже |
| ☑ INDEX.md | Строка этапа 2 → `stage-2.md` |
| ☑ После коммита и push — СТОП | Коммит `cb91d28 stage 2: mock api (gate green)` в `origin/main` (`git push`: `c478544..cb91d28  main -> main`, `git status -sb` → `## main...origin/main`). Отмечено в коммите 2b |

## Отклонения от плана

| # | Что | Почему / последствия |
|---|-----|----------------------|
| O1 | `src/server/clock.ts` написан полностью до реализации | Это механизм подмены часов в тестах (инфраструктура запуска тестов), бизнес-логики в нём нет |
| O2 | Первый прогон дал 138 failed и `9 errors`: помощник `track` в тестах задержки не обрабатывал отклонение промиса заглушки (unhandled rejection) | Исправлено до показа заказчику: `track` пробрасывает ошибку обработчика в тест. Ожидания не менялись |
| O3 | В тесте Q21 `conflictWith` — «чужая» бронь на запрошенном интервале с новым `id`, которой нет в store | Q21 не говорил, что класть в `conflictWith`. **Подтверждено заказчиком (Q25)**, см. «Допущения для README» |
| O4 | В `src/domain/rules.ts` добавлены `normalizeTitle`, `bookingsOverlap` и экспорт `MESSAGES`. **Долг закрыт в 2b** (unit-тесты, см. ниже) | Trim `title` (Q6) и пересечение двух броней (Q21) — бизнес-правила, их место в domain (AGENTS.md). Своих unit-тестов у новых функций нет: они покрыты api-тестами (F4 title, Q21), на которых M4 и тесты F4 падают. Существующие функции и тесты domain не менялись |
| O5 | Добавлен `.claude/launch.json` | Нужен для запуска dev-сервера через preview для curl-проверок; две конфигурации — с флагом и без. Серверы запускались по очереди: два `next dev` в одном каталоге делят `.next` |
| O6 | Прогон `TZ=America/Los_Angeles` — 190 тестов, а не 333 | Состав gate (testing.md, правило 7.5): во втором поясе — только domain и `*.tz.test`. Пояс-зависимые серверные тесты вынесены в `handlers.tz.test.ts` |

## 2b: долг O4

### Команда заказчика

> Закрой долг O4: добавь unit-тесты в src/domain для normalizeTitle (пробелы по краям,
> пустая строка, строка из пробелов, ровно 100 символов, 101), bookingsOverlap
> (касание, вложение, равные интервалы, разные даты) и проверку, что у каждого кода
> ошибки есть сообщение в MESSAGES. Тест сначала красный по существу: покажи падение
> при мутации (убери trim, замени < на <=), затем зелёный. Затем добавь в AGENTS.md
> правило «Не добавляй файлы и функции сверх задания; если нужны, предложи и жди
> одобрения» и проверь, можно ли это проверять автоматически (например, список
> разрешённых корневых файлов в policy-check). Предложи, не внося автоматическую
> проверку без одобрения. Закрой пункт «После коммита и push» этапа 2 в коммите.
> date, запись в time-log отдельной строкой «2b: долг O4», коммит
> "stage 2b: domain unit tests for helpers (gate green)", push. СТОП.

Старт: `2026-10-08 21:18:22 +0600` (строка `2b: долг O4` в `docs/time-log.md`).

### Тесты (`src/domain/rules.test.ts`, +26)

Новых файлов нет — три `describe` в существующем `rules.test.ts`.

| describe | Тесты | ID |
|----------|-------|----|
| `F4: normalizeTitle (Q6)` | пробелы по краям; пробелы внутри сохраняются; `""` → нет; `"   "` → нет; `undefined` → нет; ровно 100 (с пробелами по краям) — без изменений, `validateBooking` принимает; 101 — не обрезается, `validateBooking` → `TITLE_TOO_LONG` | F4 (7) |
| `B5: bookingsOverlap` | касание справа/слева → false; вложение, накрывает, равные, частичное → true; равные на разных датах → false. Каждый случай проверяется в обе стороны (`a, b` и `b, a`) | B5 (7) |
| `U3: у каждого кода ошибки есть сообщение в MESSAGES` | список кодов полный (проверка типом: `Exclude<ValidationErrorCode, …> extends never`); для каждого из 11 кодов — сообщение на русском (`INVALID_REQUEST` → `INVALID_DATE` и `INVALID_TIME`) | U3 (12) |

Число тестов: 333 → 359 (`rules.test.ts` 85 → 111). В прогоне `TZ=America/Los_Angeles`: 190 → 216.

### Красный по существу (мутации)

Функции уже реализованы на этапе 2, поэтому новые тесты сразу зелёные; что они ловят ошибки, показано мутациями. Откат — копией/`git checkout`, сверка `sha256`.

| # | Мутация | sha до → мутант → после отката | Упало |
|---|---------|-------------------------------|-------|
| M5 | `normalizeTitle` без trim: `title?.trim()` → `title` | `rules.ts` `439efb56aa44` → `41250a8ad586` → `439efb56aa44` | 8 из 359: 4 новых unit (`F4: пробелы по краям`, `пробелы внутри сохраняются`, `строка из пробелов`, `ровно 100 символов`) + 4 api (`F4: title «  Демо  »…`, `F4: title "   "…`, `F4: title 100 символов с пробелами…`, `B7: {title: «  Ретро  »}…`) |
| M6 | `overlaps`: `<` → `<=` (`overlap.ts`) | `overlap.ts` `b89b898e371b` → `c453e9dc26a5` → `b89b898e371b` | в `rules.test.ts` 3 из 111: `B5: касание справа`, `B5: касание слева` (новые) и `B6: старт 10:40 после брони 10:10–10:40`; во всём наборе 17 из 359 |
| M7 | из списка кодов в тесте убран `OVERLAP` | `rules.test.ts` `9a3d1ec528a3` → `e790c9a6cd4a` → `9a3d1ec528a3` | `tsc`: `rules.test.ts(367,9): error TS2322: Type 'true' is not assignable to type 'false'` — новый код ошибки без сообщения не пройдёт gate |

После откатов: `Tests 359 passed (359)`.

Первая попытка M6 не применилась: строка `a.start < b.end && b.start < a.end` есть и в коде, и в комментарии, скрипт мутации требует ровно одно вхождение — повторено по строке `return …`. После M6 исправлен порядок параметров в `it.each` для `bookingsOverlap`: название выводило объект вместо ожидаемого `true/false` (ожидания не менялись).

### Правило «сверх задания»

В `AGENTS.md` («Нельзя») добавлено: «Добавлять файлы и функции сверх задания. Если они нужны — предложить (что и зачем) и ждать одобрения заказчика». В `docs/testing.md` — строка «Пока не автоматизировано», ссылка на это предложение.

**Можно ли проверять автоматически — предложение (не внедрено, ждёт одобрения):**

| # | Проверка в `policy-check` | Что ловит | Чего не ловит | Пример из истории |
|---|----------------------------|-----------|---------------|-------------------|
| P1 | Allowlist корневых записей `git ls-files`: `.claude/settings.json` (поэлементно внутри `.claude/`), `.env.example`, `.githooks`, `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs`, `eslint.config.mjs`, `next.config.ts`, `package-lock.json`, `package.json`, `scripts`, `src`, `tsconfig.json`, `vitest.config.ts`. Новая запись → FAIL, пока её не добавят в allowlist (= явное одобрение в diff) | новые конфиги, служебные файлы в корне и в `.claude/` | файлы внутри `src`, `docs` | `.claude/launch.json` (O5) — сейчас пришлось бы внести в allowlist |
| P2 | Allowlist каталогов `src/*`: `app`, `domain`, `server`, `api`, `features`, `components` (слои из architecture.md) | новый слой/каталог вне архитектуры | файлы внутри слоя | — |
| P3 | Каждый `export function`/`export const` из `src/domain/*.ts` упоминается хотя бы в одном `src/domain/*.test.ts` | непротестированные функции domain | экспорты вне domain, «лишнюю» но протестированную функцию | O4: `normalizeTitle`, `bookingsOverlap` не прошли бы gate этапа 2 |
| P4 | Хук `pre-commit`: каждый добавленный файл коммита (`git diff --cached --name-status`, статус `A`) упомянут в трейсе этапа, изменённом в том же коммите (`docs/traces/stage-*.md`) | незаявленные новые файлы в любом каталоге | новые функции в существующих файлах; «сверх задания» по смыслу | все файлы этапа 2 были в таблице «Файлы», кроме `.claude/launch.json` до записи O5 |

Полностью «сверх задания» автоматически не проверить: это сравнение с текстом команды. Автоматика может только заставить **явно заявить** новый файл/экспорт (P1, P2, P4) и покрыть его тестом (P3); решение остаётся за ревью. Рекомендация: **P1 + P3 + P4** (P2 почти бесполезен при P4). Каждая — правило в `policy-check` без новых зависимостей и негативная проба (как на этапе 1).
