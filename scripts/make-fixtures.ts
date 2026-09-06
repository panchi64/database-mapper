/**
 * Generates the diagram fixtures in `fixtures/`.
 *
 * Hand-writing these as JSON means hand-writing hundreds of ids and keeping every
 * derived height in step with `METRICS` by eye. Generating them keeps the files
 * correct by construction, and lets the stress fixture be regenerated at whatever
 * size the perf budget currently targets.
 *
 *   bun run scripts/make-fixtures.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  METRICS,
  intrinsicTableSize,
  type TextMeasurer,
} from '../src/engine/geometry';
import type {
  Cardinality,
  Column,
  ColumnDataType,
  DBEdge,
  DBNode,
  DiagramState,
  GroupNode,
  NoteNode,
  RelationshipEdgeData,
  TableNode,
  TableNodeData,
} from '../src/types';

/**
 * Approximate text metrics, since there is no canvas here.
 *
 * Deliberately generous: this only sets the *initial* width, and under-measuring
 * would ship a fixture whose column names render truncated — which reads as a
 * rendering bug rather than a too-narrow table. A little slack costs nothing.
 */
const measurer: TextMeasurer = {
  measure: (text, font) =>
    text.length * (font.includes('14px') ? 8.4 : font.includes('11px') ? 6.6 : 7.8),
};

// --- Builders ---------------------------------------------------------------

type ColumnSpec = string;

/**
 * Compact column syntax: `name:TYPE(len)` plus flags.
 *   `!` primary key   `*` unique   `?` nullable   `+` auto-increment
 * e.g. `id:BIGINT!+`, `email:VARCHAR(255)*`, `deleted_at:TIMESTAMP?`
 */
function parseColumn(spec: ColumnSpec, tableId: string, index: number): Column {
  const flags = { pk: spec.includes('!'), uniq: spec.includes('*'), nul: spec.includes('?'), inc: spec.includes('+') };
  const clean = spec.replace(/[!*?+]/g, '');

  const [name, typePart = 'INT'] = clean.split(':');
  const match = /^([A-Z]+)(?:\((\d+)\))?$/.exec(typePart);

  return {
    id: `${tableId}.${name}`,
    name,
    dataType: (match?.[1] ?? 'INT') as ColumnDataType,
    ...(match?.[2] ? { length: Number(match[2]) } : {}),
    nullable: flags.nul,
    primaryKey: flags.pk,
    unique: flags.uniq || flags.pk,
    autoIncrement: flags.inc,
    ...(index === -1 ? {} : {}),
  };
}

interface TableSpec {
  id: string;
  x: number;
  y: number;
  color?: string;
  comment?: string;
  columns: ColumnSpec[];
}

function makeTable(spec: TableSpec): TableNode {
  const data: TableNodeData = {
    type: 'table',
    name: spec.id,
    columns: spec.columns.map((c, i) => parseColumn(c, spec.id, i)),
    ...(spec.color ? { color: spec.color } : {}),
    ...(spec.comment ? { comment: spec.comment } : {}),
  };

  const size = intrinsicTableSize(data, measurer);

  return { id: spec.id, type: 'table', x: spec.x, y: spec.y, w: size.w, h: size.h, z: 1, data };
}

interface EdgeSpec {
  from: string; // "table.column"
  to: string;
  cardinality?: Cardinality;
  label?: string;
  color?: RelationshipEdgeData['color'];
  pattern?: RelationshipEdgeData['pattern'];
}

function makeEdge(spec: EdgeSpec, index: number): DBEdge {
  const [fromTable] = spec.from.split('.');
  const [toTable] = spec.to.split('.');

  return {
    id: `e${index}`,
    source: { nodeId: fromTable, columnId: spec.from },
    target: { nodeId: toTable, columnId: spec.to },
    data: {
      type: 'relationship',
      cardinality: spec.cardinality ?? 'one-to-many',
      isNoteLink: false,
      ...(spec.label ? { label: spec.label } : {}),
      ...(spec.color ? { color: spec.color } : {}),
      ...(spec.pattern ? { pattern: spec.pattern } : {}),
    },
  };
}

