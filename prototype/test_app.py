import unittest,tempfile,pathlib,threading,json,urllib.request,urllib.error
from unittest.mock import patch
import app
class Tests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.db=pathlib.Path(self.tmp.name)/'test.db';app.initialize(self.db)
 def tearDown(self):self.tmp.cleanup()
 def test_gates(self):
  p=app.snapshot(self.db)['items'];self.assertTrue(p[0]['qualified']);self.assertFalse(p[3]['qualified']);self.assertFalse(p[4]['qualified']);self.assertEqual(p[2]['missing'],['Traction'])
 def test_weights(self):
  cfg=dict(app.DEFAULT,weights=[0,0,0,100]);s=app.configure(self.db,cfg);self.assertEqual(s['items'][0]['score'],70)
  with self.assertRaises(ValueError):app.configure(self.db,dict(cfg,weights=[0,0,0,0]))
 def test_owner(self):
  with self.assertRaises(ValueError):app.transition(self.db,2,'contact')
  app.transition(self.db,2,'owner','Vic');self.assertEqual(app.transition(self.db,2,'contact')['items'][1]['touches'],1)
 def test_duplicate(self):
  app.transition(self.db,1,'contact')
  with self.assertRaises(ValueError):app.transition(self.db,1,'contact')
  self.assertEqual(len(app.snapshot(self.db)['reminders']),1)
 def test_reply(self):
  app.transition(self.db,1,'contact');s=app.transition(self.db,1,'reply');self.assertEqual(s['reminders'][0]['state'],'cancelled')
  with self.assertRaises(ValueError):app.transition(self.db,1,'followup')
 def test_stop(self):
  app.transition(self.db,1,'optout')
  with self.assertRaises(ValueError):app.transition(self.db,1,'contact')
 def test_pause(self):
  app.configure(self.db,dict(app.DEFAULT,paused=True))
  with self.assertRaises(ValueError):app.transition(self.db,1,'contact')
 def test_due_limit(self):
  app.transition(self.db,1,'contact')
  with self.assertRaises(ValueError):app.transition(self.db,1,'followup')
  with app.dbopen(self.db) as c:c.execute("UPDATE reminders SET due='2000-01-01T00:00:00+00:00'")
  s=app.transition(self.db,1,'followup');self.assertEqual(s['items'][0]['touches'],2)
  with self.assertRaises(ValueError):app.transition(self.db,1,'followup')
 def test_persistence(self):
  app.transition(self.db,1,'contact');app.initialize(self.db);self.assertEqual(app.snapshot(self.db)['items'][0]['touches'],1)
 def test_unavailable_model(self):
  with patch('app.local_model',side_effect=urllib.error.URLError('offline')):
   with self.assertRaises(urllib.error.URLError):app.review(self.db,1,'gemma4:12b')
  self.assertEqual(app.snapshot(self.db)['items'][0]['touches'],0)
 def test_incomplete_model_results(self):
  for result in [{'response':'','done':True},{'response':'Partial','done':False},{'response':'Partial','done':True,'done_reason':'length'}]:
   with patch('app.local_model',side_effect=[{'models':[{'name':'test'}]},result]):
    with self.assertRaises(ValueError):app.review(self.db,1,'test')
  self.assertEqual(app.snapshot(self.db)['items'][0]['touches'],0)
 def test_complete_model_result(self):
  with patch('app.local_model',side_effect=[{'models':[{'name':'test'}]},{'response':'Supported facts and evidence gaps.','done':True,'done_reason':'stop'}]):self.assertIn('Supported',app.review(self.db,1,'test')['text'])
 def test_http(self):
  s=app.make_server(self.db,0);t=threading.Thread(target=s.serve_forever,daemon=True);t.start();url=f'http://127.0.0.1:{s.server_port}'
  try:
   self.assertEqual(len(json.load(urllib.request.urlopen(url+'/state'))['items']),5)
   for headers in ({'Origin':'https://example.org'},{'Host':'evil.example'}):
    with self.assertRaises(urllib.error.HTTPError) as e:urllib.request.urlopen(urllib.request.Request(url+'/state',headers=headers))
    self.assertEqual(e.exception.code,403)
   data=json.dumps({'id':1,'command':'contact'}).encode()
   with self.assertRaises(urllib.error.HTTPError):urllib.request.urlopen(urllib.request.Request(url+'/action',data=data,headers={'Content-Type':'application/json'}))
   r=urllib.request.urlopen(urllib.request.Request(url+'/action',data=data,headers={'Content-Type':'application/json','X-Local-Token':s.token}));self.assertEqual(json.load(r)['items'][0]['touches'],1)
  finally:s.shutdown();s.server_close();t.join()
if __name__=='__main__':unittest.main(verbosity=2)
