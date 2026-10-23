#!/usr/bin/env python3
"""Build static Boston Open athlete and first-fight data from public IBJJF pages.

Sources: IBJJF athletes-by-academy, BJJCompSystem schedule and bracket pages.
No website API keys, no browser-side cross-origin requests. Keep prior data when
upstream pages fail. A missing fight assignment is never invented.
"""
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
CUT_OFF = '2026-07-01'
SESSION = requests.Session()
SESSION.headers.update({'User-Agent': 'Mozilla/5.0 (compatible; AnyNE-BostonOpen/1.0)', 'Accept': 'text/html'})
DELAY = 0.8  # Respectful request pacing; runs in GitHub Actions, not user browsers.


def clean(value):
    return ' '.join(str(value or '').split())


def key(value):
    return clean(value).casefold()


def get_soup(url):
    time.sleep(DELAY)
    response = SESSION.get(url, timeout=30)
    response.raise_for_status()
    if not response.text.strip():
        raise ValueError('Empty upstream page')
    return BeautifulSoup(response.text, 'html.parser')


def roster_by_academy(soup, comp):
    """IBJJF: academy heading, then Category | Athlete rows."""
    records = []
    team = ''
    for node in soup.find_all(['h2', 'h3', 'h4', 'h5', 'table']):
        if node.name != 'table':
            value = clean(node.get_text(' ', strip=True))
            if value and not value.lower().startswith(('total:', 'athletes list', 'search academy')):
                team = value
            continue
        headers = [key(cell.get_text(' ', strip=True)) for cell in node.select('tr:first-child th, tr:first-child td')]
        if 'category' not in headers or 'athlete' not in headers:
            continue
        category_index, name_index = headers.index('category'), headers.index('athlete')
        for row in node.find_all('tr'):
            cells = row.find_all('td', recursive=False)
            if len(cells) <= max(category_index, name_index):
                continue
            bracket = clean(cells[category_index].get_text(' ', strip=True))
            name = clean(cells[name_index].get_text(' ', strip=True))
            if bracket.count('/') < 3 or not name:
                continue
            records.append({'competition_id': str(comp['id']), 'competition_name': comp['name'],
                            'date': comp['date'], 'name': name, 'team': team, 'bracket': bracket,
                            'time': '', 'mat': '', 'day': '', 'bracket_url': ''})
    if not records:
        raise ValueError('IBJJF academy-team page returned no recognizable Category/Athlete rows')
    return list({(r['name'], r['team'], r['bracket']): r for r in records}.values())


def category_key(parts):
    return tuple(key(re.sub(r'\([^)]*\)', '', x)) for x in parts)


def schedule_brackets(soup):
    """Schedule links include category, division start time, and a bracket URL."""
    entries = {}
    for anchor in soup.find_all('a', href=True):
        url = urljoin('https://www.bjjcompsystem.com', anchor['href'])
        if not re.search(r'/tournaments/\d+/categories/\d+', url):
            continue
        label = clean(anchor.get_text(' ', strip=True))
        match = re.search(r'(\d{1,2}:\d{2}\s*[AP]M)\s*,?\s*(Sat|Sun|Mon|Tue|Wed|Thu|Fri)\b', label, re.I)
        if not match:
            continue
        category = clean(label[:match.start()]).strip(' *')
        chunks = [clean(v).strip('*') for v in category.split('/')]
        if len(chunks) != 4:
            continue
        # Website order: Age / Sex / Belt / Weight
        age, sex, belt, weight = chunks
        lookup = category_key((belt, age, sex, weight))
        entries[lookup] = {'url':url, 'division_time':clean(match.group(1)),
                           'division_day':match.group(2).title()}
    if not entries:
        raise ValueError('BJJCompSystem schedule contains no linked brackets')
    return entries


