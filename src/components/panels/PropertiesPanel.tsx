import { Plus } from 'lucide-react';
import { useStore } from '@/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ColorPicker } from './ColorPicker';
import { ColumnEditor } from './ColumnEditor';
import { Cardinality, TableNodeData, GroupNodeData, NoteNodeData } from '@/types';

export function PropertiesPanel() {
  const nodes = useStore((state) => state.nodes);
  const edges = useStore((state) => state.edges);
  const selectedNodeId = useStore((state) => state.selectedNodeId);
  const selectedEdgeId = useStore((state) => state.selectedEdgeId);

  // Table actions
  const updateTableName = useStore((state) => state.updateTableName);
  const updateTableColor = useStore((state) => state.updateTableColor);
  const updateTableComment = useStore((state) => state.updateTableComment);
  const addColumn = useStore((state) => state.addColumn);
  const updateColumn = useStore((state) => state.updateColumn);
  const deleteColumn = useStore((state) => state.deleteColumn);

  // Group actions
  const updateGroupName = useStore((state) => state.updateGroupName);
  const updateGroupColor = useStore((state) => state.updateGroupColor);

  // Note actions
  const updateNoteContent = useStore((state) => state.updateNoteContent);
  const updateNoteColor = useStore((state) => state.updateNoteColor);

  // Edge actions
  const updateEdgeCardinality = useStore((state) => state.updateEdgeCardinality);
  const updateEdgeLabel = useStore((state) => state.updateEdgeLabel);
  const updateEdgeColumns = useStore((state) => state.updateEdgeColumns);

  // Find selected node or edge
  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId)
    : null;
  const selectedEdge = selectedEdgeId
    ? edges.find((e) => e.id === selectedEdgeId)
    : null;

  // If nothing is selected
  if (!selectedNode && !selectedEdge) {
    return (
      <div className="w-80 border-l bg-background p-4">
        <p className="text-sm text-muted-foreground">
          Select a node or edge to edit its properties
        </p>
      </div>
    );
  }

  // Render edge properties
  if (selectedEdge) {
    const sourceNode = nodes.find((n) => n.id === selectedEdge.source);
    const targetNode = nodes.find((n) => n.id === selectedEdge.target);

    const sourceColumns =
      sourceNode?.data.type === 'table' ? sourceNode.data.columns : [];
    const targetColumns =
      targetNode?.data.type === 'table' ? targetNode.data.columns : [];

    return (
      <div className="w-80 border-l bg-background">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  Relationship
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Label */}
                <div className="space-y-2">
                  <Label htmlFor="edge-label">Label</Label>
                  <Input
                    id="edge-label"
                    value={selectedEdge.data?.label || ''}
                    onChange={(e) =>
                      updateEdgeLabel(selectedEdge.id, e.target.value)
                    }
                    placeholder="Relationship name"
                  />
                </div>

                {/* Cardinality */}
                <div className="space-y-2">
                  <Label htmlFor="edge-cardinality">Cardinality</Label>
                  <Select
                    value={selectedEdge.data?.cardinality || 'one-to-many'}
                    onValueChange={(value) =>
                      updateEdgeCardinality(selectedEdge.id, value as Cardinality)
                    }
                  >
                    <SelectTrigger id="edge-cardinality">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="one-to-one">One to One</SelectItem>
                      <SelectItem value="one-to-many">One to Many</SelectItem>
                      <SelectItem value="many-to-many">Many to Many</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Source Column */}
                {sourceColumns.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="edge-source-col">Source Column</Label>
                    <Select
                      value={selectedEdge.data?.sourceColumn || ''}
                      onValueChange={(value) =>
                        updateEdgeColumns(
                          selectedEdge.id,
                          value,
                          selectedEdge.data?.targetColumn || ''
                        )
                      }
                    >
                      <SelectTrigger id="edge-source-col">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {sourceColumns.map((col) => (
                          <SelectItem key={col.id} value={col.id}>
                            {col.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Target Column */}
                {targetColumns.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="edge-target-col">Target Column</Label>
                    <Select
                      value={selectedEdge.data?.targetColumn || ''}
                      onValueChange={(value) =>
                        updateEdgeColumns(
                          selectedEdge.id,
                          selectedEdge.data?.sourceColumn || '',
                          value
                        )
                      }
                    >
                      <SelectTrigger id="edge-target-col">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {targetColumns.map((col) => (
                          <SelectItem key={col.id} value={col.id}>
                            {col.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </div>
    );
  }

  // Render node properties based on type
  const nodeData = selectedNode!.data;

  // Table properties
  if (nodeData.type === 'table') {
    const tableData = nodeData as TableNodeData;

    return (
      <div className="w-80 border-l bg-background">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Table</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Table Name */}
                <div className="space-y-2">
                  <Label htmlFor="table-name">Name</Label>
                  <Input
                    id="table-name"
                    value={tableData.name}
                    onChange={(e) =>
                      updateTableName(selectedNode!.id, e.target.value)
                    }
                  />
                </div>

                {/* Color */}
                <div className="space-y-2">
                  <Label>Color</Label>
                  <ColorPicker
                    value={tableData.color}
                    onChange={(color) =>
                      updateTableColor(selectedNode!.id, color)
                    }
                  />
                </div>

                {/* Comment */}
                <div className="space-y-2">
                  <Label htmlFor="table-comment">Comment</Label>
                  <textarea
                    id="table-comment"
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={tableData.comment || ''}
                    onChange={(e) =>
                      updateTableComment(selectedNode!.id, e.target.value)
                    }
                    placeholder="Add a comment..."
                  />
                </div>
              </CardContent>
            </Card>

            <Separator />

            {/* Columns */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Columns</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addColumn(selectedNode!.id)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {tableData.columns.map((column) => (
                  <ColumnEditor
                    key={column.id}
                    column={column}
                    onUpdate={(updates) =>
                      updateColumn(selectedNode!.id, column.id, updates)
                    }
                    onDelete={() =>
                      deleteColumn(selectedNode!.id, column.id)
                    }
                  />
                ))}
                {tableData.columns.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No columns yet
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </div>
    );
  }

  // Group properties
  if (nodeData.type === 'group') {
    const groupData = nodeData as GroupNodeData;

    return (
      <div className="w-80 border-l bg-background">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Group</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Group Name */}
                <div className="space-y-2">
                  <Label htmlFor="group-name">Name</Label>
                  <Input
                    id="group-name"
                    value={groupData.name}
                    onChange={(e) =>
                      updateGroupName(selectedNode!.id, e.target.value)
                    }
                  />
                </div>

                {/* Color */}
                <div className="space-y-2">
                  <Label>Color</Label>
                  <ColorPicker
                    value={groupData.color}
                    onChange={(color) =>
                      updateGroupColor(selectedNode!.id, color)
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </div>
    );
  }

  // Note properties
  if (nodeData.type === 'note') {
    const noteData = nodeData as NoteNodeData;

    return (
      <div className="w-80 border-l bg-background">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Note</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Content */}
                <div className="space-y-2">
                  <Label htmlFor="note-content">Content</Label>
                  <textarea
                    id="note-content"
                    className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={noteData.content}
                    onChange={(e) =>
                      updateNoteContent(selectedNode!.id, e.target.value)
                    }
                    placeholder="Enter note..."
                  />
                </div>

                {/* Color */}
                <div className="space-y-2">
                  <Label>Color</Label>
                  <ColorPicker
                    value={noteData.color}
                    onChange={(color) =>
                      updateNoteColor(selectedNode!.id, color)
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </div>
    );
  }

  return null;
}
