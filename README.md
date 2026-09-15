# Nosh

An Obsidian nutrition tracker oriented toward DASH — Dietary Approaches to Stop
Hypertension.

Nosh reads notes you already keep, adds up what you logged, and draws it against
your targets: the nine nutrients DASH is judged on, and the food-group servings
the nutrient numbers cannot express.

Nothing leaves your vault unless you ask it to.

## How it decides what a note is

**Tags, not folders.** A note is a meal or an ingredient because it says so:

```yaml
tags:
  - nutrition/meal        # or nutrition/ingredient
```

The flat pair `#nutrition` + `#meal` works too, since that is what a note
written by hand tends to carry. The umbrella tag is configurable.

This means a vault that already keeps recipes somewhere needs no rearranging.
The **Nosh folder** setting only decides where Nosh *files new notes* — it makes
`Meals`, `Ingredients` and `Reports` beneath whatever folder you name. If you
would rather it only looked there, there is a setting for that.

## Frontmatter

Every number describes **one serving** of the thing the note is about.

| Field | Meaning |
|---|---|
| `calories` `protein_g` `carbs_g` `fat_g` `sat_fat_g` | the four a recipe card prints, plus saturated fat |
| `fiber_g` `sodium_mg` `potassium_mg` `calcium_mg` | the ones DASH actually judges you on |
| `serv_grains` `serv_vegetables` `serv_fruit` `serv_dairy` | DASH food-group servings |
| `serv_meat` `serv_fats` `serv_nuts` `serv_legumes` `serv_sweets` | …and the rest |
| `amount` | the portion the numbers describe — "1 cup", "1 medium" |
| `meal_type` | when it is usually eaten. A hint, not a filing system |
| `group` | override the food group an ingredient files under |

A note needs only some of these. Anything absent counts as zero.

Ingredients are grouped in the picker by **the food group they contribute most
to** — banana under Fruit, farro under Grains — worked out from the servings the
note already carries. Nothing to maintain, and it works on notes written long
before you installed this.

## Logging

The picker is organised by occasion: breakfast, lunch, dinner, snacks and
drinks, dessert. Pick when you are eating, then what.

**The occasion belongs to the eating, not to the note.** A banana is breakfast
on Tuesday and dessert on Friday, and its note never has to choose.

Within an occasion you can tick an existing meal, tick ingredients one at a
time, or **Build** a meal out of ingredients. A build can be logged as it is —
its ingredients are recorded separately, which is what a one-off actually is —
or named and saved as a meal note you can reach for again.

A saved meal records what it is made of:

```yaml
components:
  - note: "[[Oatmeal]]"
    servings: 1
  - note: "[[Almond Milk]]"
    servings: 0.5
```

Its totals are recomputed from those parts every time the vault is read, so
correcting one ingredient corrects every meal built on it — and every day those
meals were eaten. The totals are written into frontmatter as well, so the note
still means something to Dataview, to a reader, and to anyone you share it with.

## The score

Under the meal count sits a **composite score** out of 100, with a bar, for
the span on screen: the day's in Day view, the week's in Week, the month's
in Month. Today and the week are never blended — *am I on track right now*
and *did the pattern hold* are different questions, and the tab is how you
ask one rather than the other. The heading folds it away like the bars.

The number sits over the middle of its bar, and both fills start there. Green
runs right as the things to reach are reached, all the way to the edge when
they all are; red runs left for the worst thing gone over — the worst rather
than the average, because an average would let two clean limits hide a third
at double. Nothing either side of the middle is a day with nothing to show
yet.

Each is the plain average of how far every bar you have showing is from its
target. A floor pays out in proportion to how much of the minimum is there; a
ceiling pays in full up to the maximum and then loses it at the same rate,
reaching nothing at double; a range does both. Every bar weighs the same, as
the published DASH accordance scores have it — if one should matter more, say
so by which bars you show. Carbs stay out, being for reference, and calories
only count when over: eating less is not something DASH rewards. Hidden bars
are out too.

The week is judged bar by bar over the days that have anything logged, so a
day you did not log is missing rather than a zero, with the weekly groups read
against the week. Tap the line for the three bars costing most. The Month
tab scores the month the same way, over its per-day bars alone.

### The arithmetic

Every bar in play gets a **credit** between 0 and 1, from its value `v` and
its own shape. Nutrients take their direction as a shape — a goal is a floor,
a limit is a ceiling — and food groups take whatever shape the settings gave
them.

```
floor    (minimum m)              credit = min(1, v / m)
ceiling  (maximum M)              credit = 1                    while v ≤ M
                                          = max(0, 1 − (v − M) / M)  past it
range    (m … M)                  the floor rule below m, the ceiling rule
                                  above M, 1 in between
```

