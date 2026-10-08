# Stage 6 — трейс

## Команда заказчика

> Этап 6 по docs/plan.md, таймбокс 40 мин. Прочитай AGENTS.md, docs/architecture.md,
> docs/testing.md и строки F6, B8, U3, U4, A2 из docs/requirements.md, раздел «Решения»
> (Q4, Q7, Q8, Q11, Q15), допущения O3/Q25 про conflictWith и запись D4 про «Повторить».
> Выполни date в формате из AGENTS.md, запиши старт в time-log.
>
> Шаг 1. План в docs/traces/stage-6.md: цель, файлы, тесты (название + ID), «вывод
> ожидания» для тестов с временем и числами, и grep по тестам на все проверки
> элементов, поведение которых меняется (правило INC-6), с командой и полным списком
> совпадений.
>
> Удаление: Radix AlertDialog (зависимость сначала в architecture.md, версия точная),
> фокус по умолчанию на «Отмена», pending-состояние, повтор при ошибке; 404 считается
> мягким успехом («Бронь уже удалена»); window.confirm запрещён; кнопка «Удалить» только
> у будущих броней (Q4); после успеха фокус на «Новая бронь» и объявление через
> aria-live.
>
> Модуль presentApiError(error) -> { title, description, fieldErrors }: все тексты
> ошибок только здесь; форма и диалог удаления не содержат строк ошибок. Ошибка 400
> идёт в общий баннер, а не пропадает.
>
> 409 на create и update: форма не закрывается и не сбрасывается; внутри role="alert":
> «Это время только что заняли: 10:00–11:00 «Планёрка». Выберите другой интервал»
> (данные из conflictWith); поля времени помечены конфликтными, остаются редактируемыми,
> ошибка снимается после изменения времени; список перезапрашивается на дату из формы,
> занятые опции становятся disabled; фокус переходит на сообщение; «Сохранить» снова
> доступна.
> 404 на PATCH: «Бронь была удалена», данные формы остаются, предложить сохранить как
> новую бронь.
> 5xx и NETWORK: баннер и «Повторить» (повторяет саму мутацию с теми же данными формы,
> не refetch списка), данные формы сохранены. Ошибка refetch списка не затирает форму.
>
> Dev-панель за NEXT_PUBLIC_ENABLE_DEV_TOOLS: переключатели «Симулировать конфликт при
> следующем сохранении» (заголовок X-Mock-Force-Conflict) и «Медленная сеть»
> (X-Mock-Delay). Без флага панели в DOM нет. Заголовки передаются через опциональный
> параметр запроса API-клиента.
>
> Ключевой интеграционный тест B8: слот свободен в UI -> API вернул 409 -> значения
> формы сохранены, list вызван повторно, сообщение показано, фокус на нём, после смены
> времени ошибка снимается.
>
> Если нужно изменить существующий тест, остановись и спроси, сам не правь.
>
> Шаг 2. Напиши тесты, покажи красный прогон по нужной причине (не из-за импортов),
> таблицу «ID -> число тестов». Реализацию не пиши. СТОП.

Старт: `2026-10-08 22:40:53 +0600`, конец: `2026-10-08 23:01:30 +0600`, факт `0:20:37` (см. `docs/time-log.md`).

## Шаг 1. План

### Цель

Удаление будущей брони через диалог подтверждения (Radix AlertDialog) с pending, повтором и мягким 404. Полная обработка ошибок мутаций по Q7/Q11/D4: 409 с конфликтной пометкой полей и перезапросом списка на дату из формы, 404 при правке с «сохранить как новую», 5xx/NETWORK с «Повторить», 400 в общем баннере. Все тексты ошибок API — в одном модуле `presentApiError`. Dev-панель за `NEXT_PUBLIC_ENABLE_DEV_TOOLS` для ручного воспроизведения B8 и U4.

### ID требований

F6, B8 (UI-часть: сценарии 1–2, редактирование, флаг клиента), B11 (кнопка «Удалить» только у будущих — Q4), U3 (мутации: 409/404/400/5xx/NETWORK, `DELETE` 500), U4 («Медленная сеть»), A2 (alertdialog, фокус, `role="alert"`, aria-live). Q4, Q7, Q8, Q11, Q15, Q25, D4 (этап 3).

### Решения по устройству (на согласование при ревью)

1. **Кнопка «Удалить» — на сетке**, отдельная кнопка в элементе списка рядом с кнопкой брони, только у незаблокированных (`isBookingLocked` из domain = false). Имя: «Удалить бронь 14:00–15:00, Демо» (как у «Изменить бронь …»). Существующие проверки этапов 4–5 (`/Удалить/` отсутствует у начавшихся и прошедших) с этим совместимы.
2. **Диалог удаления** (`@radix-ui/react-alert-dialog` 1.1.23, запись в журнале добавлена): `role="alertdialog"`, заголовок «Удалить бронь?», описание «14:00–15:00 «Демо» будет удалена», кнопки «Отмена» (фокус по умолчанию) и «Удалить». Отправка: «Удаляем…», обе кнопки `disabled`, Esc и клик по фону не закрывают, второй клик не шлёт второй `DELETE`. Ошибка: внутри диалога `role="alert"` с текстом `presentApiError`, кнопка подтверждения становится «Повторить» и повторяет `DELETE`. Бронь в списке остаётся (список не инвалидируется, D4).
3. **Исход удаления.** `204` → диалог закрыт, в aria-live «Бронь удалена», фокус на «Новая бронь», список перезапрошен (Q15). `404` — мягкий успех: то же, объявление «Бронь уже удалена», список тоже перезапрашивается (бронь исчезла с сервера). «Отмена» → фокус возвращается на кнопку «Удалить …» этой брони. `window.confirm` не используется (тест шпионит за ним).
4. **`presentApiError(error: unknown) → { title, description?, fieldErrors }`** в `src/features/bookings/present-api-error.ts` (features: импортирует `ApiError` из `src/api`; компоненты получают готовые строки через props). Таблица текстов (точные строки — ожидания unit-тестов):

   | Ошибка | title | description | fieldErrors |
   |---|---|---|---|
   | 409 `OVERLAP`, `conflictWith` 10:00–11:00 «Планёрка» | `Это время только что заняли: 10:00–11:00 «Планёрка». Выберите другой интервал` | `Список броней обновлён` | `start`, `end`: `Пересекается с бронью 10:00–11:00 «Планёрка»` |
   | 409, `conflictWith` без `title` | `Это время только что заняли: 10:00–11:00. Выберите другой интервал` | то же | `Пересекается с бронью 10:00–11:00` |
   | 409 без `conflictWith` | `Это время только что заняли. Выберите другой интервал` | то же | `start`, `end`: `Интервал занят` |
   | 404 `NOT_FOUND` | `Бронь была удалена` | `Введённые данные сохранены — их можно сохранить как новую бронь` | `{}` |
   | 422 с `field` start/end/title | `error.message` (текст domain с сервера) | — | `{ [field]: error.message }` |
   | 422 без `field` или `field: "date"` | `error.message` | — | `{}` |
   | 400 (любой `code`, с `field` или без) | `Сервер не принял запрос` | `Проверьте введённые значения и повторите` | `{}` (общий баннер, Q11) |
   | `NETWORK` | `Нет связи с сервером` | `Проверьте подключение и повторите` | `{}` |
   | статус ≥ 500 (в т.ч. `PARSE`) | `Ошибка сервера` | `Повторите попытку` | `{}` |
   | `PARSE` со статусом < 500 | `Сервер вернул неожиданный ответ` | `Повторите попытку` | `{}` |
   | не `ApiError` | `Что-то пошло не так` | `Повторите попытку` | `{}` |

   Тексты 422 остаются текстами domain (`MESSAGES`), которые возвращает сервер: дублировать их в модуле — второй источник тех же правил. Сообщения `NETWORK_MESSAGE`/`PARSE_MESSAGE` в `http-bookings-api.ts` не трогаю (их проверяет api-тест, в UI они больше не показываются). Тексты клиентской валидации формы (`EMPTY_TEXT`, «На сегодня бронирование уже недоступно») — не ошибки API, остаются в форме.
