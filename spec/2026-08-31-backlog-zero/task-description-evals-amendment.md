# Focused amendment: evals для всех skills Meta-O

Это дополнение к `/Users/alex/.brain/council/users--alex--develop--meta-o/2026-08-31-backlog-zero/synthesis.md`. Не пересматривать уже замороженные решения: Orca-only, независимый `find-reuse`, существующие `senior-python`/`senior-jsts`, цель lossless backlog closure.

## Новый пользовательский ввод

Пользователь хочет evals для всех skills, а не только review architecture. Разработка будет выполняться на отдельной машине с RTX 4090. Там уже развёрнута Qwen 3.8 27B в квантизации UD-Q4-KM, около 115 tokens/s, и подключена к OpenCode. Пользователь считает inference практически бесплатным. Опционально через OpenCode можно подключить DeepSeek 4 Flash. Пользователь просит оценить полезность этой идеи и спроектировать правильное место в программе.

Текущие authored skills после Orca-only изменения плюс пользовательские новые skills:

- `mo-e2e`
- `mo-orchestrate-orca`
- `mo-review-orca`
- `mo-setup`
- `mo-watchdog`
- будущий `find-reuse` (сейчас `mo-reuse`)
- `senior-python`
- `senior-jsts`

## Вопросы судьям

Дайте компактное дополнение к synthesis:

1. Полезны ли agent evals на этой локальной SLM и что именно они способны/не способны доказать?
2. Какую общую eval architecture сделать для всех skills, не создавая workflow engine/general state store и не включая volatile network evals в `make mo-qc`?
3. Какие eval dimensions общие: positive trigger, negative trigger/overtrigger, instruction adherence, output contract, task success, safety/authority, degraded paths, latency/tokens/resources, nondeterminism?
4. Какие skill-specific suites нужны каждому из восьми skills? Укажите representative cases и executable/deterministic oracles там, где возможно.
5. Как разделить model-under-test, harness-under-test и judge, чтобы Qwen не судил сам себя? Где достаточно deterministic checks, где нужен stronger vendor-diverse judge или human adjudication?
6. Как зафиксировать exact OpenCode/provider/model/quantization/context/tool permissions/config и повторяемость, но не создать запрещённую version matrix?
7. Как использовать Qwen как дешёвый high-volume baseline и DeepSeek как optional comparator; что должно блокировать release, а что остаётся advisory research?
8. Как переносить eval corpus и runner на GPU development machine, не коммитя secrets, machine paths, огромные transcripts или model artifacts?
9. Нужно ли добавить отдельную спецификацию `skill-evals`, либо встроить eval в каждую spec? Предложите owner, artifacts, tests/E2E, acceptance и critical-path placement.

Отделяйте принятое требование, вывод и гипотезу. Не считайте заявленную скорость доказательством качества модели. Не требуйте DeepSeek, пока он лишь теоретически доступен. Ответ по-русски.
