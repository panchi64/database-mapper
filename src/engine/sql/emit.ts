/**
 * Rendering a diagram back to DDL.
 *
 * Output is deterministic — tables in diagram order, columns in their declared
 * order, foreign keys collected at the end — so exporting the same diagram twice
 * produces byte-identical SQL and a round-trip through `parseDDL` is stable.
 *
 * Foreign keys are emitted as trailing `ALTER TABLE` statements rather than
 * inline `REFERENCES`, because inline references only work if the target table
 * is created first, and a schema with a cycle has no such ordering.
 */
import type { Column, DBEdge, DBNode, TableNode } from '@/types';
import { autoIncrementSuffix, quoteIdent, toSqlType, type SqlDialect } from './dialects';

export interface EmitOptions {
  dialect: SqlDialect;
  /** Prefix each table with `DROP TABLE IF EXISTS`. */
  includeDrops?: boolean;
}

function columnLine(column: Column, dialect: SqlDialect): string {
  const parts = [quoteIdent(column.name, dialect), toSqlType(column, dialect)];

  if (column.primaryKey) parts.push('PRIMARY KEY');
  if (column.autoIncrement) {
    const suffix = autoIncrementSuffix(dialect).trim();
    if (suffix) parts.push(suffix);
  }
  if (!column.nullable && !column.primaryKey) parts.push('NOT NULL');
  if (column.unique && !column.primaryKey) parts.push('UNIQUE');

  if (column.defaultValue !== undefined && column.defaultValue !== '') {
    parts.push(`DEFAULT ${formatDefault(column.defaultValue)}`);
  }

  // Only MySQL takes an inline column comment; the others need COMMENT ON.
  if (column.comment && dialect === 'mysql') {
    parts.push(`COMMENT '${column.comment.replace(/'/g, "''")}'`);
  }

  return parts.join(' ');
}

/**
 * Quote a default unless it is plainly not a string.
 *
 * Numbers, booleans and function calls like `now()` must not be quoted; anything
 * else is safer quoted than not.
 */
function formatDefault(value: string): string {
  const trimmed = value.trim();

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;
  if (/^(true|false|null)$/i.test(trimmed)) return trimmed.toUpperCase();
  if (/^[A-Za-z_][\w.]*\s*\(.*\)$/.test(trimmed)) return trimmed; // function call
  if (/^(CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME)$/i.test(trimmed)) return trimmed.toUpperCase();

  return `'${trimmed.replace(/'/g, "''")}'`;
}

export function toDDL(
  nodes: readonly DBNode[],
  edges: readonly DBEdge[],
  options: EmitOptions
): string {
  const { dialect } = options;
  const tables = nodes.filter((n): n is TableNode => n.type === 'table');
  if (tables.length === 0) return '-- No tables to export.\n';

  const byId = new Map(tables.map((t) => [t.id, t]));
  const lines: string[] = [];

  if (options.includeDrops) {
    // Reverse order, so a table is dropped before whatever it depends on.
    for (const table of [...tables].reverse()) {
      lines.push(`DROP TABLE IF EXISTS ${quoteIdent(table.data.name, dialect)};`);
    }
    lines.push('');
  }

  for (const table of tables) {
    if (table.data.comment && dialect !== 'mysql') {
      lines.push(`-- ${table.data.comment}`);
    }

    lines.push(`CREATE TABLE ${quoteIdent(table.data.name, dialect)} (`);

    const body = table.data.columns.map((c) => `  ${columnLine(c, dialect)}`);
    lines.push(body.join(',\n'));

    // MySQL takes the table comment as a table option.
    const suffix =
      table.data.comment && dialect === 'mysql'
        ? ` COMMENT='${table.data.comment.replace(/'/g, "''")}'`
        : '';

    lines.push(`)${suffix};`);
    lines.push('');
  }

  const constraints: string[] = [];

  for (const edge of edges) {
    if (edge.data.isNoteLink) continue;

    const from = byId.get(edge.source.nodeId);
    const to = byId.get(edge.target.nodeId);
    if (!from || !to || !edge.source.columnId || !edge.target.columnId) continue;

    const fromColumn = from.data.columns.find((c) => c.id === edge.source.columnId);
    const toColumn = to.data.columns.find((c) => c.id === edge.target.columnId);
    if (!fromColumn || !toColumn) continue;

    const name = `fk_${from.data.name}_${fromColumn.name}`;

    constraints.push(
      `ALTER TABLE ${quoteIdent(from.data.name, dialect)} ` +
        `ADD CONSTRAINT ${quoteIdent(name, dialect)} ` +
        `FOREIGN KEY (${quoteIdent(fromColumn.name, dialect)}) ` +
        `REFERENCES ${quoteIdent(to.data.name, dialect)} (${quoteIdent(toColumn.name, dialect)});`
    );
  }

  if (constraints.length > 0) {
    lines.push('-- Foreign keys');
    lines.push(...constraints);
    lines.push('');
  }

  // Column comments, for the dialects that carry them separately.
  if (dialect === 'postgres') {
    const comments: string[] = [];

    for (const table of tables) {
      for (const column of table.data.columns) {
        if (!column.comment) continue;
        comments.push(
          `COMMENT ON COLUMN ${quoteIdent(table.data.name, dialect)}.` +
            `${quoteIdent(column.name, dialect)} IS '${column.comment.replace(/'/g, "''")}';`
        );
      }
      if (table.data.comment) {
        comments.push(
          `COMMENT ON TABLE ${quoteIdent(table.data.name, dialect)} ` +
            `IS '${table.data.comment.replace(/'/g, "''")}';`
        );
      }
    }

    if (comments.length > 0) {
      lines.push('-- Comments');
      lines.push(...comments);
      lines.push('');
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