5. **Баннер формы.** Один `role="alert"` над полями: `title` + `description`. Показывается для всех ошибок сервера, **кроме** 422 с полем формы (ошибка у поля, как на этапе 5) и `BOOKING_LOCKED` (только чтение с пояснением, как на этапе 5) — так существующие тесты этапа 5 не меняются. Состояние ошибки формы — одно (`serverError`), а не набор строк.
6. **409.** Форма открыта, значения не тронуты (в т.ч. изменённые при правке). Баннер с `tabIndex={-1}` получает фокус. `fieldErrors` → `aria-invalid="true"` и пояснение у «Начало» и «Окончание» через `aria-describedby`; поля редактируемы. Изменение начала **или** конца снимает пометку с обоих полей и убирает баннер (B8 п. 5). Хук уже перезапрашивает список на дату из формы (этап 3); новый список приходит в форму через props `bookings` → занятые варианты конца становятся `disabled` (значения формы не меняются, Q7). «Сохранить» снова активна (pending снят).
7. **404 на PATCH.** Баннер «Бронь была удалена» + описание; обычная «Сохранить» заменяется кнопкой «Сохранить как новую бронь» → `create({ date, start, end, title })` с текущими значениями формы, успех → «Бронь создана». Хук `useUpdateBooking` на 404 перезапрашивает список даты брони (иначе удалённая бронь остаётся в кэше). Аналогично `useDeleteBooking` на 404.
8. **5xx и NETWORK.** Баннер + кнопка «Повторить» внутри баннера: повторяет ту же мутацию с текущими данными формы (без новой проверки «изменилось ли»), `list` не вызывается (D4). «Сохранить» тоже доступна. 400 — баннер без «Повторить» (повтор того же запроса даст тот же 400).
9. **Ошибка refetch списка не затирает форму.** Форма рендерится вне секции расписания; её значения — в `useState` формы (Q7). Тест: после 409 перезапрос списка падает → форма открыта, значения и баннер 409 на месте.
10. **Dev-панель.** `src/components/dev-panel/dev-panel.tsx` (презентационная, `<section aria-label="Инструменты разработчика">`, два чекбокса) + состояние в `DayView`. Флаг читается как `process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === "true"` (только строка `true`, как Q24 для сервера). «Симулировать конфликт при следующем сохранении» — одноразовый: заголовок `X-Mock-Force-Conflict: 1` уходит с ближайшим `create`/`update`, после отправки переключатель снимается. «Медленная сеть» — постоянный: `X-Mock-Delay: 2000` у `create`, `update`, `remove`. **У `list` заголовка нет**: `BookingsApi.list(date, signal)` не принимает параметр запроса, менять контракт ради dev-панели не предлагаю (U4 говорит об отправке формы). Заголовки — через существующий `RequestOptions.headers` (этап 3, `http-bookings-api.test.ts` уже проверяет их передачу).
11. **`.env.example`**: добавить `NEXT_PUBLIC_ENABLE_DEV_TOOLS=` (без значения).

### Файлы

| Файл | Что | Шаг 2 |
|---|---|---|
| `src/features/bookings/present-api-error.ts` | `presentApiError`, тип `PresentedError` | заглушка `Error("stage 6: не реализовано")` |
| `src/features/bookings/hooks.ts` | инвалидация на 404 в `useUpdateBooking`, `useDeleteBooking` | без изменений |
| `src/features/booking-form/use-booking-form.ts`, `booking-form-dialog.tsx` | `serverError` вместо `formError`, конфликт, 404 → «как новую», «Повторить», заголовки dev-панели | без изменений |
| `src/components/booking-form/booking-form.tsx` | баннер `title`/`description`, фокус на баннер, «Повторить», «Сохранить как новую бронь» | без изменений |
| `src/components/day-view/day-grid.tsx` | кнопка «Удалить …» у незаблокированных, проп `onDelete` | без изменений |
| `src/components/delete-dialog/delete-booking-dialog.tsx` | AlertDialog (презентационный) | — |
| `src/features/day-view/day-view.tsx` | состояние удаления, мутация, объявления, фокус, dev-панель | без изменений |
| `src/components/dev-panel/dev-panel.tsx` | панель с двумя чекбоксами | — |
| `package.json`, `package-lock.json` | `@radix-ui/react-alert-dialog` 1.1.23 | установка на шаге реализации |
| `.env.example`, `src/app/globals.css` | флаг клиента; стили диалога удаления, баннера, панели | — |
| тесты | `present-api-error.test.ts`, `hooks.test.tsx` (новый `describe` в конце), `booking-form-errors.test.tsx`, `delete-booking.test.tsx`, `dev-panel.test.tsx` | пишутся |

### Тесты (пишутся первыми)

`src/features/bookings/present-api-error.test.ts` (unit, 14):
1. B8: 409 с conflictWith 10:00–11:00 «Планёрка» → сообщение с интервалом и названием, пометка начала и конца
2. B8: 409 с conflictWith без названия → интервал без кавычек
3. B8, U3: 409 без conflictWith → общее сообщение о занятом времени, поля помечены
4. F5, Q7: 404 NOT_FOUND → «Бронь была удалена», данные можно сохранить как новую
5. U3: 422 с field end → текст domain с сервера в заголовке и у поля
6–7. U3: 422 без field / field date → только общий текст, полей формы нет
8–9. U3, Q11: 400 без field / с field → общий баннер «Сервер не принял запрос», полей нет
10. U3: NETWORK → «Нет связи с сервером»
11–12. U3: статус 500 / 503 (PARSE) → «Ошибка сервера»
13. U3: PARSE со статусом 200 → «Сервер вернул неожиданный ответ»
14. U3: не ApiError → «Что-то пошло не так»

`src/features/bookings/hooks.test.tsx`, новый `describe` в конце файла (ui, 4; прежние тесты не тронуты):
15. F6: delete → 404 (бронь уже удалена): список даты перезапрошен, брони в нём нет
16. F5, Q7: update → 404 (бронь удалена): список даты брони перезапрошен
17–18. U3, D4: create → 500 / create → NETWORK — список не перезапрашивается

`src/features/booking-form/booking-form-errors.test.tsx` (ui, 8):
19. **Ключевой.** B8, T6, T7: слот свободен в UI → 409 → данные на месте, ровно один перезапрос list на дату формы, сообщение с фокусом, пометка снимается после смены времени
20. B8: смена только окончания тоже снимает пометку конфликта с обоих полей
21. B8, Q7: 409 при правке → остаются изменённые значения, перезапрос list на дату брони, сообщение с фокусом
22. B8, U3: перезапрос списка после 409 упал → форма открыта, данные и сообщение о конфликте на месте
23. F5, Q7: PATCH → 404 → «Бронь была удалена», изменённые данные на месте, «Сохранить как новую бронь» создаёт бронь
24. U3, D4: create → 500 → баннер «Ошибка сервера», данные на месте, «Повторить» повторяет create с теми же данными без перезапроса list
25. U3, D4: update → NETWORK → «Нет связи с сервером», «Повторить» повторяет update с тем же patch, list не перезапрашивается до успеха
26. U3, Q11: create → 400 → общий баннер «Сервер не принял запрос», данные на месте, без «Повторить»

`src/features/day-view/delete-booking.test.tsx` (ui, 6):
27. F6, B11, Q4: сегодня в 10:10 «Удалить» есть у брони 11:00–12:00 и нет у начавшейся 10:00–10:30
28. F6, A2: «Удалить» открывает alertdialog с описанием брони, фокус на «Отмена», window.confirm не вызывается, DELETE не ушёл
29. F6, A2: «Отмена» закрывает диалог без DELETE, бронь на месте, фокус на кнопке «Удалить» этой брони
30. F6, U4, A2: подтверждение → «Удаляем…» disabled, второй клик без второго DELETE; успех → диалог закрыт, list перезапрошен, брони нет, aria-live «Бронь удалена», фокус на «Новая бронь»
31. F6, U3: DELETE → 500 → в диалоге role=alert «Ошибка сервера», бронь в списке, «Повторить» шлёт DELETE снова и удаляет
32. F6: DELETE → 404 — мягкий успех: диалог закрыт без ошибки, aria-live «Бронь уже удалена», list перезапрошен, фокус на «Новая бронь»

