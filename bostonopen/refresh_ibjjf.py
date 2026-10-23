#!/usr/bin/env python3
"""Refresh public IBJJF Boston athlete rosters for a static GitHub Pages page.

This accesses the three explicitly verified IBJJF competition pages, respectfully
and at low frequency. If the website changes structure or denies access, retain
existing valid data and report an error rather than inventing athletes.
"""
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
COMPETITIONS = ROOT / 'competitions.json'
ATHLETES = ROOT / 'athletes.json'
CUTOFF = '2026-07-01'  # exclusive
SESSION = requests.Session()
SESSION.headers.update({'User-Agent': 'ANY-NE-Grappling-Event-Directory/1.0 (+public roster archival; contact site maintainer)', 'Accept': 'text/html'})


def text(node):
    return ' '.join(node.get_text(' ', strip=True).split())


def roster_from_html(html, comp):
    soup = BeautifulSoup(html, 'html.parser')
    # IBJJF publishes headers for belt and division, followed by Team/Athlete tables.
    # Read document order to preserve division context for each table.
    active_belt = ''
    active_division = ''
    records = []
    for node in soup.find_all(['h2', 'h3', 'h4', 'h5', 'table']):
        if node.name != 'table':
            title = text(node)
            if re.search(r'\bbelt\b', title, re.I) and len(title) < 90 and '/' not in title:
                active_belt = title
            elif '/' in title and not title.lower().startswith(('http', 'filter')):
                active_division = title
            continue
        headers = [text(h).lower() for h in node.select('thead th')]
        if not headers:
            first_row = node.find('tr')
            if first_row:
                headers = [text(h).lower() for h in first_row.find_all(['th','td'],recursive=False)]
        if not any('athlete' in h or h == 'name' for h in headers) or not any('team' in h or 'academy' in h for h in headers):
            continue
        ti = next(i for i,h in enumerate(headers) if 'team' in h or 'academy' in h)
        ni = next(i for i,h in enumerate(headers) if 'athlete' in h or h == 'name')
        for tr in node.find_all('tr'):
            cells = tr.find_all('td', recursive=False)
            if len(cells) <= max(ti,ni):
                continue
            team, name = text(cells[ti]), text(cells[ni])
            if not name or name.lower() in ('name','athlete'):
                continue
            records.append({'competition_id':str(comp['id']), 'competition_name':comp['name'], 'date':comp['date'], 'name':name, 'team':team, 'belt':active_belt, 'division':active_division})
    # Do not treat a changed page, blocked request, or empty registrations as a successful roster sync.
    if not records:
        raise ValueError('No readable athlete rows found (page may have changed or access may be blocked)')
    unique = {}
    for record in records:
        unique[(record['name'],record['team'],record['division'],record['belt'])] = record
    return list(unique.values())


def main():
    obj = json.loads(COMPETITIONS.read_text())
    comps = [c for c in obj['competitions'] if 'boston' in c['name'].lower() and c['date'] > CUTOFF]
    previous = json.loads(ATHLETES.read_text()) if ATHLETES.exists() else {}
    old = previous.get('athletes',[])
    all_athletes = []
    completed, errors = [], {}
    for index, comp in enumerate(comps):
        if index: time.sleep(2)
        try:
            response = SESSION.get(comp['url'], timeout=25)
            response.raise_for_status()
            entries = roster_from_html(response.text, comp)
            all_athletes.extend(entries)
            completed.append(str(comp['id']))
            print(f"{comp['id']}: {len(entries)} athlete entries")
        except (requests.RequestException, ValueError) as exc:
            errors[str(comp['id'])] = str(exc)[:250]
            # Preserve previous records if an intermittent upstream failure occurs.
            previous_entries = [a for a in old if str(a.get('competition_id')) == str(comp['id'])]
            if previous_entries:
                all_athletes.extend(previous_entries)
                if str(comp['id']) in previous.get('loaded_competition_ids',[]): completed.append(str(comp['id']))
            print(f"{comp['id']}: WARNING {exc}")
    result = {'source':'IBJJF', 'updated_at':datetime.now(timezone.utc).isoformat(),
              'athletes':all_athletes, 'loaded_competition_ids':completed, 'errors':errors}
    ATHLETES.write_text(json.dumps(result,ensure_ascii=False,indent=2) + '\n')
    print(f"Finished: {len(all_athletes)} entries across {len(completed)} rosters, {len(errors)} errors")
    if not completed:
        raise SystemExit('No rosters successfully read; check IBJJF access and markup')


if __name__ == '__main__': main()
