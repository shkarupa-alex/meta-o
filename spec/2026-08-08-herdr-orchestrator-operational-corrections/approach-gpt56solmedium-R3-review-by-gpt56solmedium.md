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
      "target_id": "proposal-1",
      "approval_score": 7,
      "would_adopt": false,
      "summary": "This remains the correct architecture and now handles Git object formats and unattended model selection more thoughtfully, but it still carries unresolved transport and verification defects from the previous round. Stalled-prompt recovery can duplicate delivered work, compact interactive support is declared without a combined review-shaped fixture, verbatim relay remains undefined across terminal normalization, and recent successful session history is not a specified or reliable route-readiness source. These are narrow changes rather than a redesign, but they are load-bearing enough to block adoption.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "prompt transport",
          "description": "The retry decision still relies on whether the prompt is visible in recent rendered output, which does not prove delivery or non-delivery and can duplicate a completed turn.",
          "required_change": "Base recovery on pre/post state_change_seq and known input-ready state; any ambiguous delivery becomes transport UNKNOWN rather than a resend."
        },
        {
          "id": "",
          "severity": "major",
          "area": "interactive retrieval",
          "description": "The 180-line support claim has not been demonstrated for a combined real-review scenario with tool calls, repaint and a compact final verdict, and rendered-line count depends on pane geometry.",
          "required_change": "Define logical-line and minimum-geometry constraints and require a provider-specific combined review fixture before marking Claude or Codex interactive review supported."
        },
        {
          "id": "",
          "severity": "major",
          "area": "model preflight",
          "description": "Recent successful session history is undefined as a data source and does not prove current authentication, launch posture, subscription readiness or route quality. Catalog absence is also not clearly distinguished from model absence.",
          "required_change": "Use a deterministic policy based on saved validated selection plus current posture/auth/catalog evidence; define transient catalog failure separately and do not consult unspecified private session history."
        },
        {
          "id": "",
          "severity": "major",
          "area": "handoff evidence",
          "description": "Findings delivered without changes is not testable until the design defines how Herdr soft-wrap and text normalization affect the payload.",
          "required_change": "Define verbatim as complete, ordered, unedited Unicode Markdown after documented Herdr normalization and test that invariant."
        },
        {
          "id": "",
          "severity": "major",
          "area": "SDK distribution",
          "description": "The bundle design still omits exact dependency versions, lockfile policy and preservation of required third-party notices.",
          "required_change": "Pin exact SDK/esbuild versions, define reproducible lockfile inputs, preserve license notices and use isolated execution or syntax-aware inspection to prove no runtime SDK import remains."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "reuse policy",
          "description": "Removing the optional reuse question leaves no explicit replacement for the existing requirement to consider reuse before implementation.",
          "required_change": "Assign the executor a conservative repository-local reuse check or require it to follow the existing recorded reuse decision without escalating an ordinary question."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "review independence",
          "description": "The statement that physical pane adjacency does not give reviewers access to each other's output is too strong in a shared Herdr session.",
          "required_change": "State that independence is a prompt/process rule rather than an access-control boundary."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "role-firewall E2E",
          "description": "Observed installed run does not define evidence that forbidden files were not read.",
          "required_change": "Require an auditable orchestrator command interval or controlled access fixture."
        }
      ],
      "assumptions": [
        "A recent provider session is not sufficient evidence of current successful unattended launch.",
        "Terminal normalization prevents literal byte identity while still permitting an exact normalized-text invariant.",
        "Bundled SDK JavaScript with a system provider executable remains compatible with the dependency-free shipped-helper contract."
      ],
      "round": 3,
      "reviewer": "gpt56solmedium"
    }
  ]
}
```

---REVIEW-META---
approval_score: 7
would_adopt: false