`src/features/day-view/dev-panel.test.tsx` (ui, 7):
33–35. B8, Q8: NEXT_PUBLIC_ENABLE_DEV_TOOLS = не задан / `false` / `1` → панели нет в DOM
36. B8, U4, Q8: NEXT_PUBLIC_ENABLE_DEV_TOOLS=true → панель с двумя выключенными переключателями
37. B8, Q8: «Симулировать конфликт» → create уходит с X-Mock-Force-Conflict: 1 один раз, переключатель снимается, следующее сохранение без заголовка
38. B8, Q8: «Симулировать конфликт» действует и на правку (update)
39. U4, Q8: «Медленная сеть» → create и remove уходят с X-Mock-Delay: 2000, переключатель остаётся включённым

Без отдельного теста: «форма и диалог удаления не содержат строк ошибок» — проверка поиском на шаге 7 (тексты из таблицы п. 4 встречаются в `src/` только в `present-api-error.ts` и тестах). Ручной сценарий 409 через dev-панель (plan.md) — на шаге 7.

### Вывод ожидания

«Сейчас» во всех ui-тестах — `2026-10-08 10:10:00` Бишкек; дата формы — `2026-10-09` (завтра).

| Тест | Входные данные | Правило | Ожидание |
|---|---|---|---|
| 1–3 | `conflictWith` 10:00–11:00 «Планёрка» / без title / нет | Команда этапа 6 (текст 409), п. 4 таблицы | строки таблицы п. 4 дословно; интервал — `start–end` из `conflictWith` |
| 11–12 | статус 500, 503 | Q11, U3: 5xx — ошибка сервера | «Ошибка сервера» для обоих (порог `status >= 500`) |
| 15, 16 | список A загружен (1 вызов), мутация → 404 | п. 7 (404 = брони нет на сервере), Q15 | `listCallsFor(A)` = 2, список `[]` |
| 17–18 | список загружен (1 вызов), create → 500/NETWORK | D4: после 5xx и NETWORK список не инвалидируется | `listCallsFor(A)` = 1 |
| 19 | список 09.10 пуст (1 вызов); после загрузки в API добавлена «Чужая» 14:00–15:00; форма 14:00–15:00 «Демо»; create → 409 с `conflictWith` = «Чужая» | B8 п. 2–5, T6, T7, Q7, B5 | до отправки опция 15:00 доступна (UI не знает о чужой); после 409: alert «Это время только что заняли: 14:00–15:00 «Чужая». Выберите другой интервал», фокус на нём; значения `14:00`/`15:00`/`Демо`; вызовы list = `[2026-10-09, 2026-10-09]` (ровно один перезапрос, дата формы); в сетке «14:00–15:00 Чужая»; опция 15:00 `disabled` (B5: `[14:00,15:00)` пересекает `[14:00,15:00)`); у «Начало» и «Окончание» `aria-invalid="true"` и «Пересекается с бронью 14:00–15:00 «Чужая»»; «Сохранить» активна. После начала 15:00 пометки и alert нет; после конца 16:00 `aria-invalid` нет нигде; второй create = `{ date: 2026-10-09, start: 15:00, end: 16:00, title: Демо }` (касание 15:00 разрешено, B5) |
| 20 | 409 с `conflictWith` 14:30–15:00 (в список не добавлена); затем конец 14:30 | B8 п. 5 | у обоих полей `aria-invalid` нет, текста конфликта нет; опция 14:30 доступна, т.к. перезапрошенный список пуст |
| 21 | b1 14:00–15:00 «Демо» → 16:00–17:00; «Чужая» 16:00–17:00; update → 409 | B8 «Редактирование», Q7 | значения `16:00`/`17:00`/`Демо` (изменённые, не исходные); alert «…16:00–17:00 «Чужая»…»; `listCallsFor(2026-10-09)` = 2 |
| 22 | после загрузки list отклоняется 500; create → 409 | п. 9, Q7 | list вызван 2 раза; на экране «Не удалось загрузить брони»; диалог открыт; alert 409; значения 14:00/15:00/Демо |
| 23 | b1 14:00–15:00 → 16:00–17:00 «Демо 2»; update → 404 | Q7, п. 7 | alert «Бронь была удалена»; значения 16:00/17:00/«Демо 2»; кнопки «Сохранить» нет; create ровно 1 раз `{ date: 2026-10-09, start: 16:00, end: 17:00, title: Демо 2 }`; aria-live «Бронь создана» |
| 24 | create → 500, затем «Повторить» | D4 | `listCallsFor` = 1 до повтора; create 2 раза с равными аргументами `{ 2026-10-09, 14:00, 15:00, Демо }` |
| 25 | b1 → 15:00–16:00; update → NETWORK, «Повторить» | D4, Q12 (patch — только изменённые поля) | `listCallsFor` = 1 до повтора; второй update = `("b1", { start: 15:00, end: 16:00 })` |
| 27 | сегодня 10:10; 10:00–10:30 и 11:00–12:00 | B11, Q4: начавшаяся, если `start ≤ floor(now)` | 10:00 ≤ 10:10 → «Удалить» нет; 11:00 > 10:10 → есть |
| 30 | `holdMutations`, два клика | U4 (по аналогии с формой), Q15 | `remove` вызван 1 раз; после ответа list = 2 вызова; брони 14:00–15:00 нет |
| 31 | remove → 500, «Повторить» | U3 «DELETE → 500 → бронь остаётся», D4 | до повтора list = 1 вызов, бронь видна; `remove` 2 раза; после — брони нет |
| 32 | бронь уже удалена в API, remove → 404 | Команда этапа 6 (мягкий успех), п. 3 | alert нет; aria-live «Бронь уже удалена»; list = 2 вызова; брони нет |
| 37 | флаг `true`; переключатель конфликта; create ×2 | Q8 а), команда этапа 6 «при следующем сохранении» | заголовки create: `[{ X-Mock-Force-Conflict: "1" }, {}]`; переключатель после первой отправки снят |
| 38 | b1 16:00–17:00, конец → 16:30 | Q8 а) («при следующем сохранении» — и правка) | заголовки update: `{ X-Mock-Force-Conflict: "1" }` |
| 39 | «Медленная сеть»; create 14:00–15:00, удаление 16:00–17:00 | Q8 б), U4 | create: `[{ X-Mock-Delay: "2000" }]`, remove: `[{ X-Mock-Delay: "2000" }]`; переключатель включён |

`FakeBookingsApi` не менялся: его `list` сортирует по `start` и возвращает снимок `bookings` (инварианты F2), ошибки — `failNext`/`failList`, «в полёте» — `holdMutations`, заголовки — `mutationCalls[].options`.

### Проверки существующих тестов (INC-6)

Меняется поведение элементов: элемент списка брони (новая кнопка «Удалить»), баннер ошибки формы (`role="alert"`), кнопки формы («Сохранить» → «Сохранить как новую бронь» при 404, «Повторить»), область aria-live (новые тексты), пометки `aria-invalid` (409), инвалидация в хуках на 404, тексты 409/400/5xx.

Команда:

```bash
grep -rnE '"alert"|Удалить|Повторить|/Сохран/|aria-live|Бронь создана|Изменения сохранены|aria-invalid|OVERLAP|NOT_FOUND|status: 4|status: 5|NETWORK|remove|useDeleteBooking|activeElement' --include='*.test.ts' --include='*.test.tsx' src
```

Совпадений: 98 (выполнено до написания тестов этапа 6). Полный список:

```text
src/features/booking-form/booking-form.test.tsx:57:const saveButton = () => within(dialog()).getByRole("button", { name: /Сохран/ }) as HTMLButtonElement;
src/features/booking-form/booking-form.test.tsx:93:  new ApiError(field === undefined ? { status: 422, code, message } : { status: 422, code, message, field });
src/features/booking-form/booking-form.test.tsx:99:    expect(document.activeElement).toBe(startInput());
src/features/booking-form/booking-form.test.tsx:104:    expect(dialog().querySelector('[aria-invalid="true"]')).toBeNull();
src/features/booking-form/booking-form.test.tsx:110:    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
src/features/booking-form/booking-form.test.tsx:113:    expect(document.activeElement).toBe(button);
src/features/booking-form/booking-form.test.tsx:122:    expect(document.activeElement).toBe(button);
src/features/booking-form/booking-form.test.tsx:172:    expect(optionFor("11:15")?.textContent).toContain(MESSAGES.OVERLAP);
src/features/booking-form/booking-form.test.tsx:217:    expect(endSelect().getAttribute("aria-invalid")).toBe("true");
src/features/booking-form/booking-form.test.tsx:237:  it("B1: старт 08:59 — ошибка у «Начало» после blur, aria-invalid, aria-describedby; отправки нет", async () => {
src/features/booking-form/booking-form.test.tsx:243:    expect(startInput().getAttribute("aria-invalid")).toBeNull();
src/features/booking-form/booking-form.test.tsx:246:    expect(startInput().getAttribute("aria-invalid")).toBe("true");
src/features/booking-form/booking-form.test.tsx:279:    expect(startInput().getAttribute("aria-invalid")).toBe("true");
src/features/booking-form/booking-form.test.tsx:310:    expect(startInput().getAttribute("aria-invalid")).toBe("true");
src/features/booking-form/booking-form.test.tsx:322:    const summary = within(dialog()).getByRole("alert");
src/features/booking-form/booking-form.test.tsx:326:    expect(startInput().getAttribute("aria-invalid")).toBe("true");
src/features/booking-form/booking-form.test.tsx:327:    expect(endSelect().getAttribute("aria-invalid")).toBe("true");
src/features/booking-form/booking-form.test.tsx:345:  it("F4, U4, A2: создание завтра 14:00–15:00 «  Демо  » → create с title «Демо», диалог закрыт, aria-live «Бронь создана», список перезапрошен", async () => {
src/features/booking-form/booking-form.test.tsx:358:    expect(screen.getByText("Бронь создана").closest("[aria-live]")).not.toBeNull();
src/features/booking-form/booking-form.test.tsx:437:    await waitFor(() => expect(titleInput().getAttribute("aria-invalid")).toBe("true"));
src/features/booking-form/booking-form.test.tsx:447:    await waitFor(() => expect(endSelect().getAttribute("aria-invalid")).toBe("true"));
src/features/booking-form/booking-form.test.tsx:457:    const alert = await within(dialog()).findByRole("alert");
src/features/booking-form/booking-form.test.tsx:473:    await waitFor(() => expect(startInput().getAttribute("aria-invalid")).toBe("true"));
src/features/booking-form/booking-form.test.tsx:500:  it("F5: правка на 15:00–16:00 → update(b1, {start, end}), диалог закрыт, «Изменения сохранены», в списке 15:00–16:00", async () => {
src/features/booking-form/booking-form.test.tsx:514:    expect(screen.getByText("Изменения сохранены").closest("[aria-live]")).not.toBeNull();
src/features/booking-form/booking-form.test.tsx:583:    expect(within(dialog()).queryByRole("button", { name: /Сохран/ })).toBeNull();
src/features/booking-form/booking-form.test.tsx:593:    expect(document.activeElement).toBe(within(dialog()).getByRole("button", { name: "Закрыть" }));
src/features/booking-form/booking-form.test.tsx:606:    expect(within(dialog()).queryByRole("button", { name: /Сохран/ })).toBeNull();
src/features/booking-form/booking-form.test.tsx:618:    expect(within(dialog()).queryByRole("button", { name: /Сохран/ })).toBeNull();
src/features/booking-form/booking-form.test.tsx:637:    expect(within(dialog()).queryByRole("button", { name: /Сохран/ })).toBeNull();
src/features/bookings/hooks.test.tsx:6:import { useCreateBooking, useDayBookings, useDeleteBooking, useUpdateBooking } from "./hooks";
src/features/bookings/hooks.test.tsx:18:  new ApiError({ status: 409, code: "OVERLAP", message: "Время занято", field: "start", conflictWith });
src/features/bookings/hooks.test.tsx:103:    const failure = new ApiError({ status: 500, code: "PARSE", message: "Не удалось загрузить брони" });
src/features/bookings/hooks.test.tsx:169:      new ApiError({ status: 422, code: "DURATION_STEP", message: "Длительность кратна 30 минутам", field: "end" }),
src/features/bookings/hooks.test.tsx:243:    const { result } = renderHook(() => ({ list: useDayBookings(A), remove: useDeleteBooking() }), { wrapper });
src/features/bookings/hooks.test.tsx:246:    await act(() => result.current.remove.mutateAsync({ id: "b1", date: A }));
src/server/dev-tools.test.ts:41:    expect(error).toMatchObject({ code: "OVERLAP", conflictWith: { id: expect.any(String), date: TOMORROW, start: "14:00", end: "15:00" } });
src/server/dev-tools.test.ts:78:    expect(error).toMatchObject({ code: "OVERLAP", conflictWith: { date: TOMORROW, start: "10:00", end: "10:30" } });
src/features/day-view/day-view.test.tsx:153:    { label: "500", error: new ApiError({ status: 500, code: "PARSE", message: "Сервер вернул неожиданный ответ" }) },
src/features/day-view/day-view.test.tsx:154:    { label: "NETWORK", error: new ApiError({ status: 0, code: "NETWORK", message: "Нет соединения" }) },
src/features/day-view/day-view.test.tsx:155:  ])("U3: ошибка загрузки ($label) — role=alert «Не удалось загрузить брони», «Повторить» повторяет list и показывает брони", async ({ error }) => {
src/features/day-view/day-view.test.tsx:160:    expect((await screen.findByRole("alert")).textContent).toContain("Не удалось загрузить брони");
src/features/day-view/day-view.test.tsx:161:    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
src/features/day-view/day-view.test.tsx:165:    expect(screen.queryByRole("alert")).toBeNull();
src/features/day-view/day-view.test.tsx:179:    expect(within(item!).queryByRole("button", { name: /Удалить/ })).toBeNull();
src/features/day-view/day-view.test.tsx:227:    const remove = within(item!).queryByRole("button", { name: /Удалить/ });
src/features/day-view/day-view.test.tsx:230:    expect(locked && remove !== null).toBe(false);
src/features/day-view/day-view.test.tsx:376:    expect(screen.queryByRole("alert")).toBeNull();
src/server/handlers.test.ts:346:  ])("B5: %s %s–%s → 409 OVERLAP с conflictWith", async (_case, start, end) => {
src/server/handlers.test.ts:349:    expect(await readError(response)).toMatchObject({ code: "OVERLAP", conflictWith: EXISTING });
src/server/handlers.test.ts:359:    expect(await response.json()).toEqual({ error: { code: "OVERLAP", message: expect.any(String), conflictWith: EXISTING } });
src/server/handlers.test.ts:395:    expect(await readError(response)).toMatchObject({ code: "OVERLAP", conflictWith: NEXT });
src/server/handlers.test.ts:478:    expect(await readError(response)).toMatchObject({ code: "OVERLAP", conflictWith: saturday });
src/server/handlers.test.ts:481:  it("F5: несуществующий id → 404 NOT_FOUND", async () => {
src/server/handlers.test.ts:484:    expect(await readError(response)).toMatchObject({ code: "NOT_FOUND" });
src/server/handlers.test.ts:490:    expect(await readError(response)).toMatchObject({ code: "NOT_FOUND" });
src/server/handlers.test.ts:504:  it("F6: повторный DELETE того же id → 404 NOT_FOUND", async () => {
src/server/handlers.test.ts:508:    expect(await readError(response)).toMatchObject({ code: "NOT_FOUND" });
src/domain/rules.test.ts:276:  it("B6 раньше title и B5: сегодня 10:00–10:30, 101 символ, занято → START_IN_PAST, TITLE_TOO_LONG, OVERLAP", () => {
src/domain/rules.test.ts:280:      "OVERLAP",
src/domain/rules.test.ts:304:    ["B5", "OVERLAP", input("10:30", "11:30"), { bookings: busy }],
src/domain/rules.test.ts:366:    "OVERLAP",
src/api/http-bookings-api.test.ts:102:  it("F6: remove → DELETE /bookings/b1, 204 → без значения", async () => {
src/api/http-bookings-api.test.ts:106:    await expect(api.remove("b1")).resolves.toBeUndefined();
src/api/http-bookings-api.test.ts:128:    await api.remove("b1");
src/api/http-bookings-api.test.ts:142:      status: 400,
src/api/http-bookings-api.test.ts:147:      name: "404 NOT_FOUND",
src/api/http-bookings-api.test.ts:148:      status: 404,
src/api/http-bookings-api.test.ts:149:      error: { code: "NOT_FOUND", message: "Бронь не найдена" },
src/api/http-bookings-api.test.ts:153:      name: "409 OVERLAP с conflictWith",
src/api/http-bookings-api.test.ts:154:      status: 409,
src/api/http-bookings-api.test.ts:155:      error: { code: "OVERLAP", message: "Время занято", field: "start", conflictWith: OTHER },
src/api/http-bookings-api.test.ts:160:      status: 422,
src/api/http-bookings-api.test.ts:166:      status: 422,
src/api/http-bookings-api.test.ts:186:    const net = fakeFetch(() => new Response("<html>Internal Server Error</html>", { status: 500 }));
src/api/http-bookings-api.test.ts:190:    expect(thrown).toMatchObject({ status: 500, code: "PARSE" });
src/api/http-bookings-api.test.ts:196:    const net = fakeFetch(() => new Response(null, { status: 503 }));
src/api/http-bookings-api.test.ts:197:    const thrown = await caught(createHttpBookingsApi({ baseUrl: "/api", fetch: net.fetch }).remove("b1"));
src/api/http-bookings-api.test.ts:198:    expect(thrown).toMatchObject({ status: 503, code: "PARSE" });
src/api/http-bookings-api.test.ts:205:    expect(thrown).toMatchObject({ status: 422, code: "PARSE" });
src/api/http-bookings-api.test.ts:217:  it("U3: офлайн (fetch отклонён TypeError) → ApiError NETWORK, статус 0", async () => {
src/api/http-bookings-api.test.ts:222:    expect(thrown).toMatchObject({ status: 0, code: "NETWORK" });
src/api/http-bookings-api.test.ts:226:  it("U3: нет ответа дольше timeoutMs → ApiError NETWORK, запрос fetch отменён", async () => {
src/api/http-bookings-api.test.ts:231:    expect(thrown).toMatchObject({ status: 0, code: "NETWORK" });
src/api/http-bookings-api.test.ts:251:    for (const value of [new Error("x"), undefined, { status: 409, code: "OVERLAP" }]) {
src/domain/overlap.test.ts:49:  ])("B5: %s–%s → OVERLAP с conflictWith (%s)", (start, end) => {
src/domain/overlap.test.ts:54:    expect(result.errors[0]).toMatchObject({ code: "OVERLAP", conflictWith: existing });
src/domain/overlap.test.ts:75:    expect(result.errors[0]).toMatchObject({ code: "OVERLAP", conflictWith: { id: "1" } });
src/domain/overlap.test.ts:81:  ])("B7: id=1 → %s–%s → OVERLAP, conflictWith.id = 2", (start, end) => {
src/domain/overlap.test.ts:85:    expect(result.errors[0]).toMatchObject({ code: "OVERLAP", conflictWith: { id: "2" } });
src/domain/end-options.test.ts:112:  it("B10, B5: старт 10:45, бронь 11:00–12:00 → все четыре недоступны, OVERLAP", () => {
src/domain/end-options.test.ts:115:      no("11:15", "OVERLAP", "1"),
src/domain/end-options.test.ts:116:      no("11:45", "OVERLAP", "1"),
src/domain/end-options.test.ts:117:      no("12:15", "OVERLAP", "1"),
src/domain/end-options.test.ts:118:      no("12:45", "OVERLAP", "1"),
src/domain/end-options.test.ts:122:  it("B7: правка id=1 10:00–11:00 рядом с id=2 11:00–12:00 → 10:30, 11:00 доступны, 11:30 и 12:00 — OVERLAP с id=2", () => {
src/domain/end-options.test.ts:130:      no("11:30", "OVERLAP", "2"),
src/domain/end-options.test.ts:131:      no("12:00", "OVERLAP", "2"),
```

