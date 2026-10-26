#!/usr/bin/env python3
"""Discover IBJJF event names and *verified* numeric event IDs.

The calendar links to /events/<slug>, while athlete lists / BJJCompSystem
links on an event detail page expose the numeric ID when available.
Unresolvable future events are skipped, not assigned invented IDs.
"""
import asyncio
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse, unquote
from playwright.async_api import async_playwright

OUTPUT = Path(__file__).resolve().parents[1] / 'matches-competitions.json'
BASE = 'https://ibjjf.com'
LISTINGS = [BASE + '/events/calendar', BASE + '/events', BASE + '/']
SKIP_SLUGS = {'calendar', 'results', 'upcoming', 'my-first-championship', 'registration', 'ranking'}
EVENT_ID = re.compile(r'(?:/events/|/tournaments/)(\d+)(?:/|$|[?#])', re.I)
COMP_KEYWORDS = ('championship', 'open', 'copa', 'campeonato', 'grand prix', 'trials', 'masters')


def clean(text):
    return re.sub(r'\s+', ' ', str(text or '')).strip()


def event_slug(url):
    parsed = urlparse(urljoin(BASE, url))
    if parsed.netloc not in ('ibjjf.com', 'www.ibjjf.com'):
        return None
    parts = unquote(parsed.path).strip('/').split('/')
    if len(parts) != 2 or parts[0] != 'events':
        return None
    slug = parts[1].lower()
    if slug in SKIP_SLUGS or slug.isdigit() or not re.search(r'[a-z]', slug):
        return None
    return slug


def valid_id_from_url(url):
    match = EVENT_ID.search(url)
    return match.group(1) if match else None


async def discover_list(page, url):
    candidates = {}
    try:
        response = await page.goto(url, wait_until='domcontentloaded', timeout=45000)
        if response and response.status >= 400:
            print(f'Listing {url}: HTTP {response.status}', flush=True)
            return candidates
        await page.wait_for_timeout(2200)
        for _ in range(18):
            links = await page.locator('a[href]').evaluate_all('''nodes => nodes.map(a => ({url:a.href, text:(a.innerText || a.getAttribute('title') || a.getAttribute('aria-label') || '').trim()}))''')
            for link in links:
                slug = event_slug(link['url'])
                if slug:
                    name = clean(link['text'])
                    if len(name) < 12 or not any(k in name.lower() for k in COMP_KEYWORDS):
                        name = clean(slug.replace('-', ' ').title())
                    if len(name) >= 12:
                        candidates[slug] = {'url': urljoin(BASE, '/events/' + slug), 'name': name}
            at_bottom = await page.evaluate('window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 30')
            if at_bottom:
                break
            await page.evaluate('window.scrollBy(0, window.innerHeight * 2)')
            await page.wait_for_timeout(260)
        print(f'Listing {url}: {len(candidates)} event detail links', flush=True)
    except Exception as err:
        print(f'Listing {url} unavailable: {err}', flush=True)
    return candidates


async def resolve_one(context, slug, record, semaphore):
    async with semaphore:
        page = await context.new_page()
        try:
            response = await page.goto(record['url'], wait_until='domcontentloaded', timeout=35000)
            if response and response.status >= 400:
                return None
            await page.wait_for_timeout(350)
            title = clean(await page.title()).replace(' | IBJJF', '').strip()
            if not title or title.lower() in ('ibjjf', 'calendar'):
                title = record['name']
            links = await page.locator('a[href]').evaluate_all('nodes => nodes.map(a => ({href:a.href, text:(a.innerText||"").trim()}))')
            id_weights = {}
            for link in links:
                href = link['href']
                found = valid_id_from_url(href)
                if not found:
                    continue
                path = urlparse(href).path.lower()
                # Prefer explicit registration/athlete/schedule links belonging to this event.
                score = 3 if 'athletes-list' in path else (2 if '/tournaments/' in path else 1)
                id_weights[found] = max(score, id_weights.get(found, 0))
            if not id_weights:
                # Some event pages embed link targets as escaped JSON/hydration data.
                content = await page.content()
                patterns = [
                    r'(?:/events/|\\/events\\/)(\d+)/(?:athletes-list-by-academy-teams|athletes-list-by-divisions)',
                    r'(?:/tournaments/|\\/tournaments\\/)(\d+)/(?:categories|schedule)'
                ]
                for expression in patterns:
                    for m in re.finditer(expression, content, re.I):
                        id_weights[m.group(1)] = max(1, id_weights.get(m.group(1), 0))
            if not id_weights:
                return None
            high = max(id_weights.values())
            winners = [id for id,score in id_weights.items() if score == high]
            if len(winners) != 1:
                print(f'Ambiguous event ID for {slug}: {winners}', flush=True)
                return None
            event_id = winners[0]
            if len(title) < 8 or len(title) > 240:
                title = record['name']
            return {'id': event_id, 'name': title, 'url': record['url']}
        except Exception as err:
            print(f'Cannot resolve {slug}: {err}', flush=True)
            return None
        finally:
            await page.close()


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1360, 'height': 960}, locale='en-US')
        listing_page = await context.new_page()
        candidates = {}
        for listing in LISTINGS:
            candidates.update(await discover_list(listing_page, listing))
        await listing_page.close()
        print(f'Total candidate event pages: {len(candidates)}', flush=True)
        semaphore = asyncio.Semaphore(4)
        tasks = [resolve_one(context, slug, record, semaphore) for slug,record in candidates.items()]
        found = await asyncio.gather(*tasks)
        await browser.close()

    verified = {}
    for item in found:
        if not item:
            continue
        old = verified.get(item['id'])
        if old is None or len(item['name']) > len(old['name']):
            verified[item['id']] = item
    print(f'Verified {len(verified)} IDs from {len(candidates)} event pages', flush=True)
    if not verified:
        raise SystemExit('No verifiable numeric event IDs. Existing catalog remains unchanged.')
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {'source': 'IBJJF official event listings and detail pages',
               'updated_at': datetime.now(timezone.utc).isoformat(),
               'competitions': sorted(verified.values(), key=lambda r: r['name'].casefold())}
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Saved {len(verified)} competitions to {OUTPUT}', flush=True)


if __name__ == '__main__':
    asyncio.run(main())
