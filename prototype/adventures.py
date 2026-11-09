"""Local adventure catalog and cross-adventure suppression. No network calls."""
import json,uuid
from pathlib import Path
BASE={'title':'Investment sourcing','objective':'Find relevant early-stage financial-inclusion companies and coordinate introductory conversations.','entity_label':'Company','plural_label':'Companies','category_label':'Sector','stage_label':'Stage','criteria':['Mandate','Stage fit','Traction','Relationship']}
TEMPLATES={
 'investment':BASE,
 'sales':{'title':'Sales discovery','objective':'Identify relevant prospective customers, understand their needs and coordinate discovery conversations.','entity_label':'Prospect','plural_label':'Prospects','category_label':'Segment','stage_label':'Readiness','criteria':['Need fit','Readiness','Evidence strength','Relationship']},
 'partnerships':{'title':'Partnership development','objective':'Find complementary organizations and explore mutually useful partnership opportunities.','entity_label':'Partner','plural_label':'Partners','category_label':'Partner type','stage_label':'Readiness','criteria':['Strategic fit','Readiness','Mutual value','Relationship']},
 'research':{'title':'Research interviews','objective':'Find relevant interview participants and organize research conversations around the chosen question.','entity_label':'Participant','plural_label':'Participants','category_label':'Audience','stage_label':'Availability','criteria':['Topic relevance','Availability','Evidence quality','Access']},
 'events':{'title':'Event outreach','objective':'Identify relevant organizations or speakers and coordinate exploratory event conversations.','entity_label':'Contact','plural_label':'Contacts','category_label':'Role','stage_label':'Availability','criteria':['Audience fit','Availability','Experience evidence','Relationship']},
 'custom':{'title':'My adventure','objective':'Define the outcome I want to achieve and organize relevant records, conversations and next steps.','entity_label':'Record','plural_label':'Records','category_label':'Category','stage_label':'Stage','criteria':['Goal fit','Readiness','Evidence strength','Relationship']}}
def migrate(c,path):
 c.executescript('''CREATE TABLE IF NOT EXISTS adventure_profile(id INTEGER PRIMARY KEY,value TEXT,root_db TEXT);
CREATE TABLE IF NOT EXISTS adventure_catalog(id TEXT PRIMARY KEY,title TEXT,template TEXT,created TEXT);
CREATE TABLE IF NOT EXISTS global_suppression(kind TEXT,value TEXT,reason TEXT,PRIMARY KEY(kind,value));''')
 if not c.execute('SELECT 1 FROM adventure_profile').fetchone():c.execute('INSERT INTO adventure_profile VALUES(1,?,?)',(json.dumps(BASE),str(Path(path).resolve())))
def root_for(path):
 import app
 with app.dbopen(path) as c:
  r=c.execute('SELECT root_db FROM adventure_profile WHERE id=1').fetchone();return Path(r[0]) if r else Path(path)
def profile(path):
 import app
 with app.dbopen(path) as c:return json.loads(c.execute('SELECT value FROM adventure_profile WHERE id=1').fetchone()[0])
def validate(value):
 if not isinstance(value,dict) or set(value)!=set(BASE):raise ValueError('Adventure configuration fields do not match')
 for k in BASE:
  if k=='criteria':
   if not isinstance(value[k],list) or len(value[k])!=4 or any(not isinstance(v,str) or not v.strip() or len(v)>60 for v in value[k]):raise ValueError('Use four nonempty scoring criteria, up to 60 characters each')
   if len(set(v.strip().casefold() for v in value[k]))!=4:raise ValueError('Scoring criteria must be distinct')
  elif not isinstance(value[k],str) or not value[k].strip() or len(value[k])>(700 if k=='objective' else 80):raise ValueError('Invalid adventure '+k)
 return {k:([x.strip() for x in v] if isinstance(v,list) else v.strip()) for k,v in value.items()}