Разбор совпадений, относящихся к меняемым элементам (остальные — `src/server`, `src/domain`, `src/api`: контракт сервера и клиента, этап 6 их не меняет):

| Совпадение | Тест | Затронут? |
|---|---|---|
| `booking-form.test.tsx:57` `saveButton` по `/Сохран/` | хелпер всех тестов формы | Нет: «Сохранить как новую бронь» появляется только после 404 на PATCH, такого состояния в тестах этапа 5 нет |
| `:322` `getByRole("alert")` | «A2, F3: отправка пустой формы — сводка role=alert…» | Нет: ошибки сервера нет, баннер не рендерится, alert один |
| `:437`, `:447`, `:473` `aria-invalid` после 422 с полем | «F4, U3: 422 TITLE_TOO_LONG…», «B10, U3: 422 DURATION_STEP…», «B12, U3: граница минуты…» | Нет: 422 с полем формы — без баннера (решение 5), пометка поля как на этапе 5 |
| `:457` `findByRole("alert")` 422 без field | «U3: 422 без field → сообщение над формой…» | Нет: баннер = `title` = `error.message`, alert один |
| `:583`, `:606`, `:618`, `:637` нет `/Сохран/` | тесты «только чтение» (B11) | Нет: только чтение не меняется; `:617` `findByText(BOOKING_LOCKED)` — `BOOKING_LOCKED` без баннера (решение 5), текст один |
| `:358`, `:514` aria-live | «F4, U4, A2: создание…», «F5: правка на 15:00–16:00…» | Нет: та же область, другие тексты добавляются |
| `:99–122`, `:593` `activeElement` | фокус при открытии/закрытии формы | Нет: фокус на баннер — только при 409 |
| `day-view.test.tsx:161` `getByRole("button", { name: "Повторить" })` | «U3: ошибка загрузки…» | Нет: форма не открыта, «Повторить» формы/удаления в DOM нет |
| `:165`, `:376` `queryByRole("alert")` = null | «U3: ошибка загрузки…», «F1, U3: отмена запроса A…» | Нет: новых alert вне ошибок нет; dev-панель без флага отсутствует |
| `:179`, `:227–230` `/Удалить/` | «B6, F1: прошедшая дата…», «B11: сегодня в 10:10 бронь…» | Нет: «Удалить» только у незаблокированных — проверки «нет у начавшихся/прошедших» остаются истинными |
| `hooks.test.tsx:243–246` `useDeleteBooking` | «F6: после успешного delete…» | Нет: успех не меняется; 404 — новое поведение, его не проверяет ни один прежний тест |
| `hooks.test.tsx:18` 409 | тесты B8 хуков | Нет: инвалидация на 409 не меняется |

**Итог: правок существующих тестов не требуется.** Новые тесты добавлены в новые файлы и новым `describe` в конец `hooks.test.tsx`.

## Шаг 2. Красный прогон

Заглушка: `presentApiError` в `src/features/bookings/present-api-error.ts` бросает `Error("stage 6: не реализовано")`. UI-заглушек нет: ui-тесты рендерят существующий `DayView`. `@radix-ui/react-alert-dialog` записан в журнал, **не установлен** (тесты его не импортируют). `tsc --noEmit`, `eslint`, `policy-check` — зелёные.

Команда: `TZ=UTC npx vitest run src/features/bookings/present-api-error.test.ts src/features/bookings/hooks.test.tsx src/features/booking-form/booking-form-errors.test.tsx src/features/day-view/delete-booking.test.tsx src/features/day-view/dev-panel.test.tsx`

```text
 Test Files  5 failed (5)
      Tests  34 failed | 20 passed (54)
```

Причины падений (ошибок импорта и `Cannot find module` — 0):

