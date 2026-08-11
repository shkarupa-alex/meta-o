## Facts & Constraints (White Hat)

Proposal 1 заметно улучшен и теперь близок к исходной задаче. Он исправил основные проблемы предыдущей версии:

- role firewall запрещает оркестратору читать spec, framing, code и diff;
- feasibility и QC принадлежат исполнителю;
- reviewers остаются видимыми интерактивными CLI sessions;
- inline/headless actor routes исключены;
- ожидание больше не зависит от будущего SHA;
- лимит verdict снижен с необоснованных 700 до 180 строк;
- bundled Claude SDK соответствует явно запрошенному механизму;
- fallback с `main` удалён.

Однако 180 rendered lines пока нельзя считать доказанным универсальным пределом. Успешный Claude H2 и успешный tool-use H4 проверяли разные формы turn: длинный простой ответ и короткий ответ после инструментов. Нужна комбинированная fixture с настоящим review prompt, tool use и 180-строчным verdict. Кроме того, модель не может надёжно предсказать rendered lines: они зависят от ширины панели и wrapping. Контракт должен задавать logical Markdown lines и фиксированную минимальную геометрию, а фактическую полноту всё равно доказывать после turn.

Proposal 2 по-прежнему противоречит прямому требованию пользователя: orchestrator должен копировать verdict исполнителю, а не передавать путь. Его файловый протокол также конфликтует с существующим fail-closed решением о полноте reviewer turn.

## Risks & Failure Modes (Black Hat)

В Proposal 1 остаётся опасность повторной доставки prompt. `agent_prompt_stalled` означает отсутствие наблюдаемого lifecycle transition, а не доказанную недоставку. Условие «prompt не появился в recent output» ненадёжно при alternate screen, repaint и очень быстром завершении turn. Если `state_change_seq` увеличился или actor уже успел завершиться, повторять prompt нельзя; ответ должен считаться transport-unknown и читаться как уже состоявшийся turn.

Acceptance «findings передаются без byte changes» всё ещё невыполним буквально. Herdr нормализует soft wraps и terminal rendering; исходные provider bytes недоступны. Нужен проверяемый инвариант: полный, упорядоченный и неизменённый Markdown payload после Herdr text normalization.

Также не определено, как E2E доказывает, что orchestrator не открывал запрещённые файлы. Проверка наличия запрета в Markdown подтверждает контракт, но не поведение. Нужен instrumented fixture: контролируемый transcript команд orchestrator session либо canary-access audit, не создающий durable state.

Bundled SDK описан лучше, но ещё отсутствуют:

- точные pinned версии SDK и esbuild;
- политика lockfile;
- сохранение обязательных third-party license notices;
- проверка, что bundle не содержит runtime imports, через синтаксический анализ или isolated execution, а не поиск строки, которая может встречаться в комментариях.

Proposal 2 имеет более фундаментальные риски:

- `chmod 700` не изолирует двух reviewers, работающих под одним Unix user. Оба имеют права владельца и могут перечислить scratch tree. «Ungues­sable path» — obscurity, не security boundary; fixture H17 не может доказать невозможность доступа при общем полном filesystem access.
- Footer и непустой файл не доказывают полноту findings. Исполнитель не может обнаружить finding, который исчез при частичной записи.
- `VERDICT: PASS` вообще не создаёт содержательного artefact, поэтому новый транспорт не даёт больше доказательств, чем cooperative sentinel.
- Orchestrator снова принимает технические решения из standing principles, хотя clarification запрещает ему принимать технические и архитектурные решения за actors.
- Запись posture defect в `docs/backlog.md` самим orchestrator нарушает его процессную роль.
- В CLI-примере используется `agent start --timeout-ms`, тогда как установленный CLI использует `--timeout`.
- Fallback со split `down` нарушает явно требуемую вертикальную раскладку.
- Inline остаётся fallback, хотя clarification требует обычные видимые interactive sessions.

## Strengths & Benefits (Yellow Hat)

Proposal 1 теперь хорошо связывает почти все требования в одну реалистичную архитектуру. Особенно удачны:

- точное разделение между orchestration metadata и техническим содержимым;
- readiness response, через который executor возвращает resolved business path;
- reviewer-owned dispute arbitration;
- fail-closed поведение для нечитаемого verdict;
- provider-specific support matrix вместо предположения, что любой Herdr agent kind годится для review;
- корректная VCS политика без выдуманного fallback;
- explicit system Claude executable при bundled SDK;
- отсутствие нового architecture document;
- ясная декомпозиция на восемь increments.

Proposal 2 правильно исправил прежнюю ошибку с двойным `tab create`, точнее описал Herdr schema и сохранил полезные идеи о lifecycle-only waiting, persistent sessions и topology recovery. Но эти локальные улучшения не исправляют центральный неверный transport design.

## Alternatives & Creative Ideas (Green Hat)

Proposal 1 стоит довести до convergence следующими уточнениями:

1. Заменить «180 rendered lines» на «не более 180 logical Markdown lines при панели не уже зафиксированного minimum width». Перед объявлением Claude/Codex route supported выполнить combined review-shaped fixture с tool calls.
2. При `agent_prompt_stalled` сравнить pre/post `state_change_seq`:
   - увеличился или actor `working` — не повторять;
   - увеличился и actor settled — читать состоявшийся turn;
   - не увеличился, actor settled, prompt boundary отсутствует — один retry;
   - неоднозначность — transport `UNKNOWN`, не duplicate submission.
