# Этап 8. Независимое ревью

## Команда заказчика

> Ты независимый ревьюер, код писал другой агент. Прочитай AGENTS.md, docs/tz.md,
> docs/requirements.md, docs/testing.md, docs/architecture.md, docs/security.md,
> docs/checklists/pre-delivery.md, docs/traces/incidents.md. Код не правь, только
> анализируй. Выполни date, запиши старт этапа 8 в docs/time-log.md.
> 1. Таблица: ID … -> файл реализации -> тест -> результат проверки. …
> 2. Сверь реализацию с docs/tz.md напрямую …
> 3. Найди: тесты без смысла …; нарушения AGENTS.md и testing.md …; дублирование бизнес-правил …;
>    типичные ошибки агента из testing.md, не покрытые тестами; расхождения между заметками в трейсах и кодом.
> 4. Запусти npm run gate, grep …
> 5. Проверь процесс …
> 6. Каждая находка: blocker / major / minor, нарушенное правило, файл и строка.
> Сохрани отчёт в docs/traces/review.md. Код не правь. Коммит только отчёта и
> time-log: "stage 8: independent review". СТОП.

Ревью по `HEAD = c08d4db` (`stage 7e`). Код не менялся. Мутации выполнялись в отдельной копии
(`git archive HEAD` в scratchpad), рабочий каталог не трогался.

Отклонения от `docs/plan.md` (этап 8) по команде заказчика: находки не исправляются и красные тесты на них
не пишутся (план требует «красный тест, потом исправление»). Сообщение коммита — из команды, без «(gate green)»
из шага 9 AGENTS.md. Pre-commit хук всё равно запускает gate.

## Сводка

| Серьёзность | Кол-во | Коротко |
|-------------|--------|---------|
| blocker | 3 | Для сдачи (этап 9): README-заготовка, нет ссылки на демо, нет переписки. **В коде blocker'ов нет** |
| major | 3 | Seed со случайными id на serverless-демо; файлы и функции сверх плана без одобрения и без инцидента; данные прошлой даты активны при загрузке новой |
| minor | 17 | Тексты и мелкое дублирование, слабые `expect`, устаревшие документы, статусы инцидентов, «сейчас» не обновляется |

Gate зелёный: 556 тестов в `TZ=UTC`, 249 в `TZ=America/Los_Angeles`, build ok. Запрещённых конструкций нет.
Все 8 выборочных мутаций пойманы. Все бизнес-правила ТЗ 1–8 реализованы на сервере и в UI.

## 4. Gate и поиск запрещённого

```
=== gate: ЗЕЛЁНЫЙ ===
ok   tsc --noEmit
ok   eslint
ok   policy-check
ok   тесты, TZ=UTC — тестов: 556 (passed 556, failed 0)
ok   тесты domain и *.tz.test, TZ=America/Los_Angeles — тестов: 249 (passed 249, failed 0)
ok   next build
```

| Поиск (по `src`, `scripts`, конфигам) | Результат |
|---------------------------------------|-----------|
| `\.(skip\|only\|todo)\(`, `\b(xit\|xdescribe\|fit\|fdescribe)\(` | пусто |
| `@ts-(ignore\|expect-error\|nocheck)` | только текст проверки в `scripts/policy-check.mjs:187,192` |
| `: any`, `as any`, `<any>`, `any[]` | пусто |
| `eslint-disable` | только в `policy-check.mjs` (сама проверка) и комментарий `eslint.config.mjs:66` |
| `window.confirm` / `confirm(` | только тест `delete-booking.test.tsx:84-92`, который проверяет, что `confirm` **не** вызывается |
| `Date.now(`, `new Date()` без аргумента | только файлы-часы `src/features/clock.ts:9`, `src/server/clock.ts:8` |
| `vi.mock`/`jest.mock` по domain | пусто (`vi.spyOn` только на `FakeBookingsApi` и `window.confirm`) |
| `toISOString`, `getTimezoneOffset`, `getHours` | только комментарий `time.ts:1` и проверка предусловия в `room-now.tz.test.ts:20-21` |

## Выборочные мутации (plan.md, этап 8)

Копия `git archive HEAD`, `TZ=UTC vitest run`, после каждой мутации файл восстанавливался. Базовая линия: `0 failed / 556`.

