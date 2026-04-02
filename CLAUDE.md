# nekretnine-osijek-monitor

Stack: JavaScript

<!-- BRAIN-LEARNED-RULES-START -->
## 🧠 Brain-learned rules
_Auto-updated by Brain Platform on 2026-04-01. Do not edit this section manually._

### ✅ Apply these patterns
- **Environment variables for all runtime configuration** (this project)
  → Add a startup validation step in every entrypoint that asserts required env vars are present and well-formed before the process accepts traffic.
- **Environment variables for all runtime configuration** (this project)
  → Pair this pattern with startup validation (fail-fast on missing required vars) and .env.example committed to every repo
- **Projects are monitoring or notification systems** (this project)
  → Extract a shared poller/notifier scaffold with built-in run-metrics logging, structured error handling, and a consistent retry/backoff interface
- **Webhook and event-driven external integrations** (this project)
  → Always validate webhook signatures server-side before processing payloads; never fail-open when the secret is absent
- **Telegram as primary notification channel** (this project)
  → Extract a shared Telegram utility module with retry logic, error handling, and send-failure logging to avoid duplicating fragile send code in every project.
- **Telegram as primary notification channel** (this project)
  → Centralise Telegram bot logic into a shared library to avoid duplicating token handling, error-swallowing, and rate-limit logic across projects
- **Monitoring and notification systems dominate portfolio** (this project)
  → Extract shared scaffolding (scheduler, notifier, health-check endpoint, .gitignore template) into a portfolio-wide starter template to avoid reinventing the same gaps in every new project
- **Monitoring & notification systems dominate the portfolio** (this project)
  → Extract a shared notification/alerting library to avoid duplicating Telegram, webhook, and polling logic across projects.
- **Environment variables for runtime configuration** (this project)
  → Add a startup validation step in every project that asserts required env vars are present and well-typed before any server or process starts. Commit a .env.example to every repo.
- **Projects are monitoring or notification systems** (this project)
  → Define a shared contract (source → diff → notify) and reuse it; this pattern is frequent enough to warrant a small internal framework rather than bespoke implementations
- **Monitoring and alerting as primary use case** (this project)
  → Extract a shared monitoring harness (run-loop, error reporting, Telegram dispatch, metrics emission) to eliminate the duplicated scaffolding that currently drifts inconsistently across these projects
- **Monitoring and alerting as primary use case** (this project)
  → Standardise a shared monitor scaffold (fetch → validate → diff → notify → persist run-metadata) to reduce per-project reinvention and ensure consistent error propagation.
- **Monitoring / notification as primary use case** (this project)
  → Adopt a shared event-driven skeleton (poll → normalise → diff → notify) to stop re-implementing the same pipeline with subtle per-project bugs.
- **Portfolio dominated by monitoring and notification systems** (this project)
  → Extract a shared monitoring harness (poll → diff → notify) to avoid re-implementing dedup, rate limiting, and error handling across every project independently.
- **Monitoring and notification as dominant use case** (this project)
  → Adopt a shared agent/worker scaffold (health-check endpoint, structured logging, graceful shutdown) to avoid reinventing the same plumbing in each project.
- **Telegram as primary notification channel** (this project)
  → Centralise bot scaffolding (auth guard, error handler, rate limiter) into a shared library so all three projects inherit fixes instead of each re-implementing the same gaps.
- **Telegram used as primary notification channel** (3 projects)
  → Build a single hardened Telegram wrapper with send-failure logging, chat-ID allowlist enforcement, and credential management via env vars.

### ❌ Avoid these anti-patterns
- **Fix branches stall indefinitely with hundreds of dirty uncommitted files** (5 projects)
  → Enforce a 'commit or stash before context switch' rule. WIP commits on a fix branch are better than 160 dirty files. Consider a pre-switch hook that blocks checkout unless the tree is clean.
- **Critical security findings survive 9–17 cycles without remediation** (5 projects)
  → Decouple finding documentation from remediation tracking. Each critical finding needs an owner, a target commit date, and a CI gate that blocks deployment if the finding is still open. Documentation without a merge blocker is not a control.
