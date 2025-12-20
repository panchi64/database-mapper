import { useCallback, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Search, Table, Columns, ChevronDown } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import type { SearchFilter, SearchResult } from '@/types';

// Helper to highlight matching text
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) {
    return <span>{text}</span>;
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();
  const startIndex = lowerText.indexOf(lowerQuery);

  if (startIndex === -1) {
    return <span>{text}</span>;
  }

  const before = text.slice(0, startIndex);
  const match = text.slice(startIndex, startIndex + lowerQuery.length);
  const after = text.slice(startIndex + lowerQuery.length);

  return (
    <span>
      {before}
      <mark className="bg-yellow-300 dark:bg-yellow-600 text-inherit rounded px-0.5">
        {match}
      </mark>
      {after}
    </span>
  );
}

interface SearchResultItemProps {
  result: SearchResult;
  query: string;
  onClick: () => void;
}

function SearchResultItem({ result, query, onClick }: SearchResultItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2 text-sm transition-colors',
        'hover:bg-muted focus:bg-muted focus:outline-none',
        'border-b border-border last:border-b-0'
      )}
    >
      <div className="flex items-center gap-2">
        {result.matchType === 'table' ? (
          <Table className="w-4 h-4 text-blue-500 flex-shrink-0" />
        ) : (
          <Columns className="w-4 h-4 text-purple-500 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          {result.matchType === 'table' ? (
            <span className="font-medium truncate block">
              <HighlightedText text={result.tableName} query={query} />
            </span>
          ) : (
            <span className="truncate block">
              <span className="text-muted-foreground">{result.tableName}.</span>
              <HighlightedText text={result.columnName || ''} query={query} />
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

const filterLabels: Record<SearchFilter, string> = {
  all: 'All',
  tables: 'Tables',
  columns: 'Columns',
};

export function GlobalSearch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { setCenter } = useReactFlow();
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const {
    isSearchOpen,
    searchQuery,
    searchFilter,
    searchResults,
    setSearchOpen,
    setSearchQuery,
    setSearchFilter,
    clearSearch,
    setSelectedNode,
    nodes,
  } = useStore(
    useShallow((state) => ({
      isSearchOpen: state.isSearchOpen,
      searchQuery: state.searchQuery,
      searchFilter: state.searchFilter,
      searchResults: state.searchResults,
      setSearchOpen: state.setSearchOpen,
      setSearchQuery: state.setSearchQuery,
      setSearchFilter: state.setSearchFilter,
      clearSearch: state.clearSearch,
      setSelectedNode: state.setSelectedNode,
      nodes: state.nodes,
    }))
  );

  // Handle auto-focus when dialog opens
  const handleOpenAutoFocus = useCallback((e: Event) => {
    e.preventDefault(); // Prevent default focus behavior
    inputRef.current?.focus();
  }, []);

  const handleResultClick = useCallback(
    (result: SearchResult) => {
      const node = nodes.find((n) => n.id === result.nodeId);
      if (!node) return;

      setSelectedNode(result.nodeId);

      const nodeWidth = (node.style?.width as number) || 250;
      const nodeHeight = (node.style?.height as number) || 200;
      setCenter(
        node.position.x + nodeWidth / 2,
        node.position.y + nodeHeight / 2,
        { zoom: 1, duration: 500 }
      );

      // Close the dialog after navigating
      setSearchOpen(false);
    },
    [nodes, setSelectedNode, setCenter, setSearchOpen]
  );

  const handleFilterSelect = useCallback((filter: SearchFilter) => {
    setSearchFilter(filter);
    setShowFilterMenu(false);
    inputRef.current?.focus();
  }, [setSearchFilter]);

  const handleOpenChange = useCallback((open: boolean) => {
    setSearchOpen(open);
    if (!open) {
      clearSearch();
      setShowFilterMenu(false);
    }
  }, [setSearchOpen, clearSearch]);

  return (
    <Dialog open={isSearchOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md top-[20%] translate-y-0 p-0 gap-0 overflow-hidden"
        onOpenAutoFocus={handleOpenAutoFocus}
        onPointerDownOutside={() => setShowFilterMenu(false)}
      >
        <VisuallyHidden>
          <DialogTitle>Search tables and columns</DialogTitle>
        </VisuallyHidden>

        {/* Search input row */}
        <div className="flex items-center border-b border-border">
          {/* Filter dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className={cn(
                'flex items-center gap-1 px-3 py-3 text-sm',
                'text-muted-foreground hover:text-foreground',
                'border-r border-border transition-colors'
              )}
            >
              {filterLabels[searchFilter]}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showFilterMenu && (
              <div className="absolute top-full left-0 mt-1 bg-popover border border-border rounded shadow-lg overflow-hidden min-w-[100px] z-10">
                {(['all', 'tables', 'columns'] as SearchFilter[]).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => handleFilterSelect(filter)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm transition-colors',
                      'hover:bg-muted',
                      searchFilter === filter && 'bg-muted font-medium'
                    )}
                  >
                    {filterLabels[filter]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search input */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tables and columns..."
              className={cn(
                'w-full pl-10 pr-4 py-3 text-sm',
                'bg-transparent',
                'text-foreground placeholder:text-muted-foreground',
                'focus:outline-none'
              )}
            />
          </div>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {searchQuery.trim() === '' ? (
            <div className="px-4 py-8 text-sm text-muted-foreground text-center">
              Type to search tables and columns
            </div>
          ) : searchResults.length === 0 ? (
            <div className="px-4 py-8 text-sm text-muted-foreground text-center">
              No results found for "{searchQuery}"
            </div>
          ) : (
            <div>
              <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/50">
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
              </div>
              {searchResults.map((result, index) => (
                <SearchResultItem
                  key={`${result.nodeId}-${result.matchType}-${result.columnId || index}`}
                  result={result}
                  query={searchQuery}
                  onClick={() => handleResultClick(result)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border bg-muted/30">
          <span className="opacity-70">Press</span>{' '}
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Esc</kbd>{' '}
          <span className="opacity-70">to close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
