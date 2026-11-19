# AI as a programming partner

**Recommendation: one agent, small tasks, executable evidence.**
The bottleneck is learning and validating behavior, not generating more lines.

## Minimal harness

- `AGENTS.md`: project map, constraints, and actual commands. Update it when architecture changes.
- Versioned lockfiles for reproducible installation.
- Strict TypeScript, Go tests with the race detector, and a two-client smoke test.
- Git: initialize the repository, review diffs, and make small commits per feature.
- CI once a remote repository exists: repeat check/build/Go test/vet, start
  Compose, and run the smoke test. “It passed locally” cannot be the only gate forever.
- Keep secrets out of prompts and the repository; scope agent access to the task.
  Deployments, AWS spending, and destructive actions require your decision.

## Workflow

1. You define observable behavior and non-goals.
2. The agent reads relevant code and proposes the smallest change.
3. Ask for an explanation before code when learning the topic.
4. The agent implements and runs checks, recording failures and limitations.
5. You review the diff and use two tabs. Accept only if you can explain the change.

Example task:

> Implement join/leave messages in chat. Use existing protocol events;
> no persistence or new dependencies. Do not duplicate messages on welcome.
> Criteria: two tabs show join/leave events; reconnecting does not preserve the old ID.
> Read AGENTS.md, explain the approach, implement it, and run check/build and smoke.

## What to delegate

Boilerplate, Docker configuration, types, test cases based on actual risks,
bounded refactors, and investigations with file/line references as evidence.

## What you need to understand

The 3D loop and camera coordination; hub ownership/concurrency; offer/answer/ICE;
STUN versus TURN; port exposure and infrastructure costs. Ask AI for review
questions and experiments rather than just “do everything.”

## Avoid

- Parallel agents changing the same contract; start with one agent.
- Tests that merely repeat implementation or mocks that never exercise the network.
- Large rewrites “for scalability” without measurements.
- Accepting invented APIs: compile, consult documentation, and test.
- Endless rules. A recurring problem deserves a rule or check,
  not a preventive 100-page manual.

Evolve the harness from actual failures: found a focus/WASD regression? Add a
browser test for it. Adding voice? Test two browsers with a call forced through
TURN. Infrastructure? Review `terraform plan` and set a budget before applying.
