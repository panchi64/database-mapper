import { describe, expect, it } from 'vitest';
import { intrinsicTableHeight } from '@/engine/geometry';
import type { Column, DBNode, TableNodeData } from '@/types';
import {
  columnOptions,
  filterOptions,
  findOption,
  fuzzyScore,
  inferCardinality,
  optionLabel,
  primaryKeyOf,
  suggestTarget,
  typesConflict,
} from './connectSuggestions';

function col(name: string, over: Partial<Column> = {}): Column {
  return {
    id: `c.${name}`,
    name,
    dataType: 'INT',
    nullable: false,
    primaryKey: false,
    unique: false,
    autoIncrement: false,
    ...over,
  };
}

function table(name: string, columns: Column[]): DBNode {
  const data: TableNodeData = { type: 'table', name, columns };
  return { id: name, type: 'table', x: 0, y: 0, w: 260, h: intrinsicTableHeight(data), z: 1, data };
}

const diagram: DBNode[] = [
  table('users', [
    col('id', { id: 'users.id', primaryKey: true, unique: true, dataType: 'BIGINT' }),
    col('email', { id: 'users.email', unique: true, dataType: 'VARCHAR' }),
  ]),
  table('orders', [
    col('id', { id: 'orders.id', primaryKey: true, unique: true, dataType: 'BIGINT' }),
    col('user_id', { id: 'orders.user_id', dataType: 'BIGINT' }),
    col('note', { id: 'orders.note', dataType: 'TEXT' }),
  ]),
  table('categories', [
    col('id', { id: 'categories.id', primaryKey: true, unique: true, dataType: 'INT' }),
  ]),
  {
    id: 'n1',
    type: 'note',
    x: 0,
    y: 0,
    w: 200,
    h: 120,
    z: 2,
    data: { type: 'note', name: 'Design note', content: '' },
  },
  {
    id: 'g1',
    type: 'group',
    x: 0,
    y: 0,
    w: 400,
    h: 300,
    z: 0,
    data: { type: 'group', name: 'Group' },
  },
];

const options = columnOptions(diagram);

describe('columnOptions', () => {
  it('offers each table as a whole and each of its columns', () => {
    const users = options.filter((o) => o.nodeId === 'users');
    expect(users).toHaveLength(3); // the table plus two columns
    expect(users[0].columnId).toBeUndefined();
  });

  it('offers notes, which can only connect as a whole', () => {
    const note = options.filter((o) => o.nodeId === 'n1');
    expect(note).toHaveLength(1);
    expect(note[0].columnId).toBeUndefined();
  });

  it('skips groups, which cannot be connected', () => {
    expect(options.some((o) => o.nodeId === 'g1')).toBe(false);
  });

  it('carries the flags the picker displays', () => {
    const usersId = options.find((o) => o.columnId === 'users.id')!;
    expect(usersId).toMatchObject({ isPrimaryKey: true, isUnique: true, dataType: 'BIGINT' });
  });

  it('labels a column as table.column and a table as its name', () => {
    expect(optionLabel(options.find((o) => o.columnId === 'users.id')!)).toBe('users.id');
    expect(optionLabel(options.find((o) => o.nodeId === 'users' && !o.columnId)!)).toBe('users');
  });
});

describe('fuzzyScore', () => {
  it('matches a subsequence', () => {
    expect(fuzzyScore('oui', 'orders.user_id')).not.toBeNull();
  });

  it('rejects characters that are out of order', () => {
    expect(fuzzyScore('iu', 'users.id')).toBeNull();
  });

  it('rejects characters that are absent', () => {
    expect(fuzzyScore('xyz', 'users.id')).toBeNull();
  });

  it('scores an exact prefix best', () => {
    const exact = fuzzyScore('users', 'users.id')!;
    const scattered = fuzzyScore('users', 'u_s_e_r_s')!;
    expect(exact).toBeLessThan(scattered);
  });

  it('treats an empty query as a match', () => {
    expect(fuzzyScore('', 'anything')).toBe(0);
  });
});

describe('filterOptions', () => {
  it('returns everything for an empty query', () => {
    expect(filterOptions(options, '  ')).toHaveLength(options.length);
  });

  it('finds a column by a scattered query', () => {
    const found = filterOptions(options, 'ousid');
    expect(found[0].columnId).toBe('orders.user_id');
  });

  it('ranks the closest match first', () => {
    expect(filterOptions(options, 'users.id')[0].columnId).toBe('users.id');
  });

  it('is case insensitive', () => {
    expect(filterOptions(options, 'USERS').length).toBeGreaterThan(0);
  });

  it('returns nothing when nothing matches', () => {
    expect(filterOptions(options, 'zzzzq')).toEqual([]);
  });
});