| # | Мутация | Результат | Первый упавший тест |
|---|---------|-----------|---------------------|
| Ma | B11: `start <= now.minutes` → `<` (`rules.ts`) | 7 failed | `B11: начинается сейчас: сегодня 10:10–10:40 → PATCH 422 BOOKING_LOCKED` |
| Mb | B1: `minutes > WORKDAY_END` → `>=` | 11 failed | `B10: старт 16:00 → до 18:00 включительно` |
| Mc | F4: длина `title` без `trim()` | 1 failed | `F4: title " а…а " → принято: true` |
| Md | B8: убран перезапрос после 409 в `useUpdateBooking` | 2 failed | `B8, Q7: 409 при правке → … перезапрос list` |
| Me | Q24: флаг — любое значение, а не `"true"` | 8 failed | `B8: ENABLE_DEV_TOOLS false → X-Mock-Force-Conflict игнорируется` |
| Mf | F3: убрана подсказка-минимум начала | 3 failed | `F3, B6: подсказка-минимум начала: сегодня в 10:10 → 10:10` |
| Mg | B11: сервер не проверяет `DELETE` начавшейся брони | 4 failed | `B11: идёт: сегодня 10:00–10:30 → DELETE 422` |
| Mh | B11 UI: все брони редактируемы (`locked: false`) | 7 failed | `B11: начавшаяся бронь открывается только для чтения` |

Обязательные мутации testing.md (9 штук) выполнены по этапам 1–6, таблицы есть в трейсах (`stage-1.md:435-440` и др.).

## 1. Трассировка ID → код → тест

Число в скобках — тесты с этим ID в названии.

