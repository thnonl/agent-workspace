import { useEffect, useRef } from 'react';

/** Pointer cursor while the mouse is over a clickable 3D object (reset when it leaves or the object unmounts). */
export function usePointerCursor() {
  const over = useRef(false);
  useEffect(
    () => () => {
      if (over.current) document.body.style.cursor = '';
    },
    [],
  );
  return {
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      over.current = true;
      document.body.style.cursor = 'pointer';
    },
    onPointerOut: () => {
      if (!over.current) return;
      over.current = false;
      document.body.style.cursor = '';
    },
  };
}
