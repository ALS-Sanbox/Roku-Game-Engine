'use strict';
const fs=require('node:fs');
const path=require('node:path');
const normalizeRelativePath=p=>String(p).replaceAll('\\','/');
function walkFilesRecursive(dir, visit){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isSymbolicLink())continue;const p=path.join(dir,e.name);if(e.isDirectory())walkFilesRecursive(p,visit);else if(e.isFile())visit(p);}}
function sanitizeBrightScriptIdentifier(value = '') {
  return String(value || '')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^([^A-Za-z_]+)/, '') || 'Script';
}

function buildScriptHookBaseName(projectRelativePath = '') {
  const normalized = normalizeRelativePath(projectRelativePath).replace(/^\/+/, '');
  const withoutExt = normalized.replace(/\.brs$/i, '');
  return `RokuScript_${sanitizeBrightScriptIdentifier(withoutExt)}`;
}

function buildUserScriptRegistrySource(scriptEntries = []) {
  const lines = [
    "' user_scripts_registry.brs - generated from project scripts",
    '',
    'function RokuEngine_UserScriptDispatch(scriptPath as String, entryPoint as String, context as Object) as Boolean'
  ];
  if (!scriptEntries.length) {
    lines.push('  return false', 'end function', '');
    return lines.join('\n');
  }
  scriptEntries.forEach((entry, index) => {
    const prefix = index === 0 ? '  if' : '  else if';
    lines.push(`${prefix} scriptPath = ${JSON.stringify(entry.scriptPath)} then`);
    lines.push('    eventKey = LCase(RokuEngine_Trim(entryPoint))');
    const orderedHooks = [
      ['Ready', 'ready'],
      ['Init', 'init'],
      ['SceneEnter', 'sceneenter'],
      ['PreUpdate', 'preupdate'],
      ['PhysicsUpdate', 'physicsupdate'],
      ['Update', 'update'],
      ['LateUpdate', 'lateupdate'],
      ['PostUpdate', 'postupdate'],
      ['Input', 'input'],
      ['Action', 'action'],
      ['Timeout', 'timeout'],
      ['PathFinished', 'pathfinished'],
      ['ScreenEntered', 'screenentered'],
      ['ScreenExited', 'screenexited'],
      ['Spawned', 'spawned'],
      ['CameraZoneChanged', 'camerazonechanged'],
      ['SceneExit', 'sceneexit'],
      ['CollisionEnter', 'collisionenter'],
      ['CollisionStay', 'collisionstay'],
      ['CollisionExit', 'collisionexit'],
      ['Collision', 'collision']
    ].filter(([hookName]) => entry.hookMap?.[hookName]);
    if (!orderedHooks.length) {
      lines.push('      return false');
      return;
    }
    orderedHooks.forEach(([hookName, eventKey], hookIndex) => {
      const branch = hookIndex === 0 ? '    if' : '    else if';
      lines.push(`${branch} eventKey = ${JSON.stringify(eventKey)} then`);
      lines.push(`      ${entry.baseName}_${hookName}(context)`);
      lines.push('      return true');
    });
    lines.push('    end if');
  });
  lines.push('  end if', '  return false', 'end function', '');
  return lines.join('\n');
}