| ID | Реализация | Тесты | Результат |
|----|------------|-------|-----------|
| B1 | `domain/rules.ts` (`validateBooking`, B1), `domain/constants.ts` | `rules.test.ts` (6), `time.test.ts` (6), `end-options.test.ts` (3), `handlers.test.ts:148-230` (400 на формат, 422, суббота), `booking-form.test.tsx` (4) | ✅ мутация Mb поймана |
| B2 | `rules.ts` (`duration <= 0`) | `rules.test.ts` (5), `handlers.test.ts:231-242`, `booking-form.test.tsx` (1) | ✅ |
| B3 | `rules.ts` | `rules.test.ts` (2), `handlers.test.ts:244-252`, ui (1) | ✅ |
| B4 | `rules.ts` | `rules.test.ts` (2), `handlers.test.ts:254-265` (порядок B4 → B10), ui (1) | ✅ |
| B5 | `domain/overlap.ts`, `rules.ts` (`overlapsBooking`) | `overlap.test.ts` (4 + it.each «B5, T3»), `rules.test.ts` (3), `handlers.test.ts:327-361` (все 8 случаев, `conflictWith`), ui (2) | ✅ |
| B6 | `rules.ts` (`DATE_IN_PAST`, `START_IN_PAST`), `domain/day.ts`, `day-view.tsx` (кнопка `disabled`), `use-booking-form.ts` (`unavailableNote`) | `rules.test.ts` (12), `end-options.test.ts` (6), `handlers.test.ts:284-305`, `day-view.test.tsx` (3), `booking-form.test.tsx` (7) | ✅ |
| B7 | `rules.ts` (`b.id !== editingId`), `server/handlers.ts` (склейка PATCH) | `handlers.test.ts:363-453` (13), `overlap.test.ts` (5), `end-options.test.ts` (5), ui (2) | ✅ |
| B8 | `server/handlers.ts` (`forcedConflict`), `server/dev-tools.ts`, `features/bookings/hooks.ts` (инвалидация после 409), `use-booking-form.ts`, `present-api-error.ts` | `dev-tools.test.ts` (7), `booking-form-errors.test.tsx` (5, T6/T7), `hooks.test.tsx` (3), `present-api-error.test.ts` (4), `dev-panel.test.tsx` (5), `http-bookings-api.test.ts` (2) | ✅ мутации Md, Me пойманы. На демо — риск, см. **J2** |
| B9 | `domain/time.ts` (`getRoomNow`), `server/clock.ts`, `features/clock.ts`, lint `RESTRICTED_NOW` | `room-now.tz.test.ts` (Europe/Moscow), `handlers.tz.test.ts` (сервер в UTC), `time.test.ts` (6), `rules.test.ts` (4), `day-view.test.tsx` (2); gate гоняет domain в двух поясах | ✅ |
| B10 | `rules.ts` (`DURATION_STEP`), `domain/end-options.ts`, `booking-form.tsx` (`select`) | `end-options.test.ts` (14), `rules.test.ts` (5), `handlers.test.ts:267-282`, `booking-form.test.tsx` (5) | ✅ |
| B11 | `rules.ts` (`isBookingLocked`), `handlers.ts` (DELETE), `day-grid.tsx`, `use-booking-form.ts` (`readOnlyNote`) | `handlers.test.ts:518-575` (7), `rules.test.ts` (7), `day-view.test.tsx` (it.each, 4 случая), `booking-form.test.tsx` (4), `delete-booking.test.tsx` (2) | ✅ мутации Ma, Mg, Mh пойманы |
| B12 | `rules.ts` (`start < now.minutes`, `RoomNow.minutes = floor`), `use-booking-form.ts` (проверка при отправке) | `rules.test.ts` (4), `end-options.test.ts` (3), `handlers.test.ts:307-318`, `booking-form.test.tsx:301,462` (граница минуты, 422 от сервера) | ✅ |
| F1 | `day-view.tsx`, `date-nav.tsx`, `app/page.tsx`, `hooks.ts` (`useDayBookings`) | `day-view.test.tsx` (11, включая гонку T9), `hooks.test.tsx` (3) | ✅ см. **J3** |
| F2 | `server/store.ts` (`listByDate`), `seed.ts`, `day-grid.tsx` | `handlers.test.ts:45-99` (7), `handlers.tz.test.ts` (1), `day-view.test.tsx` (2) | ✅ слабые `expect` для seed — **m7** |
| F3 | `use-booking-form.ts` (`startMin`, сброс конца), `booking-form.tsx` | `booking-form.test.tsx` (6), `a11y.test.tsx` (2) | ✅ мутация Mf поймана |
| F4 | `handlers.ts` (`handleCreateBooking`), `rules.ts` (`normalizeTitle`, `TITLE_TOO_LONG`), форма | `handlers.test.ts` (14), `rules.test.ts` (6), `booking-form.test.tsx` (8), `hooks.test.tsx` (2) | ✅ см. **m1** |
| F5 | `handlers.ts` (`handleUpdateBooking`), `use-booking-form.ts` (PATCH изменённых полей, 404 → новая бронь) | `handlers.test.ts:455-492` (5), `booking-form.test.tsx` (7), `booking-form-errors.test.tsx` (1), `hooks.test.tsx` (3) | ✅ |
| F6 | `handlers.ts` (`handleDeleteBooking`), `day-view.tsx` (`confirmDelete`), `delete-booking-dialog.tsx` | `handlers.test.ts:494-516` (3), `delete-booking.test.tsx` (9), `hooks.test.tsx` (3), `a11y.test.tsx` (2) | ✅ см. **m12** |
| U1 | `day-loading.tsx` (`role="status"`), `day-view.tsx` (`aria-busy`, индикатор) | `day-view.test.tsx` (2), `a11y.test.tsx` (1) | ✅ |
| U2 | `day-empty.tsx` | `day-view.test.tsx` (3), ui (1) | ✅ |
| U3 | `api/http-bookings-api.ts`, `api/errors.ts`, `present-api-error.ts`, `day-error.tsx` | `http-bookings-api.test.ts` (9), `present-api-error.test.ts` (9), `booking-form-errors.test.tsx` (5), `day-view.test.tsx` (2) и др. | ✅ |
| U4 | `use-booking-form.ts` (`submitting` ref, `pending`), `booking-form.tsx` («Сохраняем…»), `server/dev-tools.ts` (`X-Mock-Delay`) | `booking-form.test.tsx` (2, T8), `dev-tools.test.ts` (6), `dev-panel.test.tsx` (2), `delete-booking.test.tsx` (2) | ✅ |
| S1 | `eslint.config.mjs` (`no-restricted-imports`, `no-restricted-globals: fetch`, литералы времени и числа правил) | теста с ID нет — проверка шагом lint в gate. Намеренные нарушения — в трейсах этапов 1, 3, 5b | ✅ (lint) |
| S2 | `api/bookings-api.ts` (интерфейс), `bookings/api-context.tsx`, `app-providers.tsx`, `NEXT_PUBLIC_API_URL` | `http-bookings-api.test.ts` (3), `hooks.test.tsx` (2); все ui-тесты работают с `FakeBookingsApi` | ⚠ раздела README о замене API нет (этап 9) |
| S3 | `tsconfig.json` (`strict`, `noUncheckedIndexedAccess`), `eslint.config.mjs` (`no-explicit-any`, `ban-ts-comment`), `policy-check` (`eslint-disable -- причина`) | шаги tsc, lint, policy-check в gate | ✅ |
| A1 | `globals.css` | **manual:** `stage-7.md:39` (`scrollWidth` = `clientWidth` на 320/768/1280, также с открытой формой); телефоны заказчика (7e) | ✅ manual |
| A2 | Radix Dialog/AlertDialog, `aria-*` в `booking-form.tsx`, `globals.css` (фокус, 44 px, reduced motion) | `a11y.test.tsx` (13, jest-axe), `booking-form.test.tsx` (6), `delete-booking.test.tsx` (4); Lighthouse 100 (замер заказчика, 7e) | ⚠ фокус уходит на `body` при удалении (**m12**), reduced motion не эмулировался (INC-8 открыт) |
| D1 | `origin` = `github.com/intellegento/MeetingRoomReservationInterface_MDTestTask`, `origin/main` содержит HEAD | — | ⚠ публичность не проверялась (нет доступа к сети без авторизации) |
| D2 | `README.md` — заготовка «_README в разработке._» | — | ❌ **J-B1** |
| D3 | ссылки на демо нет | — | ❌ **J-B2**; риск **J2** |
| D4 | каталога `docs/traces/chats/` нет; проверка секретов для него есть в `policy-check` | — | ❌ **J-B3** |
| **Q2** (длительность кратна 30, старт любой минуты) | `rules.ts` (`DURATION_STEP`), `end-options.ts` (start + 30/60/90/120), `<input type="time">` + `<select>` | `handlers.test.ts:267-282` (`10:10–10:40` → 201, `10:10–10:50` → 422), `end-options.test.ts` (14), `booking-form.test.tsx` (B10, 5) | ✅ Строже ТЗ — см. **m-Т1** |
| **Q4** (нельзя править и удалять начавшиеся) | `isBookingLocked` (`rules.ts`), сервер PATCH (через `validateBooking`) и DELETE, UI: нет кнопок, форма только для чтения | `handlers.test.ts` B11 (7), `rules.test.ts` (7), `day-view.test.tsx`, `booking-form.test.tsx` (4), `delete-booking.test.tsx` (2) | ✅ мутации Ma, Mg, Mh. Расширение ТЗ — см. **m-Т1** |
| **Q8** (dev-панель и заголовки) | `server/dev-tools.ts` (`ENABLE_DEV_TOOLS === "true"`, `X-Mock-*`, предел 10 000), `features/day-view/dev-tools.ts`, `components/dev-panel/dev-panel.tsx` | `dev-tools.test.ts` (B8 7, U4 6), `dev-panel.test.tsx` (Q8 6), `http-bookings-api.test.ts` (2) | ✅ мутация Me |
| **Q1** (пояс комнаты) | `ROOM_TIMEZONE` (`constants.ts`), `getRoomNow` (`time.ts`), два файла-часов, lint | `room-now.tz.test.ts`, `handlers.tz.test.ts`, `time.test.ts`, повтор в `TZ=America/Los_Angeles` в gate | ✅ |

