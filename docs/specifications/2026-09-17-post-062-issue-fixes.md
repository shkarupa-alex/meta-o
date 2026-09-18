# Спецификация: закрытие issues #1–#17 meta-o после релиза 0.6.2

Дата: 2026-09-17. Источник: консилиум `opus1mhigh` + `gpt56solmedium` (3 раунда
предложений, перекрёстные ревью, pre-mortem, два раунда корректировок) и решения
владельца, принятые в диалоге.

Документ самодостаточен: все контракты, форматы вывода и коды выхода записаны
здесь, без отсылок «см. предложение 1/2».

## 1. Область и результат

Одна фича закрывает 17 открытых issues репозитория `shkarupa-alex/meta-o`.
Meta-O не получает движок процесса, прокси над нативными CLI, общее хранилище
состояния, manifest, receipt или baseline без названного внешнего потребителя.

Результат — один полный Git SHA (`S`), прошедший `make mo-qc`, две свежие
вендорно-разнородные проверки, применимые E2E и обязательную матрицу эвалов.
Последний этап разработки — бенчи и эвалы на `codex/gpt-5.6-luna/low` и Claude
Sonnet/low, включая перепроверку оркестрации и прямого ревью на luna.

## 2. Решения владельца (заморожены)

Идентификаторы совпадают с реестром замороженных решений хоста; переформулировка
запрещена.

| id  | Решение                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1  | Обязательные эвал-профили **постоянно** заменяются на `codex/gpt-5.6-luna/low` и Claude Sonnet/low. Желательные `codex/gpt-5.6-luna/max` и OpenCode/Qwen сохраняются.                                                                                                                                                           |
| U2  | Issue #12 закрывается только через mo-setup / `project-setup.md`: требование и шаблон документа команд и граблей. §B-MEMORY-05 и `docs/papercut.md` самого meta-o не меняются.                                                                                                                                                  |
| U3  | Агент сам заводит issues методологии: «поищи issue по теме; нет — создай; есть — допиши свой случай комментарием». Подтверждение человека не требуется. Область — только методология и её скилы.                                                                                                                                |
| U4  | Диалог доверия Claude агент подтверждает сам двухшаговой процедурой через `orca terminal send` (стрелка → чтение выбранного варианта → Enter) со скриптом-классификатором. При неизвестном экране или неизвестном эффекте — без повтора.                                                                                        |
| U5  | Жёсткого стопа до старта нет. Поддерживаются обе регистрации Orca (git и folder) с разными рецептами, оба пути проверяются в E2E и эвалах. Бриф называет точный коммит и требует read-only обращения с текущей папкой; способ чтения кандидата выбирает сам ревьюер.                                                            |
| U6  | Человеку-заказчику по его явной просьбе о бизнес-вопросах показываются: одна дословная строка индекса `F-NNN [Px] …`, слот, путь к отчёту и один продуктовый вопрос. Тело находки не пересказывается.                                                                                                                           |
| U7  | Модель Claude записывается алиасом каталога (`sonnet`, `opus[1m]`) без `--force`; живой запуск доказывает точный effective id. Обязательный эвал-профиль требует effective `claude-sonnet-5`.                                                                                                                                   |
| U8  | Issues #13–#17 входят в эту же фичу.                                                                                                                                                                                                                                                                                            |
| U9  | Последний этап разработки — бенчи и эвалы на `codex/gpt-5.6-luna/low` и Claude Sonnet/low, включая перепроверку оркестрации и прямого ревью на luna.                                                                                                                                                                            |
| U10 | Обязательная база — `codex/gpt-5.6-luna/low` и `claude/sonnet/low`. `mo-orchestrate-orca` обязан проходить на luna/low без повышения. Скил, чьи случаи доказанно нестабильны, повышает **свою** обязательную Codex-координату до `codex/gpt-5.6-terra/low` записью причины в политике; Claude-координата остаётся `sonnet/low`. |
| U11 | Отдельный профилировщик QC не создаётся: `mo-qc` печатает длительность стадии, замеры «до/после» живут в теле коммита оптимизации.                                                                                                                                                                                              |
| U12 | Оркестратор допускается и вне Orca. Наблюдатель перестаёт быть условием запуска: его доступность проверяется, только когда пользователь явно просит watchdog.                                                                                                                                                                   |
| U13 | Специального правила для экрана предупреждения bypass-permissions не вводится: такой экран владелец не наблюдал. Обрабатывается только диалог доверия к папке, любой нераспознанный экран даёт отказ.                                                                                                                           |

### 2.1. Решения консилиума (не заморожены)

| id  | Решение                                                                                                                                                                                                                                                                                                            | Источник                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| D4  | Право самостоятельной записи Issue методологии получают только скилы жизненного цикла, которые уже маршрутизируют внешнюю работу: `mo-orchestrate-orca`, `mo-review-orca`, `mo-setup`. `find-reuse`, `senior-jsts` и `senior-python` этой фичей не меняются, а `mo-e2e` и `mo-watchdog` получают канал без записи. | собственные контракты скилов, ревью раунда 2 |

### 2.2. Отчёт о конфликте

Ревью раунда 1 сочло правило эскалации до `gpt-5.6-terra/low` противоречащим U1.
Конфликта нет: U1 задаёт постоянную **базу**, а U10 — принятое позже решение
того же владельца, которое задаёт именованный клапан поверх этой базы. U10
уточняет U1 и имеет приоритет над оценкой ревьюера. Границы клапана:
`mo-orchestrate-orca` повышению не подлежит; повышается координата отдельного
скила, а не всей матрицы; Claude-координата не меняется; каждое повышение
записывается в `docs/architecture/evaluation-model-policy.md` с причиной, датой
и наблюдением нестабильности. Пока повышение не записано, действует
`repetition=1` и правится текст скила, а не профиль.

Второй разбор границы (D4) конфликтом с U3 не является. U3 говорит «агенты сами
создают issues в `shkarupa-alex/meta-o` … только методология и её скилы» и не
называет, какие именно скилы обязаны уметь писать.
`src/skills/find-reuse/SKILL.md` в своём теле утверждает, что скил «never writes
repository files, installs tools, logs in», а `senior-jsts` и `senior-python` —
консультативные скилы без роли в жизненном цикле и без координатора. Выдать им
внешнюю запись значило бы сломать их собственные контракты, а не исполнить U3.
Поэтому запись остаётся у трёх скилов жизненного цикла, а наблюдения `mo-e2e` и
`mo-watchdog` доходят до пишущей стороны каналом без записи (§5.4).

## 3. Изменения знаний

### 3.1. Бизнес-тезисы

| Тезис          | Действие                             | Содержание                                                                                                                                                                                                                                                                                               |
| -------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §B-EVAL-01     | смысловая правка литералов (`reuse`) | Обязательные профили — `codex/gpt-5.6-luna/low` и Claude `sonnet`/low. «Совпавшая фактическая идентичность» уточняется: маршрут и уровень совпадают дословно, а модель либо совпадает дословно, либо разрешается объявленным алиасом каталога в точный обязательный id. Желательные профили не меняются. |
| §B-REVIEW-06   | новый id                             | Размещение не останавливает немутирующее ревью: если изолированные worktree недоступны, ревьюеры стартуют в существующем workspace проекта, а идентичность кандидата обеспечивают бриф и SHA-привязанное чтение.                                                                                         |
| §B-SELFHOST-03 | новый id                             | О трении методологии агенты сообщают сами: вопрос, предложение или дефект скила и его инструкций попадают в Issues методологии без подтверждения человека. Право записи принадлежит скилам жизненного цикла Meta-O; консультативные и портируемые скилы сохраняют свой запрет на внешнюю запись.         |
| §B-UPTIME-02   | смысловая правка (`reuse`)           | Наблюдатель остаётся ради лимитов и перегрузки, но перестаёт быть условием запуска управляющего слоя. Его доступность проверяется, только когда пользователь просит watchdog; иначе оркестратор объявляет отсутствие пробуждения как принятое ограничение.                                               |

**Грамматика авторизации (исправлено в раунде 1).**
`tools/knowledge-history.mjs` принимает ровно три глагола: `remove`, `reuse`,
`editorial`. Глагола `new` не существует и он не вводится.

- **Новый идентификатор** (§B-REVIEW-06, §B-SELFHOST-03) трейлера не требует:
  добавление определения не является ни удалением, ни смысловым повторным
  использованием. Требуется только, чтобы определение было уникальным в текущем
  дереве и все ссылки на него существовали в том же коммите.
- **Правка литералов или нормативной прозы существующего тезиса** (§B-EVAL-01,
  §B-UPTIME-02) — это `semantic reuse`, а не `editorial`: проверка истории уже
  доказывает это тестом «editorial authorization preserves literals». Такой
  коммит несёт `Knowledge-ID-Change: reuse <id> via <architecture-id>` и в том
  же коммите — YAML-запись с полями `action: reuse`, `id`, непустыми `reason` и
  `new_boundary`, `references_updated: true`. Названное решение `§A-*` обязано
  существовать в том же коммите.
- **Контейнер записи выбирается по факту, а не по вкусу**
  (`tools/knowledge-history.mjs:226`): принимаются оба ключа,
  `knowledge_id_changes` (массив) и `knowledge_id_change` (одна запись), но
  читается **только первый YAML-блок раздела решения**. Отсюда три следствия,
  обязательные к исполнению:
  - решение, у которого уже есть массив `knowledge_id_changes` (сегодня это
    §A-EVAL-01, §A-MEMORY-01, §A-ISSUE-01, §A-REVIEW-04, §A-DELIVERY-01,
    §A-BACKLOG-01), получает **новый элемент этого же массива**; второй
    YAML-блок рядом не читается и молча потеряет запись;
  - решение с единственным `knowledge_id_change` (§A-DISTRIBUTION-02) при второй
    записи переводится в массив: прежняя запись становится первым элементом
    **дословно**, новая — вторым;
  - прежние записи append-only: их изменение или удаление в том же коммите даёт
    `authorization history changed <id>`, то есть коммит, который авторизует
    правку, сам её и завалит. Перед коммитом задача сверяет, какой контейнер уже
    стоит в разделе решения, и не заменяет его.
- `editorial` в этой фиче не используется: ни одна правка не ограничивается
  заголовками, подписями ссылок и пробелами.

Каждая строка таблицы — отдельный коммит.

### 3.2. Архитектурные решения

| Решение             | Действие | Содержание                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §A-EVAL-01          | reuse    | Новые обязательные координаты; контракт алиас → effective в доказательстве v3 (§4.7); `repetition=1` сохраняется; дрейф алиаса даёт типизированный `alias_resolution_changed`.                                                                                                                                                                                                                                    |
| §A-MEMORY-01        | reuse    | Контракт истории идентификаторов переносится в `shared/` (решение дословно называет `tools/knowledge-history.mjs`), поставляется скилами и копируется в целевой проект с меткой версии.                                                                                                                                                                                                                           |
| §A-ISSUE-01         | reuse    | Класс `ISS-16 methodology_issue`, адресат из метаданных скила, ограниченный список пишущих скилов, режим без записи в эвалах и E2E.                                                                                                                                                                                                                                                                               |
| §A-SESSION-01       | reuse    | Лестница размещения `isolated → shared_checkout`; ресурсы обоих режимов остаются ресурсами исходного проекта; перечень авторизованных изменений общего репозитория и обязанность их снять.                                                                                                                                                                                                                        |
| §A-REVIEW-04        | reuse    | Проекция для человека-заказчика по U6.                                                                                                                                                                                                                                                                                                                                                                            |
| §A-DELIVERY-01      | reuse    | Terminal-first по умолчанию; классификатор экрана; двухшаговое подтверждение доверия.                                                                                                                                                                                                                                                                                                                             |
| §A-ACTIVATION-01    | reuse    | Пробел готовности не активирует `mo-setup`; активация только по явному графу; запись Issue методологии активацией не является.                                                                                                                                                                                                                                                                                    |
| §A-BACKLOG-01       | reuse    | Проверщик бэклога поставляется скилами и копируется в проект; грамматика вывода `MO-BACKLOG/1` не меняется.                                                                                                                                                                                                                                                                                                       |
| §A-DISTRIBUTION-01  | reuse    | Список владельцев `shared/scripts/*` пополняется четырьмя файлами: `mo-backlog.mjs`, `mo-knowledge-history.mjs`, `mo-review-report.mjs`, `mo-harness-screen.mjs`. Решение перечисляет владельцев дословно, поэтому пополнение — смысловая правка.                                                                                                                                                                 |
| §A-DISTRIBUTION-02  | reuse    | Самодостаточным становится не один помощник моделей, а набор собираемых помощников с одинаковым замыканием.                                                                                                                                                                                                                                                                                                       |
| §A-DISTRIBUTION-03  | reuse    | Замыкание метафайла и лицензий обобщается с одного бандла на несколько: `SHARED_PLAN` перестаёт быть местом сопоставления лицензий, его занимает `BUNDLES`; `shared/licenses/claude-agent-sdk-LICENSE.md` как единственный источник уведомления удаляется, уведомления генерируются из `node_modules` по корню каждого бандла. Именно это решение ломало сборку на неожиданном корне, и это свойство сохраняется. |
| §A-DISTRIBUTION-04  | reuse    | Появляется новый копируемый побайтово конечный компонент без зависимостей — `mo-harness-screen.mjs` — и перечисляются его потребители.                                                                                                                                                                                                                                                                            |
| §A-ORCHESTRATION-01 | reuse    | Решение-хост правки §B-UPTIME-02: оркестрация остаётся слоем скилов и рассуждений, и место запуска управляющего слоя определяется этим слоем, а не наличием наблюдателя. Именно этот id стоит в трейлере T0.5.                                                                                                                                                                                                    |
| §A-MODELS-01        | reuse    | Рекомендация модели учитывает, что обязательная эвал-координата отдельного скила может быть повышена по U10, и повышение читается из политики, а не угадывается.                                                                                                                                                                                                                                                  |

§A-DISTRIBUTION-06 уже разрешает поле `metadata` во frontmatter, поэтому
добавление `metadata.repository` его не меняет и трейлера не требует; тест
упаковки только расширяется случаем.

Перед каждым коммитом задача запускает стадию истории на своём изменении. Если
стадия сообщает `semantic reuse` для решения, которое эта таблица считала
незатронутым, коммит не «поправляется обратно»: добавляется трейлер и запись
`knowledge_id_change`, а таблица в спеке дополняется. Обход проверки запрещён.

Свободность новых id проверена на текущем дереве: в `docs/business.md`
максимальные — `§B-REVIEW-05` и `§B-SELFHOST-02`, поэтому `§B-REVIEW-06` и
`§B-SELFHOST-03` свободны. В `shared/references/issue-routing.md` максимальный
класс — `ISS-15`, поэтому `ISS-16` свободен.

## 4. Архитектура и компоненты

### 4.1. K1 — сборка нескольких бандлов

Владелец — §A-DISTRIBUTION-03. `tools/build-skills.mjs`: `BUNDLE_LICENSE_PLAN`
заменяется на `BUNDLES`, и сопоставление лицензий уходит из `SHARED_PLAN` в
`BUNDLES`, чтобы у каждого бандла был один явный набор корней и одно замыкание.

