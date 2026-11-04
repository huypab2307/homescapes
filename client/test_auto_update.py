import base64
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
import auto_update as au

class AutoUpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.bundled=self.root/'app';self.bundled.mkdir();(self.bundled/'baseline').mkdir()
        self.private=Ed25519PrivateKey.generate();self.public=base64.b64encode(self.private.public_key().public_bytes(Encoding.DER,PublicFormat.SubjectPublicKeyInfo)).decode()
        (self.bundled/'update-pin.json').write_text(json.dumps({'server_url':'https://updates.example','public_key':self.public,'min_release':1}))
    def tearDown(self): self.temp.cleanup()
    def release(self,number=10,extra=None):
        buf=io.BytesIO()
        with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as archive:
            for name in sorted(au.REQUIRED):archive.writestr(name,'<html>ready</html>' if name.endswith('.html') else 'content-'+str(number))
            for name,value in (extra or {}).items():archive.writestr(name,value)
        data=buf.getvalue();digest=hashlib.sha256(data).hexdigest()
        meta=dict(schema=1,release=number,version=digest[:16],sha256=digest,size=len(data),min_bootstrap=1,url='/desktop/bundles/'+digest+'.zip')
        meta['signature']=base64.b64encode(self.private.sign(json.dumps(meta,separators=(',',':')).encode())).decode()
        return meta,data
    def test_signature_checksum_and_paths(self):
        meta,data=self.release();au.verify_manifest(meta,self.public);au.validate_archive(data,meta).close()
        changed={**meta,'release':11}
        with self.assertRaises(Exception):au.verify_manifest(changed,self.public)
        with self.assertRaises(ValueError):au.validate_archive(data+b'!',meta)
        for path in ['../outside','dist/../../escape.js','dist/evil\\file.js','src/server/licenses.ts','runtime/node.exe']:
            unsafe,blob=self.release(extra={path:'bad'})
            with self.assertRaises(ValueError):au.validate_archive(blob,unsafe)
    def test_atomic_install_and_offline_cache(self):
        meta,data=self.release()
        updater=au.Updates(self.bundled,self.root/'state')
        with patch.object(au,'fetch',side_effect=[json.dumps(meta).encode(),data]):
            folder,selected=next(updater.candidates());self.assertEqual(selected,meta);self.assertTrue((folder/'src/server/gateway.mjs').exists());updater.accept(meta)
        updater.cleanup()
        cached=au.Updates(self.bundled,self.root/'state')
        with patch.object(au,'fetch',side_effect=OSError('offline')):
            folder,selected=next(cached.candidates());self.assertEqual(selected,meta);self.assertTrue((folder/'dist/index.html').exists())
        cached.cleanup()
    def test_failed_release_rolls_back_and_quarantines(self):
        good,old=self.release(10);bad,new=self.release(20)
        updater=au.Updates(self.bundled,self.root/'state');updater.archive_path(good).write_bytes(old);updater.accept(good)
        with patch.object(au,'fetch',side_effect=[json.dumps(bad).encode(),new]):
            candidates=updater.candidates();_,selected=next(candidates);self.assertEqual(selected,bad);updater.reject(selected)
            _,fallback=next(candidates);self.assertEqual(fallback,good)
        updater.cleanup()
        later=au.Updates(self.bundled,self.root/'state')
        with patch.object(au,'fetch',return_value=json.dumps(bad).encode()):
            _,selected=next(later.candidates());self.assertEqual(selected,good)
        later.cleanup()
    def test_older_signed_release_rejected(self):
        newer,data=self.release(20);old,blob=self.release(10)
        updater=au.Updates(self.bundled,self.root/'state');updater.archive_path(newer).write_bytes(data);updater.accept(newer)
        with patch.object(au,'fetch',return_value=json.dumps(old).encode()):
            _,selected=next(updater.candidates());self.assertEqual(selected,newer)
        updater.cleanup()
    def test_unsigned_or_incomplete_update_keeps_bundled_app(self):
        updater=au.Updates(self.bundled,self.root/'state')
        with patch.object(au,'fetch',return_value=b'{"ok":true}'):
            folder,selected=next(updater.candidates());self.assertIsNone(selected);self.assertEqual(folder,self.bundled/'baseline')
        updater.cleanup()
    def test_https_only_and_no_cross_origin_urls(self):
        for url in ['http://evil.example','https://x/a','https://user:pass@x','https://x/?a=1']:
            with self.assertRaises(ValueError):au.origin(url)
        self.assertEqual(au.origin('https://example.com/'),'https://example.com')
        self.assertEqual(au.origin('http://127.0.0.1:1234',True),'http://127.0.0.1:1234')

if __name__=='__main__':unittest.main()
