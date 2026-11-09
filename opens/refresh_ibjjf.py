#!/usr/bin/env python3
"""Build static OPENS athlete and fight data from public IBJJF pages.

Sources: IBJJF athletes-by-academy, BJJCompSystem schedule and bracket pages.
No website API keys, no browser-side cross-origin requests. Keep prior data when
upstream pages fail. A missing fight assignment is never invented.
"""
import json
import os
import re
import time
import threading
from concurrent.futures import ThreadPoolExecutor
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
# Concurrent downloads are bounded to avoid overwhelming upstream providers.
WORKERS = max(1, min(3, int(os.environ.get('OPENS_FETCH_WORKERS', '3'))))
REQUEST_SPACING = 0.35  # Minimum spacing between starts across all workers.
_tls = threading.local()
_cache = {}
_cache_lock = threading.Lock()
_cache_inflight = {}
_start_lock = threading.Lock()
_next_start = 0.0
_stats_lock = threading.Lock()
_stats = {'network_requests': 0, 'cache_hits': 0, 'fetch_seconds': 0.0}


def _session():
    if not hasattr(_tls, 'session'):
        session = requests.Session()
        session.headers.update({'User-Agent': 'Mozilla/5.0 (compatible; AnyNE-BostonOpen/1.0)',
                                'Accept': 'text/html'})
        _tls.session = session
    return _tls.session


def _fetch_html(url):
    global _next_start
    # Only one worker schedules a network request at any given instant.
    with _start_lock:
        now = time.monotonic()
        delay = max(0.0, _next_start - now)
        if delay:
            time.sleep(delay)
        _next_start = time.monotonic() + REQUEST_SPACING
    start = time.monotonic()
    response = _session().get(url, timeout=30)
    response.raise_for_status()
    if not response.text.strip():
        raise ValueError('Empty upstream page')
    with _stats_lock:
        _stats['network_requests'] += 1
        _stats['fetch_seconds'] += time.monotonic() - start
    return response.text


def timing_report(start):
    with _stats_lock:
        stats = dict(_stats)
    print(f"  Fetch metrics: {stats['network_requests']} HTTP requests, "
          f"{stats['cache_hits']} cache hits, "
          f"{stats['fetch_seconds']:.1f}s aggregate HTTP time, "
          f"{time.monotonic() - start:.1f}s elapsed, {WORKERS} workers", flush=True)


def clean(value):
    return ' '.join(str(value or '').split())


def key(value):
    return clean(value).casefold()


def get_soup(url):
    # Cache HTML (not BeautifulSoup) so each consumer gets an independent tree.
    # In-flight coordination avoids downloading the same URL twice concurrently.
    with _cache_lock:
        if url in _cache:
            with _stats_lock:
                _stats['cache_hits'] += 1
            return BeautifulSoup(_cache[url], 'html.parser')
        if url in _cache_inflight:
            event = _cache_inflight[url]
            owner = False
        else:
            event = threading.Event()
            _cache_inflight[url] = event
            owner = True
    if not owner:
        event.wait()
        with _cache_lock:
            cached = _cache.get(url)
        if cached is not None:
            with _stats_lock:
                _stats['cache_hits'] += 1
            return BeautifulSoup(cached, 'html.parser')
        # A failed request is not cached; retry it once in this caller.
        return get_soup(url)
    try:
        html = _fetch_html(url)
        with _cache_lock:
            _cache[url] = html
    finally:
        with _cache_lock:
            _cache_inflight.pop(url, None)
            event.set()
    return BeautifulSoup(html, 'html.parser')


def roster_by_academy(soup, comp):
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
            records.append({
                'competition_id': str(comp['id']),
                'competition_name': comp['name'],
                'date': comp['date'],
                'name': name,
                'team': team,
                'bracket': bracket,
                'time': '',
                'mat': '',
                'day': '',
                'bracket_url': '',
                'time_type': '',
                'result': ''
            })
    if not records:
        raise ValueError('IBJJF academy-team page returned no recognizable Category/Athlete rows')
    return list({(r['name'], r['team'], r['bracket']): r for r in records}.values())


def category_key(parts):
    return tuple(key(re.sub(r'\([^)]*\)', '', x)) for x in parts)


def open_class_weight(value):
    """Normalize IBJJF and BJJCompSystem Open Class wording."""
    v = key(value).replace('-', ' ')
    if v in {'open', 'open class', 'absolute', 'absolute class'}:
        return 'open class'
    return v


def schedule_brackets(soup):
    """Return schedules by Belt/Age/Sex/Weight, supporting Open Class links.

    Open Class may have three slash-separated parts (no separate weight), or
    four parts, and its scheduled start time may not be shown in link text.
    """
    entries = {}
    for anchor in soup.find_all('a', href=True):
        url = urljoin('https://www.bjjcompsystem.com', anchor['href'])
        if not re.search(r'/tournaments/\d+/categories/\d+', url):
            continue
        label = clean(anchor.get_text(' ', strip=True))
        match = re.search(r'(\d{1,2}:\d{2}\s*[AP]M)\s*,?\s*(Sat|Sun|Mon|Tue|Wed|Thu|Fri)\b', label, re.I)
        category = clean(label[:match.start()] if match else label).strip(' *')
        chunks = [clean(v).strip('*') for v in category.split('/')]
        if len(chunks) == 3 and re.search(r'\bopen\s*class\b', category, re.I):
            age, sex, belt = chunks
            weight = 'Open Class'
        elif len(chunks) == 4:
            age, sex, belt, weight = chunks
            # The source can include the words Open Class on either side.
            if re.search(r'\bopen\s*class\b', category, re.I):
                weight = 'Open Class'
        else:
            continue
        lookup = category_key((belt, age, sex, open_class_weight(weight)))
        entries[lookup] = {
            'url': url,
            'division_time': clean(match.group(1)) if match else '',
            'division_day': match.group(2).title() if match else ''
        }
    if not entries:
        raise ValueError('BJJCompSystem schedule contains no linked brackets')
    return entries


def _fetch_bracket(url):
    try:
        return get_soup(url)
    except (requests.RequestException, ValueError) as exc:
        return exc


