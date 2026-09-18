export function ProgresoCarga({ mensaje }: { mensaje: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 animate-spin text-foreground" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      {mensaje}
    </div>
  );
}
