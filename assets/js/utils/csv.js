/* section: csv utilities | purpose: shared RFC4180-ish CSV parsing */

export function parseCSVRows(text){
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for(let i = 0; i < String(text ?? "").length; i++){
    const ch = text[i];

    if(inQuotes){
      if(ch === '"'){
        const next = text[i + 1];
        if(next === '"'){
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if(ch === '"'){
      inQuotes = true;
      continue;
    }

    if(ch === ','){
      row.push(cell);
      cell = "";
      continue;
    }

    if(ch === '\n'){
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    if(ch === '\r') continue;

    cell += ch;
  }

  row.push(cell);
  rows.push(row);

  while(rows.length && rows[rows.length - 1].every(v => String(v ?? "").trim() === "")){
    rows.pop();
  }

  return rows;
}

export function parseCSVObjects(text){
  const rows = parseCSVRows(text);
  if(!rows.length) return [];

  const headers = rows[0].map(h => String(h ?? "").trim());
  return rows.slice(1).map(cols => {
    const out = {};
    headers.forEach((h, idx) => {
      out[h] = String(cols[idx] ?? "").trim();
    });
    return out;
  });
}
