import unittest,tempfile,pathlib,copy,json,io,csv
import app,workflow,adventures
class AdventureTests(unittest.TestCase):
 def setUp(self):self.temp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.temp.name)/'root.db';app.initialize(self.root)
 def tearDown(self):self.temp.cleanup()
 def make(self,template='research'):
  r=adventures.create(self.root,template,copy.deepcopy(adventures.TEMPLATES[template]));return adventures.resolve(self.root,r['id']),r['id']
 def csv(self,name='Sample Participant',domain='sample.invalid'):
  b=io.StringIO();w=csv.writer(b);w.writerow(['name','domain','category','stage','owner','evidence','source_url','score_1','score_2','score_3','score_4']);w.writerow([name,domain,'Urban gardens','Available','Vic','Synthetic interview participant evidence','',90,90,80,50]);return b.getvalue()
 def test_empty_isolated_restart(self):
  original=app.snapshot(self.root);p,_=self.make();self.assertEqual(app.snapshot(p)['items'],[]);app.initialize(p);self.assertEqual(app.snapshot(p)['items'],[]);self.assertEqual(app.snapshot(self.root)['items'],original['items'])
 def test_generic_import_criteria_gates(self):
  p,_=self.make();workflow.intake(p,self.csv(),True);s=app.snapshot(p);self.assertTrue(s['items'][0]['qualified']);self.assertEqual(s['adventure']['criteria'][0],'Topic relevance');app.transition(p,1,'contact');self.assertEqual(app.snapshot(self.root)['items'][0]['touches'],0)
 def test_configuration_isolated(self):
  p,_=self.make();app.configure(p,dict(app.DEFAULT,cutoff=95));self.assertEqual(app.snapshot(self.root)['config']['cutoff'],65);self.assertEqual(app.snapshot(p)['config']['cutoff'],95)
 def test_global_name_suppression(self):
  app.transition(self.root,1,'optout');p,_=self.make();workflow.intake(p,self.csv('Cedar Savings'),True);self.assertTrue(app.snapshot(p)['items'][0]['suppressed'])
  with self.assertRaises(ValueError):app.transition(p,1,'contact')
 def test_global_domain_suppression_both_directions(self):
  p,_=self.make();workflow.intake(p,self.csv('First name','shared.invalid'),True);app.transition(p,1,'optout');workflow.intake(self.root,self.csv('Different name','www.shared.invalid'),True);self.assertTrue(app.snapshot(self.root)['items'][-1]['suppressed'])
  other,_=self.make('sales');workflow.intake(other,self.csv('Third name','shared.invalid'),True)
  with self.assertRaises(ValueError):workflow.plan(other,1,'2099-01-01T12:00:00Z',30)
 def test_criteria_change_guard(self):
  p,_=self.make();workflow.intake(p,self.csv(),True);cfg=adventures.profile(p);cfg['criteria'][0]='Different meaning'
  with self.assertRaises(ValueError):adventures.rename_profile(p,cfg)
 def test_custom_configuration_and_catalog(self):
  cfg=copy.deepcopy(adventures.TEMPLATES['custom']);cfg.update(title='Museum study',objective='Interview museum visitors about accessibility.',entity_label='Visitor',plural_label='Visitors');cfg['criteria']=['Relevance','Availability','Evidence','Access'];r=adventures.create(self.root,'custom',cfg);p=adventures.resolve(self.root,r['id']);self.assertEqual(app.snapshot(p)['adventure']['objective'],cfg['objective']);cfg['title']='Museum interviews';adventures.rename_profile(p,cfg);self.assertEqual(adventures.catalog(self.root)['adventures'][-1]['title'],'Museum interviews')
 def test_unknown_paths_and_invalid_profile(self):
  with self.assertRaises(ValueError):adventures.resolve(self.root,'../../other')
  with self.assertRaises(ValueError):adventures.resolve(self.root,'f'*32)
  cfg=copy.deepcopy(adventures.TEMPLATES['custom']);cfg['criteria']=['Same']*4
  with self.assertRaises(ValueError):adventures.create(self.root,'custom',cfg)
if __name__=='__main__':unittest.main(verbosity=2)