Требования без кода: D2, D3, D4 (этап 9). Требования без автотеста: S1, S3 (проверяются шагами gate), A1, D1–D4 (manual).
Типичные ошибки T1–T10 из testing.md покрыты тестами с этими ID: T1 `time.test.ts`, `room-now.tz.test.ts`; T2 lint и `rules.test.ts`;
T3 `overlap.test.ts:22`; T4; T5 `time.test.ts`; T6, T7 `booking-form-errors.test.tsx`; T8 `booking-form.test.tsx`; T9 `day-view.test.tsx`;
T10 `handlers.test.ts:209`.

## 2. Сверка с docs/tz.md

| Пункт ТЗ | Реализация | Вывод |
|----------|------------|-------|
| Правило 1, рабочий день 09:00–18:00 | `validateBooking` (B1): сервер 422, UI — варианты конца ≤ 18:00 | ✅ |
| Правило 2, `start < end` | B2 | ✅ |
| Правила 3, 4: 30 мин – 2 ч | B3, B4 | ✅ Плюс Q2: кратность 30 — **строже ТЗ**, см. **m-Т1** |
| Правило 5, нет пересечений, касание допустимо | `overlaps` по `[s,e)`, 409 + `conflictWith` | ✅ |
| Правило 6: прошедшее время | сегодня: `START_IN_PAST`, `min` у поля, полоса «Прошедшее время»; прошедшая дата: «Новая бронь» `disabled` с пояснением, сервер `DATE_IN_PAST` | ✅ ТЗ запрещает только **создание** на прошедшие даты; запрет правки и удаления — решения Q4, Q13 (**m-Т1**) |
| Правило 7, нет самоконфликта | `editingId` в `validateBooking` и `getEndOptions` | ✅ |
| Правило 8: конфликт от сервера — сообщение, обновление списка, данные формы | 409 → баннер `role="alert"` с фокусом, `invalidate` даты формы, форма не закрывается, поля помечены | ✅ На serverless-демо перезапрос может уйти в другой инстанс (**J2**) |
| «Корректные состояния UI: загрузка, пусто, ошибка, отправка» | U1–U4 | ✅ При смене даты прежний список активен — **J3** |
| «Обработка серверных ошибок» | `presentApiError`, 400/404/409/422/5xx/NETWORK/PARSE | ✅ |
| «Разделение слоя API и UI», «легко заменяем» | `BookingsApi` + контекст, lint-границы, `NEXT_PUBLIC_API_URL` | ✅ |
| «Читаемый TypeScript» | strict, `noUncheckedIndexedAccess`, без `any` | ✅ |
| «Адаптивность и базовая доступность» | 320–1280, axe, Lighthouse 100 | ✅ с замечаниями **m12**, INC-8 |
| Контракт `GET/POST/PATCH/DELETE`, `Booking` | совпадает, `title?` опционален | ✅ |
| «Сервер валидирует бизнес-правила и умеет 409» | все правила через `src/domain`, 409 только для пересечения | ✅ |
| «Что сдать»: репозиторий | `origin/main` = HEAD | ⚠ публичность не проверена |
| «Что сдать»: README (запуск, сделано, не сделано, время) | заготовка | ❌ **J-B1** |
| «Что сдать»: deployed demo | нет | ❌ **J-B2** |
| «Что сдать»: чат-переписка | нет | ❌ **J-B3** |
| Таймбокс 4–6 ч | `time-log`: сумма фактов 3:09:32 + строка `0b` «не измерен»; по часам 19:33:50 → 23:45:14 = 4:11:24 | ✅ в таймбоксе; в README нужно объяснить, какое число указано (**m15**) |

