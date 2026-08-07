# Meta-O vNext: skills-first workflow — комплект спецификации

## Authoritative document

[`2026-08-05-ai-driven-development-workflow-revision-council-brainstorm.md`](./2026-08-05-ai-driven-development-workflow-revision-council-brainstorm.md)
— единственный normative result консилиума, вместе с двумя addendum'ами той же силы:

- [`addendum-01-business-framing.md`](./addendum-01-business-framing.md) — добавляет
  требование постановщика, не входившее в консилиум;
- [`addendum-02-orchestrator-owned-capture.md`](./addendum-02-orchestrator-owned-capture.md)
  — **изменяет §7.2 и только его**: разрешает захват stdout процесса, запущенного
  оркестратором, и вводит требование structural envelope как доказательства конца
  turn'а. §8 он не меняет; native export там, где он есть, остаётся обязательным.
  В отличие от addendum-01 он написан по измерениям, а не со слов постановщика, —
  поэтому оформлен отдельно и может быть отклонён целиком.

Brainstorm заменяет архитектурные решения
[`spec/2026-07-24-ai-driven-development-workflow/`](../2026-07-24-ai-driven-development-workflow/README.md);
обратная совместимость не требуется.

`task-description.md`, `synthesis.md`, `council-report.md`, proposals, cross-reviews,
premortem, judge reviews и `sessions/` сохраняются как история обсуждения и
**не** переопределяют принятые решения. `spec-review.md` — рабочий артефакт
review job, а не утверждённая спецификация.

## Статус

Все семь skills, methodology, purpose contract, model helper, distribution и гейты
существуют и проходят `make mo-qc`. 2026-08-06 и 07 выполнены capability fixtures (§H
по каждому provider **и по каждой поверхности**, §G кроме trust-шага, §O кроме
открытых строк, §W, §M, §R целиком, §P для двух provider из трёх; §H при этом не
закрыт — H7b открыт на TUI-поверхности всех трёх маршрутов и N/A на captured inline) и **два полных прогона —
по одному на каждый backend**: постановка → спека → executor-сессия → QC → frozen SHA
→ два независимых ревьюера, минимум один на другом вендоре → находки дословно → новый
SHA → все гейты заново. **Семь кандидатов на Herdr-маршруте (семь завершённых review
round'ов) и шесть на Omnigent (пять завершённых review round'ов; шестой кандидат не
ревьюился).** Каждый завершённый round дал общий FAIL.

**Verified candidate так и не получен: каждый раунд — FAIL** на настоящих находках
(см. [`docs/e2e.md`](../../docs/e2e.md)), причём один раз ревьюер поймал удалённый
критерий приёмки — его удалили вместо того, чтобы выполнить. Три результата меняют то,
как workflow следует использовать: `herdr agent read` режет вывод на 1000 строках и
scroll-метода нет, поэтому длинный ответ из TUI — это `unknown`, а inline-поверхность
(`claude -p`, `codex exec`, `opencode run` через `herdr pane run`, с перехватом stdout
в файл) отдала 800 строк точно и сохраняет адресуемую сессию для rebuttal; REPL
Omnigent отвечает `Unknown command: /goal`, то есть goal-driven lifecycle на этом
route невозможен вовсе — прогон там шёл на более слабой prompt-text цели; и пустой
ответ с кодом выхода 0 наблюдался на двух разных harness, то есть «ревьюер ничего не
нашёл» — это `unknown`, а не PASS.

## Где это реализовано