```js
// MARKDOWN_ROOTS измерен пробной сборкой на текущем дереве (esbuild 0.25.12, platform node,
// format esm, target node22): 24 корня, все MIT.
const MARKDOWN_ROOTS = [
  "character-entities",
  "decode-named-character-reference",
  "mdast-util-from-markdown",
  "mdast-util-to-string",
  "micromark",
  "micromark-core-commonmark",
  "micromark-factory-destination",
  "micromark-factory-label",
  "micromark-factory-space",
  "micromark-factory-title",
  "micromark-factory-whitespace",
  "micromark-util-character",
  "micromark-util-chunked",
  "micromark-util-classify-character",
  "micromark-util-combine-extensions",
  "micromark-util-decode-numeric-character-reference",
  "micromark-util-decode-string",
  "micromark-util-encode",
  "micromark-util-html-tag-name",
  "micromark-util-normalize-identifier",
  "micromark-util-resolve-all",
  "micromark-util-sanitize-uri",
  "micromark-util-subtokenize",
  "unist-util-stringify-position",
];

export const BUNDLES = {
  "scripts/mo-models.mjs": {
    baselineBytes: 996_053,
    roots: ["@anthropic-ai/claude-agent-sdk"],
  },
  "scripts/mo-backlog.mjs": { baselineBytes: 192_604, roots: MARKDOWN_ROOTS },
  "scripts/mo-knowledge-history.mjs": {
    baselineBytes: 301_676,
    roots: [...MARKDOWN_ROOTS, "js-yaml"],
  },
  "scripts/mo-review-report.mjs": {
    baselineBytes: 192_604,
    roots: MARKDOWN_ROOTS,
  },
};
```

Числа `baselineBytes` — измеренные размеры пробных сборок
`tools/backlog-empty.mjs` (192 604 байта, 24 корня) и
`tools/knowledge-history.mjs` (301 676 байт, 25 корней) на текущем дереве.
`T3.2` переизмеряет их после переноса и при расхождении обновляет литералы в том
же коммите; предел `ceil(baselineBytes * 1.25)` считается от записанного
литерала. `mo-review-report.mjs` стартует с базы `mo-backlog.mjs`, потому что
множество корней у них совпадает.

**Воспроизводимость.** Диапазоны `^` делают байты `skills/` невоспроизводимыми,
а `make skills-check` сравнивает их побайтово. Поэтому в том же изменении
`package.json` фиксирует точные версии всех входящих в бандлы зависимостей:
`js-yaml` `4.3.1`, `mdast-util-from-markdown` `2.0.3`, `unist-util-visit`
`5.1.0` — рядом с уже точными `@anthropic-ai/claude-agent-sdk` `0.3.191` и
`esbuild` `0.25.12`. Транзитивные версии фиксирует `package-lock.json`, который
коммитится вместе с ними. Байты лицензий владеет сборка: они генерируются из
`node_modules` при `make skills` и попадают в `skills/**` как обычный вывод
сборки, поэтому дерево скилов остаётся выводимым из `src/skills/` + `shared/` +
зафиксированного замка.

Правила: предел `ceil(baselineBytes * 1.25)` на бандл; множество корней из
metafile точно равно `roots`; неожиданный корень или отсутствующая запись ломают
генерацию — это и есть сохраняемое свойство §A-DISTRIBUTION-03; неразрешённых
импортов, кроме встроенных модулей Node, нет; во всех скилах-потребителях бандл
побайтово одинаков; лицензия каждого корня копируется из
`node_modules/<root>/{LICENSE,…}` в `skills/<skill>/licenses/<slug>-LICENSE.txt`
(`slug` — имя без `@`, `/`→`__`); поле `license` обязано входить в allowlist
`{"MIT"}` либо в поимённый список исключений, где корень назван вместе с точной
строкой своего поля (решение владельца 2026-09-18: корень
`@anthropic-ai/claude-agent-sdk` объявляет `SEE LICENSE IN README.md` — это не
SPDX-идентификатор, и никакой список идентификаторов его не пропустит; условие
«всё, что не MIT» при этом не открывается, а смена формулировки upstream снова
ломает сборку); `shared/licenses/claude-agent-sdk-LICENSE.md` удаляется, и текст
§A-DISTRIBUTION-03 перестаёт называть его единственным сопоставлением.
`mo-smoke` запускает `--help` каждого бандла из одноразового `HOME` в каталоге
без `node_modules`.

`mo-harness-screen.mjs` зависимостей не имеет и копируется побайтово как
конечный компонент §A-DISTRIBUTION-04, наравне с `mo-posture.sh`.

Новые записи `SHARED_PLAN`:

| Скил                                         | Добавить                                                                                                                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mo-orchestrate-orca`                        | `scripts/mo-backlog.mjs`, `scripts/mo-review-report.mjs`, `scripts/mo-harness-screen.mjs`, `references/methodology-feedback.md`, `references/review-brief.md`                                |
| `mo-review-orca`                             | `scripts/mo-backlog.mjs`, `scripts/mo-review-report.mjs`, `scripts/mo-harness-screen.mjs`, `references/methodology-feedback.md`, `references/review-brief.md`, `references/issue-routing.md` |
| `mo-setup`                                   | `scripts/mo-backlog.mjs`, `scripts/mo-knowledge-history.mjs`, `scripts/mo-harness-screen.mjs`, `references/methodology-feedback.md`, `references/issue-routing.md`                           |
| `mo-e2e`                                     | `scripts/mo-harness-screen.mjs`, `references/methodology-feedback.md`                                                                                                                        |
| `mo-watchdog`                                | `references/methodology-feedback.md`                                                                                                                                                         |
| `find-reuse`, `senior-jsts`, `senior-python` | не меняются (D4)                                                                                                                                                                             |

`references/issue-routing.md` поставляется только трём пишущим скилам.
`methodology-feedback.md` существует в двух режимах в одном файле: раздел записи
(для пишущих) и раздел канала без записи (для `mo-e2e` и `mo-watchdog`); какой
раздел применим, определяет роль, названная в SKILL.md скила.

### 4.2. K2 — `shared/scripts/mo-knowledge-history.mjs`

Единственный владелец семантики истории. `tools/knowledge-history.mjs`
удаляется; Makefile meta-o и тесты используют исходник из `shared/`, скилы —
бандл.

```text
Режим explicit:  --repo <root> --cutoff <sha> [--semantic-from <sha>] [--current-record-from <sha>]
                 [--strict-editorial-from <sha>]
Режим pinned:    --repo <root> --pins-from <markdown>
                 читает через mdast+js-yaml ровно ключи program_input_sha, semantic_enforcement_sha,
                 current_record_enforcement_sha, strict_editorial_enforcement_sha (каждый ровно один раз)
Общее:           [--business <path>=docs/business.md] [--architecture <dir>=docs/architecture]
                 [--audit-exemptions] [--timing]

stdout, ровно одна строка:
  MO-KNOWLEDGE-HISTORY/1 status=<ok|violations|unavailable> cutoff=<sha> commits=<n> edges=<n>
    [ms=<n> spawns=<n> blobs=<n>]
stderr, по одному нарушению на строку, тексты не меняются:
  "<parent>..<commit>: silent deletion <id>"
  "<parent>..<commit>: semantic reuse <id>"
  "<commit>: broken reference <id> in <paths>"
  "<parent>..<commit>: authorization history changed <id>"
  "history_unavailable: <detail>"
  с --audit-exemptions дополнительно "exemption_overreach: <error>"
exit: 0 ok | 1 violations или unavailable (fail-closed)
      2 ошибка вызова (оба режима, ни одного режима, дублированный или отсутствующий pin,
        --audit-exemptions без semantic-from)
```

Тексты нарушений и множество проверок сохраняются дословно: перенос — это
рефакторинг владельца файла, а не изменение контракта. Сравнение вывода «до» и
«после» на полной истории выполняется один раз перед удалением старого
проверяющего и постоянным тестом не становится: после удаления второй стороны
сравнения не существует, а держать копию прежней реализации ради теста дороже,
чем закрыть тот же класс регрессии фикстурами. Роль сравнения исполняют фикстуры
на вложенный каталог, нечитаемый объект, границу исключения и бюджет процессов —
именно они поймали режим дерева `040000` и подмену «объект нечитаем» на
«документа нет», которые разовое сравнение пропустило.

Реализация:

- один `git rev-list --topo-order --reverse --parents <cutoff>..HEAD` строит
  граф;
- один долгоживущий `git cat-file --batch-command --buffer` читает объекты;
  ответы разбираются по размерным фреймам; `close()` вызывается в `finally`;
  short frame, неизвестный тип объекта, преждевременный EOF, невалидный UTF-8 и
  ненулевой код потомка дают `unavailable`;
- каждый OID запрашивается не более одного раза, каждый Markdown-blob
  разбирается не более одного раза; определения, цитаты и записи авторизации —
  проекции одного AST;
- границы применения вычисляются по загруженному графу
  (`rev-list --ancestry-path` один раз на границу) вместо трёх
  `merge-base --is-ancestor` на ребро; `merge-base` используется только для
  реальных пар sibling при слияниях;
- отката к рабочему дереву нет.

Блокирующий структурный бюджет (проверяется тестом на фикстуре):

```text
spawns        ≤ const_setup + merge_sibling_pairs
spawns(history_of_n) == spawns(history_of_m)   при равном числе рёбер слияния
markdown_parses ≤ unique_markdown_blobs
```

Время — диагностика, а не порог. Прежняя строка
`object_requests == unique_objects` заменена: счётчик рос ровно на тот
дедуплицированный набор ключей, который потом и попадал в кеш, поэтому равенство
было истинно по построению и прошло бы на любой реализации. Свойство «объект не
читается дважды» проверяется тем, что число процессов не зависит от длины
истории: цикл с `git show` на коммит проходит все прочие бюджеты и падает на
этом.

`--audit-exemptions` выполняет в одном процессе три прохода, которые сейчас
живут в тесте: от cutoff с границами; от `semantic-from` без семантического
исключения; от cutoff без `semantic-from` с выводом `exemption_overreach` для
ошибки на ребре, родитель которого — потомок `semantic-from`.

### 4.3. K3 — `shared/scripts/mo-backlog.mjs`

Обобщение `tools/backlog-empty.mjs` (файл удаляется). **Грамматика
`MO-BACKLOG/1` заморожена побайтово**; обобщается только откуда берутся ожидания
схемы.

Совместимость. Сохраняются дословно:

```text
stdout, exit 0:  MO-BACKLOG-EMPTY version=1 sha=<40hex> worktree=<clean|dirty> path=<asciiJson>
                   entries=0 content_nodes=0
stderr, exit 1:  MO-BACKLOG-NOT-EMPTY version=1 sha=<40hex> worktree=<clean|dirty> path=<asciiJson>
                   entries=<n> content_nodes=<n>
stderr, exit 2:  MO-BACKLOG-UNKNOWN version=1 reason=<код> sha=<40hex|none> worktree=<clean|dirty|unknown>
                   path=<asciiJson|null>
```

- Порядок полей, слово `version=1`, имена `sha=`, `worktree=`, `path=`,
  `entries=`, `content_nodes=` не меняются. Прежняя редакция переименовывала
  `sha=` в `head=` и теряла `version=1`, `entries=`, `content_nodes=` — это была
  несовместимая правка и она отменена.
- Маршрутизация потоков не меняется: `EMPTY` → stdout, остальное → stderr.
- Коды выхода не меняются: `EMPTY`=0, `NOT-EMPTY`=1, `UNKNOWN`=2.
- Закрытое множество `reason` не расширяется: `not_git_repository`,
  `command_unavailable`, `path_undeclared`, `path_ambiguous`,
  `path_outside_repository`, `missing_file`, `not_regular_file`,
  `unreadable_file`, `invalid_utf8`, `schema_invalid`, `git_head_unreadable`,
  `backlog_path_dirty`, `snapshot_changed`, `candidate_mismatch`,
  `remote_head_unreadable`, `internal_error`. Неверный вызов по-прежнему даёт
  `reason=internal_error` и код 2.
- `--candidate <40hex>` продолжает приниматься в прежней форме.

Аргументы (все новые — необязательные и аддитивные):

```text
[--candidate <40hex>] [--repo <root>] [--path <rel>] [--title <text>] [--open-heading <text>]
[--intro <text>]... [--entry-field <text>]... [--expect-head <sha>] [--remote-head <sha>]
```

- Вызов без флагов схемы (`--path`, `--title`, `--open-heading`, `--intro`,
  `--entry-field`) даёт побайтово тот же результат, что сегодня: путь
  `docs/backlog.md`, русские вступительные абзацы и поля записи meta-o. Тест
  сравнивает строку «до» и «после» на реальном репозитории.
- Если задан хотя бы один флаг схемы, обязаны быть заданы `--path`, `--title`,
  `--open-heading` и хотя бы одно `--entry-field`; иначе
  `reason=internal_error`, код 2. Смешивание частичной схемы с умолчаниями
  meta-o запрещено, чтобы чужой проект не проверялся по русской фикстуре.
- `--expect-head` и `--remote-head` сравниваются с наблюдённым HEAD и дают
  существующие `candidate_mismatch` и `remote_head_unreadable`; новых кодов нет.

`make mo-backlog` вызывает исходник из `shared/scripts/` без флагов схемы.

### 4.4. K4 — `shared/scripts/mo-review-report.mjs`

Production-парсер выносится из `tests/lifecycle-contracts.test.mjs`; тест
использует тот же модуль.

```text
validate --file <path> --dispatch <id> --candidate <40hex> --requested <fast|deep|follow_up>
         [--effective <mode>]
  stdout: MO-REVIEW-REPORT/1 status=valid verdict=<PASS|FINDINGS|UNKNOWN> effective=<mode>
            counts=P0=<n>,P1=<n>,P2=<n>,P3=<n> bytes=<n>
      или: MO-REVIEW-REPORT/1 status=malformed reason=<код> line=<n>
  exit:   0 valid | 1 malformed | 2 ошибка вызова или чтения
  reason ∈ header_order | execution_mismatch | candidate_mismatch | mode_mismatch | delegation |
           verdict | counts_mismatch | index_key_order | index_body_mismatch | section_missing |
           section_order | unknown_account | unknown_reason | footer_mismatch | pass_not_empty |
           invalid_utf8 | grounding_missing
  правило индекса: структура — только top-level узлы mdast; индекс — только top-level абзацы строго
           между `Counts:` и единственным top-level `Evidence report`; содержимое кода, цитат и
           списков телом индекса не является; повтор строки `F-001 [P3] …` внутри `Findings` валиден
```

Правило индекса воспроизводит уже действующую раскладку `review-protocol.md`
(строки `Counts:` и `Evidence report`) и лишь делает её машинно проверяемой —
именно этот ложный `malformed` описан в #6.

**Публикация в API, который действительно есть в Node 22 (исправлено).** Прежняя
редакция описывала `openat`/`linkat`/`unlinkat` и дескриптор каталога, живущий
между процессами. Ни того, ни другого в `node:fs` нет: `*at`-вызовы не
экспортируются, а передать дескриптор каталога другому процессу нельзя. Дизайн
переписан на существующие вызовы, а остаточный риск назван вместо того, чтобы
прятаться за несуществующей семантикой.

```text
namespace
  dir = fs.mkdtempSync(join(os.tmpdir(), `mo-review-${randomBytes(6).toString("hex")}-`))
        под umask 077, затем fs.chmodSync(dir, 0o700) — mkdtemp добавляет ещё 6 случайных символов,
        итого ≥18 случайных символов в имени
  pair_id = basename(dir); генерируется здесь и никогда не принимается от вызывающей стороны
  stdout: MO-REVIEW-NS/1 dir=<json-строка> pair_id=<basename>

