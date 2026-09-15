# Возможности backend

Meta-O поддерживает backend только тогда, когда его публичная native-поверхность
проходит общий контракт и live-сценарии документа [Сквозная проверка](e2e.md).
Обязательное поведение имеет одного автора в
[Backend contract](../shared/references/backend-contract.md), а backend-механика
задаёт точные команды.

Поддержка конкретного запуска здесь не фиксируется. Версии диагностичны и не
прибиты. Backend, потерявший извлечение полного settled response, обработку
вопросов или надёжное различение состояний, становится неподдерживаемым до
устранения наблюдаемого сбоя.

## Обязательные companions

| Backend | Control              | Required companion guides   |
| ------- | -------------------- | --------------------------- |
| Orca    | `orca` or `orca-cli` | `orchestration`, `orca-cli` |

Control и каждый guide проверяются отдельно. Наличие executable не доказывает, что
агент знает семантику backend. Документированный version-matched bundle backend
считается источником companion, если полный guide читается и controlling agent
прочитал его до действий; установка в личный harness-каталог для этого не нужна.

Control health и готовность каждого harness — тоже разные свойства. Orca
readiness должен доказать каждый выбранный harness; общий status control plane
не отменяет сбой запуска provider.
