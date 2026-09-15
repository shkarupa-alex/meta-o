Вердикт: спецификация пока не одобрена. Из 17 целевых замечаний полностью закрыты 2; 15 остаются блокирующими.

Закрыты:

- `PASS-EMPTY-BODY-VS-EVIDENCE`: §5.1 теперь требует для `PASS` непустые `Grounding`, `Scope and checks`, явные `Unknowns` и `Residual risks`; пусты только index и `Findings`.
- `GUIDE-LOCATOR-MISSING`: §8.1 задаёт исполнимый locator. Локальная проверка подтвердила существование `orca skills list --json` и `orca skills get <topic> --json`, а также обоих topics — `orchestration` и `orca-cli`.

Остаются блокирующими:

- `ISSUE-NATIVE-CLI-003`: GitLab note-команда всё ещё неверна. `glab api ... --input note.json` передаёт raw body, но spec не задаёт `Content-Type: application/json`. Установленная поверхность уже поддерживает безопасный native вариант `-F body=@<prepared-body>`, поэтому заявленный workaround и обязательный upstream Issue не обоснованы.
- `MEMORY-03-RESCOPE-UNAUTHORIZED`: §A-MEMORY-03 назван `unchanged`, хотя spec отменяет его постоянные acceptance provenance, closure commit/map blob и reachability test.
- `MODEL-ROLE-MIGRATION-BREAKS-SETTINGS`: замена обязательных ролей и добавление desired-ролей без schema migration оставляет судьбу существующего `testOpenCode` неопределённой; текущий `effectiveRoles()` молча игнорирует роли, удалённые из `ROLES`.
- `HANDOFF-WRITER-UNNAMED`: §6 по-прежнему назначает запись файлов абстрактному `caller`, не фиксируя владельца для каждого режима.
- `WAIT-RUN-SCOPING-ASSUMED`: §9 предполагает фильтрацию foreign-run events, но не требует `orca orchestration check --run <run_id>`. Установленный CLI этот параметр поддерживает.
- `EVAL-01-LOWCOST-RATIONALE`: изменение §B-EVAL-01 не объясняет, почему новые обязательные model families удовлетворяют исходной бизнес-норме о неповышении стоимости без необходимости.
- `EVAL-TOOL-INTERFACE-GAP`: отсутствуют точные команды и input/output contract для запуска всей v3 matrix, материализации `NOT_RUN`/`NOT_AVAILABLE` и агрегирования gate.
- `LEDGER-SHA-NOT-RECONSTRUCTIBLE`: §19 не задаёт восстановление полного исходного blob из appendix, а после удаления spec не сохраняются reachability proof и постоянная команда проверки, требуемые действующим §A-MEMORY-03.
- `ADHERENCE-VS-CONTEXT-GROWTH`: hot reviewers обязательны, но нет критерия контекстной деградации и безопасного исхода при невозможности lossless follow-up.
- `ARCH-HIERARCHY-001`: §A-WAIT-01 превращает 5/10 минут в protocol thresholds, тогда как действующий §B-UPTIME-05 прямо говорит, что cadence не является порогом протокола.
- `HANDOFF-LOSSLESS-004`: size и `End-Review` не доказывают, что файл байт-в-байт равен authoritative `worker_done`; источник payload и запрет нормализации не определены.
- `REVIEW-GRAMMAR-005`: body finding не имеет нормативного severity token, хотя checker должен сверять severity index/body; точная позиция `Unknown-Reason` также не закреплена грамматикой.
- `EVAL-SCHEMA-006`: v3 одновременно описан как envelope с сохранёнными `results` и как отдельная flat record на coordinate; `contracts[]` расходится с `contract_id`, а регистр status literals непоследователен.
- `MODEL-HISTORY-007`: ограниченный 5 s/64 MiB scan может не прочитать всю доступную 31-day history, но spec всё равно разрешает default recommendation и тем самым не выполняет U-15.
- `DECOMPOSITION-008`: behavioral tests/evals отложены в slice 11, хотя slices 2–10 требуют собственного observable evidence и зелёного QC; decomposition не связывает каждый semantic increment с его blocking proof.

