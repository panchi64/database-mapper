import { useState } from 'react';
import { Trash2, ChevronDown, ChevronRight, Key, Link, Fingerprint } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Column, SQL_DATA_TYPES, ColumnDataType } from '@/types';

interface ColumnEditorProps {
  column: Column;
  onUpdate: (updates: Partial<Column>) => void;
  onDelete: () => void;
  defaultExpanded?: boolean;
}

export function ColumnEditor({ column, onUpdate, onDelete, defaultExpanded = false }: ColumnEditorProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Determine if the data type needs a length parameter
  const needsLength = ['VARCHAR', 'CHAR', 'NVARCHAR', 'NCHAR', 'BINARY', 'VARBINARY', 'DECIMAL', 'NUMERIC'].includes(column.dataType);

  const handleDelete = () => {
    if (confirmDelete) {
      onDelete();
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      // Auto-reset after 3 seconds
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  // Collapsed view
  if (!isExpanded) {
    return (
      <div className="flex items-center justify-between p-2 border rounded-md bg-muted/30 hover:bg-muted/50">
        <button
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-2 flex-1 text-left"
        >
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm truncate">{column.name}</span>
          <span className="text-xs text-muted-foreground">{column.dataType}</span>
          <div className="flex gap-1 ml-auto">
            {column.primaryKey && <Key className="h-3 w-3 text-yellow-500" />}
            {column.foreignKey && <Link className="h-3 w-3 text-blue-500" />}
            {column.unique && !column.primaryKey && <Fingerprint className="h-3 w-3 text-purple-500" />}
          </div>
        </button>
        <Button
          variant={confirmDelete ? "destructive" : "ghost"}
          size="icon"
          className="h-6 w-6"
          onClick={handleDelete}
          onBlur={() => setConfirmDelete(false)}
        >
          {confirmDelete ? (
            <span className="text-xs">Yes?</span>
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
        </Button>
      </div>
    );
  }

  // Expanded view
  return (
    <div className="space-y-3 p-3 border rounded-md bg-muted/50">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(false)}
          className="flex items-center gap-2 text-sm font-medium"
        >
          <ChevronDown className="h-4 w-4" />
          {column.name || 'Column'}
        </button>
        <Button
          variant={confirmDelete ? "destructive" : "ghost"}
          size="icon"
          className="h-6 w-6"
          onClick={handleDelete}
          onBlur={() => setConfirmDelete(false)}
        >
          {confirmDelete ? (
            <span className="text-xs">Yes?</span>
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
        </Button>
      </div>

      {/* Column Name */}
      <div className="space-y-1">
        <Label htmlFor={`col-name-${column.id}`} className="text-xs">
          Name
        </Label>
        <Input
          id={`col-name-${column.id}`}
          value={column.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="e.g., user_id, email"
          className="h-8 text-sm"
        />
      </div>

      {/* Data Type */}
      <div className="space-y-1">
        <Label htmlFor={`col-type-${column.id}`} className="text-xs">
          Data Type
        </Label>
        <Select
          value={column.dataType}
          onValueChange={(value) => onUpdate({ dataType: value as ColumnDataType })}
        >
          <SelectTrigger id={`col-type-${column.id}`} className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SQL_DATA_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Length */}
      {needsLength && (
        <div className="space-y-1">
          <Label htmlFor={`col-length-${column.id}`} className="text-xs">
            Length
          </Label>
          <Input
            id={`col-length-${column.id}`}
            type="number"
            value={column.length || ''}
            onChange={(e) =>
              onUpdate({ length: e.target.value ? parseInt(e.target.value, 10) : undefined })
            }
            className="h-8 text-sm"
          />
        </div>
      )}

      {/* Default Value */}
      <div className="space-y-1">
        <Label htmlFor={`col-default-${column.id}`} className="text-xs">
          Default Value
        </Label>
        <Input
          id={`col-default-${column.id}`}
          value={column.defaultValue || ''}
          onChange={(e) =>
            onUpdate({ defaultValue: e.target.value || undefined })
          }
          placeholder="e.g., 0, 'active'"
          className="h-8 text-sm"
        />
      </div>

      {/* Boolean Properties with improved layout */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Constraints</div>
        <div className="space-y-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-between">
                  <Label htmlFor={`col-pk-${column.id}`} className="text-xs">
                    Primary Key
                  </Label>
                  <Switch
                    id={`col-pk-${column.id}`}
                    checked={column.primaryKey}
                    onCheckedChange={(checked) => onUpdate({ primaryKey: checked })}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Uniquely identifies each row in the table</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-between">
                  <Label htmlFor={`col-unique-${column.id}`} className="text-xs">
                    Unique
                  </Label>
                  <Switch
                    id={`col-unique-${column.id}`}
                    checked={column.unique}
                    onCheckedChange={(checked) => onUpdate({ unique: checked })}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>All values in this column must be distinct</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="text-xs font-medium text-muted-foreground pt-2">Behavior</div>
        <div className="space-y-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-between">
                  <Label htmlFor={`col-nullable-${column.id}`} className="text-xs">
                    Nullable
                  </Label>
                  <Switch
                    id={`col-nullable-${column.id}`}
                    checked={column.nullable}
                    onCheckedChange={(checked) => onUpdate({ nullable: checked })}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Column can contain NULL values</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-between">
                  <Label htmlFor={`col-auto-${column.id}`} className="text-xs">
                    Auto Inc.
                  </Label>
                  <Switch
                    id={`col-auto-${column.id}`}
                    checked={column.autoIncrement}
                    onCheckedChange={(checked) => onUpdate({ autoIncrement: checked })}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Automatically increment value for new rows</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
