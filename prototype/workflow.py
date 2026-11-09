"""Local-only intake and meeting planning. No network calls."""
import csv,io,json,re,sqlite3,adventures
from datetime import datetime,timezone,timedelta
from urllib.parse import urlsplit
HEADERS=['name','domain','sector','stage','owner','evidence','source_url','mandate','stage_fit','traction','relationship']
def migrate(c):
 cols={r[1] for r in c.execute('PRAGMA table_info(prospects)')}
 for name in ('domain','source_url','name_key'):
  if name not in cols:c.execute(f"ALTER TABLE prospects ADD COLUMN {name} TEXT DEFAULT ''")
 if 'evidence_version' not in cols:c.execute('ALTER TABLE prospects ADD COLUMN evidence_version INTEGER NOT NULL DEFAULT 0')
 if 'suppressed' not in cols:c.execute('ALTER TABLE prospects ADD COLUMN suppressed INTEGER NOT NULL DEFAULT 0')
 c.execute("UPDATE prospects SET suppressed=1 WHERE state='optout' OR id IN (SELECT prospect FROM events WHERE kind='optout')")
 for r in c.execute('SELECT id,name FROM prospects').fetchall():c.execute('UPDATE prospects SET name_key=? WHERE id=?',(key(r['name']),r['id']))
 c.executescript('''CREATE TABLE IF NOT EXISTS thesis(id INTEGER PRIMARY KEY,value TEXT);
CREATE TABLE IF NOT EXISTS revisions(id INTEGER PRIMARY KEY,prospect INTEGER,time TEXT,reason TEXT,before_json TEXT,after_json TEXT);
CREATE TABLE IF NOT EXISTS meetings(id INTEGER PRIMARY KEY,prospect INTEGER,owner TEXT,start TEXT,end TEXT,state TEXT DEFAULT 'planned',notes TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY,prospect INTEGER,title TEXT,due TEXT,state TEXT DEFAULT 'open');''')
def key(s):return re.sub(r'[^a-z0-9]','',s.casefold())
def domain(s):
 s=s.strip().lower()
 if not s:return ''
 p=urlsplit(s if '://' in s else 'https://'+s)
 if p.scheme not in ('http','https') or p.username or p.password or p.port or p.path not in ('','/') or p.query or p.fragment:raise ValueError('Domain must be a hostname, without paths or credentials')
 h=(p.hostname or '').removeprefix('www.').rstrip('.')
 if not re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?',h) or '.' not in h or '..' in h:raise ValueError('Invalid company domain')
 return h
def parse_csv(text):
 if not isinstance(text,str) or len(text)>100000:raise ValueError('CSV must be at most 100 KB')
 rows=csv.DictReader(io.StringIO(text.lstrip('\ufeff')))
 generic=['name','domain','category','stage','owner','evidence','source_url','score_1','score_2','score_3','score_4']
 if rows.fieldnames not in (HEADERS,generic):raise ValueError('Use the exact template columns and order')
 is_generic=rows.fieldnames==generic
 result=[]
 for line,row in enumerate(rows,2):
  if len(result)>=100:raise ValueError('Maximum 100 rows per import')
  if None in row or any(v is None for v in row.values()):raise ValueError(f'Row {line}: incorrect column count')
  if is_generic:row=dict(zip(HEADERS,[row[k] for k in generic]))
  d={k:v.strip() for k,v in row.items()}
  for k,limit in [('name',120),('sector',100),('stage',60),('owner',60),('evidence',3000)]:
   if not d[k] or len(d[k])>limit:raise ValueError(f'Row {line}: {k} is required and limited to {limit} characters')
  if not key(d['name']):raise ValueError(f'Row {line}: invalid company name')
  d['domain']=domain(d['domain']);d['name_key']=key(d['name'])
  if d['source_url']:
   p=urlsplit(d['source_url'])
   if p.scheme not in ('http','https') or not p.hostname or p.username or p.password or len(d['source_url'])>1000:raise ValueError(f'Row {line}: source URL must be HTTP(S), without credentials')
  values=[]
  for k in HEADERS[-4:]:
   try:v=None if not d[k] else float(d[k])
   except ValueError:raise ValueError(f'Row {line}: invalid score {k}')
   if v is not None and not 0<=v<=100:raise ValueError(f'Row {line}: scores must be 0 to 100')
   values.append(v)
  d['values']=values;result.append(d)
 if not result:raise ValueError('CSV contains no company rows')
 return result
