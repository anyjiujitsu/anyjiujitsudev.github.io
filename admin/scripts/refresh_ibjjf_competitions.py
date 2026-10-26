#!/usr/bin/env python3
"""Discover IBJJF competition IDs/names from the official calendar.

Use a real browser because IBJJF renders event cards with JavaScript. Never
publish an empty catalog and never invent event IDs.
"""
import asyncio
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

from playwright.async_api import async_playwright

OUTPUT = Path(__file__).resolve().parents[1] / 'matches-competitions.json'
PAGES = ['https://ibjjf.com/events/calendar', 'https://ibjjf.com/events/results']
ID_RE = re.compile(r'/events/(\d+)(?:/|$|[?#])')


def clean(value):
    return re.sub(r'\s+', ' ', str(value or '')).strip()


def normalize_item(url, title):
    match = ID_RE.search(urlparse(url).path + ('?' if '?' in url else ''))
    title = clean(title)
    if not match or len(title) < 9 or len(title) > 220:
        return None
    # Exclude non-competition navigational anchors and generic link names.
    if title.lower() in {'more info', 'view', 'details', 'register', 'results', 'athletes', 'brackets'}:
        return None
    return {'id': match.group(1), 'name': title}


async def extract_items(page):
    """Read browser DOM after hydration; use event link's card text as fallback."""
    return await page.evaluate('''() => {
      const found = [];
      for (const a of document.querySelectorAll('a[href]')) {
        const href = a.href;
        if (!/\\/events\\/\\d+(?:\\/|[?#]|$)/.test(href)) continue;
        const card = a.closest('article, li, [class*="event-card"], [class*="EventCard"], [class*="championship"]');
        const candidates = [
          a.querySelector('h1,h2,h3,h4,[class*="title"],[class*="name"]')?.textContent,
          a.getAttribute('aria-label'), a.getAttribute('title'),
          a.textContent,
          card?.querySelector('h1,h2,h3,h4,[class*="title"],[class*="name"]')?.textContent
        ];
        found.push({href, candidates});
      }
      return found;
    }''')


async def main():
    found = {}
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page(viewport={'width': 1280, 'height': 900}, locale='en-US')
        for url in PAGES:
            try:
                response = await page.goto(url, wait_until='domcontentloaded', timeout=60000)
                if response and response.status >= 400:
                    raise RuntimeError(f'HTTP {response.status}')
                await page.wait_for_timeout(3500)
                # Some calendar results are lazy-loaded; scroll through the page.
                previous = -1
                for _ in range(30):
                    for item in await extract_items(page):
                        for candidate in item['candidates']:
                            entry = normalize_item(item['href'], candidate)
                            if entry and ('202' in entry['name'] or 'championship' in entry['name'].lower() or 'open' in entry['name'].lower()):
                                old = found.get(entry['id'])
                                if old is None or len(entry['name']) > len(old['name']):
                                    found[entry['id']] = entry
                                break
                    await page.evaluate('window.scrollBy(0, window.innerHeight * 2)')
                    await page.wait_for_timeout(280)
                    size = await page.evaluate('document.documentElement.scrollHeight')
                    if size == previous and await page.evaluate('window.scrollY + innerHeight >= document.documentElement.scrollHeight - 20'):
                        break
                    previous = size
                print(f'{url}: {len(found)} unique event IDs found so far', flush=True)
            except Exception as error:
                print(f'WARNING: could not read {url}: {error}', flush=True)
        await browser.close()
    if not found:
        raise SystemExit('IBJJF rendered no accessible event ID/name links; existing catalog left unchanged. Check browser logs and calendar markup.')
    result = {
        'source': 'IBJJF official event calendar and results',
        'updated_at': datetime.now(timezone.utc).isoformat(),
        'competitions': sorted(found.values(), key=lambda e: e['name'].casefold())
    }
    OUTPUT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'Saved {len(found)} verified event IDs to {OUTPUT}', flush=True)


if __name__ == '__main__':
    asyncio.run(main())