stage --dir <ns> --slot <A|B> --vendor <^[a-z0-9][a-z0-9-]{0,31}$> <флаги validate>   < байты отчёта
  1. вход читается целиком в буфер. Из файла: fd = openSync(p, O_RDONLY|O_NOFOLLOW) — ELOOP даёт
     reason=symlink; fstatSync(fd).isFile() обязателен; дальше readSync только из этого fd, по имени
     файл повторно не открывается
  2. валидируется ровно этот буфер; считается sha256 буфера
  3. sibling = join(dir, `.stage-${randomBytes(8).toString("hex")}`)
     fd = openSync(sibling, O_CREAT|O_EXCL|O_WRONLY|O_NOFOLLOW, 0o600)
  4. writeSync(fd, buf); fsyncSync(fd); s1 = fstatSync(fd) → dev, ino, size, nlink === 1;
     size обязан равняться длине буфера
  5. linkSync(sibling, join(dir, `${slot}-${vendor}.md`))
     EEXIST → reason=final_exists, финальный путь не изменяется
     EPERM|ENOSYS|EXDEV|EMLINK → reason=link_unsupported
  6. s2 = fstatSync(fd): s2.dev === s1.dev, s2.ino === s1.ino, s2.nlink === 2 — доказательство, что
     опубликована ровно записанная инода. Иначе reason=identity_changed
  7. unlinkSync(sibling); fsync каталога: dfd = openSync(dir, O_RDONLY);
     try { fsyncSync(dfd) } catch { /* сетевые и виртуальные ФС вправе ответить EINVAL */ }
     finally { closeSync(dfd) } — неудача только диагностическая, не меняет исход
  8. closeSync(fd)
  платформы: macOS и Linux. Обе открывают каталог с O_RDONLY и принимают fsync его дескриптора
     (проба на darwin 27.0.0 / Node 26.8.2: `file fsync: ok`, `dir fsync: ok`; на Linux это
     документированный POSIX-путь для долговечности linkSync). Поэтому вызов делается всегда, а не
     «по возможности». На macOS `fsync` не равен `F_FULLFSYNC` и не гарантирует физический сброс —
     это допустимо: корректность публикации доказывает сверка `dev/ino/size/sha256`, а не
     долговечность одноразового пространства, и по той же причине `F_FULLFSYNC` через `fcntl`
     (в Node недоступен) не требуется
  stdout: MO-REVIEW-STAGE/1 slot=<A|B> path=<json-строка> bytes=<n> dev=<n> ino=<n> sha256=<hex>
  отказ:  exit 1, MO-REVIEW-STAGE/1 status=unknown reason=<malformed|final_exists|link_unsupported|
           symlink|permission|identity_changed>

pair --dir <ns> --a-vendor <v> --a-bytes <n> --a-dev <n> --a-ino <n> --a-sha256 <hex>
                --b-vendor <v> --b-bytes <n> --b-dev <n> --b-ino <n> --b-sha256 <hex>
  для каждого слота: fd = openSync(join(dir, `${slot}-${vendor}.md`), O_RDONLY|O_NOFOLLOW);
  fstatSync(fd) сверяется с переданными dev, ino, size; байты читаются из того же fd и хешируются,
  sha256 сверяется
  stdout: Review-Pair: <pair_id> A=<json-путь> A_bytes=<n> B=<json-путь> B_bytes=<n>
  exit 1 при отсутствии слота, несовпадении dev/ino/size/sha256 (reason=identity_changed)
```

Остаточный риск назван прямо: `linkSync` и `openSync` работают по имени, поэтому
теоретическая подмена компонента пути возможна для процесса с тем же uid. Против
неё работают четыре свойства, и все они проверяются тестом: каталог создан этим
запуском под `os.tmpdir()` с режимом `0700` и ≥18 случайными символами в имени;
sibling создаётся с `O_EXCL`; публикация доказывается `fstat` дескриптора, а не
повторным открытием по имени; `pair` сверяет `dev/ino/size/sha256`, поэтому
подмена финального файла между `stage` и `pair` обнаруживается и даёт
`identity_changed`. Более сильная гарантия требовала бы `*at`-вызовов, которых в
Node нет; писать для этого нативный аддон проект не станет — это была бы новая
среда выполнения ради недоказанной угрозы того же uid.

Значения `dev`, `ino`, `sha256` несёт вызывающая сторона из вывода `stage`:
отдельный файл-квитанция не создаётся, потому что у него не было бы внешнего
потребителя. Все пути в выводе — JSON-строки, поэтому пробелы и не-ASCII
разбираются однозначно.

### 4.5. K5 — `shared/scripts/mo-harness-screen.mjs`

```text
--harness <claude|codex|opencode> --expect-path <absolute> [--fixtures-version <id>]   < JSON от `orca terminal read --json`

stdout: MO-HARNESS-SCREEN/1 state=<agent_prompt|trust_ui|shell_prompt|busy|unknown>
        [trust_path=<json-строка>] [selection=<yes|no|unknown>] [path_match=<yes|no>]
        [screen_version=<id>] action=<inject|accept_trust|confirm_trust|refuse|wait>
exit:   0 классифицировано | 2 нечитаемый ввод
```

Правила:

- распознаются только записанные экраны известных версий среды агента; всё
  остальное — `unknown` и `action=refuse`;
- `accept_trust` выдаётся только при одновременном совпадении заголовка диалога
  доверия, точного пути (`path_match=yes`) и выбранного варианта `No`
  (`selection=no`);
- `confirm_trust` — только при `path_match=yes` и `selection=yes`;
- `path_match=no` → `refuse`; `busy` → `wait`;
- условия владения (см. §5.9) проверяет вызывающая сторона, а не скрипт;
- приватная конфигурация среды агента не читается и не изменяется.

### 4.6. Тайминг `mo-qc` (D2)

Сегодня `mo-qc` — цель с предпосылками
`mo-lint contract skills-check mo-eval-cases mo-test mo-smoke`. Она становится
рецептом, последовательно вызывающим те же цели через
`$(MAKE) --no-print-directory`, в том же порядке, с новой стадией
`mo-knowledge-history` между `mo-eval-cases` и `mo-test`; для `mo-qc`
объявляется `.NOTPARALLEL`, потому что авторитетная сводная проверка и раньше
была последовательной. После каждой стадии печатается
`MO-QC-TIMING/1 stage=<name> ms=<n> status=<exit>`; время берётся через
`node -e 'process.stdout.write(String(Date.now()))'` (на macOS нет `date +%N`),
файлов не создаётся, первая упавшая стадия завершает цель со своим кодом.
Отдельный инструмент профилирования не создаётся.

Новая цель:

```text
mo-knowledge-history: node shared/scripts/mo-knowledge-history.mjs --repo . --pins-from docs/architecture/knowledge-identifiers.md --audit-exemptions
```

### 4.7. Контракт алиас → effective в доказательстве v3

Общая тема обеих проверок — `tools/skill-eval-runtime.mjs`. Сегодня
`validateActorIdentity` требует
`sameIdentity(envelope.requested, execution.effective)`, где `sameIdentity`
сравнивает `route`, `model` и `effort` дословно, а `TESTING_PROFILES` в
`shared/scripts/mo-models.mjs` требует точный id модели с явным обоснованием:
плавающий алиас разыменуется в другое поколение. Замороженный U7 требует писать
в настройки алиас каталога (`sonnet`) и доказывать точный effective id живым
запуском. Дословный `sameIdentity` отверг бы такое доказательство, поэтому
контракт расширяется явно, а не обходится.

Расширение v3 (контракт `meta-o.skill-eval-evidence.v3` сохраняет имя,
добавляется одно необязательное поле):

```text
execution.aliasResolution = {
  requested: "<строка ровно из envelope.requested.model>",
  effective: "<строка ровно из execution.effective.model>",
  source:    "<ограниченное нативное доказательство, не транскрипт>"
} | null
```

Правила валидации:

1. `route` и `effort` сравниваются дословно, как сейчас. Расхождение — прежняя
   ошибка `requested/effective identity mismatch`.
2. `requested.model === effective.model` → `aliasResolution` обязан быть `null`;
   поведение прежнее.
3. `requested.model !== effective.model` → `aliasResolution` обязан
   присутствовать, его `requested` и `effective` обязаны дословно совпасть с
   одноимёнными полями, `source` — непустая строка, проходящая
   `rejectSensitiveOrMachineLocal`. Отсутствие поля — прежняя ошибка mismatch,
   то есть по умолчанию контракт остаётся закрытым.
4. Разрешение алиаса допускается **только** при `route === "claude"`: в самом
   `shared/scripts/mo-models.mjs` записано, что каталог `claude-sdk` отвечает
   алиасами (`opus`, `sonnet`, `opus[1m]`), тогда как остальные маршруты отдают
   точные id. Для `codex` и `opencode` `aliasResolution` — ошибка
   `alias_resolution_unsupported_route`.
5. `TESTING_PROFILES` получает второе поле рядом с `id`:

```js
testClaude: {
  route: "claude",
  effort: "low",
  id: /^sonnet$/u,                          // что допустимо записать в ~/.meta-o/models.json
  effectiveId: /^claude-sonnet-5$/u,         // что обязано было фактически выполниться
  requirement: "testClaude must be claude/sonnet/low resolving to claude-sonnet-5",
},
testCodex: {
  route: "codex",
  effort: "low",
  id: /^gpt-5\.6-luna$/u,
  effectiveId: /^gpt-5\.6-luna$/u,
  requirement: "testCodex must be codex/gpt-5.6-luna/low",
},
```

`id` проверяет запись настроек (`--set`, `testingPolicyError`), `effectiveId` —
наблюдённый `execution.effective.model` в доказательстве. Инвариант закрытого
значения не ослабляется: он переносится туда, где он действительно нужен — на
то, что выполнилось. Комментарий над `TESTING_PROFILES` обновляется этим
объяснением. 6. Несовпадение с `effectiveId` даёт типизированную ошибку
`alias_resolution_changed` с обоими значениями, а не общую недоступность, и
блокирует прогон до решения владельца об обновлении литерала. Автомиграция
литерала запрещена. 7. `unavailable` ветка не меняется: `effective === null`,
`aliasResolution === null`, проверяется только `requested`. `legacy_v2` не
трогается вовсе. 8. `tier === "critical"` (OpenCode/Qwen оркестратор) сохраняет
дословное сравнение: маршрут не claude. 9. Прежние значения `opus[1m]/low` и
`gpt-5.6-sol/low` в обязательных ролях становятся явной ошибкой валидации без
автомиграции.

Дополнительно проверяется (тестом), что ни одно правило не требует различия
моделей между ролями: после U1 `testCodex` и `testCodexDesired` называют одну
модель `gpt-5.6-luna` и различаются только уровнем `low`/`max`. Обзор
`shared/scripts/mo-models.mjs` и `tools/skill-eval-runtime.mjs` такого
требования не нашёл; если оно обнаружится в тесте, оно ослабляется до различия
координаты, а не модели.

Правятся: `tools/skill-eval-runtime.mjs`, `tools/skill-eval-prompt.mjs` (шаблон
конверта), `tools/skill-eval-availability.mjs` (явный `aliasResolution: null`),
`shared/scripts/mo-models.mjs`, `tests/mo-models.test.mjs`,
`tests/model-testing-policy.test.mjs`, `tests/skill-evals.test.mjs`.
`docs/architecture/model-recommendation.md` получает `reuse` §A-MODELS-01:
рекомендация читает возможное повышение координаты из политики (U10), а не
выводит его сама.

### 4.8. Общие обязательства четырёх новых модулей

Одинаковы для K2, K3, K4 и K5, иначе `make mo-qc` краснеет по причинам, не
связанным с задачей.

1. **`--help`.** Каждый модуль принимает `--help` как первый разбираемый флаг,
   печатает в stdout грамматику своего вызова (те же строки, что в §4.2–§4.5) и
   завершается кодом 0, не читая stdin, не запуская Git и не обращаясь к сети.
   Это и есть проба `mo-smoke` из одноразового `HOME`.
2. **Комментарий назначения.** Файл открывается блоком, который объясняет, зачем
   модуль существует, и дословно называет своё решение `§A-*` (K2 —
   §A-MEMORY-01, K3 — §A-BACKLOG-01, K4 — §A-REVIEW-04, K5 — §A-DELIVERY-01).
   Этого требует `tests/eslint-symbol-purpose.test.mjs`.
3. **Именованные экспорты.** Публичная поверхность фиксируется здесь, потому что
   на неё ссылаются тесты:
   - K2 сохраняет все шесть имён, которые сегодня экспортирует
     `tools/knowledge-history.mjs` — `git`, `definitions`, `citations`,
     `referenceViolations`, `edgeViolations`, `verifyHistory`, — и добавляет
     `authorizationRecords` и `createHistoryReader`;
   - K3 сохраняет все четыре имени `tools/backlog-empty.mjs` — `asciiJson`,
     `inspectBacklog`, `backlogEntries`, `evaluate` — и добавляет
     `backlogSchemaViolations`;
   - K4 — новый модуль: отдельного файла-предшественника нет, но разбор отчёта
     сегодня живёт внутри `tests/lifecycle-contracts.test.mjs` и выносится
     оттуда (§4.4), поэтому этот тест переходит на импорт K4 в том же коммите:
     `parseReport`, `reportViolations`, `indexEntries`, `stageReport`,
     `pairPaths`;
   - K5 — новый модуль без предшественника: `classifyScreen`, `screenFixtures`.
     Переименований нет: у K2 и K3 меняется только путь импорта. Коммит,
     удаляющий старый файл, в этом же коммите переводит на новый путь всех
     фактических потребителей, и список закрыт —
     `tests/knowledge-history.test.mjs` (K2), `tests/backlog-empty.test.mjs` и
     `tests/backend-transition.test.mjs` (K3),
     `tests/lifecycle-contracts.test.mjs` (K4), `Makefile` (обе цели K2 и K3).
     Других импортов `tools/knowledge-history.mjs` и `tools/backlog-empty.mjs` в
     репозитории нет; появившийся к моменту исполнения новый импорт добавляется
     в тот же коммит.
4. **Разбор Markdown.** Четыре новых модуля разбирают Markdown только через
   `mdast-util-from-markdown`, без регулярных выражений по документу.
   Существующие потребители `markdown-it` — `tests/knowledge-chain.test.mjs`,
   `tests/backend-transition.test.mjs`, `tests/lifecycle-decisions.test.mjs`,
   `tests/lifecycle-contracts.test.mjs` — не переписываются целиком: в
   `tests/lifecycle-contracts.test.mjs` на mdast переходит только вынесенный в
   K4 разбор отчёта, остальные проверки этих файлов остаются на `markdown-it`,
   потому что `markdown-it` тоже настоящая AST-библиотека, контракт проекта
   запрещает только регулярные выражения. Это решение записано в реестре, чтобы
   его не приняли заново как «недоделку».

## 5. Решения по issues

### 5.1. #1 — контроль истории идентификаторов в целевом проекте

Причина: `project-setup.md` проверяет только текущее дерево; исторический
контроль живёт лишь в meta-o.

Решение:

1. `project-setup.md` получает раздел «Knowledge id history», различающий
   `current_tree` и `history`.
2. mo-setup выводит запись отчёта:

   ```text
   Knowledge-IDs/1 current_tree=<ok|violations|unknown> history=<gate_present|gate_missing|gate_failing|unknown> stale=<yes|no|unknown> qc=<json-команда|none> cutoff=<sha|none>
   ```

   **Как проект объявляет стадию (доопределено).** Догадки запрещены, поэтому
   форма объявления фиксируется, и её отсутствие — не догадка, а `unknown`:

   ```text
   В AGENTS.md проекта (или в документе, на который AGENTS.md ссылается как на контракт качества)
   обязателен раздел второго уровня с заголовком, содержащим "Knowledge id history", и внутри него:
     - ровно один fenced-блок с ровно одной строкой команды — это стадия истории;
     - ровно одна строка, называющая авторитетную команду QC проекта;
     - ровно одна YAML-запись с ключом `history_cutoff_sha` — нижняя граница проекта.
   Разбор — только mdast, без регулярных выражений по документу.
   Раздел отсутствует, блоков или строк не ровно столько → history=unknown, cutoff=none, догадок нет.
   ```

3. `gate_present` доказывается поведением **объявленной стадии истории**, а не
   полного QC, и только в одноразовом клоне. Рабочее дерево кандидата не
   трогается ни на чтение-с-записью, ни на запись.
   - Клон: `git clone --no-hardlinks --no-local <path> <tmp>` под одноразовым
     `TMPDIR`; сеть не используется; бюджет — 600 с на всю пробу и 120 с на один
     прогон стадии; превышение → `unknown` с указанием, что бюджет исчерпан, а
     не `gate_missing`.
   - Стадия обязана быть подстрокой объявленной команды QC; иначе `gate_missing`
     (стадия есть, но в авторитетную проверку не входит).
   - Базовый прогон стадии в чистом клоне красный → `gate_failing`; дальше пробы
     не идут.
   - Фикстура 1, молчаливое удаление: в клоне удаляется одно определение
     идентификатора, коммит без трейлера. Стадия обязана завершиться ненулевым
     кодом и напечатать типизированную строку —
     `MO-KNOWLEDGE-HISTORY/1 status=violations` либо документированный проектом
     маркер эквивалентного инструмента. Нулевой код или отсутствие маркера →
     `gate_missing`.
   - Клон сбрасывается (`git reset --hard` + `git clean -xdff` в клоне, не в
     проекте). Фикстура 2, авторизованный reuse: литерал меняется, ставится
     трейлер и запись `knowledge_id_change`. Стадия обязана пройти. Провал →
     `gate_failing`.
   - Места хранения идентификаторов берутся из объявленного контракта проекта;
     контракт их не называет → `unknown` без догадок.
   - Клон удаляется в `finally`; его путь не попадает в отчёт (машинно-локальный
     путь).
4. Принятый ремонт (ветка `feature/meta-o-setup`): бандл копируется в
   `tools/mo-knowledge-history.mjs` проекта вместе с `tools/licenses/` и строкой
   версии `MO-KNOWLEDGE-HISTORY-SOURCE <semver> <sha256>`; в QC проекта
   добавляется стадия с его собственным cutoff; `AGENTS.md` получает раздел
   объявления из пункта 2 и строку про трейлер с глаголами
   `remove|reuse|editorial` и запись `knowledge_id_change`. Границы и SHA meta-o
   не копируются.
5. **Домен версии и хеша (доопределено).** Строка версии однозначна только если
   обе её части имеют один названный источник, поэтому:
   - `<semver>` — значение `version` из `package.json` пакета meta-o, из
     которого взят бандл, дословно;
   - `<sha256>` — шестнадцатеричный SHA-256 **байтов самого файла бандла без
     строки версии**: строка версии — последняя строка файла, и хеш берётся от
     всего, что ей предшествует. Так копия хеширует ровно то же, что и
     поставщик, и повторное проставление строки не меняет результат;
   - строка версии — комментарий
     `// MO-KNOWLEDGE-HISTORY-SOURCE <semver> <sha256>` в самом конце файла,
     ровно один такой комментарий; `tools/licenses/` в хеш не входит. `stale`
     вычисляется так: mo-setup берёт бандл, который поставляет он сам, вычисляет
     его хеш по тому же правилу и сравнивает с хешем из строки копии — совпал →
     `stale=no`; не совпал → `stale=yes` и в отчёт идут оба `<semver>`; строки
     нет, их больше одной или она не разбирается → `stale=unknown`. `<semver>`
     не участвует в решении, он только объясняет расхождение человеку. Внешний
     потребитель — отчёт mo-setup.
