# Targeted R3 review wrapper repair

Содержательный ответ Claude сохранён в session transcript. Ниже без новой оценки восстановлена его принятая семантика в требуемом envelope.

- Закрыты: `BIJECTION-UNSAT-07`, первая часть `INVENTORY-LOSS-01` для `RR:L5-L37`, ранее закрытый `FINAL-GATE-SCOPE-11`.
- Блокируют: инверсия verbatim slice-budget, неполная node inventory остальных крупных ranges, потерянный owner secret redaction, недостижимый DoD из-за registration/gate gaps и неисполняемый anchor transform на текущем `markdown-it`.
- Остались открытыми: provenance, JSDoc delta, hot/fresh reviewer contract, live qualification adapter commands, Qwen runtime profile, ledger gaps, TUI authority и severity grammar.
- Рекомендован bounded orchestrator fix внутри утверждённых четырёх specs; restart proposals не требуется.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 5,
      "would_adopt": false,
      "summary": "Коррекция закрыла BIJECTION-UNSAT-07 и часть INVENTORY-LOSS-01 для всех unheaded bullets RR:L5-L37, но ввела инверсию verbatim slice-budget и оставила крупные source ranges, provenance, integration, tooling и authority contracts незакрытыми. Требуется bounded fix внутри тех же четырёх specs; restart proposals не нужен.",
      "phase": "spec-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "INVENTORY-INVERTS-INTENT",
          "severity": "major",
          "area": "inventory/review-budget",
          "description": "RR:L121-L127 закрывает verbatim требование максимум пяти review/fix attempts фикстурой no numeric cap и тем самым инвертирует пользовательский смысл.",
          "evidence": "Frozen ledger L123 задаёт slice budget, а L126 требует определить поведение на пятой попытке; это не settlement cap.",
          "required_change": "Развести запрещённый settlement cap и ограниченный slice attempt budget; сохранить verbatim intent и определить поведение после пятой попытки."
        },
        {
          "id": "INVENTORY-LOSS-01",
          "severity": "critical",
          "area": "lossless inventory",
          "description": "Appendix подробно покрывает RR:L5-L37, но крупные ranges ниже продолжают поглощать самостоятельные obligations без отдельных owners.",
          "evidence": "RR:L47-L68 объединяет completion, watchdog delivery, unclassified state, model cleanup и event filtering; аналогичные составные ranges остаются ниже.",
          "required_change": "Материализовать отдельную semantic row для каждого obligation/evidence node и назначить owner/proof без инверсии смысла."
        },
        {
          "id": "FIND-REUSE-ORPHAN-03",
          "severity": "critical",
          "area": "find-reuse integration/security",
          "description": "Удаляемый mo-reuse владеет secret redaction и needs_attention при сомнении, но новый owner не назначен.",
          "evidence": "Текущий mo-reuse заменяет secrets marker и запрещает угадывать; Spec 2 не содержит внешнего find-reuse invocation/destination flow.",
          "required_change": "Назначить lifecycle owner redaction и полностью описать внешний Meta-O consumer path для pure find-reuse report."
        },
        {
          "id": "DOD-UNREACHABLE-04",
          "severity": "critical",
          "area": "acceptance/gates",
          "description": "Final DoD требует green mo-qc, но senior skills/find-reuse registration и backlog-lens transition не назначены.",
          "evidence": "Build/install EXPECTED содержит шесть skills, senior skills untracked, orchestration contract требует читать весь непустой backlog.",
          "required_change": "Назначить registration/README/tests owners и заменить Backlog lens на future-safe Deferral lens вместе с acceptance assertions."
        },
        {
          "id": "AST-INFEASIBLE-05",
          "severity": "major",
          "area": "anchor transformation",
          "description": "Byte-preserving inline transform требует source positions, которых текущий markdown-it не предоставляет.",
          "evidence": "Inline token map is null; current build copies Markdown without a positional AST serializer.",
          "required_change": "Назвать positional Markdown parser/offset strategy, exact grammar/contexts и byte-preservation invariant."
        },
        {
          "id": "REGRESSION-TUI-AUTHORITY-01",
          "severity": "major",
          "area": "review delivery",
          "description": "Diagnostic TUI projection не должна аннулировать authoritative complete worker_done.",
          "evidence": "§A-RESPONSE-01 не даёт terminal projection доказательной силы полного response.",
          "required_change": "Проверять TUI summary как отдельный UX outcome, не как report authority."
        },
        {
          "id": "REGRESSION-SEVERITY-GRAMMAR-20",
          "severity": "major",
          "area": "review report",
          "description": "Обязательные machine-counted P0-P3 counters превышают пользовательское требование текстовой разбивки и конфликтуют с запретом adjudication grammar.",
          "evidence": "Projection counts объявлены machine-checkable, хотя business/methodology запрещают обязательные counters/grammars.",
          "required_change": "Оставить textual severity per finding без counter-based authority и зафиксировать только semantic verdict invariants."
        },
        {
          "id": "PROVENANCE-FRAGILE-02",
          "severity": "major",
          "area": "program provenance",
          "description": "Orca-only commit не является ancestor develop, а research/senior inputs не имеют tracked reproducible identity.",
          "evidence": "41a4898 reachable only from local feature branch; docs/research and senior skills are untracked.",
          "required_change": "Добавить input-readiness gate и фиксировать final integrated input SHA/blobs после tracked ownership."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "POSITIVE-CONTROL-01",
          "severity": "minor",
          "area": "inventory roles",
          "description": "RR:L262 полезно назвать эталонным positive-control для опровержения ошибочной гипотезы.",
          "evidence": "Узел содержит distinct evidence, но не новую obligation.",
          "required_change": "Добавить явную positive-control row."
        }
      ],
      "assumptions": [
        "Frozen decisions не переоткрываются.",
        "Все требуемые изменения являются bounded fixes внутри четырёх specs.",
        "Raw R3 response сохранён в persistent spec-reviewer Opus transcript."
      ]
    }
  ]
}
```
