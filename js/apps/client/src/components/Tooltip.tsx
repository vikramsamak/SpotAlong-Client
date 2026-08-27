import { ReactNode, useRef, useState } from 'react';

interface TooltipProps {
  label: ReactNode;
  children: ReactNode;
  placement?: 'top' | 'bottom';
}

export default function Tooltip({ label, children, placement = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const targetRef = useRef<HTMLSpanElement>(null);

  const show = () => {
    const rect = targetRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      x: rect.left + rect.width / 2,
      y: placement === 'top' ? rect.top - 8 : rect.bottom + 8
    });
    setVisible(true);
  };

  return (
    <span
      className="tooltip-host"
      ref={targetRef}
      onMouseEnter={show}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          className={`tooltip tooltip-${placement}`}
          style={{ left: position.x, top: position.y }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
