import base64
import unittest
from unittest.mock import patch
import hc_client as hc
PKG = 'com.playrix.homescapes.vn'
PATH = '/data/user/0/' + PKG + '/files/SaveGame.db'
SAVE = b'{"Properties":{"level":1008}}'
NAMES = ('SaveGame.db','SaveGame.db.bak','SaveGame.db.buf')

def snapshot():
    return {'schema':1,'serial':'device','package':PKG,'file':PATH,'files':{name:base64.b64encode(SAVE+str(i).encode()).decode() for i,name in enumerate(NAMES)}}

class FreshStartTests(unittest.TestCase):
    def setUp(self): hc._ACTIVE_PACKAGE.clear(); hc._PATH_CACHE.clear()
    def test_delete_targets_only_three_names_after_snapshot_matches(self):
        item=snapshot();calls=[]
        def adb(a,args,**kw): calls.append(args); return 0,b'',b''
        with patch.object(hc,'_find_adb',return_value='adb'),patch.object(hc,'_is_pkg_installed',return_value=True),patch.object(hc.HomescapesClient,'_fresh_stop'),patch.object(hc.HomescapesClient,'_fresh_read_files',return_value=item['files']),patch.object(hc,'_run_adb',side_effect=adb),patch.object(hc.HomescapesClient,'start') as start:
            result=hc.HomescapesClient().fresh_start('device',item)
        self.assertTrue(result['ok']);start.assert_called_once_with('device')
        command=calls[0][-1]
        for name in NAMES: self.assertIn('"'+PATH.rsplit('/',1)[0]+'/'+name+'"',command)
        self.assertNotIn('.hcsbak',command);self.assertNotIn('*',command);self.assertNotIn('rm -rf',command)
    def test_changed_snapshot_prevents_deletion(self):
        item=snapshot()
        with patch.object(hc,'_find_adb',return_value='adb'),patch.object(hc,'_is_pkg_installed',return_value=True),patch.object(hc.HomescapesClient,'_fresh_stop'),patch.object(hc.HomescapesClient,'_fresh_read_files',return_value={}),patch.object(hc,'_run_adb') as run:
            with self.assertRaises(hc.ClientError):hc.HomescapesClient().fresh_start('device',item)
        run.assert_not_called()
    def test_bad_source_or_other_device_refused(self):
        for item in [dict(snapshot(),serial='other'),dict(snapshot(),file='/data/data/other.app/SaveGame.db'),dict(snapshot(),files={'SaveGame.db':'AA=='})]:
            with patch.object(hc,'_run_adb') as run:
                with self.assertRaises(hc.ClientError):hc.HomescapesClient().fresh_start('device',item)
            run.assert_not_called()
    def test_delete_failure_attempts_restore_and_does_not_launch(self):
        item=snapshot()
        with patch.object(hc,'_find_adb',return_value='adb'),patch.object(hc,'_is_pkg_installed',return_value=True),patch.object(hc.HomescapesClient,'_fresh_stop'),patch.object(hc.HomescapesClient,'_fresh_read_files',return_value=item['files']),patch.object(hc,'_run_adb',return_value=(1,b'',b'permission denied')),patch.object(hc.HomescapesClient,'_fresh_restore_files') as restore,patch.object(hc.HomescapesClient,'start') as start:
            with self.assertRaises(hc.ClientError):hc.HomescapesClient().fresh_start('device',item)
        restore.assert_called_once();start.assert_not_called()
    def test_snapshot_handles_absent_sibling_and_reads_both_existing_files(self):
        reads=[]
        def adb(a,args,**kw): return 0,(b'ABSENT' if 'SaveGame.db.buf' in args[-1] else b'PRESENT'),b''
        def pull(a,s,path):reads.append(path);return SAVE
        with patch.object(hc,'_find_adb',return_value='adb'),patch.object(hc,'_is_pkg_installed',return_value=True),patch.object(hc.HomescapesClient,'_fresh_stop'),patch.object(hc.HomescapesClient,'_read_save',return_value=(PATH,SAVE)),patch.object(hc,'_run_adb',side_effect=adb),patch.object(hc,'_pull_privileged',side_effect=pull):
            result=hc.HomescapesClient().fresh_snapshot('device',PKG,PATH)
        self.assertEqual(set(result['files']),set(NAMES));self.assertIsNone(result['files']['SaveGame.db.buf']);self.assertEqual(len(reads),2)
    def test_restore_receives_all_three_original_byte_sequences(self):
        item=snapshot()
        with patch.object(hc,'_find_adb',return_value='adb'),patch.object(hc,'_is_pkg_installed',return_value=True),patch.object(hc.HomescapesClient,'_fresh_stop'),patch.object(hc.HomescapesClient,'_fresh_restore_files') as restore,patch.object(hc.HomescapesClient,'start'):
            hc.HomescapesClient().fresh_start('device',item,restore=True)
        decoded=restore.call_args.args[-1]
        for name in NAMES:self.assertEqual(decoded[name],base64.b64decode(item['files'][name]))

if __name__=='__main__':unittest.main()
