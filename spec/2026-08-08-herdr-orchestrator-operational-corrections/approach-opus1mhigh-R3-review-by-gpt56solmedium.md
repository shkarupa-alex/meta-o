## Facts & Constraints (White Hat)

Proposal 1 остаётся значительно сильнее. Новая версия правильно добавила:

- Git-object-format neutrality вместо предположения о 40-character SHA-1;
- autonomous model preflight без обязательного model-selection dialogue;
- явный запрет optional reuse/watchdog questions;
- точную VCS ответственность executor’а;
- отсутствие нового architecture document.

Но несколько прежних блокеров не исправлены. `agent_prompt_stalled` всё ещё восстанавливается через ненадёжную проверку наличия prompt в rendered output. Лимит в 180 rendered lines всё ещё выводится из раздельных измерений, а не из review-shaped fixture с tool use. Acceptance всё ещё требует доставки «без изменений», не определяя нормализацию terminal text.

Model preflight добавляет новый недоопределённый механизм: «recent successful session history». Не сказано, какая поверхность доказывает success, как исключается устаревшая или неавторизованная session и можно ли для этого читать provider-private session data. Наличие недавней session не доказывает, что route сейчас authenticated, subscription-ready и пригоден для unattended launch.

Proposal 2 устранил файловый primary protocol, но новое inversion не решает retrieval problem. Передача чтения executor’у меняет того, кто видит повреждённый transcript, но не делает transcript полным.

## Risks & Failure Modes (Black Hat)

### Proposal 1

Главная transport ошибка сохраняется. Prompt мог быть доставлен, быстро завершён и исчезнуть из `recent output`; повтор отправит его второй раз. Правильным сигналом должен быть pre/post `state_change_seq`, а неоднозначность должна давать `UNKNOWN`, не retry.

Начальная support matrix для Claude/Codex объявлена раньше доказательства combined scenario: настоящее review, tool calls, TUI repaint и 180-line final verdict в фиксированной геометрии. Fail-closed retrieval безопасен, но route нельзя заранее называть supported.

Model fallback также может нарушить собственную политику:

- «saved model unavailable» не отделён от temporarily unavailable catalog;
- native default может изменить фактическую model/effort selection;
- recent session history не является quality ranking или readiness proof;
- cross-vendor selection не учитывает verified launch posture каждого interactive surface.

Удаление default reuse question разумно, но предложение не назначает executor’у заменяющую обязанность. Это может потерять существующее бизнес-требование проверять reuse перед реализацией. Executor должен самостоятельно выполнить project-local reuse check либо следовать уже принятому reuse decision, не эскалируя вопрос пользователю.

Bundling всё ещё не определяет exact versions, lockfile policy и third-party notices.

### Proposal 2

В review round есть фатальная sequencing error:

1. Orchestrator читает tail.
2. Если verdict не виден, reviewer получает новый one-word prompt.
3. Затем executor должен прочитать reviewer’s “last turn”.

После one-word prompt последним turn становится `PASS`/`FINDINGS`, а не содержательный review. Herdr не предоставляет logical turn addressing, поэтому executor не может надёжно выбрать предыдущий substantive turn.

Даже без этого defect executor не может доказать полноту repainting transcript. Пропавший finding может быть целым абзацем без оборванного слова, неверного пути или другой заметной аномалии. Reviewer’s one-word classification и executor’s finding count не являются двумя независимыми доказательствами completeness: оба относятся к одному потенциально неполному review.

Предоставление executor’у имён reviewers и права выполнять Herdr control commands также размывает границу ролей. Он может prompt/send-keys/attach к reviewer; текстовый запрет «read only» не сильнее существующего правила независимости и создаёт новую ненужную поверхность ошибки.

Остались и прежние противоречия:

- orchestrator решает technical forks;
- orchestrator пишет posture defects в backlog;
- default-branch fallback нарушает mandatory `develop`;
- SDK bundling отвергнут вопреки прямому запросу;
- используется неверный CLI flag `--timeout-ms`;
- narrow-pane fallback меняет vertical layout на `down`;
- создаётся лишний architecture document;
- interactive failure переходит к model-authored file, который не доказывает completeness.

## Strengths & Benefits (Yellow Hat)

Proposal 1 хорошо закрывает исходные complaints как единый процесс:

- orchestrator context действительно остаётся процессным;
- executor сам читает intent и определяет feasibility/QC;
- reviewers видимы и persist между раундами;
- findings идут через orchestrator без semantic processing;
- waiting зависит только от lifecycle;
- Git gates корректно поддерживают SHA-1 и SHA-256;
- backlog/changelog/docs rules пропорциональны;
- bundled discovery соответствует запрошенному brain-council pattern;
- no-question policy явно отделяет обычные решения от настоящего human attention.

Proposal 2 полезно признаёт ошибочность предыдущего footer/file protocol и честно называет отсутствие mechanical TUI completeness proof. Его topology и lifecycle reasoning в основном здравы. Однако новое решение сохраняет риск, меняя courier, а не transport.

## Alternatives & Creative Ideas (Green Hat)

Proposal 1 следует завершить несколькими узкими решениями:

1. При stall сохранять pre-send sequence:
   - sequence изменился или actor `working` — не повторять;
   - sequence изменился и actor settled — читать состоявшийся turn;
   - sequence не изменился и actor гарантированно input-ready — один retry;
   - всё остальное — transport `UNKNOWN`.

2. Определить compact contract как максимум logical Markdown lines при минимальной фиксированной ширине панели. Route становится supported только после combined review-shaped fixture.

3. Определить verbatim relay как complete ordered Unicode text после документированной Herdr normalization, а не byte equality.

