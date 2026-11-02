const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inflateRawSync } = require('node:zlib');
const { packageRoku, crc32 } = require('../roku-package');
const { inside } = require('../project');
test('native ZIP has root manifest, forward slash paths, valid CRCs and no test/gameplay JS', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'roku-package-test-'));
  try {
    for (const dir of ['source', 'images', 'tests', 'html5']) fs.mkdirSync(path.join(root, dir));
    fs.writeFileSync(path.join(root, 'manifest'), 'title=Native test');
    fs.writeFileSync(path.join(root, 'source/main.brs'), 'sub Main()\nend sub');
    fs.writeFileSync(path.join(root, 'images/player.png'), Buffer.from([1, 2, 3]));
    fs.writeFileSync(path.join(root, 'tests/main.brs'), 'should not ship');
    fs.writeFileSync(path.join(root, 'html5/game.js'), 'should not ship');
    const zip = path.join(root, 'game.zip'); const summary = packageRoku(root, zip);
    assert.equal(summary.files, 3); const data = fs.readFileSync(zip); const files = {}; let offset = 0;
    while (data.readUInt32LE(offset) === 0x04034b50) {
      const compressedSize = data.readUInt32LE(offset + 18), length = data.readUInt16LE(offset + 26);
      const name = data.subarray(offset + 30, offset + 30 + length).toString();
      const content = inflateRawSync(data.subarray(offset + 30 + length, offset + 30 + length + compressedSize));
      assert.equal(crc32(content), data.readUInt32LE(offset + 14));
      assert.ok(!name.includes('\\')); files[name] = content.toString(); offset += 30 + length + compressedSize;
    }
    assert.equal(files.manifest, 'title=Native test'); assert.ok(files['source/main.brs']); assert.equal(Object.keys(files).length, 3);
    assert.equal(data.readUInt32LE(offset), 0x02014b50); assert.equal(data.readUInt32LE(data.length - 22), 0x06054b50);
    fs.unlinkSync(path.join(root, 'manifest')); assert.throws(() => packageRoku(root, zip), /manifest/);
  } finally { if (inside(os.tmpdir(), root) && path.basename(root).startsWith('roku-package-test-')) fs.rmSync(root, { recursive: true }); }
});
