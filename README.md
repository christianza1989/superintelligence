# RepositoryZero

Development source: [christianza1989/superintelligence, branch `main`](https://github.com/christianza1989/superintelligence/tree/main).

```bash
git clone --branch main https://github.com/christianza1989/superintelligence.git
cd superintelligence
```

Continue with the [local Claude calibration instructions](docs/LOCAL-LAB.md), [MVP setup and implementation status](docs/IMPLEMENTATION.md), or the [whole-project architecture and readiness analysis](docs/PROJECT-ANALYSIS-2026-10-17.md).

A proposed open agent workspace that starts with software people have already built and tested, selects a suitable foundation and components, and builds and verifies what is missing.

**One open core. A world of AI tools.** The goal is a shared execution and verification layer for an expanding ecosystem of models and tools.

**Status: first MVP foundation in development. The source directory, shared black/lime UI and local official-site preview are implemented. Full agent execution and live integrations are not accepted yet.** The name expresses a long-term ambition; this project does not claim to have achieved artificial superintelligence.

The UI direction is a real Rakazo workspace adaptation with OpenCode UX patterns, one runtime, a black/lime default theme and an extensible theme system. A pinned Rakazo source adaptation is now the implementation foundation; backend durability and resource acceptance gates remain open. The project will use one execution authority.

The first product will finish a small set of useful tasks, preserve progress after failures, show editable artifacts, and demonstrate an opt-in contribution cycle. Its initial capability modules are browser automation, document analysis, and code with tests. **REA is a required planned reverse-engineering module.**

The broader plan includes a localhost product, later Windows/macOS/Linux packages, automatic signed updates, upstream module maintenance, and a narrow unattended PR/release process. Model providers use their supported authentication methods; **treg.to is a required planned tool gateway integration**. These are requirements awaiting implementation and tests.

The selected MVP direction includes **Jev source/tool selection through the owner's OpenRouter account**, **the official Claude CLI subscription, with matched Haiku 5.5/high for the current StockDesk experiments**, and a UI localization structure for **English, Russian, Spanish, Simplified Chinese, Lithuanian, German, French, and Brazilian Portuguese**. Core technical guides start in English/Russian; other locales have a scoped quickstart. Local Laya remains a later option. Public bulk submission screening starts with a zero paid-model budget; it does not inherit the MVP routing budget.

An official website is planned from the start, with automatically maintained roadmap, changelog, research and release facts, contribution pages, and a donation section using an owner-approved payment provider. Its public status will reflect actual evidence. No site or payment account has been deployed yet.

Claude CLI calibration now includes repeated SprintDesk configurations and two exploratory StockDesk v1 cohorts. The first StockDesk A/C pair passed both generated applications; the later B/C pair includes a preserved filter failure under an ambiguous v1 requirement. StockDesk v2 prompt and grader controls are ready for a new epoch. These CLI experiments do not qualify the full RepositoryZero runtime or Auto. [SprintDesk results](docs/CLAUDE-CALIBRATION.md), [StockDesk results](docs/STOCKDESK-CALIBRATION.md), [architecture and integration gaps](docs/PROJECT-ANALYSIS-2026-10-17.md).

Research currently covers **806 checked GitHub addresses and 757 unique accessible repositories**, including a 197-entry media candidate register. Discovery has no candidate-count ceiling. The original 100-project comparison remains a historical sample; expanded candidates await rigorous selection.

- [Run the first implemented slice and see verified checks / blockers](docs/IMPLEMENTATION.md)
- [Why RepoZero: practical value, costs, prospects, and how to test the idea](docs/WHY-REPOZERO.md)
- [Implemented finite budget reservations and their current limits](docs/BUDGET-FOUNDATION.md)
- [RepositoryZero using its own reuse workflow, with a runnable local demonstration](docs/SELF-REUSE.md)
- [Community usage evidence, quality profiles and upstream contributions](docs/COMMUNITY-QUALITY.md)
- [Official RepositoryZero agent identity and pull request attribution](docs/AGENT-IDENTITY.md)
- [Web/desktop model connections, BYOK and planned hosted credits](docs/HOSTED-AND-BYOK.md)
- [Same-prompt baseline versus Zero catalog-context protocol](docs/PAIRED-BENCHMARK.md)
- [First Claude subscription calibration pair: results, provenance and limitations](docs/CLAUDE-CALIBRATION.md)
- [Zero Lab: paired CLI experiments, isolated API/SQLite/UI checks and recorded-result comparison](docs/ZERO-LAB.md) · [Calibration protocol](docs/CALIBRATION.md)
- [Run the first CLI experiment locally on Windows through WSL2](docs/LOCAL-LAB.md)
- [Cloud workspaces and planned Google Drive storage](docs/CLOUD-WORKSPACES.md)
- [Project provenance and evidence preparation](docs/ORIGIN-AND-ATTRIBUTION.md)
- [Start here: project V1 documentation, purpose, problems, and user value](docs/PROJECT-V1.md)
- [Focused MVP roadmap](MVP-ROADMAP.md)
- [Project architecture plan, in Lithuanian](PLAN.md)
- [Checkbox roadmap and release gates](ROADMAP.md)
- [Research method and successive discovery cycles](docs/research/README.md)
- [Open candidate pool](docs/research/CANDIDATE-POOL.md) · [JSON](catalog/candidates.json) · [CSV](catalog/candidates.csv)
- [Speech, image, cinematic video, and avatar candidates](docs/research/MEDIA-CANDIDATES.md)
- [Historical initial 100-project comparison](docs/research/TOP100.md)
- [Autonomy, upstream updates, desktop distribution, and recovery](docs/AUTONOMY-AND-UPDATES.md)
- [Model providers, OAuth, OpenCode, and treg.to](docs/MODELS-AND-TOOLS.md)
- [Early official website, automatic updates, and project donations](docs/PUBLIC-WEBSITE.md)
- [Local usage and opt-in aggregate tool statistics](docs/USAGE-STATISTICS.md)
- [Capability and overlap map](docs/CAPABILITIES.md)
- [Duplicate detection and evidence-based module alternatives](docs/MODULE-SELECTION.md)
- [Maintainer partnerships, integration badges, YouTube, and autonomous growth](docs/GROWTH-AND-OUTREACH.md)
- [Draft maintainer PR, email, and creator outreach templates](docs/OUTREACH-TEMPLATES.md)
- [GitHub sign-in and repository submission portal](docs/CONTRIBUTOR-PORTAL.md)
- [Community Video Hub, relevance review, and voting](docs/VIDEO-HUB.md)
- [High-volume intake filters, queues, and AI spending caps](docs/INTAKE-AND-BUDGETS.md)
- [Tool categories, task search, and workload-specific recommendations](docs/TOOL-DIRECTORY.md)
- [How agents discover capabilities, tools, and skills](docs/AGENT-CAPABILITIES.md)
- [Jev/OpenRouter MVP selection and later local Laya evaluation](docs/ROUTER-EVALUATION.md)
- [Jev for repo selection, documentation filtering and coding triage, with a cost evaluation plan](docs/JEV-APPLICATIONS.md)
- [Multilingual UI and localization](docs/LANGUAGES.md)
- [Workspace layout, generated concepts, and extensible black/lime theme](docs/UI-WORKSPACE.md)
- [Open UI foundations and the Rakazo/OpenCode hybrid decision](docs/UI-FOUNDATIONS.md)
- [Creating a project from existing, community-tested foundations and components](docs/PROJECT-CREATION.md)
- [Ten proposed end-to-end tasks](docs/SCENARIOS.md)
- [Joint decision log](docs/DECISIONS.md)
- [Additional license-restricted candidates, including Inbox Zero](docs/research/SPECIAL-CANDIDATES.md)
- [Independent architecture proposal and joint critique](docs/reviews/architecture-independent.md)
- [Draft module and tool contracts](docs/CONTRACTS.md)
- [Evaluation, cost, licensing, and release evidence](docs/VALIDATION.md)

A catalog entry does not install a repository. Runtime support, quality, cost, platform compatibility, and safety must pass the published gates before a module becomes recommended.

The core coordinates work; the catalog stores source references and evidence. Agents search a bounded shortlist and fetch the needed pinned source or packages for a particular project. Hosted tools can use an adapter without cloning their implementation. Catalog size does not require downloading or merging every repository into the application. [How reuse and on-demand retrieval work](docs/PROJECT-CREATION.md#0-katalogas-nėra-visų-repo-atsisiuntimas).

Research date: **16 October 2026, Europe/Kiev**. Individual sources retain their exact retrieval times, Git commit revisions, and content hashes. The development source, research and documentation are versioned together. A public software release and hosted-site launch have not occurred.