## 3, 5, 6. Находки

### Blocker (сдача, этап 9)

| ID | Находка | Правило | Файл:строка |
|----|---------|---------|-------------|
| J-B1 | README — заготовка: нет «Как запустить», «Что сделано», «Что не сделано», времени, предупреждения о serverless (Q9), горизонта (Q14), инструкции dev-панели (Q8), замены API (S2). Заметки для README разбросаны по трейсам (`stage-2.md` «Допущения для README», `stage-4.md` «4b», `stage-6.md` «Для README», `stage-7.md` «7e») | ТЗ «Что сдать»; D2, S2; pre-delivery «README заполнен» | `README.md:5` |
| J-B2 | Нет ссылки на deployed demo, флаги на демо не описаны | ТЗ «Что сдать»; D3 | `README.md` |
| J-B3 | Нет `docs/traces/chats/`; `INDEX.md` обещает «появится на этапе 9» | ТЗ «Что сдать»; D4, Q18 | `docs/traces/INDEX.md:16` |

### Major

| ID | Находка | Правило | Файл:строка |
|----|---------|---------|-------------|
| J2 | **Seed со случайными id на serverless.** `crypto.randomUUID()` генерирует id seed-броней в каждом инстансе. На Vercel разные запросы могут попасть в разные инстансы. Тогда `PATCH`/`DELETE` брони из списка инстанса A уходит в инстанс B → 404 → «Бронь уже удалена» / «Бронь была удалена», а после перезапроса та же бронь снова видна (у B свой seed). То же для B8: «чужая» бронь из `X-Mock-Force-Conflict` лежит в одном инстансе, перезапрос списка может уйти в другой — п. 3 сценария B8 («в списке видна чужая») на демо не гарантирован. Q9 принимает сброс состояния, но не расхождение id между инстансами. Тестов на это нет (manual). Варианты: детерминированные id seed (например, `seed-<дата>-<n>`), проверка B8 на демо по pre-delivery, явное описание в README | D3, B8 (ТЗ правило 8), Q9 | `src/server/store.ts:27`, `src/server/handlers.ts:34-36` |
| J1 | **Файлы и функции сверх плана без предварительного одобрения и без инцидента.** Этап 6: `src/features/day-view/dev-tools.ts` и `isRetryable` записаны только как «Отклонения от плана», одобрения до добавления нет. В stage-gate этапа 6 стоит «☑ Инциденты: нарушений правил … нет». Так же: этап 2 — `normalizeTitle`, `bookingsOverlap` без своих тестов (закрыто в 2b, но без инцидента); этап 1 — инфраструктура «вышла за минимум» (time-log, строка 1). AGENTS.md требует предложить и ждать одобрения, а любое отклонение записать в `incidents.md` | AGENTS.md «Нельзя: Добавлять файлы и функции сверх задания»; AGENTS.md «Инциденты»; stage-gate «Инциденты» | `docs/traces/stage-6.md:507-508`, `docs/traces/stage-6.md:541`, `docs/traces/stage-2.md` («Отклонения»), `docs/time-log.md` (строки 1, 2) |
| J3 | **При смене даты прежний список остаётся интерактивным.** `placeholderData: keepPreviousData`: пока грузится новая дата, сетка показывает брони прежней даты с активными «Изменить»/«Удалить» под заголовком новой даты. На прошедшей дате, открытой с будущей, видны кнопки правки и удаления (действуют на будущую бронь — правило не нарушено, но экран противоречит баннеру «Прошедшая дата»). Форма, открытая в этот момент, получает брони чужой даты (`bookings={query.data ?? []}`): пересечения отфильтруются по дате, и варианты конца не учитывают брони новой даты до загрузки — решает сервер (409). `isPlaceholderData` не используется, теста нет | ТЗ «Корректные состояния UI: загрузка»; U1; F1 | `src/features/bookings/hooks.ts:45`, `src/features/day-view/day-view.tsx:139,153` |

