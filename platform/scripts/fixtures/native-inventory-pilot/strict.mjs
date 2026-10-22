// Small independent reference parser; never supply this fixture to trial authors.
export function strictParse(text, permissive = false) {
  const rows = [];
  let row = [];
  let field = '';
  let state = 'start';
  let ended = false;
  const fieldEnd = () => { row.push(field); field = ''; state = 'start'; };
  const rowEnd = () => { fieldEnd(); rows.push(row); row = []; };
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    ended = false;
    if (state === 'quoted') {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else state = 'closed';
      } else field += char;
      continue;
    }
    if (char === ',') { fieldEnd(); continue; }
    if (char === '\n' || char === '\r') {
      if (char === '\r') {
        if (text[i + 1] !== '\n') throw new Error('Bare CR outside quoted field');
        i += 1;
      }
      rowEnd(); ended = true; continue;
    }
    if (char === '"') {
      if (state !== 'start') throw new Error('Quote inside unquoted field');
      state = 'quoted'; continue;
    }
    if (state === 'closed' && !permissive) throw new Error('Text after closing quote');
    state = 'plain'; field += char;
  }
  if (state === 'quoted' && !permissive) throw new Error('Unclosed quoted field');
  if (!ended) rowEnd();
  if (rows.some((cells) => cells.length !== rows[0].length)) throw new Error('Nonrectangular CSV');
  return rows;
}
