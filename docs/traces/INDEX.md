# Трейсы — навигация

| Этап | Трейс | Коммит | Суть |
|------|-------|--------|------|
| 0 | [stage-0.md](stage-0.md) | `stage 0: bootstrap`, `stage 0: context and requirements` | Понимание ТЗ, требования, решения, контекст агента, план, ревью документов |
| 0b | [stage-0.md](stage-0.md), [incidents.md](incidents.md) (INC-2) | `stage 0: deny rules` | Deny-правила в `.claude/settings.json`, раздел в security.md; время не измерено (INC-2) |
| 0c | [incidents.md](incidents.md) (INC-2) | `stage 0: time-log rule for out-of-stage work` | Раздел AGENTS.md «Время — для любой работы», `scripts/policy-check.mjs`, хук `pre-commit` |
| 1 | [stage-1.md](stage-1.md) | `stage 1: domain (gate green)` | Каркас Next.js + TS strict, gate (2 пояса), lint-правила и policy-check, domain B1–B7, B9–B12 (187 тестов), мутации |
| 2 | [stage-2.md](stage-2.md) | `stage 2: mock api (gate green)` | Mock API на Route Handlers: GET/POST/PATCH/DELETE, store на globalThis с seed, единый формат ошибок 400/404/409/422, dev-заголовки `X-Mock-Force-Conflict`/`X-Mock-Delay`, 146 api-тестов (всего 333), мутации M1–M4 |
| 2b | [stage-2.md](stage-2.md#2b-долг-o4) | `stage 2b: domain unit tests for helpers (gate green)` | Долг O4: unit-тесты `normalizeTitle`, `bookingsOverlap`; предложения P1–P4 (автоматика «сверх задания») |
| 3 | [stage-3.md](stage-3.md) | `stage 3: api client and hooks (gate green)` | `BookingsApi` + HTTP-клиент (`ApiError`, NETWORK/PARSE, таймаут, отмена), хуки TanStack Query через контекст, инвалидация после успеха и 409, гонка дат; 36 тестов (всего 395), мутации M0–M4, INC-3, INC-4 |
| 3b | [stage-3.md](stage-3.md#3b-d7-d8) | `stage 3b: expectation rule and fake ordering test (gate green)` | Правило «вывод ожидания» (D7), тест порядка в fake (D8), INC-4 закрыт |
| 4 | [stage-4.md](stage-4.md) | `stage 4: day view (gate green)` | Экран дня: дата в `?date` (кнопки, поле «Дата», невалидная → сегодня), сетка CSS Grid по 30 мин с позицией из минут, прошедшее время и брони только для чтения, состояния U1–U3, keepPreviousData, отмена без ошибки (D2); 44 теста (всего 439), мутации M1–M5, INC-5 |
| 4b | [stage-4.md](stage-4.md#4b-заметки-для-readme) | `stage 4b: notes (gate green)` | INC-5 — эквивалентная мутация; заметки для README |
| 5 | [stage-5.md](stage-5.md) | `stage 5: booking form (gate green)` | Форма брони в Radix Dialog: создание, правка (PATCH изменённых полей, самоконфликт), только чтение начавшихся броней, варианты конца с причиной (`getEndOptions`), минимум начала и «на сегодня недоступно» (`getEarliestStart`), ошибки у полей и 422 сервера, защита от двойного submit, возврат фокуса; 56 тестов (всего 495), мутации M1a–M6, INC-6, INC-7 |
| 5b | [stage-5.md](stage-5.md#5b-inc-6-inc-7-validatestart) | `stage 5b: lint numbers, validateStart (gate green)` | Правило grep затронутых проверок в AGENTS.md (INC-6); M1a — эквивалентная мутация; lint на числа 30/100/120/540/1080 в `src/features`, `src/components` (M4 поймана); тест возврата сброшенного конца; `validateStart` в domain; 11 тестов (всего 506) |
| 6 | [stage-6.md](stage-6.md) | `stage 6: delete, conflict, errors (gate green)` | Удаление в Radix AlertDialog (фокус на «Отмена», pending, «Повторить», 404 — мягкий успех); `presentApiError` — все тексты ошибок API, проверка в policy-check; 409 с пометкой полей, фокусом на сообщении и перезапросом на дату формы; 404 на PATCH → «Сохранить как новую бронь»; 5xx/NETWORK → «Повторить» мутации (D4); dev-панель за `NEXT_PUBLIC_ENABLE_DEV_TOOLS`; 40 тестов (всего 546), мутации M1–M8 пойманы |
| 7 | [stage-7.md](stage-7.md) | `stage 7: responsive and a11y (gate green)` | Цели касания 44 px (кнопки, поля, ряд сетки, «Удалить» рядом с бронью без наложения), рамки `#767676` (4.54:1), кольцо фокуса над соседней бронью, `prefers-reduced-motion`; jest-axe на экране дня, форме и диалоге удаления; 10 тестов (всего 556), мутации 1–6 пойманы; reduced motion, обычный браузер и Lighthouse не проверены (INC-8) |
| 7b | [stage-7.md](stage-7.md#7b-находка-на-реальных-телефонах-dev-сервер-по-ip-не-гидратируется) | вместе с 7c, 7d: `stage 7b: allowedDevOrigins via env, pre-delivery checks (gate green)` | Dev-сервер по IP не гидратируется на телефоне (INC-9), расследование |
| 7c | [stage-7.md](stage-7.md#7c-allowed_dev_origins-devlan) | см. 7b | `ALLOWED_DEV_ORIGINS`, `dev:lan`, пункты pre-delivery |
| 7d | [stage-7.md](stage-7.md#7d-доказательства-закрытия-этапа-7-коммит-7b7c) | см. 7b | Доказательства этапа 7, IP заменён на `<LAN-IP>` |
| 7e | [stage-7.md](stage-7.md#7e-долги-этапа-7-данные-заказчика) | `stage 7e: lighthouse and device checks (gate green)` | Lighthouse и телефоны (данные заказчика), INC-8 открыт |
| 8 | [review.md](review.md) | `stage 8: independent review` | Независимое ревью: 3 blocker (сдача), 3 major (J1–J3), 17 minor |
| 8b | [review.md](review.md#8b-исправления-ревью) | `stage 8b: review fixes (gate green)` | J2 детерминированные id seed, J3 кнопки прежнего списка disabled, m1 длина названия после trim, m3 один текст B11, INC-10 (J1) и пункт stage-gate, статусы INC-3/INC-9, устаревшие документы, [README-notes.md](README-notes.md); 566 тестов |

- Инциденты: [incidents.md](incidents.md)
- Переписка с AI: `chats/` (появится на этапе 9)