4. Заменить “recent successful session history” на детерминированную route policy:
   - сохранённая validated selection;
   - иначе установленный, posture-verified и authenticated route;
   - native default внутри выбранного route;
   - cross-vendor gate проверяется до запуска reviewers.
   
   Не читать private histories и не делать вид, что recency доказывает success.

5. После удаления reuse question передать executor’у обязанность: проверить существующий reuse decision; при его отсутствии выполнить консервативное repository-local исследование и продолжить, не запуская отдельный skill без explicit request.

Для Proposal 2 безопасной альтернативой остаётся Proposal 1: orchestrator читает доказанно полный компактный verdict и копирует его executor’у. Если полнота не доказана, verdict `UNKNOWN`; перенос ответственности на executor не заменяет доказательство.

## Completeness & Process (Blue Hat)

Proposal 1 близок к decomposition-ready, но до принятия нужны пять точных правок:

- non-duplicating stalled-prompt contract;
- combined compact-review fixture;
- normalized-text relay invariant;
- deterministic model-route readiness policy;
- exact SDK dependency/licensing contract.

E2E также должен определить доказательство того, что orchestrator не читал запрещённые targets. «Observed installed run» слишком расплывчато; требуется полный command interval или эквивалентный access audit.

Proposal 2 требует архитектурного отката, а не ещё одной локальной ревизии. Executor-direct retrieval не соответствует явному «оркестратор только копипастит», не сохраняет complete-turn guarantee и содержит невозможную адресацию предыдущего substantive turn после classification follow-up.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "proposal-2",
      "approval_score": 2,
      "would_adopt": false,
      "summary": "The proposal commendably withdraws its rejected footer/file protocol, but the replacement is not sound. Moving review retrieval to the executor does not make a repainting TUI turn complete, violates the explicit copy-paste handoff requirement, grants the executor unnecessary Herdr control over reviewers, and contains a fatal sequencing bug: a one-word classification follow-up becomes the reviewer's last turn before the executor reads it. Earlier conflicts around technical arbitration, backlog writes, develop fallback, ambient SDK installation, CLI syntax and layout fallback also remain.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "critical",
          "area": "review retrieval",
          "description": "Executor-side reading cannot prove completeness. A repaint collage can silently omit a whole coherent finding, so neither incoherence detection nor a finding count prevents a false pass.",
          "required_change": "Restore orchestrator retrieval of a provider-specific, boundary-and-continuity-proven compact verdict and relay it verbatim; incomplete retrieval must remain UNKNOWN."
        },
        {
          "id": "",
          "severity": "critical",
          "area": "turn addressing",
          "description": "When the verdict is not visible, the reviewer receives a one-word follow-up; that response becomes the last turn, so the executor can no longer address the preceding substantive review through Herdr.",
          "required_change": "Do not mutate the reviewer session before the substantive turn has been completely retrieved, and do not rely on previous-turn addressing that Herdr does not provide."
        },
        {
          "id": "",
          "severity": "critical",
          "area": "requirements compliance",
          "description": "The design tells the executor to read reviewers directly instead of having the orchestrator copy-paste their output, contrary to the explicit clarification.",
          "required_change": "Keep reviewer-to-executor transport owned by the orchestrator, with no semantic assessment."
        },
        {
          "id": "",
          "severity": "major",
          "area": "role isolation",
          "description": "Giving the executor reviewer agent names and Herdr control access allows it to prompt, attach to or manipulate reviewers; a prose read-only rule does not remove that capability.",
          "required_change": "Do not delegate session orchestration to the executor; keep all peer-agent control in mo-herdr."
        },
        {
          "id": "",
          "severity": "major",
          "area": "fallback safety",
          "description": "A reviewer-authored fallback file still has no mechanical completeness proof, yet the design suggests the workflow can continue with it.",
          "required_change": "Treat such a file only as diagnostic evidence; it cannot satisfy the gate unless completeness is independently proven."
        },
        {
          "id": "",
          "severity": "major",
          "area": "orchestrator role",
          "description": "The orchestrator still decides technical forks and writes posture defects into docs/backlog.md, exceeding its process-only responsibility.",
          "required_change": "Route technical choices to executor/reviewers and prohibit implementation-related repository writes by the orchestrator."
        },
        {
          "id": "",
          "severity": "major",
          "area": "model discovery",
          "description": "Setup-time ambient/global SDK installation still rejects the explicitly requested bundled brain-council mechanism.",
          "required_change": "Bundle the pinned SDK into the generated dependency-free helper and use the system subscription-backed provider executable."
        },
        {
          "id": "",
          "severity": "major",
          "area": "VCS and Herdr mechanics",
          "description": "Default-branch fallback, --timeout-ms CLI examples and down-split fallback respectively contradict the requested develop policy, installed CLI syntax and required vertical topology.",
          "required_change": "Require develop, use installed --timeout syntax and fail closed when the requested vertical layout cannot be created."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "documentation scope",
          "description": "The new orchestrator-read-budget architecture document remains unnecessary.",
          "required_change": "Record the boundary in existing methodology and skills-first architecture sources."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "candidate detection",
          "description": "A clean tree and tip commit alone do not prove that the executor declared the implementation complete or that QC passed.",
          "required_change": "Retain a short executor candidate handoff and verify its Git metadata rather than inferring candidacy from Git alone."
        }
      ],
      "assumptions": [
        "Herdr cannot address the previous logical assistant turn after a classification follow-up.",
        "The executor and reviewer agreeing on a finding count is not independent evidence that the underlying transcript was complete.",
        "The user's copy-paste requirement assigns transport responsibility to the orchestrator, not merely eventual access to the executor."
      ],
      "round": 3,
      "reviewer": "gpt56solmedium"
    }
  ]
}
```

---REVIEW-META---
approval_score: 2
would_adopt: false
