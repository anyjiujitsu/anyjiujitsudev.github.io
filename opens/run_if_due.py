#!/usr/bin/env python3
"""Run OPENS on a GitHub schedule or with an explicit force dispatch."""
import json
import base64
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parent
candidate_raw=os.environ.get('OPENS_CANDIDATE_B64','')
candidate=None
if candidate_raw:
    candidate=json.loads(base64.b64decode(candidate_raw,validate=True).decode('utf-8'))
    if not isinstance(candidate,dict) or not candidate.get('competitions') or int(candidate.get('refresh_minutes',0)) not in (5,10,15,20):
        raise SystemExit('Invalid candidate configuration')
    if any(not str(c.get('id','')).isdigit() or not c.get('name') for c in candidate['competitions']):
        raise SystemExit('Candidate contains an invalid competition')
config=candidate if candidate is not None else json.loads((ROOT/'config.json').read_text())
forced=os.environ.get('OPENS_FORCE','').lower() in ('1','true','yes')
if not config.get('competitions'):
    print('No configured competitions; skipping.'); sys.exit(0)
if not forced and not config.get('enabled'):
    print('OPENS paused; skipping scheduled run.'); sys.exit(0)
interval=int(config.get('refresh_minutes',10))
if interval not in (5,10,15,20): raise SystemExit('Invalid refresh rate')
state_file=ROOT/'refresh-state.json'
state=json.loads(state_file.read_text()) if state_file.exists() else {}
now=datetime.now(timezone.utc)
revision=config.get('updated_at')
last=state.get('last_success_at')
if not forced and last and state.get('config_updated_at') == revision:
    try:
        delta=(now-datetime.fromisoformat(last.replace('Z','+00:00'))).total_seconds()/60
        if delta < interval-0.4:
            print(f'Last successful run {delta:.1f} min ago; next refresh not due.'); sys.exit(0)
    except ValueError: pass
print(f'Running OPENS match scraper (forced={forced}, competitions={len(config["competitions"])}).',flush=True)
env=os.environ.copy()
if candidate is not None: env['OPENS_CANDIDATE_JSON']=json.dumps(candidate)
subprocess.run([sys.executable,str(ROOT/'refresh_ibjjf.py')],check=True,env=env)
if candidate is not None:
    # Publish only the verified subset; rejected tournaments must never become
    # active or enter automatic refresh. The scraper writes this after validation.
    accepted_file = ROOT / '.accepted-competitions.json'
    if not accepted_file.exists():
        raise SystemExit('Scraper did not provide verified competition selection; keeping existing configuration.')
    accepted = json.loads(accepted_file.read_text())
    ids = {str(c['id']) for c in candidate['competitions']}
    successful = accepted.get('competitions', [])
    if not successful or any(str(c.get('id')) not in ids for c in successful):
        raise SystemExit('Invalid successful competition list; keeping existing configuration.')
    candidate['competitions'] = successful
    print(f'Activating {len(successful)} verified competition(s); excluded {len(accepted.get("excluded_competitions", []))}.', flush=True)
    accepted_file.unlink()
    candidate['updated_at']=datetime.now(timezone.utc).isoformat()
    (ROOT/'config.json').write_text(json.dumps(candidate,indent=2,ensure_ascii=False)+'\n')
    revision=candidate['updated_at']
state['last_attempt_at']=now.isoformat()
state['last_success_at']=datetime.now(timezone.utc).isoformat()
state['config_updated_at']=revision
state_file.write_text(json.dumps(state,indent=2)+'\n')
