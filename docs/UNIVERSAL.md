# Universal Guardrails (Checklist-First)

This is a short, model-agnostic checklist for reliable work in weakly-enforced tool environments.

## Core Checklist

1. Restate the goal in one sentence before changing code.
2. Identify the exact files you will change; if unknown, read first and then decide.
3. Read the relevant section of each file before editing it.
4. Name one falsifiable hypothesis about the controlling behavior and one cheap check that could disprove it.
5. Make the smallest change that satisfies the goal or tests that hypothesis.
6. Immediately run the narrowest relevant check after the first substantive edit; do not widen the change before checking it.
7. Do not guess about project behavior; verify by reading code or running a command.
8. If you change a name, key, route, or interface, search for all references and update them.
9. If a change might fail (I/O, parsing, network), add a clear failure path.
10. After editing, review the diff and undo only unintended changes introduced by the current task; preserve pre-existing user changes.
11. Run the repository-required validation commands before claiming completion.
12. Report verification honestly: Verified if you ran a command and saw the result; otherwise Unverified.
13. If the request is ambiguous, ask one clarifying question or state a single assumption.

Use the companion guides when their scope applies:

- `RELIABILITY.md` covers outcome propagation, postcondition checks, structured
	diagnostics, and failure injection.
- `VERIFICATION.md` defines which project checks establish task, milestone, and
	release confidence.

These guides complement this checklist. Logging and test commands are evidence,
not substitutes for returning errors or verifying behavior.

## Executor Loop

Use this bounded loop for each task. It is intentionally mechanical so models with weaker
planning or long-context reliability can still produce reviewable work.

1. **Goal:** write one sentence describing the requested observable outcome.
2. **Anchor:** name the file, symbol, failing test, or command that most directly controls it.
3. **Evidence:** read that local code plus at most one nearby test/call site needed to form a hypothesis.
4. **Hypothesis:** write `If <small change>, then <observable check> will pass because <local reason>.`
5. **Edit:** change the smallest possible slice. Do not refactor adjacent code unless the check proves it necessary.
6. **Check:** run the narrowest test/typecheck that can falsify the hypothesis immediately after the edit.
7. **Repair or stop:** if the result exposes a local defect, repair once and rerun. If it disproves the hypothesis, report the new evidence before changing direction.
8. **Finish:** run repository-required checks, inspect the diff, and report files changed, verified commands, and remaining uncertainty.

Search is not progress by itself. Once the controlling path, a falsifiable hypothesis,
and a discriminating check are known, edit and validate. If three local reads do not
produce those, stop and ask for clarification or state the blocker instead of mapping the
whole repository.

## Scope and Roadmap Gate

- Name the active milestone before editing a roadmap-driven project.
- Future-roadmap ideas are context, not current scope.
- Do not mix a feature, architecture migration, dependency change, and cleanup unless the request explicitly requires all of them.
- A new dependency needs a concrete current failure or measured complexity benefit; record why the platform/current stack is insufficient.
- Preserve public interfaces and existing project style unless changing them is part of the acceptance criterion.
- Never rewrite, revert, or format unrelated user changes.

## Lightweight Tool Gate

Use tools when they reduce guesswork or risk:

- Before the first edit of a file, read the relevant block in that file.
- Before using an unfamiliar API, confirm its real signature.
- After the first edit, run a focused executable check before further exploration or edits.
- Before claiming success, run a check when possible.

## Executor Model Addendum

- Keep steps short and explicit; one action per line.
- Prefer deterministic checks over narrative explanations.
- Avoid multi-step routing tables; use the Core Checklist above.
- Keep only one hypothesis and one edit slice active at a time.
- Quote the exact failing assertion or diagnostic before attempting a repair.
- Do not claim an API, package behavior, test result, or performance improvement without checking it.
- For performance work, record a before/after measurement using the same fixture and environment.
- If you must deviate, say why in one line.

## Trigger and Use

- Load this file at session start for Codex, GLM, DeepSeek, or another executor model.
- If you cannot load it at start, paste the Core Checklist before work begins.

## Verification Language

Use: `Verified: <command> -> <result line>` or `Unverified: run <command>`.

For partial completion, report four separate lines:

- `Verified:` checks that ran and their decisive result.
- `Changed:` files and the behavior intentionally changed.
- `Unverified:` checks that could not run and why.
- `Remaining:` known uncertainty or the next bounded task; do not disguise it as completed work.