/** Foreign keys are derived from the edges, exactly as the store does it. */
function applyForeignKeys(nodes: DBNode[], edges: DBEdge[]): DBNode[] {
  const fks = new Map<string, { tableId: string; columnId: string }>();
  for (const edge of edges) {
    if (edge.data.isNoteLink) continue;
    if (!edge.source.columnId || !edge.target.columnId) continue;
    fks.set(edge.source.columnId, { tableId: edge.target.nodeId, columnId: edge.target.columnId });
  }

  return nodes.map((node) => {
    if (node.type !== 'table') return node;
    return {
      ...node,
      data: {
        ...node.data,
        columns: node.data.columns.map((c) => {
          const fk = fks.get(c.id);
          return fk ? { ...c, foreignKey: fk } : c;
        }),
      },
    };
  });
}

function write(name: string, diagram: DiagramState): void {
  const dir = resolve(process.cwd(), 'fixtures');
  mkdirSync(dir, { recursive: true });

  const file = {
    app: 'db-mapper' as const,
    formatVersion: 3,
    nodes: diagram.nodes,
    edges: diagram.edges,
  };

  const path = resolve(dir, name);
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);

  const tables = diagram.nodes.filter((n) => n.type === 'table').length;
  const columns = diagram.nodes.reduce(
    (n, node) => n + (node.type === 'table' ? node.data.columns.length : 0),
    0
  );
  console.log(
    `  fixtures/${name}  ${tables} tables, ${columns} columns, ${diagram.edges.length} relationships`
  );
}

// --- The e-commerce fixture -------------------------------------------------
// Laid out in clusters that deliberately force edges across the diagram, so the
// readability work has something real to chew on.

