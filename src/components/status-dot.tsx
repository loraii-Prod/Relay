export function StatusDot({ state = "ok" }: { state?: "ok" | "warn" | "bad" | "idle" }) {
  return <span className={`status-dot ${state}`} aria-hidden="true" />;
}