describe('inferCardinality', () => {
  const usersId = options.find((o) => o.columnId === 'users.id')!;
  const ordersUserId = options.find((o) => o.columnId === 'orders.user_id')!;
  const ordersNote = options.find((o) => o.columnId === 'orders.note')!;
  const usersEmail = options.find((o) => o.columnId === 'users.email')!;

  it('reads a plain column pointing at a key as one-to-many', () => {
    expect(inferCardinality(ordersUserId, usersId)).toBe('one-to-many');
  });

  it('reads two unique columns as one-to-one', () => {
    expect(inferCardinality(usersEmail, usersId)).toBe('one-to-one');
  });

  it('reads two plain columns as many-to-many', () => {
    expect(inferCardinality(ordersNote, ordersNote)).toBe('many-to-many');
  });

  it('falls back to many-to-many with nothing selected', () => {
    expect(inferCardinality(null, null)).toBe('many-to-many');
  });
});

describe('suggestTarget', () => {
  it('follows the <thing>_id convention to the referenced key', () => {
    const source = options.find((o) => o.columnId === 'orders.user_id')!;
    expect(suggestTarget(source, options)?.columnId).toBe('users.id');
  });

  it('suggests nothing for a column that is not an id', () => {
    const source = options.find((o) => o.columnId === 'orders.note')!;
    expect(suggestTarget(source, options)).toBeNull();
  });

  it('never suggests a column on the source table itself', () => {
    const selfRef = columnOptions([
      table('categories', [
        col('id', { id: 'categories.id', primaryKey: true, unique: true }),
        col('category_id', { id: 'categories.category_id' }),
      ]),
    ]);
    const source = selfRef.find((o) => o.columnId === 'categories.category_id')!;

    expect(suggestTarget(source, selfRef)).toBeNull();
  });

  it('handles an irregular plural', () => {
    const nodes = [
      table('categories', [col('id', { id: 'categories.id', primaryKey: true, unique: true })]),
      table('products', [col('category_id', { id: 'products.category_id' })]),
    ];
    const opts = columnOptions(nodes);
    const source = opts.find((o) => o.columnId === 'products.category_id')!;

    expect(suggestTarget(source, opts)?.columnId).toBe('categories.id');
  });

  it('suggests nothing when no table matches the stem', () => {
    const source = columnOptions([table('t', [col('widget_id', { id: 't.widget_id' })])])[1];
    expect(suggestTarget(source, options)).toBeNull();
  });
});

describe('primaryKeyOf', () => {
  it('finds a table\'s single primary key', () => {
    expect(primaryKeyOf('users', options)?.columnId).toBe('users.id');
  });

  it('returns nothing for a composite key, where there is no obvious choice', () => {
    const opts = columnOptions([
      table('join_table', [
        col('a_id', { id: 'j.a', primaryKey: true }),
        col('b_id', { id: 'j.b', primaryKey: true }),
      ]),
    ]);

    expect(primaryKeyOf('join_table', opts)).toBeNull();
  });
});

describe('typesConflict', () => {
  const find = (id: string) => options.find((o) => o.columnId === id)!;

  it('accepts identical types', () => {
    expect(typesConflict(find('users.id'), find('orders.user_id'))).toBe(false);
  });

  it('flags genuinely different types', () => {
    expect(typesConflict(find('users.email'), find('orders.user_id'))).toBe(true);
  });

  // A VARCHAR(64) key referenced by a VARCHAR(255) is ordinary; warning would be noise.
  it('ignores a difference in length only', () => {
    const a = { ...find('users.email'), dataType: 'VARCHAR(64)' };
    const b = { ...find('users.email'), dataType: 'VARCHAR(255)' };
    expect(typesConflict(a, b)).toBe(false);
  });

  it('treats INT and INTEGER as the same', () => {
    const a = { ...find('users.id'), dataType: 'INT' };
    const b = { ...find('users.id'), dataType: 'INTEGER' };
    expect(typesConflict(a, b)).toBe(false);
  });

  it('flags an INT referencing a BIGINT key', () => {
    expect(typesConflict(find('categories.id'), find('users.id'))).toBe(true);
  });

  it('says nothing when a whole table is selected, which has no type', () => {
    const whole = options.find((o) => o.nodeId === 'users' && !o.columnId)!;
    expect(typesConflict(whole, find('users.id'))).toBe(false);
  });
});

describe('findOption', () => {
  it('finds a specific column', () => {
    expect(findOption(options, 'users', 'users.id')?.columnName).toBe('id');
  });

  it('falls back to the whole table when the column is unknown', () => {
    expect(findOption(options, 'users', 'nope')?.columnId).toBeUndefined();
  });

  it('returns nothing for an unknown node', () => {
    expect(findOption(options, 'ghost')).toBeNull();
  });
});