function ecommerce(): DiagramState {
  const tables: TableSpec[] = [
    // Accounts
    {
      id: 'users', x: -960, y: -120, color: 'blue',
      comment: 'Registered customers and staff',
      columns: ['id:BIGINT!+', 'email:VARCHAR(255)*', 'password_hash:VARCHAR(255)', 'full_name:VARCHAR(120)', 'phone:VARCHAR(32)?', 'is_active:BOOLEAN', 'created_at:TIMESTAMP', 'updated_at:TIMESTAMP'],
    },
    {
      id: 'addresses', x: -960, y: 260, color: 'blue',
      columns: ['id:BIGINT!+', 'user_id:BIGINT', 'line1:VARCHAR(200)', 'line2:VARCHAR(200)?', 'city:VARCHAR(100)', 'region:VARCHAR(100)?', 'postal_code:VARCHAR(20)', 'country:CHAR(2)', 'is_default:BOOLEAN'],
    },

    // Catalog
    {
      id: 'categories', x: -480, y: -420, color: 'green',
      comment: 'Self-referencing tree',
      columns: ['id:INT!+', 'parent_id:INT?', 'name:VARCHAR(120)', 'slug:VARCHAR(140)*', 'position:SMALLINT'],
    },
    {
      id: 'products', x: -480, y: -120, color: 'green',
      comment: 'One row per sellable item',
      columns: ['id:BIGINT!+', 'category_id:INT', 'sku:VARCHAR(64)*', 'name:VARCHAR(200)', 'description:TEXT?', 'price:DECIMAL(10)', 'cost:DECIMAL(10)?', 'is_active:BOOLEAN', 'created_at:TIMESTAMP'],
    },
    {
      id: 'product_images', x: -480, y: 320, color: 'green',
      columns: ['id:BIGINT!+', 'product_id:BIGINT', 'url:VARCHAR(500)', 'alt_text:VARCHAR(200)?', 'position:SMALLINT'],
    },
    {
      id: 'product_variants', x: -40, y: -120, color: 'green',
      columns: ['id:BIGINT!+', 'product_id:BIGINT', 'sku:VARCHAR(64)*', 'name:VARCHAR(120)', 'price_delta:DECIMAL(10)', 'barcode:VARCHAR(64)?'],
    },

    // Fulfilment
    {
      id: 'warehouses', x: 460, y: -480, color: 'orange',
      columns: ['id:INT!+', 'code:VARCHAR(16)*', 'name:VARCHAR(120)', 'address_id:BIGINT'],
    },
    {
      id: 'inventory', x: 420, y: -180, color: 'orange',
      comment: 'Stock level per variant per warehouse',
      columns: ['id:BIGINT!+', 'variant_id:BIGINT', 'warehouse_id:INT', 'quantity:INT', 'reserved:INT', 'updated_at:TIMESTAMP'],
    },
    {
      id: 'shipments', x: 940, y: 200, color: 'purple',
      columns: ['id:BIGINT!+', 'order_id:BIGINT', 'warehouse_id:INT', 'carrier:VARCHAR(60)', 'tracking_number:VARCHAR(80)?', 'shipped_at:TIMESTAMP?', 'delivered_at:TIMESTAMP?'],
    },

    // Commerce
    {
      id: 'orders', x: 420, y: 200, color: 'red',
      comment: 'Placed orders, any status',
      columns: ['id:BIGINT!+', 'user_id:BIGINT', 'shipping_address_id:BIGINT', 'billing_address_id:BIGINT', 'status:VARCHAR(24)', 'subtotal:DECIMAL(12)', 'tax:DECIMAL(12)', 'shipping:DECIMAL(12)', 'total:DECIMAL(12)', 'placed_at:TIMESTAMP'],
    },
    {
      id: 'order_items', x: -40, y: 320, color: 'red',
      columns: ['id:BIGINT!+', 'order_id:BIGINT', 'variant_id:BIGINT', 'quantity:INT', 'unit_price:DECIMAL(10)', 'line_total:DECIMAL(12)'],
    },
    {
      id: 'payments', x: 940, y: -140, color: 'purple',
      columns: ['id:BIGINT!+', 'order_id:BIGINT', 'method:VARCHAR(32)', 'amount:DECIMAL(12)', 'status:VARCHAR(24)', 'transaction_ref:VARCHAR(120)*', 'processed_at:TIMESTAMP?'],
    },

    // Engagement
    {
      id: 'reviews', x: -960, y: 700, color: 'yellow',
      columns: ['id:BIGINT!+', 'product_id:BIGINT', 'user_id:BIGINT', 'rating:SMALLINT', 'title:VARCHAR(160)?', 'body:TEXT', 'created_at:TIMESTAMP'],
    },
    {
      id: 'cart_items', x: -440, y: 700, color: 'pink',
      columns: ['id:BIGINT!+', 'user_id:BIGINT', 'variant_id:BIGINT', 'quantity:INT', 'added_at:TIMESTAMP'],
    },

    // Promotions
    {
      id: 'coupons', x: 480, y: 700, color: 'slate',
      columns: ['id:INT!+', 'code:VARCHAR(40)*', 'discount_type:VARCHAR(16)', 'discount_value:DECIMAL(10)', 'valid_from:DATE', 'valid_until:DATE', 'max_uses:INT?'],
    },
    {
      id: 'order_coupons', x: 940, y: 700, color: 'slate',
      columns: ['id:BIGINT!+', 'order_id:BIGINT', 'coupon_id:INT', 'amount_applied:DECIMAL(10)'],
    },
  ];

  const edgeSpecs: EdgeSpec[] = [
    { from: 'addresses.user_id', to: 'users.id' },
    { from: 'categories.parent_id', to: 'categories.id', label: 'parent', cardinality: 'one-to-many' },
    { from: 'products.category_id', to: 'categories.id' },
    { from: 'product_images.product_id', to: 'products.id' },
    { from: 'product_variants.product_id', to: 'products.id' },
    { from: 'inventory.variant_id', to: 'product_variants.id' },
    { from: 'inventory.warehouse_id', to: 'warehouses.id', color: 'orange' },
    { from: 'warehouses.address_id', to: 'addresses.id', color: 'orange', pattern: 'dashed' },
    { from: 'orders.user_id', to: 'users.id', color: 'red' },
    { from: 'orders.shipping_address_id', to: 'addresses.id', label: 'ship to', color: 'red' },
    { from: 'orders.billing_address_id', to: 'addresses.id', label: 'bill to', color: 'red', pattern: 'dotted' },
    { from: 'order_items.order_id', to: 'orders.id' },
    { from: 'order_items.variant_id', to: 'product_variants.id' },
    { from: 'payments.order_id', to: 'orders.id', cardinality: 'one-to-one', color: 'purple' },
    { from: 'shipments.order_id', to: 'orders.id', color: 'purple' },
    { from: 'shipments.warehouse_id', to: 'warehouses.id', color: 'purple', pattern: 'dash-dot' },
    { from: 'reviews.product_id', to: 'products.id', color: 'yellow' },
    { from: 'reviews.user_id', to: 'users.id', color: 'yellow' },
    { from: 'cart_items.user_id', to: 'users.id', color: 'pink' },
    { from: 'cart_items.variant_id', to: 'product_variants.id', color: 'pink' },
    { from: 'order_coupons.order_id', to: 'orders.id' },
    { from: 'order_coupons.coupon_id', to: 'coupons.id', cardinality: 'many-to-many' },
  ];

  const groups: GroupNode[] = [
    {
      id: 'g-catalog', type: 'group', x: -560, y: -510, w: 800, h: 1010, z: 0,
      data: { type: 'group', name: 'Catalog', color: 'green' },
    },
    {
      id: 'g-fulfilment', type: 'group', x: 340, y: -560, w: 400, h: 500, z: 0,
      data: { type: 'group', name: 'Fulfilment', color: 'orange' },
    },
  ];

  const notes: NoteNode[] = [
    {
      id: 'n-money', type: 'note', x: 940, y: 440, w: 280, h: 130, z: 2,
      data: {
        type: 'note',
        name: 'Money columns',
        content: 'All amounts are DECIMAL, never FLOAT. Stored in the order currency; conversion happens at read time.',
        color: 'purple',
      },
    },
    {
      id: 'n-inventory', type: 'note', x: 40, y: -520, w: 260, h: 120, z: 2,
      data: {
        type: 'note',
        name: 'Reserved stock',
        content: '`reserved` covers carts and unfulfilled orders. Available = quantity - reserved.',
        color: 'orange',
      },
    },
  ];

  const tableNodes = tables.map(makeTable);
  const edges = edgeSpecs.map(makeEdge);

  // Notes attach to the node as a whole, with no column.
  const noteEdges: DBEdge[] = [
    {
      id: 'e-note-1',
      source: { nodeId: 'n-money' },
      target: { nodeId: 'payments' },
      data: { type: 'relationship', isNoteLink: true, pattern: 'dashed' },
    },
    {
      id: 'e-note-2',
      source: { nodeId: 'n-inventory' },
      target: { nodeId: 'inventory' },
      data: { type: 'relationship', isNoteLink: true, pattern: 'dashed' },
    },
  ];

  const allEdges = [...edges, ...noteEdges];
  const nodes = applyForeignKeys([...groups, ...tableNodes, ...notes], allEdges);

  return { nodes, edges: allEdges };
}