### Minor

| ID | Находка | Правило | Файл:строка |
|----|---------|---------|-------------|
| m-Т1 | Отступления от формулировок ТЗ по решениям заказчика: кратность 30 (Q2) отклоняет длительности, которые ТЗ разрешает (например, 45 мин → 422 `DURATION_STEP`); запрет правки и удаления начавшихся (Q4) и только чтение прошедших дат (Q13) шире «создание недоступно». Это не баг (решения в `open-questions.md`), но в README их нужно назвать как отличия от ТЗ | ТЗ правила 3–4, 6; D2 | `src/domain/rules.ts:92`, `docs/open-questions.md` (Q2, Q4, Q13) |
| m1 | `maxLength={100}` считает сырую строку, правило Q6 — длину после `trim`. Нельзя ввести 100 символов с пробелами по краям, а клиентская ошибка «не длиннее 100» у поля недостижима вводом (ошибка у поля бывает только от сервера, тест `booking-form.test.tsx:432`). Счётчик показывает длину с пробелами | F4, Q6 | `src/components/booking-form/booking-form.tsx:220` |
| m2 | «Сейчас» клиента считается только при рендере, таймера нет: пока страница открыта, полоса «Прошедшее время», признак «началась» и «сегодня» после полуночи устаревают до следующего рендера. Сервер отвечает `BOOKING_LOCKED`/`START_IN_PAST`, и форма это обрабатывает. Теста на «время прошло при открытой странице» нет. Q1 разрешает клиентским часам быть подсказкой | B9, B11, Q1 | `src/features/day-view/day-view.tsx:35` |
| m3 | Два текста для одного правила B11: в сетке `LOCKED_NOTE` «Бронь уже началась — изменить нельзя», в форме `MESSAGES.BOOKING_LOCKED` «…началась или прошла — изменить её нельзя». Для броней прошедшей даты в сетке написано «уже началась» | ТЗ «понятное сообщение»; согласованность | `src/components/day-view/day-grid.tsx:23`, `src/domain/rules.ts:25` |
| m4 | Тексты ошибок формата на сервере повторены строками, а не взяты из `MESSAGES` domain | architecture.md: сообщения правил в domain («сервер берёт их отсюда же», `rules.ts:22`) | `src/server/request.ts:45`, `src/server/handlers.ts:42`, ср. `src/domain/rules.ts:26-27` (`MESSAGES` объявлен в `rules.ts:22`) |
| m5 | Мелкое дублирование вне domain (не бизнес-правила): формат «HH:mm–HH:mm «название»» — в `present-api-error.ts:21` и `day-view.tsx:165`; `isFormField` — в двух файлах с разными реализациями | читаемость | `src/features/bookings/present-api-error.ts:15,21`, `src/features/booking-form/use-booking-form.ts:22`, `src/features/day-view/day-view.tsx:165` |
| m6 | HTTP-клиент не проверяет форму успешного ответа (`parsed as T`): если реальный бэкенд вернёт на `GET` не массив, экран упадёт на `.length`/`.map`, а не покажет U3. Таймер таймаута снимается до чтения тела | S2 «легко заменяем на реальный API», U3 | `src/api/http-bookings-api.ts:64,75` |
| m7 | Слабые `expect`: seed проверяется как `length > 0` без дат и содержимого (`handlers.test.ts:84-85`, `handlers.tz.test.ts:35-36`), `listCallsFor(TODAY) > 0` (`day-view.test.tsx:273`), `message.length > 0` (`handlers.test.ts:323`). Частично компенсирует `handlers.test.ts:90` (seed проходит правила). `getBy…().toBeTruthy()` — не слабые: `getBy` сам бросает | testing.md правило 9 (конкретное ожидание) | см. файлы |
| m8 | Устаревшие документы: `testing.md:76` («хук пока запускает только policy-check», хотя `.githooks/pre-commit` запускает gate); `pre-delivery.md:18` «Сохранение…» (в коде и U4 «Сохраняем…»); `architecture.md:36` разрешает компонентам «типы и функции форматирования», а компоненты берут константы правил и `isValidDate` (`date-nav.tsx`, `grid-placement.ts`, `booking-form.tsx`); таблица трассировки `plan.md:236+` ссылается на несуществующие `bookings.api.test.ts`, `conflict.test.tsx` | расхождение заметок и кода | см. файлы |
| m9 | INC-9: предложение «ждёт одобрения» не обновлено, хотя одобрено и внесено в 7c (`pre-delivery.md`, `next.config.ts`); у INC-3 нет строки статуса (закрыт через INC-4/3b) | AGENTS.md «Инциденты»: разбор и итог | `docs/traces/incidents.md:92`, `docs/traces/incidents.md` (INC-3) |
| m10 | `INDEX.md` без строк 0b, 0c, 2b, 3b, 4b, 7b–7e (из подэтапов есть только 5b) | Q18 «docs/traces/ служит навигацией» | `docs/traces/INDEX.md` |
| m11 | Этап 7: красного прогона ui-тестов не было (10 тестов зелёные сразу). Записано в отклонениях, заказчик принял ручные замеры как красный прогон (решение 1) | testing.md правило 2 | `docs/traces/stage-7.md:304` |
| m12 | Во время удаления обе кнопки `disabled` → фокус уходит на `body` (открытый вопрос этапа 7, не решён). Та же картина у «Сохранить» — не проверялась | A2 | `src/components/delete-dialog/delete-booking-dialog.tsx:33-36`, `docs/traces/stage-7.md:311` |
| m13 | Lint на числа правил не покрывает `src/app` (в INC-7 предлагалось `src/features`, `src/components`, `src/app`; testing.md записал два слоя) | INC-7, «бизнес-правила только в domain» | `eslint.config.mjs` (блок `RESTRICTED_RULE_NUMBERS`) |
| m14 | `DEFAULT_TIMEOUT_MS = 15_000` связан с серверным `MOCK_DELAY_MAX_MS = 10_000` только комментарием: слои не знают друг о друге, рассинхрон не поймает ни один тест | S2, читаемость | `src/api/http-bookings-api.ts:7` |
| m15 | Время: сумма фактов 3:09:32 + не измеренная строка `0b`, по часам — 4:11:24 (паузы — проверки заказчика). README должен указать, какое число взято и почему (pre-delivery: «итог из time-log») | D2, AGENTS.md «Время» | `docs/time-log.md` |
| m16 | Сегодня после 17:30 «Новая бронь» и «Забронировать» активны, сообщение «На сегодня бронирование уже недоступно» видно только в открытом диалоге. Требование B6 выполнено, но можно сообщать раньше | B6 [ДОПУЩЕНИЕ: текст] | `src/features/day-view/day-view.tsx:109-117` |
| m17 | Сообщение коммита этапа 8 по команде заказчика — без «(gate green)» (шаг 9 AGENTS.md). Gate всё равно запускается хуком | AGENTS.md «Порядок работы», шаг 9 | — |

