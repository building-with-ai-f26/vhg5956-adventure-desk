"""Create an isolated, fictional CRE demo; never modify an existing database."""
import argparse,json,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/'prototype'))
import app,adventures,workflow
p=argparse.ArgumentParser();p.add_argument('--db',default=str(HERE.parent/'cre-demo-runtime'/'desk.sqlite3'));a=p.parse_args();db=Path(a.db).resolve()
if db.exists():raise SystemExit('Database already exists. Preserving it; choose a new --db path.')
db.parent.mkdir(parents=True,exist_ok=True);app.initialize(db)
r=adventures.create(db,'research',json.loads((HERE/'san-diego-cre-profile.json').read_text()))
workflow.intake(adventures.resolve(db,r['id']),(HERE/'san-diego-cre-fictional.csv').read_text(),True)
print('Created isolated fictional CRE adventure. Select it in the adventure dropdown.')
print('Start with: python prototype/app.py --port 8767 --db "'+str(db)+'"')