def intake(path,text,commit=False):
 import app
 rows=parse_csv(text)
 with app.LOCK,app.dbopen(path) as c:
  names={r[0] for r in c.execute('SELECT name_key FROM prospects')};domains={r[0] for r in c.execute("SELECT domain FROM prospects WHERE domain<>''")};new=[];skipped=[]
  for d in rows:
   if d['name_key'] in names or d['domain'] and d['domain'] in domains:skipped.append(d['name']);continue
   names.add(d['name_key'])
   if d['domain']:domains.add(d['domain'])
   new.append(d)
  if commit:
   for d in new:c.execute('INSERT INTO prospects(name,domain,sector,stage,owner,evidence,source_url,name_key,values_json) VALUES(?,?,?,?,?,?,?,?,?)',tuple(d[k] for k in ['name','domain','sector','stage','owner','evidence','source_url','name_key'])+(json.dumps(d['values']),))
   app.record(c,None,'import',f'LOCAL CSV: {len(new)} added, {len(skipped)} duplicates skipped; sources not fetched or verified')
 return {'added':len(new),'skipped':skipped,'preview':[{'name':d['name'],'domain':d['domain'],'source_url':d['source_url']} for d in new],'committed':commit}
def aware(s):
 if not isinstance(s,str):raise ValueError('Use a date with timezone offset')
 try:d=datetime.fromisoformat(s.replace('Z','+00:00'))
 except ValueError:raise ValueError('Invalid date/time')
 if d.tzinfo is None or d.utcoffset() is None:raise ValueError('Timezone offset required')
 return d.astimezone(timezone.utc)
def plan(path,ident,start,minutes):
 import app
 dt=aware(start)
 if dt<=datetime.now(timezone.utc):raise ValueError('Meeting must be in the future')
 if type(minutes) is not int or not 15<=minutes<=240:raise ValueError('Duration must be 15 to 240 minutes')
 end=dt+timedelta(minutes=minutes)
 with app.LOCK,app.dbopen(path) as c:
  row=c.execute('SELECT * FROM prospects WHERE id=?',(ident,)).fetchone()
  if not row:raise ValueError('Record not found')
  p=dict(row);cfg=json.loads(c.execute('SELECT value FROM preferences').fetchone()[0]);p['values']=json.loads(p['values_json'])
  if cfg['paused']:raise ValueError('Workflow paused')
  if adventures.is_suppressed(path,p) or p['state']=='optout':raise ValueError('Record opted out')
  if p['owner']=='Unassigned':raise ValueError('Assign an owner first')
  if not app.qualify(p,cfg,policy(path),adventures.profile(path))['qualified']:raise ValueError('Qualification or evidence gate failed')
  if c.execute("SELECT 1 FROM meetings WHERE state='planned' AND (lower(owner)=lower(?) OR prospect=?) AND start<? AND end>?",(p['owner'],ident,end.isoformat(),dt.isoformat())).fetchone():raise ValueError('Meeting overlaps an existing local plan for this owner/company')
  c.execute('INSERT INTO meetings(prospect,owner,start,end) VALUES(?,?,?,?)',(ident,p['owner'],dt.isoformat(),end.isoformat()))
  c.execute("UPDATE prospects SET state='meeting' WHERE id=?",(ident,));c.execute("UPDATE reminders SET state='cancelled' WHERE prospect=? AND state='pending'",(ident,));app.record(c,ident,'meeting_plan','LOCAL ONLY: no calendar invitation sent')
 return {'ok':True}
