export interface CuentaEliminada {
  id: string;
  nombre: string;
  fechaTexto: string;
  usuario: string | null;
}

/** Debajo de la tabla: qué cuentas destino se eliminaron y cuándo — la fila ya no existe en
 * `cuentas_retiro` (se borra de verdad, no se desactiva), así que esto es lo único que queda. */
export function HistorialEliminadas({ eventos }: { eventos: CuentaEliminada[] }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Cuentas eliminadas</h2>
      {eventos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no se ha eliminado ninguna cuenta destino.</p>
      ) : (
        <ol className="flex flex-col gap-3 text-sm">
          {eventos.map((e) => (
            <li key={e.id} className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
              <div>
                <p>
                  {e.nombre}
                  {e.usuario && <span className="text-muted-foreground"> — eliminada por {e.usuario}</span>}
                </p>
                <p className="text-xs text-muted-foreground">{e.fechaTexto}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
