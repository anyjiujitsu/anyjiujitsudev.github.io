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
