(function(root) {
  'use strict';
  const keywords = new Set(('sub function end if then else elseif for each to step next while exit return goto gosub dim as and or not mod stop print let const optional public private continue library import').split(' '));
  const types = new Set('true false invalid integer longinteger float double string boolean object dynamic void interface'.split(' '));
  const escape = text => text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  function highlight(source) {
    const tokens = /'(?:[^\r\n]*)|\brem\b[^\r\n]*|"(?:[^"\r\n]|"")*(?:"|(?=\r?\n|$))|&h[\da-f]+\b|\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b|\b[a-z_]\w*\b|[^\w'"&]+|./gi;
    return (String(source).match(tokens) || []).map(token => {
      let kind = '';
      if (token[0] === "'" || /^rem\b/i.test(token)) kind='comment';
      else if (token[0] === '"') kind='string';
      else if (/^(\d|&h)/i.test(token)) kind='number';
      else if (keywords.has(token.toLowerCase())) kind='keyword';
      else if (types.has(token.toLowerCase())) kind='type';
      else if (/^(context|m)$/i.test(token)) kind='context';
      const safe=escape(token);
      return kind ? `<span class="brs-${kind}">${safe}</span>` : safe;
    }).join('');
  }
  const api={highlight};
  if (typeof module==='object' && module.exports) module.exports=api;
  else root.RGEBrightScriptSyntax=api;
})(typeof window==='undefined' ? globalThis : window);