6. Выбор cutoff: действующий исторический контракт → доказанный коммит его
   вступления в силу; новый ремонт → первый коммит вводит идентификаторы, ADR и
   проверку, второй подключает QC с полным SHA первого как cutoff; границы
   grandfathering добавляются только по доказанной истории проекта.
7. Эквивалентный зрелый инструмент допустим, если проходит тот же набор фикстур;
   сообщение коммита доказывает, что конфигурации недостаточно.
8. Node 22 как явная зависимость QC целевого проекта. Если она недопустима,
   шаблон не копируется и остаётся отдельный `history` gap.

Файлы: `shared/references/project-setup.md`, `src/skills/mo-setup/SKILL.md`,
`src/skills/mo-setup/references/knowledge-history-contract.md`, K1, K2,
`docs/architecture/knowledge-identifiers.md`, `docs/acceptance.md`,
`docs/e2e.md`.

Приёмка — `tests/setup-knowledge-history.test.mjs` на одноразовых репозиториях,
бандл копируется в каталог без `node_modules`: раздел объявления отсутствует →
`history=unknown`; два fenced-блока → `unknown`; стадия не входит в команду QC →
`gate_missing`; красный базовый прогон → `gate_failing`; валидная история;
молчаливое удаление; semantic reuse без авторизации в том же коммите;
недостижимый cutoff → `unavailable`; потеря идентификатора на любом ребре
слияния; удаление на другой стороне слияния → ok; висячая цитата, исправленная
более поздним коммитом; удаление append-only записи авторизации;
`current_tree=ok` при `history=gate_missing`; устаревшая копия → `stale=yes`;
копия без строки версии → `stale=unknown`; исчерпанный бюджет → `unknown`;
рабочее дерево источника побайтово неизменно после пробы; отсутствие путей и SHA
meta-o в поставляемом файле и в отчёте.

### 5.2. #2 — ускорение `mo-qc`

Решение: K2 и тайминг стадий (§4.6). Три полных прохода уходят из
`tests/knowledge-history.test.mjs` в стадию `mo-knowledge-history`; фикстуры
остаются в тестах.

Базовая линия: наблюдаемое «до» — 194 с на проход, полный тест истории около 10
минут. «До» и «после» измеряются на одном SHA истории, обе цифры и команды
воспроизведения идут в тело коммита оптимизации (промежуточный коммит, не
кандидат). `docs/papercut.md` meta-o получает одну строку о том, как мерить.

Приёмка: текущие фикстуры проходят без изменений; на полной истории вывод до и
после одинаков побайтово, включая порядок строк нарушений; на клоне с
намеренными нарушениями множества сообщений совпадают; структурный бюджет
соблюдён; после успеха и после каждой ветки отказа не остаётся живого процесса
`cat-file`.

### 5.3. #3 и #16 — запуск вне Orca, временная папка

Решение (D1):

| Скил                                         | Вне Orca | Условие                                                                |
| -------------------------------------------- | -------- | ---------------------------------------------------------------------- |
| `find-reuse`, `senior-jsts`, `senior-python` | да       | Orca не нужен                                                          |
| `mo-setup`                                   | да       | часть отчёта про Orca считается отдельно                               |
| `mo-review-orca`                             | да       | исполнители остаются ресурсами Orca                                    |
| `mo-e2e`                                     | да       | controller портируем, E2E-исполнитель остаётся отдельным ресурсом Orca |
| `mo-watchdog`                                | да       | наблюдает только цели Orca                                             |
| `mo-orchestrate-orca`                        | да       | наблюдатель не является условием; см. ниже                             |

Оркестратор вне Orca:

- на старте проверяет, видит ли его наблюдатель; если нет, печатает одну строку
  принятого ограничения («лимит остановит работу до возвращения человека») и
  продолжает;
- доступность `mo-watchdog`, `jq` и `flock` проверяется, только когда
  пользователь явно просит watchdog; тогда её отсутствие — обычный typed gap;
- `current` и `active` как селекторы запрещены; разрешены `id:<repo>::<path>` и
  `path:<path>`;
- Run создаётся без `--from`, ожидание идёт через `check --run <id> --wait`;
  заголовок координатора не ставится.

`orca-mechanics.md` получает раздел «Coordinator outside an Orca terminal» с
признаком: `orca status --json` успешен, но realpath текущего каталога не
совпадает ни с одним `path` из `orca worktree list --json`.

Issue #16: временные спеки, черновики брифов и промежуточные файлы оркестратора
живут в `.orca/` проекта. `mo-setup` уже требует, чтобы `.orca/` и `spec/` были
игнорируемы; при отсутствии ignore оркестратор не создаёт временные файлы в
отслеживаемых путях и возвращает `needs_attention`. Закоммиченный feature bundle
исполнителя остаётся как есть.

Приёмка: живой сценарий B43 из обычного терминала (Run → две задачи →
`worker-start` с явным селектором → `check --run --wait` → `worker_done` →
`worker-release`); детерминированный тест, что `current`/`active` упоминаются
только в разделе «внутри Orca»; тест строки `.orca/` в оркестраторе.

### 5.4. #4 и #17 — трение методологии и запрет самоактивации setup

Бизнес: §B-SELFHOST-03 (новый id, трейлер не требуется), §A-ISSUE-01 reuse,
§A-ACTIVATION-01 reuse.

Новая строка таблицы маршрутизации. Таблица в
`shared/references/issue-routing.md` — это машинно-читаемая схема из шести
колонок на английском (`scenario_id`, `disposition_class`, `inputs`,
`required_action`, `forbidden_action`, `evidence`), и новый класс входит в неё
как обычная строка, а не как отдельный блок в другом формате:

```text
| ISS-16      | methodology_issue | Confirmed friction in a Meta-O skill, reference or script | Search Meta-O repo; comment on match or create sanitized Issue | Any other repository; write without search | Query, match or creation, URL |
```

Ширины колонок выравниваются по действующей таблице, `prettier --check` обязан
проходить без правок. Детали, которым в шести колонках места нет, идут прозой
того же документа рядом с таблицей:

- **Кто пишет:** только `mo-orchestrate-orca`, `mo-review-orca` и `mo-setup` —
  скилы жизненного цикла, которые человек активировал явно и которые уже
  маршрутизируют внешнюю работу.
- **Адресат:** `metadata.repository` установленного скила; без него — ISS-02
  `needs_attention`. Другой адресат, кроме репозитория Meta-O, для этого класса
  запрещён.
- **Поиск:**
  `gh issue list -R <repo> --state all --limit 100 --search "<термины>" --json number,title,state,url`;
  нашёл по теме — комментарий о своём случае, не нашёл — создать.
- **Содержимое:** наблюдение о методологии, точная команда и типизированный код.
  Запрещены код кандидата, диффы, тела находок, секреты (ISS-08) и
  машинно-локальные пути.
- **Границы:** дефект продукта сюда не направляется; чистый дефект Orca идёт в
  `stablyai/orca`, при необходимости с перекрёстной ссылкой по ISS-10.
- **Запись:** `gh issue create --body-file` под `umask 077`; усечённый поиск —
  ISS-14; неизвестный эффект — ISS-09 без повтора; отсутствие `gh` или
  авторизации — ISS-11, текст остаётся в финальном отчёте.

Активация (§A-ACTIVATION-01). Запись Issue — действие внутри уже явно
активированного `mo-*`, а не новая активация: ISS-16 не даёт никакому скилу
права запуститься, не добавляет рёбер в граф активации и не появляется в
описаниях скилов как триггер. Ни `AGENTS.md`, ни `CLAUDE.md` новых обязанностей
не получают: маршрутизация подтверждённой внешней работы в Issues уже записана в
контракте, ISS-16 лишь называет адресат для одного класса.

Кто пишет и когда: пишущий скил (список выше) — сразу после подтверждения
причины, не блокируя жизненный цикл. Исполнитель, ревьюер и E2E-исполнитель не
пишут сами: они передают координатору отдельное обычное сообщение
`Methodology-Friction: <наблюдение>`; грамматика отчёта ревьюера не меняется.
`mo-watchdog` тоже не пишет: наблюдение попадает в его финальный ответ
пользователю. В прогонах эвалов и E2E запись во внешний сервис не выполняется:
наблюдение остаётся строкой `Methodology-Friction` в отчёте.

`find-reuse`, `senior-jsts` и `senior-python` этой фичей не меняются (D4):
`find-reuse` в своём теле обещает, что никогда не пишет файлы репозитория, не
устанавливает инструменты и не логинится, а два `senior-*` — консультативные
скилы без роли в жизненном цикле. Им не поставляется ни `issue-routing.md`, ни
право записи.

Во frontmatter пишущих и передающих скилов (`mo-orchestrate-orca`,
`mo-review-orca`, `mo-setup`, `mo-e2e`, `mo-watchdog`) добавляется
`metadata: { repository: https://github.com/shkarupa-alex/meta-o }`; поле
`metadata` уже разрешено §A-DISTRIBUTION-06. `references/issue-routing.md`
поставляется трём пишущим; `references/methodology-feedback.md` — всем пяти, с
явным разделением раздела записи и раздела канала без записи.

Issue #17: methodology §2 и `mo-orchestrate-orca`, `mo-review-orca`, `mo-e2e`
получают правило — пробел готовности проекта (нет `MO-BACKLOG/1`, нет документа
граблей, нет истории идентификаторов) даёт `needs_attention` с рекомендацией
человеку запустить `mo-setup`; сам `mo-setup` не активируется.

Приёмка: тесты ISS-16; тест, что `issue-routing.md` отсутствует у `find-reuse`,
`senior-jsts` и `senior-python`, а `methodology-feedback.md` — у всех трёх;
тест, что `mo-e2e` и `mo-watchdog` не предписывают `gh issue create`;
`metadata.repository` у пяти скилов и приём `metadata` сборкой; тест, что шаблон
брифа содержит `Methodology-Friction`; тест, что ни один `mo-*` вне явного графа
не предписывает активацию `mo-setup`; eval-случай класса `forbidden` в
`mo-orchestrate-orca`; живой сценарий B49 только на чтение.

### 5.5. #5 — composed start теряет задачу

Terminal-first — маршрут по умолчанию для всех сред агента. Composed start
разрешён только тогда, когда `worker-start --help` или версионное руководство
`orchestration` дословно утверждает, что ввод задачи ждёт готовности агента;
сейчас такой фразы нет.

```text
orca terminal create --worktree id:<repo>::<path> --title <title> --command "<argv среды агента>" --json
  # claude: claude --model <id> --effort <e>     codex: codex -m <id> -c model_reasoning_effort=<e>
  # флаг posture не дублируется: им владеет wrapper
→ дескриптор немедленно записывается в OwnedResourceSet/1 как fallback-binding для no_owned_resource
orca terminal wait --terminal <h> --for tui-idle --timeout-ms 120000 --json
orca terminal read --terminal <h> --json | node scripts/mo-harness-screen.mjs --harness <name> --expect-path <realpath>
  # trust_ui → процедура §5.9; agent_prompt → продолжать; иначе закрыть точный дескриптор, needs_attention
ps -o args= -p <pid из orca terminal show --json>     # argv несёт запрошенные модель и уровень
orca orchestration worker-start --task <id> --worktree id:<repo>::<path> --terminal <h> --json
```

Восстановление после `outcome_unknown/turn_start_unobserved`:
`worker-stop --dispatch <old>` → доказать settled stop или `blocked` по
квитанции и `worker-show` → создать терминал по рецепту выше →
`worker-start --task <id> --retry-of <old> --worktree id:… --terminal <h>`. При
`worker-stop unknown_effect` запрещены и повторный stop, и замена Dispatch:
иначе возможны два исполнителя одной задачи. `--model` и `--effort` вместе с
`--terminal` не передаются.

Приёмка: живые сценарии B44 и B45; тесты на `--retry-of`, на запрет сочетания
флагов, на немедленную запись дескриптора и на запрет замены Dispatch при
неизвестном эффекте.

