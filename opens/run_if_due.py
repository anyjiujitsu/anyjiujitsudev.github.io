#!/usr/bin/env python3
"""Run OPENS on a GitHub schedule or with an explicit force dispatch."""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parent
config=json.loads((ROOT/'config.json').read_text())
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
subprocess.run([sys.executable,str(ROOT/'refresh_ibjjf.py')],check=True)
state['last_attempt_at']=now.isoformat()
state['last_success_at']=datetime.now(timezone.utc).isoformat()
state['config_updated_at']=revision
state_file.write_text(json.dumps(state,indent=2)+'\n')