def complete(path,ident,notes,next_step,due):
 import app
 if not isinstance(notes,str) or not notes.strip() or len(notes)>5000:raise ValueError('Meeting notes required; maximum 5000 characters')
 if not isinstance(next_step,str) or not next_step.strip() or len(next_step)>300:raise ValueError('Next step required; maximum 300 characters')
 date=aware(due)
 if date<=datetime.now(timezone.utc):raise ValueError('Next step due date must be in future')
 with app.LOCK,app.dbopen(path) as c:
  r=c.execute("SELECT * FROM meetings WHERE id=? AND state='planned'",(ident,)).fetchone()
  if not r:raise ValueError('Meeting not found or already completed')
  if aware(r['start'])>datetime.now(timezone.utc):raise ValueError('Cannot complete a future meeting')
  c.execute("UPDATE meetings SET state='completed',notes=? WHERE id=?",(notes.strip(),ident));c.execute('INSERT INTO tasks(prospect,title,due) VALUES(?,?,?)',(r['prospect'],next_step.strip(),date.isoformat()));app.record(c,r['prospect'],'meeting_completed','Notes and next step saved locally')
 return {'ok':True}
def finish_task(path,ident):
 import app
 with app.LOCK,app.dbopen(path) as c:
  r=c.execute("SELECT * FROM tasks WHERE id=? AND state='open'",(ident,)).fetchone()
  if not r:raise ValueError('Open task not found')
  c.execute("UPDATE tasks SET state='done' WHERE id=?",(ident,));app.record(c,r['prospect'],'task_done',r['title'])
 return {'ok':True}
def extra(path):
 import app
 with app.dbopen(path) as c:return {k:[dict(r) for r in c.execute(f'SELECT x.*,p.name FROM {k} x JOIN prospects p ON p.id=x.prospect ORDER BY x.id DESC')] for k in ('meetings','tasks')}

def cancel_meeting(path,ident):
 import app
 with app.LOCK,app.dbopen(path) as c:
  r=c.execute("SELECT * FROM meetings WHERE id=? AND state='planned'",(ident,)).fetchone()
  if not r:raise ValueError('Planned meeting not found')
  c.execute("UPDATE meetings SET state='cancelled' WHERE id=?",(ident,));app.record(c,r['prospect'],'meeting_cancelled','LOCAL ONLY: no external cancellation sent; outreach remains stopped')
 return {'ok':True}

def revise(path,ident,evidence,source,values,reason,expected_version=0):
 import app
 if not isinstance(evidence,str) or not evidence.strip() or len(evidence)>3000:raise ValueError('Evidence is required; maximum 3000 characters')
 if not isinstance(source,str) or len(source)>1000:raise ValueError('Invalid source reference')
 if source:
  p=urlsplit(source)
  if p.scheme not in ('http','https') or not p.hostname or p.username or p.password:raise ValueError('Source URL must be HTTP(S), without credentials')
 if not isinstance(values,list) or len(values)!=4 or any(v is not None and (type(v) not in (int,float) or not 0<=v<=100) for v in values):raise ValueError('Use four scores from 0 to 100, or blank for unknown')
 if not isinstance(reason,str) or not reason.strip() or len(reason)>500:raise ValueError('Review reason is required; maximum 500 characters')
 with app.LOCK,app.dbopen(path) as c:
  r=c.execute('SELECT * FROM prospects WHERE id=?',(ident,)).fetchone()
  if not r:raise ValueError('Record not found')
  if type(expected_version) is not int or r['evidence_version']!=expected_version:raise ValueError('Evidence changed in another view. Close and reopen the company before saving.')
  before={'version':r['evidence_version'],'evidence':r['evidence'],'source_url':r['source_url'],'values':json.loads(r['values_json'])};after={'evidence':evidence.strip(),'source_url':source.strip(),'values':values}
  c.execute('INSERT INTO revisions(prospect,time,reason,before_json,after_json) VALUES(?,?,?,?,?)',(ident,app.stamp(),reason.strip(),json.dumps(before),json.dumps(after)))
  c.execute('UPDATE prospects SET evidence=?,source_url=?,values_json=?,evidence_version=evidence_version+1 WHERE id=?',(after['evidence'],after['source_url'],json.dumps(values),ident));app.record(c,ident,'evidence_review',reason.strip())
 return {'ok':True}
def history(path,ident):
 import app
 with app.dbopen(path) as c:return {'revisions':[dict(r) for r in c.execute('SELECT * FROM revisions WHERE prospect=? ORDER BY id DESC',(ident,))]}

