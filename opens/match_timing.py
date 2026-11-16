"""Resolve bracket times against IBJJF's event dates and venue coordinates."""
from calendar import month_abbr
from datetime import date, datetime, timezone
from functools import lru_cache
import json
from pathlib import Path
import re
from urllib.parse import parse_qs, urljoin, urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import requests


IBJJF = 'https://ibjjf.com'
CALENDAR_URL = IBJJF + '/api/v1/events/calendar.json'
CATALOG = Path(__file__).resolve().parents[1] / 'admin' / 'matches-competitions.json'


def _ibjjf_event_page(value):
    url = urlsplit(urljoin(IBJJF, str(value or '')))
    if url.scheme == 'https' and url.netloc in ('ibjjf.com', 'www.ibjjf.com') and re.fullmatch(
        r'/events/[a-z0-9]+(?:-[a-z0-9]+)+/?', url.path
    ):
        return url.geturl()
    return None


@lru_cache(maxsize=1)
def _timezone_finder():
    from timezonefinder import TimezoneFinder

    return TimezoneFinder()


def _venue_timezone(page):
    for iframe in page.select('#event-page .map iframe[src]'):
        source = urlsplit(urljoin(IBJJF, iframe['src']))
        if source.hostname not in ('google.com', 'www.google.com') or not source.path.startswith('/maps/embed/'):
            continue
        query = parse_qs(source.query).get('q', [''])[0]
        match = re.fullmatch(r'\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*', query)
        if match:
            lat, lng = (float(v) for v in match.groups())
            if -90 <= lat <= 90 and -180 <= lng <= 180:
                zone = _timezone_finder().timezone_at(lat=lat, lng=lng)
                return zone if zone and not zone.startswith('Etc/') else None
    return None


def _event_dates(event):
    try:
        year = event['year']
        month = list(month_abbr).index(event['month'])
        start = date(year, month, event['startDay'])
        end_month = month
        explicit_end = re.search(r'-\s*([A-Z][a-z]{2})\s*\d', event.get('intervalDays') or '')
        if explicit_end:
            end_month = list(month_abbr).index(explicit_end.group(1))
        elif event['endDay'] < start.day:
            end_month = month % 12 + 1
        end = date(year + (end_month < month), end_month, event['endDay'])
        return (start.isoformat(), end.isoformat()) if start <= end else ()
    except (KeyError, TypeError, ValueError):
        return ()


def enrich_competitions(competitions, previous, get_soup):
    """Add optional venue data without making the roster depend on it."""
    cached = {str(c.get('id')): c for c in previous.get('published_competitions', [])}
    for comp in competitions:
        last = cached.get(comp['id'], {})
        if last.get('venue_timezone') and last.get('event_start_date') and last.get('event_end_date'):
            for field in ('venue_timezone', 'venue', 'venue_city', 'event_start_date', 'event_end_date'):
                if field in last:
                    comp.setdefault(field, last[field])

    missing = [c for c in competitions if not all(
        c.get(field) for field in ('venue_timezone', 'event_start_date', 'event_end_date')
    )]
    if not missing:
        return
    try:
        response = requests.get(CALENDAR_URL, timeout=12, headers={
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        })
        response.raise_for_status()
        events = {str(e['id']): e for e in response.json()['infosite_events']}
    except (requests.RequestException, KeyError, TypeError, ValueError) as exc:
        print(f'IBJJF venue calendar unavailable: {exc}', flush=True)
        events = {}
    try:
        catalog = {str(c['id']): c.get('url') for c in json.loads(CATALOG.read_text())['competitions']}
    except (OSError, KeyError, TypeError, ValueError):
        catalog = {}

    venue_zones = {}
    for comp in missing:
        event = events.get(comp['id'], {})
        dates = _event_dates(event)
        if dates:
            comp['event_start_date'], comp['event_end_date'] = dates
        for field, key in (('venue', 'local'), ('venue_city', 'city')):
            if event.get(key):
                comp[field] = event[key]
        if comp.get('venue_timezone'):
            continue
        venue_key = tuple(event.get(field) for field in ('local', 'city', 'region'))
        zone = venue_zones.get(venue_key)
        if not zone:
            urls = [event.get('pageUrl'), catalog.get(comp['id'])]
            # IBJJF removes finished event pages. Another active event at the
            # same venue can supply the coordinates for the archived event.
            if all(venue_key):
                same_venue = [
                    e['pageUrl'] for e in events.values()
                    if e.get('pageUrl') and tuple(e.get(field) for field in ('local', 'city', 'region')) == venue_key
                ]
                urls.extend(list(dict.fromkeys(same_venue))[:2])
            for overview in dict.fromkeys(filter(None, map(_ibjjf_event_page, urls))):
                try:
                    zone = _venue_timezone(get_soup(overview))
                    if zone:
                        ZoneInfo(zone)
                        break
                except (requests.RequestException, ValueError, ImportError, OSError, ZoneInfoNotFoundError):
                    zone = None
        if zone:
            comp['venue_timezone'] = zone
            if all(venue_key):
                venue_zones[venue_key] = zone
        else:
            print(f'Venue time zone unavailable for {comp["id"]}', flush=True)


def scheduled_at(fight, competition):
    """Return an unambiguous UTC timestamp for a bracket's local start time."""
    try:
        zone = ZoneInfo(competition['venue_timezone'])
        parts = [int(part) for part in fight['date'].split('/')]
        start = date.fromisoformat(competition['event_start_date'])
        end = date.fromisoformat(competition['event_end_date'])
        if len(parts) == 2:
            candidates = []
            for year in sorted({start.year, end.year}):
                try:
                    day = date(year, *parts)
                except ValueError:
                    continue
                if start <= day <= end:
                    candidates.append(day)
            if len(candidates) != 1:
                return None
            day = candidates[0]
        elif len(parts) == 3:
            month, day_of_month, year = parts
            if year < 100:
                year += (start.year // 100) * 100
            day = date(year, month, day_of_month)
            if not start <= day <= end:
                return None
        else:
            return None
        weekdays = ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')
        if fight.get('day') != weekdays[day.weekday()]:
            return None
        clock = datetime.strptime(re.sub(r'\s*([AP]M)$', r' \1', fight['time'], flags=re.I), '%I:%M %p').time()
    except (KeyError, TypeError, ValueError, ZoneInfoNotFoundError):
        return None

    local = datetime.combine(day, clock)
    utc = {local.replace(tzinfo=zone, fold=fold).astimezone(timezone.utc) for fold in (0, 1)}
    valid = {instant for instant in utc if instant.astimezone(zone).replace(tzinfo=None) == local}
    if len(valid) != 1:
        return None
    return valid.pop().isoformat(timespec='seconds').replace('+00:00', 'Z')
