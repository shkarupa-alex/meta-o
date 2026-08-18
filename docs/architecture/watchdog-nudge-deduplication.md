# §A-WATCHDOG-01 — Deduplication nudge watchdog хранит один private digest

## Решение

Перед разрешённым nudge pattern watchdog хранит одну mode-`0600` запись на
backend locator. Запись содержит digest backend, locator и normalized native
state, а также digests сообщений, уже доставленных в этом state. Следующий запуск
подавляет повтор сообщения, пока state не изменилось. Новое state заменяет
предыдущий набор сообщений. Запись не хранит message, response, actor registry,
candidate identity или gate result.

Helper разбирает backend list JSON через `jq`, сообщает каждый native locator
отдельно и сравнивает backend-specific semantic projection. Для Orca projection
сохраняет typed dispatch, worker, observation и permission state вместе с
terminal connection/orphaning, но исключает RPC IDs и terminal `preview`, `title`
и `lastOutputAt`: это presentation и repainting, а не переход состояния, который
должен блокировать delivery. Paseo исключает обновляемое `UpdatedAt`. Delivery в
Herdr и Paseo nonblocking; дальнейший observe отвечает за completion.
Вызывающая target- или scan-поверхность передаёт native item kind. Projection не
угадывает его по случайным metadata keys и читает permission state только из
точного observation field, а не рекурсивным поиском options.

Helper принимает nudge только после двух успешных одинаковых reads. Зрелый
advisory lock `flock` охватывает duplicate check, reservation и native delivery
для locator; kernel освобождает ownership при завершении process. Message digest
резервируется до delivery: crash или nonzero backend result неоднозначны и
остаются suppressed до изменения native state, чтобы не рисковать duplicate
nudge. Шестнадцать разных message digests в одном неизменном state сворачиваются
в один saturation marker: запись остаётся bounded и fail-closed до смены state.

## Бизнес-причина

Пользователю нужен watchdog, способный подтолкнуть агента, застрявшего на API
limit или overloaded inference, не ожидая его ответа и не повторяя одинаковый
nudge, когда отдельные запуски watchdog видят неизменное состояние. Без durable
fingerprint перезапущенный observer не выполнит второе требование. Без parsing по
сессиям failed session может скрыть working session, а пользователь не узнает,
какой target требует внимания.

Это §B-UPTIME-02 и §B-UPTIME-03: наблюдатель существует ради лимитов и
перегрузки, а пропущенное пробуждение считается дефектом. Именованное исключение
из общего запрета на state store требует §B-CONTROL-04. Если §A-WATCHDOG-01
отменяется, private digest, его lock и saturation marker удаляются целиком, а
watchdog возвращается к повторяющемуся nudge на неизменном state.

## Граница

Этот узкий delivery fingerprint — именованное исключение из общего запрета на
state stores. Это не orchestration state: он не возобновляет и не выбирает
workflow work. Удаление может вызвать duplicate nudge, но не потерю product work
или invalidation candidate. Для disposable testing каталог можно переопределить
через `WATCHDOG_STATE_DIR`.