DEFAULT_POLICY={'title':'Financial inclusion / early stage','sectors':['Financial inclusion'],'stages':['Seed','Pre-seed']}
def policy(path):
 import app
 with app.dbopen(path) as c:
  r=c.execute('SELECT value FROM thesis WHERE id=1').fetchone()
  return json.loads(r[0]) if r else dict(DEFAULT_POLICY)
def set_policy(path,value):
 import app
 if not isinstance(value,dict) or set(value)!=set(DEFAULT_POLICY):raise ValueError('Mandate fields do not match')
 if not isinstance(value['title'],str) or not value['title'].strip() or len(value['title'])>100:raise ValueError('Mandate title required, up to 100 characters')
 for k in ('sectors','stages'):
  if not isinstance(value[k],list) or not 1<=len(value[k])<=20 or any(not isinstance(x,str) or not x.strip() or len(x)>100 for x in value[k]):raise ValueError('Use 1 to 20 nonempty '+k)
 clean={'title':value['title'].strip(),'sectors':list(dict.fromkeys(x.strip() for x in value['sectors'])),'stages':list(dict.fromkeys(x.strip() for x in value['stages']))}
 with app.LOCK,app.dbopen(path) as c:
  c.execute('INSERT OR REPLACE INTO thesis(id,value) VALUES(1,?)',(json.dumps(clean),));app.record(c,None,'mandate',json.dumps(clean))
 return clean

def action_queue(path):
 import app
 s=app.snapshot(path);plans=extra(path);now=app.stamp();rows=[]
 for p in s['items']:
  reminders=[r for r in s['reminders'] if r['prospect']==p['id'] and r['state']=='pending'];meetings=[m for m in plans['meetings'] if m['prospect']==p['id'] and m['state']=='planned'];tasks=[t for t in plans['tasks'] if t['prospect']==p['id'] and t['state']=='open'];due='';ready=False;rank=90
  if p.get('suppressed'):action,reason='suppressed','Opt-out is active; outreach and meeting planning remain blocked'
  elif s['config']['paused']:action,reason='paused','Workflow is paused'
  elif tasks:
   t=min(tasks,key=lambda x:x['due']);due=t['due'];action,reason='next_step',t['title'];ready=True;rank=0 if due<=now else 15
  elif meetings:
   m=min(meetings,key=lambda x:x['start']);due=m['start'];action='meeting_notes' if due<=now else 'meeting_planned';reason='Record notes and a next step' if due<=now else 'Local meeting plan; no invitation sent';ready=due<=now;rank=5 if ready else 30
  elif p['state']=='meeting':action,reason='meeting_review','Review meeting status; no active plan, outreach remains stopped'
  elif p['state']=='reply':action,reason='review_reply','Review the reply and decide whether to plan a meeting';ready=True;rank=10
  elif p['gates']:action,reason='outside_mandate',', '.join(p['gates'])
  elif p['missing']:action,reason='research_evidence','Missing: '+', '.join(p['missing']);ready=True;rank=40
  elif not p['qualified']:action,reason='below_threshold','Score below configured threshold'
  elif p['owner']=='Unassigned':action,reason='assign_owner','Assign a relationship owner before outreach';ready=True;rank=35
  elif reminders:
   r=min(reminders,key=lambda x:x['due']);due=r['due'];action='followup_due' if due<=now else 'followup_wait';reason='Review and simulate the due follow-up' if due<=now else 'Wait until the configured follow-up date';ready=due<=now;rank=8 if ready else 50
  elif p['touches']>=s['config']['touch_limit']:action,reason='touch_limit','Maximum touches reached'
  elif not p['touches']:action,reason='initial_review','Review evidence and prepare an initial draft';ready=True;rank=20
  else:action,reason='manual_review','No scheduled follow-up; review the record'
  rows.append({'id':p['id'],'name':p['name'],'owner':p['owner'],'action':action,'reason':reason,'ready':ready,'due':due,'priority':rank})
 return {'items':sorted(rows,key=lambda x:(x['priority'],x['due'],x['name'])),'notice':'Local decision support only. Ready means an internal review/action is available, never permission to send.'}