def discover_open_class_links(entries, competition_id, roster):
    """Discover missing BJJCompSystem categories without hardcoded category IDs.

    A division's category ID is discovered only from a real published link.
    Never fabricate sequential IDs or infer a URL from an athlete's name.
    """
    required = set()
    for athlete in roster:
        parts = [clean(x) for x in athlete.get('bracket', '').split('/')]
        if len(parts) >= 4:
            weight = open_class_weight(clean(re.sub(r'\([^)]*\)', '', parts[3])))
            required.add(category_key((parts[0], parts[1], parts[2], weight)))
    missing = required - entries.keys()
    if not missing:
        return entries

    root_url = f'https://www.bjjcompsystem.com/tournaments/{competition_id}'
    # Category lists can be filtered by gender; the bare tournament URL and
    # /divisions are not valid on this provider. Fetch the actual category-list
    # variants and the existing schedule, retaining any category hrefs.
    pages = [
        root_url + '/categories?gender_id=1',
        root_url + '/categories?gender_id=2',
        root_url + '/categories?gender_id=3',
        root_url + '/categories',
        root_url + '/schedule',
    ]
    urls = set()
    category_re = re.compile(
        rf'https?://(?:www\.)?bjjcompsystem\.com/tournaments/{re.escape(str(competition_id))}/categories/\d+$',
        re.I,
    )
    for page in pages:
        try:
            soup = get_soup(page)
        except (requests.RequestException, ValueError) as exc:
            print(f'  Category listing unavailable: {page}: {exc}', flush=True)
            continue
        links_on_page = 0
        for anchor in soup.find_all('a', href=True):
            url = urljoin(root_url, anchor['href']).split('?')[0].split('#')[0]
            if not category_re.fullmatch(url):
                continue
            urls.add(url)
            links_on_page += 1
        print(f'  Category listing {page}: {links_on_page} category links', flush=True)
        for lookup, data in schedule_brackets_optional(soup).items():
            if lookup in missing:
                entries[lookup] = data
        missing = required - entries.keys()
    # Verify every discovered link by parsing the bracket's own heading.
    # This works for single-entrant BYEs with no fight/schedule time.
    print(f'  {len(urls)} unique candidate bracket URLs for {competition_id}; '
          f'{len(missing)} divisions still unlinked', flush=True)
    visited = set(v['url'] for v in entries.values())
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
      for url, fetched in zip(sorted(urls - visited), pool.map(_fetch_bracket, sorted(urls - visited))):
        if not missing:
            break
        try:
            if isinstance(fetched, Exception):
                raise fetched
            soup = fetched
        except (requests.RequestException, ValueError) as exc:
            print(f'  Bracket discovery unavailable: {url}: {exc}', flush=True)
            continue
        # Heading selector is intentionally broad: categories are rendered in
        # multiple versions, including Open Class on its own line.
        section = soup.select_one('.tournament-category__bracket, .tournament-category_bracket')
        heading = soup.select_one('.tournament-category__title, .tournament-category__header, .tournament-category_bracket-title, h1, h2')
        label = clean(heading.get_text(' ', strip=True)) if heading else ''
        if not label and section:
            label = clean(section.get_text(' ', strip=True)[:200])
        if not label and soup.title:
            label = clean(soup.title.get_text(' ', strip=True))
        # Match normalized attributes as discrete words, never substring
        # matching (Master 1 must not match Master 10).
        tokens = key(label).replace('-', ' ')
        matches = []
        for division in missing:
            belt, age, sex, weight = division
            if all(re.search(rf'(?<!\w){re.escape(part)}(?!\w)', tokens)
                   for part in (belt, age, sex)):
                actual_weight = open_class_weight(weight)
                if actual_weight == 'open class':
                    ok = bool(re.search(r'\b(?:open\s+class|absolute)\b', tokens))
                else:
                    ok = bool(re.search(rf'(?<!\w){re.escape(actual_weight)}(?!\w)', tokens))
                if ok:
                    matches.append(division)
        if len(matches) == 1:
            entries[matches[0]] = {'url': url, 'division_time': '', 'division_day': ''}
            missing.remove(matches[0])
            print(f'  Discovered category {matches[0]} -> {url}', flush=True)
    if missing:
        print(f'  Division links not discovered for {competition_id}: {sorted(missing)}', flush=True)
    return entries


def schedule_brackets_optional(soup):
    try:
        return schedule_brackets(soup)
    except ValueError:
        return {}


def parse_header_fields(text):
    text = clean(text)
    number = ''
    mat = ''
    day = ''
    date = ''
    time_value = ''
    fight_match = re.search(r'FIGHT\s*#?\s*(\d+)', text, re.I)
    if fight_match:
        number = fight_match.group(1)
    mat_match = re.search(r'\bMat\s*(?:#|No\.?\s*)?(\d+)\b', text, re.I)
    if mat_match:
        mat = mat_match.group(1)
    when = re.search(r'\b(Sat(?:urday)?|Sun(?:day)?|Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?)\s+(\d{1,2}/\d{1,2})(?:/\d{2,4})?\s+(?:at\s+)?(\d{1,2}:\d{2}\s*[AP]M)\b', text, re.I)
    if when:
        day = when.group(1)[:3].title()
        date = when.group(2)
        time_value = clean(when.group(3))
    return {'number': number, 'mat': mat, 'day': day, 'date': date, 'time': time_value}


def is_placeholder_name(name):
    n = key(name)
    return (not n or n == '-' or n.startswith('winner of fight') or
            n.startswith('loser of fight') or n.startswith('defeated of fight') or
            n.startswith('fight '))


def normalize_competitor_name(name):
    return clean(re.sub(r'^\s*\d{1,3}\s+', '', name or ''))


def _fight_source_reference(value):
    """A bracket slot explicitly referring to the winner of another fight."""
    match = re.search(r'\bWINNER\s+OF\s+FIGHT\s*#?\s*(\d+)\b', clean(value), re.I)
    return int(match.group(1)) if match else None


# Bracket positions are provider card numbers, NOT scheduled fight numbers.
# In a 7-card tree, slots 1-4 feed 5-6, which feed 7; in a 15-card
# tree the tiers are 1-8 -> 9-12 -> 13-14 -> 15. Larger brackets
# split these same tiers across multiple bracket containers and use
# non-contiguous global position numbers. Therefore derive edges from
# the actual position sequence *within each bracket container*.


def _position_tiers(positions, layout):
    """Split a complete, power-of-two elimination layout into rounds.

    Never use fight numbers or guess adjacency from a partial bracket. The
    provider puts earlier-round positions before later rounds numerically,
    even when their global numbers are offset or interleaved with other halves.
    """
    if layout not in (1, 3, 7, 15) or len(positions) != layout or len(set(positions)) != layout:
        return None
    ordered = sorted(positions)
    result = []
    width = (layout + 1) // 2
    at = 0
    while width:
        result.append(ordered[at:at + width])
        at += width
        width //= 2
    if at != layout:
        return None
    return result


