/* The health note, which a Shortcut reads to log the day to Apple Health.
 *
 *   node test/health.js            # against ../main.js
 *   node test/health.js other.js   # against a build somewhere else
 *
 * Loaded the same way test/targets.js loads main.js: a stand-in for the
 * Obsidian API and a vault held in memory. Nothing is written to disk.
 */
const fs = require('fs');
const path = require('path');

const obsidian = require(path.join(__dirname, 'fake-obsidian.js'));
const MAIN = path.resolve(process.argv[2] || path.join(__dirname, '..', 'main.js'));

const src = fs.readFileSync(MAIN, 'utf8');
const wrapped = src + `
;module.exports.__internals = {
    healthDays, healthNoteText, isHealthNoteName, addDays,
    HEALTH_NOTE_NAME, HEALTH_DAYS, NUTRIENTS,
};
`;
const mod = { exports: {} };
new Function('require', 'module', 'exports', '__filename', '__dirname', wrapped)(
    (id) => (id === 'obsidian' ? obsidian : require(id)), mod, mod.exports, MAIN, path.dirname(MAIN));

const NoshPlugin = mod.exports;
const X = mod.exports.__internals;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; return; }
    fail++;
    console.log('  FAIL  ' + name + (extra === undefined ? '' : '\n        ' + extra));
}
function eq(name, a, b) {
    ok(name, JSON.stringify(a) === JSON.stringify(b),
       'got ' + JSON.stringify(a) + '\n        want ' + JSON.stringify(b));
}
function section(s) { console.log('\n' + s); }

/* What the Shortcut does with the note: one Match Text, then a dictionary. */
function shortcutReads(text) {
    const m = text.match(/\{.*\}/);
    return m ? JSON.parse(m[0]) : null;
}

const DAY = '2026-10-30';
const OATS = 'Nosh/Ingredients/Oatmeal.md';
const BANANA = 'Nosh/Ingredients/Banana.md';
const byPath = {
    [OATS]: { values: { calories: 150, protein_g: 5, sodium_mg: 0, fiber_g: 4 } },
    [BANANA]: { values: { calories: 105, potassium_mg: 422, fiber_g: 3.1 } },
};

/* --------------------------------------------------------------------- */
section('healthDays');

{
    const log = {
        [DAY]: { Breakfast: { [OATS]: 1, [BANANA]: 0.5 }, Snack: { [BANANA]: 1 } },
    };
    const days = X.healthDays(log, byPath, DAY);
    eq('only the day with anything logged', Object.keys(days), [DAY]);
    eq('every nutrient is there', Object.keys(days[DAY]), X.NUTRIENTS.map((n) => n.key));
    eq('servings scale and occasions add', days[DAY].calories, 150 + 105 * 1.5);
    eq('to one decimal', days[DAY].fiber_g, 8.7);
    eq('a nutrient no note gives is zero', days[DAY].calcium_mg, 0);
}

{
    const log = {
        [X.addDays(DAY, -(X.HEALTH_DAYS - 1))]: { Lunch: { [OATS]: 1 } },
        [X.addDays(DAY, -X.HEALTH_DAYS)]: { Lunch: { [OATS]: 1 } },
        [X.addDays(DAY, 1)]: { Lunch: { [OATS]: 1 } },
    };
    eq('the week up to the day, and no further either way',
       Object.keys(X.healthDays(log, byPath, DAY)), [X.addDays(DAY, -(X.HEALTH_DAYS - 1))]);
}

{
    const log = { [DAY]: { Dinner: { 'Nosh/Meals/Gone.md': 1 } } };
    eq('a day of notes that have gone is left out', X.healthDays(log, byPath, DAY), {});
}

/* --------------------------------------------------------------------- */
section('healthNoteText');

{
    const days = X.healthDays({ [DAY]: { Breakfast: { [OATS]: 2 } } }, byPath, DAY);
    const text = X.healthNoteText(days, { tag: 'nutrition' });
    eq('the Shortcut gets back what was written', shortcutReads(text), days);
    ok('tagged like every note Nosh writes',
       /tags:\n {2}- nutrition\n {2}- nutrition\/health/.test(text), text);
    ok('nothing in it changes from one device to the next', !/\d{2}:\d{2}/.test(text), text);
    eq('an empty week is still something to read', shortcutReads(X.healthNoteText({}, {})), {});
}

