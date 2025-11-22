import { memo } from 'react';
import {
  getBezierPath,
  EdgeLabelRenderer,
  BaseEdge,
  Position,
} from '@xyflow/react';
import { Cardinality, RelationshipEdgeData } from '@/types';
import { cn } from '@/lib/utils';

// Helper functions to determine marker types based on cardinality
function getSourceType(cardinality?: Cardinality): 'one' | 'many' {
  if (cardinality === 'many-to-many') return 'many';
  return 'one';
}

function getTargetType(cardinality?: Cardinality): 'one' | 'many' {
  if (cardinality === 'one-to-one') return 'one';
  return 'many'; // one-to-many and many-to-many both have 'many' on target
}

// Map edge color to HSL/hex string for SVG stroke
function getEdgeColorHSL(color?: string, selected?: boolean): string {
  if (selected) return 'hsl(var(--primary))';

  switch (color) {
    case 'slate': return '#64748b';
    case 'red': return '#ef4444';
    case 'orange': return '#f97316';
    case 'yellow': return '#eab308';
    case 'green': return '#22c55e';
    case 'blue': return '#3b82f6';
    case 'purple': return '#a855f7';
    case 'pink': return '#ec4899';
    default: return 'hsl(var(--muted-foreground))';
  }
}

// Map edge pattern to strokeDasharray value
function getEdgePattern(pattern?: string, isNoteLink?: boolean): string | undefined {
  // Priority: explicit pattern > note link default > solid
  if (pattern) {
    switch (pattern) {
      case 'solid': return undefined;
      case 'dashed': return '4 4';
      case 'dotted': return '1 3';
      case 'dash-dot': return '8 4 2 4';
      default: return undefined;
    }
  }

  // Fallback to note link behavior
  return isNoteLink ? '4 4' : undefined;
}

// Calculate the angle for marker rotation based on position
function getMarkerRotation(position: Position): number {
  switch (position) {
    case Position.Top:
      return 90;
    case Position.Bottom:
      return -90;
    case Position.Left:
      return 0;
    case Position.Right:
      return 180;
    default:
      return 0;
  }
}

// Get the offset direction for marker placement
function getMarkerOffset(position: Position): { dx: number; dy: number } {
  const offset = 8; // Distance from edge endpoint
  switch (position) {
    case Position.Top:
      return { dx: 0, dy: -offset };
    case Position.Bottom:
      return { dx: 0, dy: offset };
    case Position.Left:
      return { dx: -offset, dy: 0 };
    case Position.Right:
      return { dx: offset, dy: 0 };
    default:
      return { dx: 0, dy: 0 };
  }
}

interface CrowsFootMarkerProps {
  x: number;
  y: number;
  position: Position;
  type: 'one' | 'many';
  color: string; // HSL color string
}

const CrowsFootMarker = ({ x, y, position, type, color }: CrowsFootMarkerProps) => {
  const rotation = getMarkerRotation(position);
  const { dx, dy } = getMarkerOffset(position);
  const markerX = x + dx;
  const markerY = y + dy;

  const strokeColor = color;
  const strokeWidth = 2;

  if (type === 'one') {
    // Render a perpendicular line for "one" side: |
    return (
      <g transform={`translate(${markerX}, ${markerY}) rotate(${rotation})`}>
        <line
          x1={0}
          y1={-6}
          x2={0}
          y2={6}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </g>
    );
  }

  // Render crow's foot for "many" side: <
  return (
    <g transform={`translate(${markerX}, ${markerY}) rotate(${rotation})`}>
      {/* Three lines spreading out like < */}
      <line
        x1={0}
        y1={0}
        x2={8}
        y2={-6}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <line
        x1={0}
        y1={0}
        x2={8}
        y2={0}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <line
        x1={0}
        y1={0}
        x2={8}
        y2={6}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </g>
  );
};

interface RelationshipEdgeProps {
  id: string;
  source: string;
  target: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  data?: RelationshipEdgeData;
  selected?: boolean;
  style?: React.CSSProperties;
}

export const RelationshipEdge = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  style,
}: RelationshipEdgeProps) => {
  /**
   * Read isNoteLink from edge data to determine rendering style.
   *
   * This value is set when edges are created (onConnect action) and prevents
   * race conditions that occurred when looking up nodes from the store during
   * render. The migration system (see useStore.ts persist config) ensures old
   * saved diagrams are automatically upgraded to include this field.
   *
   * - true: Renders as dashed line (note connection) by default
   * - false/undefined: Renders as solid line with cardinality markers (table relationship)
   */
  const isNoteLink = data?.isNoteLink ?? false;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const sourceType = getSourceType(data?.cardinality);
  const targetType = getTargetType(data?.cardinality);

  // Get color and pattern from data, with fallbacks
  const edgeColor = data?.color;
  const edgePattern = data?.pattern;

  const strokeDasharray = getEdgePattern(edgePattern, isNoteLink);
  const edgeStrokeColor = getEdgeColorHSL(edgeColor, selected);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          strokeWidth: selected ? 2.5 : (isNoteLink ? 1.5 : 2),
          strokeDasharray,
          stroke: edgeStrokeColor, // Apply color to both edge line and markers
        }}
      />

      {/* Custom SVG layer for markers - only show for table relationships */}
      {!isNoteLink && (
        <svg
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            overflow: 'visible',
          }}
        >
          {/* Source marker (one or many) */}
          <CrowsFootMarker
            x={sourceX}
            y={sourceY}
            position={sourcePosition}
            type={sourceType}
            color={edgeStrokeColor}
          />

          {/* Target marker (one or many) */}
          <CrowsFootMarker
            x={targetX}
            y={targetY}
            position={targetPosition}
            type={targetType}
            color={edgeStrokeColor}
          />
        </svg>
      )}

      {/* Label */}
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className={cn(
              'px-2 py-1 bg-background border rounded text-xs shadow-sm',
              'nodrag nopan cursor-pointer',
              selected && 'border-primary ring-1 ring-primary'
            )}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

RelationshipEdge.displayName = 'RelationshipEdge';
