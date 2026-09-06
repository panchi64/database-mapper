/**
 * Create a relationship without dragging.
 *
 * The whole point is that this should be *faster* than dragging, not merely an
 * alternative to it — so it opens with one end already filled in wherever the
 * trigger knew it, suggests the target from the `<thing>_id` naming convention,
 * and infers the cardinality. In the common case the user confirms rather than
 * chooses.
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  columnOptions,
  findOption,
  inferCardinality,
  optionLabel,
  primaryKeyOf,
  suggestTarget,
  typesConflict,
  type ColumnOption,
} from '@/lib/connectSuggestions';
import type { Cardinality } from '@/types';
import { ColumnPicker } from './ColumnPicker';

function optionKey(option: ColumnOption | null): string | undefined {
  return option ? `${option.nodeId}::${option.columnId ?? ''}` : undefined;
}

export function ConnectDialog() {
  const { connect, nodes, closeConnect, createRelationship, setSelectedEdge } = useStore(
    useShallow((s) => ({
      connect: s.connect,
      nodes: s.nodes,
      closeConnect: s.closeConnect,
      createRelationship: s.createRelationship,
      setSelectedEdge: s.setSelectedEdge,
    }))
  );

  const options = useMemo(() => columnOptions(nodes), [nodes]);

  const [source, setSource] = useState<ColumnOption | null>(null);
  const [target, setTarget] = useState<ColumnOption | null>(null);
  const [cardinality, setCardinality] = useState<Cardinality | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-seed each time the dialog opens; the trigger decides what is prefilled.
  useEffect(() => {
    if (!connect.open) return;

    setError(null);
    setCardinality(null);
    setSource(connect.source ? findOption(options, connect.source.nodeId, connect.source.columnId) : null);
    setTarget(connect.target ? findOption(options, connect.target.nodeId, connect.target.columnId) : null);
    // `options` is derived from nodes and stable while the dialog is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connect.open, connect.source, connect.target]);

  const suggestion = useMemo(
    () => (source && !target ? suggestTarget(source, options) : null),
    [source, target, options]
  );

  /**
   * Filling in the target when the source lands.
   *
   * Two levels of help: the naming convention if it applies, otherwise the
   * target table's primary key once a table has been picked without a column.
   */
  const chooseSource = (option: ColumnOption) => {
    setSource(option);
    setError(null);

    if (!target) {
      const guess = suggestTarget(option, options);
      if (guess) setTarget(guess);
    }
  };

  const chooseTarget = (option: ColumnOption) => {
    setError(null);

    // Picking a whole table when it has one obvious key means the key.
    if (!option.columnId && option.nodeType === 'table') {
      setTarget(primaryKeyOf(option.nodeId, options) ?? option);
      return;
    }

    setTarget(option);
  };

  const inferred = inferCardinality(source, target);
  const effectiveCardinality = cardinality ?? inferred;
  const conflict = typesConflict(source, target);

  const submit = () => {
    if (!source || !target) return;

    const id = createRelationship({
      source: { nodeId: source.nodeId, ...(source.columnId ? { columnId: source.columnId } : {}) },
      target: { nodeId: target.nodeId, ...(target.columnId ? { columnId: target.columnId } : {}) },
      cardinality: effectiveCardinality,
    });

    if (!id) {
      // `createRelationship` rejects self-references and exact duplicates.
      setError(
        source.nodeId === target.nodeId && source.columnId === target.columnId
          ? 'A column cannot reference itself.'
          : 'That relationship already exists.'
      );
      return;
    }

    setSelectedEdge(id);
    closeConnect();
  };

  const ready = source !== null && target !== null;

  return (
    <Dialog open={connect.open} onOpenChange={(open) => !open && closeConnect()}>
      <DialogContent className="flex h-[32rem] max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add relationship</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 gap-4">
          <ColumnPicker
            label="From"
            options={options}
            value={source}
            onChange={chooseSource}
            autoFocus
          />
          <div className="flex items-center pt-6 text-muted-foreground">
            <ArrowRight className="h-4 w-4" />
          </div>
          <ColumnPicker
            label="To"
            options={options}
            value={target}
            onChange={chooseTarget}
            suggestedId={optionKey(suggestion)}
          />
        </div>

        <div className="space-y-3 border-t border-border pt-3">
          <div className="flex items-end gap-4">
            <div className="min-w-0 flex-1">
              <Label className="text-xs text-muted-foreground">Relationship</Label>
              <p className="truncate text-sm">
                {source ? optionLabel(source) : <span className="text-muted-foreground">Pick a source</span>}
                <span className="mx-2 text-muted-foreground">→</span>
                {target ? optionLabel(target) : <span className="text-muted-foreground">Pick a target</span>}
              </p>
            </div>

            <div className="w-44 flex-shrink-0">
              <Label htmlFor="connect-cardinality" className="text-xs text-muted-foreground">
                Cardinality
              </Label>
              <Select
                value={effectiveCardinality}
                onValueChange={(v) => setCardinality(v as Cardinality)}
              >
                <SelectTrigger id="connect-cardinality">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one-to-one">One to one</SelectItem>
                  <SelectItem value="one-to-many">One to many</SelectItem>
                  <SelectItem value="many-to-many">Many to many</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {conflict && (
            <p className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              {source?.dataType} and {target?.dataType} are different types — usually a mistake in a
              foreign key.
            </p>
          )}

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={closeConnect}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!ready}>
            Create relationship
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
