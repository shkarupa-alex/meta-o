# Decision ledger

| ID | Decision | Status | Rationale | Source |
|---|---|---|---|---|
| D-001 | Поставка состоит из master-spec и шести implementation-ready подспек | adopted | Система велика, но подспеки должны иметь единый lifecycle и терминологию | user interview; synthesis |
| D-002 | Один полный workflow без quality modes | adopted | Экономия на глубине и cross-review не является целью | user interview |
| D-003 | Feature-spec создаётся вне workflow и является immutable input | adopted | Оркестратор не должен становиться spec author или validator | user interview |
| D-004 | Spec закрепляется `sha256` и временным immutable blob | adopted | Свежим sessions нужен acceptance oracle после retirement tracked-спеки | gpt/r2; premortem-gpt |
| D-005 | Оркестратор управляет процессом и не изучает код | adopted | Его ограниченный контекст должен жить дольше рабочих ролей | my-opinion; user interview |
| D-006 | Рабочий model set содержит executor, same-family reviewer, cross-vendor reviewer и E2E tester | adopted | Две независимые ошибки review плюс отдельная поведенческая проверка | user interview |
| D-007 | Model set подтверждается при user start/resume; auto-recovery его переиспользует | adopted | Иначе ночной quota wake остановится на человеческом gate | fable/r2; user interview |
| D-008 | Sessions расходны и не переносятся между features | adopted | Долговечность роли полезна только пока контекст актуален и экономичен | user interview |
| D-009 | Executor handoff-файл опционален и ограничен 4 KiB | adopted | Пользователь выбирает цену дополнительного артефакта | user interview; gpt/r2 |
| D-010 | Runtime использует один atomic `~/.meta-o/projects/<project-key>/runs/<id>/state.json` | adopted | Fresh orchestrator должен восстановить FSM без task graph и transcript, не создавая служебных файлов в репозитории | kimi/r1; user correction |
| D-011 | Собственный daemon, session DB, durable queue и dedup ledger не создаются | adopted | Session lifecycle и delivery принадлежат Herdr/Omnigent | user interview |
| D-012 | Backend допускается только после повторяемой capability suite | adopted | Разовый spike не защищает от capability rot | gpt/r3 reviews; premortem-kimi |
| D-013 | Неопределённый delivery не вызывает blind resend | adopted | Без native idempotency повтор способен создать двойную работу | gpt/r2; fable/r2; premortem |
| D-014 | FSM имеет stall deadline и `PAUSED_BACKEND_UNCERTAIN` без watchdog | adopted | Liveness основного workflow не должна зависеть от опционального компонента | premortem-kimi |
| D-015 | Watchdog опционален, включается пользователем и наблюдает несколько projects | adopted | Он нужен для unattended runs, но не всем пользователям | user interview |
| D-016 | Watchdog deterministic; local LLM только закрытый classifier | adopted | Вероятностная модель не должна самостоятельно возобновлять sessions | gpt/r2; fable/r2; kimi/r1 |
| D-017 | Reuse scan — явная стартовая опция | adopted | Его правильное место между spec creation и execution пока не решено | user interview |
| D-018 | Business `§B-*` — верхняя точка истины | adopted | Код не сохраняет исходную потребность и причину поведения | user interview; scratchpad |
| D-019 | Knowledge chain: `§B → §A → §M → symbol` | adopted | Даёт причинную трассировку с минимальной ссылкой на один уровень вверх | gpt/r2; grace; scratchpad |
| D-020 | Purpose обязателен у всех first-party modules/classes/functions/methods, включая private/tests | adopted | Через много итераций должна сохраняться причина существования | user interview |
| D-021 | Native docstring style, без обязательного XML/`@purpose` | adopted | Формат вторичен, если lint надёжен и стиль языка сохранён | user interview |
| D-022 | Механика проверяет наличие/links; reviewers — смысл и drift | adopted | Семантику purpose нельзя надёжно свести к regex | user interview; all proposals |
| D-023 | Planned `§B-TODO/§A-TODO` до реализации не пишутся | rejected | Future truth загрязняет текущий источник истины и требует cleanup при abort | gpt/r2; synthesis |
| D-024 | План knowledge changes временно живёт в `KnowledgeImpactPlan` | adopted | Даёт planning без смешивания planned и factual knowledge | gpt/r2 |
| D-025 | Knowledge sync и retirement tracked-spec входят в review candidate | adopted | Post-attestation semantic writes сделали бы review недействительным | round-3 reviews |
| D-026 | Review findings не сохраняются в project ledger | adopted | Они нужны только текущим sessions; архив создаёт artifact bloat | user interview |
| D-027 | Существенные решения живут во временном compact decision log | adopted | Уменьшает копипаст и переносит устойчивый rationale в knowledge/code | user interview |
| D-028 | `docs/architecture/e2e.json` связывает E2E scenario с `§B`, snapshot, датой и status | adopted | Registry читается `make qc`, а инструкции и сценарии живут рядом в `e2e.md`; сырые логи/скриншоты не сохраняются | user correction |
| D-029 | Полный cold archive external specs не создаётся | rejected | Пользователь требует retirement, а архив снова становится скрытым источником | user interview; premortem-gpt alternative |
| D-030 | Verification хранит compact `run_id/spec_digest/anchor` provenance | adopted | Это помогает восстановить происхождение без хранения старой спеки | premortem-kimi |
| D-031 | Completion attests stable `snapshot_digest`, не commit SHA | adopted | Rebase/squash меняют SHA без изменения проверенного содержимого | premortem-gpt |
| D-032 | Из snapshot digest исключается только `e2e.json.scenarios[*].last_run`; catalog fields остаются attested | adopted | Устраняет self-reference, не позволяя менять selection catalog после review | synthesis; final council review |
| D-033 | Любое изменение code/tests/config/knowledge/purpose инвалидирует attestations; повторные gates батчатся внутри review- и E2E-loops | adopted | Один итоговый snapshot получает все подтверждения без бессмысленного cross-review каждого мелкого E2E-fix | user correction; final council review |
| D-034 | Knowledge-only изменения сохраняют E2E attestation | rejected | Dual behavioral/knowledge revisions сложнее и ослабляют строгий процесс | premortem-kimi alternative |
| D-035 | Local `make qc` — обязательный authoritative gate; CI не требуется | adopted | Workflow должен полноценно работать без CI через project-owned интерфейс | user correction |
| D-036 | Pre-commit быстрый и опциональный; pre-push/CI дублируют full QC | adopted | Частые agent commits не должны провоцировать `--no-verify` | fable/r2; user interview |
| D-037 | Skill задаёт Python QC best practices: Ruff, type policy, pytest, Import Linter, purpose/knowledge/code-health checks | adopted | Конкретный набор адаптируется к проекту и реализуется через его Makefile | user correction; gpt/r2 |
| D-038 | Непроектные helper scripts skills пишутся на TS и компилируются в dependency-free JS | adopted | Переносимый bundle не должен тащить runtime npm install; project QC сюда не входит | user interview; user correction |
| D-039 | Bundled language-specific QC/AST adapter | rejected | Реализация lint/test/build принадлежит проекту и вызывается через Makefile | user correction |
| D-040 | Code health thresholds project-configurable в `pyproject.toml` | adopted | Универсальные числа не подходят всем Python-проектам | user interview |
| D-041 | Brownfield использует structural ratchet, но не purpose baseline | adopted | Старые метрики можно заморозить; причинная документация — hard constraint | gpt/r2; user interview |
| D-042 | Graph gate требует boundary membership, запрещает новые SCC/cycles и ratchet edges/fan | adopted | LOC/complexity не ловят связанность и cascade-change cost | premortem-gpt |
| D-043 | Brownfield adoption идёт dependency-closed roots через manifest | adopted | Делает 100% purpose выполнимым по проверяемым этапам | premortem-gpt |
| D-044 | Risk-based purpose вместо all-symbol purpose | rejected under current constraints | Снижает cargo cult, но прямо нарушает hard decision пользователя | all judges dissent |
| D-045 | Review rubric обязателен, порядок анализа свободный | adopted | Конкретные lenses дают стабильнее результаты без микроменеджмента модели | user interview |
| D-046 | Finding обязан иметь severity, evidence и basis; все реальные defects включая minor исправляются | adopted | Это отделяет дефект от вкуса и предотвращает тихий debt | user interview |
| D-047 | После двух rebuttal cycles возможен fresh technical adjudicator | adopted | Оркестратор не должен разрешать code-heavy спор вслепую | gpt/r2; fable/r2 |
| D-048 | Лимит review/E2E alternations и автоматическая эскалация churn пользователю | rejected | Циклы продолжаются сколько нужно; пользователь сам запрашивает статус | user correction; fable alternative |
| D-049 | Перед первым review выполняется короткий smoke preflight tester | adopted | Не тратить два reviews на продукт, который не собирается или не стартует | kimi/r1 |
| D-050 | Первый heavy E2E начинается после PASS обоих reviewers | adopted | Полный E2E на сырой реализации слишком дорог; дальнейшие review/E2E идут отдельными stabilization loops | user interview; user correction |
| D-051 | Полный архитектурный аудит проекта и stale feature flags вне scope | adopted | Это отдельный инструмент, а feature workflow содержит только local gates | user interview |
| D-052 | Debt в scope исправляется; старый внешний debt идёт в `docs/todo.md` | adopted | Не расширять spec, но не терять реальную проблему | user interview |
| D-053 | Agent commits locally; push/PR только по просьбе пользователя | adopted | Git sharing остаётся человеческим действием | user interview |
| D-054 | Project не pin'ит и не проверяет skill version | adopted | Пользователь управляет установкой; поломка эскалируется | user interview |
| D-055 | Herdr и Omnigent остаются backend alternatives | adopted | Методология зависит от capability contract, не бренда | user interview |
| D-056 | Default backend выбирается после capability suite | deferred | Реальные возможности и семантика меняются по версиям | web verification; premortem |
| D-057 | PHP/JS adapters | deferred | Сначала нужен concrete Python path, остальные языки проектируются отдельно | user interview |
| D-058 | Точные context/cache/code-health thresholds | deferred | Требуют измерения на реальных проектах и подписках | my-opinion; all proposals |
| D-059 | Gate cycle использует единый content snapshot; dual behavioral/semantic digest не вводится | adopted | Оба review завершаются до heavy E2E, а semantic writes после E2E запрещены; E2E-инвалидация нужна только после реального исправления | lifecycle approval; premortem-fable alternative |
| D-060 | Ослабление QC-конфига или baseline относительно `baseRevision` требует решения пользователя | adopted | Executor не должен иметь возможность незаметно ослабить контролирующий его gate | premortem-fable; lifecycle approval |
| D-061 | Только открытые findings временно сохраняются во внешнем run-state | adopted | Это переживает смерть оркестратора, не создавая project ledger или cross-feature архив | premortem-fable; lifecycle approval |
| D-062 | При retirement требования распределяются по подходящим слоям `§B → §A → §M → symbol` | adopted | Спека может менять не только бизнес-истину, но и архитектурные или локальные инварианты | user correction; premortem-fable |
| D-063 | Отдельный completion report не создаётся | adopted | Человек читает knowledge-файлы или обычный Git diff; дополнительный артефакт не нужен | user correction |
| D-064 | Все непроектные настройки и runtime artifacts хранятся под `~/.meta-o/projects/<readable-path>--<path-hash>/` | adopted | Любой проект работает без служебных файлов и изменений `.gitignore`, а skills восстанавливают state по canonical absolute path | user correction |
| D-065 | Бизнес-уровень хранится в одном `docs/knowledge/business.md`, glossary обязателен | adopted | Человек должен иметь возможность гарантированно прочитать всю верхнюю истину и единый словарь | user correction |
| D-066 | Tracked `Makefile` является контрактом lint/test/build/QC; оркестратор проверяет его на preflight | adopted | Методология задаёт интерфейс и best practices, а конкретный toolchain остаётся частью проекта | user correction |
| D-067 | Project ModelSet хранится в `~/.meta-o/projects/<project-key>/settings.json` | adopted | Набор должен восстанавливаться детерминированно по пути проекта и не попадать в репозиторий | user correction |
| D-068 | `docs/architecture/e2e.md` обязателен; оркестратор предлагает создать/настроить его при отсутствии | adopted | E2E tester должен иметь project-owned инструкции по environment, сценариям и cleanup | user correction |
| D-069 | Reviewer обязан приложить рекомендуемый оптимальный способ исправления к finding | adopted | Это сокращает дополнительные turns, сохраняя право executor выбрать лучшее аргументированное решение | user correction |
| D-070 | Review-fix и E2E-fix — отдельные stabilization loops без взаимного перезапуска после каждого мелкого fix | adopted | Сначала стабилизируется текущий контур; другой повторяется только для итогового изменённого snapshot | user correction |
| D-071 | Число review/E2E cycles не ограничивается и само по себе не эскалируется пользователю | adopted | Пользователь сам решает, когда запросить объяснение длительности | user correction |
| D-072 | Gates исполняются на clean candidate commit в отдельных detached worktrees | adopted | Результат нельзя случайно получить на разных или мутировавших рабочих деревьях | final council review |
| D-073 | E2E tester формирует selection plan до reviews, а оба reviewers проверяют его полноту | adopted | Иначе реализация может пройти reviews и неполный набор сценариев | final council review |
| D-074 | В каждом проекте есть минимум один `always_required` E2E scenario | adopted | Изменения без очевидных business links всё равно получают поведенческий canary | final council review |
| D-075 | External run-state имеет короткий per-run writer lock и одну write-ahead `PendingOperation`, но не project-wide serialization | adopted | Crash recovery не должен превращаться в собственную очередь или мешать обычным параллельным branches | final council review |
| D-076 | Finding закрывает reviewer/replacement/adjudicator, executor только предлагает fix | adopted | Самоаттестация исполнителя не доказывает устранение исходной проблемы | final council review |
| D-077 | Project-owned QC manifest и внешний result обязательны для защиты от false-green `make qc` | adopted | Один exit code не доказывает, что все обязательные gates реально исполнялись | final council review |
| D-078 | Watchdog восстанавливает только через `status/read/reconcile`, будит живого orchestrator или создаёт fresh после terminal | adopted | Он не должен напрямую управлять workers или дублировать backend control plane | final council review |
| D-079 | Project-wide locks, mandatory tags/receipts и separate completion report отвергнуты | rejected | Они усложняют обычный Git/PR и создают новые артефакты без утверждённой пользы | user decisions; final council review |
| D-080 | Skill delivery — manifests/prompts плюс dependency-free JS helpers; install/update остаются выбором пользователя | adopted | Методология переносима и не внедряет скрытый package/runtime lifecycle в проекты | user interview; final council review |
