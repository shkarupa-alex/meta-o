# Синтез дополнения: same-project reviewer resources

Наблюдаемый incident возник не из требования независимого review, а из ошибочного provisioning fallback: folder-project не поддержал `new-child`, после чего ручные Git worktrees были зарегистрированы через `orca repo add` и стали отдельными Orca projects.

Спецификация разделяет независимость reviewer session и topology Orca UI. Два reviewer получают отдельные sessions, Dispatch и terminal handles, но обязаны оставаться resources исходного project. Для Git project используется доказанный Orca-owned `new-child`; для folder project допустим доказанный same-project current route на frozen candidate. Если такого route нет, результат — typed `REVIEW-RESOURCE-UNSUPPORTED`, а не импровизированный registry mutation.

`git worktree add` + `orca repo add` как review fallback запрещены. `mo-setup` проверяет registration kind/capability и может предложить перевод основного workspace в Git-capable registration, но external project mutation требует подтверждения. Acceptance сравнивает project inventory до/после и проверяет два positive/negative cases: Git-project child resources и folder-project same-project/unsupported outcome.

Одна разрешённая финальная итерация review выполняется прежней парой Claude `opus[1m]/high` и Codex `gpt-5.6-sol/medium`.

## Результат финальной итерации

Оба судьи дали 6/10 и `would_adopt=false`; формального convergence нет. Дополнительный review-run не запускается. Их согласованные findings устранены bounded редакцией:

- shared current worktree hot executor’а исключён: reviewer получает existing isolated same-project worktree или доказанный Git `new-child`, иначе start блокируется;
- введён отдельный pre-pair protocol `REVIEW-START/1`; при failure не создаются pair id, reports, census, namespace или handoff;
- project registrations и временные run resources разделены на `ProjectRegistrationSet/1` и `OwnedResourceSet/1` с точным allowed delta;
- named Orca read-only commands/fields включены в recorded-surface contract;
- invariant об отсутствии registry mutations распространён на все Meta-O actors, а reviewer incident проверяется B41 вместе с non-review B42;
- partial-start cleanup сохраняет foreign resources, повторно сверяет inventory и отдаёт человеку evidence при incomplete cleanup;
- существующие stray registrations из incident только аудируются: недоказанная deregistration capability не выдумывается.