| §  | Тема | Реализация |
|---|---|---|
| 4, 7 | `mo-herdr` | [`src/skills/mo-herdr/`](../../src/skills/mo-herdr/SKILL.md) + `references/herdr-mechanics.md` |
| 4, 8 | `mo-omnigent` | [`src/skills/mo-omnigent/`](../../src/skills/mo-omnigent/SKILL.md) + `references/omnigent-mechanics.md` |
| 4, 9 | `mo-reuse` | [`src/skills/mo-reuse/`](../../src/skills/mo-reuse/SKILL.md) |
| 4, 10 | `mo-review` | [`src/skills/mo-review/`](../../src/skills/mo-review/SKILL.md) |
| 4, 12, 13 | `mo-setup` | [`src/skills/mo-setup/`](../../src/skills/mo-setup/SKILL.md) + `references/qc-python.md`, `references/qc-typescript.md` |
| 4, 11 | `mo-e2e` | [`src/skills/mo-e2e/`](../../src/skills/mo-e2e/SKILL.md) |
| 4, 16 | `mo-watchdog` | [`src/skills/mo-watchdog/`](../../src/skills/mo-watchdog/SKILL.md) |
| 3, 5, 6, 17, 18 | canonical methodology (один owner) | [`shared/references/methodology.md`](../../shared/references/methodology.md) |
| 14 | purpose и architecture contract | [`shared/references/purpose-and-architecture.md`](../../shared/references/purpose-and-architecture.md) |
| 15 | `~/.meta-o/models.json` | [`shared/scripts/mo-models.mjs`](../../shared/scripts/mo-models.mjs) |
| 19 | distribution | [`tools/build-skills.mjs`](../../tools/build-skills.mjs), [`skills/`](../../skills/), [`apm.yml`](../../apm.yml), [`docs/architecture/distribution.md`](../../docs/architecture/distribution.md) — installable tree лежит в `skills/`, а не в `dist/`: apm/`npx skills` находят именно этот путь, `apm install ./dist` отвергается. См. раздел ниже |
| 20 Phase 0 | capability fixtures | [`docs/phase-0-fixtures.md`](../../docs/phase-0-fixtures.md) |
| 20 Phase 2 | destructive simplification | выполнено; удалённый control layer остался только в истории Git. **Порядок фаз нарушен намеренно** — см. раздел ниже |
| 21 | acceptance criteria | [`docs/acceptance.md`](../../docs/acceptance.md) |
| A1–A5 (addendum) | бизнес-постановка | [`addendum-01-business-framing.md`](./addendum-01-business-framing.md); methodology §2.1; [`docs/business.md`](../../docs/business.md) |
| 7.2 + addendum-02 | retrieval: захват stdout и structural envelope | [`addendum-02-orchestrator-owned-capture.md`](./addendum-02-orchestrator-owned-capture.md); [`docs/architecture/full-turn-retrieval.md`](../../docs/architecture/full-turn-retrieval.md); `mo-herdr/references/herdr-mechanics.md §1.7`, `§3` |
| 8 | native export; route без достижимого export — unsupported | `mo-omnigent/references/omnigent-mechanics.md §2`; addendum-02 §8 не меняет, и следствие для Omnigent записано там же и в [`docs/phase-0-fixtures.md §O`](../../docs/phase-0-fixtures.md) |
| 23 | open questions | не блокирующие; conditional contracts закрываются Phase 0 |

## Отклонения от спеки, зафиксированные честно

**Phase 2 выполнена до Phase 0.** Спека ставит capability fixtures первыми, и на
это есть причина: route, чьи возможности не проверены, не должен считаться
поддерживаемым. Пользователь прямо потребовал не откладывать ничего на потом, и
удаление control layer было выполнено первым. Практическое следствие держалось до
2026-08-06: fixtures были почти целиком открыты, а enforcement уже удалён.
Сейчас [`docs/phase-0-fixtures.md`](../../docs/phase-0-fixtures.md) заполнен по
поверхностям и провайдерам — и то, что он показывает, важнее самого факта закрытия:
TUI-поверхность несёт review gate только на Codex; inline-поверхность точна на всех
трёх, но точность — не поддержка, и OpenCode gate не несёт ни на одной из своих
поверхностей, потому что tool-using turn там заканчивается пустым ответом со
статусом 0; Omnigent не несёт goal-driven lifecycle вообще. Ни один провайдер не
закрыт полностью: H7b (resize окна хоста) открыт сразу на всех трёх, потому что
меряет Herdr, а не провайдера, — поэтому честная формулировка «Codex и Claude
поддержаны с открытым H7b», а не «поддержаны». Открытыми остаются §Q
целиком, I3–I5, G3b, H6 (нужен провайдер, который действительно перерисовывает),
H7b, H9 для OpenCode, O6 и O7. Запуск обязан называть
конкретную поверхность, на которой он получил ответ, а не считать route работающим
целиком.

