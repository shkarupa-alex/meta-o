Консервативное допущение: неразрешённое правило о трёх minor-only итерациях реализовано в рекомендованной форме — два независимых `PASS`, а `P3` не блокируют завершение.

### 1. Backlog формально пуст, но трассировка инцидентов потеряна

1. **Что произошло.** `docs/backlog.md` очищен, `docs/backlog-issues-real-runs.md` и umbrella-spec удалены, все проверки зелёные. Через полгода для конкретной строки acceptance невозможно установить, какие distinct incidents и контекст real-runs она закрывала. Git содержит исходный blob, но удалён единственный индекс `locator → owner → disposition → proof`.

2. **Почему.** Биекция проверяется только перед удалением временного inventory. Финальная архитектура сохраняет acceptance proof и исходный blob по отдельности, но не сохраняет их связь. Утверждение, что исходник «восстанавливается из pinned Git blob», не помогает найти нужный blob и сопоставить его содержательные узлы с текущими контрактами после удаления umbrella-spec.

3. **Как предотвратить.** Сделать существующую acceptance map именованным постоянным потребителем provenance: каждая закрывающая строка должна хранить стабильные source locators или immutable closure IDs. Финальный тест должен заново строить биекцию из исторических blobs, а не только удостоверять её перед удалением временного артефакта.

### 2. Same-full-SHA оказался заявлением протокола, а не доказательством прочитанного кода

1. **Что произошло.** Оба reviewer вернули `PASS` для одного SHA, но позже обнаружился дефект в этом коммите. Reviewer payload содержал правильный SHA, однако один hot reviewer анализировал часть surrounding code из уже изменившегося общего worktree либо сохранил контекст предыдущего кандидата.

2. **Почему.** Дизайн требует payload integrity, redispatch и hot-session cleanliness, но не требует, чтобы каждый reviewer читал код из immutable checkout или напрямую из Git object database соответствующего SHA. Идентификатор в запросе и ответе не доказывает, что все рассмотренные файлы принадлежали этому объекту.

3. **Как предотвратить.** Каждый review запускать в отдельном read-only worktree, закреплённом на exact SHA, либо разрешать чтение только через SHA-addressed Git operations. Proof должен включать проверенный `HEAD`, clean status, hash исследованных файлов и explicit rejection при расхождении. Hot должна оставаться session, а не её рабочая директория или накопленный candidate context.

### 3. `find-reuse` систематически пропускал межэкосистемные варианты

1. **Что произошло.** Skill выдавал `build`, хотя пригодные решения существовали в поддерживаемом каталоге, но вне экосистем, обнаруженных в текущем repository. Все обязательные adapters формально отработали: были опрошены только “applicable” hosting и detected registries.

2. **Почему.** Дизайн одновременно требует популярный coverage matrix и ради экономии ограничивает registry search detected ecosystems. Не определено, как вывести applicable ecosystems из business requirements, особенно когда задача предполагает новый компонент или смену технологии. Также отсутствует нормативное правило, какие источники являются `required source`; поэтому запрет на `build` при coverage gap обходится выбором слишком узкого набора required sources.

3. **Как предотвратить.** Ввести детерминированный coverage planner: repository detection — лишь один signal; второй обязательный вход — capability/task classification из требований. Для `build` требовать минимальный cross-ecosystem discovery tier, а все исключённые adapters перечислять с машинно-проверяемой причиной. `unknown`, а не `build`, должен быть результатом при неопределённой применимости.

### 4. Review architecture закрепили до проверки её эффективности

1. **Что произошло.** SP-04 был реализован вокруг compact evidence-first core, но последующий эксперимент SP-03 показал неприемлемый recall либо стоимость follow-up. Исправление потребовало менять уже готовую orchestration policy, payloads и proof artifacts; до переделки слабый review оставался обязательным lifecycle gate.

2. **Почему.** Critical path ставит `SP-04 review orchestration` до `SP-03 evaluation decision`. При этом eval перечисляет метрики, но synthesis не задаёт количественных go/no-go thresholds, минимальный размер corpus или правило выбора архитектуры при смешанном результате. ADR способен просто зафиксировать неудовлетворительный эксперимент без блокировки rollout.

3. **Как предотвратить.** До SP-04 стабилизировать только нейтральный reviewer transport contract. Затем провести pre-registered eval с обязательными thresholds для recall, precision/FP, latency и cost и с правилом non-inferiority. Конкретные modes, specialized subagents и prompt shape подключать как сменные policies лишь после решения эксперимента.

### 5. Orca recovery завис между «typed state» и небезопасным fallback

1. **Что произошло.** После reconnect или quota event coordinator не смог надёжно определить, было ли действие выполнено. Typed event отсутствовал или был несовместимой версии, account status не отвечал на вопрос об effect, а bounded terminal projection не содержал достаточных данных. Система либо навсегда оставляла gate незавершённым, либо повторяла операцию и создавала побочный эффект.

2. **Почему.** SP-05 требует целый новый публичный companion contract, а SP-06 строит recovery ladder поверх него, но дизайн не задаёт version negotiation, transition compatibility и idempotency keys для effectful operations. Принцип «receipt never equals effect» верен, однако “confirm on another public surface” не гарантирует, что такая поверхность существует для каждого create/send/close/release.

3. **Как предотвратить.** Для каждой effectful operation заранее определить stable operation ID, idempotency semantics и authoritative confirmation surface. Event envelope должен иметь negotiated version и fail-closed compatibility matrix. Если эффект невозможно независимо подтвердить, operation нельзя включать в автоматическое recovery: она должна завершаться typed `unknown_effect` и переходить на явно предусмотренную безопасную границу, а не повторяться.