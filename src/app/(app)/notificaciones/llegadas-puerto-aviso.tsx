import { anilloFoco } from "@/components/ui/field";

/** Las llegadas a puerto que se juntan en un solo aviso de «Para ti» (24 nov 2026; desde el 26 nov solo el resumen: lo que llegó se ve al entrar). */
export interface LlegadasEnAvisos {
  /** Los avisos «Llega a puerto» que este reemplaza. */
  avisoIds: string[];
  sinLeer: number;
  /** Cuándo cayó el más reciente. */
  creadoEn: string;
  /** Lo que sigue por recibir (sin archivar). */
  compras: number;
  unidades: number;
  cajas: number;
  sinCajas: number;
  /** A «Llegadas a puerto», con el periodo que alcanza a todo lo pendiente. */
  href: string;
}

const entero = (n: number) => n.toLocaleString("es-PA");
const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-PA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Panama" });

export function tituloDeLlegadas(d: LlegadasEnAvisos): string {
  if (d.compras === 0) return "Llegadas a puerto: todo recibido y archivado";
  return `Llegadas a puerto: ${entero(d.compras)} ${d.compras === 1 ? "compra" : "compras"} · ${entero(d.unidades)} unidades · ${entero(d.cajas)} cajas${d.sinCajas ? ` (${entero(d.sinCajas)} sin anotar)` : ""}`;
}

/** Se ve como cualquier aviso; al pulsarlo se entra a «Llegadas a puerto», con la lista por lotes, las descargas y el archivo. */
export function LlegadasPuertoAviso({ datos, pendiente, alAbrir }: { datos: LlegadasEnAvisos; pendiente: boolean; alAbrir: () => void }) {
  const sinLeer = datos.sinLeer > 0;
  return (
    <button type="button" disabled={pendiente} onClick={alAbrir} className={`flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-muted ${sinLeer ? "bg-primario-suave" : ""} ${anilloFoco}`}>
      <span className="flex items-start gap-2 text-sm">
        {sinLeer && <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primario" />}
        <span className={sinLeer ? "font-medium" : ""}>{tituloDeLlegadas(datos)}</span>
        {sinLeer && <span className="sr-only">(sin leer)</span>}
      </span>
      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {fechaHora(datos.creadoEn)}
        <span className="rounded-md border border-border-control bg-card px-2 py-0.5 font-medium text-foreground">Ver lo que llegó</span>
      </span>
    </button>
  );
}
