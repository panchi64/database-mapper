import { useCallback, useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Search, Table, Columns, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';
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
        'w-full text-left px-3 py-2 rounded-md transition-colors',
        'hover:bg-muted focus:bg-muted focus:outline-none',
        'border border-transparent hover:border-border'
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
            <div className="font-medium text-sm truncate">
              <HighlightedText text={result.tableName} query={query} />
            </div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground truncate">
                {result.tableName}
              </div>
              <div className="font-medium text-sm truncate">
                <HighlightedText text={result.columnName || ''} query={query} />
              </div>
            </>
          )}
        </div>
        <span
          className={cn(
            'text-[10px] px-1.5 py-0.5 rounded font-medium',
            result.matchType === 'table'
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
              : 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300'
          )}
        >
          {result.matchType === 'table' ? 'Table' : 'Column'}
        </span>
      </div>
    </button>
  );
}

const filterOptions: { value: SearchFilter; label: string; icon: React.ReactNode }[] = [
  { value: 'all', label: 'All', icon: <Search className="w-3 h-3" /> },
  { value: 'tables', label: 'Tables', icon: <Table className="w-3 h-3" /> },
  { value: 'columns', label: 'Columns', icon: <Columns className="w-3 h-3" /> },
];

export function GlobalSearch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { setCenter } = useReactFlow();

  const {
    isSearchOpen,
    searchQuery,
    searchFilter,
    searchResults,
    setSearchOpen,
    setSearchQuery,
    setSearchFilter,
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
      setSelectedNode: state.setSelectedNode,
      nodes: state.nodes,
    }))
  );

  // Focus input when dialog opens
  useEffect(() => {
    if (isSearchOpen) {
      // Small delay to ensure dialog is rendered
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isSearchOpen]);

  const handleResultClick = useCallback(
    (result: SearchResult) => {
      // Find the node
      const node = nodes.find((n) => n.id === result.nodeId);
      if (!node) return;

      // Select the node
      setSelectedNode(result.nodeId);

      // Center viewport on the node
      const nodeWidth = (node.style?.width as number) || 250;
      const nodeHeight = (node.style?.height as number) || 200;
      setCenter(
        node.position.x + nodeWidth / 2,
        node.position.y + nodeHeight / 2,
        { zoom: 1, duration: 500 }
      );

      // Close search dialog
      setSearchOpen(false);
    },
    [nodes, setSelectedNode, setCenter, setSearchOpen]
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    inputRef.current?.focus();
  }, [setSearchQuery]);

  return (
    <Dialog open={isSearchOpen} onOpenChange={setSearchOpen}>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Search className="w-5 h-5" />
            Search Diagram
          </DialogTitle>
        </DialogHeader>

        {/* Search Input */}
        <div className="px-4 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tables and columns..."
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter Buttons */}
          <div className="flex gap-1 mt-3">
            {filterOptions.map((option) => (
              <Button
                key={option.value}
                variant={searchFilter === option.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSearchFilter(option.value)}
                className="flex-1 gap-1"
              >
                {option.icon}
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Results */}
        <ScrollArea className="flex-1 min-h-0 max-h-[400px]">
          <div className="p-2">
            {searchQuery.trim() === '' ? (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Start typing to search</p>
                <p className="text-xs mt-1">
                  Search through table names and column names
                </p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">No results found</p>
                <p className="text-xs mt-1">
                  Try a different search term or filter
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground px-3 py-1">
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                </p>
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
        </ScrollArea>

        {/* Footer with keyboard hint */}
        <div className="px-4 py-2 border-t bg-muted/50 text-xs text-muted-foreground">
          <kbd className="px-1.5 py-0.5 bg-background border rounded text-[10px]">Ctrl+F</kbd>
          <span className="ml-2">to open search</span>
          <span className="mx-2">•</span>
          <kbd className="px-1.5 py-0.5 bg-background border rounded text-[10px]">Esc</kbd>
          <span className="ml-2">to close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