- **Zero or broken test infrastructure — no CI gate** (seen here)
  → Add at least one integration test and wire npm test / pytest to a CI pipeline; a broken test script is worse than no script because it creates false confidence
- **Sensitive endpoints with no authentication** (4 projects)
  → Apply an auth middleware by default on every route; opt-out explicitly for genuinely public endpoints; never enforce access control only on the client
- **Errors silently swallowed or masked by catch-all handlers** (seen here)
  → Replace bare catch blocks with typed error handling that logs context and re-raises or alerts. Remove global continue-handlers; let the process crash and restart cleanly under a supervisor.
- **Fix branches created but never completed** (seen here)
  → Treat an open branch with zero commits as a red flag equivalent to the finding itself; close stale fix branches rather than leaving them as false-progress signals
- **Public endpoints with zero authentication** (4 projects)
  → Every externally reachable endpoint must authenticate callers before executing any logic. For Telegram bots: whitelist chat IDs. For HTTP APIs: require and validate API keys or tokens server-side, never client-side
- **Core dump binaries accumulating with no .gitignore** (seen here)
  → Add `core.*` and `core` to a root-level .gitignore immediately. Configure `ulimit -c 0` in process managers to prevent future dumps in production, or redirect them to /tmp with `kernel.core_pattern`.
- **No authentication on public-facing endpoints** (4 projects)
  → Apply authentication middleware at the router level as a default-deny baseline. For Telegram bots, whitelist allowed chat IDs at startup and reject all others before any command handling.
- **Core dump binaries accumulating with no .gitignore** (seen here)
  → Add 'core.*' and 'core.[0-9]*' to a root .gitignore immediately. Investigate why Node/JVM processes are crashing to produce dumps rather than exiting cleanly — the dumps are a symptom.
- **Zero test infrastructure on security-critical paths** (seen here)
  → Add at minimum one integration test per security-critical path (auth, webhook validation, API key check) and wire them to a pre-push hook. A single failing test caught before push is worth more than twelve cycles of findings.
- **Credentials committed to git history** (seen here)
  → Rotate all exposed credentials immediately; use git-filter-repo to purge history; add pre-commit hooks (gitleaks or similar) to block future credential commits
- **No startup env-var validation — silent runtime failures** (seen here)
  → Add a validateEnv() function called synchronously at process startup that throws with a clear message listing every missing required variable
- **No .gitignore — core dumps and secrets at commit risk** (seen here)
  → Add a .gitignore as the very first commit in every new project; include core, *.env, node_modules, __pycache__, *.pyc, .gradle, build/
- **Security and architectural debt recurring across review cycles** (6 projects)
  → Enforce a rule: any finding marked high/critical that is unresolved after two cycles blocks all feature work on that project until closed
- **Persistent dirty working tree — fixes never committed** (7 projects)
  → Adopt a rule: no analysis session closes without at least one atomic commit. Use `git stash` as a last resort before any branch switch. A fix that is not committed does not exist.
- **Findings persist for 8–15 review cycles without remediation** (seen here)
  → Treat any finding at cycle 3+ as a process failure, not a code failure. Block merges to main on that project until the finding is closed. A CI gate that fails on known-unfixed issues is more effective than repeated reports.
- **No .gitignore — core dumps at accidental-commit risk** (seen here)
  → Add a root .gitignore with `core`, `core.*`, `*.core`, `node_modules/`, `__pycache__/`, `.env` as the very first commit on every new project. Use a generator (e.g. gitignore.io) to bootstrap it.
- **Hundreds of dirty files accumulate; fix branches stall and are discarded** (seen here)
  → Commit in small, focused increments — even WIP commits are better than lost work. Use `git stash` before branch switches. Set a personal rule: no branch switch with dirty files unless stashed or committed.
- **No authentication on public-facing endpoints** (4 projects)
  → Every HTTP endpoint must require authentication. Add middleware-level auth guards, not per-route checks. Use env-var-configured secrets validated at startup.
