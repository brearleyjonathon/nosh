# Nosh

An Obsidian nutrition tracker built around DASH (Dietary Approaches to Stop
Hypertension).

Nosh reads the notes you already keep, adds up what you log, and charts it
against DASH targets: nine nutrients plus food-group servings. Everything stays
in your vault unless you turn on the optional AI features.

<img width="1280" height="640" alt="nosh: log. see. adjust. Nutrition tracking inside Obsidian, built around DASH." src="https://nosh.health/social-card.png" />

Website: [nosh.health](https://nosh.health/)

## Disclosures

Nosh works offline. The optional Nosh AI features stay off until you add an
API key. With them on:

- Network use. What you type into a draft, the note you ask about, and any
  photo you take are sent to the Anthropic API at `api.anthropic.com`, and only
  when you press the button that sends them. There is no telemetry and no other
  network use.
- Account and cost. Nosh AI needs an Anthropic developer platform account, and
  every request is billed to it at API rates. A claude.ai subscription can't be
  used; [Credentials](#credentials) explains why.
- Links to claude.ai. Drafted meal notes with a method include a *Cook this
  with Claude* link. Clicking it opens claude.ai in your browser with the
  recipe in the page address. Nothing is sent until you click.
- Where the key lives. Your API key is kept in Obsidian's keychain, on the
  device and outside the vault. Obsidian older than 1.11.4 has no keychain, so
  there it's stored in plain text in `data.json` in the plugin folder, inside
  your vault. See [Credentials](#credentials).
- The notes Nosh looks at. To find your foods, log notes and targets note, Nosh
  goes through the vault's Markdown notes using the tags and frontmatter
  Obsidian already has for each. It only reads a note's text when it's one
  Nosh works with or one you point it at. The *Only look in the Nosh folder*
  setting limits the search for foods to that folder.

No accounts with the author, no payments, no ads. Nosh never reads or writes
files outside the vault, and runs no other programs.

## UI

Nosh lives in the sidebar on desktop and mobile.

<img width="2436" height="2420" alt="nosh-dark" src="https://github.com/user-attachments/assets/a1e3d437-0cbf-4575-a326-255b705065a6" />
<img width="2436" height="2420" alt="nosh-light" src="https://github.com/user-attachments/assets/08acc345-8f96-4c5d-8aa9-c11da9945145" />

## Tagging notes

Tags decide whether a note is a meal or an ingredient:

```yaml
tags:
  - nutrition/meal        # or nutrition/ingredient
```

The flat pair `#nutrition` + `#meal` works too, and the umbrella tag is
configurable. Folders don't matter. The Nosh folder setting only controls where
new notes go (`Meals`, `Ingredients`, `Reports`, `Log` and
[the targets note](#the-targets)), though *Only look in the Nosh folder* limits
the search for foods to it.

## Frontmatter

Every number is per serving. Missing fields count as zero.

| Field | Meaning |
|---|---|
| `calories` `protein_g` `carbs_g` `fat_g` `sat_fat_g` | the four a recipe card prints, plus saturated fat |
| `fiber_g` `sodium_mg` `potassium_mg` `calcium_mg` | the ones DASH judges you on |
| `serv_grains` `serv_vegetables` `serv_fruit` `serv_dairy` | DASH food-group servings |
| `serv_meat` `serv_fats` `serv_nuts` `serv_legumes` `serv_sweets` | and the rest of them |
| `amount` | the portion the numbers describe, such as "1 cup" or "1 medium" |
| `meal_type` | when it is usually eaten. A hint, since the occasion is chosen when you log |
| `group` | override the food group an ingredient files under |

The picker files each ingredient under the food group it contributes most to,
worked out from its servings.

## Logging

Pick an occasion (breakfast, lunch, dinner, snacks and drinks, dessert), then
what you ate. The occasion belongs to the log entry, not the note, so a banana
can be breakfast one day and dessert the next.

Each occasion starts with a Recent section: up to eight foods logged there in
the past month. While an occasion is empty, a button copies the last one
(*Copy yesterday's breakfast*).

Tick meals, tick ingredients, or build a meal from ingredients. A build can be
logged as a one-off or saved as a meal note:

```yaml
components:
  - note: "[[Oatmeal]]"
    servings: 1
  - note: "[[Almond Milk]]"
    servings: 0.5
```

Meal totals are recomputed from their components on every read, so fixing an
ingredient fixes every meal and day that used it. The totals are also written
to frontmatter for Dataview and anyone reading the note.

The ticked-list button next to the filter shows only what's ticked. Rows you
untick there stay visible until you leave, so you can undo a slip.

### Log notes

Each day is also written to a note in the `Log` folder:

```yaml
---
day: 2026-09-17
log:
  - note: "[[Oatmeal]]"
    occasion: Breakfast
    servings: 1
  - note: "[[Banana]]"
    occasion: Snack
    servings: 1.5
tags:
  - nutrition/log
---
```

The note is the record and the plugin's store is a cache. Edit the frontmatter
and the day updates; delete the note and the day clears. Notes synced from
another device are read the same way. Anything you write outside the list
markers is kept, and emptying a day only deletes its note if you haven't added
your own text. Log notes can live in any folder as long as they keep the
`nutrition/log` tag and their name. You can turn them off in settings.

With Dataview, every day you ate a banana:

```dataview
TABLE log
FROM #nutrition/log
WHERE contains(string(log), "Banana")
SORT file.name DESC
```

### The targets

Your targets live in a note called `Nosh targets` in the Nosh folder:

```yaml
---
nosh: targets
diet_calories: 1750
diet_sodium: 1500
targets:
  calories: 1750
  protein_g: 130
  fiber_g: 35
  sodium_mg: 1500
servings:
  serv_vegetables:
    min: 5
    max: 6
shapes:
  calories: floor
weights:
  protein_g: 2
hidden:
  - carbs_g
tags:
  - nutrition/targets
---
```

The tables underneath are a readable copy. The note holds every figure from
settings: nutrient targets, food-group ranges, bar shapes, weights, hidden
bars, and the calorie and sodium pattern the Fill button uses.

It exists because `data.json` is read once at startup and rewritten whole on
every log, so a second device left open could write stale targets back over
ones you'd just changed. The note wins over `data.json`. Edit it and the
targets follow on every device. Delete it and it's written again from the
current figures.

No note is written until you change a target. Like log notes, it answers to its
tag, so you can move it anywhere. Turn it off with **Keep the targets in a
note**.

## The score

A ring shows a score out of 100 for the day, week or month on screen. It's the
weighted average of how close each visible bar is to its target. Weights
default to 1 and can be changed per bar in settings. The line beside the ring
names the three bars costing the most; tap it for the breakdown.

Each bar is a floor, ceiling, range or reference (reference bars are grey and
unscored). Defaults follow DASH: protein, fibre, potassium and calcium are
floors; calories, fat, saturated fat and sodium are ceilings; carbs is a
reference. Among food groups, fats & oils, lean meat and sweets are ceilings.
Change any of them in settings.

```
floor    (minimum m)              credit = min(1, v / m)
ceiling  (maximum M)              credit = 1                    while v ≤ M
                                          = max(0, 1 − (v − M) / M)  past it
range    (m … M)                  the floor rule below m, the ceiling rule
                                  above M, 1 in between
today    (pace p = min(1, kcal so far / kcal target))
                                  m becomes m × p for every floor and range
```

- Calories only count when over target, unless you make them a floor.
- Hidden bars and bars with a target of 0 are skipped.
- Weekly food groups count in the week's score, not the day's.
- Today is paced: floors scale with the share of calories eaten so far, so the
  day starts at 100 and moves with each meal. Ceilings aren't paced.

Weeks and months average each bar over the days with something logged, so an
unlogged day is skipped rather than scored as zero. Green is 90 and up, amber
from 70.

## The month

The Month tab is a calendar with tiny nutrient bars in each day, so you can see
which days went green, which went red, and which are empty. Tap a day to open
it.

## Reports

Export a day, week or month as a markdown note: totals, bars, a By food table
(one row per food, the largest value in each column in bold, so you can see
what brought the sodium), and day-by-day detail.

Month reports average over logged days against daily targets and add two
tables: Against last month and By week. A month in progress stops at today.
Reports also give reach (how close the floors got) and excess (the worst
overshoot of any ceiling).

Each span has one report (`Nosh 2026-09`). Exporting again overwrites it,
including anything you typed into it.

## Nosh AI (optional)

Off until you add an API key. It adds:

- Drafting. Describe a food, or photograph a label or a plate, and get a note
  with estimated numbers. You can add a note like *half of it* before sending.
  The draft lists each ingredient with a portion you can correct, and the
  nutrients recompute from those.
- What's for… Suggests a meal that fits what's left of your day, with a method.
  It asks how many you're cooking for, how much effort you want, and what needs
  using up.
- Ask about this recipe. Question any recipe note (where the sodium comes from,
  how to stretch it, what to serve with it) from the command palette or the
  right-click menu. Save to note appends the conversation.
- Readings. An optional section on exported reports: patterns and what to
  watch for a day or week, progress and ranked improvements for a month. Only
  the report's tables are sent.

Estimating and inventing meals can use separate models, so the frequent job can
use a cheaper one. Each can be Sonnet 5, Opus 5 or Opus 5.5. Sonnet 5 is the
default for estimating and Opus 5 for suggestions. Opus 5.5 costs less than
Opus 5, at about twice Sonnet's price.

### Credentials

Nosh AI uses an API key from [platform.claude.com](https://platform.claude.com),
and every request is billed to that account at API rates. It works on desktop
and mobile.

The key is kept in Obsidian's keychain (Obsidian 1.11.4 and later). In Nosh
settings, pick a key already stored there or add a new one. The keychain is on
the device, not in the vault, so the key doesn't sync and each device needs it
once. A key an earlier version of Nosh kept in `data.json` moves to the
keychain the first time Nosh loads. On older Obsidian the key stays in
plain text in `data.json` in the plugin folder.

> On older Obsidian, other plugins, sync services and any repository you commit
> the vault to can read `data.json`. Don't commit it. This repository ignores
> it.

Why there's no "sign in with Claude": Anthropic's consumer terms only allow a
Pro or Max login in Claude Code and claude.ai, and Anthropic blocks it
elsewhere. *Sign in with ChatGPT* doesn't carry model access into other apps
either. Until a sanctioned option exists, an API key is the honest route.

## Install

Search for Nosh under **Settings → Community plugins → Browse**, or open its
[community plugin page](https://community.obsidian.md/plugins/nosh) and choose
*Add to Obsidian*.

To install by hand, download `main.js`, `manifest.json` and `styles.css` from
the latest [release](https://github.com/brearleyjonathon/nosh/releases) into
`<vault>/.obsidian/plugins/nosh/`, then enable Nosh under
**Settings → Community plugins**.

## Try it

The **Add** button under Sample notes in settings (or the *Add sample notes*
command) writes an ingredient for every food group and three meals, with
figures rounded from USDA FoodData Central. They're ordinary notes. Running it
again won't touch ones you've edited.

## Companion skills

`skills/` holds two [Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills)
for Claude that write ingredient and meal notes in Nosh's format, so a meal you
describe in chat lands in your vault ready to log. Each `SKILL.md` explains
setup.

## Credit

Targets follow the DASH 2,000 kcal pattern and are editable in settings.
They're a starting point, not medical advice.

MIT licensed.
