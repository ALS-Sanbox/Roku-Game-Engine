const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSource, replacements, apply, inside } = require('../project');
test('source editing preserves dynamic expressions, comments, CRLF and quoted commas', () => {
  const source = 'sub Draw(g)\r\n  s.DrawText("SCORE, " + g.score.ToStr(),90,96,&hffffffff,g.font) \' keep\r\n  s.DrawText("He said ""Hi""",20,40,&hff0000ff,font)\r\nend sub\r\n';
  const elements = parseSource(source, 'source/render.brs');
  assert.equal(elements.length, 2); assert.equal(elements[0].values.text, undefined);
  assert.equal(elements[1].values.text, 'He said "Hi"');
  const edits = { [elements[0].id]: { x: 120, color: '#123456ff' }, [elements[1].id]: { text: 'New "label"' } };
  const patches = replacements({ elements }, edits)['source/render.brs'];
  const output = apply(source, patches);
  assert.match(output, /"SCORE, " \+ g.score.ToStr\(\),120,96,&h123456FF,g.font/);
  assert.ok(output.includes('"New ""label"""')); assert.ok(output.includes("' keep\r\n"));
});
test('never edits commented calls or string contents; calculated positions remain locked', () => {
  const source = '\' s.DrawRect(1,2,3,4,&hffffffff)\nprint "s.DrawRect(1,2,3,4,&hffffffff)"\ns.DrawRect(ox+4,20,30,40,&hffffffff)';
  const elements = parseSource(source, 'source/render.brs'); assert.equal(elements.length, 1);
  assert.equal(elements[0].positioned, false);
  assert.throws(() => replacements({ elements }, { [elements[0].id]: { x: 3 } }), /calculated/);
  assert.throws(() => replacements({ elements }, { [elements[0].id]: { width: -5 } }), /Invalid/);
  assert.throws(() => replacements({ elements }, { [elements[0].id]: { color: 'bad' } }), /RRGGBBAA/);
});
test('path containment rejects siblings and traversal', () => {
  const path = require('node:path'), root = path.resolve('project');
  assert.equal(inside(root, path.join(root, 'assets', 'a.png')), true);
  assert.equal(inside(root, root + '-other'), false);
  assert.equal(inside(root, path.resolve(root, '..', 'secret')), false);
});