- **Critical findings persist for 10+ cycles without remediation** (6 projects)
  → Treat any finding that survives 3 cycles as a process failure. Create a time-boxed fix issue, assign it, and block new features in that project until it is closed.
- **Critical security findings persist unresolved for 10+ cycles** (7 projects)
  → Treat any finding that survives 3 cycles as a process failure, not a code issue. Block the next feature commit until the finding has a verified-closed state. Automate a pre-push check that fails if a known-open critical finding exists.
- **Auth absent or enforced client-side only** (5 projects)
  → Enforce all role and identity checks in server-side middleware before the request reaches any handler; never trust client-supplied role claims
- **Same findings persist across 10+ consecutive cycles** (6 projects)
  → Block new feature work until findings older than 3 cycles are resolved; treat cycle-count as a severity multiplier when prioritising the backlog
- **Errors silently swallowed rather than surfaced** (4 projects)
  → Establish an error-handling contract: every caught exception must either be re-thrown, logged with sufficient context to diagnose, or trigger a notification. Silent catch blocks should fail CI review.
- **Critical issues unresolved across multiple review cycles** (4 projects)
  → Institute a hard SLA: any critical/high finding unresolved after two cycles triggers a feature freeze on that project. Treat repeat findings as process failures, not just code failures.
- **Fix branches with large dirty working trees never committed** (4 projects)
  → Commit work-in-progress with a 'WIP:' prefix at minimum; consider a pre-push hook that warns if a fix branch has been open for more than 48 hours with uncommitted files
- **Critical fixes stall across 5+ review cycles** (seen here)
  → Treat any finding unresolved after 2 cycles as a process failure; block new feature work on critical findings; assign explicit owners and deadlines
- **Dirty working trees block or obscure fixes** (4 projects)
  → Commit or stash all changes before beginning a fix; keep fix branches focused on a single concern; never let unrelated dirty files accumulate alongside security changes
- **Missing or bypassed authentication on sensitive endpoints** (4 projects)
  → Apply an auth middleware at the router level so every new route is protected by default. Treat unauthenticated access to any mutation endpoint as a critical defect; block deployment until resolved.
- **Same critical issues persist 6–13 cycles without resolution** (seen here)
  → Treat a critical finding that persists beyond 2 cycles as a project blocker. Gate new feature work on closing open criticals; use a JIRA/Linear ticket per finding with an owner and deadline
- **Critical findings persist across 7–13 review cycles without resolution** (seen here)
  → Treat any finding that survives three cycles as a blocker: freeze feature work on that project until it is resolved and verified in the committed tree, not just the working directory
- **Missing or incomplete .gitignore allows generated/sensitive files to be committed** (4 projects)
  → Generate a .gitignore from gitignore.io for each stack at project creation. Audit with `git ls-files --others` regularly. Add output/, cache/, *.core, and .env to every project's ignore list immediately.
- **Same bug regresses every cycle with no automated prevention** (seen here)
  → Every project needs a CI pipeline. A regression that appears 10 cycles in a row is a process problem, not a code problem — the fix must be enforced by automation, not willpower
- **No authentication on public-facing endpoints** (4 projects)
  → Apply an auth middleware at the router layer so new routes are authenticated by default. Unauthenticated routes must be explicitly opt-out, not opt-in.
- **Hardcoded config values with no env-var validation at startup** (4 projects)
  → Validate and parse all env vars in a single config module at startup, throwing on missing or invalid values. Never read `process.env` or `os.environ` inline mid-code.
- **No startup env-var validation — silent NaN/undefined failures** (seen here)
  → Validate all required env vars at process startup and throw an explicit error with the missing key name before any I/O occurs.
- **Missing or unenforced authentication on public-facing endpoints** (4 projects)
  → Move all auth checks server-side. Fail closed: if GITHUB_WEBHOOK_SECRET or BOT_TOKEN is unset, refuse to start rather than silently accepting all requests. Use middleware so auth cannot be accidentally omitted on new routes.