3. Определить verbatim relay как неизменённую последовательность Unicode text blocks после документированной Herdr normalization, а не byte identity.
4. Для role-firewall E2E использовать command audit: reviewer проверяет полный orchestrator terminal interval и подтверждает отсутствие `open`, `sed`, `rg`, `git diff` и аналогичных чтений запрещённых targets. Это agent-required evidence, а не новый state store.
5. Добавить narrow-pane policy: если требуемый right split не даёт минимальной ширины, не менять его на horizontal layout молча; вернуть конкретный layout `needs_attention` или использовать отдельную sufficiently-wide tab только по заранее записанному правилу.

Proposal 2 нельзя безопасно исправить небольшими правками. Его следует заменить транспортом Proposal 1. Общий filesystem означает, что независимость reviewers обеспечивается prompts и первоначальным параллельным запуском, а не фиктивной ACL-изоляцией.

## Completeness & Process (Blue Hat)

Proposal 1 почти decomposition-ready, но четыре контракта должны быть закрыты до реализации:

- non-duplicating stalled-prompt recovery;
- combined compact-review fixture и определение logical/rendered lines;
- реалистичный relay invariant вместо byte identity;
- конкретное доказательство role firewall в E2E.

Bundle increment также должен включать licensing и exact version/lockfile decisions. После этих уточнений предложение можно принимать без изменения общей архитектуры.

Proposal 2 остаётся внутренне противоречивым. Он одновременно признаёт, что file/footer transport слабее provider envelope, и утверждает, что truncated file не может создать false PASS; это не доказано. Он также называет inline demoted fallback, хотя задача прямо отвергает такой actor route, и сохраняет default-branch fallback вопреки дословной VCS политике. Это уже не набор открытых деталей, а неверно выбранная основа.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "proposal-1",
      "approval_score": 7,
      "would_adopt": false,
      "summary": "The revision now has the right architecture and resolves most earlier objections: a genuine thin orchestrator, visible persistent interactive actors, executor-owned feasibility and QC, reviewer arbitration, lifecycle-only waits, fail-closed compact retrieval, bundled Claude discovery, and the requested VCS/documentation discipline. I would adopt this direction after a narrow final revision, but not yet as written because stalled-prompt recovery can still duplicate a delivered turn, the 180-line support claim lacks a combined review-shaped fixture, byte-identical relay is not meaningful through terminal normalization, and role-firewall E2E evidence remains unspecified.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "prompt transport",
          "description": "A settled actor whose prompt is absent from recent output is not proof of non-delivery; alternate-screen rendering or a fast completed turn can hide it, so the proposed retry can submit the same work twice.",
          "required_change": "Record pre-send state_change_seq, compare it after the stall, never resend after any observed transition, and classify ambiguous delivery as transport UNKNOWN rather than retrying."
        },
        {
          "id": "",
          "severity": "major",
          "area": "interactive retrieval",
          "description": "The 180-line limit combines evidence from separate fixtures but has not been demonstrated for a real review-shaped interactive turn containing tool use, investigation, repaint, and a compact final verdict. Rendered-line count also depends on pane geometry.",
          "required_change": "Define a logical-line limit plus minimum pane geometry and gate initial Claude/Codex support on a combined provider-specific review fixture with tool calls and complete boundary/continuity proof."
        },
        {
          "id": "",
          "severity": "major",
          "area": "handoff evidence",
          "description": "The E2E requirement that findings arrive without byte changes is impossible to establish through Herdr text rendering and soft-wrap normalization.",
          "required_change": "Define verbatim as a complete, ordered, unedited Unicode Markdown payload after documented Herdr normalization, and test that invariant instead of raw byte identity."
        },
        {
          "id": "",
          "severity": "major",
          "area": "role firewall verification",
          "description": "Static tests can prove that the skill contains a prohibition but the proposal does not specify how the agent-required E2E proves that the orchestrator actually avoided spec, framing, diff, and source reads.",
          "required_change": "Specify auditable runtime evidence, such as a complete orchestrator command interval or controlled canary-access fixture, without introducing durable orchestration state."
        },
        {
          "id": "",
          "severity": "major",
          "area": "bundled SDK distribution",
          "description": "The bundle pipeline still omits exact dependency versions, lockfile policy, and preservation of third-party licensing notices.",
          "required_change": "Pin exact SDK/esbuild versions, define lockfile updates and deterministic build inputs, preserve required notices, and validate runtime independence through isolated execution or syntax-aware import inspection."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "layout",
          "description": "No policy is given for a current pane too narrow to produce two usable vertical panes.",
          "required_change": "Define a minimum width and a fail-closed layout response that does not silently replace the requested vertical topology."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "recovery",
          "description": "Adoption mentions actor name, pane, cwd, kind, and state but does not define the outcome when only some attributes match.",
          "required_change": "Provide an ordered adoption matrix: exact match adopts, safe settled mismatch is renamed or moved only when owned, and ambiguous foreign occupancy yields needs_attention."
        }
      ],
      "assumptions": [
        "Existing separate H2 and H4 observations do not by themselves prove the combined 180-line review workflow.",
        "Herdr text normalization prevents a literal byte-identity guarantee even when semantic text is preserved.",
        "Bundling the SDK into one generated runtime-independent helper is compatible with the two dependency-free shipped-helper contract."
      ],
      "round": 2,
      "reviewer": "gpt56solmedium"
    }
  ]
}
```

---REVIEW-META---
approval_score: 7
would_adopt: false
