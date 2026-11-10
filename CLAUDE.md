# CLAUDE.md

## Branches

- Name every new branch `feat/<short-kebab-case-name>`, e.g. `feat/trips-list-modals`. No other prefixes (`feature/`, `fix/`, none).
- Create new branches from `staging`.
- Delete a `feat/` branch once its PR is merged into `staging` (locally with `git branch -D`, since squash merges make `-d` refuse); start further work on a new branch.