function collectProjectBrightScriptFiles(projectRoot) {
  const rootPath = path.resolve(projectRoot || process.cwd());
  const scriptRoots = [
    path.join(rootPath, 'components'),
    path.join(rootPath, 'source')
  ];
  const entries = [];
  const seen = new Set();
  scriptRoots.forEach((scriptRoot) => {
    walkFilesRecursive(scriptRoot, (fullPath) => {
      if (!/\.brs$/i.test(fullPath)) return;
      const normalizedRelative = normalizeRelativePath(path.relative(rootPath, fullPath));
      if (!normalizedRelative || seen.has(normalizedRelative)) return;
      if (/^source\/main\.brs$/i.test(normalizedRelative)) return;
      if (/^source\/engine\//i.test(normalizedRelative)) return;

      seen.add(normalizedRelative);
      const baseName = buildScriptHookBaseName(normalizedRelative);
      const sourceText = fs.readFileSync(fullPath, 'utf8');
      const hookMap = {
        CameraZoneChanged: new RegExp(`(?:sub|function)\\s+${baseName}_CameraZoneChanged\\s*\\(`, 'i').test(sourceText),
        Action: new RegExp(`(?:sub|function)\\s+${baseName}_Action\\s*\\(`, 'i').test(sourceText),
        Ready: new RegExp(`(?:sub|function)\\s+${baseName}_Ready\\s*\\(`, 'i').test(sourceText),
        Init: new RegExp(`(?:sub|function)\\s+${baseName}_Init\\s*\\(`, 'i').test(sourceText),
        SceneEnter: new RegExp(`(?:sub|function)\\s+${baseName}_SceneEnter\\s*\\(`, 'i').test(sourceText),
        PreUpdate: new RegExp(`(?:sub|function)\\s+${baseName}_PreUpdate\\s*\\(`, 'i').test(sourceText),
        PhysicsUpdate: new RegExp(`(?:sub|function)\\s+${baseName}_PhysicsUpdate\\s*\\(`, 'i').test(sourceText),
        Update: new RegExp(`(?:sub|function)\\s+${baseName}_Update\\s*\\(`, 'i').test(sourceText),
        LateUpdate: new RegExp(`(?:sub|function)\\s+${baseName}_LateUpdate\\s*\\(`, 'i').test(sourceText),
        PostUpdate: new RegExp(`(?:sub|function)\\s+${baseName}_PostUpdate\\s*\\(`, 'i').test(sourceText),
        Input: new RegExp(`(?:sub|function)\\s+${baseName}_Input\\s*\\(`, 'i').test(sourceText),
        SceneExit: new RegExp(`(?:sub|function)\\s+${baseName}_SceneExit\\s*\\(`, 'i').test(sourceText),
        Collision: new RegExp(`(?:sub|function)\\s+${baseName}_Collision\\s*\\(`, 'i').test(sourceText),
        CollisionEnter: new RegExp(`(?:sub|function)\\s+${baseName}_CollisionEnter\\s*\\(`, 'i').test(sourceText),
        CollisionStay: new RegExp(`(?:sub|function)\\s+${baseName}_CollisionStay\\s*\\(`, 'i').test(sourceText),
        CollisionExit: new RegExp(`(?:sub|function)\\s+${baseName}_CollisionExit\\s*\\(`, 'i').test(sourceText)
      };
      for (const hook of ['Timeout', 'PathFinished', 'ScreenEntered', 'ScreenExited', 'Spawned']) {
        hookMap[hook] = new RegExp('(?:sub|function)\\s+' + baseName + '_' + hook + '\\s*\\(', 'i').test(sourceText);
      }
      const hasAnyHookFunctions = Object.values(hookMap).some(Boolean);
      entries.push({
        absolutePath: fullPath,
        relativePath: normalizedRelative,
        scriptPath: `res://${normalizedRelative}`,
        baseName,
        hookMap,
        hasAnyHookFunctions,
        exportRelativePath: `source/game_scripts/${sanitizeBrightScriptIdentifier(normalizedRelative.replace(/\.brs$/i, ''))}.brs`
      });
    });
  });
  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return entries;
}


function copyProjectBrightScriptFiles(root,output){const entries=collectProjectBrightScriptFiles(root);const texts=new Set();const included=[];for(const e of entries){const source=fs.readFileSync(e.absolutePath,'utf8');if(texts.has(source))continue;texts.add(source);const dest=path.join(output,e.exportRelativePath);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,source);included.push(e);}fs.writeFileSync(path.join(output,'source/engine/user_scripts_registry.brs'),buildUserScriptRegistrySource(included.filter(e=>e.hasAnyHookFunctions)));return included;}
module.exports={collectProjectBrightScriptFiles,copyProjectBrightScriptFiles,buildUserScriptRegistrySource,buildScriptHookBaseName,sanitizeBrightScriptIdentifier};
