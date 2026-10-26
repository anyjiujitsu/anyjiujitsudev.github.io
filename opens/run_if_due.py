#!/usr/bin/env python3
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parent
config=json.loads((ROOT/'config.json').read_text())
if not config.get('enabled') or not config.get('competitions'):
    print('OPENS paused or no selected competitions; skipping.')
    sys.exit(0)
interval=int(config.get('refresh_minutes',10))
if interval not in (5,10,15,20):
    raise SystemExit('Invalid refresh rate')
state_file=ROOT/'refresh-state.json'
state=json.loads(state_file.read_text()) if state_file.exists() else {}
now=datetime.now(timezone.utc)
last=state.get('last_attempt_at')
if last:
    try:
        delta=(now-datetime.fromisoformat(last.replace('Z','+00:00'))).total_seconds()/60
        if delta < interval-0.4:
            print(f'Last attempt {delta:.1f} min ago; next refresh not due.')
            sys.exit(0)
    except ValueError:
        pass
print('Running OPENS match scraper.')
state['last_attempt_at']=now.isoformat()
try:
    subprocess.run([sys.executable,str(ROOT/'refresh_ibjjf.py')],check=True)
except subprocess.CalledProcessError:
    state_file.write_text(json.dumps(state,indent=2)+'\n')
    raise
state['last_success_at']=datetime.now(timezone.utc).isoformat()
state_file.write_text(json.dumps(state,indent=2)+'\n')
