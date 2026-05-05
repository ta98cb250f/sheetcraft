import { useEffect, useRef, useState } from 'react';

export type SubMenuItem = {
  label: string;
  action: () => void;
  disabled?: boolean;
  html?: boolean;
};

export type MenuItem =
  | { type: 'item'; label: string; action: () => void; disabled?: boolean }
  | { type: 'submenu'; label: string; items: SubMenuItem[]; disabled?: boolean }
  | { type: 'separator' };

type Props = {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
};

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [openSubmenu, setOpenSubmenu] = useState<number | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // ビューポートからはみ出さないよう位置を調整
  const adjustedX = Math.min(x, window.innerWidth - 180);
  const adjustedY = Math.min(y, window.innerHeight - 40 * items.length);

  return (
    <div ref={ref} style={{ ...styles.menu, top: adjustedY, left: adjustedX }} onContextMenu={(e) => e.preventDefault()}>
      {items.map((item, i) => {
        if (item.type === 'separator') {
          return <div key={i} style={styles.separator} />;
        }
        if (item.type === 'submenu') {
          return (
            <div key={i} style={{ position: 'relative' }}
              onMouseEnter={() => setOpenSubmenu(i)}
              onMouseLeave={() => setOpenSubmenu(null)}>
              <div style={{ ...styles.item, ...(item.disabled ? styles.disabled : {}), justifyContent: 'space-between' }}>
                <span>{item.label}</span>
                <span style={{ fontSize: 10, marginLeft: 8 }}>▶</span>
              </div>
              {openSubmenu === i && !item.disabled && (
                <div style={styles.submenu}>
                  {item.items.map((sub, j) => (
                    <div key={j}
                      style={{ ...styles.item, ...(sub.disabled ? styles.disabled : {}) }}
                      onClick={() => { if (!sub.disabled) { sub.action(); onClose(); } }}
                      dangerouslySetInnerHTML={sub.html ? { __html: sub.label } : undefined}>
                      {!sub.html ? sub.label : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }
        return (
          <div key={i}
            style={{ ...styles.item, ...(item.disabled ? styles.disabled : {}) }}
            onClick={() => { if (!item.disabled) { item.action(); onClose(); } }}>
            {item.label}
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  menu: {
    position: 'fixed',
    zIndex: 9999,
    background: '#fff',
    border: '1px solid #ccc',
    borderRadius: 4,
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    minWidth: 160,
    fontSize: 13,
    userSelect: 'none',
  },
  submenu: {
    position: 'absolute',
    top: 0,
    left: '100%',
    background: '#fff',
    border: '1px solid #ccc',
    borderRadius: 4,
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    minWidth: 140,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 12px',
    cursor: 'pointer',
    color: '#222',
    whiteSpace: 'nowrap',
  },
  disabled: {
    color: '#aaa',
    cursor: 'default',
  },
  separator: {
    borderTop: '1px solid #eee',
    margin: '3px 0',
  },
};
