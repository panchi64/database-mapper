/**
 * Turning a parsed schema into a diagram.
 *
 * Positions come from the auto-layout: an import that dropped forty tables at
 * the origin would be worse than useless.
 */
import { v4 as uuidv4 } from 'uuid';
import { METRICS, intrinsicTableSize, type TextMeasurer } from '../geometry';
import { layeredLayout } from '../layout/layered';
import type { Column, DBEdge, DBNode, DiagramState, TableNode, TableNodeData } from '@/types';
import type { ParseResult } from './parse';

/**
 * Fallback text metrics for when there is no canvas to measure with.
 *
 * Slightly generous: under-measuring ships tables whose column names render
 * truncated, which reads as a rendering fault rather than a narrow table.
 */
const ESTIMATED: TextMeasurer = {
  measure: (text, font) =>
    text.length * (font.includes('14px') ? 8.4 : font.includes('11px') ? 6.6 : 7.8),
};

/** Colour tables by rank so an imported schema is not a wall of grey. */
const PALETTE = ['blue', 'green', 'orange', 'purple', 'pink', 'yellow', 'red', 'slate'];

export interface ToDiagramOptions {
  measurer?: TextMeasurer;
  /** Skip the layout pass, e.g. when the caller will place the tables itself. */
  layout?: boolean;
}

export function parsedToDiagram(
  parsed: ParseResult,
  options: ToDiagramOptions = {}
): DiagramState {
  const { measurer = ESTIMATED, layout = true } = options;

  const nodes: TableNode[] = [];
  // Parsed names are the only identity SQL gives us; ids are ours.
  const tableIds = new Map<string, string>();
  const columnIds = new Map<string, string>();

  parsed.tables.forEach((table, index) => {
    const id = uuidv4();
    tableIds.set(table.name, id);

    const columns: Column[] = table.columns.map((parsedColumn) => {
      const columnId = uuidv4();
      columnIds.set(`${table.name}.${parsedColumn.name}`, columnId);

      return {
        id: columnId,
        name: parsedColumn.name,
        dataType: parsedColumn.dataType,
        ...(parsedColumn.length ? { length: parsedColumn.length } : {}),
        nullable: parsedColumn.nullable,
        primaryKey: parsedColumn.primaryKey,
        unique: parsedColumn.unique,
        autoIncrement: parsedColumn.autoIncrement,
        ...(parsedColumn.defaultValue ? { defaultValue: parsedColumn.defaultValue } : {}),
        ...(parsedColumn.comment ? { comment: parsedColumn.comment } : {}),
      };
    });

    const data: TableNodeData = {
      type: 'table',
      name: table.name,
      columns,
      color: PALETTE[index % PALETTE.length],
      ...(table.comment ? { comment: table.comment } : {}),
    };

    const size = intrinsicTableSize(data, measurer);

    nodes.push({
      id,
      type: 'table',
      x: 0,
      y: 0,
      w: size.w,
      h: size.h,
      z: 1,
      data,
    });
  });

  const edges: DBEdge[] = [];

  for (const fk of parsed.foreignKeys) {
    const fromNode = tableIds.get(fk.fromTable);
    const toNode = tableIds.get(fk.toTable);
    const fromColumn = columnIds.get(`${fk.fromTable}.${fk.fromColumn}`);
    const toColumn = columnIds.get(`${fk.toTable}.${fk.toColumn}`);

    // The parser already dropped keys to unknown tables; this catches unknown
    // *columns*, which happens with quoting quirks and composite keys.
    if (!fromNode || !toNode || !fromColumn || !toColumn) continue;

    const target = nodes.find((n) => n.id === toNode);
    const targetColumn = target?.data.columns.find((c) => c.id === toColumn);

    edges.push({
      id: uuidv4(),
      source: { nodeId: fromNode, columnId: fromColumn },
      target: { nodeId: toNode, columnId: toColumn },
      data: {
        type: 'relationship',
        // Referencing a key means one row on that side.
        cardinality: targetColumn?.unique || targetColumn?.primaryKey ? 'one-to-many' : 'many-to-many',
        isNoteLink: false,
      },
    });
  }

  // Foreign keys are derived on the columns too, matching what the store does.
  const withForeignKeys: DBNode[] = nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      columns: node.data.columns.map((column) => {
        const edge = edges.find((e) => e.source.columnId === column.id);
        if (!edge?.target.columnId) return column;
        return {
          ...column,
          foreignKey: { tableId: edge.target.nodeId, columnId: edge.target.columnId },
        };
      }),
    },
  }));

  if (!layout || withForeignKeys.length === 0) {
    return { nodes: withForeignKeys, edges };
  }

  const positions = layeredLayout(withForeignKeys, edges, { rankSep: METRICS.gridSnap * 10 });

  return {
    nodes: withForeignKeys.map((node) => {
      const at = positions.get(node.id);
      return at ? { ...node, x: at.x, y: at.y } : node;
    }),
    edges,
  };
}

/** A one-line summary for the import dialog's preview. */
export function describeParse(parsed: ParseResult): string {
  const columns = parsed.tables.reduce((n, t) => n + t.columns.length, 0);
  const parts = [
    `${parsed.tables.length} table${parsed.tables.length === 1 ? '' : 's'}`,
    `${columns} column${columns === 1 ? '' : 's'}`,
    `${parsed.foreignKeys.length} relationship${parsed.foreignKeys.length === 1 ? '' : 's'}`,
  ];

  if (parsed.errors.length > 0) {
    parts.push(`${parsed.errors.length} warning${parsed.errors.length === 1 ? '' : 's'}`);
  }

  return parts.join(', ');
}