def parse_fights(soup):
    """Find bracket fight blocks and their stated mat/day/time.

    Text order matches published bracket: FIGHT N: Mat X, date/time, participant
    names, followed by next FIGHT. Ranking and BYE sections aren't fights.
    """
    container = soup.select_one('main') or soup.body or soup
    lines = [clean(x) for x in container.get_text('\n', strip=True).splitlines()]
    lines = [x for x in lines if x]
    pattern = re.compile(r'^FIGHT\s+\d+:\s*Mat\s*(\d+)', re.I)
    when = re.compile(r'\b(Sat|Sun|Mon|Tue|Wed|Thu|Fri)\s+(\d{1,2}/\d{1,2})\s+at\s+(\d{1,2}:\d{2}\s*[AP]M)\b', re.I)
    fights = []
    current = None
    for line in lines:
        m = pattern.match(line)
        if m:
            if current: fights.append(current)
            current = {'mat':m.group(1), 'lines':[], 'day':'', 'time':'', 'date':''}
        elif current is not None:
            if line in ('Ranking', 'Swaps') or line.startswith('### Ranking'):
                fights.append(current)
                current = None
                continue
            current['lines'].append(line)
            if (t := when.search(line)):
                current['day'], current['date'], current['time'] = t.group(1).title(), t.group(2), clean(t.group(3))
    if current: fights.append(current)
    return [f for f in fights if f['day'] and f['time']]


def fill_assignments(athletes, bracket_entries, previous_by_key):
    by_category = {}
    for a in athletes:
        parts = [x.strip() for x in a['bracket'].split('/')]
        if len(parts) < 4: continue
        weight = clean(re.sub(r'\([^)]*\)', '', parts[3]))
        lookup = category_key((parts[0], parts[1], parts[2], weight))
        by_category.setdefault(lookup, []).append(a)
    completed, missed = 0, 0
    for category, group in by_category.items():
        info = bracket_entries.get(category)
        if not info:
            missed += len(group)
            continue
        # Estimated schedule is useful only for missing first-fight timings.
        for athlete in group:
            athlete['time'] = info['division_time']
            athlete['day'] = info['division_day']
            athlete['bracket_url'] = info['url']
            athlete['time_type'] = 'estimated division start'
        try:
            fights = parse_fights(get_soup(info['url']))
            for athlete in group:
                matching = [f for f in fights if key(athlete['name']) in {key(x) for x in f['lines']}]
                if matching:
                    # Byes can display a name in later fights: use earliest stated fight time.
                    first = min(matching, key=lambda f: datetime.strptime(f['date'] + ' ' + f['time'], '%m/%d %I:%M %p'))
                    athlete['mat'], athlete['time'], athlete['day'] = first['mat'], first['time'], first['day']
                    athlete['time_type'] = 'first listed fight'
                    completed += 1
        except (requests.RequestException, ValueError) as exc:
            print(f'Bracket unavailable {info["url"]}: {exc}')
            for athlete in group:
                old = previous_by_key.get((athlete['competition_id'], athlete['name'], athlete['bracket']))
                if old and old.get('mat'):
                    athlete.update({k:old.get(k,'') for k in ('mat','time','day','time_type')})
        # A missing mat remains blank (not guessed from other athletes in a division).
    return completed, missed


def main():
    source = json.loads((ROOT/'competitions.json').read_text())
    competitions = [c for c in source['competitions'] if 'boston' in c['name'].casefold() and c['date'] > CUT_OFF]
    dest = ROOT/'athletes.json'
    previous = json.loads(dest.read_text()) if dest.exists() else {}
    old = previous.get('athletes', [])
    previous_by_key = {(str(a.get('competition_id')),a.get('name'),a.get('bracket')):a for a in old}
    result, done, errors = [], [], {}
    for comp in competitions:
        cid = str(comp['id'])
        print(f'Fetching {cid}: {comp["name"]}', flush=True)
        try:
            roster = roster_by_academy(get_soup(comp['url']),comp)
            schedule = schedule_brackets(get_soup(f'https://www.bjjcompsystem.com/tournaments/{cid}/schedule'))
            count, unmatched = fill_assignments(roster,schedule,previous_by_key)
            print(f'  {len(roster)} athletes; {count} explicit fight assignments; {unmatched} unmatched divisions',flush=True)
            result.extend(roster)
            done.append(cid)
        except (requests.RequestException, ValueError) as exc:
            errors[cid] = str(exc)[:250]
            retained = [r for r in old if str(r.get('competition_id')) == cid]
            result.extend(retained)
            if retained and cid in previous.get('loaded_competition_ids',[]):done.append(cid)
            print(f'  FAILED: {exc}',flush=True)
    dest.write_text(json.dumps({'source':'IBJJF and BJJCompSystem','updated_at':datetime.now(timezone.utc).isoformat(),
                                'athletes':result,'loaded_competition_ids':done,'errors':errors}, ensure_ascii=False,indent=2)+'\n')
    print(f'Saved {len(result)} athlete entries, {len(errors)} roster errors')
    if not done: raise SystemExit('No competition rosters could be loaded; saved prior data where available')

if __name__=='__main__':main()
