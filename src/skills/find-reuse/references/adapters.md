# Source adapter contract

Every operation below is run only after its executable/version and exact
subcommand or endpoint capability have been probed. Arguments are passed
separately; placeholders are never shell-expanded. Production base URLs are
fixed. Tests may replace one only through a named `test_base_url_env`.

Each observed adapter records its id, ecosystems, capabilities, required tools,
version and capability probes, OS-specific install help, base URL, auth policy,
operations, unavailable fields and `last_verified` date. An operation records
transport (`argv`, `http_get` or `http_post`), expected output, success status and
typed errors: `tool_missing`, `auth_missing`, `rate_limited`,
`source_unavailable`, `malformed` or `adapter_unsupported`.

Changing `last_verified` requires the separate network-enabled
`make mo-live-adapters` evidence command. Offline QC never pretends to verify a
live service.

## Required discovery and enrichment

| Surface | Probe and discovery | Required enrichment |
| --- | --- | --- |
| Local Git | `git --version`; `rg --version`; `rg -n -i <query> .`; `git log -S <query> --oneline --all` | manifests, lockfiles, license, history, existing dependencies |
| GitHub | `gh --version`; `gh auth status`; `gh search repos <query> --limit 30 --json fullName,description,stargazersCount,pushedAt,license,url,isArchived`; `gh search code <query> --limit 30 --json repository,path,url` | `gh repo view`, releases, contributors, issues and advisories/API |
| GitLab | `glab --version`; `glab auth status`; `glab repo search <query>`; scoped code search through `glab api` | repository, release and issue metadata through `glab api` |
| npm | `node --version`; `npm --version`; `npm search <query> --json --searchlimit=30`; `npm view <package> --json` | `GET https://api.npmjs.org/downloads/point/last-month/<encoded-package>` plus repository and versions |
| PyPI | `python --version`; `python -m pip --version`; source-host Python search; `python -m pip index versions <package>` only for an exact name | `GET https://pypi.org/pypi/<encoded-package>/json`; `pypistats recent <package> --json` when installed |
| crates.io | `cargo --version`; `cargo search <query> --limit 30`; `cargo info <package>` | `GET https://crates.io/api/v1/crates?q=<encoded-query>&per_page=30`; `GET https://crates.io/api/v1/crates/<crate>` |
| Go modules | `go version`; source-host Go search; `go list -m -versions <module>` only in a temporary module when needed | `GET https://proxy.golang.org/<escaped-module>/@v/list` and pkg.go.dev metadata |
| Maven Central | HTTP client probe; URL-encoded query | `GET https://search.maven.org/solrsearch/select?q=<encoded-query>&rows=30&wt=json` plus POM/SCM metadata |
| NuGet | `dotnet --info`; `dotnet package search <query> --format json` | discover `SearchQueryService` through `GET https://api.nuget.org/v3/index.json`, then exact metadata |
| RubyGems | `ruby --version`; `gem --version`; `gem search <query> --remote --all`; `gem info <package> --remote` | `GET https://rubygems.org/api/v1/search.json?query=<encoded-query>` and `/api/v1/gems/<gem>.json` |
| Packagist | `php --version`; `composer --version`; `composer search <query> --format=json`; `composer show <package> --all` | `GET https://packagist.org/search.json?q=<encoded-query>` and `/packages/<vendor>/<package>.json` |

PyPI and Go semantic discovery uses the applicable source host; neither registry
claims a supported generic full-text CLI. Presence in one source does not finish
discovery.

Security enrichment uses
`osv-scanner --format json --lockfile <detected-lockfile>` or a source-host
advisory operation. OSV query is `POST /v1/query`, never mislabeled as GET. If no
applicable operation exists, report the field as unavailable.

Public registry discovery does not require publishing credentials. Private
sources use their documented auth probe and login help; the skill displays the
command but never logs in or asks for a secret. Optional sources such as
Codeberg/Gitea, Bitbucket, Swift Package Index, Hex, pub.dev, Conan/vcpkg and
private registries require the same descriptor and executable tests before use.
