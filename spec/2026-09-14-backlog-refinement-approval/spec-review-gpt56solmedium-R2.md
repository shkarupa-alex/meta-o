## Targeted verification

Закрыты 3 из 20 named findings:

- `DECISION-TABLE-MALFORMED` — закрыт: §2.4 задаёт AST-прямоугольность, а исправленные таблицы больше не содержат разрушающих ячейки `|`.
- `ISSUE-TABLE-002` — закрыт: таблица охватывает ISS-01…ISS-14, и acceptance требует тот же диапазон.
- `ADR-FILE-ASSIGNMENT-MISSING` — закрыт: §2.2 назначает единственного владельца каждому ADR, slice 2 использует эту карту.

Остальные 17 findings не закрыты. Correction также внесла серьёзную регрессию в native CLI contract: нормативные команды противоречат фактическому `gh`/`glab --help`.

Все требуемые изменения остаются bounded orchestrator fixes внутри уже одобренного подхода; перезапуск продуктовых proposals не требуется.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 3,
      "would_adopt": false,
      "summary": "Focused correction действительно закрыла malformed decision tables, полное ISS-01…ISS-14 coverage и ADR file ownership. Однако 17 named findings остаются открытыми. Наиболее существенная регрессия находится в новом §4.6: gh search issues не принимает --state all и не предоставляет stateReason, glab issue note не читает body из stdin, а glab issue create через command substitution противоречит собственному запрету shell interpolation. Также не закрыты противоречия PASS/UNKNOWN grammar, eval v3 schema, settings migration, lossless handoff, wait scoping, guide discovery, model history и vertical decomposition. Спецификация пока не implementation-ready.",
      "phase": "spec-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "PASS-EMPTY-BODY-VS-EVIDENCE",
          "severity": "major",
          "area": "review grammar",
          "description": "Canonical PASS по-прежнему требует пустой body, одновременно с обязательными grounding, scope, checks, stage evidence, Unknowns и residual risks.",
          "evidence": "§5 объявляет protocol sections обязательными для каждого полного отчёта, затем определяет PASS как пустые index/body, не отделяя finding body от общего evidence body.",
          "required_change": "Определить отдельные report sections и сказать, что у PASS пусты только finding index и finding entries, но не grounding/checks/coverage/Unknowns/residual-risks sections."
        },
        {
          "id": "MEMORY-03-RESCOPE-UNAUTHORIZED",
          "severity": "major",
          "area": "knowledge architecture",
          "description": "Объявление §A-MEMORY-03 unchanged не разрешает конкурирующий backlog closure без permanent provenance.",
          "evidence": "Действующий §A-MEMORY-03 требует сохранения source blobs, closure commit, map blob и permanent verification command, тогда как §3 и новый §A-BACKLOG-01 требуют удалить spec-ledger без второго receipt.",
          "required_change": "Явно разграничить в owning ADR применимость исторического §A-MEMORY-03 и нового §A-BACKLOG-01 либо оформить semantic reuse/amendment §A-MEMORY-03."
        },
        {
          "id": "MODEL-ROLE-MIGRATION-BREAKS-SETTINGS",
          "severity": "major",
          "area": "model settings migration",
          "description": "Новые и изменённые roles объявлены без миграции существующих schemaVersion 1 settings.",
          "evidence": "Текущий helper валидирует testClaude, testCodex и testOpenCode при commandShow; сохранённые старые sonnet5/terra/deepseek selections станут несовместимы с новой policy, но §13 не задаёт atomic migration, deprecated-role handling или recovery.",
          "required_change": "Задать точную schemaVersion-1 migration: судьбу testOpenCode, преобразование либо явное invalidation старых required roles, порядок atomic update и поведение show/set при смешанном старом состоянии."
        },
        {
          "id": "HANDOFF-WRITER-UNNAMED",
          "severity": "major",
          "area": "handoff ownership",
          "description": "Writer payload files всё ещё называется только caller, причём caller имеет разные значения в соседних разделах.",
          "evidence": "§6 поручает caller создавать namespace и писать files, а §6.1 называет invoking executor caller-executor и одновременно consumer.",
          "required_change": "Назвать единственного writer по каждому режиму и явно отделить review-skill caller, invoking session и payload consumer."
        },
        {
          "id": "WAIT-RUN-SCOPING-ASSUMED",
          "severity": "major",
          "area": "Orca wait interface",
          "description": "Run-scoped filtering заявлено как существующая backend capability без команды или capability probe.",
          "evidence": "§9 требует отбрасывать foreign-run events до выдачи caller, но текущая documented command shape orca orchestration check --wait не содержит run selector; §17 проверяет timeout, но не run scoping.",
          "required_change": "Назвать version-matched public run/filter selector или определить fail-closed caller-side filtering полного event batch с доказательством, что foreign events всё же будят arm либо не будят его."
        },
        {
          "id": "GUIDE-LOCATOR-MISSING",
          "severity": "major",
          "area": "bundled Orca guides",
          "description": "Для двух обязательных bundled guides не определён единый version-matched locator.",
          "evidence": "Repository mechanics называет orca skills get orchestration, а candidate лишь говорит bundled Orca source и не задаёт retrieval command/path для orca-cli guide.",
          "required_change": "Задать exact public discovery/read commands и version-match evidence отдельно для orchestration и orca-cli, включая unavailable/unreadable outcomes."
        },
        {
          "id": "EVAL-01-LOWCOST-RATIONALE",
          "severity": "major",
          "area": "business and evaluation policy",
          "description": "Переход на Opus и Sol не объясняет, как сохраняется смысл §B-EVAL-01 о минимизации стоимости.",
          "evidence": "§2.1 меняет approved profiles, но §13 лишь повторяет frozen ids; нет причины, почему low effort этих более мощных families является минимально достаточным model-backed gate.",
          "required_change": "Добавить business/ADR rationale: deterministic-first остаётся основным сокращением стоимости, а обязательные powerful families запускаются только на bounded cases и low effort по прямому U-17 authority."
        },
        {
          "id": "EVAL-TOOL-INTERFACE-GAP",
          "severity": "major",
          "area": "skill eval CLI",
          "description": "Не определены команды генерации и валидации всей required/desired matrix.",
          "evidence": "§13.1 описывает aggregate behavior, но не задаёт обновлённые --prompt/--validate-evidence arguments, representation NOT_AVAILABLE без native execution и exit-code contract по matrix tier.",
          "required_change": "Добавить canonical CLI invocations, input/output envelopes, materialization rules для неисполненных coordinates и exit-status matrix."
        },
        {
          "id": "LEDGER-SHA-NOT-RECONSTRUCTIBLE",
          "severity": "major",
          "area": "backlog provenance",
          "description": "Спецификация не задаёт долговечный алгоритм восстановления bytes, для которых приведены blob id и SHA-256.",
          "evidence": "§19 содержит только bytes после canonical heading; §3 ссылается на worktree blob, но не требует сделать его reachable Git object и не задаёт точную реконструкцию prefix плюс appendix после будущего удаления spec.",
          "required_change": "Определить exact byte reconstruction algorithm и гарантировать reachable source object до завершения всех ledger tests либо хранить полный normative byte sequence, пока checkpoint не доказан."
        },
        {
          "id": "ADHERENCE-VS-CONTEXT-GROWTH",
          "severity": "major",
          "area": "reviewer lifecycle",
          "description": "Hot-reviewer requirement не согласован с compaction и деградацией adherence при росте контекста.",
          "evidence": "§7 требует держать reviewers hot до follow-ups, но не задаёт replacement/re-grounding rule; действующая Orca mechanics требует fresh recovery после compaction или примерно 75 процентов ограниченного context.",
          "required_change": "Определить bounded reviewer re-grounding/replacement при compaction, contamination или context threshold, сохранив только собственный prior report и независимость peer."
        },
        {
          "id": "ARCH-HIERARCHY-001",
          "severity": "major",
          "area": "business-architecture hierarchy",
          "description": "Exact wait thresholds и explicit activation всё ещё не закреплены на business layer.",
          "evidence": "§A-WAIT-01 ссылается на неизменённый §B-UPTIME-05, который прямо говорит, что cadence не является protocol threshold; §A-ACTIVATION-01 вводит новый product rule через общие §B-HUMAN-01/PORTABILITY-03.",
          "required_change": "Добавить либо корректно переиспользовать business theses для U-16 cadence и U-10 activation с необходимыми Knowledge-ID-Change records."
        },
        {
          "id": "ISSUE-NATIVE-CLI-003",
          "severity": "critical",
          "area": "native gh/glab contract",
          "description": "Новый нормативный CLI contract содержит несуществующие flags/fields и команду, которая может открыть editor вместо публикации.",
          "evidence": "Установленный gh search issues допускает --state только open или closed и не предоставляет JSON field stateReason, но §4.6 требует --state all и stateReason. Установленный glab issue note не читает message из stdin без -m и открывает editor. glab issue create поддерживает --description-file, но spec использует command substitution, противореча собственному запрету shell interpolation.",
          "required_change": "Заменить shapes на проверенные команды: отдельные open/closed gh searches или gh issue list, только поддерживаемые JSON fields; для GitLab comment использовать documented glab API body=@file либо безопасный -m contract, а create выполнять через --description-file. Зафиксировать exact installed help fixtures до объявления commands normative."
        },
        {
          "id": "HANDOFF-LOSSLESS-004",
          "severity": "major",
          "area": "lossless report handoff",
          "description": "Size и End-Review marker по-прежнему не доказывают неизменность authoritative worker_done.",
          "evidence": "§6 и acknowledgement сверяют только decimal byte sizes и end markers; повреждение или замена внутренних bytes того же размера останется незамеченной.",
          "required_change": "Задать canonical encoding и byte-for-byte comparison перечитанного файла с принятым authoritative body до handoff, плюс полную grammar validation reread payload."
        },
        {
          "id": "REVIEW-GRAMMAR-005",
          "severity": "major",
          "area": "review response grammar",
          "description": "Unknown-Account добавлен, но полная grammar остаётся неоднозначной.",
          "evidence": "Body finding начинается строкой F-001 без заданного severity token, хотя severity должна совпасть с index. UNKNOWN ordering не объясняет наличие Evidence report и protocol sections. PASS сохраняет конфликт пустого body.",
          "required_change": "Дать канонические полные fixtures PASS/FINDINGS/UNKNOWN или формальную grammar с section order, body finding header, severity location и marker escaping."
        },
        {
          "id": "EVAL-SCHEMA-006",
          "severity": "major",
          "area": "eval evidence v3 schema",
          "description": "V3 всё ещё описана одновременно как multi-case v2 envelope и как плоская запись одной case coordinate.",
          "evidence": "Cases имеют contracts array, таблица требует singular contract_id; envelope сохраняет nested requested/harness/execution/results, но таблица вводит flat fields; status casing и representation отсутствующего execution расходятся.",
          "required_change": "Добавить единственную нормативную JSON shape, contracts array mapping, canonical examples каждого status и точный aggregate/duplicate algorithm."
        },
        {
          "id": "MODEL-HISTORY-007",
          "severity": "major",
          "area": "model discovery",
          "description": "Partial history всё ещё может участвовать в default recommendation как будто выполнено требование all readable usage.",
          "evidence": "§11 ограничивает scan 5 seconds и 64 MiB, ставит history_complete false, но не запрещает recommendation; принадлежность последним 31 дням не различает file mtime и model-event timestamp.",
          "required_change": "Определить event-time eligibility и fail-closed recommendation policy при incomplete history либо использовать полный provider-owned index."
        },
        {
          "id": "DECOMPOSITION-008",
          "severity": "major",
          "area": "implementation slices",
          "description": "Slices по-прежнему горизонтальные и откладывают общие tests/evals до slice 11.",
          "evidence": "Slices 2–10 меняют independently meaningful contracts, но focused proof для них сгруппирован позже, одновременно требуя зелёный mo-qc и observable evidence каждого coherent increment.",
          "required_change": "Разбить plan на vertical contract plus implementation plus focused proof plus generated-sync increments с prerequisites и exit condition для каждого."
        }
      ],
      "assumptions": [
        "Candidate specification проверялась как точный proposed artifact, включая приведённые command shapes и Markdown formatting.",
        "Exact candidate SHA и две reviewer selections отсутствуют; поэтому mo-review-orca использован как нормативный protocol, но Orca workers не запускались.",
        "Проверка CLI ограничена локальными read-only help surfaces; сеть, Issues и внешние сервисы не затрагивались.",
        "Предыдущие council artifacts под spec/** не инспектировались и не использовались.",
        "Все оставшиеся исправления можно выполнить bounded orchestrator correction без изменения frozen product boundaries."
      ],
      "round": 2,
      "reviewer": "gpt56solmedium"
    }
  ]
}
```

---REVIEW-META---
approval_score: 3
would_adopt: false
