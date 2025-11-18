import { cn } from '@/lib/utils';
import { PRESET_COLORS } from '@/types';
import { Check } from 'lucide-react';

interface ColorPickerProps {
  value?: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {PRESET_COLORS.map((color) => (
        <button
          key={color.name}
          type="button"
          className={cn(
            'h-8 w-8 rounded-md border-2 flex items-center justify-center transition-all',
            'hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            value === color.name
              ? 'border-foreground'
              : 'border-transparent'
          )}
          style={{ backgroundColor: color.value }}
          onClick={() => onChange(color.name)}
          title={color.name}
        >
          {value === color.name && (
            <Check className="h-4 w-4 text-white drop-shadow-md" />
          )}
        </button>
      ))}
    </div>
  );
}
