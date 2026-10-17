/** Trusted export oracle: accepts optional CSV quoting without assuming emitter formatting. */
export function parseExportCsv(input) {
 if(typeof input!=='string')throw Error('CSV text required');
 const s=input.replace(/^\uFEFF/,'');const rows=[];let i=0;
 while(i<s.length){const row=[];let more=true;
  while(more){let field='';if(s[i]==='"'){i++;let closed=false;while(i<s.length){if(s[i]==='"'){if(s[i+1]==='"'){field+='"';i+=2;}else{i++;closed=true;break;}}else field+=s[i++];}if(!closed)throw Error('Unclosed CSV quote');if(i<s.length&&s[i]!==','&&s[i]!=='\r'&&s[i]!=='\n')throw Error('Data after closing quote');}
   else{while(i<s.length&&s[i]!==','&&s[i]!=='\r'&&s[i]!=='\n'){if(s[i]==='"')throw Error('Quote in bare field');field+=s[i++];}}
   row.push(field);if(s[i]===','){i++;}else{more=false;if(s[i]==='\r'){i++;if(s[i]==='\n')i++;}else if(s[i]==='\n')i++;}
  }
  if(row.some(v=>v!==''))rows.push(row);
 }
 return rows;
}
