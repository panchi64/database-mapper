/**
 * The thinking behind the connect picker.
 *
 * Kept separate from the dialog because it is all pure: flattening the diagram
 * into pickable options, matching them against a query, and guessing what the
 * user probably meant. The guesses are what make click-to-connect faster than
 * dragging — without them it is just a longer form.
 */
import type { Cardinality, Column, DBNode, TableNode } from '@/types';

export interface ColumnOption {
  nodeId: string;
  nodeType: DBNode['type'];
  tableName: string;
  /** Absent for a whole-node option (notes, and table-level links). */
  columnId?: string;
  columnName?: string;
  dataType?: string;
  isPrimaryKey: boolean;
  isUnique: boolean;
  /** What the search runs against. */
  searchText: string;
}

/**
 * Every endpoint a relationship could attach to.
 *
 * Each table contributes one option per column plus one for the table as a whole;
 * notes contribute only themselves, since a note link has no column.
 */
export function columnOptions(nodes: readonly DBNode[]): ColumnOption[] {
  const options: ColumnOption[] = [];

  for (const node of nodes) {
    if (node.type === 'group') continue;

    if (node.type === 'note') {
      options.push({
        nodeId: node.id,
        nodeType: 'note',
        tableName: node.data.name,
        isPrimaryKey: false,
        isUnique: false,
        searchText: node.data.name.toLowerCase(),
      });
      continue;
    }

    const table = node as TableNode;

    options.push({
      nodeId: table.id,
      nodeType: 'table',
      tableName: table.data.name,
      isPrimaryKey: false,
      isUnique: false,
      searchText: table.data.name.toLowerCase(),
    });

    for (const column of table.data.columns) {
      options.push({
        nodeId: table.id,
        nodeType: 'table',
        tableName: table.data.name,
        columnId: column.id,
        columnName: column.name,
        dataType: column.length ? `${column.dataType}(${column.length})` : column.dataType,
        isPrimaryKey: column.primaryKey,
        isUnique: column.unique,
        searchText: `${table.data.name}.${column.name}`.toLowerCase(),
      });
    }
  }

  return options;
}

/**
 * Subsequence match with a score.
 *
 * Typing `oui` should find `orders.user_id`. Returns null for no match; lower
 * scores are better. Contiguous runs and matches right after a separator score
 * best, which is what makes `users.id` beat `user_settings.description` for `usid`.
 */
export function fuzzyScore(query: string, text: string): number | null {
  if (!query) return 0;

  let score = 0;
  let textIndex = 0;
  let lastMatch = -1;

  for (const char of query) {
    const found = text.indexOf(char, textIndex);
    if (found === -1) return null;

    // Penalise gaps, and reward landing straight after a separator.
    if (lastMatch !== -1) {
      const gap = found - lastMatch - 1;
      score += gap === 0 ? 0 : /[._\s]/.test(text[found - 1]) ? 1 : gap + 1;
    } else {
      score += found;
    }

    lastMatch = found;
    textIndex = found + 1;
  }

  // Prefer shorter candidates when the match quality is otherwise equal.
  return score + text.length * 0.01;
}

export function filterOptions(options: readonly ColumnOption[], query: string): ColumnOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...options];

  return options
    .map((option) => ({ option, score: fuzzyScore(q, option.searchText) }))
    .filter((entry): entry is { option: ColumnOption; score: number } => entry.score !== null)
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.option);
}

/**
 * Guess the cardinality from what the two columns are.
 *
 * A unique or primary-key target means at most one row on that side, so a
 * non-unique source pointing at it is the ordinary one-to-many foreign key. Two
 * unique columns is one-to-one. Neither unique is a join table's own columns, so
 * many-to-many.
 */
export function inferCardinality(source: ColumnOption | null, target: ColumnOption | null): Cardinality {
  const sourceUnique = Boolean(source?.isUnique || source?.isPrimaryKey);
  const targetUnique = Boolean(target?.isUnique || target?.isPrimaryKey);

  if (sourceUnique && targetUnique) return 'one-to-one';
  if (targetUnique) return 'one-to-many';
  if (sourceUnique) return 'one-to-many';
  return 'many-to-many';
}

/** Naive singularisation, enough for the `users` / `user_id` convention. */
function singular(word: string): string {
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('sses')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/**
 * Given a source column, guess what it references.
 *
 * `orders.user_id` almost always means `users.id`. Matching the `<thing>_id`
 * convention turns the common case into a single click.
 */
export function suggestTarget(
  source: ColumnOption,
  options: readonly ColumnOption[]
): ColumnOption | null {
  if (!source.columnName) return null;

  const match = /^(.*)_id$/.exec(source.columnName.toLowerCase());
  if (!match) return null;

  const stem = singular(match[1]);

  const candidates = options.filter(
    (o) => o.columnId && o.nodeId !== source.nodeId && (o.isPrimaryKey || o.isUnique)
  );

  // Prefer an exact table-name hit, then any table whose singular form matches.
  return (
    candidates.find((o) => singular(o.tableName.toLowerCase()) === stem && o.isPrimaryKey) ??
    candidates.find((o) => singular(o.tableName.toLowerCase()) === stem) ??
    null
  );
}

/** The primary key of a table, if it has exactly one obvious one. */
export function primaryKeyOf(nodeId: string, options: readonly ColumnOption[]): ColumnOption | null {
  const keys = options.filter((o) => o.nodeId === nodeId && o.columnId && o.isPrimaryKey);
  return keys.length === 1 ? keys[0] : null;
}

/**
 * Whether two columns are worth warning about.
 *
 * Compares the base type only — `VARCHAR(64)` against `VARCHAR(255)` is a
 * perfectly ordinary foreign key and warning about it would be noise.
 */
export function typesConflict(a: ColumnOption | null, b: ColumnOption | null): boolean {
  if (!a?.dataType || !b?.dataType) return false;

  const base = (t: string) => t.replace(/\(.*\)$/, '').toUpperCase();
  const left = base(a.dataType);
  const right = base(b.dataType);
  if (left === right) return false;

  // Integer widths interoperate freely; a BIGINT key referenced by an INT is a
  // real mistake worth flagging, but INT/INTEGER is not.
  const INTEGERS = new Set(['INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT']);
  if (INTEGERS.has(left) && INTEGERS.has(right)) {
    return left !== right && !(left === 'INT' && right === 'INTEGER') && !(left === 'INTEGER' && right === 'INT');
  }

  return true;
}

/** Column lookup for the properties panel and the picker's prefill. */
export function findOption(
  options: readonly ColumnOption[],
  nodeId: string,
  columnId?: string
): ColumnOption | null {
  return (
    options.find((o) => o.nodeId === nodeId && o.columnId === columnId) ??
    options.find((o) => o.nodeId === nodeId && !o.columnId) ??
    null
  );
}

/** Label as shown in the picker list and the dialog footer. */
export function optionLabel(option: ColumnOption): string {
  return option.columnName ? `${option.tableName}.${option.columnName}` : option.tableName;
}

export type { Column };
