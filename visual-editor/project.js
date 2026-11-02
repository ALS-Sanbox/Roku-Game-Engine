'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
function walk(root, extensions, current = root) {
  const result = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || ['.git', 'node_modules', 'build', '.visual-editor'].includes(entry.name)) continue;
    const file = path.join(current, entry.name);
    if (entry.isDirectory()) result.push(...walk(root, extensions, file));
    else if (extensions.includes(path.extname(file).toLowerCase())) result.push(path.relative(root, file).replaceAll('\\', '/'));
  }
  return result.sort();
}
// Split arguments without losing source spans, respecting calls, arrays and BRS strings.
function argumentsAt(source, start) {
  const args = []; let depth = 0, quoted = false, begin = start;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') { i++; continue; }
      quoted = !quoted;
    }
    if (quoted) continue;
    if (c === "'" || c === '\n' || c === '\r') return null;
    if (c === '(' || c === '[' || c === '{') depth++;
    if (c === ')' && depth === 0) {
      args.push({ start: begin, end: i, raw: source.slice(begin, i) });
      return args;
    }
    if (c === ')' || c === ']' || c === '}') depth--;
    if (c === ',' && depth === 0) { args.push({ start: begin, end: i, raw: source.slice(begin, i) }); begin = i + 1; }
  }
  return null;
}
function parseSource(source, file) {
  const elements = []; let section = 'Global', offset = 0;
  for (const line of source.split(/(?<=\n)/)) {
    const declaration = line.match(/^\s*(?:sub|function)\s+(\w+)/i);
    if (declaration) section = declaration[1];
    // Mask strings and comments so examples and commented-out code never become edits.
    let mask = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        if (quoted && line[i + 1] === '"') { mask += '  '; i++; continue; }
        quoted = !quoted; mask += ' '; continue;
      }
      if (!quoted && line[i] === "'") { mask += ' '.repeat(line.length - i); break; }
      mask += quoted ? ' ' : line[i];
    }
    const re = /\b[\w.]+\.(DrawText|DrawRect|DrawObject|DrawScaledObject)\s*\(/gi;
    for (const match of mask.matchAll(re)) {
      const args = argumentsAt(source, offset + match.index + match[0].length);
      if (!args) continue;
      const kind = match[1].toLowerCase();
      const specs = kind === 'drawtext' ? { text: 0, x: 1, y: 2, color: 3 }
        : kind === 'drawrect' ? { x: 0, y: 1, width: 2, height: 3, color: 4 }
        : kind === 'drawscaledobject' ? { x: 0, y: 1, scaleX: 2, scaleY: 3, color: 5 } : { x: 0, y: 1 };
      const fields = {}, values = {};
      for (const [key, index] of Object.entries(specs)) {
        const arg = args[index]; if (!arg) continue;
        const raw = arg.raw.trim(); let value;
        if (key === 'text') { if (/^"(?:[^"]|"")*"$/.test(raw)) value = raw.slice(1, -1).replaceAll('""', '"'); }
        else if (key === 'color') { if (/^&h[0-9a-f]{8}$/i.test(raw)) value = '#' + raw.slice(2); }
        else if (/^-?\d+(?:\.\d+)?$/.test(raw)) value = Number(raw);
        if (value !== undefined) { fields[key] = arg; values[key] = value; }
      }
      if (!Object.keys(fields).length) continue;
      const rawText = args[0]?.raw.trim() || '';
      const sample = kind === 'drawtext' ? (rawText.match(/^"((?:[^"]|"")*)"/)?.[1].replaceAll('""', '"') || '[dynamic text]') : match[1];
      elements.push({ id: `${file}:${offset + match.index}`, file, section, line: source.slice(0, offset + match.index).split('\n').length,
        kind, fields, values, sample, expression: line.trim(), positioned: values.x !== undefined && values.y !== undefined });
    }
    offset += line.length;
  }
  return elements;
}
function resolveProject(input) {
  let root = fs.realpathSync(path.resolve(input));
  if (fs.existsSync(path.join(root, 'roku', 'source'))) root = fs.realpathSync(path.join(root, 'roku'));
  if (!fs.statSync(root).isDirectory() || !fs.existsSync(path.join(root, 'source'))) throw new Error('Choose a Roku project containing a source folder (or its parent).');
  if (!fs.statSync(path.join(root, 'source')).isDirectory() || !walk(path.join(root, 'source'), ['.brs']).length) throw new Error('Choose a native Roku project with BrightScript (.brs) files in source/.');
  return root;
}
function inspect(input) {
  const root = resolveProject(input), files = {}, elements = [];
  for (const file of walk(path.join(root, 'source'), ['.brs'])) {
    const relative = 'source/' + file, source = fs.readFileSync(path.join(root, relative), 'utf8');
    files[relative] = hash(source); elements.push(...parseSource(source, relative));
  }
  return { root, id: hash(root).slice(0, 16), name: path.basename(root) === 'roku' ? path.basename(path.dirname(root)) : path.basename(root),
    width: 1280, height: 720, files, elements,
    assets: walk(root, ['.png', '.jpg', '.jpeg', '.webp', '.gif']) };
}
function replacements(project, edits) {
  if (!edits || typeof edits !== 'object' || Array.isArray(edits)) throw new Error('Invalid edits.');
  const changes = {};
  for (const [id, values] of Object.entries(edits)) {
    const element = project.elements.find(e => e.id === id);
    if (!element) throw new Error('Unknown element: ' + id);
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Invalid properties.');
    for (const [key, value] of Object.entries(values)) {
      if (!Object.hasOwn(element.fields, key)) throw new Error('Property is calculated in source: ' + key);
      let literal;
      if (key === 'text') {
        if (typeof value !== 'string' || /[\r\n\0]/.test(value)) throw new Error('Text must be a single line.');
        literal = '"' + value.replaceAll('"', '""') + '"';
      } else if (key === 'color') {
        if (typeof value !== 'string' || !/^#[0-9a-f]{8}$/i.test(value)) throw new Error('Use #RRGGBBAA colors.');
        literal = '&h' + value.slice(1).toUpperCase();
      } else {
        if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 100000 || (['width', 'height', 'scaleX', 'scaleY'].includes(key) && value <= 0)) throw new Error('Invalid size or coordinate.');
        literal = String(value);
      }
      const span = element.fields[key];
      (changes[element.file] ||= []).push({ ...span, literal });
    }
  }
  return changes;
}
function apply(source, changes) {
  for (const change of [...changes].sort((a, b) => b.start - a.start)) source = source.slice(0, change.start) + change.literal + source.slice(change.end);
  return source;
}
module.exports = { inside, walk, argumentsAt, parseSource, resolveProject, inspect, replacements, apply, hash };