So half the fibre is half a credit, sodium at 3,450 against 2,300 is half a
credit, and anything at double its ceiling is none. The exceptions:

- **Carbs** are never scored; they are shown for reference.
- **Calories** are a ceiling that is absent while you are under it — it
  joins the average only when `v > target`, and then loses credit like any
  ceiling.
- **Fats & oils**, like lean meat and sweets, is a ceiling by default: under
  its minimum costs nothing, since staying low is the point.
- **Hidden bars** are out, and so is any bar whose target is 0.
- Weekly groups are not in a day's score; they are judged in the week's.

The **score** is the mean credit over the bars in play, times 100, rounded.
Every bar weighs the same.

The bar is drawn from two more figures. Each floor and range also reports
**reach** — its credit while short, 1 once the minimum is met — and each
ceiling and range reports **excess** — `1 − credit` while over, 0 otherwise.
Green is the *mean* reach across the things to reach; red is the *maximum*
excess across the things that can be overdone. Half the bar is 1.

For the **week**, each per-day bar's credit, reach and excess are averaged
across the days with anything logged, then the weekly groups are scored once
against the week's totals and their targets, and the score, green and red
are taken over that combined set exactly as for a day. A week with no logged
days has no score.

Colour follows the number and nothing finer: green at 90 and above, amber
from 70, plain below.

## The month

The Month tab is a calendar: a row a week, a square a day. Each square holds
the nutrient bars as lines a couple of pixels tall — too small to label, and
not meant to be. The picture is the colour, week by week: which days went
green, which went red, which have nothing on them at all. Any square opens
its day.

## Reports

Export what is on screen — a day or a week — as a markdown note: the totals, the
bars, and the day-by-day detail behind them.

Between the two sits a **By food** table: a row for each food eaten, a column
for each nutrient, the largest figure in every column in bold. Read the sodium
column down and it lands on the thing that brought it. A food eaten twice is
one row with its servings added up, since the question is about the food and
not the sitting.

## Nosh AI (optional)

Off unless you give it credentials. Four things use it:

- **Drafting** — describe something in plain words and get a note with the
  numbers estimated and the portion stated. Or photograph it: the camera
  button beside **Draft** takes a nutrition label, which is read rather than
  guessed at, or a plate of food, which is estimated and says what it assumed
  about the portion. On a phone that is the camera or the photo roll. The
  picture is shown back for a moment with room to say what it is and how much
  of it you ate — *half of it*, *the one on the left*, *two of these* — and
  then shrunk and sent to the API with those words. Left blank, a label is
  read as the serving it prints and a plate as what is on it.
  The draft comes back as a card listing every ingredient with its portion,
  and the portions are yours to correct — it was your plate, and a portion is
  where an estimate goes wrong. Change one and the nutrients and DASH servings
  below are recomputed from the parts. The numbers themselves are read-only
  for the same reason: they belong to the ingredients, not to the note.
- **What's for…** — takes what the day still has room for and suggests a meal
  that fits, with a method. Ask it before it runs: how many you are cooking for,
  how much of a production it should be, what needs using up.
- **Ask about this recipe** — open a recipe and interrogate it: what the sodium
  rides on, what would make it go further, what to serve alongside. Command
  palette, or right-click the note.
- **Readings** — an optional paragraph on an exported report.

Asking works on any note that reads as a recipe, not only the ones Nosh wrote:
an ingredients list, a method, or the frontmatter numbers is enough. The note
goes over as written and its own figures are used rather than re-estimated;
anything Claude has to supply itself is marked as an estimate. It is a
conversation, so you can keep pushing, and **Save to note** appends the
exchange to the bottom of the note if it was worth keeping.

Two models can be set separately. Estimating a meal runs once a mouthful and
wants something cheap; inventing one runs once a day and is the harder job.

### Credentials

Two ways in:

- **The `ant` CLI** (desktop only) reads a profile you have already logged into.
  The credential never touches the vault. Prefer this where you can.
- **An API key**, stored in `data.json` inside your vault.

> **On the API key.** `data.json` is a plain file in your vault. Anything that
> reads your vault can read it — other plugins, whatever you sync with, and any
> repository you commit the vault to. Do not commit it, and prefer the `ant`
> profile on a machine that has one. This repository ignores `data.json` for
> exactly that reason.

## Install

Not yet in the community plugin list. To install by hand, put `main.js`,
`manifest.json` and `styles.css` in `<vault>/.obsidian/plugins/nosh/` and
enable it in **Settings → Community plugins**.

## Credit

The nutrient targets and food-group patterns follow the DASH 2,000 kcal
reference pattern. They are editable in settings; the defaults are a starting
point and not medical advice.

MIT licensed.
