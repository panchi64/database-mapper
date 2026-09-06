/**
 * Paste DDL, get a diagram.
 *
 * Parses as you type and shows what it found before anything is committed —
 * importing is destructive (it replaces the diagram), so the preview is what
 * makes that safe to click.
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { useStore } from '@/store';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { parseDDL } from '@/engine/sql/parse';
import { describeParse, parsedToDiagram } from '@/engine/sql/toDiagram';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PLACEHOLDER = `CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id)
);`;

export function ImportSqlDialog({ open, onOpenChange }: Props) {
  const importDiagram = useStore((s) => s.importDiagram);
  const [sql, setSql] = useState('');

  // Cheap enough to re-run per keystroke: it is a single pass over the text.
  const parsed = useMemo(() => (sql.trim() ? parseDDL(sql) : null), [sql]);
  const ready = (parsed?.tables.length ?? 0) > 0;

  const submit = () => {
    if (!parsed || !ready) return;

    importDiagram(parsedToDiagram(parsed));
    setSql('');
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSql('');
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex h-[34rem] max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import SQL</DialogTitle>
        </DialogHeader>

        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          placeholder={PLACEHOLDER}
          spellCheck={false}
          className="min-h-0 flex-1 resize-none rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground outline-none focus:border-primary"
        />

        <div className="min-h-[3.5rem] space-y-1 border-t border-border pt-3 text-xs">
          {!parsed && (
            <p className="text-muted-foreground">
              Paste <code>CREATE TABLE</code> statements. Indexes, grants and anything else
              that isn&apos;t schema shape are ignored.
            </p>
          )}

          {parsed && ready && (
            <p className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <Check className="h-3.5 w-3.5 flex-shrink-0" />
              {describeParse(parsed)}
            </p>
          )}

          {parsed && !ready && (
            <p className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              No tables found.
            </p>
          )}

          {parsed && parsed.errors.length > 0 && (
            <ul className="max-h-24 space-y-0.5 overflow-y-auto text-muted-foreground">
              {parsed.errors.slice(0, 8).map((error, i) => (
                <li key={i}>• {error}</li>
              ))}
              {parsed.errors.length > 8 && <li>• …and {parsed.errors.length - 8} more</li>}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!ready}>
            Replace diagram
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
