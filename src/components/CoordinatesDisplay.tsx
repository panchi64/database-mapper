import { useViewport, useReactFlow } from '@xyflow/react';
import { useState, useRef, useEffect } from 'react';

export function CoordinatesDisplay() {
  // useViewport triggers re-render on viewport changes
  const viewport = useViewport();
  const { setCenter } = useReactFlow();

  // Get the actual React Flow canvas dimensions
  const reactFlowContainer = document.querySelector('.react-flow') as HTMLElement;
  const canvasWidth = reactFlowContainer?.offsetWidth ?? window.innerWidth;
  const canvasHeight = reactFlowContainer?.offsetHeight ?? window.innerHeight;

  // Calculate the center of the canvas in flow coordinates
  const centerX = (-viewport.x + canvasWidth / 2) / viewport.zoom;
  const centerY = (-viewport.y + canvasHeight / 2) / viewport.zoom;

  // State for editing mode
  const [editingX, setEditingX] = useState(false);
  const [editingY, setEditingY] = useState(false);
  const [inputX, setInputX] = useState('');
  const [inputY, setInputY] = useState('');

  // Refs for input elements
  const inputXRef = useRef<HTMLInputElement>(null);
  const inputYRef = useRef<HTMLInputElement>(null);

  // Auto-focus and select text when entering edit mode
  useEffect(() => {
    if (editingX && inputXRef.current) {
      inputXRef.current.focus();
      inputXRef.current.select();
    }
  }, [editingX]);

  useEffect(() => {
    if (editingY && inputYRef.current) {
      inputYRef.current.focus();
      inputYRef.current.select();
    }
  }, [editingY]);

  // Handle click on X coordinate
  const handleClickX = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent React Flow from capturing the click
    setInputX(Math.round(centerX).toString());
    setEditingX(true);
  };

  // Handle click on Y coordinate
  const handleClickY = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent React Flow from capturing the click
    setInputY(Math.round(centerY).toString());
    setEditingY(true);
  };

  // Apply X coordinate change
  const applyX = () => {
    const newX = parseFloat(inputX);
    if (!isNaN(newX) && newX !== Math.round(centerX)) {
      setCenter(newX, Math.round(centerY), { duration: 300 });
    }
    setEditingX(false);
  };

  // Apply Y coordinate change
  const applyY = () => {
    const newY = parseFloat(inputY);
    if (!isNaN(newY) && newY !== Math.round(centerY)) {
      setCenter(Math.round(centerX), newY, { duration: 300 });
    }
    setEditingY(false);
  };

  // Handle X input keyboard events
  const handleXKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      applyX();
    } else if (e.key === 'Escape') {
      setEditingX(false);
    }
  };

  // Handle Y input keyboard events
  const handleYKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      applyY();
    } else if (e.key === 'Escape') {
      setEditingY(false);
    }
  };

  return (
    <div className="absolute top-2 right-2 px-2 py-1 bg-card/90 border border-border rounded text-xs text-muted-foreground font-mono backdrop-blur-sm shadow-sm z-10 pointer-events-auto">
      <span>X: </span>
      {editingX ? (
        <input
          ref={inputXRef}
          type="text"
          value={inputX}
          onChange={(e) => setInputX(e.target.value)}
          onBlur={applyX}
          onKeyDown={handleXKeyDown}
          className="inline-block w-16 bg-transparent border-b border-primary focus:outline-none"
        />
      ) : (
        <span
          onClick={handleClickX}
          className="cursor-pointer hover:text-foreground hover:underline"
        >
          {Math.round(centerX)}
        </span>
      )}
      <span>, Y: </span>
      {editingY ? (
        <input
          ref={inputYRef}
          type="text"
          value={inputY}
          onChange={(e) => setInputY(e.target.value)}
          onBlur={applyY}
          onKeyDown={handleYKeyDown}
          className="inline-block w-16 bg-transparent border-b border-primary focus:outline-none"
        />
      ) : (
        <span
          onClick={handleClickY}
          className="cursor-pointer hover:text-foreground hover:underline"
        >
          {Math.round(centerY)}
        </span>
      )}
    </div>
  );
}
