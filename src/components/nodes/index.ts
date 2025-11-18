import { TableNode } from './TableNode';
import { GroupNode } from './GroupNode';
import { NoteNode } from './NoteNode';

export { TableNode, GroupNode, NoteNode };

// Node types object for React Flow
export const nodeTypes = {
  table: TableNode,
  group: GroupNode,
  note: NoteNode,
} as const;
