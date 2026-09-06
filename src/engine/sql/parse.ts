/**
 * A tolerant `CREATE TABLE` reader.
 *
 * Hand-rolled rather than pulling in `node-sql-parser` (~1MB, against a ~470KB
 * budget for the entire app). This is not a SQL parser: it is a reader for the
 * subset of DDL that describes a schema's shape, and it is deliberately
 * forgiving. Anything it does not understand is skipped and reported through
 * `errors`, because a schema dump full of grants, indexes and vendor pragmas
 * should still yield a diagram.
 *
 * Understood:
 *   CREATE TABLE [IF NOT EXISTS] [schema.]name ( ... )
 *     column definitions with type, length, NOT NULL, PRIMARY KEY, UNIQUE,
 *     DEFAULT, AUTO_INCREMENT / AUTOINCREMENT / SERIAL / GENERATED, REFERENCES,
 *     COMMENT
 *     table constraints: PRIMARY KEY (...), UNIQUE (...), FOREIGN KEY (...) REFERENCES
 *   ALTER TABLE ... ADD [CONSTRAINT ...] FOREIGN KEY (...) REFERENCES ...
 *   COMMENT ON TABLE ... IS '...'
 */
import type { ColumnDataType } from '@/types';
import { toColumnType } from './dialects';

export interface ParsedColumn {
  name: string;
  dataType: ColumnDataType;
  length?: number;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  autoIncrement: boolean;
  defaultValue?: string;
  comment?: string;
}

export interface ParsedTable {
  name: string;
  columns: ParsedColumn[];
  comment?: string;
}