// --- The stress fixture -----------------------------------------------------

/** A grid of tables wired into a chain plus some long-range edges. */
function stress(tableCount = 300): DiagramState {
  const perRow = Math.ceil(Math.sqrt(tableCount));
  const colX = 460;
  const rowY = 420;
  const palette = ['slate', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];

  const tables: TableNode[] = [];
  for (let i = 0; i < tableCount; i++) {
    const columnCount = 4 + (i % 7);
    tables.push(
      makeTable({
        id: `table_${String(i).padStart(3, '0')}`,
        x: (i % perRow) * colX,
        y: Math.floor(i / perRow) * rowY,
        color: palette[i % palette.length],
        columns: [
          'id:BIGINT!+',
          'ref_id:BIGINT',
          ...Array.from({ length: columnCount }, (_, c) => `field_${c}:VARCHAR(120)${c % 3 === 0 ? '?' : ''}`),
          'created_at:TIMESTAMP',
        ],
      })
    );
  }

  const edges: DBEdge[] = [];
  for (let i = 1; i < tables.length; i++) {
    // Chain each table to its predecessor...
    edges.push(
      makeEdge({ from: `${tables[i].id}.ref_id`, to: `${tables[i - 1].id}.id` }, edges.length)
    );
    // ...plus a long-range edge every few tables, to force real routing work.
    if (i % 5 === 0) {
      const target = tables[(i * 7) % tables.length];
      if (target.id !== tables[i].id) {
        edges.push(makeEdge({ from: `${tables[i].id}.ref_id`, to: `${target.id}.id` }, edges.length));
      }
    }
  }

  return { nodes: applyForeignKeys(tables, edges), edges };
}