| Тесты | Причина |
|---|---|
| 1–14 | `Error: stage 6: не реализовано` (заглушка) |
| 15, 16 | `AssertionError: expected 1 to be 2` — на 404 список не перезапрашивается |
| 19, 21, 22 | `AssertionError: expected 'Время занято' to contain 'Это время только что заняли: …'` — форма показывает `error.message` |
| 20 | `AssertionError: expected null to be 'true'` — поля не помечаются при 409 |
| 23 | `expected 'Бронь не найдена' to contain 'Бронь была удалена'` |
| 24 | `expected 'html' to contain 'Ошибка сервера'` |
| 25 | `expected 'offline' to contain 'Нет связи с сервером'` |
| 26 | `expected 'Unknown field foo' to contain 'Сервер не принял запрос'` |
| 27–32 | `Unable to find role="button" and name /^Удалить бронь …/` — кнопки нет |
| 36 | `Unable to find role="region" and name "Инструменты разработчика"` |
| 37–39 | `Unable to find … role "checkbox" and name "…"` |

**Зелёные уже сейчас (5 из 39 новых):** 17–18 (D4: после 5xx/NETWORK список не инвалидируется — поведение хуков с этапа 3, тестов на него не было) и 33–35 (панели нет без флага — панели нет вообще). Это регрессионные проверки: 17–18 упадут, если инвалидацию добавить на любую ошибку; 33–35 — если панель рендерить без флага. Остальные 15 зелёных в прогоне — прежние тесты `hooks.test.tsx`.

Полный прогон `TZ=UTC npx vitest run`: `Tests 34 failed | 511 passed (545)`. Было 506 (этап 5b) → 545 (+39: 14 unit, 25 ui). Все 506 прежних зелёные.

### ID → число тестов

Тест засчитывается каждому ID из начала названия.

| ID | Тесты | Число |
|---|---|---|
| B8 | 1–3, 19–22, 33–38 | 13 |
| U3 | 3, 5–14, 17–18, 22, 24–26, 31 | 18 |
| F6 | 15, 27–32 | 7 |
| F5 (404 при правке) | 4, 16, 23 | 3 |
| U4 | 30, 36, 39 | 3 |
| A2 | 28–30 | 3 |
| B11 | 27 | 1 |
| Всего уникальных | | 39 |

### Вопросы заказчику (до реализации)

1. Решения 1–11 шага 1, в первую очередь: кнопка «Удалить» на сетке (1), тексты таблицы п. 4, отсутствие баннера у 422 с полем и `BOOKING_LOCKED` (5), «Медленная сеть» без заголовка у `list` (10), флаг клиента только строкой `true` (10).
2. 404 на `PATCH` и `DELETE` перезапрашивает список (п. 7, тесты 15–16) — в Q15 этого нет, добавлено по смыслу Q7.

**СТОП** — жду команды на реализацию.

## Решения заказчика и шаг 5

Команда заказчика:

> Решения: все шесть пунктов приняты. Запиши в requirements.md (F5, F6) допущение
> о перезапросе списка после 404, а в README-заметки трейса: «Медленная сеть» не
> влияет на загрузку списка; «Симулировать конфликт» срабатывает один раз.
> Убедись, что у кнопки «Удалить» aria-label содержит время брони; если такого теста
> нет, добавь и покажи красным.
>
> Установи @radix-ui/react-alert-dialog 1.1.23 точно (--save-exact). Реализуй минимум
> кода до зелёного, старые тесты не менять; если тест кажется неверным, остановись и
> объясни. npm run gate с выводом (545+ тестов, ни один не должен пропасть).
>
> Мутации по одной с откатом по sha и падающим тестом: (1) убери инвалидацию списка при
> 409, (2) сбрасывай форму при 409, (3) не снимай ошибку конфликта после смены
> времени, (4) «Повторить» вызывает refetch списка вместо повтора мутации, (5) убери
> фокус на сообщение 409, (6) 404 при DELETE показывай как ошибку, (7) включи панель
> без проверки флага, (8) продублируй текст ошибки в компоненте формы (должен
> поймать lint или policy-check). Не пойманные мутации записывай как дыры, тесты
> молча не правь; эквивалентные помечай как таковые.
>
> Проверки: window.confirm не используется (grep), числа правил вне domain нет,
> Date.now и new Date() без аргумента только в файлах-часах, компоненты не импортируют
> src/api.
>
> Ручная проверка в браузере (конкретные шаги и результат в трейс): удаление с
> подтверждением и Esc; 404 при удалении (удали бронь через вторую вкладку);
> главный сценарий B8: включи «Симулировать конфликт», сохрани форму, убедись, что
> данные на месте, сообщение видно, фокус на нём, список обновился, после смены
> времени ошибка пропала и сохранение проходит; «Медленная сеть» показывает
> «Сохраняем…»; ошибка сети; 320 и 1280 px; клавиатурная навигация. Перед проверкой
> перезапусти dev-сервер для чистого seed.
>
> Stage-gate с доказательствами, трейс, date, time-log, коммит
> "stage 6: delete, conflict, errors (gate green)", push. Закрой пункт
> «После коммита и push» этапа 5b. Следующий этап не начинай. СТОП.

Сделано по решениям: в `docs/requirements.md` в F5 и F6 добавлено допущение о перезапросе списка после 404 (в F6 — и «мягкий успех»); заметки для README — ниже.

### Тест 40: aria-label кнопки «Удалить»

Тест 27 проверял **доступное имя** (`getByRole` с `name`), а оно может прийти и не из `aria-label`. Добавлен тест 40 в `delete-booking.test.tsx`: «F6, A2: у кнопки «Удалить» aria-label с временем и названием брони — «Удалить бронь 14:00–15:00, Демо»» — проверяет атрибут `aria-label` дословно. Красный прогон до реализации:

```text
× F6, A2: у кнопки «Удалить» aria-label с временем и названием брони — «Удалить бронь 14:00–15:00, Демо»
TestingLibraryElementError: Unable to find an accessible element with the role "button" and name `/^Удалить/`
Tests  1 failed | 6 skipped (7)
```

(`skipped` — фильтр `-t` командной строки, не `.skip` в коде.) Вывод ожидания: бронь 14:00–15:00 «Демо» → имя по шаблону «Удалить бронь {start}–{end}, {title}» (решение 1 шага 1) → `"Удалить бронь 14:00–15:00, Демо"`.

### Реализация

| Файл | Что |
|---|---|
| `package.json`, `package-lock.json` | `@radix-ui/react-alert-dialog` **1.1.23** (`--save-exact`); `npm ls`: `@radix-ui/react-dialog@1.1.23 deduped` — второй копии нет |
| `src/features/bookings/present-api-error.ts` | `presentApiError` по таблице п. 4; `isRetryable` (5xx, NETWORK). Ветки по `code`/`status`, а не guards `isConflict`/…: guard `error is ApiError` в ветке «нет» сужает `ApiError` до `never` (ошибка `tsc` на первом прогоне) |
| `src/features/bookings/hooks.ts` | 404 → инвалидация даты брони в `useUpdateBooking` и `useDeleteBooking` |
| `src/features/booking-form/use-booking-form.ts` | `formError` → `serverError` (`kind`: conflict / notFound / other, `retry`, `focus`); `conflictErrors` снимаются изменением начала или конца вместе с баннером 409; сводка клиента скрыта, пока виден баннер сервера; 404 → отправка идёт `create` («Сохранить как новую бронь»); `onRetry` = та же отправка; `takeRequest` — заголовки dev-панели |
| `src/features/booking-form/booking-form-dialog.tsx` | проброс `takeRequest` |
| `src/components/booking-form/booking-form.tsx` | баннер `role="alert"` `tabIndex=-1` (title, description, «Повторить»), фокус на нём при `focus`; текст кнопки «Сохранить как новую бронь» |
| `src/components/day-view/day-grid.tsx` | кнопка «Удалить» (`aria-label` «Удалить бронь HH:mm–HH:mm, название») у незаблокированных, проп `onDelete` |
| `src/components/delete-dialog/delete-booking-dialog.tsx` | AlertDialog: «Удалить бронь?», описание, баннер ошибки, «Удалить»/«Удаляем…»/«Повторить», `AlertDialog.Cancel` (фокус по умолчанию); при pending диалог не закрывается |
| `src/components/dev-panel/dev-panel.tsx` | панель с двумя чекбоксами |
| `src/features/day-view/dev-tools.ts` | флаг `NEXT_PUBLIC_ENABLE_DEV_TOOLS === "true"`, `devRequest(state, "save" \| "delete")` |
| `src/features/day-view/day-view.tsx` | состояние удаления и мутация (успех/404 → объявление, фокус на «Новая бронь»), состояние dev-панели (одноразовый конфликт снимается в `takeSaveRequest`) |
| `src/app/globals.css` | кнопка «Удалить» в углу блока, узкий диалог, кнопка-«danger», баннер, dev-панель |
| `scripts/policy-check.mjs`, `docs/testing.md` | проверка «тексты ошибок API только в present-api-error.ts» (для мутации 8) |
| `.env.example` | `NEXT_PUBLIC_ENABLE_DEV_TOOLS=` |
| `.claude/launch.json` | конфигурация `dev-devtools`: добавлен `NEXT_PUBLIC_ENABLE_DEV_TOOLS=true` (ручная проверка панели) |

