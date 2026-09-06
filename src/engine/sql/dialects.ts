/**
 * Mapping between SQL type names and our `ColumnDataType` union.
 *
 * The union is deliberately small — it exists to drive a diagram, not to model
 * every type every engine supports. So import is lossy by design: `citext`
 * becomes TEXT, `numeric(10,2)` becomes DECIMAL. The alternative is a union with
 * two hundred members and a picker nobody can use.
 */
import type { Column, ColumnDataType } from '@/types';

export type SqlDialect = 'postgres' | 'mysql' | 'sqlite';

/** Aliases seen in the wild, mapped onto the union. */
const TYPE_ALIASES: Record<string, ColumnDataType> = {
  // Integers
  int: 'INT', integer: 'INT', int4: 'INT', mediumint: 'INT', serial: 'INT', serial4: 'INT',
  bigint: 'BIGINT', int8: 'BIGINT', bigserial: 'BIGINT', serial8: 'BIGINT',
  smallint: 'SMALLINT', int2: 'SMALLINT', smallserial: 'SMALLINT',
  tinyint: 'TINYINT',

  // Exact and approximate numerics
  decimal: 'DECIMAL', numeric: 'NUMERIC', money: 'DECIMAL',
  float: 'FLOAT', float4: 'FLOAT', real: 'FLOAT',
  double: 'DOUBLE', float8: 'DOUBLE', 'double precision': 'DOUBLE',

  // Strings
  varchar: 'VARCHAR', 'character varying': 'VARCHAR', varchar2: 'VARCHAR', nvarchar: 'VARCHAR',
  char: 'CHAR', character: 'CHAR', bpchar: 'CHAR', nchar: 'CHAR',
  text: 'TEXT', citext: 'TEXT', clob: 'TEXT', tinytext: 'TEXT', mediumtext: 'TEXT',
  longtext: 'LONGTEXT',

  // Temporal
  date: 'DATE',
  datetime: 'DATETIME',
  timestamp: 'TIMESTAMP', timestamptz: 'TIMESTAMP',
  'timestamp with time zone': 'TIMESTAMP', 'timestamp without time zone': 'TIMESTAMP',
  time: 'TIME', timetz: 'TIME', 'time with time zone': 'TIME',

  // Boolean
  boolean: 'BOOLEAN', bool: 'BOOLEAN',
  bit: 'BIT',

  // Binary
  blob: 'BLOB', bytea: 'BLOB', longblob: 'BLOB', mediumblob: 'BLOB', tinyblob: 'BLOB',
  binary: 'BINARY',
  varbinary: 'VARBINARY',

  // Structured
  json: 'JSON', jsonb: 'JSON',
  uuid: 'UUID',
  enum: 'ENUM',
  set: 'SET',
};

/** `VARCHAR(255)` -> `{ dataType: 'VARCHAR', length: 255 }`. Unknown types become TEXT. */
export function toColumnType(raw: string): { dataType: ColumnDataType; length?: number } {
  const trimmed = raw.trim().toLowerCase();

  const match = /^([a-z0-9_ ]+?)\s*(?:\(\s*(\d+)(?:\s*,\s*\d+)?\s*\))?$/.exec(trimmed);
  if (!match) return { dataType: 'TEXT' };

  const [, name, length] = match;
  const dataType = TYPE_ALIASES[name.replace(/\s+/g, ' ').trim()] ?? 'TEXT';

  // A length on a type that has no length is noise — DECIMAL's precision is not
  // the same thing as VARCHAR's width, and we only model the latter.
  const carriesLength = ['VARCHAR', 'CHAR', 'BINARY', 'VARBINARY', 'DECIMAL', 'NUMERIC'];

  return length && carriesLength.includes(dataType)
    ? { dataType, length: Number(length) }
    : { dataType };
}

/** How an identifier is quoted, per dialect. */
export function quoteIdent(name: string, dialect: SqlDialect): string {
  if (dialect === 'mysql') return `\`${name.replace(/`/g, '``')}\``;
  return `"${name.replace(/"/g, '""')}"`;
}

/** Render a column's type for the given dialect. */
export function toSqlType(column: Column, dialect: SqlDialect): string {
  const { dataType, length } = column;

  // Auto-increment is expressed through the type in Postgres, and through a
  // column attribute everywhere else.
  if (column.autoIncrement && dialect === 'postgres') {
    return dataType === 'BIGINT' ? 'BIGSERIAL' : dataType === 'SMALLINT' ? 'SMALLSERIAL' : 'SERIAL';
  }

  if (dialect === 'sqlite') {
    // SQLite's affinities: anything else is stored as TEXT anyway, and its
    // AUTOINCREMENT only works on INTEGER PRIMARY KEY.
    if (column.autoIncrement) return 'INTEGER';
    if (dataType === 'BOOLEAN') return 'INTEGER';
  }

  if (dataType === 'BOOLEAN' && dialect === 'mysql') return 'TINYINT(1)';

  return length ? `${dataType}(${length})` : dataType;
}

/** The trailing attribute that makes a column auto-increment, if any. */
export function autoIncrementSuffix(dialect: SqlDialect): string {
  if (dialect === 'mysql') return ' AUTO_INCREMENT';
  if (dialect === 'sqlite') return ' AUTOINCREMENT';
  return ''; // Postgres carries it in the type.
}