### 5.6. #6 — валидатор и публикатор отчётов

Решение: K4. В `review-protocol.md` и `mo-review-orca` правило индекса
записывается дословно так же, как в §4.4. Зависимость одна — бандл под Node
≥ 22.

Приёмка (`tests/review-report.test.mjs`): вердикты PASS, FINDINGS, UNKNOWN;
повтор ключа в `Findings` валиден; маркер внутри кода, цитаты или списка
структурой не является; устаревший `Review-Execution`, чужой SHA, неверный
режим; отсутствие `End-Review`; несовпадение counts; невалидный UTF-8; симлинк
как источник → `symlink`; не обычный файл как источник; существующий финальный
путь не перезаписывается (`final_exists`); `linkSync` отвечает `EPERM`/`EXDEV` →
`link_unsupported`; `nlink !== 2` после `linkSync` → `identity_changed`; подмена
файла по финальному пути между `stage` и `pair` → `identity_changed`;
несовпадение `sha256` → `identity_changed`; неполная пара; режимы `0700`/`0600`;
`fsync` файла обязателен, неудача `fsync` каталога исход не меняет; точные
размеры; чтение stdin побайтово; имя namespace несёт ≥18 случайных символов.

Решение владельца 2026-09-18 о доставке отчёта: harness завершает Dispatch
именно отправкой авторитетного ответа, поэтому предусмотренный протоколом запрос
исправленного отчёта «в той же горячей сессии» на Orca недостижим — повтор
возвращает `dispatch_inactive`. Чинится формулировкой, а не новым механизмом:
текст задачи и протокол требуют, чтобы тело авторитетного ответа было отчётом
целиком, а каждое замечание называло конкретные случаи и ситуации, покрытие
которых снимает это замечание, с точностью, достаточной чтобы написать тест не
спрашивая ревьюера второй раз. Пересказ, ссылка «полный текст в терминале» и
обещание дослать — malformed report. Иначе результат работы ревьюера теряется на
доставке, а исправления идут по кругу от догадок.

### 5.7. #7 — чтение reference-файлов Orca skills

`orca-mechanics.md` получает:

```text
orca skills get orchestration --references --json | jq -er '.references[]'
orca skills get orchestration --reference <name> --json | jq -er '.markdown | select(type=="string" and length>0)'
```

Без `--json` вывод — голый Markdown, и `jq` завершается кодом 5. `2>/dev/null`
запрещён: пустой `markdown` или ненулевой код дают `unknown`. Используется тот
же абсолютный бинарник Orca. Точная форма аргумента `--reference` (имя или путь)
фиксируется записанной фикстурой. Обязательные references для `mo-review-orca` и
`mo-orchestrate-orca`: `coordinator-loop`, `placement-and-remote`,
`recovery-and-cleanup`, `worker-contract`.

Приёмка: записанная фикстура `orca-installed` содержит отдельные наблюдения для
списка references и каждой обязательной команды; строковый тест mechanics; проба
готовности в B43.

### 5.8. #8 и #14 — SHA, окружение, бриф, вопросы человеку, передача модели

Бриф `shared/references/review-brief.md` с полями: `Target`, `Intent`, `Scope`,
`Mode`, `Placement`, `Environment`, `Constraints`, `Ownership`, `Acceptance`,
`Report`, `Methodology-Friction`, `Cleanup`. В `Review-Execution` ревьюер
дословно ставит `Dispatch id` из преамбулы Orca. Плейсхолдеров в отправленном
брифе не остаётся.

Посадка SHA в git-проекте:
`worker-start … --worktree new-child --repo id:<repo> --base-branch <ref>`;
перед внедрением задачи вызывающая сторона выполняет
`git -C <wt> rev-parse HEAD`; при несовпадении и только в своём new-child:
`git -C <wt> fetch <remote-url> <ref>` (где `<ref>` — `refs/heads/<branch>`,
`refs/merge-requests/<iid>/head` или `refs/pull/<n>/head`), затем
`git -C <wt> switch --detach <sha>` и повторная проверка HEAD и чистоты.
Движущаяся ссылка никогда не становится идентичностью кандидата: сначала
`git cat-file -e <sha>^{commit}`.

Тестовое окружение: точечные тесты разрешены. Окружение создаётся командой
проекта из документа граблей или `AGENTS.md`, если она пишет только в
игнорируемые пути; иначе окружение размещается вне дерева (например
`UV_PROJECT_ENVIRONMENT=<slot>/venv`). Доказательство —
`git status --porcelain=v1 -z --untracked-files=all --ignored` до и после
совпадает побайтово. Если чистый маршрут установки не документирован, точечный
тест получает `NOT_RUN`; ревьюер не импровизирует. Полный gate по-прежнему не
запускается параллельно.

Человек-заказчик (U6, reuse §A-REVIEW-04): при явной просьбе задать
бизнес-вопросы допускаются одна дословная строка индекса, слот и вендор, путь к
полному отчёту и один продуктовый вопрос с рекомендуемой гипотезой. Тело находки
не цитируется и не пересказывается; находки не ранжируются и не объединяются. В
Issue, комментарии к MR, сообщении исполнителю и в режиме оркестратора это
запрещено.

Issue #14: `route/model/effort` из `mo-models.mjs` раскладывается в
`--agent <route> --model <model> --effort <effort>`; целый литерал вида
`codex/gpt-5.6-luna` в `--model` запрещён. Прежде чем объявить модель
недоступной, обязательны `mo-models.mjs --show` и `--catalog --route <route>`;
ошибка запуска сама по себе недоступности не доказывает. Замена модели или
уровня без решения пользователя запрещена; недоступная обязательная координата
даёт `blocked|not_run`. `mo-models.mjs --show --json` дополнительно отдаёт для
каждой роли поля `agent`, `model`, `effort`.

Приёмка: тест шаблона брифа; тест правила проекции (в обычной сводке строк
индекса нет, вопрос содержит `<slot>:F-` и путь); тест запрета составного
литерала в `--model`; живой сценарий B46.

### 5.9. #9 — диалог доверия Claude

Решение (U4, reuse §A-DELIVERY-01): классификатор K5 плюс ответ агента в
ограниченной области.

Агент подтверждает доверие, только когда выполнены все три условия владения:

1. терминал создан этим запуском и записан в `OwnedResourceSet/1`;
2. `realpath(trust_path)` совпадает с realpath worktree, в котором создан
   терминал;
3. этот worktree — ресурс запуска либо корень проекта, явно названный
   пользователем при вызове `mo-*`.

Процедура:

1. K5 вернул `state=trust_ui action=accept_trust` (выделен «No») →
   `orca terminal send --terminal <h> --text $'\e[B'`;
2. `terminal read` → K5 обязан вернуть `action=confirm_trust` (выделен «Yes»);
   два последовательных чтения обязаны дать одинаковый результат;
3. `orca terminal send --terminal <h> --text $'\r'`;
4. `wait tui-idle` → K5 обязан вернуть `agent_prompt`; только после этого
   доставляются байты задачи.

Любое отклонение — путь не совпал, выбор не подтвердился, экран неизвестной
версии, среда завершилась, эффект неизвестен — ведёт к одному исходу без
повтора: закрывается только точный дескриптор, возвращается `needs_attention` с
рецептом человеку (открыть вкладку `<title>` и выбрать _Yes, I trust this
folder_).

Экранов подтверждения режима обхода разрешений в наблюдениях нет; специального
правила для них не вводится, и любой нераспознанный экран даёт `refuse`.

mo-setup по явному вызову проверяет корень проекта живой пробой и печатает
`Harness-Trust/1 harness=claude path=<json> state=<trusted|accepted|needs_human|unknown> screen_version=<id>`.
Требование `project-setup.md` о подтверждении личных изменений сужается: явно
названный корень проекта и собственные ресурсы запуска подтверждения не требуют,
любой другой путь требует. Строка `unsupported` о Trust UI в `docs/papercut.md`
meta-o заменяется ссылкой на процедуру.

Приёмка: фикстуры классификатора — реальный экран из #9; обычный prompt Claude,
Codex и OpenCode; приглашение оболочки; выделен «No»; выделен «Yes»; путь с
пробелами и `~`; баннер «Update available» при пустом вводе → `agent_prompt`;
похожий, но чужой путь → `refuse`; экран неизвестной версии → `unknown`. Живая
проверка — B44 на свежем new-child.

### 5.10. #10 — git и folder проекты

Бизнес: §B-REVIEW-06, reuse §A-SESSION-01.

Инвентарь и размещение доказываются **до** `run-create` и `task-create`:

- тип регистрации — `orca repo list --json` → `kind`; пустой `repo search-refs`
  — лишь косвенный признак;
- `orca worktree create` на folder-проекте может вернуть `ok:true` с `path`,
  равным главному чекауту, и пустым `head`; размещение принимается по realpath,
  `isMainWorktree`, `head` и `rev-parse HEAD`, а не по коду возврата;
- сменить `kind` без приложения в Orca 1.4.204 не удалось (`repo add`
  идемпотентен, `repo rm` нет); mo-setup сообщает
  `Registration/1 project=<id> kind=<git|folder|unknown> review_placement=<isolated|shared_checkout|unsupported>`
  и даёт владельцу рецепт через приложение.

Лестница размещения (решение владельца 2026-09-18: изолированный worktree Orca —
умолчание, а не одна из равных опций; но режим проекта-папки обязан оставаться
рабочим маршрутом, а не деградировать в отказ):

1. **`isolated`** — существующие чистые изолированные worktree проекта или
   атрибутированный `new-child` git-проекта на точном SHA (§5.8).
2. **`shared_checkout`** — оба ревьюера стартуют в точном существующем workspace
   (`--worktree id:<repo>::<path>`, флаги создания отвергаются).
3. **`REVIEW-START … reason=placement_unsupported`** — только если нет даже
   точного существующего workspace.

**Честное имя режима 2.** Прежняя редакция называла режим `shared_readonly`,
хотя сама же разрешала в нём `git worktree add` и `git fetch`, то есть запись в
общий Git-репозиторий: новые объекты, регистрация связанного worktree в
`.git/worktrees`, возможные ссылки и `FETCH_HEAD`. Имя режима —
`shared_checkout`, и инвариант формулируется точно там, где он действительно
держится.

Инвариант режима 2 — **общий рабочий чекаут не меняется**:

```text
HEAD, индекс, отслеживаемые и неотслеживаемые файлы общего чекаута после пары побайтово те же
```

Запрещено в общем чекауте: `checkout`, `switch`, `stash`, `reset`, `clean`,
`commit`, `rebase`, правки файлов, форматтеры и фиксеры, установка окружения,
пробные файлы.

Авторизованные изменения общего **репозитория** перечисляются явно и снимаются
до конца прогона:

- `git cat-file -e <sha>^{commit}` сначала; `git fetch` выполняется только если
  объекта нет локально, и только в форме
  `git fetch --no-write-fetch-head --no-tags <remote-url> <точный ref или sha>`;
  если сервер не отдаёт объект по SHA, ref фетчится в собственное пространство
  `refs/meta-o/review/<slot>/<sha>` и удаляется в конце (`git update-ref -d`);
- `git worktree add --detach <зарезервированный за слотом путь вне рабочей копии> <sha>`,
  затем в конце ровно `git worktree remove <свой путь>` (при необходимости
  `--force`);
- ничего больше: ни `gc`, ни `repack`, ни `config`, ни удаление чужих ссылок.

**`git worktree prune` запрещён (исправлено).** `prune` — операция уровня
репозитория: она удаляет административные записи всех worktree, чьи пути сейчас
недоступны, включая чужие и временно отмонтированные. Ревьюер владеет только
своей записью, поэтому убирает её адресно. Если `worktree remove` не удался,
запись остаётся, факт попадает в отчёт и в `needs_attention` владельцу с точной
командой; второй ревьюер и человек ничего не теряют.

Способ чтения кандидата выбирает ревьюер (U5), и способ без единой записи
допустим и предпочтителен: `git show <sha>:<path>`, `git diff <base>..<sha>`,
`git grep … <sha>`. Отчёт обязан в `Grounding` перечислить SHA-привязанные
команды, которыми он читал, а при собственном чекауте — его путь и
`rev-parse HEAD`. Вывод, опирающийся на файлы рабочей копии без привязки к SHA,
делает вердикт `UNKNOWN`. Тесты в общем чекауте запрещены; окружение только вне
дерева, иначе результат `NOT_RUN`. Рядом работает второй ревьюер, пути слотов
различны. Ревьюер убирает за собой и сообщает в отчёте, получилось ли.

Вызывающая сторона снимает базовое состояние до и после пары:

```text
git rev-parse HEAD
git status --porcelain=v1 -z --untracked-files=all --ignored
git worktree list --porcelain -z
git for-each-ref --format='%(refname) %(objectname)' refs/meta-o/
```

Изменение, атрибутируемое слоту ревьюера (путь слота, ссылка слота), которое не
снято, — нарушение брифа: пара `UNKNOWN`. Незакрытый связанный worktree
дополнительно даёт `needs_attention` владельцу с точной командой уборки. Пропажа
записи worktree, не принадлежащей слоту, между снимками — сигнал, что кто-то
выполнил `prune`; это записывается в `Grounding` и обязано попасть в отчёт.
Изменение, не относящееся к слотам и не трогающее кандидата (параллельная работа
человека), записывается в `Grounding` как наблюдение и не удаляется. Неудача
собственного чекаута ревьюера после старта даёт `UNKNOWN`, а не
`placement_unsupported`: стопа до старта нет ни в одном случае.

Общий чекаут может быть грязным и не на кандидате; это не препятствие, потому
что режим 2 означает «стартовый каталог — общая копия, кандидат ревьюер читает
сам по SHA», а не «ревью рабочей копии как есть». Состояние дерева на старте
попадает в `Grounding` наблюдением.

Публичная проекция получает `Placement: isolated|shared_checkout`. Новых кодов
`REVIEW-START` нет.

Upstream: после поиска дублей в `stablyai/orca` заводятся Issue про
`worktree create ok:true` с общим путём и про пустой `search-refs` на
git-каталоге (ISS-01), с перекрёстной записью в meta-o (ISS-10).

Приёмка (`tests/orca-placement.test.mjs`): folder без дочерних worktree, но с
workspace → старт в `shared_checkout`; нет workspace → `placement_unsupported`;
`ok:true` с общим путём отвергается; до доказательства размещения не создаются
ни Run, ни Task; изменение в пути слота → `UNKNOWN`; несnятая ссылка
`refs/meta-o/review/<slot>/…` после прогона → `UNKNOWN`; оставшийся связанный
worktree → `needs_attention`; строковый тест, что ни бриф, ни скил не содержат
`worktree prune`; исчезновение чужой записи worktree → наблюдение в `Grounding`;
чужое изменение файлов → наблюдение в `Grounding`; отчёт без SHA-привязанных
команд в `Grounding` → `UNKNOWN`. Живые сценарии: ревью git-проекта и ревью
folder-проекта.

### 5.11. #11 — проверщик бэклога и примеры CI

Решение: K3 поставляется в `mo-setup`, `mo-review-orca` и `mo-orchestrate-orca`.
Принятый ремонт mo-setup копирует бандл в `tools/mo-backlog.mjs` проекта вместе
с вызовом, называющим его путь, заголовок, раздел открытых записей и поля
записи, и дальше он принадлежит проекту, который вызывает его в QC и CI.

