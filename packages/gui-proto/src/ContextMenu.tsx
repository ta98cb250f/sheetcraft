import { useEffect, useRef } from 'react';

export type ContextMenuItem =
  | { type: 'item'; label: string; action: () => void; danger?: boolean }
  | { type: 'separator' };

type Props = {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
};

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const left = Math.min(x, window.innerWidth - 200);
  const top = Math.min(y, window.innerHeight - items.length * 32 - 8);

  return (
    <div
      ref={ref}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        top,
        left,
        zIndex: 9999,
        background: '#fff',
        border: '1px solid #ccc',
        borderRadius: 4,
        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        minWidth: 180,
        fontSize: 13,
        userSelect: 'none',
        padding: '4px 0',
      }}
    >
      {items.map((item, i) =>
        item.type === 'separator' ? (
          <div key={i} style={{ borderTop: '1px solid #eee', margin: '4px 0' }} />
        ) : (
          <div
            key={i}
            onClick={() => {
              item.action();
              onClose();
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f5f5')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '')}
            style={{
              padding: '6px 14px',
              cursor: 'pointer',
              color: item.danger ? '#c62828' : '#222',
              whiteSpace: 'nowrap',
            }}
          >
            {item.label}
          </div>
        )
      )}
    </div>
  );
}