Ни один существующий тест не менялся: `git diff --cached --stat -- '*.test.ts' '*.test.tsx'` → `5 files changed, 743 insertions(+)`, строк с `-` нет.

### Gate

```text
=== gate: ЗЕЛЁНЫЙ ===
ok   tsc --noEmit
ok   eslint
ok   policy-check
ok   тесты, TZ=UTC — тестов: 546 (passed 546, failed 0)
ok   тесты domain и *.tz.test, TZ=America/Los_Angeles — тестов: 249 (passed 249, failed 0)
ok   next build
```

Число тестов: 506 (этап 5b) → 546 (+40: 14 unit, 26 ui), LA: 249 → 249 (новых тестов domain нет). Ни один не пропал.

### Мутации

Снимок до мутаций: `git add -A && git stash create` → `0a8d4d91682ba98d02fe69ded51b0a9288106aa2`. Каждая мутация — скрипт замены строки, прогон `TZ=UTC npx vitest run src/features` (127 тестов), откат `git checkout 0a8d4d91682ba98d02fe69ded51b0a9288106aa2 -- <файл>`. После отката 1–7: `Tests 127 passed (127)`; после отката 8: `policy-check: OK`; `git diff --stat` пусто.

| # | Мутация (файл) | Упавшие тесты | Итог |
|---|---|---|---|
| 1 | `hooks.ts`: `onError` create → `() => undefined`, update — `false ? invalidate(…)` вместо `isConflict(error) ? …` | hooks «B8: create → 409: список даты из формы перезапрошен…», «B8: update → 409 перезапрашивает список…»; тесты 19, 21, 22 (5 из 127) | поймана |
| 2 | `use-booking-form.ts`: при 409 `setValues(initial)` | 19, 20, 21, 22 (4) | поймана |
| 3 | `use-booking-form.ts`: убраны `setConflictErrors({})` и снятие баннера 409 в `onChange` | 19, 20 (2) | поймана |
| 4 | `use-booking-form.ts`: `onRetry` = `queryClient.invalidateQueries(bookingsKey(date))` | 24, 25 (2) | поймана |
| 5 | `booking-form.tsx`: убран `serverErrorRef.current?.focus()` | 19, 21 (2) | поймана |
| 6 | `day-view.tsx`: `false && isNotFound(error) ? finishDelete(…) : setDeleting(…)` | 32 (1) | поймана |
| 7 | `day-view.tsx`: `{(devToolsEnabled() \|\| true) && (` | 33, 34, 35 (3) | поймана |
| 8 | `booking-form.tsx`: `{serverError.title \|\| "Ошибка сервера"}` | `policy-check: FAIL — src/components/booking-form/booking-form.tsx: текст ошибки «Ошибка сервера» — только в src/features/bookings/present-api-error.ts`; ESLint — 0 ошибок (правила на тексты в lint нет) | поймана policy-check |

Непойманных и эквивалентных мутаций нет.

Первый прогон проверки 8 до правок нашёл 3 совпадения: два — комментарии «Ошибка сервера над формой» в `use-booking-form.ts` и `booking-form.tsx` (переформулированы в «Ответ сервера с ошибкой…»), одно — `PARSE_MESSAGE` «Сервер вернул неожиданный ответ…» в `src/api/http-bookings-api.ts`. Сообщения `src/api` — диагностика `ApiError.message`, после этапа 6 в UI не выводятся и api-тестами не проверяются; проверка ограничена UI-слоями (`src/features`, `src/components`, `src/app`) — см. отклонение 3.

### Проверки поиском

| Проверка | Команда | Результат |
|---|---|---|
| `window.confirm` не используется | `grep -rnE 'window\.confirm\|\bconfirm\(' src --include='*.ts' --include='*.tsx' \| grep -v '\.test\.'` | пусто; единственное упоминание — шпион в тесте 28 (`vi.spyOn(window, "confirm")`, не вызывается) |
| Числа правил вне domain | `grep -rnwE '30\|100\|120\|540\|1080' src/features src/components` (без тестов и test-utils) | только комментарии (`use-booking-form.ts:83`, `day-grid.tsx:1`, `grid-placement.ts:1`) и `* 100%` внутри CSS-`calc` в шаблонной строке `day-grid.tsx:30–31` (этап 5b); lint-правило на числа (gate, `eslint`) — зелёное |
| `Date.now` / `new Date()` без аргумента | `grep -rnE 'Date\.now\(\|new Date\(\)' src` (без тестов) | только `src/features/clock.ts:9`, `src/server/clock.ts:8` |
| Компоненты не импортируют `src/api` | `grep -rnE "from ['\"](@/\|(\.\./)+)(api\|server\|features)" src/components` | пусто; плюс lint `no-restricted-imports` в gate |

### Ручная проверка (встроенный браузер)

Dev-сервер: на порту 3000 работал `next dev` **другого проекта** (`/Users/gs/Projects/Danco-Frontend`, PID 76210) — не трогался; сервера этого проекта не было (порт 3001 этапа 5 свободен). Запущен свой `dev-devtools` (`.claude/launch.json`, порт 3101, `ENABLE_DEV_TOOLS=true NEXT_PUBLIC_ENABLE_DEV_TOOLS=true`) — чистый seed: на `2026-10-09` `10:00–11:00 Ретро`, `11:00–12:00`, `15:30–17:00 Демо`. Время проверки — вечер 2026-10-08 (после 17:30), поэтому всё на `?date=2026-10-09`. После проверки сервер остановлен.

