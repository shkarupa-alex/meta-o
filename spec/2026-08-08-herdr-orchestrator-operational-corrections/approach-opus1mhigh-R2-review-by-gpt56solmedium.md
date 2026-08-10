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
      "target_id": "proposal-2",
      "approval_score": 2,
      "would_adopt": false,
      "summary": "The revision improves topology details and schema grounding, but it doubles down on the wrong architectural core. Findings-by-path contradicts the user's explicit copy-paste requirement and cannot prove completeness; same-user chmod directories do not isolate reviewers; inline fallback, default-branch fallback, ambient global SDK installation, orchestrator-owned technical decisions, and orchestrator backlog writes all conflict with the clarified task. Several concrete CLI and layout contracts are also wrong, so this proposal requires redesign rather than refinement.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "critical",
          "area": "review transport",
          "description": "The primary findings file plus footer is cooperative model output and does not prove that every finding was written. A non-empty partial file and valid footer can silently omit a blocker, while the executor has no way to detect missing content.",
          "required_change": "Remove file-first review transport and restore complete verbatim verdict routing through a Herdr surface with independently proven boundaries and continuity."
        },
        {
          "id": "",
          "severity": "critical",
          "area": "requirements compliance",
          "description": "Path handoff replaces the explicitly requested orchestrator copy-paste behavior, and inline remains a fallback despite the requirement for ordinary visible persistent interactive reviewer sessions.",
          "required_change": "Use interactive Herdr agents exclusively for executor and reviewers, and have the orchestrator relay their complete textual verdicts without semantic processing."
        },
        {
          "id": "",
          "severity": "major",
          "area": "review independence",
          "description": "Separate chmod 700 directories do not isolate reviewers running as the same operating-system user with the same full filesystem authority; unguessable names provide obscurity only.",
          "required_change": "Do not claim filesystem isolation or gate independence on H17. Preserve independence through prompts, parallel first-pass scheduling, and the existing rule boundary, or introduce a real sandbox only if separately authorized and architecturally justified."
        },
        {
          "id": "",
          "severity": "major",
          "area": "orchestrator role",
          "description": "The routing table tells the orchestrator to decide technical implementations and write posture defects to docs/backlog.md, contradicting the clarification that it manages process only and does not make technical decisions or implementation documentation changes.",
          "required_change": "Route technical choices to the executor or independent reviewer and prohibit repository writes by the orchestrator outside explicitly authorized business-framing capture."
        },
        {
          "id": "",
          "severity": "major",
          "area": "model discovery",
          "description": "Ambient or global SDK installation rejects the user's explicit brain-council-style bundling request and preserves the original machine-dependent failure mode.",
          "required_change": "Bundle the pinned Claude SDK JavaScript into the generated dependency-free helper while using the system subscription-backed Claude executable."
        },
        {
          "id": "",
          "severity": "major",
          "area": "version control",
          "description": "The default-branch fallback still contradicts the requested mandatory develop-base policy.",
          "required_change": "Treat a missing develop branch as a concrete repository-policy blocker; do not silently branch from main or another default."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Herdr mechanics",
          "description": "The example uses agent start --timeout-ms although the installed CLI exposes --timeout, and it silently substitutes a down split when the user explicitly requested vertical side-by-side panes.",
          "required_change": "Use installed CLI syntax and fail closed or apply an explicitly designed vertical-layout recovery when width is insufficient."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "documentation scope",
          "description": "A new orchestrator-read-budget architecture document is unnecessary when the revised boundary fits the existing skills-first decision.",
          "required_change": "Amend existing methodology and skills-first architecture sources instead of creating another document."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "code comments",
          "description": "Requiring a code comment at every declined finding creates ritual prose and can preserve obsolete review arguments beside otherwise clear code.",
          "required_change": "Record rationale only for non-obvious accepted risks whose reason future maintainers would otherwise lose."
        }
      ],
      "assumptions": [
        "All reviewer sessions run with the same ordinary user authority, so chmod cannot create isolation between them.",
        "The clarification requiring copy-paste excludes filesystem-path substitution.",
        "The exact requested develop policy takes precedence over a generalized default-branch convention."
      ],
      "round": 2,
      "reviewer": "gpt56solmedium"
    }
  ]
}
```

---REVIEW-META---
approval_score: 2
would_adopt: false