### Дублирование бизнес-правил вне `src/domain` и `src/server`

Не найдено. В `src/features` и `src/components` все проверки — вызовы `validateBooking`, `validateStart`,
`getEndOptions`, `getEarliestStart`, `isBookingLocked`, `getPastUntil`. Lint запрещает литералы
`09:00`/`18:00` и числа 30/100/120/540/1080 (мутация M4 этапа 5 поймана). Остались только тексты (m3, m4, m5)
и связь таймаутов (m14).

### Типичные ошибки агента, не покрытые тестами

T1–T10 покрыты (см. раздел 1). Не покрыты:
- Расхождение id seed между serverless-инстансами — J2.
- Интерактивные данные прошлой даты во время загрузки — J3.
- «Время прошло при открытой странице» (часы клиента без таймера) — m2.
- Пояс процесса для ui-тестов: в `TZ=America/Los_Angeles` повторяются только domain и `*.tz.test`. ui-слой вызывает те же `getRoomNow`, поэтому риск низкий.
- Два submit до перерисовки (M1a) — заказчик признал мутацию эквивалентной (INC-7).

### Расхождения между трейсами и кодом

Проверены выборочно: `INDEX.md` этап 7 (44 px, рамки `#767676`) — совпадает с `globals.css:13-16`; `stage-6.md`
«Для README» (медленная сеть не влияет на список, конфликт одноразовый) — совпадает с `dev-tools.ts` и
`takeSaveRequest`; INC-7 (lint на числа) — совпадает с `eslint.config.mjs`. Расхождения только в документах — m8, m9.

