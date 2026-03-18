export default function StatusBar({ message, error }) {
  if (!message) return null;
  return (
    <div className={`status${error ? ' error' : ''}`}>{message}</div>
  );
}
