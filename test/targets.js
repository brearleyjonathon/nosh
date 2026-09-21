/* The targets note, written and read back.
 *
 *   node test/targets.js            # against ../main.js
 *   node test/targets.js other.js   # against a build somewhere else
 *
 * Nosh has no build step and no dependencies, and neither has this: it loads
 * main.js with a stand-in for the Obsidian API and a vault held in memory,
 * then asks the questions a second device would. Nothing is written to disk.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const HARNESS = path.join(__dirname, 'fake-obsidian.js');
const obsidian = require(HARNESS);
const MAIN = path.resolve(process.argv[2] || path.join(__dirname, '..', 'main.js'));

/* Load main.js with 'obsidian' stubbed, and hand back its module-scope
 * helpers so the pure ones can be tested directly. */
const src = fs.readFileSync(MAIN, 'utf8');
const wrapped = src + `
;module.exports.__internals = {
    normalizeTargets, targetsOf, sameTargets, targetShapes, isTargetsNoteName,
    targetsNoteFrontmatter, targetsNoteBlock, targetsNoteText, parseTargetsNote,
    spliceBlock, hasOwnWords, DEFAULT_TARGETS, DEFAULT_GROUP_TARGETS,
    NUTRIENTS, FOOD_GROUPS, TARGETS_NOTE_NAME, DEFAULT_SETTINGS,
    TARGETS_BLOCK_OPEN, TARGETS_BLOCK_CLOSE,
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

/* --------------------------------------------------------------------- */
section('normalizeTargets');

{
    const n = X.normalizeTargets({});
    eq('empty falls back to the DASH pattern', n.targets, X.DEFAULT_TARGETS);
    eq('empty group ranges are the reference ones', n.groupTargets, X.DEFAULT_GROUP_TARGETS);
    eq('no shapes stored', n.nutrientDirs, {});
    eq('no weights stored', n.weights, {});
    eq('nothing hidden', n.hiddenNutrients, []);
    eq('diet defaults to 2000 kcal', n.dietCalories, 2000);
    eq('sodium defaults to 2300', n.dietSodium, 2300);
}
{
    const n = X.normalizeTargets({ targets: { calories: '1800', protein_g: 120 } });
    eq('a target typed as a string is a number', n.targets.calories, 1800);
    eq('a target given stays', n.targets.protein_g, 120);
    eq('a target not given keeps the reference', n.targets.fiber_g, 30);
}
{
    const n = X.normalizeTargets({
        nutrientDirs: { calories: 'floor', protein_g: 'nonsense', fat_g: 'ceiling' },
        groupDirs: { serv_grains: 'ceiling', serv_fruit: 'floor' },
        weights: { protein_g: 2, fiber_g: 1, sodium_mg: 0, calcium_mg: -3, nope: 5 },
        hiddenNutrients: ['carbs_g', 'not_a_bar'],
        hiddenGroups: ['serv_sweets'],
    });
    eq('a shape that means something is kept', n.nutrientDirs.calories, 'floor');
    ok('a shape nothing understands is dropped', n.nutrientDirs.protein_g === undefined);
    ok('a shape that matches the constant is not stored', n.nutrientDirs.fat_g === undefined);
    eq('a group shape is kept', n.groupDirs.serv_grains, 'ceiling');
    ok('a group shape already the default is not stored', n.groupDirs.serv_fruit === undefined);
    eq('weights keep only what is worth writing', n.weights, { protein_g: 2 });
    eq('hidden keeps only bars that exist', n.hiddenNutrients, ['carbs_g']);
    eq('hidden groups likewise', n.hiddenGroups, ['serv_sweets']);
}
{
    eq('sodium named rather than typed', X.normalizeTargets({ dietSodium: 'lower' }).dietSodium, 1500);
    eq('calories are clamped', X.normalizeTargets({ dietCalories: 99999 }).dietCalories, 4000);
}

/* --------------------------------------------------------------------- */
section('sameTargets');

{
    const a = { targets: { calories: 1800 } };
    ok('the same thing twice', X.sameTargets(a, { targets: { calories: 1800 } }));
    ok('a different calorie target is different', !X.sameTargets(a, { targets: { calories: 1900 } }));
    ok('a string and its number are the same', X.sameTargets(a, { targets: { calories: '1800' } }));
    ok('a weight of 1 is no weight at all',
       X.sameTargets({ weights: {} }, { weights: { protein_g: 1 } }));
    ok('the log is not part of it',
       X.sameTargets({ targets: { calories: 1800 }, log: { '2026-01-01': { Breakfast: { 'a.md': 1 } } } }, a));
    ok('hidden bars count', !X.sameTargets({}, { hiddenNutrients: ['carbs_g'] }));
}

/* --------------------------------------------------------------------- */
section('the note, written and read back');

const CUSTOM = {
    tag: 'nutrition',
    targets: { calories: 1750, protein_g: 130, carbs_g: 180, fat_g: 55,
               sat_fat_g: 12, fiber_g: 35, sodium_mg: 1500,
               potassium_mg: 4700, calcium_mg: 1250 },
    groupTargets: Object.assign({}, X.DEFAULT_GROUP_TARGETS, {
        serv_grains: { min: 4, max: 5.5 },
        serv_vegetables: { min: 5, max: 6 },
    }),
    nutrientDirs: { calories: 'floor' },
    groupDirs: { serv_grains: 'ceiling' },
    weights: { protein_g: 2, serv_vegetables: 1.5 },
    hiddenNutrients: ['carbs_g'],
    hiddenGroups: ['serv_sweets'],
    dietCalories: 1750,
    dietSodium: 1500,
};

{
    const text = X.targetsNoteText(CUSTOM);
    const fm = text.match(/^---\n([\s\S]*?)\n---/)[1];
    const cache = { frontmatter: obsidian.parseYaml(fm) };
    const said = X.parseTargetsNote(cache);
    ok('a written note reads back', !!said);
    ok('and says exactly what was written', X.sameTargets(said, CUSTOM),
       JSON.stringify(said, null, 1));
    eq('calories survive', said.targets.calories, 1750);
    eq('a group range survives', said.groupTargets.serv_grains, { min: 4, max: 5.5 });
    eq('a nutrient shape survives', said.nutrientDirs.calories, 'floor');
    eq('a group shape survives', said.groupDirs.serv_grains, 'ceiling');
    eq('weights survive', said.weights, { protein_g: 2, serv_vegetables: 1.5 });
    eq('hidden nutrients survive', said.hiddenNutrients, ['carbs_g']);
    eq('hidden groups survive', said.hiddenGroups, ['serv_sweets']);
    eq('the diet pattern survives', [said.dietCalories, said.dietSodium], [1750, 1500]);
    ok('the note carries its tag', /nutrition\/targets/.test(fm));
    ok('the body renders a table', text.includes('| Nutrient | Target | Shape | Weight | Shown |'));
    ok('the body is between markers',
       text.includes(X.TARGETS_BLOCK_OPEN) && text.includes(X.TARGETS_BLOCK_CLOSE));
}
{
    const text = X.targetsNoteText(X.DEFAULT_SETTINGS);
    const fm = obsidian.parseYaml(text.match(/^---\n([\s\S]*?)\n---/)[1]);
    eq('a default vault writes empty shapes', fm.shapes, {});
    eq('empty weights', fm.weights, {});
    eq('nothing hidden', fm.hidden, []);
    const said = X.parseTargetsNote({ frontmatter: fm });
    ok('and reads back as the shipped pattern', X.sameTargets(said, X.DEFAULT_SETTINGS));
}
{
    ok('a note with no frontmatter says nothing', X.parseTargetsNote({ frontmatter: null }) === null);
    ok('somebody else\'s note of the same name says nothing',
       X.parseTargetsNote({ frontmatter: { title: 'my own targets' } }) === null);
    const partial = X.parseTargetsNote({ frontmatter: { targets: { calories: 1600 } } });
    eq('a hand-written note with one field is read', partial.targets.calories, 1600);
    eq('and the rest is the reference pattern', partial.targets.fiber_g, 30);
}

/* --------------------------------------------------------------------- */
section('spliceBlock and hasOwnWords');
{
    const O = X.TARGETS_BLOCK_OPEN, C = X.TARGETS_BLOCK_CLOSE;
    const note = 'Some words of mine.\n\n' + O + '\nold\n' + C + '\n\nMore of mine.\n';
    const out = X.spliceBlock(note, O + '\nnew\n' + C, O, C);
    ok('the block is replaced', out.includes('new') && !out.includes('old'));
    ok('words before it survive', out.includes('Some words of mine.'));
    ok('words after it survive', out.includes('More of mine.'));
    ok('own words are noticed', X.hasOwnWords(note, O, C));
    ok('a note that is only the block has no own words',
       !X.hasOwnWords('---\na: 1\n---\n\n' + O + '\nx\n' + C + '\n', O, C));
}

/* --------------------------------------------------------------------- */
section('the plugin, across devices');

async function plugin(data, files) {
    const app = new obsidian.FakeApp(data);
    for (const [p, text] of Object.entries(files || {})) {
        app.files.set(p, new obsidian.TFile(p, text));
    }
    app.folders.add('Nosh');
    const p = new NoshPlugin(app);
    await p.loadSettings();
    p.refreshViews = () => {};
    p.readLogNotes = async () => false;
    p.repairLog = async () => {};
    return p;
}
const noteOf = (p) => p.app.files.get('Nosh/' + X.TARGETS_NOTE_NAME + '.md');
/* Run whatever write is pending, the way the 300ms timer would, and wait
   for anything already queued. Never forces one that was not asked for. */
const flush = async (p) => {
    if (p.targetsTimer) {
        clearTimeout(p.targetsTimer);
        p.targetsTimer = null;
        await p.flushTargetsNote();
    }
    await (p.targetsQueue || Promise.resolve());
};

(async () => {
    /* A vault with targets in data.json and no note yet: the note is written
     * from what data.json has, so the change loses nothing. */
    {
        const p = await plugin(Object.assign({}, CUSTOM));
        await p.readTargetsNote();
        await flush(p);
        const note = noteOf(p);
        ok('a note is written where there was none', !!note);
        const said = X.parseTargetsNote(p.app.metadataCache.getFileCache(note));
        ok('and it says what data.json said', X.sameTargets(said, CUSTOM));
    }

    /* The bug: a stale data.json, with the reference pattern, against a note
     * that carries the targets actually set. The note wins. */
    {
        const noteText = X.targetsNoteText(CUSTOM);
        const p = await plugin({}, { ['Nosh/' + X.TARGETS_NOTE_NAME + '.md']: noteText });
        eq('data.json alone gives the reference pattern', p.settings.targets.calories, 2000);
        const moved = await p.readTargetsNote();
        ok('reading the note is a change', moved);
        eq('the targets set are back', p.settings.targets.calories, 1750);
        eq('and so is the sodium', p.settings.targets.sodium_mg, 1500);
        eq('and the group range', p.settings.groupTargets.serv_grains, { min: 4, max: 5.5 });
        eq('and the shape', p.settings.nutrientDirs.calories, 'floor');
        eq('and the weight', p.settings.weights.protein_g, 2);
        eq('and the hidden bar', p.settings.hiddenNutrients, ['carbs_g']);
        eq('data.json is written back', p.app.__data.targets.calories, 1750);
        await flush(p);
        ok('the note is not rewritten for saying what it said',
           noteOf(p).content === noteText);
    }

    /* A fresh vault, still on the reference pattern, gets no note until it
     * has something of its own to keep. */
    {
        const p = await plugin({});
        await p.readTargetsNote();
        await flush(p);
        ok('installing Nosh writes no note by itself', !noteOf(p));
        p.settings.targets.calories = 1850;
        await p.saveSettings();
        await flush(p);
        ok('setting a target writes one', !!noteOf(p));
        eq('carrying what was set',
           X.parseTargetsNote(p.app.metadataCache.getFileCache(noteOf(p))).targets.calories, 1850);
    }

    /* A target typed in settings reaches the note. */
    {
        const p = await plugin({});
        await p.readTargetsNote();
        await flush(p);
        p.settings.targets.calories = 1600;
        await p.saveSettings();
        ok('a changed target queues a write', !!p.targetsTimer);
        await flush(p);
        const said = X.parseTargetsNote(p.app.metadataCache.getFileCache(noteOf(p)));
        eq('the note has the new target', said.targets.calories, 1600);
        ok('the table was rewritten too', noteOf(p).content.includes('| 1,600 kcal |'));
    }

    /* Logging a banana is not a change to the targets. */
    {
        const p = await plugin(Object.assign({}, CUSTOM));
        await p.readTargetsNote();
        await flush(p);
        const before = noteOf(p).content;
        p.settings.log['2026-09-21'] = { Breakfast: { 'Nosh/Ingredients/Banana.md': 1 } };
        await p.saveSettings();
        ok('a logged food queues no write', !p.targetsTimer);
        await flush(p);
        ok('and the note is untouched', noteOf(p).content === before);
    }

    /* A note arriving from another device while Obsidian sits open. */
    {
        const p = await plugin({ targets: { calories: 1990 } });
        await p.readTargetsNote();
        await flush(p);
        const note = noteOf(p);
        note.content = X.targetsNoteText(CUSTOM);
        p.targetsWrote = 0;                      // the write was not ours
        p.settingTab = { refresh() { this.hit = true; } };
        p.onTargetsNoteChanged(note, p.app.metadataCache.getFileCache(note));
        eq('the targets follow the note', p.settings.targets.calories, 1750);
        eq('the group range follows', p.settings.groupTargets.serv_vegetables, { min: 5, max: 6 });
        ok('the settings pane is asked to redraw', p.settingTab.hit);
        await flush(p);
        ok('and nothing is written back at it',
           X.sameTargets(X.parseTargetsNote(p.app.metadataCache.getFileCache(note)), CUSTOM));
    }

    /* Nosh's own write must not read as somebody else's. */
    {
        const p = await plugin({ targets: { calories: 1990 } });
        await p.readTargetsNote();
        await flush(p);
        p.settings.targets.calories = 1900;
        await p.saveSettings();
        await flush(p);
        const note = noteOf(p);
        p.onTargetsNoteChanged(note, p.app.metadataCache.getFileCache(note));
        eq('the target stands', p.settings.targets.calories, 1900);
    }

    /* Deleting the note does not clear the targets. */
    {
        const p = await plugin(Object.assign({}, CUSTOM));
        await p.readTargetsNote();
        await flush(p);
        const path = noteOf(p).path;
        p.app.files.delete(path);
        p.onTargetsNoteDeleted({ path, basename: X.TARGETS_NOTE_NAME, extension: 'md' });
        await flush(p);
        eq('the targets are still there', p.settings.targets.calories, 1750);
        ok('and the note is written again', !!noteOf(p));
    }

    /* Switched off, nothing is written. */
    {
        const p = await plugin({ targetNotes: false });
        await p.readTargetsNote();
        p.settings.targets.calories = 1500;
        await p.saveSettings();
        await flush(p);
        ok('no note where the setting is off', !noteOf(p));
        eq('but data.json still has it', p.app.__data.targets.calories, 1500);
    }

    /* A note kept somewhere else, by its tag. */
    {
        const at = 'Health/' + X.TARGETS_NOTE_NAME + '.md';
        const p = await plugin({}, { [at]: X.targetsNoteText(CUSTOM) });
        await p.readTargetsNote();
        eq('a tagged note outside the folder is the targets', p.settings.targets.calories, 1750);
        eq('and it is where it was found', p.targetsNoteAt, at);
        p.settings.targets.calories = 1700;
        await p.saveSettings();
        await flush(p);
        ok('no second note is made in the Nosh folder', !noteOf(p));
        eq('the one that exists is rewritten',
           X.parseTargetsNote(p.app.metadataCache.getFileCache(p.app.files.get(at))).targets.calories, 1700);
    }

    /* Hand-written words in the note survive a rewrite. */
    {
        const text = X.targetsNoteText(CUSTOM) + '\nWhy 1,750: what the dietitian said in March.\n';
        const p = await plugin({}, { ['Nosh/' + X.TARGETS_NOTE_NAME + '.md']: text });
        await p.readTargetsNote();
        p.settings.targets.calories = 1725;
        await p.saveSettings();
        await flush(p);
        ok('the note keeps what was written into it',
           noteOf(p).content.includes('what the dietitian said in March'));
        eq('and takes the new figure',
           X.parseTargetsNote(p.app.metadataCache.getFileCache(noteOf(p))).targets.calories, 1725);
    }

    /* A figure changed by hand in the frontmatter brings the table with it. */
    {
        const p = await plugin({ targets: { calories: 2000 }, dietSodium: 1500 });
        await p.readTargetsNote();
        await flush(p);
        const note = noteOf(p);
        note.content = note.content.replace('\n  calories: 2000', '\n  calories: 1450');
        p.targetsWrote = 0;
        p.onTargetsNoteChanged(note, p.app.metadataCache.getFileCache(note));
        eq('the targets follow the hand edit', p.settings.targets.calories, 1450);
        ok('the table is stale until it is rewritten', note.content.includes('| 2,000 kcal |'));
        await flush(p);
        ok('and then it is not', !noteOf(p).content.includes('| 2,000 kcal |'));
        ok('it shows what was typed', noteOf(p).content.includes('| 1,450 kcal |'));
    }

    /* The same again, but typed while Obsidian was closed. */
    {
        const text = X.targetsNoteText(X.DEFAULT_SETTINGS).replace('\n  calories: 2000', '\n  calories: 1450');
        const p = await plugin({}, { ['Nosh/' + X.TARGETS_NOTE_NAME + '.md']: text });
        await p.readTargetsNote();
        eq('read at load', p.settings.targets.calories, 1450);
        await flush(p);
        ok('the table caught up', noteOf(p).content.includes('| 1,450 kcal |'));
    }

    /* Writing the note twice over must settle, not ping-pong. */
    {
        const p = await plugin(Object.assign({}, CUSTOM));
        await p.readTargetsNote();
        await flush(p);
        const first = noteOf(p).content;
        await p.writeTargetsNote();
        eq('a second write changes nothing', noteOf(p).content, first);
        const note = noteOf(p);
        p.targetsWrote = 0;
        p.onTargetsNoteChanged(note, p.app.metadataCache.getFileCache(note));
        ok('and the note it wrote queues no answer', !p.targetsTimer);
    }

    /* A target edited in place after a note was read still reaches the note.
       Object.assign hands the settings the objects the reading is made of,
       so a box typed into would otherwise edit both and look like no change. */
    {
        const p = await plugin({}, { ['Nosh/' + X.TARGETS_NOTE_NAME + '.md']: X.targetsNoteText(CUSTOM) });
        await p.readTargetsNote();
        /* Asked before anything else runs: a later write would replace the
           reading with a fresh one and hide the sharing. */
        ok('the reading is not the settings\' own objects',
           p.targetsSaid.targets !== p.settings.targets);
        ok('nor its group ranges',
           p.targetsSaid.groupTargets.serv_grains !== p.settings.groupTargets.serv_grains);
        ok('nor its weights', p.targetsSaid.weights !== p.settings.weights);
        ok('nor its hidden bars', p.targetsSaid.hiddenNutrients !== p.settings.hiddenNutrients);
        await flush(p);
        p.settings.targets.protein_g = 140;              // as the settings box does
        p.settings.groupTargets.serv_grains.max = 7;
        p.settings.weights.protein_g = 3;
        p.settings.hiddenNutrients.push('fat_g');
        await p.saveSettings();
        ok('editing one in place is seen as a change', !!p.targetsTimer);
        await flush(p);
        const said = X.parseTargetsNote(p.app.metadataCache.getFileCache(noteOf(p)));
        eq('the note takes the new target', said.targets.protein_g, 140);
        eq('and the new range', said.groupTargets.serv_grains.max, 7);
        eq('and the new weight', said.weights.protein_g, 3);
        ok('and the newly hidden bar', said.hiddenNutrients.includes('fat_g'));
    }

    /* A second note landing inside the write window is not written over. */
    {
        const p = await plugin({}, { ['Nosh/' + X.TARGETS_NOTE_NAME + '.md']: X.targetsNoteText({}) });
        await p.readTargetsNote();
        await flush(p);
        const note = noteOf(p);

        /* One device sets 1,600; the note Nosh is about to write against is
           replaced by another carrying 1,900 before the write lands. */
        note.content = X.targetsNoteText({ targets: { calories: 1600 } });
        p.targetsWrote = 0;
        p.onTargetsNoteChanged(note, p.app.metadataCache.getFileCache(note));
        eq('the first is taken', p.settings.targets.calories, 1600);
        ok('and a write is queued', !!p.targetsTimer);
        note.content = X.targetsNoteText({ targets: { calories: 1900 } });
        await flush(p);
        eq('the second wins rather than being written over', p.settings.targets.calories, 1900);
        eq('and the note still says it',
           X.parseTargetsNote(p.app.metadataCache.getFileCache(noteOf(p))).targets.calories, 1900);
    }

    /* The targets note is not a food, and does not force a redraw. */
    {
        const p = await plugin(Object.assign({}, CUSTOM));
        await p.readTargetsNote();
        await flush(p);
        const found = p.collectNotes();
        eq('it is not in the meal list', found.meal.length, 0);
        eq('nor the ingredient list', found.ingredient.length, 0);
        ok('and it does not touch the picker', !p.touches(noteOf(p)));
    }

    /* The whole of onload, against a vault carrying targets somebody set and
       no note for them yet. Nothing here is mocked out. */
    {
        const app = new obsidian.FakeApp(Object.assign({}, CUSTOM));
        app.folders.add('Nosh');
        const p = new NoshPlugin(app);
        let threw = null;
        try { await p.onload(); } catch (e) { threw = e; }
        ok('onload runs', !threw, threw && threw.stack);
        ok('the settings pane is held', !!p.settingTab);
        await app.__layout();
        await flush(p);
        ok('and the targets are on disk as a note', !!noteOf(p));
        eq('carrying what data.json had',
           X.parseTargetsNote(app.metadataCache.getFileCache(noteOf(p))).targets.calories, 1750);
        eq('and nothing was shouted about', obsidian.Notice.all, []);
        p.onunload();
    }

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
