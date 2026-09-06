/**
 * Reading and writing `.json` diagram files.
 *
 * Two things matter here:
 *
 * 1. **Old files keep working, forever.** Every diagram exported before this
 *    refactor is raw React Flow JSON with no version field at all. Those are
 *    detected and run through the same migration chain as localStorage, so a file
 *    someone saved months ago still opens.
 * 2. **Files are validated.** The previous importer did `JSON.parse(...) as
 *    DiagramState` and set the result straight into the store, so a malformed file
 *    could put the app into a state it could not render.
 */
import { runMigrations, type LegacyPersistedShape } from '@/store/migrations';
import { isRecord, sanitizeDiagram } from './diagramValidation';
import type { DBEdge, DBNode, DiagramState } from '@/types';

/** Bumped alongside the persisted schema version. */
export const DIAGRAM_FILE_VERSION = 3;

export interface DiagramFile {
  app: 'db-mapper';
  formatVersion: number;
  nodes: DBNode[];
  edges: DBEdge[];
}

export interface ParseResult {
  diagram: DiagramState;
  /** Non-fatal problems: entries that were dropped, fields that were defaulted. */
  warnings: string[];
}

export class DiagramParseError extends Error {}

export function serializeDiagram(state: DiagramState): DiagramFile {
  return {
    app: 'db-mapper',
    formatVersion: DIAGRAM_FILE_VERSION,
    nodes: state.nodes,
    edges: state.edges,
  };
}

/**
 * Work out which schema a file was written against.
 *
 * Files carrying `formatVersion` say so. Anything else predates versioning, so we
 * start the chain at 0 — the early migrations skip fields that are already set, so
 * running them against v1 or v2 data is harmless.
 */
function detectVersion(raw: Record<string, unknown>): number {
  const declared = raw.formatVersion;
  return typeof declared === 'number' ? declared : 0;
}

/**
 * Turn the contents of a `.json` file into a diagram.
 *
 * Throws `DiagramParseError` when the file clearly isn't a diagram. Individual
 * malformed nodes or edges are dropped and reported through `warnings` instead,
 * so one bad edge doesn't cost the user the whole schema.
 */
export function parseDiagramFile(raw: unknown): ParseResult {
  if (!isRecord(raw)) {
    throw new DiagramParseError('File does not contain a JSON object.');
  }

  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) {
    throw new DiagramParseError('File is missing its "nodes" and "edges" arrays.');
  }

  const version = detectVersion(raw);
  const warnings: string[] = [];

  let migrated: { nodes: DBNode[]; edges: DBEdge[] };
  try {
    const legacy: LegacyPersistedShape = {
      nodes: raw.nodes as LegacyPersistedShape['nodes'],
      edges: raw.edges as LegacyPersistedShape['edges'],
      theme: 'system', // A file never carries the user's theme preference.
    };
    migrated = version < DIAGRAM_FILE_VERSION
      ? runMigrations(legacy, version)
      : { nodes: raw.nodes as DBNode[], edges: raw.edges as DBEdge[] };
  } catch (error) {
    throw new DiagramParseError(
      `Could not upgrade this diagram from format ${version}: ${(error as Error).message}`
    );
  }

  if (version < DIAGRAM_FILE_VERSION) {
    warnings.push(`Upgraded from an older diagram format (v${version}).`);
  }

  const sanitized = sanitizeDiagram(migrated.nodes, migrated.edges);
  const { nodes, edges } = sanitized;
  warnings.push(...sanitized.warnings);


  return { diagram: { nodes, edges }, warnings };
}
