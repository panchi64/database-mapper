import { describe, expect, it } from 'vitest';
import type { TableNode } from '@/types';
import { toColumnType } from './dialects';
import { toDDL } from './emit';
import { parseDDL, unquote } from './parse';
import { describeParse, parsedToDiagram } from './toDiagram';

const SHOP = `
-- A small shop schema.
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(32),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  total NUMERIC(12,2) NOT NULL
);

CREATE TABLE order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  sku VARCHAR(64) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES order_items_parent_missing(id)
);

ALTER TABLE order_items ADD CONSTRAINT fk_oi_order FOREIGN KEY (order_id) REFERENCES orders (id);
COMMENT ON TABLE users IS 'People who can sign in';
CREATE INDEX idx_orders_user ON orders (user_id);
GRANT SELECT ON users TO readonly;
`;

describe('toColumnType', () => {
  it.each([
    ['BIGSERIAL', 'BIGINT'],
    ['int4', 'INT'],
    ['integer', 'INT'],
    ['character varying(80)', 'VARCHAR'],
    ['timestamptz', 'TIMESTAMP'],
    ['jsonb', 'JSON'],
    ['bool', 'BOOLEAN'],
    ['bytea', 'BLOB'],
    ['uuid', 'UUID'],
  ])('maps %s', (input, expected) => {
    expect(toColumnType(input).dataType).toBe(expected);
  });

  it('keeps a length where the type has one', () => {
    expect(toColumnType('VARCHAR(255)')).toEqual({ dataType: 'VARCHAR', length: 255 });
  });

  it('drops precision from a numeric, which is not a width', () => {
    expect(toColumnType('NUMERIC(12,2)').length).toBe(12);
  });

  it('falls back to TEXT for a type it does not know', () => {
    expect(toColumnType('geography(Point,4326)').dataType).toBe('TEXT');
  });
});

describe('unquote', () => {
  it.each([
    ['users', 'users'],
    ['"users"', 'users'],
    ['`users`', 'users'],
    ['[users]', 'users'],
    ['public.users', 'users'],
    ['"public"."users"', 'users'],
  ])('%s -> %s', (input, expected) => {
    expect(unquote(input)).toBe(expected);
  });
});

describe('parseDDL', () => {
  const parsed = parseDDL(SHOP);

  it('finds every table', () => {
    expect(parsed.tables.map((t) => t.name)).toEqual(['users', 'orders', 'order_items']);
  });

  it('strips the schema qualifier', () => {
    expect(parsed.tables.some((t) => t.name === 'public.orders')).toBe(false);
  });

  it('reads column types and lengths', () => {
    const email = parsed.tables[0].columns.find((c) => c.name === 'email')!;
    expect(email).toMatchObject({ dataType: 'VARCHAR', length: 255 });
  });

  it('reads constraints', () => {
    const [users] = parsed.tables;
    const id = users.columns.find((c) => c.name === 'id')!;
    const email = users.columns.find((c) => c.name === 'email')!;
    const phone = users.columns.find((c) => c.name === 'phone')!;

    expect(id).toMatchObject({ primaryKey: true, unique: true, nullable: false });
    expect(email).toMatchObject({ unique: true, nullable: false });
    expect(phone.nullable).toBe(true);
  });

  it('treats SERIAL as auto-increment', () => {
    expect(parsed.tables[0].columns[0].autoIncrement).toBe(true);
  });

  it('reads defaults, quoted and unquoted', () => {
    const status = parsed.tables[1].columns.find((c) => c.name === 'status')!;
    const created = parsed.tables[0].columns.find((c) => c.name === 'created_at')!;

    expect(status.defaultValue).toBe('pending');
    expect(created.defaultValue).toBe('now()');
  });

  it('reads an inline REFERENCES', () => {
    expect(parsed.foreignKeys).toContainEqual({
      fromTable: 'orders',
      fromColumn: 'user_id',
      toTable: 'users',
      toColumn: 'id',
    });
  });

  it('reads an ALTER TABLE foreign key', () => {
    expect(parsed.foreignKeys).toContainEqual({
      fromTable: 'order_items',
      fromColumn: 'order_id',
      toTable: 'orders',
      toColumn: 'id',
    });
  });

  it('reads COMMENT ON TABLE, declared after the table', () => {
    expect(parsed.tables[0].comment).toBe('People who can sign in');
  });

  // A schema dump is full of statements that say nothing about shape.
  it('ignores indexes and grants without complaint', () => {
    expect(parsed.errors.some((e) => e.toLowerCase().includes('index'))).toBe(false);
    expect(parsed.errors.some((e) => e.toLowerCase().includes('grant'))).toBe(false);
  });

  it('drops a foreign key to a table that does not exist, and says so', () => {
    expect(parsed.foreignKeys.some((fk) => fk.toTable.includes('missing'))).toBe(false);
    expect(parsed.errors.some((e) => e.includes('unknown table'))).toBe(true);
  });
});

