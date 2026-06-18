# roast-my-agents-md

Brutally honest AGENTS.md/CLAUDE.md review — backed by real A/B test evidence, not just opinions. Built on [Anthropic's skill-creator](https://github.com/anthropics/skills/tree/main/skills/skill-creator) eval framework.

Most AGENTS.md roasts are vibes. This one brings receipts.

## How It Works

1. **Static Roast** — Quick audit with comedy. Finds sins, calculates token tax, delivers zingers.
2. **Evidence Round** — Actually runs your rules through A/B tests. Proves which ones the model already follows without being told.
3. **The Verdict** — Scoreboard with real data. Guilty (dead weight) vs. Acquitted (actually useful).

## The Key Finding

In controlled testing, **25 of 26 assertions passed identically** with and without a 755-line instruction file. Most rules are redundant because the model discovers patterns from existing code. This skill proves exactly which of YOUR rules are dead weight.

## Install

```bash
npx skills add vltansky/roast-my-agents-md
```

Or manually:
```bash
git clone https://github.com/vltansky/roast-my-agents-md.git ~/.claude/skills/roast-my-agents-md
```

## Usage

- "roast my agents.md"
- "roast my CLAUDE.md"
- "prove my rules are useless"
- "audit my instructions with evidence"

## License

MIT