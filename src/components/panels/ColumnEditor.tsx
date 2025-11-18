import { Trash2 } from 'lucide-react';
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
import { Column, SQL_DATA_TYPES, ColumnDataType } from '@/types';

interface ColumnEditorProps {
  column: Column;
  onUpdate: (updates: Partial<Column>) => void;
  onDelete: () => void;
}

export function ColumnEditor({ column, onUpdate, onDelete }: ColumnEditorProps) {
  // Determine if the data type needs a length parameter
  const needsLength = ['VARCHAR', 'CHAR', 'NVARCHAR', 'NCHAR', 'BINARY', 'VARBINARY', 'DECIMAL', 'NUMERIC'].includes(column.dataType);

  return (
    <div className="space-y-3 p-3 border rounded-md bg-muted/50">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Column</Label>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
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
          placeholder="NULL"
          className="h-8 text-sm"
        />
      </div>

      {/* Boolean Properties */}
      <div className="grid grid-cols-2 gap-2">
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
      </div>
    </div>
  );
}
