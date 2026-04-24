/* section: date utilities | purpose: shared local date parsing and formatting */

export function parseFlexibleDate(value){
  const s = String(value ?? "").trim();
  if(!s) return null;

  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m) return validLocalDate(Number(m[3]), Number(m[1]), Number(m[2]));

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if(m) return validLocalDate(2000 + Number(m[3]), Number(m[1]), Number(m[2]));

  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m) return validLocalDate(Number(m[1]), Number(m[2]), Number(m[3]));

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const parseEventDate = parseFlexibleDate;

export function parseCreatedDate(value){
  const s = String(value ?? "").trim();
  if(!s) return null;

  const ms = Date.parse(s);
  if(!Number.isNaN(ms)) return new Date(ms);
  return parseFlexibleDate(s);
}

export function localMidnight(date = new Date()){
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function localMidnightDaysAgo(days){
  const d = localMidnight();
  d.setDate(d.getDate() - Number(days || 0));
  return d;
}

export function startOfWeekMonday(date = new Date()){
  const d = localMidnight(date);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}

export function sameYMD(a, b){
  return !!(a && b
    && a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate());
}

export function eventYear(row){
  const y = String(row?.YEAR ?? "").trim();
  if(y) return y;

  const d = parseEventDate(row?.DATE);
  return d ? String(d.getFullYear()) : "";
}

export function monthYearLabel(dateValue){
  const d = parseEventDate(dateValue);
  return d ? formatMonthYear(d).toLowerCase() : "";
}

export function formatMonthYear(date){
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

export function formatShortDate(date){
  if(!date) return "";
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${String(date.getFullYear()).slice(-2)}`;
}

function validLocalDate(year, month, day){
  const d = new Date(year, month - 1, day);
  return Number.isNaN(d.getTime()) ? null : d;
}