Аварийный выход, если fixture провалится: удалённый control layer целиком лежит в
истории Git (последний коммит до удаления), и любую его часть можно поднять
адресно — но только с названной причиной, записанной в
[`docs/architecture/`](../../docs/architecture/skills-first.md). Возврат «на всякий
случай» — это ровно та архитектура, которую спека и удаляла.

**Capture stdout инлайн-провайдера — разрешён отдельным addendum'ом.** §7.2
запрещает verdict file, `mktemp`, nonce и completion marker, и это остаётся в силе:
всё перечисленное — кооперативные протоколы, где артефакт производит модель.
Перенаправление stdout процесса, который запустил сам оркестратор, у модели не
просит ничего — redirect, `$?` и sentinel делает shell, — а границей полноты
становится завершение процесса вместо 1000-строчного окна, которое tool-лог
reviewer'а переполнил на 4-м раунде реального прогона. Разрешение, его границы
(location вне репозитория, запрет коммита, recovery, `unknown` без sentinel) и
откат, если пользователь его не примет, записаны в
[`addendum-02-orchestrator-owned-capture.md`](./addendum-02-orchestrator-owned-capture.md).
В отличие от addendum-01 он написан по измерениям, а не со слов заказчика, — поэтому
и оформлен отдельным документом, который можно отклонить целиком.

**`dist/` → `skills/`.** §19 называет installable tree `dist/`. Такой layout не
устанавливается: apm 0.27.0 отвергает `apm install ./dist` («no apm.yml, SKILL.md,
or plugin.json found» — валидируется ровно переданный каталог), а установка из
корня репозитория находила authored tree в `skills/` и ставила skills **без**
их `references/` и `scripts/`. Поэтому built tree занял имя, которое ищет
discovery, а authored tree переехал в `src/skills/` — чтобы discovery до него не
доставал. Оба провала воспроизведены; см.
[`docs/architecture/distribution.md`](../../docs/architecture/distribution.md) и
`tests/install.test.mjs`, который выполняет реальный `apm install`.

**Бизнес-постановка — нормативный addendum, а не «сверх спеки».** Требование
хранить исходный промпт и все уточнения дословно в `docs/business.md` и сверять
против них спеку, реализацию и критерии приёмки пришло из
`docs/references/my-opinion.md`, то есть от постановщика, и оформлено как
[`addendum-01-business-framing.md`](./addendum-01-business-framing.md) с той же
силой, что и brainstorm. Критерии A1–A5 этого addendum'а имеют собственные строки
в [`docs/acceptance.md`](../../docs/acceptance.md). Сама спека консилиума
написана до появления правила и из зафиксированной постановки не выведена; это
названо в [`docs/acceptance.md`](../../docs/acceptance.md) и в
[`docs/backlog.md`](../../docs/backlog.md), вместе с двумя открытыми вопросами —
как не превратить файл в энциклопедию и чем проверять правила §2.1, у которых нет
гейта: прочитана ли постановка (R4), не попал ли секрет в Git дословно (R5) и
отказывается ли standalone `mo-review` сходиться без постановки (R6).

**Секреты — единственное исключение из дословности (A5).** Постановка коммитится и
пушится, поэтому токены, пароли, ключи и персональные данные хранятся как маркер
`[REDACTED: …]`, называющий, чем было значение; всё остальное — дословно, а
неустранимое сомнение — `needs_attention`. Правило добавлено после ревью, которое
заметило, что A1 в исходном виде требовал записать в Git и `TOKEN=...`.

**Настоящие парсеры вместо самописных.** Контракт запрещает regex-разбор Markdown и
рукописные парсеры. Build tool теперь читает frontmatter через `js-yaml`, а тест
self-containment — через токены `markdown-it`; оба уже были в дереве транзитивно и
объявлены прямо. Это закрыло два подтверждённых false-green: два поля `name:`
принимались (побеждало первое) и ссылка вида `[x](<a b.md>)` не проверялась вовсе.
