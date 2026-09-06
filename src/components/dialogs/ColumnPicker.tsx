/**
 * One searchable pane of the connect dialog.
 *
 * Built from `Input` + `ScrollArea` rather than pulling in cmdk: the list is a
 * flat, already-scored array, and the keyboard handling it needs is arrow keys
 * plus Enter.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyRound, Table2, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { filterOptions, type ColumnOption } from '@/lib/connectSuggestions';

interface Props {
  label: string;
  options: readonly ColumnOption[];
  value: ColumnOption | null;
  onChange: (option: ColumnOption) => void;
  /** Highlighted as the suggested pick, if the caller inferred one. */
  suggestedId?: string;
  autoFocus?: boolean;
}

function optionKey(option: ColumnOption): string {
  return `${option.nodeId}::${option.columnId ?? ''}`;
}

export function ColumnPicker({ label, options, value, onChange, suggestedId, autoFocus }: Props) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => filterOptions(options, query), [options, query]);

  // A new query invalidates the previous highlight position.
  useEffect(() => setActiveIndex(0), [query]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = filtered[activeIndex];
      if (option) onChange(option);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <label className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search tables and columns…"
        autoFocus={autoFocus}
        className="mb-2"
      />

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border"
        role="listbox"
        aria-label={label}
      >
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</p>
        )}

        {filtered.map((option, index) => {
          const key = optionKey(option);
          const selected = value != null && optionKey(value) === key;
          const suggested = suggestedId === key && !selected;

          return (
            <button
              key={key}
              type="button"
              data-index={index}
              role="option"
              aria-selected={selected}
              onClick={() => onChange(option)}
              onMouseEnter={() => setActiveIndex(index)}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
                'border-b border-border last:border-b-0',
                index === activeIndex && 'bg-muted',
                selected && 'bg-primary/10 font-medium'
              )}
            >
              {option.nodeType === 'note' ? (
                <StickyNote className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
              ) : option.columnId ? (
                <span className="w-3.5 flex-shrink-0" />
              ) : (
                <Table2 className="h-3.5 w-3.5 flex-shrink-0 text-blue-500" />
              )}

              <span className="min-w-0 flex-1 truncate">
                {option.columnName ? (
                  <>
                    <span className="text-muted-foreground">{option.tableName}.</span>
                    {option.columnName}
                  </>
                ) : (
                  <span className="font-medium">{option.tableName}</span>
                )}
              </span>

              {option.isPrimaryKey && (
                <KeyRound className="h-3 w-3 flex-shrink-0 text-yellow-500" aria-label="primary key" />
              )}
              {option.dataType && (
                <span className="flex-shrink-0 text-[10px] text-muted-foreground">
                  {option.dataType}
                </span>
              )}
              {suggested && (
                <span className="flex-shrink-0 rounded bg-blue-500/15 px-1 py-0.5 text-[9px] font-semibold text-blue-600 dark:text-blue-300">
                  SUGGESTED
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