| Что | Шаги | Результат |
|---|---|---|
| «Удалить» и aria-label | открыть `?date=2026-10-09` | кнопки «Удалить бронь 10:00–11:00, Ретро», «Удалить бронь 11:00–12:00, Без названия», «Удалить бронь 15:30–17:00, Демо»; dev-панель видна |
| Удаление: Esc | клик «Удалить» у 11:00–12:00; Esc | alertdialog «Удалить бронь? / Бронь 11:00–12:00 будет удалена / Удалить / Отмена», фокус на «Отмена»; после Esc диалога нет, фокус на «Удалить бронь 11:00–12:00…», бронь на месте, запросов DELETE нет |
| Удаление с клавиатуры | Enter на сфокусированной «Удалить …»; Shift+Tab → «Удалить»; Enter | `DELETE /api/bookings/<id> → 204`, затем `GET ?date=2026-10-09 → 200`; брони 11:00–12:00 нет; aria-live «Бронь удалена»; фокус на «Новая бронь» |
| 404 при удалении | вкладка 1: открыть диалог удаления 10:00–11:00; вкладка 2: тот же адрес, удалить 10:00–11:00 («Бронь удалена»); вкладка 1: «Удалить» | `DELETE … → 404`, затем `GET → 200`; диалог закрыт, `role="alert"` нет, aria-live «Бронь уже удалена», брони нет, фокус на «Новая бронь» |
| B8 главный | включить «Симулировать конфликт при следующем сохранении»; «Новая бронь»; клавиши `1 3 0 0`, Tab Tab, `1 4`, Tab, «Демо» (13:00–14:00 в UI свободно); Enter | `POST /api/bookings → 409`, затем `GET ?date=2026-10-09 → 200` (на дату формы); диалог открыт, значения `13:00`/`14:00`/«Демо»; alert «Это время только что заняли: 13:00–14:00. Выберите другой интервал / Список броней обновлён» (у «чужой» брони сервера нет названия), **фокус на alert**; «Начало» и «Окончание» `aria-invalid="true"` с «Пересекается с бронью 13:00–14:00», оба редактируемы; варианты конца 13:30–15:00 `disabled` («недоступно: Это время уже занято…»), «Нет доступного окончания для этого начала»; в сетке «13:00–14:00 Без названия»; «Сохранить» активна; переключатель снят |
| B8: снятие и сохранение | клик в «Начало», `1 4 0 0` | alert 409 и пометки пропали; конец сброшен (14:00 не подходит), подсказка о сбросе и ошибка «Выберите время окончания» (форма уже отправлялась) |
| | Tab Tab, `1 5`; Enter | `aria-invalid` нет; `POST → 201`, `GET → 200`; диалог закрыт, «Бронь создана», в сетке «14:00–15:00 Демо» |
| «Медленная сеть» | включить; «Новая бронь» 09:00–09:30; Enter; через 0,5 с прочитать кнопку | «Сохраняем…», `disabled`, «Начало» `readOnly` (скриншот); через ~2 с диалог закрыт, «Бронь создана»; переключатель остался включённым |
| Ошибка сети | выключить «Медленную сеть»; в странице `window.fetch` для `POST` подменён на `Promise.reject(new TypeError('Failed to fetch'))` (только для наблюдения, как на этапе 5); форма 11:00–12:00 «Сеть»; Enter | alert «Нет связи с сервером / Проверьте подключение и повторите / Повторить»; значения на месте; «Сохранить» активна; `GET` после ошибки нет |
| «Повторить» | `fetch` восстановлен; фокус на «Повторить» с клавиатуры (Shift+Tab ×8: поле «Дата» — три сегмента, ловушка замкнулась на «Отмена», затем Tab); Enter | один `POST → 201`, затем `GET → 200`; между ошибкой и повтором `GET` нет (D4); «Бронь создана», в сетке «11:00–12:00 Сеть» |
| 320 px | `resize 320×700`, перезагрузка; открыть диалог удаления | `scrollWidth` 320 = `innerWidth`; кнопки «Удалить» внутри экрана; диалог 16–304 px; dev-панель в пределах экрана (скриншот) |
| 1280 px | `resize 1280×800` | `scrollWidth` 1280 = `innerWidth`, прокрутки нет |
| Клавиатура | blur, Tab ×24, порядок по `focusin` | Назад → Сегодня → Вперёд → Дата → Новая бронь → для каждой брони по времени «Изменить бронь …» → «Удалить бронь …» → два переключателя dev-панели → индикатор Next dev → по кругу; рамка фокуса видна (скриншот после Esc) |

Побочный эффект: в памяти остановленного сервера были брони ручной проверки; после остановки их нет (in-memory).

### Отклонения от плана

1. **`src/features/day-view/dev-tools.ts`** — нет в таблице файлов шага 1 (там состояние панели «в DayView»). Флаг и сборка заголовков вынесены в модуль, чтобы `DayView` не содержал имён заголовков. Функции: `devToolsEnabled`, `devRequest`.
2. **`isRetryable`** в `present-api-error.ts` — нет в плане; решение «показывать ли «Повторить»» (5xx, NETWORK) рядом с текстами тех же ошибок.
3. **Проверка policy-check для мутации 8** — в плане шага 1 была «проверка поиском на шаге 7», заказчик потребовал, чтобы мутацию 8 ловил lint или policy-check. Добавлена `checkErrorTexts` (`scripts/policy-check.mjs`, строка в `docs/testing.md`). Область — `src/features`, `src/components`, `src/app`, без `src/api` (`ApiError.message` клиента — диагностика). ESLint её не ловит.
4. **Сводка клиента скрыта, пока виден баннер сервера** — не было в плане. Без этого после 409 и перезапроса списка появлялся второй `role="alert"` («Исправьте ошибки: …пересекается…») с тем же смыслом, что баннер 409.
5. **`tsc`** упал на первом прогоне реализации: guards `isConflict`/`isNotFound`/`isNetwork`/`isValidation` сужают `ApiError` до `never` в ветке «нет». В `present-api-error.ts` ветки по `code`/`status` (комментарий в коде).
6. **Ручная проверка:** `computer.type` не вводит цифры в `input type="time"` встроенного браузера (значение пустое, запрос не уходил — сработала клиентская сводка); ввод отдельными нажатиями `key` работает. Первый заход B8 из-за этого дал пустую форму без запросов; повторён.
7. **`.claude/launch.json`** (в git) изменён: добавлен клиентский флаг в `dev-devtools`.

### Для README

1. **«Медленная сеть» не влияет на загрузку списка**: `X-Mock-Delay: 2000` уходит только у `create`, `update`, `remove` (`BookingsApi.list` не принимает параметр запроса).
2. **«Симулировать конфликт» срабатывает один раз**: переключатель снимается после ближайшего сохранения (создание или правка).
3. **404 = мягкий успех при удалении**: «Бронь уже удалена», список перезапрашивается. При правке 404 — «Бронь была удалена» и «Сохранить как новую бронь».
4. **Dev-панель** — `NEXT_PUBLIC_ENABLE_DEV_TOOLS=true` (клиент, встраивается при сборке) **и** `ENABLE_DEV_TOOLS=true` (сервер); оба — только строкой `true`.

## Stage-gate

| Пункт | Доказательство |
|-------|----------------|
| ☑ Команда на этап была | первая строка трейса — цитата команды; команда шага 5 — тоже цитатой |
| ☑ Gate зелёный | вывод в разделе «Gate» (546/546, LA 249/249, build ok); повторный прогон перед коммитом — ниже |
| ☑ Красный прогон был | шаг 2: 34 падения по правильной причине, 0 ошибок импорта; тест 40 — отдельный красный прогон; «вывод ожидания» — шаг 1 и тест 40 |
| ☑ Трейс заполнен | план, ID, файлы, вывод тестов, мутации M1–M8, ручная проверка, отклонения 1–7 |
| ☑ Время записано | `docs/time-log.md`, строка 6 — старт и конец из `date` |
| ☑ Затронутые проверки найдены до реализации (INC-6) | шаг 1: команда grep и 98 совпадений с разбором; правок тестов не потребовалось, после реализации ни один старый тест не упал |
| ☑ Требования сверены | F6 (7 тестов + 40), B8 (13), U3 (18), U4 (3), A2 (4 с тестом 40), B11 (1), F5/404 (3); ручной сценарий B8 по plan.md пройден |
| ☑ Нет `.skip`/`.only`/`xit`/`it.todo` | `policy-check: OK` в gate |
| ☑ Нет `@ts-ignore`/`any`; `eslint-disable` этапа | новых нет (`git diff --cached \| grep -E 'eslint-disable\|ts-ignore\|: any'` — пусто) |
| ☑ Тесты не ослаблены | 506 → 546; в тестовых файлах только добавления (743 insertions, 0 удалённых строк) |
| ☑ Бизнес-правила в domain, часы | проверки поиском выше; lint в gate |
| ☑ Domain не мокается | `policy-check: OK` |
| ☑ Компоненты не импортируют `src/api` | grep пусто, lint в gate |
| ☑ Зависимости в журнале | `@radix-ui/react-alert-dialog` 1.1.23 записан до установки; `policy-check: OK` |
| ☑ `.env*` и `~/.ssh` не трогались | изменён только `.env.example` (`NEXT_PUBLIC_ENABLE_DEV_TOOLS=`, без значения); флаги ручной проверки — через `.claude/launch.json` |
| ☑ Инциденты | нарушений правил и неожиданных поломок нет; `tsc` и ложные срабатывания проверки — в «Отклонениях» |
| ☑ INDEX.md | строка этапа 6 добавлена |
| ☐ После коммита и push — СТОП | закрывается в следующей работе с коммитом |
