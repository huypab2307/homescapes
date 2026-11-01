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


if __name__ == '__main__':
    unittest.main()