## 5. Процесс

| Проверка | Результат |
|----------|-----------|
| Трейс у каждого этапа | ✅ `stage-0.md` … `stage-7.md`; подэтапы 0b/0c — в `stage-0.md`, 2b, 3b, 4b, 5b, 7b–7e — разделами своих этапов. В `INDEX.md` подэтапы не все (m10) |
| Красный прогон в трейсах | ✅ этапы 1–6; этап 7 — по решению заказчика (m11) |
| Вывод gate в трейсах | ✅ этапы 1–7 |
| time-log без пропусков | ✅ 19 строк (до этапа 8), у всех формат `date`, факт = конец − старт (проверяет `policy-check`). Единственная строка без старта — `0b` (INC-2, известна). Каждый из 17 коммитов не раньше конца своей строки. 7b и 7c закоммичены вместе с 7d (`ddbc94e`) |
| Инциденты с разбором правила | ✅ INC-1, 2, 4, 6, 7 — причина и правило; INC-5, INC-7(а) — решение «эквивалентная мутация»; INC-8 открыт честно. ⚠ INC-9 и INC-3 без итогового статуса (m9). ⚠ Отклонения «сверх плана» не стали инцидентами (J1) |
| Секреты | ✅ В истории `git log -p --all` нет `gho_`, `ghp_`, `github_pat_`, `sk-…`, `xox?-`, `PRIVATE KEY`, `token=`/`secret=`/`password=` со значениями (только шаблоны в документах и `policy-check`). Из `.env*` в git когда-либо был только `.env.example`, в нём строки `ИМЯ=` без значений |
| IP в коммитах | ✅ LAN-IP заказчика заменён на `<LAN-IP>` (7d). В истории только пример `10.0.0.5` из таблицы разбора `ALLOWED_DEV_ORIGINS` (тестовое значение, не адрес заказчика). `.claude/launch.json` в git — без IP |
| Deny-правила | ✅ `.claude/settings.json` совпадает с `security.md` |
| Push | ✅ `origin/main` содержит `c08d4db` |
| pre-delivery | ☐ все пункты открыты — проходится на этапе 9 |

Вне git в корне есть каталог `.qodo/` (не отслеживается и не показан в `git status`: вероятно, глобальный
`.gitignore`). На сдачу не влияет. Содержимое не читалось.

## Рекомендации для этапа 9 (по приоритету)

1. README по D2 и S2 с отличиями от ТЗ (m-Т1), временем (m15), предупреждением Q9 и описанием J2.
2. Перед деплоем решить J2: детерминированные id seed или явная оговорка. На демо пройти сценарий B8 из pre-delivery.
3. Переписка в `docs/traces/chats/` с проверкой на секреты.
4. По желанию заказчика, каждое исправление через красный тест: J3 (`isPlaceholderData` → блокировать действия или скрывать прежний список), m1, m3, m4, m12.
5. Документы: m8, m9, m10; записать J1 инцидентом.
