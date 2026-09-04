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
| `serv_meat` `serv_fats` `serv_nuts` `serv_sweets` | …and the rest |
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

## Reports

Export what is on screen — a day or a week — as a markdown note: the totals, the
bars, and the day-by-day detail behind them.

## Nosh AI (optional)

Off unless you give it credentials. Four things use it:

- **Drafting** — describe something in plain words and get a note with the
  numbers estimated and the portion stated.
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
