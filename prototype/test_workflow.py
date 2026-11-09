import unittest,tempfile,pathlib,csv,io
from datetime import datetime,timezone,timedelta
import app,workflow
class WorkflowTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.db=pathlib.Path(self.temp.name)/'test.db';app.initialize(self.db)
 def tearDown(self):self.temp.cleanup()
 def csv(self,rows):
  b=io.StringIO();w=csv.writer(b);w.writerow(workflow.HEADERS);w.writerows(rows);return b.getvalue()
 def row(self,name='New Access',domain='new-access.invalid'):
  return [name,domain,'Financial inclusion','Seed','Vic','Public evidence example','https://example.invalid/source',90,90,80,60]
 def start(self,hours=2):return (datetime.now(timezone.utc)+timedelta(hours=hours)).isoformat()
 def test_preview_commit_dedupe(self):
  text=self.csv([self.row(),self.row('New name','www.new-access.invalid')]);r=workflow.intake(self.db,text);self.assertEqual(r['added'],1);self.assertEqual(len(app.snapshot(self.db)['items']),5)
  self.assertEqual(workflow.intake(self.db,text,True)['added'],1);self.assertEqual(workflow.intake(self.db,text,True)['added'],0);self.assertEqual(len(app.snapshot(self.db)['items']),6)
 def test_atomic_invalid(self):
  bad=self.row('Invalid');bad[-1]='NaN'
  with self.assertRaises(ValueError):workflow.intake(self.db,self.csv([self.row(),bad]),True)
  self.assertEqual(len(app.snapshot(self.db)['items']),5)
 def test_existing_name(self):self.assertEqual(workflow.intake(self.db,self.csv([self.row('Cedar Savings')]),True)['added'],0)
 def test_provenance(self):
  workflow.intake(self.db,self.csv([self.row()]),True);app.initialize(self.db);p=app.snapshot(self.db)['items'][-1];self.assertEqual(p['source_url'],'https://example.invalid/source');self.assertEqual(p['domain'],'new-access.invalid')
 def test_unsafe_urls(self):
  row=self.row();row[6]='javascript:alert(1)'
  with self.assertRaises(ValueError):workflow.intake(self.db,self.csv([row]),True)
  row=self.row();row[1]='https://user:secret@example.com'
  with self.assertRaises(ValueError):workflow.intake(self.db,self.csv([row]),True)
 def test_missing_evidence_score(self):
  row=self.row();row[-2]='';workflow.intake(self.db,self.csv([row]),True);self.assertFalse(app.snapshot(self.db)['items'][-1]['qualified'])
 def test_timezone(self):
  with self.assertRaises(ValueError):workflow.plan(self.db,1,'2099-01-01T12:00',30)
 def test_plan_cancels_reminder_conflict(self):
  app.transition(self.db,1,'contact');workflow.plan(self.db,1,self.start(),30);self.assertEqual(app.snapshot(self.db)['reminders'][0]['state'],'cancelled')
  with self.assertRaises(ValueError):workflow.plan(self.db,1,self.start(),30)
  app.transition(self.db,2,'owner','Vic')
  with self.assertRaises(ValueError):workflow.plan(self.db,2,self.start(),30)
  workflow.plan(self.db,2,self.start(4),30);self.assertEqual(len(workflow.extra(self.db)['meetings']),2)
 def test_optout_and_paused(self):
  app.transition(self.db,1,'optout')
  with self.assertRaises(ValueError):workflow.plan(self.db,1,self.start(),30)
  app.configure(self.db,dict(app.DEFAULT,paused=True))
  with self.assertRaises(ValueError):workflow.plan(self.db,2,self.start(),30)
 def test_meeting_next_step(self):
  workflow.plan(self.db,1,self.start(),30)
  with self.assertRaises(ValueError):workflow.complete(self.db,1,'Notes','Check evidence',self.start(24))
  with app.dbopen(self.db) as c:c.execute("UPDATE meetings SET start='2000-01-01T12:00:00+00:00',end='2000-01-01T12:30:00+00:00'")
  workflow.complete(self.db,1,'Useful conversation','Check evidence',self.start(24));self.assertEqual(len(workflow.extra(self.db)['tasks']),1)
  with self.assertRaises(ValueError):workflow.complete(self.db,1,'Duplicate','Duplicate',self.start(24))
  workflow.finish_task(self.db,1);self.assertEqual(workflow.extra(self.db)['tasks'][0]['state'],'done')
  with self.assertRaises(ValueError):workflow.finish_task(self.db,1)
 def test_cancel_keeps_outreach_stopped(self):
  workflow.plan(self.db,1,self.start(),30);workflow.cancel_meeting(self.db,1)
  self.assertEqual(workflow.extra(self.db)['meetings'][0]['state'],'cancelled')
  with self.assertRaises(ValueError):app.transition(self.db,1,'contact')
  workflow.plan(self.db,1,self.start(),30)
 def test_revision_qualifies_and_keeps_history(self):
  before=app.snapshot(self.db)['items'][2]
  workflow.revise(self.db,3,'New synthetic pilot evidence','https://example.invalid/pilot',[90,90,80,55],'Reviewed pilot evidence')
  self.assertTrue(app.snapshot(self.db)['items'][2]['qualified'])
  history=workflow.history(self.db,3)['revisions'];self.assertEqual(len(history),1)
  import json
  self.assertEqual(json.loads(history[0]['before_json'])['evidence'],before['evidence'])
 def test_revision_cannot_restart_contact(self):
  app.transition(self.db,1,'optout');workflow.revise(self.db,1,'Updated evidence','',[100,100,100,100],'Reviewed facts')
  self.assertEqual(app.snapshot(self.db)['items'][0]['state'],'optout')
  with self.assertRaises(ValueError):app.transition(self.db,1,'contact')
 def test_revision_invalid_atomic(self):
  with self.assertRaises(ValueError):workflow.revise(self.db,1,'New evidence','javascript:bad',[100]*4,'Reason')
  with self.assertRaises(ValueError):workflow.revise(self.db,1,'New evidence','',[100,100,float('nan'),100],'Reason')
  self.assertEqual(len(workflow.history(self.db,1)['revisions']),0)
 def test_suppression_survives_state_changes(self):
  app.transition(self.db,1,'optout');app.transition(self.db,1,'reply');app.transition(self.db,1,'meeting');app.initialize(self.db)
  self.assertEqual(app.snapshot(self.db)['items'][0]['suppressed'],1)
  with self.assertRaises(ValueError):workflow.plan(self.db,1,self.start(),30)
  with self.assertRaises(ValueError):app.transition(self.db,1,'contact')
 def test_optout_cancels_local_meetings(self):
  workflow.plan(self.db,1,self.start(),30);app.transition(self.db,1,'optout')
  self.assertEqual(workflow.extra(self.db)['meetings'][0]['state'],'cancelled')
 def test_configurable_mandate_consistent(self):
  workflow.set_policy(self.db,{'title':'Retail Seed','sectors':['Retail software'],'stages':['Seed']})
  items=app.snapshot(self.db)['items'];self.assertTrue(items[3]['qualified']);self.assertFalse(items[0]['qualified'])
  app.transition(self.db,4,'contact');workflow.plan(self.db,4,self.start(),30)
  with self.assertRaises(ValueError):app.transition(self.db,1,'contact')
  with self.assertRaises(ValueError):workflow.plan(self.db,1,self.start(),30)
  app.initialize(self.db);self.assertEqual(workflow.policy(self.db)['title'],'Retail Seed')
 def test_invalid_mandate_no_change(self):
  with self.assertRaises(ValueError):workflow.set_policy(self.db,{'title':'Bad','sectors':[],'stages':['Seed']})
  self.assertEqual(workflow.policy(self.db),workflow.DEFAULT_POLICY)
 def test_queue_distinguishes_fit_readiness(self):
  q={x['id']:x for x in workflow.action_queue(self.db)['items']}
  self.assertEqual(q[1]['action'],'initial_review');self.assertEqual(q[2]['action'],'assign_owner');self.assertEqual(q[3]['action'],'research_evidence');self.assertEqual(q[4]['action'],'outside_mandate')
  app.transition(self.db,1,'optout');app.transition(self.db,1,'reply')
  q={x['id']:x for x in workflow.action_queue(self.db)['items']};self.assertEqual(q[1]['action'],'suppressed');self.assertFalse(q[1]['ready'])
 def test_queue_due_and_pause(self):
  app.transition(self.db,1,'contact')
  self.assertEqual(next(x for x in workflow.action_queue(self.db)['items'] if x['id']==1)['action'],'followup_wait')
  with app.dbopen(self.db) as c:c.execute("UPDATE reminders SET due='2000-01-01T00:00:00+00:00'")
  self.assertEqual(workflow.action_queue(self.db)['items'][0]['action'],'followup_due')
  app.configure(self.db,dict(app.DEFAULT,paused=True));self.assertTrue(all(not x['ready'] for x in workflow.action_queue(self.db)['items']))
 def test_stale_evidence_rejected(self):
  workflow.revise(self.db,1,'New facts','',[90]*4,'Tab A',0)
  with self.assertRaisesRegex(ValueError,'another view'):workflow.revise(self.db,1,'Stale facts','',[80]*4,'Tab B',0)
  self.assertEqual(app.snapshot(self.db)['items'][0]['evidence'],'New facts');self.assertEqual(len(workflow.history(self.db,1)['revisions']),1)
  workflow.revise(self.db,1,'Refreshed facts','',[85]*4,'Refreshed tab',1);self.assertEqual(app.snapshot(self.db)['items'][0]['evidence_version'],2)
 def test_concurrent_evidence_one_winner(self):
  from concurrent.futures import ThreadPoolExecutor
  def write(label):
   try:workflow.revise(self.db,1,label,'',[90]*4,label,0);return True
   except ValueError:return False
  with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(write,['Review A','Review B']))
  self.assertEqual(sum(results),1);self.assertEqual(len(workflow.history(self.db,1)['revisions']),1)
 def test_migration_preserves(self):
  app.transition(self.db,1,'contact');app.initialize(self.db);app.initialize(self.db);self.assertEqual(app.snapshot(self.db)['items'][0]['touches'],1)
if __name__=='__main__':unittest.main(verbosity=2)
