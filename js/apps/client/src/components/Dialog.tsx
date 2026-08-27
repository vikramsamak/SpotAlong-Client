import { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface DialogProps {
  title: string;
  description?: ReactNode;
  acceptLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onAccept: () => void;
  onCancel: () => void;
}

export default function Dialog({
  title,
  description,
  acceptLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onAccept,
  onCancel
}: DialogProps) {
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <AlertTriangle size={18} className={danger ? 'dialog-icon danger' : 'dialog-icon'} />
          <h3>{title}</h3>
        </div>
        {description && <div className="dialog-description">{description}</div>}
        <div className="dialog-actions">
          <button className="dialog-button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={`dialog-button primary${danger ? ' danger' : ''}`} onClick={onAccept}>
            {acceptLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