def catalog(root):
 import app
 with app.dbopen(root) as c:return {'adventures':[{'id':'investment','title':profile(root)['title'],'template':'investment'}]+[dict(r) for r in c.execute('SELECT id,title,template FROM adventure_catalog ORDER BY created')],'templates':TEMPLATES}
def resolve(root,ident):
 import app
 if ident in (None,'','investment'):return Path(root)
 if not isinstance(ident,str) or len(ident)!=32 or any(x not in '0123456789abcdef' for x in ident):raise ValueError('Unknown adventure')
 with app.dbopen(root) as c:
  if not c.execute('SELECT 1 FROM adventure_catalog WHERE id=?',(ident,)).fetchone():raise ValueError('Unknown adventure')
 target=Path(root).resolve().parent/'adventures'/(ident+'.sqlite3')
 if not target.is_file():raise ValueError('Adventure database missing')
 return target

def create(root,template,config):
 import app,workflow
 if template not in TEMPLATES:raise ValueError('Unknown template')
 value=validate(config);ident=uuid.uuid4().hex;folder=Path(root).resolve().parent/'adventures';target=folder/(ident+'.sqlite3')
 with app.LOCK,app.dbopen(root) as c:
  if c.execute('SELECT COUNT(*) FROM adventure_catalog').fetchone()[0]>=50:raise ValueError('Maximum 50 adventures in this local prototype')
  folder.mkdir(exist_ok=True);app.initialize(target,seed=False)
  with app.dbopen(target) as new:
   new.execute('UPDATE adventure_profile SET value=?,root_db=? WHERE id=1',(json.dumps(value),str(Path(root).resolve())))
   if template!='investment':new.execute('INSERT OR REPLACE INTO thesis VALUES(1,?)',(json.dumps({'title':value['title'],'sectors':['*'],'stages':['*']}),))
  c.execute('INSERT INTO adventure_catalog VALUES(?,?,?,?)',(ident,value['title'],template,app.stamp()));app.record(c,None,'adventure_created',value['title'])
 return {'id':ident,'profile':value}
def rename_profile(path,value):
 import app
 value=validate(value)
 with app.LOCK,app.dbopen(path) as c:
  count=c.execute('SELECT COUNT(*) FROM prospects').fetchone()[0];old=profile(path)
  if count and old['criteria']!=value['criteria']:raise ValueError('Create a new adventure to change scoring criteria once records exist; existing scores must not be reinterpreted')
  c.execute('UPDATE adventure_profile SET value=? WHERE id=1',(json.dumps(value),));app.record(c,None,'adventure_configuration',value['title'])
 root=root_for(path)
 if Path(root).resolve()!=Path(path).resolve():
  with app.dbopen(root) as c:c.execute('UPDATE adventure_catalog SET title=? WHERE id=?',(value['title'],Path(path).stem))
 return value

def keys(p):
 import workflow
 result=[('name',workflow.key(p['name']))]
 if p.get('domain'):result.append(('domain',p['domain']))
 return result
def suppress(path,p,connection=None):
 import app
 root=root_for(path)
 if connection is not None and Path(root).resolve()==Path(path).resolve():
  for kind,value in keys(p):
   if value:connection.execute('INSERT OR IGNORE INTO global_suppression VALUES(?,?,?)',(kind,value,'Recorded opt-out in a local adventure'))
  return
 with app.dbopen(root) as c:
  for kind,value in keys(p):
   if value:c.execute('INSERT OR IGNORE INTO global_suppression VALUES(?,?,?)',(kind,value,'Recorded opt-out in a local adventure'))
def is_suppressed(path,p):
 import app
 if p.get('suppressed'):return True
 with app.dbopen(root_for(path)) as c:return any(c.execute('SELECT 1 FROM global_suppression WHERE kind=? AND value=?',(k,v)).fetchone() for k,v in keys(p))
def sync_suppression(path):
 import app
 with app.dbopen(path) as c:rows=[dict(r) for r in c.execute("SELECT * FROM prospects WHERE suppressed=1")]
 for p in rows:suppress(path,p)