- **No startup validation of required environment variables** (seen here)
  → Add an `assertEnv(vars: string[])` call as the very first line of each entrypoint. Throw and exit(1) immediately on any missing or malformed value before any server/listener is started.
- **Fix branches stall indefinitely with growing dirty file counts** (5 projects)
  → Enforce a WIP commit policy: commit to a fix branch at the end of every session, even as a draft. Use `git stash` as a last resort before any branch switch. Treat uncommitted fix work as lost work.
- **Core dump files accumulating untracked in repo roots** (4 projects)
  → Add core and core.* to .gitignore immediately; configure NODE_OPTIONS=--max-old-space-size and catch uncaughtException to log-then-exit cleanly rather than dumping
- **No .env.example — environment requirements undocumented** (4 projects)
  → Add .env.example listing every required and optional variable with a description and safe placeholder value. Automate a startup check that errors on missing required vars with a clear message referencing .env.example.
- **Fix branches created but never committed** (3 projects)
  → Never switch branches with a dirty working tree—either commit (even as WIP), stash, or use a worktree. Add a pre-checkout hook that aborts if there are unstaged changes to tracked files.
- **No startup validation of environment variables** (3 projects)
  → Add a single validate-env() function called before any server/process work begins. It should assert type, range, and presence for every required variable and throw with a clear message if any fail.
- **Single functions growing without decomposition** (3 projects)
  → Set a hard lint rule (max-lines-per-function: 100–150) and enforce it in CI. When a function exceeds the limit, decompose before adding more logic.
- **Non-constant-time secret comparison enables timing attacks** (2 projects)
  → Replace all secret/token comparisons with `hmac.compare_digest()` (Python) or `crypto.timingSafeEqual()` (Node). Never use `==` or `===` for secrets.
- **No shared constants or type package — enum drift guaranteed** (3 projects)
  → Create a /shared or /packages/constants workspace package; import enums and role strings from one place in both server and client code
- **package-lock.json uncommitted — non-reproducible builds** (seen here)
  → Commit package-lock.json on the same commit as package.json changes; add a CI step that fails if the lock file is out of sync with the manifest
- **Authorization enforced on the client only** (2 projects)
  → Move every authorization check to the server. The client UI is cosmetic; any route that mutates state must re-verify the caller's role on every request, independent of what the client claims.
- **Vulnerability details written to world-readable files** (2 projects)
  → Write sensitive operational files with 0o600. Consider whether they need to persist on disk at all versus staying in memory or a proper secrets store.
- **Unbounded resource accumulation without housekeeping** (3 projects)
  → Add automated housekeeping: a cron to delete core files older than 24h, git gc scheduled weekly, and log rotation. For epg-iptv, add a pre-commit validation hook to prevent committing EPG data files before the fix branch merges.
- **Secrets unguarded or leaked into git history** (seen here)
  → Run `git secrets` or `truffleHog` as a pre-commit hook across all repos immediately. Rotate any credential that may have been exposed. Treat a missing secret as a hard fatal error at startup, never a silent no-op.
- **Duplicate or meaningless commit messages destroy audit trail** (seen here)
  → For automated commits, generate messages that include a timestamp, record count, or content hash. For human commits, enforce a commit-msg hook that rejects generic messages. Consider Conventional Commits.
- **User-controlled input reaches system boundaries unsanitised** (3 projects)
  → Validate and sanitise at every trust boundary: shell arguments must use array exec form (never string interpolation), numeric env vars must be parsed with explicit NaN checks, and all external inputs must be schema-validated before use.
- **Public endpoints and background tasks have no resource limits** (3 projects)
  → Add a browser/worker pool with a fixed concurrency ceiling in ja-dranko. Apply per-IP rate limiting on all unauthenticated endpoints. Size caches to the actual use-case (live streams need no seek buffer).
- **Credentials at risk of leaking into git history** (seen here)
  → Add a pre-commit hook (e.g. gitleaks or detect-secrets) repo-wide; rotate any token that touched a commit; add a .gitignore and .env.example to every project immediately