export interface ParsedForeignKey {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

export interface ParseResult {
  tables: ParsedTable[];
  foreignKeys: ParsedForeignKey[];
  /** Statements that were skipped, and why. Surfaced in the import dialog. */
  errors: string[];
}

/** Strip comments and normalise whitespace, without touching string literals. */
function stripComments(sql: string): string {
  let out = '';
  let i = 0;

  while (i < sql.length) {
    const two = sql.slice(i, i + 2);

    if (two === '--') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      continue;
    }

    if (two === '/*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }

    const char = sql[i];
    if (char === "'" || char === '"' || char === '`') {
      // Copy the literal verbatim so a `--` inside it survives.
      const quote = char;
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === quote) {
          if (sql[j + 1] === quote) j += 2;
          else break;
        } else j++;
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    out += char;
    i++;
  }

  return out;
}

/** Split on semicolons that are not inside brackets or string literals. */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let depth = 0;
  let current = '';
  let quote: string | null = null;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];

    if (quote) {
      current += char;
      if (char === quote) {
        if (sql[i + 1] === quote) current += sql[++i];
        else quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      current += char;
      continue;
    }

    if (char === '(') depth++;
    if (char === ')') depth = Math.max(0, depth - 1);

    if (char === ';' && depth === 0) {
      statements.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  statements.push(current);
  return statements.map((s) => s.trim()).filter(Boolean);
}

/** Split a bracketed body on commas at depth zero. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  let quote: string | null = null;

  for (let i = 0; i < body.length; i++) {
    const char = body[i];

    if (quote) {
      current += char;
      if (char === quote) {
        if (body[i + 1] === quote) current += body[++i];
        else quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      current += char;
      continue;
    }

    if (char === '(') depth++;
    if (char === ')') depth--;

    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  parts.push(current);
  return parts.map((s) => s.trim()).filter(Boolean);
}

/** Remove quoting and any schema qualifier: `"public"."users"` -> `users`. */
export function unquote(raw: string): string {
  const parts = raw
    .trim()
    .split('.')
    .map((p) => p.trim().replace(/^["`[](.*)["`\]]$/s, '$1'));

  return parts[parts.length - 1] ?? '';
}

/** The bracketed body of a statement, and what preceded it. */
function bracketBody(statement: string): { head: string; body: string } | null {
  const open = statement.indexOf('(');
  if (open === -1) return null;

  let depth = 0;
  for (let i = open; i < statement.length; i++) {
    if (statement[i] === '(') depth++;
    else if (statement[i] === ')') {
      depth--;
      if (depth === 0) {
        return { head: statement.slice(0, open), body: statement.slice(open + 1, i) };
      }
    }
  }

  return null;
}

const CONSTRAINT_START = /^(constraint|primary\s+key|unique|foreign\s+key|key|index|check|fulltext|spatial)\b/i;

function parseColumnDefinition(definition: string): ParsedColumn | null {
  // `name TYPE[(n)] rest...`
  const match = /^\s*("[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][\w$]*)\s+([\s\S]+)$/.exec(definition);
  if (!match) return null;

  const name = unquote(match[1]);
  const rest = match[2].trim();

  // The type runs to the first space that is not inside brackets.
  const typeMatch = /^([A-Za-z_][\w ]*?(?:\s*\([^)]*\))?)(\s+[\s\S]*)?$/.exec(rest);
  if (!typeMatch) return null;

  const { dataType, length } = toColumnType(typeMatch[1]);
  const flags = (typeMatch[2] ?? '').trim();
  const upper = flags.toUpperCase();

  const primaryKey = /\bPRIMARY\s+KEY\b/.test(upper);
  const defaultMatch = /\bDEFAULT\s+('(?:[^']|'')*'|[^\s,]+)/i.exec(flags);
  const commentMatch = /\bCOMMENT\s+'((?:[^']|'')*)'/i.exec(flags);

  return {
    name,
    dataType,
    ...(length ? { length } : {}),
    // A primary key is implicitly NOT NULL even when it does not say so.
    nullable: !/\bNOT\s+NULL\b/.test(upper) && !primaryKey,
    primaryKey,
    unique: primaryKey || /\bUNIQUE\b/.test(upper),
    autoIncrement:
      /\bAUTO_INCREMENT\b|\bAUTOINCREMENT\b|\bGENERATED\s+(ALWAYS|BY\s+DEFAULT)\b/.test(upper) ||
      // Anchored to the end rather than \bSERIAL\b: there is no word boundary
      // inside BIGSERIAL or SMALLSERIAL, so the boundary form silently missed them.
      /serial\d*\s*$/i.test(typeMatch[1].trim()),
    ...(defaultMatch ? { defaultValue: defaultMatch[1].replace(/^'|'$/g, '') } : {}),
    ...(commentMatch ? { comment: commentMatch[1].replace(/''/g, "'") } : {}),
  };
}

/** Column names from a `(a, b, c)` list. */
function columnList(raw: string): string[] {
  return splitTopLevel(raw).map((c) => unquote(c.replace(/\s+(asc|desc)$/i, '')));
}

function parseCreateTable(statement: string, result: ParseResult): void {
  const parts = bracketBody(statement);
  if (!parts) {
    result.errors.push('CREATE TABLE with no column list was skipped.');
    return;
  }

  // The name alternation must come before the bare form, or a quoted name
  // containing a space is truncated at the space.
  const nameMatch =
    /create\s+(?:or\s+replace\s+)?(?:temp(?:orary)?\s+)?table\s+(?:if\s+not\s+exists\s+)?("(?:[^"]|"")*"|`[^`]*`|\[[^\]]*\]|[^\s(]+)/i
      .exec(parts.head);
  if (!nameMatch) {
    result.errors.push('CREATE TABLE with an unreadable name was skipped.');
    return;
  }

  const tableName = unquote(nameMatch[1]);
  const table: ParsedTable = { name: tableName, columns: [] };

  for (const item of splitTopLevel(parts.body)) {
    if (CONSTRAINT_START.test(item)) {
      applyTableConstraint(item, table, result);
      continue;
    }

    const column = parseColumnDefinition(item);
    if (!column) {
      result.errors.push(`Skipped an unreadable column in "${tableName}": ${short(item)}`);
      continue;
    }

    table.columns.push(column);

    // Inline `REFERENCES other(col)`.
    const ref = /\bREFERENCES\s+([^\s(]+)\s*\(\s*([^)]+)\)/i.exec(item);
    if (ref) {
      result.foreignKeys.push({
        fromTable: tableName,
        fromColumn: column.name,
        toTable: unquote(ref[1]),
        toColumn: unquote(ref[2]),
      });
    }
  }

  if (table.columns.length === 0) {
    result.errors.push(`Table "${tableName}" had no readable columns and was skipped.`);
    return;
  }

  result.tables.push(table);
}

function applyTableConstraint(item: string, table: ParsedTable, result: ParseResult): void {
  const foreign = /\bFOREIGN\s+KEY\s*\(\s*([^)]+)\)\s*REFERENCES\s+([^\s(]+)\s*\(\s*([^)]+)\)/i.exec(item);
  if (foreign) {
    const from = columnList(foreign[1]);
    const to = columnList(foreign[3]);

    from.forEach((column, i) => {
      result.foreignKeys.push({
        fromTable: table.name,
        fromColumn: column,
        toTable: unquote(foreign[2]),
        toColumn: to[i] ?? to[0],
      });
    });
    return;
  }

  const primary = /\bPRIMARY\s+KEY\s*\(\s*([^)]+)\)/i.exec(item);
  if (primary) {
    for (const name of columnList(primary[1])) {
      const column = table.columns.find((c) => c.name === name);
      if (column) {
        column.primaryKey = true;
        column.unique = true;
        column.nullable = false;
      }
    }
    return;
  }

  const unique = /\bUNIQUE\s*(?:KEY\s+\S+\s*)?\(\s*([^)]+)\)/i.exec(item);
  if (unique) {
    const names = columnList(unique[1]);
    // A composite unique constraint does not make either column unique alone.
    if (names.length === 1) {
      const column = table.columns.find((c) => c.name === names[0]);
      if (column) column.unique = true;
    }
  }
}

function parseAlterTable(statement: string, result: ParseResult): void {
  const foreign =
    /alter\s+table\s+(?:only\s+)?([^\s]+)[\s\S]*?FOREIGN\s+KEY\s*\(\s*([^)]+)\)\s*REFERENCES\s+([^\s(]+)\s*\(\s*([^)]+)\)/i
      .exec(statement);

  if (!foreign) return; // Other ALTERs carry nothing the diagram shows.

  const from = columnList(foreign[2]);
  const to = columnList(foreign[4]);

  from.forEach((column, i) => {
    result.foreignKeys.push({
      fromTable: unquote(foreign[1]),
      fromColumn: column,
      toTable: unquote(foreign[3]),
      toColumn: to[i] ?? to[0],
    });
  });
}

