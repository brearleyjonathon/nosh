---
name: nosh-ingredient
description: Write an Obsidian note for a single ingredient, with nutrition and DASH food-group servings for one stated portion in YAML frontmatter, in the exact shape the Nosh plugin reads. Use whenever someone names a food they want in their Nosh vault - "add almond milk", "make a note for a banana", "I need chicken breast as an ingredient", or an ingredient that is missing when a meal is being built. One ingredient per note; a meal made of several is the nosh-meal skill.
---

# Nosh ingredient note

One note per ingredient, carrying the numbers for **one portion** of it. The
Nosh plugin's picker lists these notes, and logging them - how many servings,
on which day, at which meal - happens in the plugin, not in the note. Never
write a note about a particular day's eating.

## Where the note goes

Nosh files ingredients under `<Nosh folder>/Ingredients/`. The folder is a
plugin setting; its default is `Nosh`, so the default path is
`Nosh/Ingredients/`. Ask once where the vault keeps them if it is not
already known, and remember the answer for the rest of the conversation.

The filename is the ingredient's plain name - `Chicken Breast.md`,
`Olive Oil.md`. Short, human, no slashes or colons. If a note with that name
already exists, say so and ask before overwriting.

Deliver the note by whichever of these is available, in order:

1. **A direct file write**, if the vault is on a filesystem you can reach.
2. **A raw markdown code block** for the user to paste into Obsidian - the
   whole note in one fenced block, frontmatter included, nothing after it.

Never claim a note was saved when it was only printed.

## Frontmatter

Every numeric field must be present and spelled exactly. A field that is
missing or misspelled reads as zero, and zero looks like a real answer.

```yaml
---
date: "260910"          # today as YYMMDD, quoted so a leading zero survives
amount: 1 cup           # the portion the numbers below describe
meal_type: Snack        # Breakfast | Lunch | Dinner | Snack | Dessert - a hint for the picker
calories: 30
protein_g: 1
carbs_g: 1
fat_g: 2.5
sat_fat_g: 0
fiber_g: 1
sodium_mg: 140
potassium_mg: 160
calcium_mg: 450
serv_grains: 0
serv_vegetables: 0
serv_fruit: 0
serv_dairy: 1
serv_meat: 0
serv_fats: 0
serv_nuts: 0
serv_legumes: 0
serv_sweets: 0
tags:
  - nutrition/ingredient
---
```

- `amount` is the portion the numbers describe - "1 cup", "1 medium",
  "1 tbsp". Measure by volume in half-cup steps where a cup makes sense, and
  reach for another unit only where it does not: 1 medium banana, 1 large
  egg, 1 slice, 1 tbsp of oil. If no portion was given, use a common one and
  mark it: `1 cup (portion assumed, not stated)`.
- `meal_type` is where the food usually sits, not where it was eaten today.
  Drinks and things snacked on are `Snack` unless they clearly belong to a
  meal.
- `nutrition/ingredient` is the tag Nosh looks for. If the vault's Nosh
  settings use a different umbrella tag than `nutrition`, use that instead.
- `group:` may be added to override the food group the picker files the note
  under, using a label such as `Fruit` or `Fats & oils`. Nosh otherwise picks
  the group with the most servings, which is right nearly always.
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
- A supplement scores the nutrients it really delivers and no servings at
  all. A dressing, sauce or spread scores the fat and sodium it carries and
  nothing it does not.
- A food spanning groups is split across them, not counted at full value in
  each.

## Note body

```markdown
# Silk Almond Milk

**Amount:** 1 cup (portion assumed, not stated)

## Macros

| Metric | Amount |
|---|---|
| Calories | 30 kcal |
| Protein | 1 g |
| Carbs | 1 g |
| Fat | 2.5 g |
| Saturated fat | 0 g |
| Fiber | 1 g |
| Sodium | 140 mg |
| Potassium | 160 mg |
| Calcium | 450 mg |

## DASH

Low-fat dairy, 1 serving

A sentence or two on what drives the numbers, or what had to be assumed.
```

List only the groups with a non-zero count under DASH; if there are none,
write `No food-group servings.`

## Rules

- Estimate from standard reference data, USDA where you have it, for the
  whole portion named in `amount`, not per 100 g.
- State assumptions inline - raw or cooked, brand, bone-in - wherever they
  move the numbers.
- The figures are estimates. Say so once, plainly, and give no medical
  advice about blood pressure.
