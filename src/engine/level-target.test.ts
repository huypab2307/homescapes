import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from './catalog.ts';
import { openSave } from './savegame.ts';
test('Stats level targets Properties.level and preserves other level fields', () => {
 const field = CATALOG.flatMap(g => g.fields).find(f => f.label === 'Level');
 assert.equal(field?.path, 'Properties.level');
 const save = openSave(new TextEncoder().encode(JSON.stringify({ Properties: { level: 1, LID_Lvl: 42 }, Incomes: { level: 9 } })));
 save.set(field!.path, 10000);
 assert.equal(save.number('Properties.level'), 10000);
 assert.equal(save.number('Properties.LID_Lvl'), 42);
 assert.equal(save.number('Incomes.level'), 9);
});
