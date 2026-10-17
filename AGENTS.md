# RepositoryZero agent entry point

Read [docs/README.md](docs/README.md), [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md), [docs/DECISIONS.md](docs/DECISIONS.md), then the relevant [ROADMAP.md](ROADMAP.md) tasks. Read [platform/AGENTS.md](platform/AGENTS.md) before changing platform code; its public-data, provider, runtime and UI rules apply there.

- Work in a real Git checkout of this repository. A source export has no Git history: preserve its local artifacts and connections, and use a separate checkout for Git work. Never overwrite another working copy to synchronize it.
- One Rakazo-based product, existing Graphile/PostgreSQL worker and shared UI. Add thin reuse functions in existing paths; no parallel scheduler, universal integration framework or replacement CLI product.
- Library is an independent human entry point. Browsing/saving does not require an AI task or install source. Source availability, popularity, preparation, actual use and verified benefit are different facts.
- ROADMAP is the checkbox authority. MVP-ROADMAP is a generated subset: edit ROADMAP and run `npm run docs:sync`. Do not close runtime gates because a design, schema, mockup or offline test exists.
- Quarantined files are historical snapshots, not working instructions. Consult them only for provenance or an explicit history question. Planned specs retain requirements; current decisions/status override dated implementation claims. Inherited platform docs describe upstream, not Zero acceptance.
- Preserve failed experiments, frozen benchmark prompts/graders, source pins, lockfiles, LICENSE, NOTICE and upstream attribution. Never mix changes inside a frozen cohort.
- Tests are offline by default. Live model/API use needs a previously authorized profile and finite API cap. Subscription permission is not permission for unrelated paid APIs. Never reset a cumulative budget ledger between attempts.
- Before documentation handoff run `npm run check:docs`; build the site if its source mapping/copy changes. Do not run focus-stealing Electron E2E as routine checks.
- Keep credentials, local paths, account details and private experiment artifacts out of tracked content. Inspect status and staged diff. Never force-push or reset another contributor's work.