Проверка была полностью read-only: использованы предоставленный текст, текущие business/ADR/scripts и локальные `--help` surfaces; сеть, external writes, git state и `spec/**` не затрагивались.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 3,
      "would_adopt": false,
      "summary": "Focused correction fully closes PASS-EMPTY-BODY-VS-EVIDENCE and GUIDE-LOCATOR-MISSING, but ISSUE-NATIVE-CLI-003 remains because the normative GitLab note command omits the required JSON content type despite an available native file-field path. Fourteen additional named contradictions and interface gaps remain unchanged, leaving 15 blocking findings overall.",
      "phase": "spec-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "MEMORY-03-RESCOPE-UNAUTHORIZED",
          "severity": "major",
          "area": "knowledge provenance",
          "description": "The specification labels §A-MEMORY-03 unchanged while removing its durable provenance contract.",
          "evidence": "Current §A-MEMORY-03 requires docs/acceptance.md to retain source blob ids, closure commit, map blob and a permanent verification command; §§3 and 14 instead retire the ledger and permanent test after harvest.",
          "required_change": "Either preserve every existing §A-MEMORY-03 durable artifact for this intake or explicitly amend/rescope the ADR with the required semantic-change authorization and synchronized business/acceptance updates."
        },
        {
          "id": "MODEL-ROLE-MIGRATION-BREAKS-SETTINGS",
          "severity": "major",
          "area": "model settings migration",
          "description": "The role-set migration can silently discard an existing configured testing role while retaining schemaVersion 1.",
          "evidence": "The current helper defines testClaude, testCodex and testOpenCode in ROLES, and effectiveRoles returns only names still present in ROLES. The specification changes required roles and adds desired roles without defining how persisted testOpenCode values are migrated or reported.",
          "required_change": "Specify a deterministic schema-v1-compatible migration or explicit compatibility projection that preserves, maps or visibly deprecates every existing role without silently hiding stored selections."
        },
        {
          "id": "HANDOFF-WRITER-UNNAMED",
          "severity": "major",
          "area": "review handoff ownership",
          "description": "The component responsible for materializing authoritative review payloads is still only called caller.",
          "evidence": "Section 6 assigns secure namespace creation and file publication to Caller, while §6.1 varies the consumer by mode without naming the exact skill/session that owns writing in each mode.",
          "required_change": "Name the exact writer and cleanup owner for full lifecycle, executor-invoked standalone review and human-invoked standalone review, including ownership transfer rules."
        },
        {
          "id": "WAIT-RUN-SCOPING-ASSUMED",
          "severity": "major",
          "area": "blocking wait",
          "description": "Foreign-run filtering is asserted without binding the public wait command to the current run.",
          "evidence": "Section 9 requires foreign-run events to be discarded before they shorten an arm, but gives no invocation carrying the run identity. Installed Orca exposes `orca orchestration check --run <run_id> --wait ...`.",
          "required_change": "Make `--run <exact-run-id>` or an equivalently proven bound-run locator normative for every wait arm and record it in evidence."
        },
        {
          "id": "EVAL-01-LOWCOST-RATIONALE",
          "severity": "major",
          "area": "business evaluation policy",
          "description": "The new mandatory profiles are declared without reconciling them with the existing no-unnecessary-cost-increase business invariant.",
          "evidence": "Current §B-EVAL-01 explicitly selects low-cost testing profiles and prohibits model or effort escalation without permission. The replacement names different model families but supplies no necessity or cost-bound rationale.",
          "required_change": "Record the user-authorized portability necessity, explain how low effort bounds cost, and amend the business wording if the new profiles cannot truthfully remain classified as low-cost."
        },
        {
          "id": "EVAL-TOOL-INTERFACE-GAP",
          "severity": "major",
          "area": "skill-eval execution",
          "description": "The specification defines v3 evidence semantics without an executable runner interface for producing and aggregating the matrix.",
          "evidence": "Section 13 names tools/skill-evals.mjs as owner but provides no exact commands, coordinate selection arguments, evidence input locations or aggregate output/exit contract.",
          "required_change": "Define exact non-mutating CLI shapes for enumerating coordinates, validating one result, materializing absent statuses and calculating the blocking aggregate."
        },
        {
          "id": "LEDGER-SHA-NOT-RECONSTRUCTIBLE",
          "severity": "major",
          "area": "source ledger",
          "description": "The appendix and hashes do not guarantee later reconstruction and verification of the complete original backlog blob.",
          "evidence": "Section 19 contains only the text after the canonical heading, while the proposed harvest removes the live spec and its test input. The current §A-MEMORY-03 reachability and permanent verification artifacts are not retained.",
          "required_change": "Specify the exact byte reconstruction procedure and preserve a reachable Git object plus a permanent verification command, or formally amend §A-MEMORY-03."
        },
        {
          "id": "ADHERENCE-VS-CONTEXT-GROWTH",
          "severity": "major",
          "area": "reviewer lifecycle",
          "description": "Keeping reviewers hot has no bounded response when their context can no longer support a faithful follow-up.",
          "evidence": "Sections 5 and 7 require same-session follow-up after findings but define neither a context/readability threshold nor a typed outcome when that session cannot safely continue.",
          "required_change": "Define a deterministic readiness check before follow-up and a typed UNKNOWN or needs_attention path that preserves the previous report without silently replacing or truncating context."
        },
        {
          "id": "ARCH-HIERARCHY-001",
          "severity": "major",
          "area": "business-to-architecture hierarchy",
          "description": "The wait ADR gives fixed cadence values protocol force while its cited business requirement denies that cadence is a protocol threshold.",
          "evidence": "Current §B-UPTIME-05 says the interval is minutes rather than seconds or an hour and explicitly states that it is not a protocol threshold. Sections 2.2 and 9 make 300000/600000 ms normative gates.",
          "required_change": "Amend the owning business requirement under the required semantic-change process so fixed arms are authorized before §A-WAIT-01 depends on them."
        },
        {
          "id": "ISSUE-NATIVE-CLI-003",
          "severity": "major",
          "area": "native GitLab Issue interface",
          "description": "The corrected GitLab note command can still fail because raw JSON input is sent without a JSON content type.",
          "evidence": "Section 4.6 prescribes `glab api ... --input <prepared-note.json>` with no `-H Content-Type: application/json`. The installed glab interface supports file-backed fields using `-F body=@<file>`, which performs JSON parameter encoding and avoids the claimed body-file gap.",
          "required_change": "Replace the note shape with the verified native command `glab api --hostname <host> --method POST <path> -F body=@<prepared-body>` or include and fixture-test the required JSON content-type header; remove the unsupported upstream-Issue obligation if no public gap remains."
        },
        {
          "id": "HANDOFF-LOSSLESS-004",
          "severity": "major",
          "area": "lossless report transport",
          "description": "File size and end-marker checks do not establish that the executor receives the unchanged authoritative response.",
          "evidence": "Section 6 never defines the authoritative worker_done byte sequence as the file source and permits no byte-equality check before publication or acknowledgement.",
          "required_change": "Define the authoritative worker_done body as the exact payload bytes, forbid reformatting and newline normalization, and require byte-for-byte reread equality before handoff without introducing a persistent receipt."
        },
        {
          "id": "REVIEW-GRAMMAR-005",
          "severity": "major",
          "area": "review response grammar",
          "description": "Named sections fix PASS coverage, but two structural relationships remain unparsable.",
          "evidence": "Section 5.2 requires body severity to match the index while the body grammar shows only a bare finding key. `Unknown-Reason` is described as part of UNKNOWN but its exact location relative to Counts, index and Evidence report is not specified.",
          "required_change": "Give body findings an exact keyed severity grammar and place `Unknown-Reason` at one unambiguous anchored location in the UNKNOWN production."
        },
        {
          "id": "EVAL-SCHEMA-006",
          "severity": "major",
          "area": "eval evidence schema",
          "description": "The proposed v3 structure has mutually inconsistent record shapes and status vocabularies.",
          "evidence": "Section 13.1 says v3 preserves the v2 envelope and nested results, then says each matrix coordinate produces a flat record. Cases use contracts arrays while evidence names one contract_id, and prose alternates uppercase and lowercase status literals.",
          "required_change": "Publish one complete normative JSON shape, define whether a coordinate maps to an envelope or result row, define contracts cardinality, and use one exact case-sensitive status enum throughout."
        },
        {
          "id": "MODEL-HISTORY-007",
          "severity": "major",
          "area": "model discovery",
          "description": "A partial bounded scan may still influence a default recommendation that is supposed to use all readable monthly history.",
          "evidence": "Section 11 permits stopping after 5000 ms or 64 MiB with history_complete false but does not prevent step 3 from selecting a default from that incomplete evidence; mtime is also used as a proxy for usage time.",
          "required_change": "Require complete 31-day history before claiming a history-based default recommendation, or return no_default_recommendation when completeness cannot be established; define usage time independently of file mtime."
        },
        {
          "id": "DECOMPOSITION-008",
          "severity": "major",
          "area": "implementation slicing",
          "description": "The slices do not pair semantic changes with the proofs required to make each increment independently verifiable.",
          "evidence": "Slices 2 through 10 change contracts and runtime behavior, while most deterministic tests, evals and E2E evidence are deferred to slice 11 despite the requirement that every slice have observable evidence and green QC.",
          "required_change": "Move the relevant deterministic and behavioral proof into each owning slice and reserve the final test slice only for cross-slice integration evidence."
        }
      ],
      "assumptions": [
        "The supplied focused-after-correction text is the complete candidate specification; no exact candidate file or Git SHA was provided, so verification used that text plus current repository and installed read-only CLI surfaces.",
        "No prior artifacts under spec/** were inspected or relied upon."
      ],
      "round": 3,
      "reviewer": "gpt56solmedium"
    }
  ]
}
```

---REVIEW-META---
approval_score: 3
would_adopt: false
