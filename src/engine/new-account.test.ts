import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeSave, wrapSave } from './codec.ts';
import { formatWithoutRootBrace, prepareNewAccount } from './new-account.ts';
const sample = '{"Properties":{"level":1008},"precise":9007199254740993123,"n":1.2300,"s":"\\u00e9 { \\"q\\" }","list":[{},[],true,null]}'.replace('\\"q\\"', '\\"q\\"');
const plain = new TextEncoder().encode(sample);
test('new-account: pretty print with CRLF/4 spaces, preserve every value token then delete exactly the root brace', () => {
  JSON.parse(sample);
  const result = new TextDecoder().decode(formatWithoutRootBrace(plain));
  assert.match(result, /\r\n    "Properties": \{/);
  assert.ok(result.includes('9007199254740993123')); assert.ok(result.includes('1.2300')); assert.ok(result.includes('\\u00e9'));
  assert.throws(() => JSON.parse(result));
  assert.deepEqual(JSON.parse(result + '}'), JSON.parse(sample));
  assert.deepEqual(new TextDecoder().decode(plain), sample);
});
test('new-account: accepts one missing root brace but refuses arbitrary broken JSON and non-object roots', () => {
  assert.deepEqual(formatWithoutRootBrace(plain.subarray(0, plain.length - 1)), formatWithoutRootBrace(plain));
  for (const input of ['{"a":,}', '{}{}', '[]', 'null']) assert.throws(() => formatWithoutRootBrace(new TextEncoder().encode(input)));
});
test('new-account: keeps the source XOR key and NUL trailer for encrypted device saves', () => {
  const encrypted = wrapSave(plain, 'f205', new Uint8Array([0]));
  const codec = decodeSave(encrypted); assert.ok(codec.key);
  const result = prepareNewAccount(encrypted);
  assert.equal(result.wasEncrypted, true);
  const decoded = result.bytes.map((b, i) => b ^ codec.key![i % codec.key!.length]!);
  assert.equal(decoded.at(-1), 0);
  assert.deepEqual(decoded.subarray(0, decoded.length - 1), formatWithoutRootBrace(plain));
  assert.deepEqual(encrypted, wrapSave(plain, 'f205', new Uint8Array([0])));
});
