# Бэклог

Здесь находится только намеренно отложенная, заблокированная, заведомо
неисправленная или неподдерживаемая работа. Текущий прогресс и временное
состояние gates остаются в локальных планах запуска. У каждой записи есть
причина, практическое влияние и следующий шаг.

## Открыто

### Полный ответ Paseo не выдерживает reviewer-нагрузку с инструментами

**Причина.** В Paseo 0.3.1 и 0.4.0 `wait --json.message` показывает только пять
последних activity items. В реальных reviews эти слоты заняли `[Read]`, `[Shell]`,
`[Thought]`, неразмеченный reasoning и final text: точный prompt пользователя
либо вытесняется, либо граница ответа становится неоднозначной. Ранние normal и
long fixtures не запускали инструменты репозитория и поэтому не квалифицировали
настоящую reviewer-нагрузку. Публичная команда
`paseo logs <id> --filter text --tail 1` вернула полный final text двух
наблюдавшихся reviewers, но ещё не прошла normal и long fixtures с инструментами
для всех трёх harness.

**Практическое влияние.** Orchestration и standalone review через Paseo остаются
неподдерживаемыми: маршрут обязан сообщать получение полного ответа как `unknown`,
а не выбирать reasoning item или устаревший bounded activity item.

**Следующий шаг.** Квалифицировать документированную публичную filtered-log
поверхность или другое публичное response field с normal и трёх-
четырёхэкранными `BEGIN`/`MIDDLE`/`END` fixtures, использующими инструменты, на
Codex, Claude Code и OpenCode. Удалить запись и заявить поддержку маршрутов
можно лишь тогда, когда каждый harness возвращает ровно свой settled response.
Отсутствующие unbounded turn identity и response surface отслеживаются в
[getpaseo/paseo#3478](https://github.com/getpaseo/paseo/issues/3478).

### Поддержка полного ответа Herdr остаётся ограниченной фикстурами

**Причина.** Установленный Herdr 0.8.0 отдаёт lifecycle metadata через
`agent get`, но не имеет structured settled-response field. Публичный
`agent read --source recent-unwrapped` может вернуть только строки, сохранённые
терминалом; alternate-screen harness способен потерять или продублировать
восстановленные строки. Live long fixture OpenCode 1.18.15 на Herdr 0.8.0 вернула
все 220 уникальных filler rows, но на 400 строках продублировала начальный
fragment и 62 filler rows; больший read сместился за пределы ответа. Codex и
Claude Code прошли ту же fixture, но backend-owned evidence не доказывает точный
полный ответ OpenCode.

**Практическое влияние.** Поддержку полного ответа Herdr нельзя заявлять, поэтому
и orchestration, и standalone-review routes остаются неподдерживаемыми. Эта
устойчивая capability-запись заменяет disposition row 7 transition spec: одна и
та же отсутствующая response surface блокирует live qualification standalone
review skill.

**Следующий шаг.** Запросить upstream structured complete-response surface либо
исправить реконструкцию alternate screen OpenCode в Herdr так, чтобы один
публичный read возвращал каждый byte ответа ровно один раз. Затем повторить
normal и long fixtures; private transcripts и agent-authored result files не
подменяют доказательство. Повтор также должен заново подтвердить OpenCode
readiness через точное public TUI или effective posture evidence;
`screen_detection_skipped: true` само по себе ничего не доказывает. Дублирование
terminal reconstruction отслеживается в
[herdrdev/herdr#2893](https://github.com/herdrdev/herdr/issues/2893).

### Watchdog с локальной моделью не реализован

**Причина.** Эта фича намеренно сначала поставляет pattern-based shell observer.
Второму watchdog на небольшой локальной модели через Ollama или LM Studio нужен
конкретный контракт model/runtime и измеримая польза.

**Практическое влияние.** Известные тексты limit, overload, question и failure
можно классифицировать без cloud inference; новые или неоднозначные состояния
по-прежнему должен интерпретировать человек.

**Следующий шаг.** Сделать prototype одного local-only classifier на сохранённых
credential-free backend states, сравнить его с pattern script и специфицировать
реализацию только при существенном улучшении detection без daemon или
persistent run state.