Одна фраза добавляется в `review-protocol.md`, `methodology.md`,
`mo-review-orca`, `mo-orchestrate-orca` и `mo-e2e`: «Не пиши собственный
проверщик бэклога. Используй команду проекта `MO-BACKLOG/1`. Если её нет,
выполни только для чтения поставляемый `scripts/mo-backlog.mjs` и сообщи о
пробеле настройки».

Примеры CI (`src/skills/mo-setup/assets/ci/`):

- `github-actions.yml`: `pull_request` и `merge_group`, `actions/checkout` с
  `fetch-depth: 0`, отдельная задача закрытия бэклога, `<qc-command>` как
  плейсхолдер;
- `gitlab-ci.yml`: `rules` для `merge_request_event` и merge trains,
  `GIT_DEPTH: "0"`, отдельная задача закрытия бэклога.

Это предложения владельцу, а не право менять отслеживаемый CI: mo-setup
сравнивает конфигурацию с примером и сообщает
`CI-Coverage/1 history=<full|shallow|unknown> backlog_job=<yes|no|unknown>`.

Приёмка: `tests/backlog-empty.test.mjs` переходит на K3, все текущие случаи
сохраняются без правки ожиданий; новый случай сравнивает строку вывода без
флагов схемы с записанной строкой текущего инструмента побайтово; частичная
схема → `reason=internal_error` и код 2; англоязычные заголовок и поля как
полная схема; абзац-запись во вступлении при заданных `--intro` →
`schema_invalid`; разбор обоих примеров CI через `js-yaml` (триггеры, глубина
истории, отдельная задача); `make mo-backlog` на meta-o даёт прежнюю строку.

### 5.12. #12 — документ команд и граблей в целевом проекте

Причина: требования нет в `project-setup.md`, поэтому mo-setup его не создаёт.

Решение (U2): раздел «Knowledge and entry layer» получает требование короткого
документа команд и граблей (по умолчанию `docs/papercut.md`; эквивалент
принимается по содержанию), связанного из `AGENTS.md`. Правило записи: частая
или типовая команда зависла либо упала и причина найдена → одна короткая строка
(чем делается, что делает, что не сработало); устаревшая строка удаляется;
разовые случаи и трение методологии сюда не пишутся. Шаблон —
`src/skills/mo-setup/references/papercut-template.md` на языке пользователя.
Отчёт mo-setup: `Papercut/1 path=<json|none> linked=<yes|no>`. §B-MEMORY-05 и
`docs/papercut.md` самого meta-o этой фичей не меняются.

Приёмка: тест `setup-contract` на новую фразу и наличие шаблона; живой сценарий
B50 — mo-setup на одноразовом проекте без файла сообщает `Papercut/1 path=none`,
а при принятом ремонте создаёт файл и ссылку в `AGENTS.md`.

### 5.13. #13 — живость кеша сессии

Факт: `orca terminal list --json` отдаёт `lastOutputAt` (мс эпохи) на терминал;
спиннер работающего агента обновляет его, поэтому это время последнего вывода, а
не конца хода.

Решение: `orca-mechanics.md` описывает, что простой считается как
`now − lastOutputAt` и только для терминала, доказанно находящегося в состоянии
`agent_prompt` (после `worker_done` или по классификатору K5). Методология
получает ориентир тёплого кеша: **60 минут для обоих поставщиков** — и Claude, и
Codex, — запас 10 минут, то есть рабочий порог простоя равен 50 минутам. Единое
число выбрано владельцем: два разных TTL заставляли бы оркестратор помнить,
какой поставщик стоит за каждым терминалом, а выигрыш от более короткого порога
для Codex не стоит этой развилки; ошибка в сторону свежей сессии дешевле ошибки
в сторону протухшего кеша. Пока простой меньше `TTL − запас`, оркестратор держит
ревьюеров и исполнителя горячими; иначе предпочитает свежую сессию. Это
рассуждение оркестратора, а не хранилище состояния. Если поле отсутствует в
установленной версии Orca, поведение прежнее, без оптимизации.

Приёмка: строковый тест mechanics и методологии — в тексте ровно одно число TTL
(60 минут) и ровно один порог простоя (50 минут), разных чисел на поставщиков
нет; проба поля в записанной фикстуре `orca-installed`.

### 5.14. #15 — роль оркестратора и алиасы Claude

Алиасы (U7, механика в §4.7): `mo-models.mjs --set` принимает значение из
каталога маршрута; для `testClaude` допустимо `sonnet` без `--force`. Живой
запуск обязан доказать фактический точный id, и доказательство хранит именно его
в `execution.effective.model` вместе с `execution.aliasResolution`. Для
обязательного эвал-профиля effective обязан совпасть с `claude-sonnet-5`;
несовпадение даёт типизированный `alias_resolution_changed` (а не общую
недоступность) и блокирует прогон до решения владельца об обновлении литерала.

Роль оркестратора: сессия, в которой пользователь вызвал `mo-orchestrate-orca`,
и есть оркестратор. Незаданная роль `orchestrator` в `~/.meta-o/models.json` не
блокирует запуск и не является поводом просить пользователя выбрать модель для
текущей сессии; `--force` и подстановка другого поколения модели запрещены.

Приёмка: тест отказа для несуществующего значения; тест, что `sonnet`
принимается без `--force`; тест `alias_resolution_changed`; тест
`alias_resolution_unsupported_route` для codex; тест, что конверт без
`aliasResolution` при расхождении моделей отвергается; тест, что оркестратор не
требует роль `orchestrator` для старта.

## 6. Политика эвалов (U1, U9, D3)

```text
testClaude          = claude / sonnet / low          (effective обязан быть claude-sonnet-5)
testCodex           = codex  / gpt-5.6-luna / low
testCodexDesired    = codex  / gpt-5.6-luna / max
testOpenCodeDesired = opencode/<provider>/qwen3.8-27b/low
```

Обязательные координаты постоянны (U1), и поверх этой базы действует именованный
клапан U10 (решение владельца 2026-09-18: «действует»). Ревью раунда 1 сочло
правило эскалации противоречащим U1; §2.2 показывает, что конфликта нет, и
владелец подтвердил U10 прямо, поэтому прежняя формулировка «клапана эскалации
нет» этим решением заменена. Скил, чьи случаи доказанно нестабильны, повышает
**свою** обязательную Codex-координату до `codex/gpt-5.6-terra/low` записью
причины, даты и наблюдения нестабильности в
`docs/architecture/evaluation-model-policy.md`. Границы клапана — из §2.2:
`mo-orchestrate-orca` повышению не подлежит, Claude-координата остаётся
`sonnet/low`, повышается координата отдельного скила, а не матрицы. Пока
повышение не записано, `repetition=1` сохраняется: перезапуск до зелёного
результата запрещён, а провал на репетиции — сигнал, что текст скила
недостаточно явен для слабой модели, и правится скил, а не профиль.
`mo-orchestrate-orca` обязан проходить на `gpt-5.6-luna/low` и `sonnet/low`
наравне с остальными скилами.

Матрица: 8 скилов × 3 случая × (2 обязательных + 2 желательных) профиля.
Обязательные — `PASS`, желательные материализуются реальным запуском или честным
`not_available`. Доказательство остаётся `meta-o.skill-eval-evidence.v3` с
добавленным `execution.aliasResolution` (§4.7); прежние значения `opus[1m]/low`
и `gpt-5.6-sol/low` в обязательных ролях становятся явной ошибкой валидации без
автомиграции.

Правятся: `docs/business.md` (§B-EVAL-01),
`docs/architecture/evaluation-model-policy.md`,
`shared/references/methodology.md` §6, `docs/e2e.md`,
`shared/scripts/mo-models.mjs`, `tools/skill-eval-runtime.mjs`,
`tools/skill-eval-prompt.mjs`, `tools/skill-eval-availability.mjs`,
`tests/mo-models.test.mjs`, `tests/model-testing-policy.test.mjs`,
`tests/skill-evals.test.mjs`.

## 7. Этапы

