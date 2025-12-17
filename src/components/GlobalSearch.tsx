import { useCallback, useEffect, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Search, Table, Columns, X, ChevronDown } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
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
        'w-full text-left px-2 py-1.5 text-xs transition-colors',
        'hover:bg-muted focus:bg-muted focus:outline-none'
      )}
    >
      <div className="flex items-center gap-1.5">
        {result.matchType === 'table' ? (
          <Table className="w-3 h-3 text-blue-500 flex-shrink-0" />
        ) : (
          <Columns className="w-3 h-3 text-purple-500 flex-shrink-0" />
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
  const containerRef = useRef<HTMLDivElement>(null);
  const { setCenter } = useReactFlow();
  const [showResults, setShowResults] = useState(false);
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

  // Focus input when search opens via Ctrl+F
  useEffect(() => {
    if (isSearchOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isSearchOpen]);

  // Show results when there's a query
  useEffect(() => {
    setShowResults(searchQuery.trim().length > 0);
  }, [searchQuery]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
        setShowFilterMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

      setShowResults(false);
    },
    [nodes, setSelectedNode, setCenter]
  );

  const handleClearSearch = useCallback(() => {
    clearSearch();
    setShowResults(false);
    inputRef.current?.focus();
  }, [clearSearch]);

  const handleFilterSelect = useCallback((filter: SearchFilter) => {
    setSearchFilter(filter);
    setShowFilterMenu(false);
    inputRef.current?.focus();
  }, [setSearchFilter]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (showResults) {
        setShowResults(false);
      } else {
        handleClearSearch();
      }
    }
  }, [showResults, handleClearSearch]);

  const handleFocus = useCallback(() => {
    setSearchOpen(true);
    if (searchQuery.trim()) {
      setShowResults(true);
    }
  }, [setSearchOpen, searchQuery]);

  return (
    <div
      ref={containerRef}
      className="absolute top-2 right-44 z-10 pointer-events-auto"
    >
      <div className="flex items-center gap-1">
        {/* Filter dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 text-xs rounded-l',
              'bg-card/90 border border-r-0 border-border',
              'text-muted-foreground hover:text-foreground',
              'backdrop-blur-sm transition-colors'
            )}
          >
            {filterLabels[searchFilter]}
            <ChevronDown className="w-3 h-3" />
          </button>
          {showFilterMenu && (
            <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded shadow-lg overflow-hidden min-w-[80px]">
              {(['all', 'tables', 'columns'] as SearchFilter[]).map((filter) => (
                <button
                  key={filter}
                  onClick={() => handleFilterSelect(filter)}
                  className={cn(
                    'w-full text-left px-2 py-1.5 text-xs transition-colors',
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
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            placeholder="Search..."
            className={cn(
              'w-40 pl-7 pr-7 py-1 text-xs rounded-r',
              'bg-card/90 border border-border',
              'text-foreground placeholder:text-muted-foreground',
              'backdrop-blur-sm shadow-sm',
              'focus:outline-none focus:ring-1 focus:ring-ring'
            )}
          />
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}

          {/* Results dropdown */}
          {showResults && (
            <div className="absolute top-full right-0 mt-1 w-64 max-h-60 overflow-y-auto bg-card border border-border rounded shadow-lg">
              {searchResults.length === 0 ? (
                <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                  No results found
                </div>
              ) : (
                <div>
                  <div className="px-2 py-1 text-[10px] text-muted-foreground border-b border-border">
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
          )}
        </div>
      </div>
    </div>
  );
}