describe('parseDDL edge cases', () => {
  it('reports finding nothing rather than throwing', () => {
    const result = parseDDL('SELECT 1;');
    expect(result.tables).toEqual([]);
    expect(result.errors.some((e) => e.includes('No CREATE TABLE'))).toBe(true);
  });

  it('survives an empty input', () => {
    expect(() => parseDDL('')).not.toThrow();
  });

  it('handles quoted identifiers throughout', () => {
    const result = parseDDL('CREATE TABLE "my table" ("my col" INT PRIMARY KEY);');
    expect(result.tables[0].name).toBe('my table');
    expect(result.tables[0].columns[0].name).toBe('my col');
  });

  it('handles MySQL backticks and AUTO_INCREMENT', () => {
    const result = parseDDL(
      'CREATE TABLE `t` (`id` INT NOT NULL AUTO_INCREMENT, PRIMARY KEY (`id`));'
    );
    expect(result.tables[0].columns[0]).toMatchObject({ autoIncrement: true, primaryKey: true });
  });

  it('applies a table-level PRIMARY KEY to the named column', () => {
    const result = parseDDL('CREATE TABLE t (id INT, name TEXT, PRIMARY KEY (id));');
    const id = result.tables[0].columns.find((c) => c.name === 'id')!;

    expect(id).toMatchObject({ primaryKey: true, nullable: false });
  });

  it('does not mark either column of a composite unique as unique alone', () => {
    const result = parseDDL('CREATE TABLE t (a INT, b INT, UNIQUE (a, b));');
    expect(result.tables[0].columns.every((c) => !c.unique)).toBe(true);
  });

  it('ignores a semicolon inside a string literal', () => {
    const result = parseDDL("CREATE TABLE t (a TEXT DEFAULT 'x;y');");
    expect(result.tables).toHaveLength(1);
  });

  it('ignores a comma inside a type', () => {
    const result = parseDDL('CREATE TABLE t (a NUMERIC(10, 2), b INT);');
    expect(result.tables[0].columns.map((c) => c.name)).toEqual(['a', 'b']);
  });

  it('ignores line and block comments', () => {
    const result = parseDDL(`
      -- leading
      CREATE TABLE t ( /* inline */ a INT );
    `);
    expect(result.tables[0].columns).toHaveLength(1);
  });

  it('does not mistake a -- inside a string for a comment', () => {
    const result = parseDDL("CREATE TABLE t (a TEXT DEFAULT 'a--b');");
    expect(result.tables[0].columns[0].defaultValue).toBe('a--b');
  });
});

describe('parsedToDiagram', () => {
  const { nodes, edges } = parsedToDiagram(parseDDL(SHOP));

  it('creates a node per table and an edge per key', () => {
    expect(nodes).toHaveLength(3);
    expect(edges).toHaveLength(2);
  });

  it('gives every table a derived height and a colour', () => {
    for (const node of nodes) {
      expect(node.h).toBeGreaterThan(0);
      expect(node.data.color).toBeTruthy();
    }
  });

  it('lays the tables out rather than stacking them at the origin', () => {
    const xs = new Set(nodes.map((n) => n.x));
    expect(xs.size).toBeGreaterThan(1);
  });

  it('points edges at real column ids', () => {
    const columnIds = new Set(
      nodes.flatMap((n) => (n.type === 'table' ? n.data.columns.map((c) => c.id) : []))
    );

    for (const edge of edges) {
      expect(columnIds.has(edge.source.columnId!)).toBe(true);
      expect(columnIds.has(edge.target.columnId!)).toBe(true);
    }
  });

  it('backfills the foreign key onto the referencing column', () => {
    const orders = nodes.find((n) => n.data.name === 'orders') as TableNode;
    const userId = orders.data.columns.find((c) => c.name === 'user_id')!;

    expect(userId.foreignKey).toBeTruthy();
  });

  it('summarises what it found', () => {
    expect(describeParse(parseDDL(SHOP))).toMatch(/3 tables/);
  });
});

