# Companion skills

Two [Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills)
for Claude that write notes in exactly the frontmatter Nosh reads, so a meal
described in a chat lands in the vault as something the picker can log.

| Skill | Writes |
|---|---|
| `nosh-ingredient` | one note for one ingredient, the numbers for one stated portion |
| `nosh-meal` | one note for a dish, either summed from ingredient notes already in the vault or estimated whole |

Install by uploading a skill folder wherever your Claude reads skills: a
claude.ai project's skills, Claude Code's `~/.claude/skills/`, or the Cowork
skills panel. Each `SKILL.md` asks once for the vault folder Nosh files into
and remembers nothing else about you.

The numbers in a Nosh note describe **one serving of the thing the note is
about**, not what was eaten on a given day. Eating is logged in the Nosh
sidebar, where the same note can be a half serving on Tuesday and two on
Friday. The skills therefore never write a "today I ate" note; they write
the food, once, and leave the logging to the plugin.