- **Input accepted and acted on without validation** (3 projects)
  → Validate and sanitise at the boundary before any processing; never pass raw request data to shell commands — use argument arrays, never string interpolation
- **Mutation endpoints exposed without authentication** (3 projects)
  → Apply authentication middleware at the router level as a default-deny; require explicit opt-out for genuinely public routes; never combine unauthenticated access with shell execution
- **Credentials committed or at risk of being committed** (seen here)
  → Add a pre-commit hook (e.g. gitleaks or detect-secrets); ensure .gitignore excludes .env files before first commit; rotate any token whose history is unconfirmed clean
- **Production fixes sitting uncommitted in working tree for multiple cycles** (3 projects)
  → Establish a rule: any working-tree fix for a production regression must be committed within 30 minutes of being written, even as a WIP commit. The branch-switch-discards-work pattern in stadialive and job-hunter is a direct consequence of this discipline gap.
- **No .gitignore or .env.example at project inception** (3 projects)
  → Add .gitignore and .env.example as the very first commit in every project; use a shared template across the portfolio
- **Fix branches created but never committed** (3 projects)
  → Treat an uncommitted fix as no fix. Require atomic commits that contain the actual code change; use CI to block merges if a branch is functionally identical to its branch point
- **package.json / lockfile changes left uncommitted** (3 projects)
  → Commit package.json and lockfile atomically with the code change that requires them; add a CI check that fails if the lockfile is out of sync with package.json
- **Credentials and tokens exposed in git history or world-readable files** (seen here)
  → Rotate all exposed credentials immediately. Use `git filter-repo` or BFG to scrub history. Add a pre-commit hook (e.g. detect-secrets or truffleHog) to prevent future commits of secret-shaped strings. Write sensitive files with mode 0o600.
- **No startup validation of required environment variables** (3 projects)
  → Write a validateEnv() function called before any other initialisation. For each required var: check presence, parse and validate type, throw a descriptive error on failure. Libraries like envalid or zod make this trivial.
- **Logic duplicated by copy-paste instead of shared module** (3 projects)
  → Extract any logic that appears in more than one file into a named shared module or package. In monorepos, use a packages/shared workspace. The rule: if you copy a block, you owe the codebase a refactor.
- **Branch switches without committing destroy in-progress fix work** (3 projects)
  → Establish a personal rule: `git status` must be clean before any `git checkout` or `git switch`. Use `git stash push -m 'description'` when a context switch is unavoidable. Better: commit a WIP commit and amend it after.
- **package.json / lock file changes left uncommitted** (3 projects)
  → Dependency manifest changes (package.json, package-lock.json, requirements.txt) must be committed atomically with the code change that required them. A package-lock.json divergence is a reproducibility bug.
- **Webhook secret silently skipped when env var unset** (2 projects)
  → Treat an unset webhook secret as a fatal startup error. Never silently skip signature verification — fail loudly and refuse to start rather than run insecurely
- **Fix branch switched away from without committing — work lost** (3 projects)
  → Use `git stash` or `git worktree` when context-switching. Configure git to warn on dirty state before checkout. Small, frequent commits eliminate the risk of losing in-progress work
- **Generated output files committed to version control** (2 projects)
  → Add all generated output paths to .gitignore. Use a pre-commit hook to block committing files matching output patterns. Store runtime output in object storage or a database, not git
- **No rate limiting on unauthenticated public endpoints** (3 projects)
  → Apply rate limiting at the HTTP layer (express-rate-limit, nginx, or a reverse proxy) before requests reach application logic, especially on unauthenticated endpoints
- **Credentials committed to git history** (2 projects)
  → Rotate all affected credentials immediately—removing from HEAD is insufficient. Use `git filter-repo` to purge history, then force-push. Install a pre-commit hook (e.g., gitleaks) to prevent recurrence.
- **Webhook secret treated as optional, silently bypassed** (1 projects)
  → If the secret env var is absent at startup, refuse to start—throw a hard error. Auth configuration must be 'fail closed': absent config = blocked, not bypassed.