def _direct_round_edges(tiers):
    """Each pair in one round directly feeds one match in the next."""
    return [(source, target)
            for early, late in zip(tiers, tiers[1:])
            for i, source in enumerate(early)
            for target in [late[i // 2]]]


def _bracket_match_position(block):
    """Read a provider position when it really exists, never a FIGHT number.

    BJJCompSystem has served at least two match-card structures: the
    tournament-category__match wrapper can itself carry match-N, or a child
    can carry it. Older pages have only match-card and no position class at
    all; those must not be silently mistaken for positioned cards.
    """
    candidates = [block]
    candidates.extend(block.select('.tournament-category__match-card, .match-card'))
    for node in candidates:
        for cls in node.get('class', []):
            match = re.fullmatch(r'match-(\d+)', cls)
            if match:
                return int(match.group(1))
        match = re.fullmatch(r'match-(\d+)', node.get('id', ''))
        if match:
            return int(match.group(1))
    return None


def _bracket_container(block):
    return block.find_parent(class_=re.compile(r'^tournament-category__bracket(?:-\d+)?$'))


def _competitor_identity(block, competitor):
    """Use the source's persistent competitor ID, not the visible seed number."""
    target = key(competitor.get('name'))
    for node in block.select('.match-card__competitor[id]'):
        ident = node.get('id', '')
        m = re.fullmatch(r'competitor-(\d+)', ident)
        if not m:
            continue
        name_node = node.select_one('.match-card__competitor-name')
        if name_node and key(normalize_competitor_name(name_node.get_text(' ', strip=True))) == target:
            return m.group(1)
    return None


def _verified_advancement_identity(source_block, source, target_block, target):
    """Return evidence for matching one entrant across a *connected* match edge.

    Bracket competitor IDs are preferred and must never contradict each other.
    A missing/unusable ID may be compensated for by the exact full name AND
    academy printed on both cards. Never infer from name alone, seed numbers,
    fight-number order, or an athlete appearing in an unrelated match.
    """
    source_name = key(source.get('name'))
    target_name = key(target.get('name'))
    if not source_name or not target_name or source.get('placeholder') or target.get('placeholder'):
        return None
    if source.get('bye') or target.get('bye'):
        return None
    source_id = _competitor_identity(source_block, source)
    target_id = _competitor_identity(target_block, target)
    if source_id and target_id:
        # Both IDs present: contradictory IDs are dispositive even if names
        # happen to match. Never fall back to name to override this conflict.
        return 'competitor-id' if source_id == target_id else None
    source_team = key(source.get('team'))
    target_team = key(target.get('team'))
    if (source_name == target_name and source_team and source_team == target_team):
        return 'name-and-academy'
    return None


def infer_advancement_from_bracket_positions(records):
    """Resolve only directly connected bracket cards with verified identity.

    Handles 3/7/15 card groups, including their global position offsets, and
    larger published brackets composed of two or four 15-card halves. A
    downstream card must actually exist and name the progressing athlete.
    Never infer from fight-number order or the absence of an opponent alone.
    """
    audit = defaultdict(int)
    groups = {}
    audit['parsed_cards'] = len(records)
    for fight, block in records:
        container = _bracket_container(block)
        if container is None:
            audit['missing_bracket_container'] += 1
            continue
        layout = next((int(m.group(1)) for cls in container.get('class', [])
                       if (m := re.fullmatch(r'tournament-category__bracket-(\d+)', cls))), None)
        pos = _bracket_match_position(block)
        if layout not in (1, 3, 7, 15) or pos is None:
            audit['unsupported_or_unpositioned_cards'] += 1
            continue
        group_id = id(container)
        if group_id not in groups:
            groups[group_id] = {'node': container, 'layout': layout, 'cards': {},
                                'duplicate': False, 'parent': id(container.parent)}
        group = groups[group_id]
        if pos in group['cards']:
            group['duplicate'] = True
            audit['duplicate_positions'] += 1
        group['cards'][pos] = (fight, block)
        audit['positioned_cards'] += 1

    # Assemble only unambiguous, complete bracket groups; a position label on
    # a card is not a connection until its next-round card also exists.
    complete = []
    edges = []
    for group in groups.values():
        if group['duplicate']:
            continue
        tiers = _position_tiers(group['cards'], group['layout'])
        if not tiers:
            audit['incomplete_layout_groups'] += 1
            continue
        group['tiers'] = tiers
        complete.append(group)
        for source_pos, target_pos in _direct_round_edges(tiers):
            edges.append((group['cards'][source_pos], group['cards'][target_pos],
                          source_pos, target_pos))
        audit['complete_layout_groups'] += 1

    # Published 31- or 63-card brackets may consist of sibling 15-card
    # branches plus a terminal group. Their direct feeder connection is the
    # last card of each branch -> its corresponding final-stage card.
    by_parent = defaultdict(list)
    for group in complete:
        by_parent[group['parent']].append(group)
    for siblings in by_parent.values():
        # These groups are stored in document order, not by position.
        layouts = [g['layout'] for g in siblings]
        if layouts == [15, 15, 1] or layouts == [15, 15, 15, 15, 3]:
            leaves, tail = siblings[:-1], siblings[-1]
            leaf_positions = [g['tiers'][-1][0] for g in leaves]
            first_tail_positions = tail['tiers'][0]
            # Require the entire global numbering to form one coherent
            # consecutive block, not unrelated same-size brackets.
            all_positions = sorted(p for g in siblings for p in g['cards'])
            if all_positions != list(range(all_positions[0], all_positions[0] + len(all_positions))):
                audit['noncontiguous_multi_group'] += 1
                continue
            for i, group in enumerate(leaves):
                target_pos = first_tail_positions[i // 2]
                source_pos = leaf_positions[i]
                edges.append((group['cards'][source_pos], tail['cards'][target_pos],
                              source_pos, target_pos))
                audit['cross_group_edges'] += 1

    audit['mapped_edges'] = len(edges)
    for (upstream, source_block), (downstream, target_block), source_pos, target_pos in edges:
        if upstream.get('result_map'):
            audit['already_resolved'] += 1
            continue
        # A feeder-specific placeholder in the next card means the source
        # winner was not recorded. A different, named finalist is irrelevant.
        try:
            source_number = int(upstream.get('number') or '')
        except (ValueError, TypeError):
            source_number = None
        if source_number is not None and any(
            c.get('placeholder') and (
                _fight_source_reference(c.get('name')) == source_number
                or c.get('source_fight') == source_number)
            for c in downstream.get('competitors', [])
        ):
            audit['unresolved_feeder_placeholder'] += 1
            continue
        source_people = [c for c in upstream['competitors'] if not c.get('placeholder')
                         and not c.get('bye') and key(c.get('name'))]
        target_people = [c for c in downstream['competitors'] if not c.get('placeholder')
                         and not c.get('bye') and key(c.get('name'))]
        if not (1 <= len(source_people) <= 2) or not target_people:
            audit['missing_valid_competitors'] += 1
            continue
        if any(c.get('loser') for c in source_people):
            audit['explicit_loser_in_source'] += 1
            continue
        # A single matching identity on the connected downstream card is
        # required. All other cases, including two advancers, stay unresolved.
        matches = [(i, j, evidence)
                   for i, source in enumerate(source_people)
                   for j, target in enumerate(target_people)
                   if (evidence := _verified_advancement_identity(
                       source_block, source, target_block, target))]
        if len(matches) != 1:
            audit['not_one_verified_advancer'] += 1
            continue
        i, j, evidence = matches[0]
        winner = key(source_people[i]['name'])
        if len(source_people) == 2:
            loser = key(source_people[1-i]['name'])
            if loser == winner or any(key(c['name']) == loser for c in target_people):
                audit['ambiguous_opponent'] += 1
                continue
            upstream['result_map'] = {winner: 'WIN', loser: 'LOSS'}
        else:
            upstream['result_map'] = {winner: 'WIN'}
            audit['single_athlete_wins'] += 1
        upstream['result_source'] = (
            f'verified-direct-edge-{source_pos}-to-{target_pos}-{evidence}'
        )
        audit['inferred_fights'] += 1
    if records:
        print('    BRACKET POSITION AUDIT ' + ' '.join(
            f'{k}={v}' for k,v in sorted(audit.items())), flush=True)
    return records


def _explicit_source_fight(comp):
    """Read only an actual per-slot feeder reference; never guess from order.

    Providers may expose this as a data attribute or a link to a feeder fight.
    The reference has to belong to this particular competitor slot, not to
    another competitor or to an unrelated matchup elsewhere in the bracket.
    """
    for field in ('data-source-fight', 'data-source-fight-id', 'data-from-fight',
                  'data-winner-of-fight', 'data-feeder-fight'):
        value = comp.get(field)
        if value and str(value).isdigit():
            return int(value)
    for node in comp.select('[data-source-fight], [data-from-fight], [data-winner-of-fight]'):
        for field in ('data-source-fight', 'data-from-fight', 'data-winner-of-fight'):
            value = node.get(field)
            if value and str(value).isdigit():
                return int(value)
    return None


def capture_unresolved_bracket_evidence(soup, fights, url):
    """Capture *actual* provider HTML for unresolved progression in forced diagnostics.

    Read-only: zero additional HTTP requests, result changes, or site payload
    changes. The action artifact retains the HTML briefly; it is not committed.
    Supports all event/category IDs without athlete- or fight-specific rules.
    """
    if os.environ.get('OPENS_EDGE_CAPTURE', '').lower() not in ('true', '1', 'yes'):
        return
    from collections import Counter
    occurrences = Counter(
        key(normalize_competitor_name(n.get_text(' ', strip=True)))
        for n in soup.select('.match-card__competitor-name')
        if not is_placeholder_name(normalize_competitor_name(n.get_text(' ', strip=True)))
    )
    unresolved = []
    for fight in fights:
        if fight.get('result_map') or not (fight.get('number') and fight.get('time')):
            continue
        people = [c for c in fight.get('competitors', [])
                  if not c.get('placeholder') and not c.get('bye') and key(c.get('name'))]
        if not (1 <= len(people) <= 2):
            continue
        repeats = [p for p in people if occurrences[key(p['name'])] >= 2]
        if repeats:
            unresolved.append({'fight': fight['number'],
                               'athletes': [p['name'] for p in repeats]})
    if not unresolved:
        return
    path_parts = re.search(r'/tournaments/(\d+)/categories/(\d+)', url)
    if not path_parts:
        return
    filename = f'{path_parts.group(1)}-{path_parts.group(2)}.html'
    directory = ROOT / '.edge-evidence'
    directory.mkdir(exist_ok=True)
    # Use the original downloaded HTML, preserving the provider's classes,
    # IDs, sibling headings and round containers exactly as received.
    with _cache_lock:
        original_html = _cache.get(url)
    (directory / filename).write_text(original_html or str(soup), encoding='utf-8')
    print(f'    BRACKET EDGE CAPTURE {filename}: '
          f'unresolved-with-repeat={unresolved[:12]!r} '
          f'html-bytes={len(original_html or str(soup))}', flush=True)


def audit_advancement_markup(soup, fights, url):
    """Read-only, bracket-wide audit of possible advancement evidence.

    Runs on HTML already fetched by the regular scrape. Never updates results,
    requests pages, or assigns outcomes. Log output is bounded per category.
    """
    from collections import defaultdict
    by_name = defaultdict(list)
    for fight in fights:
        try:
            number = int(fight.get('number') or '')
        except (ValueError, TypeError):
            continue
        for person in fight.get('competitors', []):
            if not person.get('placeholder') and not person.get('bye'):
                by_name[key(person.get('name'))].append(number)
    missing = [f for f in fights if not f.get('result_map') and f.get('number')]
    candidates = []
    for fight in missing:
        try:
            num = int(fight['number'])
        except (ValueError, TypeError):
            continue
        actual = [c for c in fight.get('competitors', []) if not c.get('placeholder') and not c.get('bye')]
        later = {c['name']: sorted({n for n in by_name[key(c['name'])] if n > num})[:4] for c in actual}
        if any(later.values()):
            candidates.append((fight, later))
    if not candidates:
        return
    print(f'    EDGE AUDIT {url}: unresolved={len(missing)} later-named-candidates={len(candidates)}', flush=True)
    blocks = soup.select('.tournament-category__match, .tournament-category_match')
    by_number = defaultdict(list)
    for b in blocks:
        header = b.select_one('.tournament-category__match-header, .tournament-category_match-header')
        num = parse_header_fields(clean(header.get_text(' ', strip=True) if header else '')).get('number')
        if num:
            by_number[num].append(b)
    for fight, later in candidates[:8]:
        num = fight['number']
        print(f'    EDGE AUDIT fight={num} competitors={[(c.get("name"), c.get("placeholder"), c.get("loser"), c.get("source_fight")) for c in fight.get("competitors", [])]} later={later}', flush=True)
        for b in by_number.get(str(num), [])[:1]:
            # Inspect only the node's own ancestry and slot attributes, not the
            # entire page HTML. This keeps the GitHub Actions log manageable.
            ancestry=[]
            node=b
            for _ in range(4):
                if node is None or getattr(node,'name',None) is None:break
                ancestry.append((node.name, node.get('class', []), {k:v for k,v in node.attrs.items() if k.startswith('data-') or k in ('id','role')}))
                node=node.parent
            print(f'    EDGE AUDIT DOM fight={num} ancestors={str(ancestry)[:900]}', flush=True)
            for c in b.select('.match-card__competitor')[:3]:
                name_node=c.select_one('.match-card__competitor-name')
                name=clean(name_node.get_text(' ', strip=True)) if name_node else clean(c.get_text(' ', strip=True))[:80]
                attrs={k:v for k,v in c.attrs.items() if k!='style'}
                print(f'    EDGE AUDIT SLOT fight={num} name={name!r} attrs={str(attrs)[:500]}', flush=True)
        # Log the next specifically named fight as evidence, including slot data.
        for name, nums in later.items():
            for downstream in nums[:1]:
                for b in by_number.get(str(downstream), [])[:1]:
                    for c in b.select('.match-card__competitor')[:3]:
                        nm=c.select_one('.match-card__competitor-name')
                        nm=clean(nm.get_text(' ', strip=True)) if nm else clean(c.get_text(' ', strip=True))[:60]
                        attrs={k:v for k,v in c.attrs.items() if k!='style'}
                        print(f'    EDGE AUDIT NEXT from={num} to={downstream} person={nm!r} attrs={str(attrs)[:500]}', flush=True)


def parse_fights(soup):
    fights = []
    evidence_records = []

    blocks = soup.select('.tournament-category__match, .tournament-category_match')
    for block in blocks:
        header_node = block.select_one('.tournament-category__match-header, .tournament-category_match-header, .bracket-match-header')
        header_text = clean(header_node.get_text(' ', strip=True) if header_node else '')
        fields = parse_header_fields(header_text)
        # FINAL and BYE cards may have no FIGHT/Mat/Time header. Inspect
        # participants and outcomes before deciding whether to retain the card.
        competitors = []
        for comp in block.select('.match-card__competitor'):
            name_node = comp.select_one('.match-card__competitor-name')
            if not name_node:
                # A BYE is often plain text instead of a competitor-name div.
                raw_text = clean(comp.get_text(' ', strip=True))
                if re.search(r'\bBYE\b', raw_text, re.I):
                    name = 'BYE'
                else:
                    child_slot = comp.select_one('.match-card__child-where')
                    child_text = clean(child_slot.get_text(' ', strip=True)) if child_slot else ''
                    if re.search(r'\b(?:Winner|Defeated|Loser)\s+of\s+Fight\s*#?\d+', child_text, re.I):
                        name = child_text
                    else:
                        continue
            else:
                name = normalize_competitor_name(name_node.get_text(' ', strip=True))
            if not name:
                continue
            desc = comp.select_one('.match-card__competitor-description')
            classes = []
            if desc is not None:
                classes.extend(desc.get('class', []))
            classes.extend(comp.get('class', []))
            competitors.append({
                'name': name,
                'team': clean((comp.select_one('.match-card__club-name') or comp.select_one('.match-card__competitor-club-name')).get_text(' ', strip=True)) if (comp.select_one('.match-card__club-name') or comp.select_one('.match-card__competitor-club-name')) else '',
                'loser': 'match-competitor--loser' in classes,
                'bye': key(name) == 'bye',
                'placeholder': is_placeholder_name(name),
                'source_fight': _explicit_source_fight(comp)
            })

        if not competitors:
            continue

        result_map = {}
        named = [c for c in competitors if c['name']]
        # Some single-competitor finals render BYE as plain text outside a
        # normal competitor card. Confirm it in this match only, never the
        # rest of the bracket (which may contain unrelated BYEs).
        has_bye_text = bool(re.search(r'(?<!\w)BYE(?!\w)', block.get_text(' ', strip=True), re.I))
        actual = [c for c in named if not c['bye'] and not c['placeholder']]
        if len(actual) == 1 and has_bye_text and len(named) <= 2:
            result_map[key(actual[0]['name'])] = 'BYE'
        elif len(named) == 1 and len(actual) == 1 and actual[0]['loser']:
            # The source explicitly greys this sole named competitor using its
            # loser class. Do not infer outcomes for single non-greyed entrants.
            result_map[key(actual[0]['name'])] = 'LOSS'
        elif len(named) == 2:
            a, b = named
            if a['bye'] and not b['bye'] and not b['placeholder']:
                result_map[key(b['name'])] = 'BYE'
            elif b['bye'] and not a['bye'] and not a['placeholder']:
                result_map[key(a['name'])] = 'BYE'
            elif a['loser'] and b['loser'] and not a['placeholder'] and not b['placeholder']:
                # A double-greyed match is an explicit double loss, never a
                # WIN for either athlete. Require two real named competitors.
                result_map[key(a['name'])] = 'LOSS'
                result_map[key(b['name'])] = 'LOSS'
            elif a['loser'] ^ b['loser']:
                loser = a if a['loser'] else b
                winner = b if a['loser'] else a
                # Grey styling on a *placeholder* is not evidence that any
                # real opponent lost. Without an actual greyed athlete, a WIN
                # must be proven by direct downstream advancement instead.
                if not loser['placeholder'] and not loser['bye']:
                    result_map[key(loser['name'])] = 'LOSS'
                    if not winner['placeholder'] and not winner['bye']:
                        result_map[key(winner['name'])] = 'WIN'

        # Retain a card only if scheduled or it proves a completed result.
        # Otherwise an undated placeholder must not become a new match.
        fight = {**fields, 'competitors': competitors, 'result_map': result_map}
        # Save the initial publication decision BEFORE inferring a result. A
        # non-scheduled card may provide evidence but must not create a new row.
        publish = bool((fields['mat'] and fields['time'] and fields['day']) or result_map)
        evidence_records.append((fight, block, publish))

    if evidence_records:
        pairs = [(f, b) for f, b, _ in evidence_records]
        infer_advancement_from_bracket_positions(pairs)
        # Advancement requires a mapped direct edge, not just a later final.
        return [f for f, _, publish in evidence_records if publish]

    container = soup.select_one('main') or soup.body or soup
    lines = [clean(v) for v in container.get_text('\n', strip=True).splitlines()]
    lines = [v for v in lines if v]
    header = re.compile(r'^FIGHT\s*#?\s*(\d+)\s*:?\s*(.*)$', re.I)
    mat_re = re.compile(r'\bMat\s*(?:#|No\.?\s*)?(\d+)\b', re.I)
    when = re.compile(r'\b(Sat(?:urday)?|Sun(?:day)?|Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?)\s+(\d{1,2}/\d{1,2})(?:/\d{2,4})?\s+(?:at\s+)?(\d{1,2}:\d{2}\s*[AP]M)\b', re.I)
    current = None
    fallback_fights = []
    for line in lines:
        match = header.match(line)
        if match:
            if current and all(current.get(k) for k in ('mat', 'time', 'day')):
                fallback_fights.append(current)
            current = {'number': match.group(1), 'mat': '', 'time': '', 'day': '', 'date': '', 'lines': []}
            remainder = clean(match.group(2))
            if remainder:
                current['lines'].append(remainder)
        elif current is not None:
            current['lines'].append(line)
        if current is None:
            continue
        mat_match = mat_re.search(line)
        if mat_match and not current['mat']:
            current['mat'] = mat_match.group(1)
        when_match = when.search(line)
        if when_match:
            current['day'] = when_match.group(1)[:3].title()
            current['date'] = when_match.group(2)
            current['time'] = clean(when_match.group(3))
    if current and all(current.get(k) for k in ('mat', 'time', 'day')):
        fallback_fights.append(current)

    for fight in fallback_fights:
        competitors = []
        for line in fight.get('lines', []):
            name = normalize_competitor_name(line)
            if not name or is_placeholder_name(name):
                continue
            competitors.append({'name': name, 'loser': False, 'bye': key(name) == 'bye', 'placeholder': False})
        fights.append({
            'number': fight.get('number', ''),
            'mat': fight.get('mat', ''),
            'time': fight.get('time', ''),
            'day': fight.get('day', ''),
            'date': fight.get('date', ''),
            'competitors': competitors,
            'result_map': {}
        })
    return fights



def single_entrant_bye_fight(soup, roster_names):
    """Recover an explicitly recorded one-person BYE without time/mat.

    Look in match cards (not rankings), and allow a BYE slot to be plain text
    instead of a .match-card__competitor-name. No category IDs or names fixed.
    """
    valid = {key(n): n for n in roster_names}
    # Different bracket versions use singular/plural wrappers; alternatively
    # match cards may be reachable directly from the main content.
    containers = soup.select('.tournament-category__bracket, .tournament-category__brackets, .tournament-category_bracket')
    if not containers:
        containers = [soup.select_one('main') or soup.body or soup]
    for container in containers:
        cards = container.select('.match-card')
        if not cards:
            continue
        named = {}
        for node in container.select('.match-card__competitor-name'):
            name = normalize_competitor_name(node.get_text(' ', strip=True))
            if key(name) in valid:
                named[key(name)] = name
        # This fallback is intentionally restricted to a *single* actual
        # competitor in the bracket. A BYE elsewhere in a larger bracket
        # does not prove that that person's match was a BYE.
        if len(named) != 1:
            continue
        if not any(re.search(r'(?<!\w)BYE(?!\w)', c.get_text(' ', strip=True), re.I) for c in cards):
            continue
        name_key, name = next(iter(named.items()))
        # Confirm the bracket really has one named competitor, not multiple
        # people of whom just one happens to be in the searched academy.
        all_names = {key(normalize_competitor_name(n.get_text(' ', strip=True)))
                     for n in container.select('.match-card__competitor-name')
                     if key(n.get_text(' ', strip=True)) != 'bye'}
        all_names = {n for n in all_names if n and not is_placeholder_name(n)}
        if all_names != {name_key}:
            continue
        return {
            'number': '', 'mat': '', 'time': '', 'day': '', 'date': '',
            'competitors': [{'name': name, 'loser': False, 'bye': False, 'placeholder': False}],
            'result_map': {name_key: 'BYE'}
        }
    return None


def known_bracket_competitors(soup):
    """Find registered competitors on a loaded category page, including ranking.

    Used only as corroboration. An empty/unknown ranking is NOT grounds to
    delete registrations; valid current match cards are sufficient.
    """
    names = set()
    for node in soup.select('.match-card__competitor-name'):
        name = normalize_competitor_name(node.get_text(' ', strip=True))
        if name and not is_placeholder_name(name) and key(name) != 'bye':
            names.add(key(name))
    # Ranking table often contains abbreviated names; do not use those
    # abbreviations to create athlete assignments. They are useful only
    # when they match exactly.
    for table in soup.select('table'):
        headings = key(' '.join(th.get_text(' ', strip=True) for th in table.select('th')))
        if 'competitor' not in headings and 'ranking' not in headings:
            continue
        for tr in table.select('tbody tr'):
            cells = tr.find_all('td', recursive=False)
            if not cells:
                continue
            name = normalize_competitor_name(cells[0].get_text(' ', strip=True))
            if name and not is_placeholder_name(name):
                names.add(key(name))
    return names


def fight_contains_athlete(fight, name):
    target = key(name)
    return any(key(comp.get('name')) == target for comp in fight.get('competitors', []))


def fight_sort_key(fight):
    try:
        return (0, datetime.strptime(f"{fight.get('date', '')} {fight.get('time', '')}", '%m/%d %I:%M %p'))
    except Exception:
        return (1, fight.get('day', ''), fight.get('time', ''), fight.get('mat', ''))


def previous_rows_for(previous_by_identity, athlete):
    rows = previous_by_identity.get((athlete['competition_id'], athlete['name'], athlete['bracket']), [])
    return [dict(r) for r in rows]


def verified_match(row):
    """A result or a complete scheduled fight, not merely an IBJJF registration."""
    return (str(row.get('result', '')).upper() in {'WIN', 'LOSS', 'BYE'}
            or all(row.get(field) for field in ('time', 'mat', 'day')))


def fill_assignments(athletes, bracket_entries, previous_by_identity):
    by_category = {}
    for athlete in athletes:
        parts = [x.strip() for x in athlete['bracket'].split('/')]
        if len(parts) < 4:
            continue
        weight = open_class_weight(clean(re.sub(r'\([^)]*\)', '', parts[3])))
        lookup = category_key((parts[0], parts[1], parts[2], weight))
        by_category.setdefault(lookup, []).append(athlete)

    expanded = []
    completed, missed = 0, 0
    for category, group in by_category.items():
        info = bracket_entries.get(category)
        if not info:
            print(f'    Missing division link for {category}: {len(group)} registrations', flush=True)
            missed += len(group)
            for athlete in group:
                prior = previous_rows_for(previous_by_identity, athlete)
                expanded.extend(row for row in prior if verified_match(row))
            continue

        try:
            bracket_soup = get_soup(info['url'])
            fights = parse_fights(bracket_soup)
            capture_unresolved_bracket_evidence(bracket_soup, fights, info['url'])
            # A sole-entrant FINAL against BYE may have no FIGHT/Mat/Time
            # heading; recognize it from the bracket card itself.
            bye_fight = single_entrant_bye_fight(bracket_soup, [a['name'] for a in group])
            if bye_fight and not any(fight_contains_athlete(f, bye_fight['competitors'][0]['name']) for f in fights):
                fights.append(bye_fight)
                print(f'    Verified unscheduled BYE for {bye_fight["competitors"][0]["name"]} in {info["url"]}', flush=True)
            bracket_names = known_bracket_competitors(bracket_soup)
            print(f'    {info["url"]}: {len(fights)} scheduled or completed fight cards parsed', flush=True)
            for athlete in group:
                matching = sorted([fight for fight in fights if fight_contains_athlete(fight, athlete['name'])], key=fight_sort_key)
                if matching:
                    for fight in matching:
                        row = dict(athlete)
                        row['mat'] = fight.get('mat', '')
                        row['time'] = fight.get('time', '')
                        row['day'] = fight.get('day', '')
                        row['bracket_url'] = info['url']
                        row['time_type'] = 'listed fight' if fight.get('time') else 'completed result without published time'
                        row['fight_number'] = fight.get('number', '')
                        row['result'] = fight.get('result_map', {}).get(key(athlete['name']), '')
                        expanded.append(row)
                    completed += len(matching)
                else:
                    # Successfully parsed current brackets are authoritative.
                    # A registration without a verified fight/result is not a match.
                    if fights:
                        print(f'    No current match for {athlete["name"]!r} in {info["url"]}; omitting', flush=True)
                        continue
                    # No recognizable fight cards: source may be incomplete.
                    # Retain only previously verified assignments, never blank rows.
                    prior = previous_rows_for(previous_by_identity, athlete)
                    expanded.extend(row for row in prior if verified_match(row))
        except (requests.RequestException, ValueError) as exc:
            print(f'Bracket unavailable {info["url"]}: {exc}', flush=True)
            for athlete in group:
                prior = previous_rows_for(previous_by_identity, athlete)
                expanded.extend(row for row in prior if verified_match(row))
    return expanded, completed, missed



def bracket_division_key(soup):
    """Read division identity from the bracket itself, including unscheduled OC/BYE."""
    header = soup.select_one('.tournament-category__title, .tournament-category__header, .tournament-category_bracket-title')
    if header is None:
        header = soup.select_one('h1, h2')
    text = clean(header.get_text(' ', strip=True)) if header else ''
    if not text:
        # Short breadcrumb codes such as MA4/F/BLU/OC can be used if heading absent.
        link = soup.select_one('a[href*="/categories/"]')
        text = clean(link.get_text(' ', strip=True)) if link else ''
    words = key(text).replace('-', ' ')
    age_match = re.search(r'\b(master\s*\d+|adult|juvenile\s*\d*|juvenile|teen\s*\d*|kids?)\b', words)
    sex_match = re.search(r'\b(female|male)\b', words)
    belt_match = re.search(r'\b(white|blue|purple|brown|black|gray|grey|yellow|orange|green)\b', words)
    if not (age_match and sex_match and belt_match):
        return None
    if re.search(r'\b(open\s*class|absolute)\b', words):
        weight = 'open class'
    else:
        weights = ['super heavy', 'ultra heavy', 'medium heavy', 'light feather', 'rooster',
                   'feather', 'middle', 'medium', 'heavy', 'light', 'open']
        weight = next((w for w in weights if re.search(r'(?<!\w)' + re.escape(w) + r'(?!\w)', words)), None)
    if not weight:
        return None
    return category_key((belt_match.group(), clean(age_match.group()), sex_match.group(), weight))


def all_published_brackets(competition_id, schedule):
    """Find category URLs from published category listings, not only dated fights."""
    entries = dict(schedule)
    urls = {v['url'] for v in entries.values()}
    root = f'https://www.bjjcompsystem.com/tournaments/{competition_id}'
    for suffix in ('/categories?gender_id=1', '/categories?gender_id=2', '/categories', '/schedule'):
        try:
            soup = get_soup(root + suffix)
        except (requests.RequestException, ValueError) as exc:
            print(f'  Category listing unavailable {suffix}: {exc}', flush=True)
            continue
        for a in soup.select('a[href]'):
            url = urljoin(root, a['href']).split('?')[0].split('#')[0]
            if re.fullmatch(rf'https?://(?:www\.)?bjjcompsystem\.com/tournaments/{re.escape(str(competition_id))}/categories/\d+', url, re.I):
                urls.add(url)
    print(f'  Discovered {len(urls)} linked category URLs ({len(schedule)} from schedule)', flush=True)
    return sorted(urls)

def roster_from_brackets(comp):
    """Recover roster/assignments from BJJCompSystem when IBJJF roster 404s.

    Uses only category links belonging to the selected tournament; an athlete
    must occur in a verified scheduled fight or confirmed result. No guessing.
    """
    cid = str(comp['id'])
    schedule_url = f'https://www.bjjcompsystem.com/tournaments/{cid}/schedule'
    schedule = schedule_brackets_optional(get_soup(schedule_url))
    # Scheduled links alone omit brackets with no fight time (notably BYEs/OC).
    # Inspect all linked divisions on category listings as well.
    category_urls = all_published_brackets(cid, schedule)
    if not category_urls:
        raise ValueError(f'No published category links for {cid}')
    schedule_by_url = {v['url']: (k, v) for k, v in schedule.items()}
    rows = []
    visited = set()
    checked = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
      for url, fetched in zip(category_urls, pool.map(_fetch_bracket, category_urls)):
        if url in visited:
            continue
        visited.add(url)
        try:
            if isinstance(fetched, Exception):
                raise fetched
            soup = fetched
            fights = parse_fights(soup)
            capture_unresolved_bracket_evidence(soup, fights, url)
            checked += 1
        except (requests.RequestException, ValueError) as exc:
            print(f'  Category unavailable {url}: {exc}', flush=True)
            continue
        division = bracket_division_key(soup)
        if division is None and url in schedule_by_url:
            division = schedule_by_url[url][0]
        if division is None:
            print(f'  Division identity not recognized: {url}', flush=True)
            continue
        # If the card is an unscheduled one-entrant final against BYE, keep it.
        # Match-card markup can still give us the competitor name and academy.
        if not any(f.get('result_map') for f in fights):
            names = [clean(n.get_text(' ', strip=True)) for n in soup.select('.match-card__competitor-name')]
            bye = single_entrant_bye_fight(soup, names)
            if bye:
                # Attach the academy from the same bracket card; never guess.
                for node in soup.select('.match-card__competitor'):
                    nm = node.select_one('.match-card__competitor-name')
                    if nm and key(normalize_competitor_name(nm.get_text(' ', strip=True))) == next(iter(bye['result_map'])):
                        team_node = node.select_one('.match-card__club-name, .match-card__competitor-club-name')
                        if team_node:
                            bye['competitors'][0]['team'] = clean(team_node.get_text(' ', strip=True))
                        break
                fights.append(bye)
        belt, age, sex, weight = division
        bracket = ' / '.join((belt.title(), age.title(), sex.title(), weight.title()))
        # Names can repeat in successive rounds: retain each distinct fight.
        for fight in fights:
            for competitor in fight['competitors']:
                name = clean(competitor.get('name'))
                if competitor.get('bye') or competitor.get('placeholder') or is_placeholder_name(name):
                    continue
                result = fight.get('result_map', {}).get(key(name), '')
                if not (result in ('WIN', 'LOSS', 'BYE') or all(fight.get(k) for k in ('time','mat','day'))):
                    continue
                # Academy is attached to each named competitor in bracket markup.
                team = clean(competitor.get('team'))
                if not team:
                    # Do not silently assign an incorrect academy.
                    continue
                rows.append({
                    'competition_id': cid, 'competition_name': comp['name'],
                    'date': comp.get('date', ''), 'name': name, 'team': team,
                    'bracket': bracket, 'time': fight.get('time', ''),
                    'mat': fight.get('mat', ''), 'day': fight.get('day', ''),
                    'bracket_url': url, 'time_type': 'listed fight' if fight.get('time') else 'completed result without published time',
                    'fight_number': fight.get('number', ''), 'result': result,
                })
    if not rows:
        raise ValueError(f'No verifiable bracket-derived athlete matches for {cid} from {checked} categories')
    # Same competitor can appear in several fights; dedupe identical fight rows only.
    unique = {}
    for row in rows:
        identity = (row['competition_id'], key(row['name']), row['bracket'], row['bracket_url'],
                    row['fight_number'], row['time'], row['mat'], row['result'])
        unique[identity] = row
    print(f'  Fallback roster: {len(unique)} verified athlete-fight rows from {checked} categories', flush=True)
    return list(unique.values())


def main():
    source = json.loads(os.environ['OPENS_CANDIDATE_JSON']) if os.environ.get('OPENS_CANDIDATE_JSON') else json.loads((ROOT / 'config.json').read_text())
    # Catalog `url` links point to event OVERVIEW pages (or sometimes stale /404).
    # Rosters always live at the numeric event-ID route. Never scrape overview URLs
    # as roster pages: doing so can either 404 or parse no academy/athlete rows.
    competitions = [
        dict(c,
             id=str(c['id']),
             url=f"https://ibjjf.com/events/{c['id']}/athletes-list-by-academy-teams",
             date=c.get('date', ''))
        for c in source['competitions']
        if str(c.get('id', '')).isdigit() and c.get('name')
    ]
    dest = ROOT / 'athletes.json'
    staging = ROOT / '.athletes-staging.json'
    previous = json.loads(dest.read_text()) if dest.exists() else {}
    if not competitions:
        print('No competitions configured; skipping scrape.')
        return
    old = previous.get('athletes', [])
    previous_by_identity = defaultdict(list)
    for row in (old if not os.environ.get('OPENS_CANDIDATE_JSON') else []):
        previous_by_identity[(str(row.get('competition_id')), row.get('name'), row.get('bracket'))].append(row)

    result, done, errors = [], [], {}
    for comp in competitions:
        cid = str(comp['id'])
        print(f'Fetching {cid}: {comp["name"]}', flush=True)
        try:
            roster = roster_by_academy(get_soup(comp['url']), comp)
            done.append(cid)
            print(f'  {len(roster)} athletes collected from IBJJF', flush=True)
            try:
                schedule = discover_open_class_links(
                    schedule_brackets(get_soup(f'https://www.bjjcompsystem.com/tournaments/{cid}/schedule')), cid, roster)
                expanded, count, unmatched = fill_assignments(roster, schedule, previous_by_identity)
                result.extend(expanded)
                print(f'  {count} explicit fight assignments; {unmatched} unmatched divisions', flush=True)
            except (requests.RequestException, ValueError) as schedule_error:
                errors[f'{cid}_schedule'] = str(schedule_error)[:250]
                print(f'  Schedule not available; retaining IBJJF athletes: {schedule_error}', flush=True)
                for athlete in roster:
                    prior = previous_rows_for(previous_by_identity, athlete)
                    result.extend(row for row in prior if verified_match(row))
        except (requests.RequestException, ValueError) as exc:
            print(f'  IBJJF roster unavailable for {cid}: {exc}; trying BJJCompSystem bracket fallback', flush=True)
            try:
                recovered = roster_from_brackets(comp)
                result.extend(recovered)
                done.append(cid)
                print(f'  Recovered {len(recovered)} match records from bracket pages', flush=True)
            except (requests.RequestException, ValueError) as fallback_error:
                errors[cid] = f'IBJJF: {str(exc)[:105]}; bracket fallback: {str(fallback_error)[:105]}'
                retained = [] if os.environ.get('OPENS_CANDIDATE_JSON') else [row for row in old if str(row.get('competition_id')) == cid]
                result.extend(retained)
                if retained and not os.environ.get('OPENS_CANDIDATE_JSON') and cid in previous.get('loaded_competition_ids', []):
                    done.append(cid)
                print(f'  FAILED: {errors[cid]}', flush=True)

    # Final guard: never publish registration-only rows as matches.
    result = [row for row in result if verified_match(row)]
    is_candidate = bool(os.environ.get('OPENS_CANDIDATE_JSON'))
    if is_candidate:
        # A proposed replacement succeeds when AT LEAST ONE selected competition
        # yields independently verified match rows. Failed/empty selections never
        # enter the new active configuration or the public dataset.
        matched_ids = {str(row.get('competition_id')) for row in result}
        accepted = [comp for comp in competitions if str(comp['id']) in matched_ids]
        rejected = [comp for comp in competitions if str(comp['id']) not in matched_ids]
        if not accepted:
            raise RuntimeError('No selected competitions produced verified match data; active configuration untouched.')
        print(f'Candidate result: {len(accepted)} accepted, {len(rejected)} excluded.', flush=True)
        for comp in rejected:
            cid = str(comp['id'])
            print(f'  EXCLUDED {cid}: {comp["name"]} — {errors.get(cid) or errors.get(cid+"_schedule") or "no verified matches"}', flush=True)
        # This file is only staged; run_if_due publishes configuration AFTER
        # a successful scrape and only for IDs present here.
        (ROOT / '.accepted-competitions.json').write_text(json.dumps({
            'competitions': accepted,
            'excluded_competitions': [{'id': str(c['id']), 'name': c['name']} for c in rejected]
        }, ensure_ascii=False, indent=2) + '\n')
        competitions = accepted
        done = [cid for cid in done if cid in matched_ids]
        result = [row for row in result if str(row.get('competition_id')) in matched_ids]
    else:
        # Normal scheduled updates remain conservative: don't replace the
        # currently published snapshot with a partial refresh.
        if len(done) != len(competitions) or errors or not result:
            raise RuntimeError(f'Incomplete scrape: {len(done)}/{len(competitions)} rosters loaded, {len(result)} verified matches, errors: {errors}. Keeping old published data.')
    staging.write_text(json.dumps({
        'source': 'IBJJF and BJJCompSystem',
        'published_competitions': competitions,
        'updated_at': datetime.now(timezone.utc).isoformat(),
        'athletes': result,
        'loaded_competition_ids': done,
        'errors': errors
    }, ensure_ascii=False, indent=2) + '\n')
    print(f'Saved {len(result)} athlete entries, {len(errors)} roster errors')
    staging.replace(dest)


if __name__ == '__main__':
    _run_start = time.monotonic()
    try:
        main()
    finally:
        timing_report(_run_start)