| Этап | Содержание                                                                                                                                                                                                                                                    | Зависит от |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| E0   | Ветка `feature/post-062-issues` от актуальной `develop`; спека и дословный ledger; новые id §B-REVIEW-06 и §B-SELFHOST-03 без трейлера, `reuse` для §B-EVAL-01 и §B-UPTIME-02; G0 `make mo-backlog`                                                           | —          |
| E1   | Identity gate: живой bounded запуск `claude --model sonnet --effort low` и `codex -m gpt-5.6-luna` (low) с доказательством effective id; контракт §4.7; затем смена обязательных профилей в коде, документах и тестах                                         | E0         |
| E2   | #2: K2, тайминг стадий, перенос полного прохода в `mo-qc`, замеры «до/после» в теле коммита                                                                                                                                                                   | E0         |
| R1   | **Ревью-чекпойнт 1** (`mo-review-orca`, один ревьюер, `--requested fast`): контракт доказательства v3, обязательные профили, K2 и тайминг. Бриф — §4.7, §4.6, §4.8 и дифф E1–E2, не вся спека                                                                 | E1, E2     |
| E3   | K1: несколько бандлов, генерация лицензий, `reuse` §A-DISTRIBUTION-01/02/03/04, перенос исходников в `shared/scripts`, измерение `baselineBytes`                                                                                                              | R1         |
| E4   | #11, #12, #1: K3 с замороженной грамматикой, шаблоны и примеры CI, `project-setup`, mo-setup, фикстуры                                                                                                                                                        | E3         |
| R2   | **Ревью-чекпойнт 2** (один ревьюер другого поставщика, `fast`): замыкание бандлов и лицензий, K3 с замороженной грамматикой, форма объявления стадии истории, mo-setup. Бриф — §4.1, §4.3, §5.1, §5.11, §5.12 и дифф E3–E4                                    | E4         |
| E5   | #7, #5, #9, #14: mechanics, K5, §A-DELIVERY-01, papercut meta-o                                                                                                                                                                                               | R2         |
| E6   | #6, #8, #10: K4 на API Node 22, бриф, лестница размещения, §A-SESSION-01, §A-REVIEW-04, upstream Issues                                                                                                                                                       | E3, E5     |
| R3   | **Ревью-чекпойнт 3** (поставщик чередуется, `fast`): доверие и доставка байтов, K5 и фикстуры экранов, публикация K4 и лестница размещения. Бриф — §4.4, §5.6, §5.9, §5.10 и дифф E5–E6                                                                       | E6         |
| E7   | #3, #13, #15, #16: таблица возможностей, оркестратор вне Orca, тёплый кеш, роль оркестратора, `.orca/`                                                                                                                                                        | R3         |
| E8   | #4, #17: ISS-16, `methodology-feedback.md`, `metadata.repository`, канал `Methodology-Friction`, запрет самоактивации setup                                                                                                                                   | E3, E6     |
| R4   | **Ревью-чекпойнт 4** (`fast`): оркестратор вне Orca и watchdog по запросу, тёплый кеш, ISS-16 и запрет самоактивации `mo-setup`. Бриф — §5.3, §5.4, §5.13, §5.14 и дифф E7–E8                                                                                 | E8         |
| E9   | Корпус эвалов (3 случая на скил, включая `forbidden` для #17), глоссарий, `docs/acceptance.md`, `docs/e2e.md` (B43–B51), README; `make mo-eval-cases`                                                                                                         | R4         |
| E9.5 | **Генеральная репетиция**: полный прогон E11 на предкандидате — обязательная матрица, критическая координата Qwen и все живые сценарии. Найденные расхождения правятся в скилах и тестах                                                                      | E9         |
| E10  | **Единственная глубокая пара** (`deep`, два поставщика) и ремедиация в режиме `follow_up` до двух `PASS`, привязанных к одному и тому же SHA без коммитов после них; сбор знаний; удаление спеки и ledger; GC `make mo-backlog`. Этот SHA и есть кандидат `S` | E9.5       |
| E11  | **Последний этап** на неизменном `S`                                                                                                                                                                                                                          | E10        |
| E12  | Публикация, только если агенту поручены MR/PR и слияние: G1 непосредственно перед созданием MR/PR (`make mo-backlog` на `S` и равенство удалённого исходного HEAD с `S`), затем G2 непосредственно перед слиянием с привязкой записи к наблюдаемому HEAD      | E11        |

### 7.1. Где стоит ревью и почему именно там

Ревью и эвалы — две самые дорогие проверки фичи, и обе аннулируются любым
коммитом. Поэтому порядок выбран не по вкусу, а по тому, какая проверка дешевле
находит свой класс дефекта и чей результат обиднее потерять.

- **Ревью и эвалы ловят разное.** Ревьюер видит дефект контракта, границы и
  невыполнимое требование, но не видит, что текст скила непонятен слабой модели.
  Эвал видит ровно это и не видит ошибку в форме отчёта. Меняться местами им
  нечем.
- **Дешёвое ревью идёт вперемешку с разработкой, дорогое — один раз.**
  Промежуточные чекпойнты R1–R4 — это **один** ревьюер, `--requested fast` с
  правом самоэскалации до `deep`, с чередованием поставщика между чекпойнтами и
  брифом из диффа двух этапов плюс названных разделов спеки. Пара
  разнопоставщиковых `PASS` требуется ровно один раз — на `S` (решение владельца
  2026-09-18, заменяет требование пары на каждом чекпойнте от того же дня).
  Причина владельца: пара на каждом чекпойнте стоит больше, чем ловит, а
  вендорное слепое пятно всё равно закрывается глубокой парой на кандидате.
- **У чекпойнта есть предел кругов.** Не более трёх кругов «ревью → правка →
  `follow_up`» на один чекпойнт. Находки `P0` и `P1` чинятся всегда и предел не
  снимают: если после третьего круга живёт `P0` или `P1`, этап останавливается и
  решение уходит владельцу. Пережившая предел `P2` или `P3` уходит записью в
  [Бэклог](../backlog.md) с причиной и следующим шагом, закрывается до GC и в
  любом случае попадает под глубокую пару на E10.
- **Репетиция эвалов стоит раньше глубокой пары.** E9.5 — самый дешёвый способ
  узнать, что скил непонятен `luna/low`; его правки всё равно дают коммиты. Если
  поставить глубокую пару до репетиции, эти коммиты её обнулят, и пару придётся
  покупать заново.
- **Глубокая пара покупается ровно один раз.** E10 запускает `deep` у обоих
  поставщиков, ремедиация собирается в пачку (сначала обе находки, потом
  коммиты, потом один `follow_up` на каждого), и цикл повторяется, пока оба
  `PASS` не окажутся привязаны к одному SHA, после которого коммитов нет. Этот
  SHA и есть `S`: **отдельная «финальная пара» на E11 не заказывается**, потому
  что она проверяла бы тот же самый SHA второй раз.
- **Эвалы идут последними** — так потребовал владелец, и это же дешевле: к E11
  вероятность правки уже сбита репетицией, а сбой эвала по внешней причине не
  трогает файлы и не обнуляет пару (`infrastructure_blocked`, пункт 7 ниже).

Правила, которые режут расход и обязаны попасть в текст оркестратора:

1. Ревьюер промежуточного чекпойнта читает дифф этапов и названные разделы
   спеки, а не репозиторий и не спеку целиком; запрос к нему называет и
   коммит-диапазон, и список разделов.
2. Этап, файлы которого не менялись после своего `PASS`, повторно не ревьюится.
3. `deep` — ровно один на кандидата; все повторы после ремедиации идут как
   `follow_up` с ссылкой на отчёт `deep` и проверяют только дифф ремедиации и
   закрытие прежних находок.
4. Находки обоих ревьюеров чинятся одной пачкой; коммит на каждую находку по
   отдельности удваивает число `follow_up`.
5. Если после E10 в дерево попал хоть один коммит, `PASS` перестают быть
   привязаны к `S`, и пара покупается заново — это цена, которую и надо не
   платить.

E11 выполняется без единого коммита:

1. `make mo-qc` на `S` и проверка, что оба `PASS` из E10 привязаны ровно к `S`
   (совпадение полного SHA в `Review-Execution` обоих отчётов). Новая пара
   заказывается только в одном случае: после E10 в дерево попал коммит.
2. Бенч: строки `MO-QC-TIMING/1` и `mo-knowledge-history --timing` против
   базовой линии E2.
3. Желательные координаты материализуются (реальный запуск или `not_available`).
4. Обязательная матрица на `codex/gpt-5.6-luna/low` и
   `claude/sonnet→claude-sonnet-5/low`: 8 скилов × 3 случая, `repetition=1`,
   `--validate-evidence --candidate S`. Координата отдельного скила, повышенная
   по U10, исполняется на записанном в политике `codex/gpt-5.6-terra/low`. 4a.
   Критическая координата оркестрации на OpenCode/Qwen (сценарий B22, страж
   §B-PORTABILITY-08) пересобирается здесь же: правка всех `SKILL.md` меняет
   `skillRevision`, поэтому прежнее доказательство недействительно. Ожидание —
   реальный запуск на `S`; недоступность местной модели даёт честный
   `not_available` с типизированной причиной, и это фиксируется в финальном
   отчёте.
5. Живые сценарии на тех же двух профилях: ревью git-проекта; ревью
   folder-проекта в `shared_checkout`; terminal-first с диалогом доверия и
   восстановлением; отчёт K4 на реальных телах `worker_done`; координатор вне
   Orca; mo-setup на одноразовых git- и folder-проектах; оркестрация фичи на
   luna (#14).
6. Доказательства и цифры живут в текущем запуске и финальном отчёте, не в Git.
7. **Два разных исхода сбоя.** Сбой, причина которого в самом репозитории
   (красная проверка, неявный текст скила, ошибка контракта), требует правки,
   даёт новый `S'` и повторяет E11 целиком, включая QC и свежую пару. Сбой,
   причина которого вне репозитория и не меняет ни одного отслеживаемого файла —
   исчерпанный лимит подписки, недоступный провайдер, упавший Orca,
   отсутствующая локальная модель для желательной координаты, — даёт
   `infrastructure_blocked`: `S` остаётся замороженным, уже собранные
   доказательства на нём остаются действительными, и после снятия внешней
   причины продолжаются только незавершённые координаты и сценарии. Различает их
   правило «потребовалась ли правка отслеживаемого файла»;
   `infrastructure_blocked` не объявляется завершением и не заменяет собой
   `PASS`.

## 8. Декомпозиция на задачи

Правила коммитов (согласованы с §3.1 и контрактом проекта):

- задача может состоять из нескольких коммитов; **каждый коммит связен и
  независимо проверяем**, а не «одна задача — один коммит»;
- **каждая строка таблицы тезисов §3.1 и каждое решение §3.2 — свой отдельный
  коммит** с трейлером `Knowledge-ID-Change: reuse …` и записью
  `knowledge_id_change`; новый id трейлера не требует;
- правка `shared/` или `src/skills/` → `make skills` и затем `make mo-qc` перед
  коммитом;
- коммит, меняющий контракт, и коммит, меняющий его потребителей, разделяются
  только если оба оставляют `make mo-qc` зелёным; иначе это один коммит;
- **порядок слоёв не нарушается ни на одном коммите.** Коммит `reuse`
  архитектурного или бизнес-решения обязан предшествовать реализации, которая на
  это решение опирается, либо входить с ней в один коммит. Обратный порядок
  означает, что реализация какое-то время противоречит действующему верхнему
  слою, а стадия истории видит изменённую семантику без авторизации. Отсюда
  зависимости T2.2 → T2.3, T3.1 → T3.2 и T0.4 → T1.1 в таблице: это не косметика
  порядка, а проверяемое требование иерархии знаний.

| ID    | Задача                                                                                                                  | Файлы                                                                                                                                                                               | Приёмка                                                                                                                                                                                            | Зависит от             |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| T0.1  | Спека, ledger и пакет фичи (без правок знаний)                                                                          | пакет спеки, `docs/backlog.md`                                                                                                                                                      | `make mo-qc` зелёный; G0 `EMPTY`                                                                                                                                                                   | —                      |
| T0.2  | Новый id §B-REVIEW-06                                                                                                   | `docs/business.md`                                                                                                                                                                  | Стадия истории принимает коммит без трейлера; ссылки на месте                                                                                                                                      | T0.1                   |
| T0.3  | Новый id §B-SELFHOST-03                                                                                                 | `docs/business.md`                                                                                                                                                                  | То же                                                                                                                                                                                              | T0.2                   |
| T0.4  | `reuse` §B-EVAL-01 с записью `knowledge_id_change`                                                                      | `docs/business.md`, `docs/architecture/evaluation-model-policy.md`                                                                                                                  | Стадия истории зелёная; отсутствие записи ломает её                                                                                                                                                | T0.3                   |
| T0.5  | `reuse` §B-UPTIME-02 с записью                                                                                          | `docs/business.md`, ADR наблюдателя                                                                                                                                                 | То же                                                                                                                                                                                              | T0.4                   |
| T1.1  | Контракт §4.7 в доказательстве v3                                                                                       | `tools/skill-eval-runtime.mjs`, `tools/skill-eval-prompt.mjs`, `tools/skill-eval-availability.mjs`, `tests/skill-evals.test.mjs`                                                    | mismatch без `aliasResolution` отвергнут; `alias_resolution_unsupported_route`; `legacy_v2` не затронут                                                                                            | T0.5                   |
| T1.2  | Новые обязательные литералы и `effectiveId`                                                                             | `shared/scripts/mo-models.mjs`, `docs/architecture/evaluation-model-policy.md`, methodology §6, `docs/e2e.md`, `tests/mo-models.test.mjs`, `tests/model-testing-policy.test.mjs`    | `sonnet` без `--force`; `alias_resolution_changed`; отказ не-`low`; нет правила различия моделей между ролями                                                                                      | T1.1                   |
| T2.1  | Тайминг стадий и базовая линия                                                                                          | `Makefile`, `docs/papercut.md`                                                                                                                                                      | Строки `MO-QC-TIMING/1`; порядок стадий прежний; `.NOTPARALLEL`; «до» в теле коммита                                                                                                               | T0.1                   |
| T2.2  | `reuse` §A-MEMORY-01: решение называет `tools/knowledge-history.mjs`, поэтому авторизация переезда идёт **до** переезда | `docs/architecture/knowledge-identifiers.md`                                                                                                                                        | Стадия истории зелёная; `make mo-qc` зелёный (путей в докам никто не проверяет, слой не нарушен)                                                                                                   | T2.1                   |
| T2.3  | K2: кеш, batch-чтение, границы по графу, бюджет процессов, `--help`, комментарий назначения                             | `shared/scripts/mo-knowledge-history.mjs`, удаление `tools/knowledge-history.mjs`, `Makefile` (цель, `node --check` нового пути вместо старого), `tests/knowledge-history.test.mjs` | Фикстуры без изменений; бюджет; разовое побайтовое сравнение «до/после» на полной истории и на сломанном клоне перед удалением старого проверяющего; `mo-lint` и `mo-qc` зелёные в этом же коммите | T2.2                   |
| T2.4  | Режимы `--pins-from` и `--audit-exemptions`, стадия в `mo-qc`                                                           | `Makefile`, `tests/knowledge-history.test.mjs`                                                                                                                                      | Код 2 на ошибках вызова; `exemption_overreach`; «после» в теле коммита                                                                                                                             | T2.3                   |
| T3.1  | `reuse` §A-DISTRIBUTION-01, -02, -03, -04 — по одному коммиту на решение, **до** смены сборки                           | `docs/architecture/distribution.md`                                                                                                                                                 | Стадия истории зелёная на каждом коммите                                                                                                                                                           | T2.4                   |
| T3.2  | K1: `BUNDLES`, генерация лицензий, `mo-smoke`, удаление `shared/licenses/…`                                             | `tools/build-skills.mjs`, `Makefile`, `tests/build-skills.test.mjs`                                                                                                                 | Чужой корень или не-MIT ломают сборку; `--help` без `node_modules`; измеренные `baselineBytes` §4.1 совпали                                                                                        | T3.1                   |
| T4.1  | K3 с замороженной грамматикой и перенос `make mo-backlog`                                                               | `shared/scripts/mo-backlog.mjs`, удаление `tools/backlog-empty.mjs`, `tests/backlog-empty.test.mjs`, `tests/backend-transition.test.mjs`, `Makefile`                                | Строка без флагов схемы побайтово прежняя; частичная схема → код 2; старые случаи целы; оба теста-потребителя переведены на новый путь в этом же коммите                                           | T3.2                   |
| T4.2  | Примеры CI, шаблон граблей, контракт истории                                                                            | `src/skills/mo-setup/assets/…`, `src/skills/mo-setup/references/…`                                                                                                                  | Разбор YAML; триггеры; полная история                                                                                                                                                              | T4.1                   |
| T4.3  | `project-setup`: разделы истории и граблей, форма объявления                                                            | `shared/references/project-setup.md`, `tests/setup-contract.test.mjs`                                                                                                               | Фразы §5.12; форма объявления §5.1                                                                                                                                                                 | T4.2                   |
| T4.4  | mo-setup: проба стадии в клоне, записи отчёта, ремонт с меткой версии                                                   | `src/skills/mo-setup/SKILL.md`, `tests/setup-knowledge-history.test.mjs`                                                                                                            | Все фикстуры §5.1, включая бюджет и `stale=unknown`                                                                                                                                                | T4.3                   |
| T5.1  | K5 и фикстуры экранов                                                                                                   | `shared/scripts/mo-harness-screen.mjs`, тест                                                                                                                                        | Все случаи §5.9                                                                                                                                                                                    | T3.2                   |
| T5.2  | Mechanics: #7 и terminal-first с восстановлением #5                                                                     | `shared/references/orca-mechanics.md`, тесты                                                                                                                                        | Строковые тесты; запрет `2>/dev/null`                                                                                                                                                              | T5.1                   |
| T5.3  | Процедура доверия #9 и раскладка модели #14                                                                             | `docs/architecture/trust-safe-delivery.md`, `shared/references/project-setup.md`, `docs/papercut.md`, `src/skills/mo-setup/SKILL.md`, тесты                                         | Правило трёх условий; запрет составного `--model`                                                                                                                                                  | T5.2                   |
| T6.1  | K4: валидатор и правило индекса, вынос разбора из теста контрактов                                                      | `shared/scripts/mo-review-report.mjs`, `shared/references/review-protocol.md`, `tests/review-report.test.mjs`, `tests/lifecycle-contracts.test.mjs`                                 | Случаи валидации §5.6; тест контрактов импортирует K4 и остаётся зелёным                                                                                                                           | T3.2                   |
| T6.2  | K4: публикация на API Node 22 и `pair`                                                                                  | тот же модуль и тест                                                                                                                                                                | `final_exists`, `link_unsupported`, `identity_changed`, `symlink`; ≥18 случайных символов                                                                                                          | T6.1                   |
| T6.3  | Бриф и проекция для человека-заказчика                                                                                  | `shared/references/review-brief.md`, `src/skills/mo-review-orca/SKILL.md`, `docs/architecture/review-authoritative-response.md`, тесты                                              | Тесты шаблона и проекции                                                                                                                                                                           | T6.2                   |
| T6.4  | Лестница размещения `shared_checkout`, снимки, SHA-привязанное чтение, запрет `prune`                                   | `src/skills/mo-review-orca/SKILL.md`, methodology §5, mechanics, `docs/architecture/orca-session-ownership.md`, `tests/orca-placement.test.mjs`                                     | Случаи §5.10                                                                                                                                                                                       | T5.3, T6.3             |
| T7.1  | #3, #16: вне Orca, watchdog по запросу, `.orca/`                                                                        | mechanics, `docs/backend-capabilities.md`, `src/skills/mo-orchestrate-orca/SKILL.md`, тест                                                                                          | Тест селекторов и строки ограничения                                                                                                                                                               | T5.3                   |
| T7.2  | #13, #15: тёплый кеш, роль оркестратора                                                                                 | mechanics, methodology, `src/skills/mo-orchestrate-orca/SKILL.md`, тесты                                                                                                            | Строковые тесты                                                                                                                                                                                    | T7.1                   |
| T8.1  | #4: ISS-16 и `methodology-feedback.md` с двумя режимами                                                                 | `shared/references/issue-routing.md`, `docs/architecture/issue-routing.md`, `shared/references/methodology-feedback.md`, methodology, тесты                                         | Тесты §5.4, включая отсутствие файла у трёх скилов                                                                                                                                                 | T6.3                   |
| T8.2  | `metadata.repository` и распределение ссылок по `SHARED_PLAN`                                                           | пять `SKILL.md`, `tools/build-skills.mjs`, тесты                                                                                                                                    | Пять скилов с метаданными; три без ссылки                                                                                                                                                          | T8.1                   |
| T8.3  | #17 и фраза про проверщик бэклога                                                                                       | methodology, `mo-orchestrate-orca`, `mo-review-orca`, `mo-e2e`, `review-protocol.md`, тесты                                                                                         | Eval-случай `forbidden`; строковый тест                                                                                                                                                            | T4.1, T8.2             |
| T9.1  | Корпус эвалов, глоссарий, acceptance, e2e B43–B51, README                                                               | `src/skills/*/evals/cases.json`, `docs/*`, `README.md`                                                                                                                              | `make mo-eval-cases`, `make mo-qc`                                                                                                                                                                 | T4.4, T6.4, T7.2, T8.3 |
| T9.2  | Контракт проекта: объявление стадии истории по форме §5.1 и ссылка на блокнот граблей                                   | `AGENTS.md`, `CLAUDE.md`                                                                                                                                                            | `make contract` (`cmp AGENTS.md CLAUDE.md`) проходит; `tests/closure-obligations.test.mjs` зелёный; mo-setup на самом meta-o даёт `history=gate_present stale=no`                                  | T4.4, T9.1             |
| T9.5  | Генеральная репетиция и правки по её итогам                                                                             | по результатам                                                                                                                                                                      | Повторный прогон без новых расхождений                                                                                                                                                             | T9.2                   |
| T10.1 | Одна `deep`-пара, ремедиация пачкой, `follow_up` до двух `PASS`, сбор знаний, удаление спеки, GC → `S`                  | по замечаниям                                                                                                                                                                       | Оба `PASS` привязаны к одному SHA без коммитов после них; GC `EMPTY` на `S`; любая правка `AGENTS.md` повторена в `CLAUDE.md` тем же коммитом                                                      | T9.5                   |
| T11.1 | E11 на `S`                                                                                                              | без изменения файлов                                                                                                                                                                | Все обязательные `PASS`; финальная пара `PASS/PASS`; отчёт с цифрами                                                                                                                               | T10.1                  |

## 9. Реестр решений

| Решение                                                                                           | Статус                                            | Обоснование                                                                                                                                                                                                                                                                                                                                                                     | Источник                                      |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Один исходник на проверку в `shared/scripts`, копия в проект при ремонте                          | adopted                                           | Две реализации одной fail-closed семантики расходятся                                                                                                                                                                                                                                                                                                                           | P1 K3/K4, ревью P2                            |
| Асинхронный batch-reader с `close()` и fail-closed фреймами                                       | adopted                                           | Надёжность и отсутствие зависших процессов                                                                                                                                                                                                                                                                                                                                      | P2 §3.3                                       |
| Блокирует структурный бюджет, а не секунды                                                        | adopted                                           | Порог в секундах зависит от машины                                                                                                                                                                                                                                                                                                                                              | P1, P2                                        |
| Отдельный профилировщик QC                                                                        | rejected                                          | Владелец: «просто подебажим и ускорим»                                                                                                                                                                                                                                                                                                                                          | D2                                            |
| Быстрый diff-режим проверки истории                                                               | rejected                                          | Второй, более слабый контракт                                                                                                                                                                                                                                                                                                                                                   | P1 §4                                         |
| Обобщение `MO-BACKLOG/1` меняет имена полей вывода (`sha`→`head`)                                 | rejected (было adopted)                           | Несовместимо с действующим протоколом и его потребителями; грамматика заморожена, флаги схемы аддитивны                                                                                                                                                                                                                                                                         | ревью раунда 1                                |
| Publisher валидирует ровно публикуемый буфер, `pair_id` генерирует сам                            | adopted                                           | Закрывает TOCTOU и path-injection                                                                                                                                                                                                                                                                                                                                               | P2 §3.5, ревью P1                             |
| Перечитывание финального пути по имени как доказательство публикации                              | rejected (было adopted)                           | Проверяло не обязательно ту же иноду; заменено на `fstat` дескриптора и `nlink === 2`                                                                                                                                                                                                                                                                                           | ревью раунда 1                                |
| Публикация через `openat`/`linkat`/`unlinkat` и межпроцессный dirfd                               | rejected (было adopted)                           | В Node 22 таких вызовов нет, а дескриптор каталога нельзя передать другому процессу; заменено на `openSync(O_CREAT\|O_EXCL\|O_NOFOLLOW)` + `linkSync` + `fstatSync`, с названным остаточным риском того же uid                                                                                                                                                                  | ревью раунда 2                                |
| Нативный аддон ради `*at`-семантики                                                               | rejected                                          | Новая среда выполнения и расширение границы доверия ради угрозы того же uid, которую уже ловит сверка `dev/ino/sha256`                                                                                                                                                                                                                                                          | ревью раунда 2                                |
| Проверка стадии истории поведением, а не полного QC; метка версии копии                           | adopted                                           | Полный QC требует сети и долгий; копия устаревает молча                                                                                                                                                                                                                                                                                                                         | pre-mortem, сценарий 4                        |
| Фиксированная форма объявления стадии истории в проекте (раздел, один блок, `history_cutoff_sha`) | adopted                                           | Без формы «объявленная стадия» была догадкой, а спека запрещает догадки                                                                                                                                                                                                                                                                                                         | ревью раунда 2                                |
| Двухшаговое подтверждение доверия через `terminal send`                                           | adopted                                           | Владелец: агент жмёт сам; «видимый UI» недоступен в терминале                                                                                                                                                                                                                                                                                                                   | U4                                            |
| Распознавание только записанных экранов известных версий                                          | adopted                                           | Чужой TUI меняется без предупреждения                                                                                                                                                                                                                                                                                                                                           | pre-mortem, сценарии 2 и 4                    |
| Правило для экрана bypass-permissions                                                             | deferred                                          | Такой экран не наблюдался; нераспознанный экран и так даёт отказ                                                                                                                                                                                                                                                                                                                | владелец                                      |
| Чтение `~/.claude.json` или правка приватной конфигурации                                         | rejected                                          | Недокументированное приватное состояние                                                                                                                                                                                                                                                                                                                                         | P1 §4, P2 §4                                  |
| Имя режима `shared_readonly`                                                                      | rejected (было adopted)                           | Режим разрешает запись в общий репозиторий; имя переименовано в `shared_checkout`, инвариант сужен до рабочего чекаута, изменения репозитория перечислены и снимаются                                                                                                                                                                                                           | ревью раунда 1                                |
| `shared_checkout` с SHA-привязанным чтением и снимками с `--ignored`                              | adopted                                           | Read-only не равно «прочитан кандидат»                                                                                                                                                                                                                                                                                                                                          | U5, pre-mortem, сценарии 1 и 3                |
| `git worktree prune` в общем репозитории                                                          | rejected (было adopted)                           | Операция уровня репозитория: удаляет чужие административные записи, включая временно недоступные пути. Ревьюер убирает только свою запись, неудача идёт в отчёт                                                                                                                                                                                                                 | ревью раунда 2                                |
| Предписанный отдельный чекаут для каждого ревьюера                                                | rejected                                          | Владелец: способ чтения выбирает ревьюер                                                                                                                                                                                                                                                                                                                                        | U5                                            |
| `placement_unsupported` при сбое чекаута                                                          | rejected                                          | Владелец запретил стоп при доступном workspace                                                                                                                                                                                                                                                                                                                                  | U5                                            |
| Оркестратор только внутри Orca                                                                    | rejected                                          | Наблюдатель проверяется только по запросу                                                                                                                                                                                                                                                                                                                                       | D1                                            |
| ISS-16 во всех восьми скилах                                                                      | rejected (было adopted)                           | `find-reuse` в своём теле запрещает себе внешние записи, `senior-*` не участвуют в жизненном цикле; запись остаётся у трёх скилов жизненного цикла, `mo-e2e` и `mo-watchdog` получают канал без записи                                                                                                                                                                          | D4, ревью раунда 2                            |
| ISS-16 не является активацией скила                                                               | adopted                                           | §A-ACTIVATION-01 говорит о запуске скилов, а не о действиях внутри уже запущенного                                                                                                                                                                                                                                                                                              | ревью раунда 2                                |
| Стабильный ключ дедупликации и правила очистки данных                                             | rejected                                          | Владелец: достаточно «поищи, нет — создай, есть — допиши»                                                                                                                                                                                                                                                                                                                       | U3                                            |
| Перечень запрещённого содержимого Issue (код кандидата, диффы, тела находок, пути)                | adopted                                           | Автоматическая публичная запись без явного перечня однажды вынесет наружу кандидата                                                                                                                                                                                                                                                                                             | ревью раунда 2                                |
| Без записи issues в эвалах и E2E                                                                  | adopted                                           | Иначе фикстуры создают настоящие записи                                                                                                                                                                                                                                                                                                                                         | pre-mortem, сценарий 5                        |
| Сужение §B-MEMORY-05 и чистка своего `papercut.md`                                                | rejected                                          | Владелец: только mo-setup                                                                                                                                                                                                                                                                                                                                                       | U2                                            |
| Генеральная репетиция E9.5                                                                        | adopted                                           | Хрупкие живые проверки не должны впервые встречаться с замороженным кандидатом                                                                                                                                                                                                                                                                                                  | pre-mortem, сценарий 1                        |
| `repetition=1` и правка скила вместо перезапусков                                                 | adopted                                           | Перезапуск до зелёного скрывает непонятность текста для слабой модели                                                                                                                                                                                                                                                                                                           | D3, §A-EVAL-01                                |
| Эскалация нестабильного скила до `gpt-5.6-terra/low`                                              | adopted (восстановлено после ошибочного rejected) | Владелец на прямой вопрос: «оркестратор на luna должен работать стабильно, остальные скилы если нестабильные повышаем до terra/low + sonnet/low». Это не отмена U1, а его уточнение: база остаётся luna/low + sonnet/low, поднимается координата отдельного нестабильного скила и только Codex-сторона; `mo-orchestrate-orca` обязан пройти на luna/low без эскалации; см. §2.2 | U10 (владелец), отменяет вывод ревью раунда 1 |
| Сохранение имён экспорта у K2 и K3 при переносе в `shared/scripts`                                | adopted                                           | Переименование при переезде даёт слабой модели два несвязанных повода менять потребителей; меняется только путь импорта                                                                                                                                                                                                                                                         | ревью раунда 3, §4.8                          |
| Переписывание существующих тестов с `markdown-it` на `mdast`                                      | rejected                                          | `markdown-it` — настоящая AST-библиотека; контракт проекта запрещает только регулярные выражения. Правило `mdast` обязательно для четырёх новых модулей                                                                                                                                                                                                                         | контракт проекта, §4.8                        |
| Отдельная задача на побайтовую пару `AGENTS.md` / `CLAUDE.md`                                     | adopted                                           | Контракт проекта меняется дважды (объявление стадии истории, ссылка на блокнот граблей), а `make contract` — это `cmp` двух файлов: расхождение валит весь `mo-qc`                                                                                                                                                                                                              | ревью раунда 3, T9.2                          |
| Трейлер `Knowledge-ID-Change: new`                                                                | rejected (было adopted)                           | Такого глагола нет: принимаются только `remove\|reuse\|editorial`, а новый id трейлера не требует                                                                                                                                                                                                                                                                               | ревью раунда 1, `tools/knowledge-history.mjs` |
| Поле `execution.aliasResolution` в v3 и `effectiveId` в профиле                                   | adopted                                           | Без явного контракта дословный `sameIdentity` отверг бы доказательство, требуемое U7                                                                                                                                                                                                                                                                                            | ревью раунда 1, U7                            |
| Автомиграция литерала при дрейфе алиаса                                                           | rejected                                          | Плавающий алиас однажды разыменуется в другое поколение; решение за владельцем                                                                                                                                                                                                                                                                                                  | pre-mortem, сценарий 3                        |
| Типизированный `alias_resolution_changed`                                                         | adopted                                           | Отличает дрейф от недоступности                                                                                                                                                                                                                                                                                                                                                 | pre-mortem, сценарий 3                        |
| Замыкание лицензий остаётся в `SHARED_PLAN`                                                       | rejected                                          | §A-DISTRIBUTION-03 называет `SHARED_PLAN` местом сопоставления, но одного бандла больше нет; сопоставление переходит в `BUNDLES`, и решение получает `reuse`                                                                                                                                                                                                                    | ревью раунда 2                                |
| Один владелец distribution на всю сборку                                                          | rejected (было adopted)                           | Затронуты §A-DISTRIBUTION-01 (перечень владельцев `shared/scripts`), -02, -03 (замыкание) и -04 (новый копируемый компонент); -06 уже разрешает `metadata`                                                                                                                                                                                                                      | ревью раунда 2                                |
| Правило «одна задача — один коммит»                                                               | rejected (было adopted)                           | Противоречило требованию §3.1 «каждый тезис — отдельный коммит»; правило переформулировано: задача может быть несколькими связными коммитами                                                                                                                                                                                                                                    | ревью раунда 2                                |
| Файл-квитанция для передачи `dev/ino/sha256` в `pair`                                             | rejected                                          | Внешнего потребителя нет; значения несёт вызывающая сторона                                                                                                                                                                                                                                                                                                                     | контракт проекта                              |
| Результаты бенчей в Git                                                                           | rejected                                          | Любой коммит аннулирует проверки кандидата                                                                                                                                                                                                                                                                                                                                      | методология                                   |
| Единый ориентир тёплого кеша 60 минут для обоих поставщиков                                       | adopted                                           | Владелец: «давай оба будут по часу». Два разных TTL заставляли бы оркестратор помнить поставщика за каждым терминалом; ошибка в сторону свежей сессии дешевле ошибки в сторону протухшего кеша                                                                                                                                                                                  | владелец, §5.13                               |
| Пара ревью на промежуточных этапах                                                                | rejected (было adopted)                           | Решение владельца 2026-09-18 (второе того же дня): пара на каждом чекпойнте растягивает фичу дороже, чем ловит; чекпойнт возвращается к одному ревьюеру с чередованием поставщика, а разнопоставщиковая пара `PASS` покупается один раз на `S`                                                                                                                                  | §7.1                                          |
| Предел в три круга ревью на чекпойнт                                                              | adopted                                           | Решение владельца 2026-09-18: без предела чекпойнт не сходится; `P0`/`P1` предел не снимают и идут владельцу, пережившая предел `P2`/`P3` уходит в блокнот и всё равно попадает под глубокую пару на E10                                                                                                                                                                        | §7.1                                          |
| Изолированный worktree — умолчание размещения                                                     | adopted                                           | Решение владельца 2026-09-18: маршрут опробован и работает лучше общего чекаута; folder-проект остаётся поддержанным маршрутом через `shared_checkout`, а не поводом для `placement_unsupported`                                                                                                                                                                                | §5.10                                         |
| Отдельная «свежая финальная пара» внутри E11                                                      | rejected (было adopted)                           | E10 доводит оба `PASS` до SHA, после которого коммитов нет, и этот SHA и есть `S`; вторая пара проверяла бы тот же самый SHA повторно. Новая пара заказывается только если после E10 появился коммит                                                                                                                                                                            | §7.1                                          |
| Глубокая пара до репетиции эвалов                                                                 | rejected                                          | Правки по итогам E9.5 всё равно дают коммиты и обнулили бы пару; репетиция дешевле и ловит другой класс дефекта                                                                                                                                                                                                                                                                 | §7.1, pre-mortem, сценарий 1                  |
| `fsync` дескриптора каталога вызывается всегда, а не «по возможности»                             | adopted                                           | Целевые платформы — macOS и Linux, обе его принимают (проба darwin 27.0.0 / Node 26.8.2). `F_FULLFSYNC` не нужен: корректность доказывает сверка `dev/ino/size/sha256`                                                                                                                                                                                                          | владелец, §4.4                                |
| Поимённое исключение лицензии для корня `@anthropic-ai/claude-agent-sdk`                          | adopted                                           | Решение владельца 2026-09-18: поле корня объявляет `SEE LICENSE IN README.md`, дословный allowlist идентификаторов остановил бы сборку помощника моделей; исключение привязано к точной строке, поэтому смена формулировки upstream по-прежнему ломает генерацию                                                                                                                | §4.1, ревью R1                                |
| Авторитетный ответ обеспечивается текстом задачи, а не постфактум-исправлением                    | adopted                                           | Решение владельца 2026-09-18: Orca завершает Dispatch отправкой ответа, и «исправленный отчёт в той же горячей сессии» недостижим; теряя отчёт на доставке, ремедиация идёт по кругу от догадок                                                                                                                                                                                 | §5.6, наблюдение R1                           |

## 10. Открытые вопросы

1. Точная форма аргумента `--reference` у `orca skills get` (имя файла или путь)
   — фиксируется записанной фикстурой на этапе E5; до этого в тексте
   используется плейсхолдер `<name>`.
2. Отражает ли `lastOutputAt` конец хода в версиях Orca новее 1.4.204 —
   проверяется на E7; при отсутствии доказательства оптимизация тёплого кеша не
   применяется.
3. Точный effective id Claude Sonnet подтверждается живым запуском на E1;
   консервативное допущение — `claude-sonnet-5`. Несовпадение даёт
   `alias_resolution_changed` и требует решения владельца.
4. Значения `baselineBytes` в §4.1 измерены на `d6c46ae` текущими
   зафиксированными версиями зависимостей и перепроверяются на T3.2: расхождение
   с измеренным значением — не повод править число молча, а повод назвать в теле
   коммита изменившуюся версию.
5. Принимает ли Orca `--base-branch <sha>` для `new-child` — проверяется на E6;
   при отказе используется ветка, содержащая SHA, с последующим
   `switch --detach`.
6. Отдаёт ли удалённый сервер объект по точному SHA
   (`uploadpack.allowAnySHA1InWant`) — проверяется на E6; при отказе
   используется временная ссылка `refs/meta-o/review/<slot>/<sha>` с
   обязательным `update-ref -d` в конце.
7. ~~Поддерживает ли целевая платформа `fsync` дескриптора каталога~~ —
   **закрыто**: целевые платформы — macOS и Linux, обе поддерживают открытие
   каталога на чтение и `fsync` его дескриптора; см. §4.4. Остаточная ветка
   `catch` сохраняется, но открытым вопросом больше не является.
