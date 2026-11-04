"""Run: python -m unittest discover -s client -p test_package_fallback.py"""
import base64
import unittest
from unittest.mock import patch
import hc_client as hc

GLOBAL = 'com.playrix.homescapes'
VN = 'com.playrix.homescapes.vn'
SAVE = b'{"PlayerItems":{},"Currency":{}}'


class PackageFallbackTests(unittest.TestCase):
    def setUp(self):
        hc._ACTIVE_PACKAGE.clear()
        hc._PATH_CACHE.clear()

    def pull(self, installed, readable):
        reads = []
        def read(adb, serial, pkg):
            reads.append(pkg)
            return ('/data/data/' + pkg + '/SaveGame.db', SAVE) if pkg in readable else None
        with patch.object(hc, '_find_adb', return_value='adb'), \
             patch.object(hc, '_is_pkg_installed', side_effect=lambda a, s, p: p in installed), \
             patch.object(hc.HomescapesClient, '_read_save', side_effect=read):
            reply = hc.HomescapesClient().pull('device')
        return reply, reads

    def test_original_wins_even_if_vn_was_cached(self):
        hc._ACTIVE_PACKAGE['device'] = VN
        reply, reads = self.pull({GLOBAL, VN}, {GLOBAL, VN})
        self.assertEqual(reply['package'], GLOBAL)
        self.assertEqual(reads, [GLOBAL])
        self.assertEqual(base64.b64decode(reply['b64']), SAVE)

    def test_vn_when_original_not_installed(self):
        reply, reads = self.pull({VN}, {VN})
        self.assertEqual(reply['package'], VN)
        self.assertEqual(reads, [VN])

    def test_vn_when_original_has_no_readable_save(self):
        reply, reads = self.pull({GLOBAL, VN}, {VN})
        self.assertEqual(reply['package'], VN)
        self.assertEqual(reads, [GLOBAL, VN])

    def test_neither_installed_reports_both(self):
        with self.assertRaises(hc.ClientError) as caught:
            self.pull(set(), set())
        self.assertIn(GLOBAL + ': package not installed', str(caught.exception))
        self.assertIn(VN + ': package not installed', str(caught.exception))

    def test_stop_skips_uninstalled_package_even_if_am_would_return_success(self):
        with patch.object(hc, '_find_adb', return_value='adb'), \
             patch.object(hc, '_is_pkg_installed', side_effect=lambda a, s, p: p == VN), \
             patch.object(hc, '_run_adb', return_value=(0, b'', b'')) as run:
            reply = hc.HomescapesClient().force_stop('device')
        self.assertEqual(reply['package'], VN)
        self.assertEqual(run.call_count, 1)
        self.assertEqual(run.call_args.args[1][-1], VN)

    def test_push_pins_stop_write_and_restart_to_selected_vn(self):
        writes = []
        def read(adb, serial, pkg):
            if pkg != VN:
                return None
            path = '/data/user/0/' + pkg + '/files/SaveGame.db'
            hc._PATH_CACHE[(serial, pkg, hc.SAVE_FILE)] = path
            return path, SAVE
        def adb(adb, args, **kwargs):
            writes.append(args)
            return 0, b'', b''
        with patch.object(hc, '_find_adb', return_value='adb'), \
             patch.object(hc, '_is_pkg_installed', return_value=True), \
             patch.object(hc, 'looks_like_save', return_value=True), \
             patch.object(hc.HomescapesClient, '_read_save', side_effect=read), \
             patch.object(hc, '_run_adb', side_effect=adb), \
             patch.object(hc.time, 'sleep'):
            reply = hc.HomescapesClient().push('device', SAVE)
        self.assertEqual(reply['package'], VN)
        self.assertEqual(reply['file'], '/data/user/0/' + VN + '/files/SaveGame.db')
        self.assertIn(['-s', 'device', 'shell', 'am', 'force-stop', VN], writes)
        commands = [' '.join(x) for x in writes]
        self.assertTrue(any('su -c' in x and VN in x for x in commands))
        self.assertFalse(any('su -c' in x and GLOBAL + '/' in x for x in commands))
        self.assertTrue(any('monkey -p ' + VN in x for x in commands))


    def test_snapshot_stops_selected_vn_then_rereads(self):
        events = []
        def read(adb, serial, pkg):
            events.append(('read', pkg))
            return ('/data/data/' + pkg + '/SaveGame.db', SAVE) if pkg == VN else None
        def run(adb, args, **kwargs):
            events.append(('adb', args)); return 0, b'', b''
        with patch.object(hc, '_find_adb', return_value='adb'), patch.object(hc, '_is_pkg_installed', return_value=True), patch.object(hc.HomescapesClient, '_read_save', side_effect=read), patch.object(hc, '_run_adb', side_effect=run), patch.object(hc.time, 'sleep'):
            result = hc.HomescapesClient().pull('device', stop_first=True)
        self.assertEqual(result['package'], VN)
        stop_index = next(i for i, e in enumerate(events) if e[0] == 'adb' and e[1][-2:] == ['force-stop', VN])
        self.assertEqual(events[stop_index + 1], ('read', VN))

    def test_required_backup_uses_and_chain_and_never_restarts_on_failure(self):
        commands = []
        path = '/data/user/0/' + VN + '/files/SaveGame.db'
        def read(adb, serial, pkg):
            hc._PATH_CACHE[(serial, pkg, hc.SAVE_FILE)] = path
            return path, SAVE
        def run(adb, args, **kwargs):
            commands.append(args)
            if 'su -c' in ' '.join(args): return 1, b'', b'backup failed'
            return 0, b'', b''
        with patch.object(hc, '_find_adb', return_value='adb'), patch.object(hc, '_is_pkg_installed', return_value=True), patch.object(hc.HomescapesClient, '_read_save', side_effect=read), patch.object(hc, '_run_adb', side_effect=run), patch.object(hc.time, 'sleep'):
            with self.assertRaises(hc.ClientError): hc.HomescapesClient().push('device', SAVE, require_backup=True, expected_package=VN, expected_file=path)
        shell = next(' '.join(a) for a in commands if 'su -c' in ' '.join(a))
        self.assertIn(' && ', shell)
        self.assertNotIn(';', shell)
        self.assertFalse(any('monkey' in a for a in commands))

    def test_reset_refuses_a_changed_path_before_upload(self):
        def read(adb, serial, pkg):
            hc._PATH_CACHE[(serial, pkg, hc.SAVE_FILE)] = '/changed/SaveGame.db'
            return '/changed/SaveGame.db', SAVE
        with patch.object(hc, '_find_adb', return_value='adb'), patch.object(hc, '_is_pkg_installed', return_value=True), patch.object(hc.HomescapesClient, '_read_save', side_effect=read), patch.object(hc, '_run_adb') as run:
            with self.assertRaises(hc.ClientError): hc.HomescapesClient().push('device', SAVE, require_backup=True, expected_package=VN, expected_file='/old/SaveGame.db')
        run.assert_not_called()


    def test_restore_finds_the_non_default_snapshot_path(self):
        path = '/data/user/0/' + VN + '/files/saves/SaveGame.db'
        commands = []
        def run(adb, args, **kwargs):
            commands.append(args)
            if 'ls ' in ' '.join(args):
                return (0, path.encode(), b'') if path + hc.TOOL_BACKUP_SUFFIX in ' '.join(args) else (1, b'', b'')
            return 0, b'', b''
        with patch.object(hc, '_find_adb', return_value='adb'), patch.object(hc, '_find_on_device', side_effect=lambda a,s,p,f: path if p == VN else None), patch.object(hc, '_run_adb', side_effect=run), patch.object(hc.HomescapesClient, 'force_stop', return_value={'ok': True, 'package': VN}), patch.object(hc.HomescapesClient, 'start', return_value={'ok': True}):
            reply = hc.HomescapesClient().restore_backup('device')
        self.assertEqual(reply['file'], path)
        self.assertTrue(any('cp ' in ' '.join(args) and path in ' '.join(args) for args in commands))


if __name__ == '__main__':
    unittest.main()