describe('toDDL', () => {
  const { nodes, edges } = parsedToDiagram(parseDDL(SHOP));

  it('emits a CREATE TABLE per table', () => {
    const sql = toDDL(nodes, edges, { dialect: 'postgres' });

    expect(sql).toContain('CREATE TABLE "users"');
    expect(sql).toContain('CREATE TABLE "orders"');
  });

  it('emits foreign keys as trailing ALTER statements', () => {
    const sql = toDDL(nodes, edges, { dialect: 'postgres' });

    expect(sql).toContain('ALTER TABLE "orders"');
    expect(sql).toContain('FOREIGN KEY ("user_id")');
    // Inline REFERENCES would require an ordering a cyclic schema cannot have.
    expect(sql.indexOf('CREATE TABLE')).toBeLessThan(sql.indexOf('ALTER TABLE'));
  });

  it('uses backticks and AUTO_INCREMENT for MySQL', () => {
    const sql = toDDL(nodes, edges, { dialect: 'mysql' });

    expect(sql).toContain('`users`');
    expect(sql).toContain('AUTO_INCREMENT');
  });

  it('uses SERIAL for Postgres instead of an attribute', () => {
    const sql = toDDL(nodes, edges, { dialect: 'postgres' });

    expect(sql).toContain('BIGSERIAL');
    expect(sql).not.toContain('AUTO_INCREMENT');
  });

  it('quotes a string default but not a numeric or a function call', () => {
    const sql = toDDL(nodes, edges, { dialect: 'postgres' });

    expect(sql).toContain("DEFAULT 'pending'");
    expect(sql).toContain('DEFAULT now()');
  });

  it('is deterministic', () => {
    expect(toDDL(nodes, edges, { dialect: 'postgres' })).toBe(
      toDDL(nodes, edges, { dialect: 'postgres' })
    );
  });

  it('includes drops when asked', () => {
    expect(toDDL(nodes, edges, { dialect: 'postgres', includeDrops: true })).toContain(
      'DROP TABLE IF EXISTS'
    );
  });

  it('says so for an empty diagram', () => {
    expect(toDDL([], [], { dialect: 'postgres' })).toContain('No tables');
  });
});

describe('round trip', () => {
  /**
   * Export then re-import must be stable. The first pass is where any loss
   * happens (unknown types collapsing to TEXT); after that the shape must hold.
   */
  it('is stable after the first pass', () => {
    const first = parsedToDiagram(parseDDL(SHOP));
    const sql = toDDL(first.nodes, first.edges, { dialect: 'postgres' });

    const second = parsedToDiagram(parseDDL(sql));
    const again = toDDL(second.nodes, second.edges, { dialect: 'postgres' });

    expect(again).toBe(sql);
  });

  it('preserves table and column names', () => {
    const first = parsedToDiagram(parseDDL(SHOP));
    const sql = toDDL(first.nodes, first.edges, { dialect: 'postgres' });
    const second = parseDDL(sql);

    expect(second.tables.map((t) => t.name)).toEqual(['users', 'orders', 'order_items']);
    expect(second.tables[0].columns.map((c) => c.name)).toEqual(
      (first.nodes[0] as TableNode).data.columns.map((c) => c.name)
    );
  });

  it('preserves the relationships', () => {
    const first = parsedToDiagram(parseDDL(SHOP));
    const sql = toDDL(first.nodes, first.edges, { dialect: 'postgres' });

    expect(parseDDL(sql).foreignKeys).toHaveLength(first.edges.length);
  });
});