- **Generated output files committed to version control** (2 projects)
  → Add all output directories to .gitignore. Store run artifacts in object storage (S3, GCS) or a database. Only commit code and configuration.
- **Credentials and secrets leaked into git history** (3 projects)
  → Rotate all exposed tokens immediately. Add pre-commit hooks (e.g. git-secrets or truffleHog) to block future commits. All secrets must come from environment variables with a startup assertion that they are non-empty.
- **Fix branches opened but never merged** (3 projects)
  → Apply a two-commit rule: if a fix cannot be completed in two commits, break it into a smaller deliverable that can be merged now. Never let a security fix branch go more than one week without a merge or explicit deferral decision.
- **No rate limiting or input validation on ingest endpoints** (3 projects)
  → Apply an express-rate-limit (or equivalent) middleware globally. Validate all incoming payloads against a schema (zod, joi, pydantic) at the controller boundary before any business logic executes.
- **Fix branches abandoned mid-work across multiple projects** (3 projects)
  → Use `git stash` or commit WIP with a `fixup!` prefix before switching branches. Consider trunk-based development with short-lived feature flags to avoid branch abandonment.
- **package-lock.json uncommitted — non-reproducible installs** (seen here)
  → Always commit package-lock.json. Use `npm ci` in CI/CD. Run `npm audit` in the pipeline and fail on high/critical vulnerabilities.
- **Hardcoded runtime values that require code changes to correct** (3 projects)
  → Extract all environment-specific or time-sensitive values to configuration (env vars or a config file). Values that have been wrong in production once should never be hardcoded again.
- **Credentials committed to or leaked through version control** (3 projects)
  → Rotate all credentials immediately. Use git-filter-repo to purge history. Add a pre-commit hook (e.g. gitleaks or detect-secrets) to prevent recurrence. Never read secrets from files committed to the repo.
- **No rate limiting on unauthenticated POST endpoints** (3 projects)
  → Apply a rate-limiting middleware (e.g. express-rate-limit, slowapi) at the router level so all routes inherit it by default. Set conservative limits and tighten per-route as needed.
- **Public endpoints with no authentication or rate limiting** (3 projects)
  → Apply an authentication middleware to all mutating routes. Add a rate-limiter (e.g. express-rate-limit, slowapi) keyed on IP or session before any business logic executes.
- **No input validation for env vars or user-supplied data** (3 projects)
  → Parse and validate all external inputs at the boundary: use `parseInt`/`parseFloat` with NaN checks or a schema validator (zod, pydantic). Use `hmac.compare_digest` or `timingSafeEqual` for any secret comparison.
- **Missing or uncommitted lockfiles allow non-deterministic installs** (seen here)
  → Commit package-lock.json (or equivalent) on every dependency change. Add it to CI verification so a lockfile drift causes a build failure before it reaches production.
- **No rate limiting on public-facing endpoints** (3 projects)
  → Apply per-IP rate limiting at the framework or reverse-proxy layer; require table/session identity on order endpoints before accepting POST payloads
- **Global exception handlers swallow errors instead of surfacing them** (2 projects)
  → Log the full error and stack, emit a metric or alert, then call process.exit(1); never silently continue after an unhandled rejection in production
- **Dependencies pinned years behind current major versions** (seen here)
  → Enable Dependabot or Renovate with auto-merge for patch updates and a weekly PR for minor/major bumps. Treat dependency updates as routine maintenance, not optional work.
- **Automated commits with meaningless messages** (seen here)
  → Include a timestamp, record count delta, and source identifier in every automated commit message; this costs one interpolated string and saves hours of debugging
- **Test files exist but contain no assertions** (seen here)
  → A test with no assertion is worse than no test — it implies coverage that does not exist; add a lint rule that fails on test files with zero expect/assert calls
- **Fix commits marked unconfirmed with no verification step** (seen here)
  → Define a done-definition for each finding: what command or test output proves the issue is closed. Link that evidence in the commit message. A fix that cannot be verified is not a fix.

<!-- BRAIN-LEARNED-RULES-END -->
