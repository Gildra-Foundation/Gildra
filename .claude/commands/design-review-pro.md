Complete a design review of the pending changes on the current branch.

Prepare the context, then delegate the review to the `design-review` agent:

1. Collect the change context:

```bash
git status --short
git diff --stat HEAD
git log --oneline -5
```

2. Ensure a reviewable build is running: `npm run build && npm run start`
   (or use https://gildra.vercel.app when reviewing production). Do not review
   from code alone.

3. Launch the `design-review` agent with:
   - the diff summary and motivation from the conversation;
   - the review URL;
   - affected routes (`/`, `/tier-lists`) and any specific states to test.

The agent follows root `design.md` (the design contract) and captures the
standard matrix — 1440×1000, 1280×900, 768×1024, 390×844 — plus interactive
states (Explore, mobile menu, search dialog, mobile filters, detail toggle,
sticky contextual nav).

A screenshot by itself is not a review: require the agent's severity-ordered
findings with evidence before considering the review complete. Report findings
back; do not apply fixes unless the user explicitly asks.
