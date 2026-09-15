---
name: nosh-meal
description: Write an Obsidian note for a dish, with nutrition and DASH food-group servings for one portion in YAML frontmatter, in the exact shape the Nosh plugin reads. Use whenever someone describes a meal or recipe they want in their Nosh vault - "add my oatmeal with berries", "make a note for this recipe", "log this as a meal" - or asks for something to cook that fits their DASH targets. If the parts already exist as ingredient notes, the meal is built from them; otherwise each ingredient is estimated and the meal is their sum.
---

# Nosh meal note

One note per dish, carrying the numbers for **one portion** of it. The Nosh
plugin's picker lists these notes, and logging them - how many servings, on
which day, at which meal - happens in the plugin. Never write a note about a
particular day's eating.

## Where the note goes

Nosh files meals under `<Nosh folder>/Meals/`. The folder is a plugin
setting; its default is `Nosh`, so the default path is `Nosh/Meals/`. Ask
once where the vault keeps them if it is not already known, and remember the
answer for the rest of the conversation.

Name the file after the dish - `Spinach Farro Salad.md` - short and human,
no slashes or colons. The full title goes in the H1. If a note with that name
already exists, say so and ask before overwriting.

Deliver the note by whichever of these is available, in order:

1. **A direct file write**, if the vault is on a filesystem you can reach.
2. **A raw markdown code block** for the user to paste into Obsidian - the
   whole note in one fenced block, frontmatter included, nothing after it.

Never claim a note was saved when it was only printed.

## Two kinds of meal note

**Built from ingredient notes.** When the parts already exist in the vault
as `nutrition/ingredient` notes, name them in `components` and write their
sum. Nosh recomputes the totals from the parts every time it reads the vault,
so correcting an ingredient corrects every meal built on it; the written
totals are for Dataview and for people.

```yaml
components:
  - note: "[[Oatmeal]]"
    servings: 1
  - note: "[[Almond Milk]]"
    servings: 0.5
```

`servings` is how many of that ingredient note's portion go into one portion
of the meal. Do not invent ingredient notes: if a part is missing, say so and
offer to write it with the nosh-ingredient skill first.

**Estimated whole.** When the parts are not in the vault, break the dish into
its ingredients, estimate each for its own portion, and write the sums.
Omit `components`. List each part with its portion under Ingredients so the
estimate can be argued with.

## Frontmatter

Every numeric field must be present and spelled exactly. A field that is
missing or misspelled reads as zero, and zero looks like a real answer.

```yaml
---
date: "260910"          # today as YYMMDD, quoted so a leading zero survives
meal_type: Breakfast    # Breakfast | Lunch | Dinner | Snack | Dessert
serves: 4               # only with a method, and only when it makes more than one portion
components:             # only when built from ingredient notes; see above
  - note: "[[Oatmeal]]"
    servings: 1
calories: 559
protein_g: 23
carbs_g: 76
fat_g: 22
sat_fat_g: 2
fiber_g: 11
sodium_mg: 57
potassium_mg: 977
calcium_mg: 238
serv_grains: 2
serv_vegetables: 0
serv_fruit: 2
serv_dairy: 0.5
serv_meat: 0
serv_fats: 0
serv_nuts: 0.7
serv_legumes: 0
serv_sweets: 0
tags:
  - nutrition/meal
---
```

- The numbers are for **one portion as eaten**, whatever `serves` says.
  `serves` describes the method only.
- `nutrition/meal` is the tag Nosh looks for. If the vault's Nosh settings
  use a different umbrella tag than `nutrition`, use that instead.
- Numbers are unquoted. Halves and one decimal are fine.

## DASH serving sizes

Count with these definitions, not by feel. Oil is the usual surprise.

