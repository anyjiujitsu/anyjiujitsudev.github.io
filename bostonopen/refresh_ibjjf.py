#!/usr/bin/env python3
"""Build static Boston Open athlete and every explicitly identified fight from public IBJJF pages.

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
    for node in soup.find_all(['h3', 'table']):
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
            if bracket.count('/') < 3 or not name or not team:
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
    """Read the fight heading shown above each matchup: FIGHT 1: Mat 2.

    Each heading begins a new record; the next fight heading ends it.  Competitor
    names appear below the heading, sometimes preceded by ranking/seed numbers.
    """
    container = soup.select_one('main') or soup.body or soup
    lines = [clean(v) for v in container.get_text('\n', strip=True).splitlines()]
    lines = [v for v in lines if v]
    header = re.compile(r'^FIGHT\s*#?\s*(\d+)\s*:?\s*(.*)$', re.I)
    mat_re = re.compile(r'\bMat\s*(?:#|No\.?\s*)?(\d+)\b', re.I)
    when = re.compile(r'\b(Sat(?:urday)?|Sun(?:day)?|Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?)\s+(\d{1,2}/\d{1,2})(?:/\d{2,4})?\s+(?:at\s+)?(\d{1,2}:\d{2}\s*[AP]M)\b', re.I)
    fights = []
    current = None
    for line in lines:
        m = header.match(line)
        if m:
            if current and all(current.get(k) for k in ('mat', 'time', 'day')):
                fights.append(current)
            current = {'number':int(m.group(1)), 'mat':'', 'time':'', 'day':'', 'date':'', 'lines':[]}
            remainder = clean(m.group(2))
            if remainder:
                current['lines'].append(remainder)
        elif current is not None:
            current['lines'].append(line)
        if current is None:
            continue
        mat = mat_re.search(line)
        if mat and not current['mat']:
            current['mat'] = mat.group(1)
        scheduled = when.search(line)
        if scheduled:
            current['day'] = scheduled.group(1)[:3].title()
            current['date'] = scheduled.group(2)
            current['time'] = clean(scheduled.group(3))
    if current and all(current.get(k) for k in ('mat', 'time', 'day')):
        fights.append(current)
    return fights


def fight_contains_athlete(fight, name):
    """Recognize a competitor row with a leading seed (e.g. '16 JOHN DOE').

    Do not match winner-of-fight placeholders or arbitrary partial names.
    """
    target = key(name)
    for line in fight['lines']:
        normalized = key(re.sub(r'^\s*\d{1,3}\s+', '', line))
        if normalized == target or normalized.startswith(target + ' '):
            return True
    return False


def _competitor_visual_state(node):
    """Conservative style-based result recognition; never infer from bracket position.

    A result is usable only when explicitly grey/black styling (or semantic
    winner/loser classes) is present on the competitor text or its near wrapper.
    """
    for ancestor_index, tag in enumerate([node] + list(node.parents)[:3]):
        if not getattr(tag, 'attrs', None):
            continue
        classes = ' '.join(tag.get('class', [])).lower()
        classes = re.sub(r'[^a-z0-9]+', ' ', classes)
        words = set(classes.split())
        if {'loser', 'lost', 'defeated'} & words:
            return 'LOSS'
        if {'winner', 'won', 'victor'} & words:
            return 'WIN'
        style = tag.get('style', '').lower()
        if 'opacity' in style:
            match = re.search(r'opacity\s*:\s*(0?\.\d+|1(?:\.0+)?)', style)
            if match and float(match.group(1)) < .75:
                return 'LOSS'
        match = re.search(r'(?:^|;)\s*color\s*:\s*([^;!]+)', style)
        if match:
            color = match.group(1).strip().replace(' ', '')
            if color in ('black','#000','#000000','rgb(0,0,0)','#111','#111111','#222','#222222'):
                return 'WIN'
            if color in ('gray','grey','darkgray','darkgrey','lightgray','lightgrey','#777','#777777','#888','#888888','#999','#999999','#aaa','#aaaaaa','#bbb','#bbbbbb','#ccc','#cccccc'):
                return 'LOSS'
            rgb = re.fullmatch(r'rgba?\((\d+),(\d+),(\d+)(?:,[^)]*)?\)',color)
            if rgb:
                channels = [int(rgb.group(i)) for i in (1,2,3)]
                if max(channels)-min(channels) <= 12:
                    if max(channels) <= 45:
                        return 'WIN'
                    if 100 <= min(channels) <= 210:
                        return 'LOSS'
        # CSS utility classes aren't reliable without stylesheets, so only
        # recognize explicit unambiguous semantic hints.
    return None


def fight_results_from_styling(soup, fights, roster_names):
    """Extract only confirmed fight outcomes from BJJ Competition System cards.

    BJJCompSystem marks the defeated competitor's *description* span with
    `match-competitor--loser`; the opponent is the winner only when both
    competitors are named and exactly one has this marker. A scheduled but
    unfinished match has no loser marker and must produce no results.
    """
    fight_nums = {f['number'] for f in fights}
    names = {key(n) for n in roster_names}
    verified = {}
    header = re.compile(r'\bFIGHT\s*#?\s*(\d+)\b', re.I)

    for match in soup.select('.tournament-category__match'):
        heading = match.select_one('.tournament-category__match-header')
        match_header = clean(heading.get_text(' ', strip=True)) if heading else ''
        found = header.search(match_header)
        if not found:
            continue
        number = int(found.group(1))
        if number not in fight_nums:
            continue
        competitors = []
        for card in match.select('.match-card__competitor'):
            name_el = card.select_one('.match-card__competitor-name')
            if name_el is None:
                continue
            name = key(name_el.get_text(' ', strip=True))
            # A later-round placeholder isn't a confirmed athlete.
            if name not in names:
                continue
            desc = card.select_one('.match-card__competitor-description')
            is_loser = bool(desc and 'match-competitor--loser' in desc.get('class', []))
            competitors.append((name, is_loser))
        # Only award a result if both roster athletes are known, distinct,
        # and exactly one is explicitly flagged as loser by the site.
        if (len(competitors) == 2 and competitors[0][0] != competitors[1][0]
                and sum(is_loser for _, is_loser in competitors) == 1):
            for name, is_loser in competitors:
                verified[(number, name)] = 'LOSS' if is_loser else 'WIN'

    return verified


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
            for athlete in group:
                old = previous_by_key.get((athlete['competition_id'], athlete['name'], athlete['bracket']))
                if old:
                    athlete.update({k: old.get(k, '') for k in ('time', 'mat', 'day', 'bracket_url', 'time_type')})
                    athlete['fights'] = previous_fights(previous_by_key, athlete)
            continue
        # Estimated schedule is useful only for missing first-fight timings.
        for athlete in group:
            athlete['time'] = info['division_time']
            athlete['day'] = info['division_day']
            athlete['bracket_url'] = info['url']
            athlete['time_type'] = 'estimated division start'
        try:
            bracket_soup = get_soup(info['url'])
            fights = parse_fights(bracket_soup)
            result_states = fight_results_from_styling(bracket_soup, fights, [a['name'] for a in group])
            print(f'    {info["url"]}: {len(fights)} dated/matted fights parsed', flush=True)
            for athlete in group:
                matching = [f for f in fights if fight_contains_athlete(f, athlete['name'])]
                if matching:
                    # Keep ALL explicitly named bouts, including subsequent rounds.
                    # A 'WINNER OF FIGHT N' placeholder is not sufficient proof
                    # of who advanced, so never assign those to an athlete.
                    unique = {(f['number'], f['date']): f for f in matching}
                    ordered = sorted(unique.values(), key=lambda f: datetime.strptime(f['date'] + ' ' + f['time'], '%m/%d %I:%M %p'))
                    athlete['fights'] = [
                        {'fight_number': f['number'], 'fight_date': f['date'],
                         'mat': f['mat'], 'time': f['time'], 'day': f['day'],
                         'time_type': 'explicit bracket fight',
                         'result': result_states.get((f['number'], key(athlete['name'])), '')}
                        for f in ordered
                    ]
                    first = ordered[0]
                    athlete['mat'], athlete['time'], athlete['day'] = first['mat'], first['time'], first['day']
                    athlete['time_type'] = 'explicit bracket fight'
                    completed += 1
                else:
                    old = previous_by_key.get((athlete['competition_id'], athlete['name'], athlete['bracket']))
                    if old and old.get('mat'):
                        athlete.update({k:old.get(k,'') for k in ('mat','time','day','time_type')})
                        athlete['fights'] = previous_fights(previous_by_key, athlete)
        except (requests.RequestException, ValueError) as exc:
            print(f'Bracket unavailable {info["url"]}: {exc}')
            for athlete in group:
                old = previous_by_key.get((athlete['competition_id'], athlete['name'], athlete['bracket']))
                if old and old.get('mat'):
                    athlete.update({k:old.get(k,'') for k in ('mat','time','day','time_type')})
                    athlete['fights'] = previous_fights(previous_by_key, athlete)
        # A missing mat remains blank (not guessed from other athletes in a division).
    return completed, missed



def previous_fights(previous_by_key, athlete):
    """Carry over verified past fights when a bracket is temporarily unreachable."""
    old = previous_by_key.get((athlete['competition_id'], athlete['name'], athlete['bracket']))
    if not old:
        return []
    fights = old.get('fights')
    if isinstance(fights, list) and fights:
        return fights
    if old.get('fight_number') and old.get('mat'):
        return [{k: old.get(k, '') for k in ('fight_number', 'fight_date', 'mat', 'time', 'day', 'time_type', 'result')}]
    return []


def expand_fight_rows(athletes):
    """One result row per actual bout; still show unassigned athletes once."""
    result = []
    for athlete in athletes:
        fights = athlete.pop('fights', [])
        if not fights:
            result.append(athlete)
            continue
        for fight in fights:
            row = dict(athlete)
            row.update(fight)
            result.append(row)
    return result

def main():
    source = json.loads((ROOT/'competitions.json').read_text())
    competitions = [c for c in source['competitions'] if 'boston' in c['name'].casefold() and c['date'] > CUT_OFF]
    dest = ROOT/'athletes.json'
    previous = json.loads(dest.read_text()) if dest.exists() else {}
    old = previous.get('athletes', [])
    previous_by_key = {}
    for a in old:
        identity = (str(a.get('competition_id')), a.get('name'), a.get('bracket'))
        if identity not in previous_by_key:
            previous_by_key[identity] = dict(a, fights=[])
        if a.get('fight_number'):
            previous_by_key[identity]['fights'].append({k: a.get(k, '') for k in ('fight_number', 'fight_date', 'mat', 'time', 'day', 'time_type', 'result')})
        elif a.get('fights'):
            previous_by_key[identity]['fights'].extend(a['fights'])
    result, done, errors = [], [], {}
    for comp in competitions:
        cid = str(comp['id'])
        print(f'Fetching {cid}: {comp["name"]}', flush=True)
        try:
            roster = roster_by_academy(get_soup(comp['url']),comp)
            # Successful IBJJF athlete data must never depend on schedule/bracket availability.
            done.append(cid)
            print(f'  {len(roster)} athletes collected from IBJJF', flush=True)
            try:
                schedule = schedule_brackets(get_soup(f'https://www.bjjcompsystem.com/tournaments/{cid}/schedule'))
                count, unmatched = fill_assignments(roster, schedule, previous_by_key)
                print(f'  {count} explicit fight assignments; {unmatched} unmatched divisions', flush=True)
            except (requests.RequestException, ValueError) as schedule_error:
                errors[f'{cid}_schedule'] = str(schedule_error)[:250]
                print(f'  Schedule not available; retaining IBJJF athletes: {schedule_error}', flush=True)
                for athlete in roster:
                    old = previous_by_key.get((athlete['competition_id'], athlete['name'], athlete['bracket']))
                    if old:
                        athlete.update({k: old.get(k, '') for k in ('time', 'mat', 'day', 'bracket_url', 'time_type')})
                        athlete['fights'] = previous_fights(previous_by_key, athlete)
            result.extend(expand_fight_rows(roster))
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
