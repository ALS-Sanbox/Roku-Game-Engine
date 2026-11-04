const fs = require('node:fs');
const path = require('node:path');
module.exports = function molProjectPath() {
  return [process.env.MOL_RGE_PROJECT, path.resolve(__dirname, '../../MOL_RGE'), path.resolve(__dirname, '../projects/MOL')]
    .filter(Boolean).find(p => fs.existsSync(path.join(p, 'MOL.rkscene'))) || null;
};
