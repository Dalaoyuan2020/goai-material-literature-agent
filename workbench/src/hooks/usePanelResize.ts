import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

interface PanelResizeOptions {
  defaultWidth: number;
  min: number;
  max: number;
  fromRight?: boolean;
}

export function usePanelResize({ defaultWidth, min, max, fromRight = false }: PanelResizeOptions) {
  const [width, setWidth] = useState(defaultWidth);
  const dragging = useRef(false);

  const startResize = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      event.preventDefault();
      dragging.current = true;
      document.body.classList.add('resizing-x');

      const onMove = (moveEvent: MouseEvent) => {
        if (!dragging.current) {
          return;
        }
        const next = fromRight ? window.innerWidth - moveEvent.clientX : moveEvent.clientX;
        setWidth(Math.min(max, Math.max(min, next)));
      };

      const onUp = () => {
        dragging.current = false;
        document.body.classList.remove('resizing-x');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [fromRight, max, min]
  );

  useEffect(() => {
    return () => {
      document.body.classList.remove('resizing-x');
    };
  }, []);

  return { width, startResize };
}