function parseComment(statement: string, result: ParseResult): void {
  const match = /comment\s+on\s+table\s+([^\s]+)\s+is\s+'((?:[^']|'')*)'/i.exec(statement);
  if (!match) return;

  const table = result.tables.find((t) => t.name === unquote(match[1]));
  if (table) table.comment = match[2].replace(/''/g, "'");
}

function short(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > 60 ? `${collapsed.slice(0, 57)}…` : collapsed;
}

export function parseDDL(sql: string): ParseResult {
  const result: ParseResult = { tables: [], foreignKeys: [], errors: [] };

  const statements = splitStatements(stripComments(sql));

  // Two passes: `COMMENT ON` and `ALTER TABLE` refer to tables that may be
  // created later in the file.
  const deferred: string[] = [];

  for (const statement of statements) {
    if (/^\s*create\s+(or\s+replace\s+)?(temp(orary)?\s+)?table\b/i.test(statement)) {
      try {
        parseCreateTable(statement, result);
      } catch {
        result.errors.push(`Could not read a CREATE TABLE statement: ${short(statement)}`);
      }
    } else if (/^\s*(alter\s+table|comment\s+on)\b/i.test(statement)) {
      deferred.push(statement);
    }
    // Everything else — grants, indexes, pragmas, inserts — is simply not
    // schema shape, and is skipped without comment.
  }

  for (const statement of deferred) {
    try {
      if (/^\s*alter/i.test(statement)) parseAlterTable(statement, result);
      else parseComment(statement, result);
    } catch {
      result.errors.push(`Could not read a statement: ${short(statement)}`);
    }
  }

  // Drop foreign keys pointing at things that were never created.
  const known = new Set(result.tables.map((t) => t.name));
  result.foreignKeys = result.foreignKeys.filter((fk) => {
    if (known.has(fk.fromTable) && known.has(fk.toTable)) return true;
    result.errors.push(
      `Ignored a foreign key to an unknown table: ${fk.fromTable}.${fk.fromColumn} -> ${fk.toTable}`
    );
    return false;
  });

  if (result.tables.length === 0) {
    result.errors.push('No CREATE TABLE statements were found.');
  }

  return result;
}
