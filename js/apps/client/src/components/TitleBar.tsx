import { Music2 } from 'lucide-react';

export default function TitleBar() {
  return (
    <header className="titlebar-drag">
      <span className="titlebar-brand">
        <Music2 size={16} />
        SpotAlong
      </span>
    </header>
  );
}
