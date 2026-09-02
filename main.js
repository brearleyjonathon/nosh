'use strict';

const { Plugin, ItemView, PluginSettingTab, Setting, Modal, Menu, Notice,
        requestUrl, setIcon, getAllTags } = require('obsidian');

const VIEW_TYPE_DASH = 'dash-tracker-view';

/*
 * dir describes how a bar should be read:
 *   'goal'  - aim to reach the target (green once you get there)
 *   'limit' - aim to stay under it   (amber near it, red past it)
 *   'range' - aim to land inside min..max (green inside, red past max)
 *   'info'  - shown for reference, no judgement
 */
const NUTRIENTS = [
    { key: 'calories',     label: 'Calories',      unit: 'kcal', dir: 'limit' },
    { key: 'protein_g',    label: 'Protein',       unit: 'g',    dir: 'goal'  },
    { key: 'carbs_g',      label: 'Carbs',         unit: 'g',    dir: 'info'  },
    { key: 'fat_g',        label: 'Fat',           unit: 'g',    dir: 'limit' },
    { key: 'sat_fat_g',    label: 'Saturated fat', unit: 'g',    dir: 'limit' },
    { key: 'fiber_g',      label: 'Fiber',         unit: 'g',    dir: 'goal'  },
    { key: 'sodium_mg',    label: 'Sodium',        unit: 'mg',   dir: 'limit' },
    { key: 'potassium_mg', label: 'Potassium',     unit: 'mg',   dir: 'goal'  },
    { key: 'calcium_mg',   label: 'Calcium',       unit: 'mg',   dir: 'goal'  },
];

/* The food-group side of DASH, which the nutrient numbers cannot express.
 * Counts are the 2,000 kcal reference pattern. */
const FOOD_GROUPS = [
    { key: 'serv_grains',     label: 'Grains',       period: 'day',  dir: 'range' },
    { key: 'serv_vegetables', label: 'Vegetables',   period: 'day',  dir: 'range', overOk: true },
    { key: 'serv_fruit',      label: 'Fruit',        period: 'day',  dir: 'range', overOk: true },
    { key: 'serv_dairy',      label: 'Low-fat dairy',period: 'day',  dir: 'range' },
    { key: 'serv_meat',       label: 'Lean meat/fish', period: 'day', dir: 'limit' },
    { key: 'serv_fats',       label: 'Fats & oils',  period: 'day',  dir: 'range' },
    { key: 'serv_nuts',       label: 'Nuts, seeds, legumes', period: 'week', dir: 'range' },
    { key: 'serv_sweets',     label: 'Sweets',       period: 'week', dir: 'limit' },
];

// DASH, 2,000 kcal reference pattern, standard 2,300 mg sodium.
const DEFAULT_TARGETS = {
    calories: 2000,
    protein_g: 90,
    carbs_g: 275,
    fat_g: 60,
    sat_fat_g: 13,
    fiber_g: 30,
    sodium_mg: 2300,
    potassium_mg: 4700,
    calcium_mg: 1250,
};

const DEFAULT_GROUP_TARGETS = {
    serv_grains:     { min: 6, max: 8 },
    serv_vegetables: { min: 4, max: 5 },
    serv_fruit:      { min: 4, max: 5 },
    serv_dairy:      { min: 2, max: 3 },
    serv_meat:       { min: 0, max: 6 },
    serv_fats:       { min: 2, max: 3 },
    serv_nuts:       { min: 4, max: 5 },
    serv_sweets:     { min: 0, max: 5 },
};

/* Nosh keeps one folder and makes these underneath it. A published plugin
 * cannot assume anything about how somebody else's vault is arranged, so the
 * default is a single folder at the root that they can move wherever. */
const SUB_MEALS = 'Meals';
const SUB_INGREDIENTS = 'Ingredients';
const SUB_REPORTS = 'Reports';

/* Bumped when the shape of `log` changes, so the migration runs once and
 * knows it has run. */
const LOG_SCHEMA = 2;

function noshFolder(settings, sub) {
    const root = String((settings && settings.noshFolder) || '')
        .trim().replace(/^\/+|\/+$/g, '');
    if (!root) return sub || '';
    return sub ? root + '/' + sub : root;
}

/* The deepest folder that contains all of them. Nosh's own three sat one
 * level under a common parent, so that parent is what the single setting
 * should become. Anything more scattered falls back to the first folder's
 * parent, which is the closest thing to what the vault already had. */
function sharedParent(folders) {
    const clean = folders
        .map((f) => String(f || '').trim().replace(/^\/+|\/+$/g, ''))
        .filter(Boolean);
    if (!clean.length) return '';

    const parts = clean.map((f) => f.split('/'));
    const shared = [];
    for (let i = 0; ; i++) {
        const seg = parts[0][i];
        if (seg === undefined || !parts.every((q) => q[i] === seg)) break;
        shared.push(seg);
    }
    if (shared.length && parts.every((q) => q.length === shared.length + 1)) {
        return shared.join('/');
    }
    if (shared.length) return shared.join('/');
    return parts[0].length > 1 ? parts[0].slice(0, -1).join('/') : clean[0];
}

function underFolder(path, folder) {
    const dir = String(folder || '').trim().replace(/\/+$/, '');
    return !!dir && (path === dir || path.startsWith(dir + '/'));
}

const DEFAULT_SETTINGS = {
    tag: 'nutrition',
    noshFolder: 'Nosh',
    /* Off by default: tags say what a note is, so a vault with recipes
     * already filed somewhere works without moving anything. On, this
     * narrows the search to the Nosh folder for people who prefer that. */
    restrictToFolder: false,
    targets: Object.assign({}, DEFAULT_TARGETS),
    groupTargets: JSON.parse(JSON.stringify(DEFAULT_GROUP_TARGETS)),
    log: {},          // { 'YYYY-MM-DD': { occasion: { notePath: servings } } }
    schema: LOG_SCHEMA,
    weekStart: 1,     // 0 = Sunday, 1 = Monday
    hiddenNutrients: [],
    hiddenGroups: [],
    aiReading: false,
    aiModel: 'claude-sonnet-5',   // must be an id in AI_MODELS
    /* Inventing a meal and costing one are different jobs, and not jobs for
     * the same model. This one runs once a day rather than once a mouthful,
     * and is the harder of the two - a dish worth cooking that also threads
     * several shortfalls through what little headroom is left - so it starts
     * on Opus. Cleared, it falls back on aiModel. */
    aiSuggestModel: 'claude-opus-5',
    aiAuth: 'ant',        // 'ant' reads the CLI profile, 'key' uses aiApiKey
    aiApiKey: '',
    aiEffort: 'medium',
    /* Free text, appended to the What's for... prompt. Nothing here is
     * validated or parsed: it is handed to Claude as written, which is the
     * point - the things that make a suggestion land are the ones a settings
     * form would never think to ask about. */
    suggestNote: '',
    /* How many the last suggestion was cooked for. A household changes size
     * far less often than it changes what it fancies, so this one is worth
     * remembering and the rest of the ask is not. */
    suggestServes: 1,
};

/* The occasions a day is made of, in the order it meets them. There used to
 * be three more - Drink, Condiment, Supplement - which were kinds of thing
 * rather than moments; once the log started carrying the occasion itself they
 * had nothing left to do, and a coffee is just something drunk at breakfast. */
const MEAL_ORDER = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert'];

const OCCASIONS = MEAL_ORDER;

/* What an occasion is called on screen, where that differs from the key it is
 * stored under. The key never changes - it is what the log is written to - so
 * renaming here cannot orphan a day's entries. */
const OCCASION_LABEL = {
    Snack: 'Snacks & drinks',
};

function occasionLabel(name) {
    return OCCASION_LABEL[name] || name || 'Unsorted';
}

/* The same occasions again, phrased to follow "What's for". The screen label
 * does not always fit the sentence. */
/* How much of a production the meal should be. Deliberately coarse: the
 * useful distinction is between something thrown together and something
 * cooked properly, not between eight ingredients and nine. */
const RECIPE_SPANS = [
    { key: 'any',      label: 'No preference', line: '' },
    { key: 'simple',   label: 'Keep it simple',
      line: 'Keep it to about five ingredients and one pan.' },
    { key: 'standard', label: 'A proper meal',
      line: 'Six to nine ingredients is about right. A little assembly is fine.' },
    { key: 'project',  label: 'Make it a project',
      line: 'Be ambitious. Take as many ingredients and steps as the dish deserves.' },
];

const OCCASION_ASK = {
    Breakfast: 'breakfast',
    Lunch: 'lunch',
    Dinner: 'dinner',
    Snack: 'a snack',
    Dessert: 'dessert',
};

/* Plain food, not clever: the point is to be recognised at a glance rather
 * than to be a puzzle. Anything not an occasion - a legacy bucket, the
 * unassigned one - gets nothing, which is itself the signal. */
/* The three that sit on the first row. The rest - snacks, puddings, and any
 * bucket left over from when the occasion lived on the note - go below. */
const OCCASION_ROW = ['Breakfast', 'Lunch', 'Dinner'];

const OCCASION_EMOJI = {
    Breakfast: '\ud83c\udf73',
    Lunch: '\ud83e\udd6a',
    Dinner: '\ud83c\udf72',
    Snack: '\ud83c\udf4e',
    Dessert: '\ud83c\udf70',
};

/* Which occasion the picker opens on. Reading the clock beats starting at
 * Breakfast every time, since food tends to get logged near when it was
 * eaten. Dessert is never guessed; it is always a deliberate choice. */
function occasionNow(now) {
    const h = now.getHours();
    if (h < 11) return 'Breakfast';
    if (h < 15) return 'Lunch';
    if (h < 17) return 'Snack';
    if (h < 21) return 'Dinner';
    return 'Snack';
}

/* The third thing the picker can be showing: not a list to tick, but a meal
 * being assembled out of ingredients. */
const BUILD_KEY = 'build';

/* A meal can be logged two ways: whole, from a note that already totals it
 * up, or piece by piece from ingredients. Which side of the picker a note
 * lands on is read off its tags. */
/* Ingredients fold by food group, which says something true about a note
 * whoever wrote it. Meals do not fold at all: a meal's meal_type only ever
 * recorded where it happened to be eaten first, and now that the log carries
 * the occasion, sectioning by it would file a chicken breast under Dinner
 * for good. Alphabetical is the honest order. */
const SOURCES = [
    { key: 'ingredients', label: 'Ingredients', noun: 'ingredient',
      kind: 'ingredient', sub: SUB_INGREDIENTS, sectioned: true },
    { key: 'meals',       label: 'Meals',       noun: 'meal',
      kind: 'meal',       sub: SUB_MEALS,       sectioned: false },
];

/* What a note IS comes from its tags; where it sits only decides where Nosh
 * files new ones. So a vault that already keeps recipes somewhere needs no
 * rearranging to work here.
 *
 * Canonical is the nested #nutrition/meal - one tag doing both jobs, and
 * namespaced, since #meal and #ingredient are ordinary enough words to mean
 * something else in somebody's vault already. The flat pair #nutrition +
 * #meal reads identically, because that is what a note written by hand tends
 * to reach for.
 *
 * Returns 'meal', 'ingredient', 'any' for a note that is tagged but does not
 * say which, or '' for one that is not ours at all. */
const KIND_WORDS = [
    { kind: 'meal',       words: ['meal', 'meals'] },
    { kind: 'ingredient', words: ['ingredient', 'ingredients'] },
];

