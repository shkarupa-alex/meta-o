# Один владелец source, самодостаточные generated skills

_Control layer обязан оправдывать своё существование_, а _не записанная
отложенная работа не существует_. Поэтому разошедшаяся копия методологии или
helper, работающий лишь рядом с ambient `node_modules`, — сломанный standalone
skill.

## Противоречие

Два требования тянут в разные стороны:

1. Каждый skill должен устанавливаться и работать самостоятельно. Single-skill
   install копирует один каталог, поэтому внешний reference, runtime package или
   licence после установки отсутствует.
2. У shared contracts и helper source должен быть один владелец. Ручные копии
   расходятся; drift методологии или executable protocol хуже отсутствия, потому
   что каждый consumer доверяет своей копии.

## Владение source и generated output

- `shared/references/` владеет канонической общей prose;
- `shared/scripts/mo-models.mjs` владеет model settings и catalogue source;
- `shared/scripts/mo-posture.sh` владеет provider-resolution probe;
- `shared/scripts/mo-watchdog.sh` владеет inference-independent observer;
- `shared/licenses/` владеет notices для packages внутри generated helper;
- `src/skills/<name>/` содержит только `SKILL.md` этого skill и принадлежащие ему
  references;
- `tools/build-skills.mjs` во время сборки владеет `SHARED_PLAN`, bundling,
  licence mapping и generated-деревом `skills/`.

Большинство shared entries копируется byte-for-byte. `mo-models.mjs` намеренно
устроен иначе: source бандлится в runtime file всех трёх
`mo-orchestrate-<backend>` skills. Все destinations создаёт одна build operation,
и они обязаны быть byte-identical. Generated files не редактируются вручную.

`make mo-qc` регенерирует временное дерево и сравнивает каждый path и byte с
закоммиченным `skills/`. Он также запрещает source files, затеняющие destination
из `SHARED_PLAN`. Built tree коммитится, потому что package managers устанавливают
закоммиченное discovery tree репозитория.

## Самодостаточный model helper

Claude catalogue discovery использует поверхность Agent SDK
`Query.supportedModels()`, но у установленного skill нет package-install step.
Поэтому generated helper бандлит runtime dependency и не ищет project, global
или иной ambient `node_modules` во время выполнения.

Контракт сборки:

- `esbuild` строго `0.25.12` как build-only development dependency;
- `@anthropic-ai/claude-agent-sdk` строго `0.3.191` как bundled runtime dependency;
- Node.js 22 ESM output с bundling, без externals, minification и source map;
- esbuild сохраняет symlinked package paths, поэтому realpaths checkout,
  worktree, pnpm или cache не меняют emitted source labels и не раскрывают
  developer/disposable absolute paths внутри bundle;
- system Claude находится установленным `PATH` scan; provider executable не
  vendored;
- catalogue discovery следует тому же SDK lifecycle, что `brain-council`:
  запускает transient streaming query с prompt, который ничего не yield,
  вызывает `Query.supportedModels()`, затем закрывает query через `interrupt()` и
  `return()`;
- bounded timeout abort и закрывает query. Provider error, timeout или cleanup
  failure дают unavailable catalogue и никогда не заменяются угаданными или
  историческими model ids;
- platform-specific process sandbox не участвует в model discovery. Helper
  спрашивает documented catalogue SDK и не навязывает provider более сильный
  no-fork contract, чем долгоживущий SDK consumer;
- нет unresolved live package import и runtime-зависимости от `node_modules`;
- generated helper byte-identical во всех трёх orchestration skills, в том числе
  при rebuild с symlinked dependency layout.

Измеренный bundle baseline — 996 075 bytes. Текущий audited ceiling +25% —
1 245 094 bytes. Превышение ломает build и требует нового size/dependency audit;
оно не принимается как обычный generated churn.

Source helper и все три generated backend copies проходят smoke tests.
Disposable clone с symlinked `node_modules` обязан собрать точные committed bytes
без абсолютного path исходного или временного дерева.

Внешние файлы `brain-council`, упомянутые спецификацией, — только design
references. Source, build, tests, generated skills и runtime обязаны работать без
`/Users/alex/bitrix/skills`.

## Замыкание metafile и licences

Bundling принимается только с обозримым набором dependencies. Metafile esbuild
сводится к package roots в `node_modules` и точно сравнивается с явным
build-owned licence plan. Неожиданный package root или отсутствующая в bundle
запись licence plan ломают generation.

Текущий redistributed package root — `@anthropic-ai/claude-agent-sdk`,
сопоставленный с `shared/licenses/claude-agent-sdk-LICENSE.md`. Build копирует
notice в каждый generated skill, получающий bundle. Сам esbuild запускается
только при разработке проекта и не входит в installed runtime helper.

Mapping является явной metadata в `SHARED_PLAN`: новая runtime dependency должна
в том же change обновить distribution и licence ownership до появления generated
tree.

## Provider posture остаётся copied leaf

`mo-posture.sh` byte-for-byte копируется в три orchestration skills и `mo-setup`.
Это bounded read-only diagnostic leaf: он не запускает provider, не хранит run
state и ничего не знает о backend sessions. Дублирование делает каждый skill
standalone без runtime shared package или backend adapter.

`mo-watchdog.sh` копируется только в `mo-watchdog`. Это отдельно обоснованный
runtime leaf: наблюдение должно продолжаться, когда cloud-model limits или
overload мешают самому orchestrator двигаться дальше.

## Почему installable tree называется `skills/`

Authored tree не может занимать discovery path. С apm 0.27.0:

- `apm install ./dist` отклонялся, потому что точный каталог не содержал accepted
  manifest;
- `apm install <repo>` находил `<root>/skills/<name>/SKILL.md` и устанавливал
  authored tree без generated shared files.

Поэтому installable tree владеет `skills/`, а authored sources находятся в
`src/skills/`, куда discovery не доходит. Local и remote installation разрешают
один layout; install tests проверяют whole bundle и single-skill shape.

## Frontmatter

Здесь переносимы только `name`, `description`, `license`, `compatibility`,
`metadata` и `allowed-tools`. Build также требует совпадения `name` с каталогом.
Packaging portability — deterministic gate, а не привычка maintainer.

## Отклонено

- **Runtime shared package.** Ломает standalone skill installation.
- **Ambient SDK resolution.** Делает catalogue behavior зависимым от feature
  repository или global machine state.
- **Vendored provider executables или unresolved runtime imports.** Расширяют
  shipped trust и compatibility boundary.
- **Unmapped bundle dependencies.** Redistribution без явного notice owner нельзя
  аудировать.
- **Ручные generated copies или installer scripts.** Эти обязанности уже
  принадлежат package managers и mechanical generation.