| Group | Field | One serving |
|---|---|---|
| Grains | `serv_grains` | 1 slice bread · 1 oz dry cereal · ½ cup cooked rice, pasta or oats |
| Vegetables | `serv_vegetables` | 1 cup raw leafy · ½ cup cut-up raw or cooked · ½ cup vegetable juice |
| Fruit | `serv_fruit` | 1 medium fruit · ¼ cup dried · ½ cup fresh, frozen or canned · ½ cup juice |
| Low-fat dairy | `serv_dairy` | 1 cup milk or yogurt · 1½ oz cheese |
| Lean meat/fish | `serv_meat` | 1 oz cooked meat, poultry or fish · 1 egg |
| Fats & oils | `serv_fats` | 1 tsp oil or soft margarine · 1 tbsp mayonnaise · 2 tbsp salad dressing |
| Nuts & seeds | `serv_nuts` | ⅓ cup or 1½ oz nuts · 2 tbsp seeds or nut butter |
| Legumes | `serv_legumes` | ½ cup cooked beans, lentils, peas or chickpeas · ½ cup tofu |
| Sweets | `serv_sweets` | 1 tbsp sugar, jam or jelly · ½ cup sorbet · 1 cup lemonade |

Judgement calls, applied the same way every time:

- **Oil counts hard.** 1 tbsp of oil is 3 servings. Do not soften it.
- Plant milks are not DASH dairy; they count 0 there.
- Aromatics used in quantity count as vegetables; a clove of garlic or a
  sprig of herbs counts 0.
- Nuts belong in `serv_nuts`, not `serv_fats`. Nuts and legumes are separate
  and nothing scores both: beans, lentils, dried peas, chickpeas, soy and
  tofu are legumes; peanuts and peanut butter go with the nuts.
- Tomato is a vegetable here.
- A food spanning groups is split across them, not counted at full value in
  each.

## Daily targets, for the commentary

The DASH 2,000 kcal reference pattern at 2,300 mg sodium: 90 g protein ·
275 g carbs · 60 g fat · 13 g saturated fat · 30 g fiber · 2,300 mg sodium ·
4,700 mg potassium · 1,250 mg calcium. Servings a day: grains 6–8 ·
vegetables 4–5 · fruit 4–5 · dairy 2–3 · lean meat up to 6 · fats & oils
2–3. A week: nuts & seeds 4–5 · legumes 4–5 · sweets up to 5. The vault's
own targets may differ; if they are known, use those.

## Note body

```markdown
# Full Dish Name

## Ingredients

- Rolled oats, 0.5 cup dry
- Blueberries, 0.5 cup (portion assumed, not stated)
- Almond milk, 0.5 cup

## Method

1. Only for a dish that has not been cooked yet. Omit for something already eaten.

## Macros

| Metric | Amount |
|---|---|
| Calories | 559 kcal |
| Protein | 23 g |
| Carbs | 76 g |
| Fat | 22 g |

## DASH Targets

| Metric | Amount | % of Daily Target |
|---|---|---|
| Saturated fat | 2 g | 15% of 13g |
| Fiber | 11 g | 37% of 30g |
| Sodium | 57 mg | 2% of 2,300mg |
| Potassium | 977 mg | 21% of 4,700mg |
| Calcium | 238 mg | 19% of 1,250mg |

## DASH

Grains, 2 servings
Fruit, 2 servings
Low-fat dairy, 0.5 servings
Nuts & seeds, 0.7 servings

One or two plain sentences on how the meal sits against DASH: what carries
the fiber or potassium, what pushes the sodium.
```

When built from ingredient notes, list the parts as wikilinks with their
servings - `- [[Almond Milk]] × 0.5 (1 cup)` - and end the note with
*Totals are the sum of the ingredients above, recalculated whenever those
notes change.*

## Rules

- State assumptions inline, in the ingredient line, wherever a portion was
  not given. Never silently invent a quantity.
- Ask about a portion only when it swings the result a lot - a cut of meat,
  a quantity of oil. Otherwise assume a normal one and say so.
- The figures are estimates from standard reference data. Say so once,
  plainly, and give no medical advice about blood pressure.
- Close with a short, honest read on the meal. Do not congratulate.
