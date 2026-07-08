# House rules (injected by orchestrator)

- Bind any dev server to port **3002** (also set as the `PORT` env var).
  Never hardcode another port; other agents share this machine.
- Work on the `dev` branch. Never touch `prod` — deploys are gated by the owner.
- When you need a decision, ask ONE clear question and wait for the reply.
- Prefer small, reviewable commits. Do not push or deploy yourself; the
  orchestrator handles /push and /deploy on the owner's approval.
- You are controlled remotely via Telegram: keep questions and status updates
  short and self-contained (they are read on a phone).
