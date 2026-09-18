# Nosh

An Obsidian nutrition tracker built around DASH, Dietary Approaches to Stop
Hypertension.

Nosh reads notes you already keep, adds up what you logged, and draws it against
your targets: the nine nutrients DASH is judged on, and the food-group servings
the nutrient numbers cannot express.

Nothing leaves your vault unless you ask it to.

<img width="1280" height="640" alt="social-card" src="https://github.com/user-attachments/assets/e8c896e9-895b-4724-b388-564374928c41" />


**Visit the new website:** [nosh.heath](nosh.health) 

## Disclosures

Nosh works entirely offline. The optional Nosh AI features are the only part
that talks to anything, and they are off until you give them a credential.
With them on:

- Network use. What you type into a draft, the note you are asking about, and
  any photograph you take are sent to the Anthropic API at
  `api.anthropic.com`. Nothing is sent until you press the button that asks
  for it. There is no telemetry and no other network use.
- Account and cost. Nosh AI needs an account on the Anthropic developer
  platform, and every request is billed to it at API rates. A claude.ai
  subscription cannot be used; [Credentials](#credentials) explains why.
- A local program. If you choose the `ant` CLI as the way in, Nosh runs
  `ant auth print-credentials --access-token` on your computer to borrow a
  short-lived token. Desktop only, fixed arguments, nothing else is run.
- Links to claude.ai. A meal note drafted with a method carries a *Cook this
  with Claude* link. Opening it takes the recipe to claude.ai in your browser,
  in the address of the page. Nothing happens until you click it.
- Where the credential lives. An API key is kept in plain text in `data.json`
  in the plugin folder, which is inside your vault. See
  [Credentials](#credentials).

There are no accounts with the author, no payments and no ads, and no files
are read or written outside the vault.

# UI
The project is based in the Obsidian sidebar in desktop and mobile. 

<img width="2436" height="2420" alt="nosh-dark" src="https://github.com/user-attachments/assets/a1e3d437-0cbf-4575-a326-255b705065a6" />
<img width="2436" height="2420" alt="nosh-light" src="https://github.com/user-attachments/assets/08acc345-8f96-4c5d-8aa9-c11da9945145" />

## How it decides what a note is

A note is a meal or an ingredient because its tags say so:

```yaml
tags:
  - nutrition/meal        # or nutrition/ingredient
```

The flat pair `#nutrition` + `#meal` works too, since that is what a note
written by hand tends to carry. The umbrella tag is configurable.

Folders play no part in this, so a vault that already keeps recipes somewhere
needs no rearranging. The Nosh folder setting only decides where Nosh files
new notes. It makes `Meals`, `Ingredients`, `Reports` and `Log` beneath
whatever folder you name. If you would rather it only looked there, there is
a setting for that.

## Frontmatter

Every number describes one serving of the thing the note is about.

| Field | Meaning |
|---|---|
| `calories` `protein_g` `carbs_g` `fat_g` `sat_fat_g` | the four a recipe card prints, plus saturated fat |
| `fiber_g` `sodium_mg` `potassium_mg` `calcium_mg` | the ones DASH judges you on |
| `serv_grains` `serv_vegetables` `serv_fruit` `serv_dairy` | DASH food-group servings |
| `serv_meat` `serv_fats` `serv_nuts` `serv_legumes` `serv_sweets` | and the rest of them |
| `amount` | the portion the numbers describe, such as "1 cup" or "1 medium" |
| `meal_type` | when it is usually eaten. A hint, since the occasion is chosen when you log |
| `group` | override the food group an ingredient files under |

A note needs only some of these. Anything absent counts as zero.

Ingredients are grouped in the picker by the food group they contribute most
to, so banana sits under Fruit and farro under Grains. That is worked out from
the servings the note already carries, so there is nothing to maintain, and it
works on notes written long before you installed this.

## Logging

The picker is organised by occasion: breakfast, lunch, dinner, snacks and
drinks, dessert. Pick when you are eating, then what.

The occasion belongs to the eating rather than to the note. A banana is
breakfast on Tuesday and dessert on Friday, and its note never has to choose.

Most breakfasts are the same breakfast, so each occasion's list starts with
what it has held lately. Recent is a section like the food groups, folded the
same way: the foods logged in that occasion over the past month, the most
recently eaten first, up to eight. While the occasion on screen is still
empty, a button above the list offers to copy the last time (*Copy
yesterday's breakfast*, or *Copy Tuesday's*), with what that would bring
listed under it. One press adds every serving of it. Foods whose notes have
gone since are left out.

Within an occasion you can tick an existing meal, tick ingredients one at a
time, or Build a meal out of ingredients. A build can be logged as it is,
with its ingredients recorded separately, which is what a one-off is. Or it
can be named and saved as a meal note you can reach for again.

The ticked-list button beside the filter narrows the list to what is already
ticked, in the occasion or in the meal being built, for going back over a
meal. The filter box still searches within it. A row unticked there stays on
screen until you switch the button off or move to another day, occasion or
tab, so a slip of the thumb can be put right.

A saved meal records what it is made of:

```yaml
components:
  - note: "[[Oatmeal]]"
    servings: 1
  - note: "[[Almond Milk]]"
    servings: 0.5
```

Its totals are recomputed from those parts every time the vault is read, so
correcting one ingredient corrects every meal built on it, and every day those
meals were eaten. The totals are written into frontmatter as well, so the note
still means something to Dataview, to a reader and to anyone you share it
with.

### The day's log

What you logged lives in the plugin's own store, which is what keeps the
views quick. It is also written out, a note a day, into a `Log` folder beside
Meals, Ingredients and Reports:

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

with the same list, readable, underneath. `Nosh log 2026-09-17` is the
record and the store is the cache. A search, a backlink or a backup of your
notes all see it, and an ingredient note knows the days it was eaten. Edit
the frontmatter and the day follows. A note arriving from another device is
read the same way. Delete the note and the day is cleared.

A day emptied in the picker takes its note with it, unless you wrote
something of your own in there. The list sits between two markers, and
anything outside them is yours and survives every rewrite. Turning the notes
on over a log kept before they existed writes one for every day that has
anything in it. There is a setting to turn them off.

The tag is what makes it a log note. Move one into a journal folder and it is
still the day, read and rewritten there, so long as it keeps `nutrition/log`
and its name. That also means the notes answer to the tools the rest of your
vault uses. With Dataview installed, every day a banana was eaten is one
query:

```dataview
TABLE log
FROM #nutrition/log
WHERE contains(string(log), "Banana")
SORT file.name DESC
```

## The score

Under the meal count sits a composite score out of 100, drawn as a ring, for
the span on screen: the day's in Day view, the week's in Week, the month's in
Month. Today and the week are never blended. *Am I on track right now* and
*did the pattern hold* are different questions, and the tab is how you ask
one rather than the other. The heading folds it away like the bars.

The ring is the number, wound clockwise from twelve o'clock with the number
itself in the hole: a day at 73 is an arc not quite three-quarters round.
Beside it stands the name of the span and the one thing worth saying about
it. The ring is coloured as the number is and no finer, because the bars
below already say which way each thing went.

Each is the weighted average of how far every bar you have showing is from
its target. A floor pays out in proportion to how much of the minimum is
there. A ceiling pays in full up to the maximum and then loses it at the same
rate, reaching nothing at double. A range does both. Every bar weighs 1 until
you say otherwise, which is the plain average the published DASH accordance
scores use. Each row in settings has a weight beside its shape, and 2 counts
double, 0.5 half. Carbs stay out by default, being for reference, and
calories only count when over: eating less is not something DASH rewards.
Hidden bars are out too.

Today is judged on pace. While the day's calories are still coming in, a
floor is measured against the share of its minimum that the calories so far
call for: a third of the calories in, a third of the fibre expected. So the
day starts at 100 and moves with each meal, the right things holding it there
and the wrong things pulling it down, and once the calories are in it reads
exactly as a finished day does. Every other day is settled and judged on the
whole. Ceilings are never paced, because a ceiling is a budget and spending
some of it at breakfast is not a breach.

The week is judged bar by bar over the days that have anything logged, so a
day you did not log is missing rather than a zero, with the weekly groups read
against the week. The line beside the ring names the three bars costing most
already, or says how far through the day's calories you are while they are
still coming in; tap it for what each of those bars paid. The Month tab
scores the month the same way, over its per-day bars alone.

### The arithmetic

Every bar in play gets a **credit** between 0 and 1, from its value `v` and
its own shape. Every bar takes whatever shape the settings gave it. A nutrient
is a **floor**, a **ceiling** or a **reference** (reference bars are drawn
grey and never judged) and defaults to what DASH intends: protein, fibre,
potassium and calcium floors; calories, fat, saturated fat and sodium
ceilings; carbs a reference. A food group is a floor, a **range** or a
ceiling. Both can be changed per bar in settings, and the score, the bar
colours and the prompts all follow.

```
floor    (minimum m)              credit = min(1, v / m)
ceiling  (maximum M)              credit = 1                    while v ≤ M
                                          = max(0, 1 − (v − M) / M)  past it
range    (m … M)                  the floor rule below m, the ceiling rule
                                  above M, 1 in between
today    (pace p = min(1, kcal so far / kcal target))
                                  m becomes m × p for every floor and range
```

So half the fibre is half a credit, sodium at 3,450 against 2,300 is half a
credit, and anything at double its ceiling is none. The exceptions:

- Reference bars are never scored. Carbs is one unless you say otherwise.
- Calories are, by default, a ceiling that is absent while you are under it.
  It joins the average only when `v > target`, and then loses credit like any
  ceiling. Made a floor, it is scored like any other floor.
- Fats & oils, like lean meat and sweets, is a ceiling by default: under its
  minimum costs nothing, since staying low is the point.
- Hidden bars are out, and so is any bar whose target is 0.
- Weekly groups are not in a day's score; they are judged in the week's.
- Today is on pace, as above: every floor's and range's minimum is scaled by
  the share of the calorie target eaten so far, in the Day tab and inside the
  week and month averages alike. A day with a third of its calories and a
  third of its fibre is whole on fibre. Once the calories are in, or on any
  other day, the minimum is the minimum.

The **score** is the weighted mean credit over the bars in play, times 100,
rounded, and never below 0. Each bar's weight is the one beside it in
settings, 1 unless changed, so a bar at 2 costs twice what it would at 1.

The report carries two more figures. Each floor and range also reports
**reach**, which is its credit while short and 1 once the minimum is met.
Each ceiling and range reports **excess**, which is `1 − credit` while over
and 0 otherwise. The report gives the *weighted mean* reach across the things
to reach and the *maximum* excess across the things that can be overdone. It
takes the worst excess rather than the average because an average would let
two clean limits hide a third at double. The three bars "costing most" are
ranked by weight times what they lost.

For the week, each per-day bar's credit, reach and excess are averaged
across the days with anything logged, then the weekly groups are scored once
against the week's totals and their targets, and the score, reach and excess
are taken over that combined set exactly as for a day. A week with no logged
days has no score.

Colour follows the number and nothing finer: green at 90 and above, amber
from 70, plain below.

## The month

The Month tab is a calendar: a row a week, a square a day. Each square holds
the nutrient bars as lines a couple of pixels tall, too small to label and
not meant to be. The picture is the colour, week by week: which days went
green, which went red, which have nothing on them at all. Any square opens
its day.

## Reports

Export what is on screen, a day, a week or a month, as a markdown note with
the totals and the bars and the day-by-day detail behind them.

Between the two sits a By food table: a row for each food eaten, a column
for each nutrient, the largest figure in every column in bold. Read the sodium
column down and it lands on the thing that brought it. A food eaten twice is
one row with its servings added up, since the question is about the food and
not the sitting.

A month is not a long week, and its report is shaped differently. A month's
totals are totals against no target, and a day nobody logged is missing
rather than empty, so every figure is an average over the days that were
logged, read against the daily target. A weekly group is given as servings in
seven logged days, so it still reads against its weekly target however patchy
the logging was. What a month can say that a week cannot is which way things
are going, so it carries two tables of its own:

- Against last month: the score, the days logged, and every nutrient and
  food group, this month beside the one before, with the change. Left out when
  the month before has nothing in it.
- By week: each week of the month with its days logged, calories a day,
  score and weekly groups, so the month can be read from the inside. They are
  whole weeks, scored as the Week tab scores them, so the first and last may
  reach into the months either side.

By day is a row a day, with entries, score and every nutrient, rather than a
list of what was eaten; the day's own report has that. A month still under
way stops at today, which is marked as unfinished.

There is one report per day, week or month (`Nosh 2026-09`). Exporting the
same span again rewrites that note in place, so anything typed into it by hand
is replaced along with the numbers.

## Nosh AI (optional)

Off unless you give it credentials. Four things use it:

- **Drafting**. Describe something in plain words and get a note with the
  numbers estimated and the portion stated. Or photograph it: the camera
  button beside Draft takes a nutrition label, which is read rather than
  guessed at, or a plate of food, which is estimated and says what it assumed
  about the portion. On a phone that is the camera or the photo roll. The
  picture is shown back for a moment with room to say what it is and how much
  of it you ate (*half of it*, *the one on the left*, *two of these*), and
  then shrunk and sent to the API with those words. Left blank, a label is
  read as the serving it prints and a plate as what is on it.
  The draft comes back as a card listing every ingredient with its portion,
  and the portions are yours to correct. It was your plate, and a portion is
  where an estimate goes wrong. Change one and the nutrients and DASH servings
  below are recomputed from the parts. The numbers themselves are read-only
  for the same reason: they belong to the ingredients rather than to the
  note.
- **What's for…**. Takes what the day still has room for and suggests a meal
  that fits, with a method. It knows which meals are still to come: a
  breakfast is asked to take about a quarter of what is outstanding and leave
  the rest for lunch and dinner, while a dinner with both already logged is
  asked to close what one meal sensibly can and stay inside what is left. A
  limit already passed is said as such, so the meal can keep out of its way.
  Before it runs it asks how many you are cooking for, how much of a
  production it should be, and what needs using up.
- **Ask about this recipe**. Open a recipe and interrogate it: what the
  sodium rides on, what would make it go further, what to serve alongside.
  Command palette, or right-click the note.
- **Readings**. An optional section on an exported report. A day or a week is
  read for what its days show and what to watch. A month is read for
  progress, meaning what moved against last month and whether the weeks were
  getting better or worse, and for ways to improve, ranked by what costs the
  score most and each naming a food out of the log. The report's own tables
  are what is sent, and nothing else.

Asking works on any note that reads as a recipe, including ones Nosh did not
write: an ingredients list, a method, or the frontmatter numbers is enough.
The note goes over as written and its own figures are used rather than
re-estimated; anything Claude has to supply itself is marked as an estimate.
It is a conversation, so you can keep pushing, and Save to note appends the
exchange to the bottom of the note if it was worth keeping.

Two models can be set separately. Estimating a meal runs once a mouthful and
wants something cheap; inventing one runs once a day and is the harder job.

### Credentials

Nosh AI runs against the Anthropic developer platform, the same place an
API key comes from, and every request is billed to that account. Two ways
to hand it a credential:

- An API key, from [platform.claude.com](https://platform.claude.com),
  stored in `data.json` inside your vault. Works everywhere, phone included,
  and is the way in for most people.
- The `ant` CLI (desktop only) reads a profile you have already logged into
  with `ant auth login`. That login is to the developer platform rather than
  to claude.ai. The credential never touches the vault. Prefer this where you
  can.

> On the API key: `data.json` is a plain file in your vault. Anything that
> reads your vault can read it, including other plugins, whatever you sync
> with, and any repository you commit the vault to. Do not commit it, and
> prefer the `ant` profile on a machine that has one. This repository ignores
> `data.json` for exactly that reason.

Why there is no "sign in with Claude": some plugins borrow the login that
Claude Code or the Claude app keeps on your machine, so a Pro or Max
subscription pays for the requests. Anthropic's consumer terms allow that
login only in Claude Code and claude.ai, and using it anywhere else is a
breach that Anthropic blocks. Nosh does not do it, and will not. The same
goes for OpenAI: *Sign in with ChatGPT* is an identity service and does not
carry a plan's model access into other apps. Until either company offers a
sanctioned way for a plugin to use a subscription, an API key is the honest
path, and it is what every reviewed Obsidian AI plugin uses.

## Install

Nosh is not yet in the community plugin list. Until it is:

- With BRAT. Install the *Beta Reviewers Auto-update Tool* from the
  community list, choose *Add a beta plugin*, and give it
  `brearleyjonathon/nosh`. BRAT installs the latest release and keeps it
  updated.
- By hand. Download `main.js`, `manifest.json` and `styles.css` from the
  latest [release](https://github.com/brearleyjonathon/nosh/releases), put
  them in `<vault>/.obsidian/plugins/nosh/`, and enable Nosh under
  **Settings → Community plugins**.

## Try it

A vault with nothing tagged shows an empty picker. The **Add** button under
Sample notes in settings, or the *Add sample notes* command, writes an
ingredient in every food group and three meals built from them into the Nosh
folder, enough to log a day with and to see what a note looks like. The
figures are rounded from USDA FoodData Central for the amount each note
states, and each note says so. They are ordinary notes once written: keep
them, correct them or delete them like any other. Running it again adds
nothing, and a sample you have corrected is left as you left it.

## Companion skills

Nosh reads notes; it does not mind who wrote them. The `skills/` folder holds
two [Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills)
for Claude, one that writes an ingredient note and one that writes a meal
note, each in exactly the frontmatter Nosh reads. A meal described to Claude
in a chat then lands in the vault as something the picker can log. Each
skill's `SKILL.md` says how to install it and what to tell it about your
vault.

## Credit

The nutrient targets and food-group patterns follow the DASH 2,000 kcal
reference pattern. They are editable in settings. The defaults are a starting
point and not medical advice.

MIT licensed.
