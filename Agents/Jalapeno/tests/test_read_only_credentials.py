from pathlib import Path
import sys,unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from read_only_credentials import ReadOnlySession

class ReadOnlyCredentialTests(unittest.TestCase):
 def test_mutations_and_other_hosts_fail_before_network(self):
  s=ReadOnlySession()
  for method,url in [('POST','https://graph.facebook.com/v25.0/me'),('DELETE','https://graph.facebook.com/v25.0/me'),('GET','https://example.com/v25.0/me'),('GET','https://graph.facebook.com/v25.0/me?access_token=secret')]:
   with self.assertRaises(ValueError):s.request(method,url)
  self.assertEqual(s.methods,[])