/* --------------------------------------------------------------------- */
section('the plugin');

const NOTES = {
    'Nosh/Ingredients/Oatmeal.md':
        '---\ncalories: 150\nprotein_g: 5\nfiber_g: 4\ntags:\n  - nutrition/ingredient\n---\n',
    'Nosh/Ingredients/Banana.md':
        '---\ncalories: 105\npotassium_mg: 422\ntags:\n  - nutrition/ingredient\n---\n',
};

async function plugin(data) {
    const app = new obsidian.FakeApp(data);
    for (const [p, text] of Object.entries(NOTES)) app.files.set(p, new obsidian.TFile(p, text));
    app.folders.add('Nosh');
    const p = new NoshPlugin(app);
    await p.loadSettings();
    p.refreshViews = () => {};
    return p;
}
const noteOf = (p) => p.app.files.get('Nosh/' + X.HEALTH_NOTE_NAME + '.md');
/* Run whatever write is pending, the way the timer would. */
const flush = async (p) => {
    if (p.healthTimer) {
        clearTimeout(p.healthTimer);
        p.healthTimer = null;
        await p.flushHealthNote();
    }
    await (p.healthQueue || Promise.resolve());
};

(async () => {
    const iso = (() => {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    })();

    {
        const p = await plugin({ log: { [iso]: { Breakfast: { [OATS]: 1 } } } });
        p.logChanged(iso);
        await flush(p);
        ok('off by default, so no note', !noteOf(p));
        ok('and no timer left running', !p.healthTimer);
        if (p.logNoteTimer) clearTimeout(p.logNoteTimer);
    }

    {
        const p = await plugin({ healthNote: true, logNotes: false,
                                 log: { [iso]: { Breakfast: { [OATS]: 1 } } } });
        p.logChanged(iso);
        await flush(p);
        const note = noteOf(p);
        ok('logging writes the note', !!note);
        eq('carrying the day', note && shortcutReads(note.content)[iso].calories, 150);

        const writes = p.app.changed.length;
        p.logChanged(iso);
        await flush(p);
        eq('the same totals again write nothing', p.app.changed.length, writes);

        p.settings.log[iso].Snack = { [BANANA]: 2 };
        p.logChanged(iso);
        await flush(p);
        eq('a change is written over the last', shortcutReads(noteOf(p).content)[iso].calories, 360);
        eq('and is the one note', Array.from(p.app.files.keys())
            .filter((k) => k.includes(X.HEALTH_NOTE_NAME)).length, 1);

        /* An ingredient fixed is every day that used it fixed. */
        const oats = p.app.files.get(OATS);
        oats.content = oats.content.replace('calories: 150', 'calories: 160');
        p.healthChanged();
        await flush(p);
        eq('a food note edited is a day changed', shortcutReads(noteOf(p).content)[iso].calories, 370);

        const found = p.collectNotes();
        ok('it is not a food', !found.meal.concat(found.ingredient)
            .some((r) => X.isHealthNoteName({ path: r.path })));
        ok('and does not touch the picker', !p.touches(noteOf(p)));
    }

    /* The whole of onload, with the setting on and a day already logged. */
    {
        const app = new obsidian.FakeApp({ healthNote: true, logNotes: false,
                                           log: { [iso]: { Lunch: { [BANANA]: 1 } } } });
        for (const [k, text] of Object.entries(NOTES)) app.files.set(k, new obsidian.TFile(k, text));
        app.folders.add('Nosh');
        const p = new NoshPlugin(app);
        p.refreshViews = () => {};
        await p.onload();
        await app.__layout();
        await flush(p);
        ok('the note is written at start', !!noteOf(p));
        eq('from the log as it stood', noteOf(p) && shortcutReads(noteOf(p).content)[iso].potassium_mg, 422);
        p.onunload();
    }

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
