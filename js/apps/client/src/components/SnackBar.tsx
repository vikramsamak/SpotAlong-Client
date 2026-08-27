import { useSpotAlongStore } from '../store/useSpotAlongStore';

export default function SnackBar() {
  const snackbar = useSpotAlongStore((s) => s.snackbar);

  if (!snackbar) return null;

  return (
    <div className={`snackbar snackbar-${snackbar.kind}`} key={snackbar.id}>
      {snackbar.text}
    </div>
  );
}
