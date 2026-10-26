#!/usr/bin/env python3
"""Collect the IBJJF championship catalog without city restrictions.
Fail safely if the site's markup/API changes; never replace valid data with empty.
"""
import json
import re
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

OUTPUT = Path(__file__).resolve().parents[1] / 'matches-competitions.json'
SOURCES = ('https://ibjjf.com/events/calendar', 'https://ibjjf.com/events/upcoming', 'https://ibjjf.com/events/results')
SESSION = requests.Session()
SESSION.headers.update({'User-Agent': 'Mozilla/5.0 (compatible; ANY-NE-IBJJF-Catalog/1.0)', 'Accept': 'text/html,application/json'})


def normalize(text):
    return re.sub(r'\s+', ' ', unescape(str(text or ''))).strip()


def add(catalog, ident, name):
    ident = str(ident).strip()
    name = normalize(name)
    if not ident.isdigit() or len(name) < 7 or len(name) > 220:
        return
    if not re.search(r'open|championship|jiu.jitsu|grand slam|pan|world|european|international|kids|pro', name, re.I):
        return
    catalog[ident] = {'id': ident, 'name': name}


def extract_document(html, catalog):
    soup = BeautifulSoup(html, 'html.parser')
    # Direct links are the most dependable identifiers.
    for a in soup.select('a[href]'):
        href = a.get('href', '')
        match = re.search(r'/events/(\d+)(?:/|\?|$)', href)
        if match:
            add(catalog, match.group(1), a.get_text(' ', strip=True) or a.get('title', ''))
    # Some IBJJF pages embed event objects in hydrated application JSON.
    for tag in soup.find_all('script'):
        body = tag.string or tag.get_text()
        if not body or len(body) > 12000000:
            continue
        if tag.get('type') == 'application/ld+json' or tag.get('id') in ('__NEXT_DATA__', '__NUXT_DATA__'):
            try:
                walk(json.loads(body), catalog)
            except (ValueError, TypeError):
                pass
        # Link and title fields serialized in inline application state.
        for match in re.finditer(r'(?:\\?/events\\?/|https?://ibjjf\.com/events/)(\d+)', body):
            ident = match.group(1)
            nearby = body[max(0, match.start()-500):match.end()+600]
            candidate = re.search(r'["\\]?(?:name|title)["\\]?\s*:\s*["\\]((?:[^"\\]|\\.){8,210})["\\]', nearby)
            if candidate:
                add(catalog, ident, candidate.group(1).replace('\\"','"'))


def walk(obj, catalog):
    if isinstance(obj, dict):
        ident = obj.get('id') or obj.get('eventId') or obj.get('event_id')
        title = obj.get('name') or obj.get('title')
        if ident is not None and title:
            add(catalog, ident, title)
        for v in obj.values():
            if isinstance(v, (dict, list)):
                walk(v, catalog)
    elif isinstance(obj, list):
        for v in obj:
            walk(v, catalog)


def main():
    catalog = {}
    issues = []
    for url in SOURCES:
        try:
            response = SESSION.get(url, timeout=40)
            response.raise_for_status()
            extract_document(response.text, catalog)
            print(f'{url}: {len(catalog)} competitions discovered so far', flush=True)
        except (requests.RequestException, ValueError) as exc:
            issues.append(f'{url}: {exc}')
            print(f'WARNING {issues[-1]}', flush=True)
    if not catalog:
        raise SystemExit('No competitions with verified IBJJF event IDs discovered. IBJJF may serve this catalog only via JavaScript; existing catalog was not overwritten. ' + '; '.join(issues))
    result = {'source': 'IBJJF calendar / upcoming / results', 'updated_at': datetime.now(timezone.utc).isoformat(), 'competitions': sorted(catalog.values(), key=lambda c: c['name'].casefold())}
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print(f'Saved {len(catalog)} competitions to {OUTPUT}')


if __name__ == '__main__':
    main()