// --- Legacy fixture ---------------------------------------------------------

/**
 * The same diagram in the shape the pre-refactor React Flow build wrote:
 * `position` + `style`, handle-string edge endpoints, no version field, and the
 * runtime fields it used to persist by accident.
 *
 * Exists so the import path can be exercised by hand, not just by unit test.
 */
function toLegacyFormat(diagram: DiagramState): unknown {
  const nodes = diagram.nodes.map((node) => {
    const base = {
      id: node.id,
      type: node.type,
      position: { x: node.x, y: node.y },
      style: { width: node.w, height: node.h },
      zIndex: node.z,
      // React Flow wrote these into localStorage; the migration must drop them.
      measured: { width: node.w, height: node.h },
      selected: false,
      dragging: false,
      data: node.type === 'table'
        ? {
            ...node.data,
            // v2 had no derived foreign keys — the migration backfills them.
            columns: node.data.columns.map(({ foreignKey: _fk, ...rest }) => rest),
          }
        : node.data,
    };
    return base;
  });

  const edges = diagram.edges.map((edge) => ({
    id: edge.id,
    source: edge.source.nodeId,
    target: edge.target.nodeId,
    sourceHandle: edge.source.columnId ? `${edge.source.columnId}-right` : 'bottom',
    targetHandle: edge.target.columnId ? `${edge.target.columnId}-left` : 'top',
    type: 'relationship',
    data: {
      type: 'relationship',
      cardinality: edge.data.cardinality,
      label: edge.data.label,
      isNoteLink: edge.data.isNoteLink,
      color: edge.data.color,
      pattern: edge.data.pattern,
      // v2 duplicated the columns onto data as well as the handles.
      sourceColumn: edge.source.columnId,
      targetColumn: edge.target.columnId,
    },
  }));

  return { nodes, edges };
}

function writeRaw(name: string, contents: unknown, note: string): void {
  const dir = resolve(process.cwd(), 'fixtures');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, name), `${JSON.stringify(contents, null, 2)}\n`);
  console.log(`  fixtures/${name}  ${note}`);
}

// --- Run --------------------------------------------------------------------

console.log('Writing fixtures...');

const shop = ecommerce();
write('ecommerce.json', shop);
write('stress-300-tables.json', stress(300));
writeRaw(
  'legacy-reactflow-export.json',
  toLegacyFormat(shop),
  'the same diagram in the old React Flow format (tests the migration path)'
);

console.log('\nLoad one from the toolbar, or drop it onto the canvas.');
console.log(`Row height ${METRICS.rowH}px, header ${METRICS.headerH}px.`);
