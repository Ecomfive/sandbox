import type { CambioDropiVista } from "@/lib/publicaciones/cambios-dropi";

const fecha = (iso: string) => new Date(iso).toLocaleString("es-PA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Panama" });

/**
 * Cómo va el último cambio para Dropi (nombre, precio o precio sugerido) de una publicación: cambiado (por el favorito «Aplicar en Dropi»), pendiente, en rojo para que se note (hasta
 * que alguien lo pulse) o con error (el próximo «Aplicar en Dropi» lo vuelve a intentar).
 */
export function EstadoCambioDropi({ c }: { c: CambioDropiVista }) {
  if (c.tipo === "republicar") return <EstadoRepublicar c={c} />;
  const guia = c.nombreGuia ? ` · guía «${c.nombreGuia}»` : "";
  // Qué lleva el cambio: el nombre, el precio y/o el precio sugerido.
  const que = [c.nombre ? `«${c.nombre}»${guia}` : "", c.precio !== null ? `precio $${c.precio.toFixed(2)}` : "", c.precioSugerido !== null ? `sugerido $${c.precioSugerido.toFixed(2)}` : ""].filter(Boolean).join(" · ");
  if (c.estado === "aplicado")
    return (
      <span className="flex items-center gap-1.5 text-xs text-success">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
        Cambiado en Dropi el {fecha(c.aplicadoEn ?? c.creadoEn)} ({que})
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 text-xs text-destructive">
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
      {c.estado === "error"
        ? `No se pudo cambiar en Dropi: ${c.error ?? "sin detalle"} Se vuelve a intentar al pulsar «Aplicar en Dropi».`
        : `Pendiente en Dropi (${que}): pulsa «Aplicar en Dropi» con Dropi abierto.`}
    </span>
  );
}

/** Cómo va una republicación (migración 0145): hecha (con el ID nuevo), pendiente o con error (se sigue desde donde quedó). */
function EstadoRepublicar({ c }: { c: CambioDropiVista }) {
  if (c.estado === "aplicado")
    return (
      <span className="flex items-center gap-1.5 text-xs text-success">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
        Republicada en Dropi el {fecha(c.aplicadoEn ?? c.creadoEn)}{c.nuevoDropiId ? ` como ID ${c.nuevoDropiId}` : ""}: esta quedó archivada y sin stock.
      </span>
    );
  return (
    <span className={`flex items-center gap-1.5 text-xs ${c.estado === "error" ? "text-destructive" : "text-warning"}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.estado === "error" ? "bg-destructive" : "bg-warning"}`} />
      {c.estado === "error"
        ? `No se pudo republicar en Dropi: ${c.error ?? "sin detalle"} Se sigue desde ahí al pulsar «Aplicar en Dropi».`
        : "Republicación pendiente: pulsa «Aplicar en Dropi» con Dropi abierto."}
    </span>
  );
}
