/* Just enough of Obsidian's API, and of a vault, to run Nosh's note code. */

class Notice { constructor(msg) { Notice.all.push(String(msg)); } }
Notice.all = [];

class Component { load() {} unload() {} }
class Plugin extends Component {
    constructor(app) { super(); this.app = app; this._events = []; }
    registerView() {} addRibbonIcon() {} addCommand() {} addSettingTab() {}
    registerEvent(e) { this._events.push(e); }
    async loadData() { return this.app.__data ? JSON.parse(JSON.stringify(this.app.__data)) : null; }
    async saveData(d) { this.app.__data = JSON.parse(JSON.stringify(d)); this.app.__saves++; }
}
class ItemView extends Component {}
class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; } }
class Setting {
    constructor() { return new Proxy(this, { get: () => () => this }); }
}
class Modal {}
class Menu {}
const setIcon = () => {};
const MarkdownRenderer = { render: async () => {} };
function getAllTags(cache) {
    const fm = (cache && cache.frontmatter) || {};
    return [].concat(fm.tags || []).map((t) => '#' + String(t).replace(/^#/, ''));
}
function normalizePath(p) { return String(p).replace(/\\/g, '/').replace(/\/+/g, '/'); }

/* --- a tiny YAML, over exactly the shapes Nosh writes ----------------- */

function parseScalar(v) {
    const t = v.trim();
    if (t === '' ) return '';
    if (t === '{}') return {};
    if (t === '[]') return [];
    if (t === 'true') return true;
    if (t === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    const m = t.match(/^"([\s\S]*)"$/);
    return m ? m[1].replace(/""/g, '"') : t;
}

function parseYaml(text) {
    const lines = text.split('\n').filter((l) => l.trim() !== '' && !/^\s*#/.test(l));
    let i = 0;
    const at = (indent) => {
        const out = {};
        while (i < lines.length) {
            const line = lines[i];
            const ind = line.match(/^ */)[0].length;
            if (ind < indent) break;
            if (ind > indent) throw new Error('bad indent: ' + line);
            const body = line.slice(indent);
            if (body.startsWith('- ')) break;
            const m = body.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
            if (!m) throw new Error('unparsed: ' + line);
            i++;
            if (m[2] !== '') { out[m[1]] = parseScalar(m[2]); continue; }
            /* A nested map or a list; peek at the next line. */
            const next = lines[i];
            const nind = next ? next.match(/^ */)[0].length : -1;
            if (!next || nind <= indent) { out[m[1]] = ''; continue; }
            if (next.slice(nind).startsWith('- ')) {
                const list = [];
                while (i < lines.length) {
                    const l = lines[i];
                    const li = l.match(/^ */)[0].length;
                    if (li !== nind || !l.slice(li).startsWith('- ')) break;
                    list.push(parseScalar(l.slice(li + 2)));
                    i++;
                }
                out[m[1]] = list;
            } else {
                out[m[1]] = at(nind);
            }
        }
        return out;
    };
    return at(0);
}

function dumpYaml(obj, indent) {
    const pad = ' '.repeat(indent);
    const lines = [];
    for (const key of Object.keys(obj)) {
        const v = obj[key];
        if (Array.isArray(v)) {
            if (!v.length) { lines.push(pad + key + ': []'); continue; }
            lines.push(pad + key + ':');
            for (const item of v) lines.push(pad + '  - ' + item);
        } else if (v && typeof v === 'object') {
            if (!Object.keys(v).length) { lines.push(pad + key + ': {}'); continue; }
            lines.push(pad + key + ':');
            lines.push(dumpYaml(v, indent + 2));
        } else {
            lines.push(pad + key + ': ' + v);
        }
    }
    return lines.join('\n');
}

/* --- the vault -------------------------------------------------------- */

class TFile {
    constructor(path, content) {
        this.path = path;
        this.content = content;
        const name = path.split('/').pop();
        this.extension = name.includes('.') ? name.split('.').pop() : '';
        this.basename = name.replace(/\.[^.]*$/, '');
    }
}
class TFolder {
    constructor(path) { this.path = path; this.children = []; }
}

class FakeApp {
    constructor(data) {
        this.__data = data || null;
        this.__saves = 0;
        this.files = new Map();
        this.folders = new Set();
        this.changed = [];      // [file] as the metadata cache would report them
        const app = this;

        this.vault = {
            getMarkdownFiles: () => Array.from(app.files.values()).filter((f) => f.extension === 'md'),
            getAbstractFileByPath: (p) => app.files.get(p) ||
                (app.folders.has(p) ? new TFolder(p) : null),
            createFolder: async (p) => {
                if (app.folders.has(p)) throw new Error('exists');
                app.folders.add(p);
            },
            create: async (p, text) => {
                if (app.files.has(p)) throw new Error('exists: ' + p);
                const f = new TFile(p, text);
                app.files.set(p, f);
                app.changed.push(f);
                return f;
            },
            read: async (f) => f.content,
            cachedRead: async (f) => f.content,
            process: async (f, fn) => { f.content = fn(f.content); app.changed.push(f); },
            trash: async (f) => { app.files.delete(f.path); },
            on: () => ({}),
        };

        this.metadataCache = {
            getFileCache: (f) => {
                if (!f || !app.files.has(f.path)) return null;
                const m = f.content.match(/^---\n([\s\S]*?)\n---/);
                if (!m) return { frontmatter: null };
                try { return { frontmatter: parseYaml(m[1]) }; }
                catch (e) { return { frontmatter: null }; }
            },
            getFirstLinkpathDest: () => null,
            fileToLinktext: (f) => f.basename,
            on: () => ({}),
        };

        this.fileManager = {
            processFrontMatter: async (f, fn) => {
                const m = f.content.match(/^---\n([\s\S]*?)\n---\n?/);
                const fm = m ? parseYaml(m[1]) : {};
                fn(fm);
                const body = m ? f.content.slice(m[0].length) : f.content;
                f.content = '---\n' + dumpYaml(fm, 0) + '\n---\n' + body;
                app.changed.push(f);
            },
            renameFile: async (f, to) => {
                app.files.delete(f.path);
                f.path = to;
                const name = to.split('/').pop();
                f.basename = name.replace(/\.[^.]*$/, '');
                app.files.set(to, f);
            },
            trashFile: async (f) => { app.files.delete(f.path); },
        };

        this.workspace = {
            onLayoutReady: (fn) => { app.__layout = fn; },
            getLeavesOfType: () => [],
            getActiveFile: () => null,
            on: () => ({}),
        };
    }
}

module.exports = {
    Plugin, ItemView, PluginSettingTab, Setting, Modal, Menu, Notice,
    setIcon, getAllTags, MarkdownRenderer, Component, normalizePath,
    FakeApp, TFile, parseYaml, dumpYaml,
};