function noteKind(tags, wanted) {
    const all = tags.map((t) => t.replace(/^#/, '').toLowerCase());
    const root = String(wanted || '').replace(/^#/, '').toLowerCase();

    if (root) {
        for (const k of KIND_WORDS) {
            if (all.some((t) => k.words.some((w) => t === root + '/' + w))) return k.kind;
        }
        /* An exact #nutrition counts, and so does anything nested under it,
         * which is what makes #nutrition/meal satisfy the umbrella on its own. */
        if (!all.some((t) => t === root || t.startsWith(root + '/'))) return '';
    }
    for (const k of KIND_WORDS) {
        if (all.some((t) => k.words.includes(t))) return k.kind;
    }
    return 'any';
}

/* An ingredient's section is the food group it contributes most to, worked out
 * from servings the note already carries rather than from a field somebody has
 * to maintain. Banana files under Fruit, farro under Grains, olive oil under
 * Fats & oils - and it works on notes written long before this plugin existed.
 *
 * `group:` in frontmatter overrides it for the cases the arithmetic gets
 * wrong. Things that score no group at all - coffee, salt, a multivitamin -
 * gather under Other, which is the honest answer: they are not food groups,
 * and inventing sections for them only spread the list thinner. */
const GROUP_OTHER = 'Other';

const GROUP_ORDER = FOOD_GROUPS.map((g) => g.label).concat([GROUP_OTHER]);

function foodGroupOf(fm, values) {
    const said = typeof fm.group === 'string' ? fm.group.trim() : '';
    if (said) {
        const hit = FOOD_GROUPS.find((g) =>
            g.label.toLowerCase() === said.toLowerCase() ||
            g.key.toLowerCase() === said.toLowerCase());
        return hit ? hit.label : said;
    }

    let best = null;
    for (const g of FOOD_GROUPS) {
        const v = parseNum(values[g.key]);
        if (v > 0 && (!best || v > best.value)) best = { value: v, label: g.label };
    }
    return best ? best.label : GROUP_OTHER;
}

/* Meals name their slot in frontmatter; ingredients carry it as a tag
 * alongside #nutrition. Take either, and answer in the canonical casing so
 * the sections line up. */
function mealTypeOf(fm, tags) {
    const raw = typeof fm.meal_type === 'string' ? fm.meal_type.trim() : '';
    if (raw) {
        const hit = MEAL_ORDER.find((m) => m.toLowerCase() === raw.toLowerCase());
        return hit || raw;
    }
    for (const t of tags) {
        const leaf = t.replace(/^#/, '').split('/').pop().toLowerCase();
        const hit = MEAL_ORDER.find((m) => m.toLowerCase() === leaf);
        if (hit) return hit;
    }
    return '';
}

/* --- the log ---------------------------------------------------------
 *
 *   { 'YYYY-MM-DD': { occasion: { notePath: servings } } }
 *
 * The occasion belongs to the eating, not to the note. A banana is breakfast
 * on Tuesday and dessert on Friday, and the note should not have to pick one
 * and be wrong half the time - which is also what frees an ingredient note to
 * be filed by what it is rather than by when it was first eaten.
 *
 * '' is an entry logged without an occasion. */
const NO_OCCASION = '';

function logRows(log, iso) {
    const day = (log || {})[iso] || {};
    const out = [];
    for (const occasion of Object.keys(day)) {
        const bucket = day[occasion] || {};
        for (const path of Object.keys(bucket)) {
            const servings = parseNum(bucket[path]);
            if (servings > 0) out.push({ occasion, path, servings });
        }
    }
    return out;
}

function logSet(log, iso, occasion, path, servings) {
    if (!log[iso]) log[iso] = {};
    if (!log[iso][occasion]) log[iso][occasion] = {};
    const bucket = log[iso][occasion];
    if (servings > 0) bucket[path] = roundServings(servings);
    else delete bucket[path];

    if (!Object.keys(bucket).length) delete log[iso][occasion];
    if (!Object.keys(log[iso]).length) delete log[iso];
}

/* v1 held { path: servings } with no occasion anywhere. Everything lands in
 * the unassigned bucket; assignOccasions() sorts it out later, once the
 * metadata cache is warm enough to say what each note was. */
function migrateLog(saved) {
    const out = {};
    for (const iso of Object.keys(saved || {})) {
        const day = saved[iso] || {};
        const flat = {};
        let any = false;

        out[iso] = {};
        for (const key of Object.keys(day)) {
            if (day[key] && typeof day[key] === 'object') out[iso][key] = day[key];
            else if (typeof day[key] === 'number') { flat[key] = day[key]; any = true; }
        }
        if (any) {
            out[iso][NO_OCCASION] = Object.assign(
                {}, out[iso][NO_OCCASION] || {}, flat);
        }
        if (!Object.keys(out[iso]).length) delete out[iso];
    }
    return out;
}

/* A composed meal names what it is made of. Written as a list of objects so
 * the servings survive a round trip through Obsidian's YAML, but a bare
 * "[[Oatmeal]]" reads as one serving too, since that is what somebody adding
 * a line by hand is going to write. */
function parseComponents(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];

    for (const entry of raw) {
        let link = '';
        let servings = 1;
        if (typeof entry === 'string') {
            link = entry;
        } else if (entry && typeof entry === 'object') {
            link = String(entry.note || entry.link || entry.name || '');
            const said = entry.servings !== undefined ? entry.servings : entry.amount;
            if (said !== undefined) servings = parseNum(said);
        }

        const m = String(link).match(/\[\[([^\]|]+)/);
        const target = (m ? m[1] : String(link)).trim();
        if (target && servings > 0) out.push({ link: target, servings });
    }
    return out;
}

function parseNum(value) {
    if (typeof value === 'number') return isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const n = parseFloat(value.replace(/[^0-9.\-]/g, ''));
        return isNaN(n) ? 0 : n;
    }
    return 0;
}

function fmt(n) {
    const rounded = Math.round(n * 10) / 10;
    return rounded.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/* Servings move in quarters: half was too coarse for a recipe that makes
 * three portions, or for the third of a jar that actually went in. A quarter
 * is exact in binary, so stepping never drifts. */
const SERVING_STEP = 0.25;

function roundServings(n) {
    return Math.round(parseNum(n) / SERVING_STEP) * SERVING_STEP;
}

/* fmt() rounds to one decimal, which would print a quarter serving as 0.3.
 * Anything counting servings needs the second place. */
function fmtServings(n) {
    const rounded = Math.round(parseNum(n) * 100) / 100;
    return rounded.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/* Dates are handled as local YYYY-MM-DD strings. Building them from the
 * calendar fields rather than toISOString avoids the UTC shift that would
 * put late-evening meals on the wrong day. */
function isoOf(d) {
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
}

function dateOf(iso) {
    const p = iso.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
}

function todayIso() { return isoOf(new Date()); }

function addDays(iso, n) {
    const d = dateOf(iso);
    d.setDate(d.getDate() + n);
    return isoOf(d);
}

function weekDays(iso, weekStart) {
    const offset = (dateOf(iso).getDay() - weekStart + 7) % 7;
    const first = addDays(iso, -offset);
    const out = [];
    for (let i = 0; i < 7; i++) out.push(addDays(first, i));
    return out;
}

function humanDay(iso) {
    return dateOf(iso).toLocaleDateString(undefined,
        { weekday: 'short', day: 'numeric', month: 'short' });
}

function humanWeek(days) {
    const a = dateOf(days[0]);
    const b = dateOf(days[6]);
    const sameMonth = a.getMonth() === b.getMonth();
    const left = a.toLocaleDateString(undefined,
        sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
    const right = b.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    return left + ' – ' + right;
}

/* Nosh AI ------------------------------------------------------------
 *
 * A plain description of something eaten, turned into the same frontmatter
 * the picker already reads. The tool schema is built out of NUTRIENTS and
 * FOOD_GROUPS, so it cannot drift from what collectNotes() looks for.
 */

const AI_ENDPOINT = 'https://api.anthropic.com/v1/messages';

/* Both take the same request shape - adaptive thinking, an effort level - so
 * choosing between them is a settings dropdown and nothing more. The first is
 * the default for the numbers; suggestions start on the second. Keep both in
 * step with DEFAULT_SETTINGS.aiModel and .aiSuggestModel. */
const AI_MODELS = [
    { id: 'claude-sonnet-5', label: 'Sonnet 5' },
    { id: 'claude-opus-5',   label: 'Opus 5' },
];

/* A stored id that is no longer offered - a hand-edited data.json, or a model
 * dropped from the list - falls back here rather than 404ing at the API. */
function aiModelId(settings, key) {
    const want = String((settings && settings[key || 'aiModel']) || '').trim();
    if (AI_MODELS.some((m) => m.id === want)) return want;

    /* A model that was never chosen - or one dropped from the list - falls
     * back on the drafting model before the shipped default, so an install
     * that predates the second setting behaves exactly as it did. */
    const base = String((settings && settings.aiModel) || '').trim();
    return AI_MODELS.some((m) => m.id === base) ? base : AI_MODELS[0].id;
}

/* Portions are here to be pictured against a measuring cup, not weighed, so
 * anything Claude has to supply itself lands on a half-cup step. Foods a cup
 * cannot sensibly describe keep their own unit. */
const AI_PORTIONS = [
    '- Portions exist to be pictured, so measure by volume in half-cup steps:',
    '  0.5 cup, 1 cup, 1.5 cups. Round to the nearest half cup rather than',
    '  reporting 0.4 or 0.7 of one.',
    '- Reach for another unit only where a cup would be meaningless: 1 medium',
    '  banana, 1 large egg, 1 drumstick, 1 slice, 1 tbsp of oil or dressing,',
    '  1 tablet or 2 capsules.',
    '- A portion the description states outright is kept as stated, in the unit',
    '  it was given. Only what you supply yourself lands on a half cup.',
    '- Where no portion is given at all, assume a common one and mark it in',
    '  brackets: "1 cup (portion assumed, not stated)". Never let an assumption',
    '  go unmarked.',
];

const AI_DASH = [
    '- DASH servings follow the 2,000 kcal reference pattern. Most foods land',
    '  in one or two groups; leave the rest at 0. Fractions are expected.',
];

/* meal_type is really the section heading in the picker, and three of its
 * values are kinds rather than times. Say so, or everything drinkable gets
 * filed under whichever meal it happened to be drunk at. */
const AI_SLOTS = [
    '- `meal_type` is the occasion this would usually be eaten at: Breakfast,',
    '  Lunch, Dinner, Snack or Dessert. Anything drunk, and anything snacked',
    '  on, belongs to Snack unless it clearly sits with a particular meal.',
    '- A supplement or a vitamin scores the nutrients it genuinely delivers - a',
    '  calcium tablet is real calcium, a potassium salt is real potassium - and',
    '  leaves every DASH serving at 0. A pill is not a food group, however much',
    '  of a nutrient it carries. Nutrients it does not contain stay at 0 too; do',
    '  not round a multivitamin up into a meal.',
    '- The same goes for a dressing, a sauce or a spread: score the fats and',
    '  the sodium it really carries, and leave the rest alone.',
];

const AI_INGREDIENT_SYSTEM = [
    'You turn a plain description of something eaten into one ingredient entry',
    'for a DASH diet log. Estimate from standard reference data, USDA where you',
    'have it, for the portion described.',
    '',
    '- One ingredient per call. If the description names a whole dish, take only',
    '  the single ingredient asked for and say so in `note`.',
    '- Nutrients describe the whole portion named in `amount`, not 100 g of it.',
].concat(AI_PORTIONS, AI_SLOTS, AI_DASH, [
    '- `note` is a sentence or two on what drives the numbers, or on what you',
    '  had to assume. No preamble, no restating the name.',
]).join('\n');

const AI_MEAL_SYSTEM = [
    'You turn a plain description of a meal into one totalled entry for a DASH',
    'diet log. Estimate from standard reference data, USDA where you have it.',
    '',
    '- Break the meal into its ingredients, give each a portion, then report the',
    '  totals for the meal as a whole. Every number you return is the sum across',
    '  the ingredients, never one ingredient standing alone.',
    '- `ingredients` lists each part as "Name, portion", matching the portions',
    '  you actually totalled: "Greek yogurt, Fage 0%, 0.5 cup".',
].concat(AI_PORTIONS, AI_SLOTS, AI_DASH, [
    '- `note` is a sentence or two on how the meal sits against DASH: what',
    '  carries the fiber or potassium, what pushes the sodium. No preamble.',
]).join('\n');

/* Every field is required and additionalProperties is off, so a strict tool
 * call either validates whole or fails loudly. There is no half-filled note
 * to guess at afterwards. */
function aiNumbers(props, whole) {
    for (const n of NUTRIENTS) {
        props[n.key] = {
            type: 'number',
            description: n.label + ' across the whole ' + whole + ', in ' + n.unit + '.',
        };
    }
    for (const g of FOOD_GROUPS) {
        props[g.key] = {
            type: 'number',
            description: 'DASH servings of ' + g.label.toLowerCase() +
                         ' in this ' + whole + ', 0 if none.',
        };
    }
    return props;
}

function aiSchema(name, description, props) {
    return {
        name,
        description,
        strict: true,
        input_schema: {
            type: 'object',
            additionalProperties: false,
            required: Object.keys(props),
            properties: props,
        },
    };
}

function aiIngredientTool() {
    return aiSchema(
        'log_ingredient',
        'Record one ingredient as eaten, with its nutrition and its DASH food-group ' +
        'servings. Call this once for the ingredient described.',
        aiNumbers({
            name: {
                type: 'string',
                description: 'Short title-case name for the note, e.g. "Greek Yogurt". Becomes the filename.',
            },
            amount: {
                type: 'string',
                description: 'The portion these numbers describe, with any assumption in brackets at the end.',
            },
            meal_type: {
                type: 'string',
                enum: MEAL_ORDER,
                description: 'Which section this files under: an occasion, or Drink '
                             + 'for anything drunk, Condiment for a dressing, sauce or spread, '
                             + 'or Supplement for a vitamin, mineral or supplement.',
            },
            note: {
                type: 'string',
                description: 'One or two sentences on what drives the numbers or what was assumed.',
            },
        }, 'portion'));
}

function aiMealTool() {
    return aiSchema(
        'log_meal',
        'Record one whole meal as eaten, totalled across its ingredients, with its ' +
        'DASH food-group servings. Call this once for the meal described.',
        aiNumbers({
            name: {
                type: 'string',
                description: 'Short title-case name for the meal, e.g. "Oatmeal, Greek Yogurt, and Berry Bowl". Becomes the filename.',
            },
            meal_type: {
                type: 'string',
                enum: MEAL_ORDER,
                description: 'Which section this files under: an occasion, or Drink '
                             + 'for anything drunk, Condiment for a dressing, sauce or spread, '
                             + 'or Supplement for a vitamin, mineral or supplement.',
            },
            ingredients: {
                type: 'array',
                items: { type: 'string' },
                description: 'Each ingredient as "Name, portion", e.g. "Walnuts, 1 oz". ' +
                             'These are the parts the totals add up.',
            },
            note: {
                type: 'string',
                description: 'One or two sentences on how the meal sits against DASH.',
            },
        }, 'meal'));
}

/* A suggestion needs the method as well, since a meal nobody has cooked yet
 * is no use without one. Kept as its own tool rather than an optional field
 * on log_meal, because aiSchema requires everything it is handed - and a meal
 * already eaten has no method to report. Derived from the meal tool so the
 * two cannot drift apart. */
function aiSuggestTool() {
    const tool = aiMealTool();
    tool.name = 'suggest_meal';
    tool.description =
        'Propose one meal that fits what the day still has room for, with the ' +
        'method for cooking it. Call this once.';

    tool.input_schema.properties.method = {
        type: 'array',
        items: { type: 'string' },
        description: 'The steps to cook it, in order, one per item. Each step ' +
                     'carries its own timings and quantities so it reads on its ' +
                     'own, without the ingredient list beside it.',
    };
    tool.input_schema.required = Object.keys(tool.input_schema.properties);
    return tool;
}

/* Cooking is where a recipe stops being a row of numbers, and a chat handles
 * that better than a note can: something tickable, scaled to the number of
 * people actually sitting down. The link carries the dish, its parts and its
 * method - the nutrient tables stay the vault's business.
 *
 * The servings question is asked in the chat rather than answered here on the
 * grounds that the vault only ever knows about one portion: every number Nosh
 * holds describes the single serving that gets logged. Scaling belongs to the
 * cooking, not to the record of it. */
const CLAUDE_CHAT = 'https://claude.ai/new?q=';

function claudeRecipeLink(name, parts, steps, serves) {
    const NL = String.fromCharCode(10);
    const many = Math.max(1, parseNum(serves) || 1);

    const ask = [
        'Turn this into an interactive recipe artifact I can cook from, with',
        'the steps tickable as I work through them and the timings called out',
        'where a step has one.',
    ];
    /* Asked before the recipe was written, so the chat is told rather than
     * asked - and told which of the two numbers it may scale. */
    ask.push('', many > 1
        ? 'The method below serves ' + many + '. The ingredient quantities are ' +
          'per portion, so scale them to ' + many + ' as you go.'
        : 'The quantities below make one portion. Ask me whether to scale it ' +
          'up before you build, and wait for my answer.');

    const recipe = ['', String(name)];

    if (parts.length) {
        recipe.push('', 'Ingredients, for one portion:');
        for (const p of parts) recipe.push('- ' + String(p).trim());
    }

    const method = [];
    if (steps.length) {
        method.push('', 'Method:');
        for (let i = 0; i < steps.length; i++) {
            method.push((i + 1) + '. ' + String(steps[i]).trim());
        }
    }

    /* Something in the chain truncates a long URL sooner or later, so an
     * over-long one sheds the method and then the ingredients rather than
     * arriving half-written. Claude can reconstruct a method from a dish and
     * its parts; it cannot reconstruct a sentence cut in half. */
    const tries = [
        ask.concat(recipe, method),
        ask.concat(recipe),
        ask.concat(['', String(name)]),
    ];
    for (const attempt of tries) {
        const q = encodeURIComponent(attempt.join(NL));
        if (q.length <= 4000) return CLAUDE_CHAT + q;
    }
    return CLAUDE_CHAT + encodeURIComponent(String(name));
}

/* A suggestion is the same meal form arrived at backwards: instead of
 * describing a meal and being told its numbers, it is handed the numbers
 * still wanted and invents a meal that lands on them. Same tool, same draft,
 * same note in the end - only the instructions differ. */
const AI_SUGGEST_SYSTEM = [
    'You propose one meal to round out a day of DASH eating. You are given what',
    'the day still has room for; answer with a single meal that fits it.',
    '',
    '- Suggest something a person would actually cook and eat. Ordinary',
    '  ingredients, ordinary method - not a pile of things chosen to hit numbers.',
    '- Close the shortfalls as far as one sensible meal can, and stay inside',
    '  every limit given. A limit is a ceiling rather than a target: landing well',
    '  under one is a good outcome, not a miss.',
    '- Where the shortfalls cannot all be met without the meal turning absurd,',
    '  meet the ones that matter most and say which you left alone.',
    '- `name` is what the dish is called, titled as a recipe would title it.',
    '- `ingredients` lists each part as "Name, portion", and every number you',
    '  return is the total across all of them.',
    '- `method` is how to cook it: ordered steps, one per item, each carrying its',
    '  own timings and quantities so a step reads without the ingredient list',
    '  beside it. Enough to cook from, not an essay.',
    '- Unless the request says otherwise the method makes one portion, and that',
    '  portion is what every number describes. Where more are asked for, scale',
    '  the method alone: the nutrition still describes a single serving, since',
    '  a single serving is what gets logged.',
].concat(AI_PORTIONS, AI_SLOTS, AI_DASH, [
    '- `note` says in a sentence or two what this meal does for the day: which',
    '  shortfall it closes, and anything it deliberately leaves short.',
]).join('\n');

/* What the picker's two tabs mean on this side: which prompt, which tool,
 * which folder the note lands in, and how it gets written out. */
const AI_KINDS = {
    ingredients: {
        title: 'Add ingredient',
        system: AI_INGREDIENT_SYSTEM,
        tool: aiIngredientTool,
        sub: SUB_INGREDIENTS,
        note: aiIngredientNote,
        model: 'aiModel',
    },
    meals: {
        title: 'Add meal',
        system: AI_MEAL_SYSTEM,
        tool: aiMealTool,
        sub: SUB_MEALS,
        note: aiMealNote,
        model: 'aiModel',
    },
    /* Files and reads exactly like a meal, because that is what it becomes the
     * moment it is kept. */
    suggest: {
        title: 'Suggested meal',
        system: AI_SUGGEST_SYSTEM,
        tool: aiSuggestTool,
        sub: SUB_MEALS,
        note: aiMealNote,
        model: 'aiSuggestModel',
    },
};

/* --- auth ----------------------------------------------------------- */

/* Two ways in. An API key is the portable one, and the only one a phone can
 * use, but it lives in data.json, which is inside the vault and syncs
 * wherever the vault syncs. The ant profile keeps the credential out of the
 * vault entirely, at the cost of needing a desktop and the CLI. */

let antToken = null;   // { value, until } - the CLI shells out, so hold it briefly

async function antAccessToken() {
    if (antToken && Date.now() < antToken.until) return antToken.value;

    let execFile;
    try {
        ({ execFile } = require('child_process'));
    } catch (e) {
        throw new Error('The ant CLI needs desktop Obsidian. Switch Nosh AI to an API key to draft here.');
    }

    const stdout = await new Promise((resolve, reject) => {
        execFile('ant', ['auth', 'print-credentials', '--access-token'], {
            windowsHide: true,
            timeout: 20000,
            /* Windows installs ant as a .cmd shim, which execFile will not run
             * without a shell. The arguments are fixed, so nothing reaches
             * that shell which we did not write. */
            shell: process.platform === 'win32',
        }, (err, out, errOut) => {
            if (!err) return resolve(String(out));
            const said = String(errOut || '').trim() || String(err.message || '').trim();
            if (/ENOENT|not recognized|not found/i.test(said)) {
                return reject(new Error('ant is not on the PATH. Install it and run "ant auth login", ' +
                                        'or switch Nosh AI to an API key.'));
            }
            reject(new Error(said || 'ant could not produce a token.'));
        });
    });

    /* --access-token prints the bare token. Without the flag the CLI prints
     * JSON, which would otherwise sail through as a nonsense bearer. */
    const value = stdout.trim();
    if (!value || /[\s{]/.test(value)) {
        throw new Error('ant returned no usable token. Run "ant auth login" and try again.');
    }

    antToken = { value, until: Date.now() + 5 * 60 * 1000 };
    return value;
}

function forgetAntToken() { antToken = null; }

async function aiHeaders(settings) {
    const headers = {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
    };

    if (settings.aiAuth === 'key') {
        const key = (settings.aiApiKey || '').trim();
        if (!key) throw new Error('No API key set. Add one in Nosh settings, or switch to the ant CLI.');
        headers['x-api-key'] = key;
        return headers;
    }

    /* An OAuth token is a bearer, not an x-api-key, and the beta header is
     * what tells the API to accept it as one. */
    headers['authorization'] = 'Bearer ' + (await antAccessToken());
    headers['anthropic-beta'] = 'oauth-2025-04-20';
    return headers;
}

/* --- the call ------------------------------------------------------- */

async function aiDraft(plugin, kind, description) {
    const spec = AI_KINDS[kind] || AI_KINDS.ingredients;
    const tool = spec.tool();
    const headers = await aiHeaders(plugin.settings);

    const res = await requestUrl({
        url: AI_ENDPOINT,
        method: 'POST',
        headers,
        throw: false,
        body: JSON.stringify({
            model: aiModelId(plugin.settings, spec.model),
            max_tokens: 4096,
            thinking: { type: 'adaptive' },
            output_config: { effort: plugin.settings.aiEffort || 'medium' },
            system: spec.system,
            tools: [tool],
            /* One tool, and it must be called. The answer is the form, not prose. */
            tool_choice: { type: 'tool', name: tool.name },
            messages: [{ role: 'user', content: description }],
        }),
    });

    let body = null;
    try { body = JSON.parse(res.text); } catch (e) { /* handled as a missing message below */ }

    if (res.status !== 200) {
        // A stale bearer should not poison the next attempt.
        if (res.status === 401) forgetAntToken();
        const said = body && body.error && body.error.message;
        throw new Error(said || ('The API answered ' + res.status + '.'));
    }

    const block = ((body && body.content) || []).find(
        (b) => b.type === 'tool_use' && b.name === tool.name);
    if (!block) throw new Error('Claude answered without filling the form. Try naming the amount plainly.');

    return block.input;
}

/* A cheap request that exercises the credential path and nothing else, so
 * settings can answer "does this work" without inventing a note. */
async function aiPing(plugin) {
    const headers = await aiHeaders(plugin.settings);
    const res = await requestUrl({
        url: AI_ENDPOINT,
        method: 'POST',
        headers,
        throw: false,
        body: JSON.stringify({
            model: aiModelId(plugin.settings),
            max_tokens: 16,
            messages: [{ role: 'user', content: 'Reply with the word ok.' }],
        }),
    });

    if (res.status === 200) return;
    if (res.status === 401) forgetAntToken();
    let said = null;
    try { said = JSON.parse(res.text).error.message; } catch (e) { /* status only */ }
    throw new Error(said || ('The API answered ' + res.status + '.'));
}

/* --- the note ------------------------------------------------------- */

/* Existing notes date themselves YYMMDD as a quoted string, so a leading
 * zero survives the YAML parser. */
function stamp(iso) {
    const p = iso.split('-');
    return p[0].slice(2) + p[1] + p[2];
}

/* Amounts carry brackets, commas and colons, any of which YAML would read as
 * structure. Quote, and double any quote already inside. */
function yamlStr(s) {
    return '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
}

function servingsPhrase(n) {
    return fmtServings(n) + (n === 1 ? ' serving' : ' servings');
}

/* Both note kinds carry the same block of numbers; only what sits above it
 * and how the body reads them differ. `head` is the extra frontmatter that
 * distinguishes them - an amount for an ingredient, a meal_type for a meal. */
/* One nested tag does both jobs: marks the note as Nosh's and says which kind
 * it is. Namespaced, because #meal and #ingredient are ordinary enough words
 * to already mean something else in somebody's vault. */
function kindTag(settings, kind) {
    return String((settings && settings.tag) || 'nutrition').replace(/^#/, '') +
           '/' + kind;
}

function aiFrontMatter(draft, iso, head, tags) {
    const lines = ['---'];
    lines.push('date: ' + yamlStr(stamp(iso)));
    for (const pair of head) lines.push(pair[0] + ': ' + pair[1]);
    for (const n of NUTRIENTS) lines.push(n.key + ': ' + parseNum(draft[n.key]));
    for (const g of FOOD_GROUPS) lines.push(g.key + ': ' + parseNum(draft[g.key]));
    lines.push('tags:');
    for (const t of tags) if (t) lines.push('  - ' + t);
    lines.push('---');
    return lines;
}

function macroRows(draft, keys) {
    return keys.map((n) =>
        '| ' + n.label + ' | ' + fmt(parseNum(draft[n.key])) + ' ' + n.unit + ' |');
}

function aiIngredientNote(draft, iso, settings) {
    const lines = aiFrontMatter(draft, iso,
        [['amount', yamlStr(draft.amount)],
         ['meal_type', draft.meal_type]],
        [kindTag(settings, 'ingredient')]);

    lines.push('');
    lines.push('# ' + draft.name);
    lines.push('');
    lines.push('**Amount:** ' + draft.amount);
    lines.push('');
    lines.push('## Macros');
    lines.push('');
    lines.push('| Metric | Amount |');
    lines.push('|---|---|');
    lines.push.apply(lines, macroRows(draft, NUTRIENTS));

    lines.push('');
    lines.push('## DASH');
    lines.push('');
    const groups = FOOD_GROUPS
        .filter((g) => parseNum(draft[g.key]) > 0)
        .map((g) => g.label + ', ' + servingsPhrase(parseNum(draft[g.key])));
    lines.push(groups.length ? groups.join('\n') : 'No food-group servings.');

    if (draft.note) {
        lines.push('');
        lines.push(String(draft.note).trim());
    }

    lines.push('');
    return lines.join('\n');
}

/* Existing meal notes split the numbers in two: the four a recipe card would
 * print, then the five DASH actually judges you on, each against its target.
 * Named rather than sliced by position, so reordering NUTRIENTS is safe. */
const AI_MACRO_KEYS = ['calories', 'protein_g', 'carbs_g', 'fat_g'];

function aiMealNote(draft, iso, settings) {
    const many = Math.max(1, parseNum(draft.serves) || 1);
    const head = [['meal_type', draft.meal_type]];
    /* The numbers below describe one portion whatever this says, so it is a
     * note about the method and nothing the totals ever read. */
    if (many > 1) head.push(['serves', many]);

    const lines = aiFrontMatter(draft, iso, head, [kindTag(settings, 'meal')]);

    lines.push('');
    lines.push('# ' + draft.name);

    const parts = Array.isArray(draft.ingredients) ? draft.ingredients.filter(Boolean) : [];
    if (parts.length) {
        lines.push('');
        lines.push('## Ingredients');
        lines.push('');
        for (const p of parts) lines.push('- ' + String(p).trim());
    }

    /* Only a meal that has not been cooked yet has a method. A note written
     * from something already eaten skips all of this. */
    const steps = Array.isArray(draft.method) ? draft.method.filter(Boolean) : [];
    if (steps.length) {
        lines.push('');
        lines.push('## Method');
        lines.push('');
        for (let i = 0; i < steps.length; i++) {
            lines.push((i + 1) + '. ' + String(steps[i]).trim());
        }

        lines.push('');
        lines.push('[Cook this with Claude](' +
                   claudeRecipeLink(draft.name, parts, steps, draft.serves) + ')');
    }

    lines.push('');
    lines.push('## Macros');
    lines.push('');
    lines.push('| Metric | Amount |');
    lines.push('|---|---|');
    lines.push.apply(lines, macroRows(draft,
        NUTRIENTS.filter((n) => AI_MACRO_KEYS.includes(n.key))));

    lines.push('');
    lines.push('## DASH Targets');
    lines.push('');
    lines.push('| Metric | Amount | % of Daily Target |');
    lines.push('|---|---|---|');
    /* The percentages come from the targets set in this vault, not from the
     * reference pattern, so the note agrees with the bars in the sidebar. */
    for (const n of NUTRIENTS) {
        if (AI_MACRO_KEYS.includes(n.key)) continue;
        const value = parseNum(draft[n.key]);
        const target = parseNum((settings.targets || {})[n.key]);
        const share = target
            ? Math.round((value / target) * 100) + '% of ' + fmt(target) + n.unit
            : '—';
        lines.push('| ' + n.label + ' | ' + fmt(value) + ' ' + n.unit + ' | ' + share + ' |');
    }

    const groups = FOOD_GROUPS
        .filter((g) => parseNum(draft[g.key]) > 0)
        .map((g) => g.label + ', ' + servingsPhrase(parseNum(draft[g.key])));
    if (groups.length) {
        lines.push('');
        lines.push('## DASH');
        lines.push('');
        lines.push(groups.join('\n'));
    }

    if (draft.note) {
        lines.push('');
        lines.push(String(draft.note).trim());
    }

    lines.push('');
    return lines.join('\n');
}

/* A composed meal names its parts and carries their sum. The numbers are
 * derived - collectNotes() recomputes them from the parts on every read - but
 * they are written out anyway so the note still means something to Dataview,
 * to a reader, and to anyone it gets shared with. */
function composedMealNote(name, parts, occasion, iso, settings) {
    const totals = {};
    for (const n of NUTRIENTS) totals[n.key] = 0;
    for (const g of FOOD_GROUPS) totals[g.key] = 0;
    for (const p of parts) {
        for (const n of NUTRIENTS) totals[n.key] += p.recipe.values[n.key] * p.servings;
        for (const g of FOOD_GROUPS) totals[g.key] += p.recipe.values[g.key] * p.servings;
    }
    const round = (v) => Math.round(v * 100) / 100;

    const lines = ['---'];
    lines.push('date: ' + yamlStr(stamp(iso)));
    lines.push('meal_type: ' + occasion);
    lines.push('components:');
    for (const p of parts) {
        lines.push('  - note: ' + yamlStr('[[' + p.recipe.name + ']]'));
        lines.push('    servings: ' + p.servings);
    }
    for (const n of NUTRIENTS) lines.push(n.key + ': ' + round(totals[n.key]));
    for (const g of FOOD_GROUPS) lines.push(g.key + ': ' + round(totals[g.key]));
    lines.push('tags:');
    lines.push('  - ' + kindTag(settings, 'meal'));
    lines.push('---');

    lines.push('');
    lines.push('# ' + name);
    lines.push('');
    lines.push('## Ingredients');
    lines.push('');
    for (const p of parts) {
        lines.push('- [[' + p.recipe.name + ']]' +
                   (p.servings === 1 ? '' : ' \u00d7 ' + fmtServings(p.servings)) +
                   (p.recipe.amount ? ' (' + p.recipe.amount + ')' : ''));
    }

    lines.push('');
    lines.push('## Macros');
    lines.push('');
    lines.push('| Metric | Amount |');
    lines.push('|---|---|');
    for (const n of NUTRIENTS) {
        lines.push('| ' + n.label + ' | ' + fmt(totals[n.key]) + ' ' + n.unit + ' |');
    }

    const groups = FOOD_GROUPS
        .filter((g) => totals[g.key] > 0)
        .map((g) => g.label + ', ' + servingsPhrase(totals[g.key]));
    if (groups.length) {
        lines.push('');
        lines.push('## DASH');
        lines.push('');
        lines.push(groups.join('\n'));
    }

    lines.push('');
    lines.push('Totals are the sum of the ingredients above, recalculated whenever ' +
               'those notes change.');
    lines.push('');
    return lines.join('\n');
}

/* Obsidian would happily read "Chicken/Rice" as a folder. Strip anything that
 * steers a path or breaks a wikilink. */
function safeName(name) {
    const clean = String(name || '')
        /* A slash or a colon stands in for a word break, so it leaves a space
         * behind rather than gluing its two sides together. */
        .replace(/[\\/:]/g, ' ')
        .replace(/[*?"<>|#^[\]]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return clean || 'Ingredient';
}

/* Each level in turn: the Nosh folder itself may be several deep and none of
 * it need exist yet. */
async function ensureFolder(vault, folder) {
    const path = (folder || '').trim().replace(/^\/+|\/+$/g, '');
    if (!path) return;

    let so_far = '';
    for (const part of path.split('/')) {
        so_far = so_far ? so_far + '/' + part : part;
        if (vault.getAbstractFileByPath(so_far)) continue;
        try { await vault.createFolder(so_far); } catch (e) { /* raced, or already there */ }
    }
}

function freePath(vault, folder, base) {
    const dir = (folder || '').trim().replace(/\/+$/, '');
    const prefix = dir ? dir + '/' : '';
    let path = prefix + base + '.md';
    for (let n = 2; vault.getAbstractFileByPath(path); n++) {
        path = prefix + base + ' ' + n + '.md';
    }
    return path;
}

/* A file exists the moment vault.create resolves, but collectNotes() reads
 * the metadata cache, which lags behind it. Wait for the note to be indexed
 * so its row appears with the rest rather than on some later refresh. */
function awaitCache(app, file, ms) {
    if (app.metadataCache.getFileCache(file)) return Promise.resolve();
    return new Promise((resolve) => {
        let ref = null;
        const done = () => {
            if (ref) app.metadataCache.offref(ref);
            clearTimeout(timer);
            resolve();
        };
        const timer = setTimeout(done, ms);
        ref = app.metadataCache.on('changed', (f) => { if (f.path === file.path) done(); });
    });
}

/* Between wanting a suggestion and getting one. The day's shortfalls are
 * already known; what is not is who is eating, how much of a production this
 * should be, and what is sitting in the fridge that ought to be used up. None
 * of that belongs in a settings page, because none of it is true twice. */
class NoshSuggestModal extends Modal {
    constructor(app, view, onDone) {
        super(app);
        this.view = view;
        this.onDone = onDone;
        this.answer = null;
        this.ask = {
            serves: Math.max(1, parseNum(view.plugin.settings.suggestServes) || 1),
            span: 'any',
            use: '',
            extra: '',
        };
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('dash-draft');
        this.setTitle('What' + String.fromCharCode(8217) + 's for ' +
                      (OCCASION_ASK[this.view.occasion] ||
                       this.view.occasion.toLowerCase()) + '?');

        const served = contentEl.createDiv({ cls: 'dash-draft-row' });
        served.createEl('label', { text: 'Cooking for' });
        const servesEl = served.createEl('input', { type: 'number' });
        servesEl.min = '1';
        servesEl.max = '20';
        servesEl.value = String(this.ask.serves);
        servesEl.addEventListener('input', () => {
            this.ask.serves = Math.max(1, parseNum(servesEl.value) || 1);
            this.preview();
        });

        const spanned = contentEl.createDiv({ cls: 'dash-draft-row' });
        spanned.createEl('label', { text: 'Effort' });
        const spanEl = spanned.createEl('select');
        for (const r of RECIPE_SPANS) {
            const o = spanEl.createEl('option', { text: r.label });
            o.value = r.key;
        }
        spanEl.value = this.ask.span;
        spanEl.addEventListener('change', () => {
            this.ask.span = spanEl.value;
            this.preview();
        });

        const used = contentEl.createDiv({ cls: 'dash-draft-row' });
        used.createEl('label', { text: 'Use up' });
        const useEl = used.createEl('input', { type: 'text' });
        useEl.placeholder = 'half a fennel, the last of the yoghurt';
        useEl.addEventListener('input', () => {
            this.ask.use = useEl.value;
            this.preview();
        });

        const extraEl = contentEl.createEl('textarea', { cls: 'dash-draft-extra' });
        extraEl.placeholder = 'Anything else, in your own words\u2026';
        extraEl.rows = 2;
        extraEl.addEventListener('input', () => {
            this.ask.extra = extraEl.value;
            this.preview();
        });

        /* Read-only, and shown rather than hidden: the fields above are how it
         * gets changed, and a box that can be typed into as well would only
         * argue with them about which one won. */
        const box = contentEl.createEl('details', { cls: 'dash-draft-preview' });
        box.createEl('summary', { text: 'What Claude will be told' });
        this.previewEl = box.createEl('pre');
        this.preview();

        const actions = contentEl.createDiv({ cls: 'dash-draft-actions' });
        const cancel = actions.createEl('button', { text: 'Cancel' });
        cancel.addEventListener('click', () => this.close());

        const go = actions.createEl('button', { cls: 'mod-cta', text: 'Suggest' });
        go.addEventListener('click', () => {
            this.answer = this.ask;
            this.close();
        });
    }

    preview() {
        if (this.previewEl) this.previewEl.setText(this.view.suggestionPrompt(this.ask));
    }

    /* Dismissing leaves the answer null, which reads as "never mind" rather
     * than as an empty set of preferences. */
    onClose() {
        this.contentEl.empty();
        this.onDone(this.answer);
    }
}

/* Drafting something the vault already holds used to file a second note
 * beside the first - the "Quinoa 2" and "Arugula 2" of a log that had quietly
 * started counting one food as two. Ask instead. */
class NoshExistsModal extends Modal {
    constructor(app, name, onPick) {
        super(app);
        this.name = name;
        this.onPick = onPick;
        this.picked = null;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('dash-draft');
        contentEl.createEl('h3', { text: this.name + ' already exists' });
        contentEl.createDiv({
            cls: 'dash-draft-note',
            text: 'A note by that name is already in the vault. Logging the one you ' +
                  'have keeps the day counting a single food rather than two that ' +
                  'happen to share a name.',
        });

        const actions = contentEl.createDiv({ cls: 'dash-draft-actions' });
        const pick = (label, value, primary) => {
            const b = actions.createEl('button', { text: label });
            if (primary) b.addClass('mod-cta');
            b.addEventListener('click', () => { this.picked = value; this.close(); });
        };
        pick('Keep both', 'both');
        pick('Replace it', 'replace');
        pick('Log the existing note', 'existing', true);
    }

    /* Dismissing with Escape leaves picked null, which reads as "do nothing"
     * rather than defaulting into a write. */
    onClose() {
        this.contentEl.empty();
        this.onPick(this.picked);
    }
}

/* --- confirmation --------------------------------------------------- */

/* Nothing reaches the vault until this has been read. The numbers are
 * estimates and the portion may be an outright guess; both are on screen
 * before the note exists. */
class NoshDraftModal extends Modal {
    constructor(app, view, kind, draft) {
        super(app);
        this.view = view;
        this.kind = kind;
        this.draft = Object.assign({}, draft);
        this.shouldLog = true;
    }

    onOpen() {
        const { contentEl } = this;
        const spec = AI_KINDS[this.kind] || AI_KINDS.ingredients;
        contentEl.addClass('dash-draft');
        this.setTitle(spec.title);

        const named = contentEl.createDiv({ cls: 'dash-draft-row' });
        named.createEl('label', { text: 'Name' });
        const nameEl = named.createEl('input', { type: 'text' });
        nameEl.value = this.draft.name || '';
        nameEl.addEventListener('input', () => { this.draft.name = nameEl.value; });

        /* An ingredient is not asked. The occasion belongs to the log entry
         * now, and the one thing meal_type still settles for an ingredient is
         * whether a note scoring no food group files under Drinks, Condiments
         * or Supplements - which Claude has already answered, and answers
         * better than a dropdown of occasions can. It stays in the
         * frontmatter, editable there like anything else. */
        if (this.kind !== 'ingredients') {
            const mealed = contentEl.createDiv({ cls: 'dash-draft-row' });
            mealed.createEl('label', { text: 'Meal' });
            const mealEl = mealed.createEl('select');
            for (const m of MEAL_ORDER) {
                const o = mealEl.createEl('option', { text: m });
                o.value = m;
            }
            mealEl.value = MEAL_ORDER.includes(this.draft.meal_type)
                ? this.draft.meal_type : MEAL_ORDER[0];
            this.draft.meal_type = mealEl.value;
            mealEl.addEventListener('change', () => { this.draft.meal_type = mealEl.value; });
        }

        /* What the numbers rest on, before the numbers. For a meal that is the
         * list of parts and their portions; for an ingredient it is the single
         * portion, whose bracketed caveat is the honest part of the estimate. */
        const parts = Array.isArray(this.draft.ingredients)
            ? this.draft.ingredients.filter(Boolean) : [];
        if (parts.length) {
            const list = contentEl.createEl('ul', { cls: 'dash-draft-parts' });
            for (const p of parts) list.createEl('li', { text: String(p) });
        } else if (this.draft.amount) {
            contentEl.createDiv({ cls: 'dash-draft-amount', text: this.draft.amount });
        }

        /* A suggestion is being judged on whether it is worth cooking, so the
         * method belongs on screen next to the numbers, not only in the note
         * written afterwards. */
        const steps = Array.isArray(this.draft.method)
            ? this.draft.method.filter(Boolean) : [];
        if (steps.length) {
            const how = contentEl.createEl('ol', { cls: 'dash-draft-method' });
            for (const step of steps) how.createEl('li', { text: String(step) });

            const chat = contentEl.createEl('a', {
                cls: 'dash-draft-chat',
                text: 'Cook this with Claude',
                href: claudeRecipeLink(this.draft.name, parts, steps, this.draft.serves),
            });
            chat.setAttr('target', '_blank');
            chat.setAttr('rel', 'noopener');
        }

        const table = contentEl.createEl('table', { cls: 'dash-draft-table' });
        for (const n of NUTRIENTS) {
            const tr = table.createEl('tr');
            tr.createEl('td', { text: n.label });
            tr.createEl('td', { text: fmt(parseNum(this.draft[n.key])) + ' ' + n.unit });
        }

        const groups = FOOD_GROUPS
            .filter((g) => parseNum(this.draft[g.key]) > 0)
            .map((g) => g.label + ' ' + fmt(parseNum(this.draft[g.key])));
        contentEl.createDiv({
            cls: 'dash-draft-groups',
            text: groups.length ? groups.join(' · ') : 'No food-group servings',
        });

        if (this.draft.note) {
            contentEl.createDiv({ cls: 'dash-draft-note', text: this.draft.note });
        }

        const logged = contentEl.createDiv({ cls: 'dash-draft-log' });
        const box = logged.createEl('input', { type: 'checkbox' });
        box.checked = this.shouldLog;
        box.addEventListener('change', () => { this.shouldLog = box.checked; });
        logged.createEl('label', { text: 'Log one serving for ' + humanDay(this.view.cursor) });

        const actions = contentEl.createDiv({ cls: 'dash-draft-actions' });
        const cancel = actions.createEl('button', { text: 'Cancel' });
        cancel.addEventListener('click', () => this.close());

        const create = actions.createEl('button', { cls: 'mod-cta', text: 'Create note' });
        create.addEventListener('click', async () => {
            create.disabled = true;
            try {
                await this.view.createFromDraft(this.kind, this.draft, this.shouldLog);
                this.close();
            } catch (e) {
                create.disabled = false;
                new Notice('Nosh could not write the note: ' + (e && e.message ? e.message : e), 8000);
            }
        });
    }

    onClose() { this.contentEl.empty(); }
}

/* Reports -------------------------------------------------------------
 *
 * Nosh keeps its numbers in two places: the nutrition itself lives in note
 * frontmatter out in the vault, and what was eaten on which day lives in this
 * plugin's data.json. A report is the join of the two, frozen into a note.
 */

/* The judgement behind a bar's colour, lifted out of the view so a report
 * reaches the same verdict as the sidebar rather than a second opinion. */
function nutrientState(dir, pct) {
    if (dir === 'goal') return pct >= 100 ? 'met' : 'under';
    if (dir === 'limit') return pct > 100 ? 'over' : pct >= 80 ? 'near' : 'under';
    return 'neutral';
}

function groupState(g, value, min, max) {
    const pct = max > 0 ? (value / max) * 100 : 0;
    if (g.dir === 'limit') return value > max ? 'over' : pct >= 80 ? 'near' : 'under';
    if (value > max) return g.overOk ? 'met' : 'over';
    return value >= min ? 'met' : 'under';
}

/* A column of glyphs reads down the page faster than a column of adjectives,
 * and survives being pasted somewhere without the stylesheet. */
const STATE_MARK = { met: '✓', under: '↓', near: '!', over: '✗', neutral: '·' };

function reportTitle(r) {
    return 'Nosh ' + r.days[0] +
           (r.mode === 'week' ? ' to ' + r.days[r.days.length - 1] : '');
}

/* Deliberately carries no nutrient fields and not the meal tag: collectNotes()
 * picks up anything with a calories field, and a report is not a thing you
 * ate. */
function reportMarkdown(r) {
    const lines = ['---'];
    lines.push('date: ' + yamlStr(stamp(r.days[0])));
    lines.push('nosh_report: ' + r.mode);
    lines.push('tags:');
    lines.push('  - nosh-report');
    lines.push('---');

    lines.push('');
    lines.push('# Nosh · ' + r.span);
    lines.push('');
    lines.push(r.meals
        ? r.meals + (r.meals === 1 ? ' entry · ' : ' entries · ') + fmt(r.totals.calories) +
          ' kcal' + (r.mode === 'week' ? ' · ' + fmt(r.totals.calories / 7) + ' kcal/day' : '')
        : 'Nothing logged.');

    lines.push('');
    lines.push('## Nutrients');
    lines.push('');
    lines.push('| Metric | Total | Target | Share | |');
    lines.push('|---|---|---|---|---|');
    for (const n of r.nutrients) {
        lines.push('| ' + n.label +
                   ' | ' + fmt(n.value) + ' ' + n.unit +
                   ' | ' + (n.target ? fmt(n.target) + ' ' + n.unit : '—') +
                   ' | ' + (n.target ? Math.round(n.pct) + '%' : '—') +
                   ' | ' + STATE_MARK[n.state] + ' |');
    }

    lines.push('');
    lines.push('## Food groups');
    lines.push('');
    lines.push('| Group | Servings | Target | Over | |');
    lines.push('|---|---|---|---|---|');
    for (const g of r.groups) {
        const target = g.dir === 'limit'
            ? '≤ ' + fmt(g.max)
            : (g.min === g.max ? fmt(g.max) : fmt(g.min) + '–' + fmt(g.max));
        lines.push('| ' + g.label +
                   ' | ' + fmt(g.value) +
                   ' | ' + target +
                   ' | ' + (g.period === 'week' ? 'the week' : 'the day') +
                   ' | ' + STATE_MARK[g.state] + ' |');
    }

    lines.push('');
    lines.push('## By day');
    for (const d of r.byDay) {
        const kcal = d.entries.reduce((s, e) => s + e.calories, 0);
        lines.push('');
        lines.push('### ' + d.label + (d.entries.length ? ' · ' + fmt(kcal) + ' kcal' : ''));
        lines.push('');
        if (!d.entries.length) {
            lines.push('Nothing logged.');
            continue;
        }
        for (const e of d.entries) {
            lines.push('- **' + e.meal + '** · ' + e.name +
                       (e.servings === 1 ? '' : ' ×' + fmt(e.servings)) +
                       (e.amount ? ' (' + e.amount + ')' : '') +
                       ' — ' + fmt(e.calories) + ' kcal, ' + fmt(e.sodium) + ' mg sodium');
        }
    }

    lines.push('');
    return lines.join('\n');
}

/* --- the reading ---------------------------------------------------- */

/* The tables above are handed over verbatim and the model is told they are the
 * whole truth, so a reading can only ever rearrange numbers that are already
 * on the page - it has no room to invent one. */
const AI_REPORT_SYSTEM = [
    'You read a DASH diet log and say what its numbers mean. The tables you are',
    'given are the whole truth: every figure in your answer must come from them,',
    'and you may not estimate one that is missing.',
    '',
    '- Never restate a total the table already shows. The reader can see that',
    '  potassium sits at 61%; tell them which days pulled it down.',
    '- Compare the days against each other. Variation between them is what a',
    '  column of totals hides and a reading can surface.',
    '- Name foods out of the log when you suggest a fix, not food groups in the',
    '  abstract. "Another half cup of the Greek yogurt" beats "more dairy".',
    '- Where you have been given a single day, say what would land the day',
    '  rather than inventing a trend across one data point.',
    '- If almost nothing is logged, say so in the headline and stop. Do not read',
    '  meaning into two entries.',
    '- No preamble, no encouragement, no restating the date range.',
].join('\n');

function aiReportTool() {
    return aiSchema(
        'write_reading',
        'Record a short reading of a DASH log: what the days show, what to watch, ' +
        'and what is working. Call this once.',
        {
            headline: {
                type: 'string',
                description: 'One sentence: the single most useful thing about this period.',
            },
            patterns: {
                type: 'array',
                items: { type: 'string' },
                description: 'Two to four observations about how the days differ from each ' +
                             'other. Not restatements of the totals.',
            },
            watch: {
                type: 'array',
                items: { type: 'string' },
                description: 'One to three targets being missed, each naming the food from ' +
                             'the log that would close the gap.',
            },
            working: {
                type: 'array',
                items: { type: 'string' },
                description: 'One or two things going well that are worth keeping.',
            },
        });
}

async function aiReading(plugin, markdown) {
    const tool = aiReportTool();
    const headers = await aiHeaders(plugin.settings);

    const res = await requestUrl({
        url: AI_ENDPOINT,
        method: 'POST',
        headers,
        throw: false,
        body: JSON.stringify({
            model: aiModelId(plugin.settings),
            max_tokens: 4096,
            thinking: { type: 'adaptive' },
            output_config: { effort: plugin.settings.aiEffort || 'medium' },
            system: AI_REPORT_SYSTEM,
            tools: [tool],
            tool_choice: { type: 'tool', name: tool.name },
            messages: [{ role: 'user', content: markdown }],
        }),
    });

    let body = null;
    try { body = JSON.parse(res.text); } catch (e) { /* handled below */ }

    if (res.status !== 200) {
        if (res.status === 401) forgetAntToken();
        const said = body && body.error && body.error.message;
        throw new Error(said || ('The API answered ' + res.status + '.'));
    }

    const block = ((body && body.content) || []).find(
        (b) => b.type === 'tool_use' && b.name === tool.name);
    if (!block) throw new Error('Claude answered without filling the form.');
    return block.input;
}

function readingMarkdown(reading, model) {
    const bullets = (label, items) => {
        const list = Array.isArray(items) ? items.filter(Boolean) : [];
        if (!list.length) return [];
        const out = ['', '**' + label + '**', ''];
        for (const i of list) out.push('- ' + String(i).trim());
        return out;
    };

    const lines = ['', '## Reading', ''];
    if (reading.headline) lines.push(String(reading.headline).trim());
    lines.push.apply(lines, bullets('Across the days', reading.patterns));
    lines.push.apply(lines, bullets('Worth watching', reading.watch));
    lines.push.apply(lines, bullets('Working', reading.working));
    lines.push('');
    /* Whose reading this is, so a note read months later is not mistaken for
     * something measured. */
    lines.push('*Read by ' + model + ' from the tables above. The numbers are ' +
               'the log; the interpretation is not.*');
    lines.push('');
    return lines.join('\n');
}

module.exports = class NoshPlugin extends Plugin {
    async onload() {
        await this.loadSettings();

        this.registerView(VIEW_TYPE_DASH, (leaf) => new NoshView(leaf, this));

        this.addRibbonIcon('heart', 'Open Nosh', () => this.activateView());

        this.addCommand({
            id: 'open-dash-tracker',
            name: 'Open Nosh',
            callback: () => this.activateView(),
        });

        /* Both report commands act on whatever the open view is showing, so
         * they need one to be open. */
        const withView = (fn) => async () => {
            const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_DASH)[0];
            if (!leaf || !(leaf.view instanceof NoshView)) {
                await this.activateView();
                new Notice('Opened Nosh — pick a day or week, then run this again.');
                return;
            }
            try {
                await fn(leaf.view);
            } catch (e) {
                new Notice('Nosh: ' + (e && e.message ? e.message : e), 8000);
            }
        };

        this.addCommand({
            id: 'export-nosh-report',
            name: 'Export report',
            callback: withView(async (view) => {
                const file = await view.exportReport(false);
                new Notice('Report written to ' + file.path);
            }),
        });

        this.addCommand({
            id: 'export-nosh-report-reading',
            name: 'Export report with a reading',
            callback: withView(async (view) => {
                const file = await view.exportReport(true);
                new Notice('Report written to ' + file.path);
            }),
        });

        this.addCommand({
            id: 'clear-dash-selection',
            name: 'Clear today',
            callback: async () => {
                delete this.settings.log[todayIso()];
                await this.saveSettings();
                this.refreshViews();
            },
        });

        this.addSettingTab(new NoshSettingTab(this.app, this));

        // Moved notes leave dangling log entries; the cache has to be up first.
        this.app.workspace.onLayoutReady(() => this.repairLog());

        // Keep the list in step with the vault.
        this.registerEvent(this.app.metadataCache.on('changed', () => this.refreshViews()));
        this.registerEvent(this.app.vault.on('delete', () => this.refreshViews()));
        this.registerEvent(this.app.vault.on('rename', () => this.refreshViews()));
    }

    async loadSettings() {
        const saved = (await this.loadData()) || {};
        this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
        this.settings.targets = Object.assign({}, DEFAULT_TARGETS, saved.targets);
        this.settings.hiddenNutrients = saved.hiddenNutrients || [];
        this.settings.hiddenGroups = saved.hiddenGroups || [];
        this.settings.weekStart = saved.weekStart === 0 ? 0 : 1;

        /* Three folder settings collapsed into one. Where the old three
         * shared a parent - which they did whenever Nosh made them - that
         * parent becomes the single folder and nothing on disk has to move. */
        if (saved.noshFolder === undefined) {
            const inherited = sharedParent([
                saved.mealsFolder, saved.ingredientsFolder,
                saved.reportsFolder, saved.folder,
            ]);
            if (inherited) this.settings.noshFolder = inherited;
        }
        for (const dead of ['folder', 'mealsFolder', 'ingredientsFolder', 'reportsFolder']) {
            delete this.settings[dead];
        }

        this.settings.groupTargets = {};
        for (const g of FOOD_GROUPS) {
            const fallback = DEFAULT_GROUP_TARGETS[g.key];
            const stored = (saved.groupTargets || {})[g.key] || {};
            this.settings.groupTargets[g.key] = {
                min: stored.min === undefined ? fallback.min : parseNum(stored.min),
                max: stored.max === undefined ? fallback.max : parseNum(stored.max),
            };
        }

        /* Before day/week tracking the log was a single flat selection with no
         * date. Carry it onto today rather than dropping it. */
        const raw = Object.assign({}, saved.log);
        if (!saved.log && saved.selection && Object.keys(saved.selection).length) {
            raw[todayIso()] = Object.assign({}, saved.selection);
        }
        this.settings.log = migrateLog(raw);
        this.settings.schema = LOG_SCHEMA;
        delete this.settings.selection;
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    refreshViews() {
        this.app.workspace.getLeavesOfType(VIEW_TYPE_DASH).forEach((leaf) => {
            if (leaf.view instanceof NoshView) leaf.view.refresh();
        });
    }

    async activateView() {
        const { workspace } = this.app;
        const existing = workspace.getLeavesOfType(VIEW_TYPE_DASH);
        if (existing.length) {
            workspace.revealLeaf(existing[0]);
            return;
        }
        const leaf = workspace.getRightLeaf(false);
        if (!leaf) return;
        await leaf.setViewState({ type: VIEW_TYPE_DASH, active: true });
        workspace.revealLeaf(leaf);
    }

    /* One pass over the vault, split by kind. Tags say which side of the
     * picker a note belongs on; the folder only narrows the search when the
     * vault owner has asked it to. */
    collectNotes() {
        const settings = this.settings;
        const restrict = settings.restrictToFolder ? noshFolder(settings, '') : '';
        const reports = noshFolder(settings, SUB_REPORTS);
        const ingredients = noshFolder(settings, SUB_INGREDIENTS);
        const out = { meal: [], ingredient: [] };

        for (const file of this.app.vault.getMarkdownFiles()) {
            if (restrict && !underFolder(file.path, restrict)) continue;
            /* An exported report is wall-to-wall nutrient numbers and would
             * read as one enormous meal if it were ever picked up. */
            if (underFolder(file.path, reports)) continue;

            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache) continue;
            const fm = cache.frontmatter;
            if (!fm) continue;

            const tags = getAllTags(cache) || [];
            const said = noteKind(tags, settings.tag);

            /* An untagged note is trusted only inside the Nosh folder. Across
             * a whole vault a stray `calories` field would otherwise promote
             * somebody's reading notes into the meal list. */
            if (!said && !(restrict && fm.calories !== undefined)) continue;

            const kind = (said && said !== 'any') ? said
                : (underFolder(file.path, ingredients) ? 'ingredient' : 'meal');

            const values = {};
            let hasAny = false;
            for (const n of NUTRIENTS) {
                if (fm[n.key] !== undefined) hasAny = true;
                values[n.key] = parseNum(fm[n.key]);
            }

            let hasGroups = false;
            for (const g of FOOD_GROUPS) {
                if (fm[g.key] !== undefined) hasGroups = true;
                values[g.key] = parseNum(fm[g.key]);
            }
            if (!hasAny && !hasGroups) continue;

            const meal = mealTypeOf(fm, tags);
            out[kind].push({
                path: file.path,
                name: file.basename,
                kind,
                meal,
                components: parseComponents(fm.components),
                /* Meals fold by the occasion they belong to; ingredients by
                 * what kind of food they are, which is the only one of the two
                 * that means anything for a banana. */
                section: kind === 'meal' ? '' : foodGroupOf(fm, values),
                /* Ingredients state the portion their numbers describe. The
                 * caveat in brackets is for the note, not for this list. */
                amount: typeof fm.amount === 'string'
                    ? fm.amount.replace(/\s*\([^)]*\)\s*$/, '').trim()
                    : '',
                values,
                hasGroups,
            });
        }

        /* A composed meal's numbers are its parts', added up. Correcting one
         * ingredient therefore corrects every meal built on it, and every day
         * those meals were eaten - which is the whole point of storing the
         * parts rather than a frozen total.
         *
         * The frontmatter total is the fallback for a component that has gone
         * missing, so a meal note shared without its ingredients still reads. */
        const byPath = Object.create(null);
        for (const list of [out.meal, out.ingredient]) {
            for (const r of list) byPath[r.path] = r;
        }

        const resolve = (r, seen) => {
            if (!r.components.length || r.composed !== undefined) return r.values;
            /* A cycle keeps the numbers it was written with rather than
             * recursing forever. */
            if (seen[r.path]) return r.values;
            seen[r.path] = true;

            const sum = {};
            for (const n of NUTRIENTS) sum[n.key] = 0;
            for (const g of FOOD_GROUPS) sum[g.key] = 0;

            let whole = true;
            for (const c of r.components) {
                const dest = this.app.metadataCache.getFirstLinkpathDest(c.link, r.path);
                const part = dest ? byPath[dest.path] : null;
                if (!part) { whole = false; break; }

                const vals = resolve(part, seen);
                for (const n of NUTRIENTS) sum[n.key] += vals[n.key] * c.servings;
                for (const g of FOOD_GROUPS) sum[g.key] += vals[g.key] * c.servings;
            }
            delete seen[r.path];

            r.composed = whole;
            if (whole) {
                r.values = sum;
                r.hasGroups = FOOD_GROUPS.some((g) => sum[g.key] > 0);
            }
            return r.values;
        };

        for (const list of [out.meal, out.ingredient]) {
            for (const r of list) resolve(r, Object.create(null));
        }

        const byOrder = (order) => (a, b) => {
            const ai = order.indexOf(a.section);
            const bi = order.indexOf(b.section);
            const av = ai === -1 ? order.length : ai;
            const bv = bi === -1 ? order.length : bi;
            if (av !== bv) return av - bv;
            return a.name.localeCompare(b.name);
        };
        out.meal.sort((a, b) => a.name.localeCompare(b.name));
        out.ingredient.sort(byOrder(GROUP_ORDER));

        return out;
    }

    /* Entries carried across from the flat log have no occasion. Give each one
     * the occasion its own note names, which is exactly where it showed up
     * before the log knew about occasions - so nothing appears to move. An
     * entry whose note is gone stays unassigned rather than being guessed at. */
    assignOccasions(notes) {
        const slotOf = Object.create(null);
        for (const r of notes.meal.concat(notes.ingredient)) slotOf[r.path] = r.meal;

        let changed = false;
        for (const iso of Object.keys(this.settings.log)) {
            const day = this.settings.log[iso];
            const loose = day[NO_OCCASION];
            if (!loose) continue;

            for (const path of Object.keys(loose)) {
                const slot = slotOf[path];
                if (!slot) continue;
                if (!day[slot]) day[slot] = {};
                day[slot][path] = parseNum(day[slot][path]) + parseNum(loose[path]);
                delete loose[path];
                changed = true;
            }
            if (!Object.keys(loose).length) delete day[NO_OCCASION];
        }
        return changed;
    }

    /* Notes get moved. An entry whose path no longer resolves is matched
     * back to a note of the same name, so a past day does not quietly lose
     * a meal. Meals win over ingredients when the two share a name. */
    async repairLog() {
        const known = Object.create(null);   // keyed by note name
        const index = (list) => {
            for (const r of list) {
                const base = r.name.toLowerCase();
                if (known[base] === undefined) known[base] = r.path;
            }
        };
        const notes = this.collectNotes();
        index(notes.meal);
        index(notes.ingredient);

        let changed = false;
        for (const iso of Object.keys(this.settings.log)) {
            const day = this.settings.log[iso];
            for (const occasion of Object.keys(day)) {
                const bucket = day[occasion];
                for (const path of Object.keys(bucket)) {
                    if (this.app.vault.getAbstractFileByPath(path)) continue;
                    const base = path.split('/').pop().replace(/\.md$/i, '').toLowerCase();
                    const found = known[base];
                    if (!found || found === path || bucket[found] !== undefined) continue;
                    bucket[found] = bucket[path];
                    delete bucket[path];
                    changed = true;
                }
            }
        }

        if (this.assignOccasions(notes)) changed = true;

        if (changed) {
            await this.saveSettings();
            this.refreshViews();
        }
    }
};

class NoshView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.query = '';
        this.mode = 'day';
        this.source = 'ingredients';
        this.collapsed = {};   // 'source/Meal' -> true, remembered while the view lives
        this.cursor = todayIso();
        this.occasion = occasionNow(new Date());
        /* Servings in the occasion on screen, rebuilt by renderList. Present
         * from the start so servingsOf() can be asked before the first draw. */
        this.dayServings = Object.create(null);
        /* The meal under construction: note path -> servings, plus the name it
         * will be saved under. Scratch only; nothing reaches the vault or the
         * log until it is logged or saved. */
        this.build = { parts: Object.create(null), name: '' };
    }

    getViewType() { return VIEW_TYPE_DASH; }
    getDisplayText() { return 'Nosh'; }
    getIcon() { return 'heart'; }

    async onOpen() {
        const root = this.contentEl;
        root.empty();
        root.addClass('dash-tracker');

        const header = root.createDiv({ cls: 'dash-header' });
        header.createEl('div', { cls: 'dash-title', text: 'Nosh' });

        const actions = header.createDiv({ cls: 'dash-actions' });

        const out = actions.createEl('button', { cls: 'dash-gear' });
        out.setAttr('aria-label', 'Export a report for what is on screen');
        setIcon(out, 'file-output');
        out.addEventListener('click', async () => {
            out.disabled = true;
            try {
                const file = await this.exportReport();
                new Notice('Report written to ' + file.path);
            } catch (e) {
                new Notice('Nosh: ' + (e && e.message ? e.message : e), 8000);
            }
            out.disabled = false;
        });

        const gear = actions.createEl('button', { cls: 'dash-gear' });
        gear.setAttr('aria-label', 'Nosh settings');
        setIcon(gear, 'settings');
        gear.addEventListener('click', () => this.openSettings());

        this.tabsEl = root.createDiv({ cls: 'dash-tabs' });
        this.navEl = root.createDiv({ cls: 'dash-nav' });

        /* Holds Today when it applies, and collapses to nothing when it
         * does not. Clear lives on the tabs' context menu instead. */
        this.dayActionsEl = root.createDiv({ cls: 'dash-day-actions' });

        this.summaryEl = root.createDiv({ cls: 'dash-summary' });
        this.totalsEl = root.createDiv({ cls: 'dash-totals' });
        this.bodyEl = root.createDiv({ cls: 'dash-body' });

        this.refresh();
    }

    async onClose() { this.contentEl.empty(); }

    /* app.setting is not part of the documented API, so the gear says where to
     * look rather than throwing if a future release moves it. */
    openSettings() {
        const setting = this.app.setting;
        if (!setting || typeof setting.open !== 'function') {
            new Notice('Open Settings → Community plugins → Nosh.');
            return;
        }
        setting.open();
        if (typeof setting.openTabById === 'function') {
            setting.openTabById(this.plugin.manifest.id);
        }
    }

    refresh() {
        const notes = this.plugin.collectNotes();
        this.lists = { meals: notes.meal, ingredients: notes.ingredient };
        /* Totals cover everything logged today, whichever tab is on screen. */
        this.recipes = this.lists.meals.concat(this.lists.ingredients);
        this.byPath = {};
        for (const r of this.recipes) this.byPath[r.path] = r;
        this.renderTabs();
        this.renderNav();
        this.renderTotals();
        this.renderBody();
    }

    setMode(mode) {
        if (this.mode === mode) return;
        this.mode = mode;
        this.refresh();
    }

    // --- data -------------------------------------------------------

    daysFor(mode) {
        return mode === 'week'
            ? weekDays(this.cursor, this.plugin.settings.weekStart)
            : [this.cursor];
    }

    daysInView() { return this.daysFor(this.mode); }

    entriesFor(iso) {
        const out = [];
        for (const row of logRows(this.plugin.settings.log, iso)) {
            const recipe = this.byPath[row.path];
            if (recipe) out.push({ recipe, servings: row.servings, occasion: row.occasion });
        }
        return out;
    }

    /* The same totals, kept apart by the occasion they were eaten at, so a bar
     * can show which meal put what into it. Chronological, because a segment's
     * position is then its own label: breakfast is always leftmost, and the
     * strip above the picker runs in the same order. */
    totalsByOccasion(days) {
        const out = [];
        const at = Object.create(null);

        for (const iso of days) {
            for (const e of this.entriesFor(iso)) {
                if (at[e.occasion] === undefined) {
                    at[e.occasion] = out.length;
                    const blank = { occasion: e.occasion, values: {} };
                    for (const n of NUTRIENTS) blank.values[n.key] = 0;
                    for (const g of FOOD_GROUPS) blank.values[g.key] = 0;
                    out.push(blank);
                }
                const into = out[at[e.occasion]].values;
                for (const n of NUTRIENTS) into[n.key] += e.recipe.values[n.key] * e.servings;
                for (const g of FOOD_GROUPS) into[g.key] += e.recipe.values[g.key] * e.servings;
            }
        }

        const rank = (name) => {
            const i = OCCASIONS.indexOf(name);
            return i === -1 ? OCCASIONS.length : i;
        };
        out.sort((a, b) => rank(a.occasion) - rank(b.occasion) ||
                           String(a.occasion).localeCompare(String(b.occasion)));
        return out;
    }

    /* Entries whose note has gone. entriesFor() cannot return them - there is
     * no recipe to return - so left alone they sit in the log counting for
     * nothing, and the day's totals are quietly short by however much they
     * were worth. repairLog() rescues the ones that were merely moved; these
     * are the ones where the name went too. */
    missingFor(days) {
        const out = [];
        for (const iso of days) {
            for (const row of logRows(this.plugin.settings.log, iso)) {
                if (this.byPath[row.path]) continue;
                out.push({
                    iso: iso,
                    occasion: row.occasion,
                    path: row.path,
                    name: row.path.split('/').pop().replace(/\.md$/i, ''),
                });
            }
        }
        return out;
    }

    async forgetMissing(days) {
        const log = this.plugin.settings.log;
        for (const gone of this.missingFor(days)) {
            logSet(log, gone.iso, gone.occasion, gone.path, 0);
        }
        await this.plugin.saveSettings();
        this.refresh();
    }

    totalsFor(days) {
        const totals = {};
        for (const n of NUTRIENTS) totals[n.key] = 0;
        for (const g of FOOD_GROUPS) totals[g.key] = 0;
        let meals = 0;
        for (const iso of days) {
            for (const e of this.entriesFor(iso)) {
                meals++;
                for (const n of NUTRIENTS) totals[n.key] += e.recipe.values[n.key] * e.servings;
                for (const g of FOOD_GROUPS) totals[g.key] += e.recipe.values[g.key] * e.servings;
            }
        }
        return { totals, meals };
    }

    /* What the day still has room for, in the terms a recipe can act on.
     * Only what is outstanding goes in - a brief padded with satisfied lines
     * buries the two numbers that actually matter. Hidden bars are left out
     * too, on the grounds that a target you do not watch is not one you want
     * dinner chosen around. */
    remainingBrief() {
        const settings = this.plugin.settings;
        const totals = this.totalsFor([this.cursor]).totals;
        const weekTotals = this.totalsFor(
            weekDays(this.cursor, settings.weekStart)).totals;

        const hiddenN = settings.hiddenNutrients || [];
        const hiddenG = settings.hiddenGroups || [];
        const short = [];
        const room = [];
        const groups = [];

        for (const n of NUTRIENTS) {
            if (hiddenN.includes(n.key)) continue;
            const target = parseNum(settings.targets[n.key]);
            if (!target) continue;
            const left = target - totals[n.key];

            if (n.dir === 'goal' && left > 0) {
                short.push('- ' + n.label + ': ' + fmt(left) + ' ' + n.unit +
                           ' short of ' + fmt(target) + ' ' + n.unit);
            } else if (n.dir === 'limit') {
                room.push('- ' + n.label + ': ' + fmt(Math.max(0, left)) + ' ' +
                          n.unit + ' left of ' + fmt(target) + ' ' + n.unit);
            }
        }

        for (const g of FOOD_GROUPS) {
            if (hiddenG.includes(g.key)) continue;
            const t = settings.groupTargets[g.key] || DEFAULT_GROUP_TARGETS[g.key];
            const min = parseNum(t.min);
            const max = parseNum(t.max);
            /* Weekly groups are judged against the week, exactly as the bars
             * judge them, so the brief cannot contradict what is on screen. */
            const perWeek = g.period === 'week';
            const have = perWeek ? weekTotals[g.key] : totals[g.key];
            const per = perWeek ? ' this week' : ' today';

            if (g.dir === 'limit') {
                if (max > 0) {
                    room.push('- ' + g.label + ': ' + fmt(Math.max(0, max - have)) +
                              ' of ' + fmt(max) + ' servings left' + per);
                }
            } else if (have < min) {
                groups.push('- ' + g.label + ': ' + fmt(min - have) + ' more' + per +
                            ' (aim ' + fmt(min) +
                            (max > min ? '-' + fmt(max) : '') + ')');
            }
        }

        return { short: short, room: room, groups: groups };
    }

    suggestionPrompt(asked) {
        const ask = asked || {};
        const brief = this.remainingBrief();
        const lines = [
            'Suggest one ' + this.occasion.toLowerCase() + ' to finish ' +
            humanDay(this.cursor) + '.',
        ];

        const serves = Math.max(1, parseNum(ask.serves) || 1);
        if (serves > 1) {
            lines.push('');
            lines.push('Cooking for ' + serves + '. Write the method for ' + serves +
                       ', but every number you return still describes one portion.');
        }

        const span = RECIPE_SPANS.find((r) => r.key === ask.span);
        if (span && span.line) {
            lines.push('');
            lines.push(span.line);
        }

        const use = String(ask.use || '').trim();
        if (use) {
            lines.push('');
            lines.push('Use these if they fit: ' + use + '.');
        }

        /* Ahead of the numbers, because it frames what is being asked for
         * rather than constraining it. The shortfalls say what the meal has
         * to do; this says what it should be like. */
        const taste = String(this.plugin.settings.suggestNote || '').trim();
        if (taste) {
            lines.push('');
            lines.push('What I like:');
            lines.push(taste);
        }

        const section = (title, rows) => {
            if (!rows.length) return;
            lines.push('');
            lines.push(title);
            lines.push.apply(lines, rows);
        };

        section('Still short of target:', brief.short);
        section('Food groups not yet met:', brief.groups);
        section('Room left before the limits:', brief.room);

        const extra = String(ask.extra || '').trim();
        if (extra) {
            lines.push('');
            lines.push(extra);
        }

        return lines.join('\n');
    }

    askSuggestion() {
        return new Promise((resolve) => {
            new NoshSuggestModal(this.app, this, resolve).open();
        });
    }

    /* The gap the bars have just drawn, turned into a question. Offered on a
     * day only: a week's shortfall is not something one meal answers. */
    renderSuggest() {
        const el = this.suggestEl;
        /* Absent in week view, where the picker that owns it is not drawn. */
        if (!el) return;
        el.empty();

        const brief = this.remainingBrief();
        const outstanding = brief.short.length + brief.groups.length;

        const go = el.createEl('button', { cls: 'dash-suggest-btn' });
        if (!outstanding) {
            go.setText('Every target met');
            go.disabled = true;
            go.setAttr('aria-label', 'Nothing is outstanding for today');
            return;
        }

        const badge = OCCASION_EMOJI[this.occasion];
        const asked = OCCASION_ASK[this.occasion] || this.occasion.toLowerCase();
        go.setText((badge ? badge + '  ' : '') + 'What' +
                   String.fromCharCode(8217) + 's for ' + asked + '?');
        go.setAttr('aria-label',
            'Ask Claude for a meal that fits what is left of the day');

        go.addEventListener('click', async () => {
            const asked = await this.askSuggestion();
            if (!asked) return;

            /* A household size is worth carrying to the next ask; what somebody
             * fancies tonight is not. */
            this.plugin.settings.suggestServes = asked.serves;
            await this.plugin.saveSettings();

            const said = go.textContent;
            go.disabled = true;
            go.setText('Thinking\u2026');
            try {
                const draft = await aiDraft(
                    this.plugin, 'suggest', this.suggestionPrompt(asked));
                draft.serves = asked.serves;
                new NoshDraftModal(this.app, this, 'suggest', draft).open();
            } catch (e) {
                new Notice('Nosh AI: ' + (e && e.message ? e.message : e), 8000);
            } finally {
                go.disabled = false;
                go.setText(said);
            }
        });
    }

    // --- chrome -----------------------------------------------------

    renderTabs() {
        this.tabsEl.empty();
        for (const m of ['day', 'week']) {
            const b = this.tabsEl.createEl('button', {
                cls: 'dash-tab', text: m === 'day' ? 'Day' : 'Week',
            });
            if (this.mode === m) b.addClass('is-active');
            b.addEventListener('click', () => this.setMode(m));

            /* Clearing is the one destructive action here and there is no
             * undo, so it hides behind a right-click rather than sitting out
             * in the open next to Export. */
            b.setAttr('aria-label', 'Right-click to clear');
            b.addEventListener('contextmenu', (evt) => {
                evt.preventDefault();
                this.clearMenu(m, evt);
            });
        }
    }

    /* Scope follows the tab that was right-clicked, not the active view, so
     * Week can wipe a week without switching to it first. The title spells the
     * span out, since the two need not agree. */
    clearMenu(mode, evt) {
        const days = this.daysFor(mode);
        const filled = days.some((d) => this.entriesFor(d).length);
        const span = mode === 'week' ? humanWeek(days) : humanDay(days[0]);

        const menu = new Menu();
        menu.addItem((item) => item
            .setTitle(filled ? 'Clear ' + span : 'Nothing logged for ' + span)
            .setIcon('trash-2')
            .setWarning(filled)
            .setDisabled(!filled)
            .onClick(() => this.onClear(mode)));
        menu.showAtMouseEvent(evt);
    }

    renderNav() {
        this.navEl.empty();
        const week = this.mode === 'week';
        const step = week ? 7 : 1;

        const prev = this.navEl.createEl('button', { cls: 'dash-nav-btn', text: '◀' });
        prev.setAttr('aria-label', week ? 'Previous week' : 'Previous day');
        prev.addEventListener('click', () => {
            this.cursor = addDays(this.cursor, -step);
            this.refresh();
        });

        const days = this.daysInView();
        const label = week ? humanWeek(days) : humanDay(this.cursor);
        this.navEl.createSpan({ cls: 'dash-nav-label', text: label });

        const next = this.navEl.createEl('button', { cls: 'dash-nav-btn', text: '▶' });
        next.setAttr('aria-label', week ? 'Next week' : 'Next day');
        next.addEventListener('click', () => {
            this.cursor = addDays(this.cursor, step);
            this.refresh();
        });

        this.dayActionsEl.empty();

        const today = todayIso();
        const isCurrent = week ? days.includes(today) : this.cursor === today;
        if (!isCurrent) {
            const jump = this.dayActionsEl.createEl('button', {
                cls: 'dash-today', text: week ? 'This week' : 'Today',
            });
            jump.addEventListener('click', () => {
                this.cursor = today;
                this.refresh();
            });
        }
    }

    async onClear(mode) {
        const days = this.daysFor(mode);
        if (!days.some((d) => this.entriesFor(d).length)) return;

        for (const d of days) delete this.plugin.settings.log[d];
        await this.plugin.saveSettings();
        this.refresh();
    }

    // --- bars -------------------------------------------------------

    renderBar(parent, opts) {
        const row = parent.createDiv({ cls: 'dash-metric' });
        row.setAttr('data-state', opts.state);
        row.setAttr('data-dir', opts.dir);

        const top = row.createDiv({ cls: 'dash-metric-top' });
        top.createSpan({ cls: 'dash-metric-name', text: opts.label });
        top.createSpan({ cls: 'dash-metric-val', text: opts.valueText });

        const bar = row.createDiv({ cls: 'dash-bar' });
        const width = Math.max(0, Math.min(100, opts.pct));
        const segs = (opts.segments || []).filter((seg) => seg.value > 0);

        if (segs.length > 1) {
            /* One block per occasion, sharing the width the single fill would
             * have had. The colour stays whatever the state made it - the bar
             * already says whether the target is met, and that must not turn
             * into a second thing it is saying. The breaks and the shading
             * separate the meals; the order says which is which. */
            const whole = segs.reduce((sum, seg) => sum + seg.value, 0);
            const strip = bar.createDiv({ cls: 'dash-bar-split' });
            strip.style.width = width + '%';

            segs.forEach((seg, i) => {
                const part = strip.createDiv({ cls: 'dash-bar-part' });
                part.style.flexGrow = String(seg.value / whole);
                part.style.opacity = String(1 - Math.min(i, 4) * 0.15);
                part.setAttr('aria-label', seg.label);
                part.setAttr('title', seg.label);
            });
        } else {
            const fill = bar.createDiv({ cls: 'dash-bar-fill' });
            fill.style.width = width + '%';
        }

        if (opts.minPct > 0 && opts.minPct < 100) {
            bar.createDiv({ cls: 'dash-bar-min' }).style.left = opts.minPct + '%';
        }
    }

    renderTotals() {
        const el = this.totalsEl;
        el.empty();

        const week = this.mode === 'week';
        const days = this.daysInView();
        const scale = week ? 7 : 1;
        const { totals, meals } = this.totalsFor(days);

        this.summaryEl.empty();
        if (!meals) {
            this.summaryEl.createSpan({
                text: week ? 'Nothing logged this week.'
                           : 'Nothing logged — tick a meal below.',
            });
        } else {
            this.summaryEl.createSpan({
                text: meals + (meals === 1 ? ' meal · ' : ' meals · ') +
                      fmt(totals.calories) + ' kcal' +
                      (week ? ' · ' + fmt(totals.calories / 7) + ' kcal/day avg' : ''),
            });
        }

        /* Said out loud rather than swallowed: a total that is short because
         * a note was deleted looks exactly like a day somebody ate less. */
        const gone = this.missingFor(days);
        if (gone.length) {
            const warn = this.summaryEl.createDiv({ cls: 'dash-missing' });
            const names = gone.map((g) => g.name);
            warn.createSpan({
                text: gone.length + (gone.length === 1 ? ' entry points' : ' entries point') +
                      ' at notes that are gone: ' + names.slice(0, 3).join(', ') +
                      (names.length > 3 ? ' and ' + (names.length - 3) + ' more' : ''),
            });
            const drop = warn.createEl('button', { text: 'Forget' });
            drop.setAttr('aria-label', 'Take these entries out of the log');
            drop.addEventListener('click', () => this.forgetMissing(days));
        }

        const split = this.totalsByOccasion(days);

        const hiddenN = this.plugin.settings.hiddenNutrients || [];
        for (const n of NUTRIENTS) {
            if (hiddenN.includes(n.key)) continue;
            const target = parseNum(this.plugin.settings.targets[n.key]) * scale;
            const value = totals[n.key];
            const pct = target > 0 ? (value / target) * 100 : 0;

            const state = nutrientState(n.dir, pct);

            this.renderBar(el, {
                label: n.label,
                valueText: fmt(value) + ' / ' + fmt(target) + ' ' + n.unit +
                           ' · ' + Math.round(pct) + '%',
                pct: pct, state: state, dir: n.dir,
                segments: split.map((sp) => ({
                    value: sp.values[n.key],
                    label: (sp.occasion || 'Unsorted') + ' \u00b7 ' +
                           fmt(sp.values[n.key]) + ' ' + n.unit,
                })),
            });
        }

        const hiddenG = this.plugin.settings.hiddenGroups || [];
        const visible = FOOD_GROUPS.filter((g) => !hiddenG.includes(g.key));
        if (!visible.length) return;

        const perDay = visible.filter((g) => g.period === 'day');
        const perWeek = visible.filter((g) => g.period === 'week');

        if (perDay.length) {
            el.createDiv({
                cls: 'dash-section',
                text: week ? 'Food groups · week' : 'Food groups · day',
            });
            if (!(this.recipes || []).some((r) => r.hasGroups)) {
                el.createDiv({
                    cls: 'dash-empty',
                    text: 'No meal carries serving counts yet. Add fields such as ' +
                          'serv_vegetables: 2 to a note’s frontmatter.',
                });
            }
            for (const g of perDay) this.renderGroup(el, g, totals[g.key], scale, split);
        }

        /* Weekly allowances are always shown against the whole week. In Day
         * view that means the week-to-date total, so the day you are logging
         * is read in the context of the allowance it draws down. */
        if (perWeek.length) {
            el.createDiv({
                cls: 'dash-section',
                text: week ? 'Food groups · per week' : 'Food groups · this week so far',
            });
            const weekDaysOf = weekDays(this.cursor, this.plugin.settings.weekStart);
            const weekTotals = week ? totals : this.totalsFor(weekDaysOf).totals;
            const weekSplit = week ? split : this.totalsByOccasion(weekDaysOf);
            for (const g of perWeek) this.renderGroup(el, g, weekTotals[g.key], 1, weekSplit);
        }
    }

    renderGroup(el, g, value, scale, split) {
        const t = this.plugin.settings.groupTargets[g.key] || DEFAULT_GROUP_TARGETS[g.key];
        const min = parseNum(t.min) * scale;
        const max = parseNum(t.max) * scale;
        const pct = max > 0 ? (value / max) * 100 : 0;
        const state = groupState(g, value, min, max);

        const targetText = g.dir === 'limit'
            ? '≤ ' + fmt(max)
            : (min === max ? fmt(max) : fmt(min) + '–' + fmt(max));

        this.renderBar(el, {
            label: g.label,
            valueText: fmt(value) + ' / ' + targetText + ' servings',
            pct: pct, state: state, dir: g.dir,
            minPct: g.dir === 'limit' || max <= 0 ? 0 : (min / max) * 100,
            segments: (split || []).map((sp) => ({
                value: sp.values[g.key],
                label: (sp.occasion || 'Unsorted') + ' \u00b7 ' +
                       servingsPhrase(sp.values[g.key]),
            })),
        });
    }

    // --- body -------------------------------------------------------

    renderBody() {
        this.bodyEl.empty();
        this.suggestEl = null;
        if (this.mode === 'week') this.renderWeekStrip();
        else this.renderPicker();
    }

    renderWeekStrip() {
        const el = this.bodyEl;
        const days = this.daysInView();
        const target = parseNum(this.plugin.settings.targets.calories) || 1;
        const today = todayIso();

        el.createDiv({ cls: 'dash-group', text: 'Days' });

        for (const iso of days) {
            const entries = this.entriesFor(iso);
            const kcal = entries.reduce(
                (s, e) => s + e.recipe.values.calories * e.servings, 0);

            const row = el.createDiv({ cls: 'dash-day' });
            if (iso === today) row.addClass('is-today');
            if (!entries.length) row.addClass('is-empty');

            row.createDiv({
                cls: 'dash-day-name',
                text: dateOf(iso).toLocaleDateString(undefined,
                    { weekday: 'short', day: 'numeric' }),
            });

            const mid = row.createDiv({ cls: 'dash-day-mid' });
            mid.createDiv({
                cls: 'dash-day-meta',
                text: entries.length
                    ? entries.length + (entries.length === 1 ? ' meal · ' : ' meals · ') + fmt(kcal) + ' kcal'
                    : '—',
            });
            const bar = mid.createDiv({ cls: 'dash-bar' });
            bar.createDiv({ cls: 'dash-bar-fill' }).style.width =
                Math.max(0, Math.min(100, (kcal / target) * 100)) + '%';

            row.addEventListener('click', () => {
                this.cursor = iso;
                this.mode = 'day';
                this.refresh();
            });
        }
    }

    /* Building draws on the ingredient list, so it answers as that tab for
     * everything the list rendering needs. */
    sourceDef() {
        const key = this.source === BUILD_KEY ? 'ingredients' : this.source;
        return SOURCES.find((s) => s.key === key) || SOURCES[0];
    }

    setSource(source) {
        if (this.source === source) return;
        this.source = source;
        this.renderBody();
    }

    renderPicker() {
        const el = this.bodyEl;
        const building = this.source === BUILD_KEY;
        const source = this.sourceDef();

        this.renderOccasions(el);

        /* Closes the occasion group: pick when you are eating, then ask what
         * to eat. The rule under it separates that question from the library
         * you would otherwise answer it from yourself. */
        this.suggestEl = el.createDiv({ cls: 'dash-suggest' });
        this.renderSuggest();
        el.createDiv({ cls: 'dash-rule' });

        const switcher = el.createDiv({ cls: 'dash-source' });
        const logged = this.occasionServings();

        for (const s of SOURCES) {
            const b = switcher.createEl('button', { cls: 'dash-source-btn' });
            if (!building && s.key === source.key) b.addClass('is-active');
            b.createSpan({ cls: 'dash-source-name', text: s.label });

            /* How many of this tab's notes are in the occasion on screen, so
             * the count answers the same question the strip above it does. */
            const n = ((this.lists && this.lists[s.key]) || [])
                .filter((r) => logged[r.path] > 0).length;
            if (n) b.createSpan({ cls: 'dash-source-count', text: String(n) });

            b.addEventListener('click', () => this.setSource(s.key));
        }

        const build = switcher.createEl('button', { cls: 'dash-source-btn' });
        if (building) build.addClass('is-active');
        build.createSpan({ cls: 'dash-source-name', text: 'Build' });

        /* Here the count is what is in the meal being assembled, which is the
         * only thing Build has to say about itself. */
        const waiting = Object.keys(this.build.parts).length;
        if (waiting) build.createSpan({ cls: 'dash-source-count', text: String(waiting) });

        build.setAttr('aria-label', 'Put a meal together out of ingredients');
        build.addEventListener('click', () => this.setSource(BUILD_KEY));

        /* A draft lands in the folder behind the tab you are on, so the box
         * follows the switcher rather than sitting above it. */
        if (building) this.renderBuild(el);
        else this.renderCompose(el, source);

        const row = el.createDiv({ cls: 'dash-filter' });
        const search = row.createEl('input', { cls: 'dash-search', type: 'text' });
        search.placeholder = 'Filter ' + source.label.toLowerCase() + '\u2026';
        search.value = this.query;
        search.addEventListener('input', () => {
            this.query = search.value.toLowerCase();
            this.renderList();
        });

        this.foldBtn = row.createEl('button', { cls: 'dash-fold' });
        this.foldBtn.addEventListener('click', () => this.toggleAll());

        this.listEl = el.createDiv({ cls: 'dash-list' });
        this.renderList();
    }

    /* Which occasion a tick lands in. The counts come off the log, so a glance
     * says what the day already holds without opening anything. */
    /* The five occasions, plus any other bucket this day actually holds: the
     * kind-slots older notes named their meal_type after, and the unassigned
     * bucket that entries land in when their note has gone. Without these the
     * strip would leave real servings counting towards the totals while being
     * invisible and impossible to take back off. */
    occasionsInPlay() {
        const names = OCCASIONS.slice();
        for (const row of logRows(this.plugin.settings.log, this.cursor)) {
            if (!names.includes(row.occasion)) names.push(row.occasion);
        }
        if (!names.includes(this.occasion)) names.push(this.occasion);
        return names;
    }

    /* Two rows: the three meals that give a day its shape, then the things
     * that hang off it. Legacy buckets join the second row, where they read
     * as leftovers rather than as somewhere to go on logging. */
    renderOccasions(el) {
        const strip = el.createDiv({ cls: 'dash-occasions' });
        const rows = logRows(this.plugin.settings.log, this.cursor);
        const names = this.occasionsInPlay();

        const main = names.filter((n) => OCCASION_ROW.includes(n));
        const rest = names.filter((n) => !OCCASION_ROW.includes(n));

        for (const group of [main, rest]) {
            if (!group.length) continue;
            const line = strip.createDiv({ cls: 'dash-occasion-row' });
            for (const name of group) this.renderOccasion(line, name, rows);
        }
    }

    renderOccasion(line, name, rows) {
        const b = line.createEl('button', { cls: 'dash-occasion' });
        if (name === this.occasion) b.addClass('is-active');
        /* The unassigned bucket has no name of its own to show. */
        if (!OCCASIONS.includes(name)) b.addClass('is-legacy');
        b.createSpan({ cls: 'dash-occasion-name', text: occasionLabel(name) });

        const n = rows.filter((r) => r.occasion === name).length;
        if (n) b.createSpan({ cls: 'dash-occasion-count', text: String(n) });

        b.addEventListener('click', () => {
            this.occasion = name;
            this.renderBody();
        });
    }

    /* The meal being assembled. None of it exists in the vault yet, which is
     * the point - a combination only earns a note once it gets repeated. */
    renderBuild(el) {
        const box = el.createDiv({ cls: 'dash-build' });

        const name = box.createEl('input', { cls: 'dash-build-name', type: 'text' });
        name.placeholder = 'Name this meal to save it\u2026';
        name.value = this.build.name;
        name.addEventListener('input', () => {
            this.build.name = name.value;
            this.renderBuildBar();
        });

        this.buildBarEl = box.createDiv({ cls: 'dash-build-bar' });
        this.renderBuildBar();
    }

    buildParts() {
        const out = [];
        for (const path of Object.keys(this.build.parts)) {
            const recipe = this.byPath[path];
            const servings = parseNum(this.build.parts[path]);
            if (recipe && servings > 0) out.push({ recipe, servings });
        }
        return out;
    }

    renderBuildBar() {
        const el = this.buildBarEl;
        if (!el) return;
        el.empty();

        const parts = this.buildParts();
        if (!parts.length) {
            el.createSpan({
                cls: 'dash-build-hint',
                text: 'Tick ingredients below to put a meal together.',
            });
            return;
        }

        const kcal = parts.reduce((sum, p) => sum + p.recipe.values.calories * p.servings, 0);
        el.createSpan({
            cls: 'dash-build-sum',
            text: parts.length + (parts.length === 1 ? ' ingredient' : ' ingredients') +
                  ' \u00b7 ' + fmt(kcal) + ' kcal',
        });

        const actions = el.createDiv({ cls: 'dash-build-actions' });

        const once = actions.createEl('button', { text: 'Log it' });
        once.setAttr('aria-label', 'Log these ingredients without saving a meal note');
        once.addEventListener('click', () => this.logBuild(false));

        const keep = actions.createEl('button', { cls: 'mod-cta', text: 'Save & log' });
        keep.disabled = !this.build.name.trim();
        keep.setAttr('aria-label', this.build.name.trim()
            ? 'Save this as a meal note, then log it'
            : 'Name the meal to save it');
        keep.addEventListener('click', () => this.logBuild(true));
    }

    /* Logging without saving files each ingredient on its own, which is what a
     * one-off actually is. Saving writes a meal note that names its parts and
     * logs that instead - one entry on the day rather than five. */
    async logBuild(save) {
        const parts = this.buildParts();
        if (!parts.length) return;

        if (save) {
            const file = await this.saveBuild(parts);
            if (!file) return;
            await this.setServings(file.path, 1, this.occasion);
            new Notice('Saved and logged ' + file.basename);
        } else {
            for (const p of parts) {
                const had = logRows(this.plugin.settings.log, this.cursor)
                    .filter((r) => r.path === p.recipe.path && r.occasion === this.occasion)
                    .reduce((sum, r) => sum + r.servings, 0);
                await this.setServings(p.recipe.path, had + p.servings, this.occasion);
            }
            new Notice('Logged ' + parts.length + ' to ' + this.occasion.toLowerCase());
        }

        this.build = { parts: Object.create(null), name: '' };
        this.source = save ? 'meals' : 'ingredients';
        this.refresh();
    }

    async saveBuild(parts) {
        const vault = this.app.vault;
        const settings = this.plugin.settings;
        const folder = noshFolder(settings, SUB_MEALS);
        const name = safeName(this.build.name);

        await ensureFolder(vault, folder);

        const wanted = (folder ? folder + '/' : '') + name + '.md';
        const found = vault.getAbstractFileByPath(wanted);
        const clash = found && found.extension === 'md' ? found : null;

        const choice = clash ? await this.askExisting(name) : 'new';
        if (!choice) return null;
        if (choice === 'existing') return clash;

        const body = composedMealNote(name, parts, this.occasion, this.cursor, settings);
        let file;
        if (choice === 'replace') {
            await vault.modify(clash, body);
            file = clash;
        } else {
            file = await vault.create(freePath(vault, folder, name), body);
        }

        await awaitCache(this.app, file, 2000);
        this.plugin.refreshViews();
        return file;
    }

    /* The food groups actually on screen for this tab, which is what a fold
     * applies to - not every group in the list, most of which are empty. The
     * meals tab has no sections at all, so nothing there folds. */
    sectionKeys(source) {
        if (!source.sectioned) return [];
        const names = [];
        for (const r of (this.lists[source.key] || [])) {
            const name = r.section || GROUP_OTHER;
            if (!names.includes(name)) names.push(name);
        }
        return names.map((n) => source.key + '/' + n);
    }

    /* One control for the lot. If anything is still open it folds everything
     * away; once it is all folded it opens back up, so the button never gets
     * stuck saying the same thing. */
    toggleAll() {
        const source = this.sourceDef();
        const keys = this.sectionKeys(source);
        const fold = keys.some((k) => !this.collapsed[k]);
        for (const k of keys) this.collapsed[k] = fold;
        this.renderList();
    }

    emptyMessage(source, filtering) {
        if (filtering) return 'No ' + source.noun + ' matches that filter.';

        const settings = this.plugin.settings;
        const tag = settings.tag || 'nutrition';
        const where = settings.restrictToFolder
            ? noshFolder(settings, '') || 'the vault'
            : 'the vault';
        return 'No ' + source.noun + ' notes in ' + where + '. Tag a note #' +
               tag + '/' + source.kind + ' and give it frontmatter such as ' +
               'calories, sodium_mg, potassium_mg.';
    }

    renderList() {
        const el = this.listEl;
        el.empty();

        /* Editing Breakfast shows what Breakfast holds, not what the day does. */
        this.dayServings = this.occasionServings();

        /* Building draws on ingredients whichever tab was last on screen. */
        const source = this.sourceDef();
        const listKey = this.source === BUILD_KEY ? 'ingredients' : source.key;
        const items = ((this.lists && this.lists[listKey]) || []).filter(
            (r) => !this.query || r.name.toLowerCase().includes(this.query));

        /* A filter forces every section open, so the fold control has nothing
         * to say while one is typed. */
        if (this.foldBtn) {
            const keys = this.sectionKeys(source);
            const useful = !this.query && keys.length > 1;
            this.foldBtn.toggleClass('is-hidden', !useful);
            if (useful) {
                this.foldBtn.setText(
                    keys.some((k) => !this.collapsed[k]) ? 'Collapse all' : 'Expand all');
            }
        }

        if (!items.length) {
            el.createDiv({ cls: 'dash-empty', text: this.emptyMessage(source, !!this.query) });
            return;
        }

        /* Meals come through in one alphabetical run with no headings, so there
         * is nothing to fold and nothing to scan past. */
        if (!source.sectioned) {
            for (const r of items) this.renderItem(el, r);
            return;
        }

        /* One section per food group, in the order they first appear, which
         * the sort has already put right. Anything that scores no group at
         * all gathers under Other at the end. */
        const sections = [];
        const byMeal = Object.create(null);   // section names come from notes
        for (const r of items) {
            const name = r.section || GROUP_OTHER;
            if (!byMeal[name]) {
                byMeal[name] = { name, items: [] };
                sections.push(byMeal[name]);
            }
            byMeal[name].items.push(r);
        }

        // A filter is a search: it shows its hits rather than where they are hiding.
        const filtering = !!this.query;

        for (const sec of sections) {
            const key = source.key + '/' + sec.name;
            const open = filtering || !this.collapsed[key];
            const chosen = sec.items.filter((r) => this.servingsOf(r.path) > 0).length;

            const head = el.createEl(filtering ? 'div' : 'button',
                { cls: 'dash-group dash-group-head' });
            if (chosen) head.addClass('has-selected');

            if (!filtering) {
                head.createSpan({ cls: 'dash-group-caret', text: open ? '\u25be' : '\u25b8' });
                head.addEventListener('click', () => {
                    this.collapsed[key] = open;
                    this.keepScroll(() => this.renderList());
                });
            }
            head.createSpan({ cls: 'dash-group-name', text: sec.name });
            head.createSpan({
                cls: 'dash-group-count',
                text: chosen ? chosen + ' of ' + sec.items.length : String(sec.items.length),
            });

            if (open) for (const r of sec.items) this.renderItem(el, r);
        }
    }

    /* Servings logged in the occasion on screen, keyed by note path. The list
     * and the tab counts both read the same map, so a badge cannot disagree
     * with the rows underneath it. */
    occasionServings() {
        const out = Object.create(null);
        for (const row of logRows(this.plugin.settings.log, this.cursor)) {
            if (row.occasion !== this.occasion) continue;
            out[row.path] = (out[row.path] || 0) + row.servings;
        }
        return out;
    }

    /* Obsidian's own view-content does the scrolling, so find whatever above
     * the list is actually scrollable rather than assuming. */
    scrollBox() {
        let el = this.listEl;
        while (el && el !== document.body) {
            const flow = window.getComputedStyle(el).overflowY;
            if ((flow === 'auto' || flow === 'scroll') && el.scrollHeight > el.clientHeight) {
                return el;
            }
            el = el.parentElement;
        }
        return null;
    }

    /* empty() collapses the list to nothing for an instant, and the browser
     * clamps the scroll offset to fit before the rows come back. Hold the
     * offset across the rebuild, or ticking a box throws you to the top. */
    keepScroll(redraw) {
        const box = this.scrollBox();
        const top = box ? box.scrollTop : 0;
        redraw();
        if (box) box.scrollTop = top;
    }

    /* Where a tick lands: in the meal being built, or in the occasion of the
     * day being logged. The list itself does not need to know which. */
    servingsOf(path) {
        if (this.source === BUILD_KEY) return parseNum(this.build.parts[path]);
        return parseNum(this.dayServings[path]);
    }

    async tick(path, servings) {
        if (this.source === BUILD_KEY) {
            if (servings > 0) this.build.parts[path] = roundServings(servings);
            else delete this.build.parts[path];
            this.keepScroll(() => {
                this.renderBuildBar();
                this.renderList();
            });
            return;
        }
        await this.setServings(path, servings, this.occasion);
    }

    renderItem(el, r) {
        const servings = this.servingsOf(r.path);
        const isOn = servings > 0;

        const item = el.createDiv({ cls: 'dash-item' });
        if (isOn) item.addClass('is-selected');

        const box = item.createEl('input', { cls: 'dash-check', type: 'checkbox' });
        box.checked = isOn;
        box.addEventListener('change', () => this.tick(r.path, box.checked ? 1 : 0));

        const label = item.createDiv({ cls: 'dash-item-label' });
        label.createDiv({ cls: 'dash-item-name', text: r.name });
        const meta = label.createDiv({ cls: 'dash-item-meta' });
        meta.setText((r.amount ? r.amount + ' \u00b7 ' : '') +
                     fmt(r.values.calories) + ' kcal \u00b7 ' +
                     fmt(r.values.sodium_mg) + ' mg sodium');
        if (!r.hasGroups) meta.createSpan({ cls: 'dash-item-warn', text: ' \u00b7 no servings' });
        label.addEventListener('click', () => this.tick(r.path, isOn ? 0 : 1));

        if (isOn) {
            const step = item.createDiv({ cls: 'dash-serv' });
            const minus = step.createEl('button', { text: '\u2212' });
            minus.setAttr('aria-label', 'Fewer servings');
            minus.addEventListener('click', (e) => {
                e.stopPropagation();
                this.tick(r.path, Math.max(0, servings - SERVING_STEP));
            });
            step.createSpan({ cls: 'dash-serv-val', text: servings + '\u00d7' });
            const plus = step.createEl('button', { text: '+' });
            plus.setAttr('aria-label', 'More servings');
            plus.addEventListener('click', (e) => {
                e.stopPropagation();
                this.tick(r.path, servings + SERVING_STEP);
            });
        }

        const open = item.createEl('button', { cls: 'dash-open', text: '\u2197' });
        open.setAttr('aria-label', 'Open note');
        open.addEventListener('click', (e) => {
            e.stopPropagation();
            const file = this.app.vault.getAbstractFileByPath(r.path);
            if (file) this.app.workspace.getLeaf(false).openFile(file);
        });
    }

    /* Describe it, and Claude fills in the numbers. Which tab you are on picks
     * the prompt and the folder. Nothing reaches the vault until the draft has
     * been read, so a bad guess costs a glance. */
    renderCompose(parent, source) {
        const box = parent.createDiv({ cls: 'dash-ai' });
        const input = box.createEl('input', { cls: 'dash-ai-input', type: 'text' });
        input.placeholder = 'Describe a ' + source.noun + '\u2026';
        const go = box.createEl('button', { cls: 'dash-ai-go', text: 'Draft' });

        const run = async () => {
            const text = input.value.trim();
            if (!text) return;

            input.disabled = true;
            go.disabled = true;
            /* Something to watch while it thinks, rather than a dead button. */
            go.empty();
            go.createSpan({ cls: 'dash-ai-spin', text: '\ud83e\udd66' });
            try {
                const draft = await aiDraft(this.plugin, source.key, text);
                input.value = '';
                new NoshDraftModal(this.app, this, source.key, draft).open();
            } catch (e) {
                new Notice('Nosh AI: ' + (e && e.message ? e.message : e), 8000);
            } finally {
                input.disabled = false;
                go.disabled = false;
                go.setText('Draft');
            }
        };

        go.addEventListener('click', run);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    }

    async createFromDraft(kind, draft, log) {
        const spec = AI_KINDS[kind] || AI_KINDS.ingredients;
        const vault = this.app.vault;
        const folder = noshFolder(this.plugin.settings, spec.sub);
        const name = safeName(draft.name);

        await ensureFolder(vault, folder);

        const wanted = (folder ? folder + '/' : '') + name + '.md';
        const found = vault.getAbstractFileByPath(wanted);
        const clash = found && found.extension === 'md' ? found : null;

        const choice = clash ? await this.askExisting(name) : 'new';
        if (!choice) return;

        /* Nothing is written at all when the note is already there and good.
         * The day just gains a serving of what the vault already knows. */
        if (choice === 'existing') {
            if (log) await this.setServings(clash.path, 1, this.occasion);
            new Notice(log ? 'Logged ' + name : name + ' is already in the vault');
            return;
        }

        const body = spec.note(draft, this.cursor, this.plugin.settings);
        let file;
        if (choice === 'replace') {
            await vault.modify(clash, body);
            file = clash;
        } else {
            file = await vault.create(freePath(vault, folder, name), body);
        }

        /* A logged path only renders once collectNotes() can see the note, so
         * wait for the index before ticking the day. */
        await awaitCache(this.app, file, 2000);
        this.plugin.refreshViews();
        if (log) await this.setServings(file.path, 1, this.occasion);

        new Notice((choice === 'replace' ? 'Updated ' : 'Added ') + file.basename);
    }

    askExisting(name) {
        return new Promise((resolve) => {
            new NoshExistsModal(this.app, name, resolve).open();
        });
    }

    /* Everything a report needs, gathered once: the totals the bars already
     * read, plus the day-by-day detail they have no room to show. */
    reportData() {
        const week = this.mode === 'week';
        const days = this.daysInView();
        const scale = week ? 7 : 1;
        const settings = this.plugin.settings;
        const totalled = this.totalsFor(days);
        const totals = totalled.totals;

        const nutrients = NUTRIENTS.map((n) => {
            const target = parseNum(settings.targets[n.key]) * scale;
            const value = totals[n.key];
            const pct = target > 0 ? (value / target) * 100 : 0;
            return {
                key: n.key, label: n.label, unit: n.unit, dir: n.dir,
                value: value, target: target, pct: pct,
                state: nutrientState(n.dir, pct),
            };
        });

        /* Weekly allowances are read against the whole week even in Day view,
         * matching the bars: a day is judged by the allowance it draws down. */
        const weekTotals = week ? totals
            : this.totalsFor(weekDays(this.cursor, settings.weekStart)).totals;

        const groups = FOOD_GROUPS.map((g) => {
            const t = settings.groupTargets[g.key] || DEFAULT_GROUP_TARGETS[g.key];
            const perWeek = g.period === 'week';
            const s = perWeek ? 1 : scale;
            const min = parseNum(t.min) * s;
            const max = parseNum(t.max) * s;
            const value = perWeek ? weekTotals[g.key] : totals[g.key];
            return {
                key: g.key, label: g.label, period: g.period, dir: g.dir,
                value: value, min: min, max: max,
                state: groupState(g, value, min, max),
            };
        });

        const byDay = days.map((iso) => ({
            iso: iso,
            label: humanDay(iso),
            entries: this.entriesFor(iso).map((e) => ({
                name: e.recipe.name,
                /* Where it was actually eaten. The note's own meal_type only
                 * ever said where it was eaten the first time, and a report
                 * that used it filed a banana under Breakfast whatever the
                 * sidebar showed. */
                meal: occasionLabel(e.occasion),
                amount: e.recipe.amount,
                servings: e.servings,
                calories: e.recipe.values.calories * e.servings,
                sodium: e.recipe.values.sodium_mg * e.servings,
            })),
        }));

        return {
            mode: week ? 'week' : 'day',
            span: week ? humanWeek(days) : humanDay(this.cursor),
            days: days, meals: totalled.meals, totals: totals,
            nutrients: nutrients, groups: groups, byDay: byDay,
        };
    }

    /* The tables are written whatever happens; a reading is an extra section
     * on top. If the API is down you still get the report, and a notice
     * saying why it came without one. */
    async exportReport(withReading) {
        const settings = this.plugin.settings;
        const r = this.reportData();
        let body = reportMarkdown(r);

        const wants = withReading === undefined ? !!settings.aiReading : withReading;
        if (wants) {
            new Notice('Reading the log…');
            try {
                const reading = await aiReading(this.plugin, body);
                body += readingMarkdown(reading, aiModelId(settings));
            } catch (e) {
                new Notice('Report written without a reading: ' +
                           (e && e.message ? e.message : e), 8000);
            }
        }

        const folder = noshFolder(settings, SUB_REPORTS);
        await ensureFolder(this.app.vault, folder);
        const path = freePath(this.app.vault, folder, safeName(reportTitle(r)));
        const file = await this.app.vault.create(path, body);
        await this.app.workspace.getLeaf(false).openFile(file);
        return file;
    }

    /* Until the picker logs into an occasion of its own, servings stay in
     * whichever bucket they already sit in, so nudging the stepper edits the
     * entry that is there rather than opening a second one beside it. */
    async setServings(path, servings, occasion) {
        const log = this.plugin.settings.log;
        const rows = logRows(log, this.cursor).filter((r) => r.path === path);
        const slot = occasion !== undefined ? occasion
            : (rows.length ? rows[0].occasion
                           : ((this.byPath[path] || {}).meal || NO_OCCASION));

        /* Setting a total collapses any duplicates for the same note, so the
         * number on screen and the number in the log cannot disagree. */
        if (occasion === undefined) {
            for (const r of rows) {
                if (r.occasion !== slot) logSet(log, this.cursor, r.occasion, path, 0);
            }
        }
        logSet(log, this.cursor, slot, path, servings);

        await this.plugin.saveSettings();
        this.keepScroll(() => {
            this.renderNav();
            this.renderTotals();
            this.renderSuggest();
            this.renderList();
        });
    }
}

class NoshSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Meal tag')
            .setDesc('Notes carrying this tag are offered in the picker. Leave empty to match any note with a calories field.')
            .addText((t) => t
                .setPlaceholder('nutrition')
                .setValue(this.plugin.settings.tag)
                .onChange(async (v) => {
                    this.plugin.settings.tag = v.trim();
                    await this.plugin.saveSettings();
                    this.plugin.refreshViews();
                }));

        new Setting(containerEl)
            .setName('Nosh folder')
            .setDesc('Where Nosh files what it creates. It makes Meals, Ingredients ' +
                     'and Reports underneath. A vault-relative path; empty puts them ' +
                     'at the vault root.')
            .addText((t) => t
                .setPlaceholder('Nosh')
                .setValue(this.plugin.settings.noshFolder)
                .onChange(async (v) => {
                    this.plugin.settings.noshFolder = v.trim();
                    await this.plugin.saveSettings();
                    this.plugin.refreshViews();
                }));

        new Setting(containerEl)
            .setName('Only look in the Nosh folder')
            .setDesc('Off, Nosh reads tagged notes wherever they live, so a vault that ' +
                     'already keeps its recipes somewhere needs no rearranging. On, it ' +
                     'ignores everything outside the folder above.')
            .addToggle((t) => t
                .setValue(!!this.plugin.settings.restrictToFolder)
                .onChange(async (v) => {
                    this.plugin.settings.restrictToFolder = v;
                    await this.plugin.saveSettings();
                    this.plugin.refreshViews();
                }));

        containerEl.createDiv({
            cls: 'setting-item-description',
            text: 'A note is a meal or an ingredient by its tags \u2014 #' + (this.plugin.settings.tag || 'nutrition') +
                  '/meal or #' + (this.plugin.settings.tag || 'nutrition') + '/ingredient. Meals fold into a section per ' +
                  'occasion, read from a meal_type field. Ingredients fold by food ' +
                  'group, worked out from their DASH servings or named outright in a ' +
                  'group field.',
        });

        new Setting(containerEl)
            .setName('Week starts on')
            .setDesc('Which day the Week tab groups from.')
            .addDropdown((d) => d
                .addOption('1', 'Monday')
                .addOption('0', 'Sunday')
                .setValue(String(this.plugin.settings.weekStart))
                .onChange(async (v) => {
                    this.plugin.settings.weekStart = v === '0' ? 0 : 1;
                    await this.plugin.saveSettings();
                    this.plugin.refreshViews();
                }));

        new Setting(containerEl).setName('AI').setHeading();

        new Setting(containerEl)
            .setName('Credentials')
            .setDesc('The ant CLI keeps the credential out of the vault, but wants a desktop '
                     + 'and a prior "ant auth login". An API key works everywhere, mobile '
                     + 'included, and is kept in this plugin\u2019s data.json \u2014 which is '
                     + 'inside the vault, and syncs wherever the vault syncs.')
            .addDropdown((d) => d
                .addOption('ant', 'ant CLI profile')
                .addOption('key', 'API key')
                .setValue(this.plugin.settings.aiAuth)
                .onChange(async (v) => {
                    this.plugin.settings.aiAuth = v;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        if (this.plugin.settings.aiAuth === 'key') {
            new Setting(containerEl)
                .setName('API key')
                .setDesc('Stored in the vault. Prefer the ant profile on a machine that has it.')
                .addText((t) => {
                    t.inputEl.type = 'password';
                    t.setPlaceholder('sk-ant-\u2026')
                        .setValue(this.plugin.settings.aiApiKey)
                        .onChange(async (v) => {
                            this.plugin.settings.aiApiKey = v.trim();
                            await this.plugin.saveSettings();
                        });
                });
        }

        new Setting(containerEl)
            .setName('Model for the numbers')
            .setDesc('Used when a description is turned into nutrition \u2014 ingredients, '
                     + 'meals, and the reading on a report. Sonnet is quick and cheap '
                     + 'enough to log a meal without thinking about the cost. Opus is the '
                     + 'better guesser on composite or unfamiliar dishes, at roughly two '
                     + 'and a half times the price.')
            .addDropdown((d) => {
                for (const m of AI_MODELS) d.addOption(m.id, m.label);
                d.setValue(aiModelId(this.plugin.settings))
                    .onChange(async (v) => {
                        this.plugin.settings.aiModel = v;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('Model for suggestions')
            .setDesc('Used by What\u2019s for\u2026 Inventing a meal worth cooking is a '
                     + 'different job from costing one that has already been eaten, and it '
                     + 'is the one where Opus earns its price. Runs once a day rather than '
                     + 'once a mouthful.')
            .addDropdown((d) => {
                for (const m of AI_MODELS) d.addOption(m.id, m.label);
                d.setValue(aiModelId(this.plugin.settings, 'aiSuggestModel'))
                    .onChange(async (v) => {
                        this.plugin.settings.aiSuggestModel = v;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('Effort')
            .setDesc('How hard the model works at the estimate. Medium suits everyday food; '
                     + 'raise it for composite or unfamiliar dishes.')
            .addDropdown((d) => d
                .addOption('low', 'Low')
                .addOption('medium', 'Medium')
                .addOption('high', 'High')
                .setValue(this.plugin.settings.aiEffort)
                .onChange(async (v) => {
                    this.plugin.settings.aiEffort = v;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Read the log in reports')
            .setDesc('Adds a Reading section to an exported report — what the days show, '
                     + 'what to watch — written from the tables in the report itself. '
                     + 'The palette has both commands either way.')
            .addToggle((tg) => tg
                .setValue(!!this.plugin.settings.aiReading)
                .onChange(async (v) => {
                    this.plugin.settings.aiReading = v;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Suggestion preferences')
            .setDesc('Added to the What\u2019s for\u2026 prompt in your own words: cuisines '
                     + 'you like, what you will not eat, how adventurous to be, what you '
                     + 'have in the cupboard. Empty, Claude works from the numbers alone.')
            .addTextArea((t) => {
                t.setPlaceholder('I like all cuisines and I like getting creative '
                                 + '\u2014 surprise me!')
                    .setValue(this.plugin.settings.suggestNote)
                    .onChange(async (v) => {
                        this.plugin.settings.suggestNote = v;
                        await this.plugin.saveSettings();
                    });
                t.inputEl.rows = 3;
                t.inputEl.addClass('dash-setting-area');
            });

        new Setting(containerEl)
            .setName('Test credentials')
            .setDesc('One short request, to find out whether the way in works.')
            .addButton((b) => b
                .setButtonText('Test')
                .onClick(async () => {
                    b.setDisabled(true).setButtonText('\u2026');
                    try {
                        await aiPing(this.plugin);
                        new Notice('Nosh AI: credentials work.');
                    } catch (e) {
                        new Notice('Nosh AI: ' + (e && e.message ? e.message : e), 8000);
                    }
                    b.setDisabled(false).setButtonText('Test');
                }));

        new Setting(containerEl).setName('Daily nutrient targets').setHeading();
        containerEl.createDiv({
            cls: 'setting-item-description',
            text: 'The Week tab multiplies each of these by seven.',
        });

        for (const n of NUTRIENTS) {
            const hidden = (this.plugin.settings.hiddenNutrients || []).includes(n.key);
            const note = n.dir === 'goal' ? 'Aim to reach this.'
                : n.dir === 'limit' ? 'Aim to stay under this.'
                : 'Shown for reference.';

            new Setting(containerEl)
                .setName(n.label + ' (' + n.unit + ')')
                .setDesc(note + ' Reads the ' + n.key + ' frontmatter field.')
                .addText((t) => t
                    .setValue(String(this.plugin.settings.targets[n.key]))
                    .onChange(async (v) => {
                        this.plugin.settings.targets[n.key] = parseNum(v);
                        await this.plugin.saveSettings();
                        this.plugin.refreshViews();
                    }))
                .addToggle((tg) => tg
                    .setTooltip('Show this bar')
                    .setValue(!hidden)
                    .onChange(async (show) => {
                        const set = new Set(this.plugin.settings.hiddenNutrients || []);
                        if (show) set.delete(n.key); else set.add(n.key);
                        this.plugin.settings.hiddenNutrients = Array.from(set);
                        await this.plugin.saveSettings();
                        this.plugin.refreshViews();
                    }));
        }

        new Setting(containerEl).setName('Food group servings').setHeading();
        containerEl.createDiv({
            cls: 'setting-item-description',
            text: 'Minimum and maximum servings for each DASH food group. ' +
                  'Per-day groups are multiplied by seven in the Week tab; ' +
                  'per-week groups are already weekly.',
        });

        for (const g of FOOD_GROUPS) {
            const hidden = (this.plugin.settings.hiddenGroups || []).includes(g.key);
            const t = this.plugin.settings.groupTargets[g.key];
            const per = g.period === 'week' ? 'per week' : 'per day';

            new Setting(containerEl)
                .setName(g.label + ' (' + per + ')')
                .setDesc('Reads the ' + g.key + ' frontmatter field.')
                .addText((c) => {
                    c.inputEl.type = 'number';
                    c.inputEl.style.width = '4em';
                    c.inputEl.setAttr('aria-label', 'Minimum servings');
                    c.setValue(String(t.min)).onChange(async (v) => {
                        this.plugin.settings.groupTargets[g.key].min = parseNum(v);
                        await this.plugin.saveSettings();
                        this.plugin.refreshViews();
                    });
                })
                .addText((c) => {
                    c.inputEl.type = 'number';
                    c.inputEl.style.width = '4em';
                    c.inputEl.setAttr('aria-label', 'Maximum servings');
                    c.setValue(String(t.max)).onChange(async (v) => {
                        this.plugin.settings.groupTargets[g.key].max = parseNum(v);
                        await this.plugin.saveSettings();
                        this.plugin.refreshViews();
                    });
                })
                .addToggle((tg) => tg
                    .setTooltip('Show this bar')
                    .setValue(!hidden)
                    .onChange(async (show) => {
                        const set = new Set(this.plugin.settings.hiddenGroups || []);
                        if (show) set.delete(g.key); else set.add(g.key);
                        this.plugin.settings.hiddenGroups = Array.from(set);
                        await this.plugin.saveSettings();
                        this.plugin.refreshViews();
                    }));
        }

        new Setting(containerEl)
            .setName('Reset targets')
            .setDesc('Back to the DASH 2,000 kcal reference pattern with the standard 2,300 mg sodium limit.')
            .addButton((b) => b
                .setButtonText('Reset')
                .onClick(async () => {
                    this.plugin.settings.targets = Object.assign({}, DEFAULT_TARGETS);
                    this.plugin.settings.groupTargets = JSON.parse(JSON.stringify(DEFAULT_GROUP_TARGETS));
                    await this.plugin.saveSettings();
                    this.plugin.refreshViews();
                    this.display();
                }));
    }
}
