import type { CambioDropiVista } from "@/lib/publicaciones/cambios-dropi";

const fecha = (iso: string) => new Date(iso).toLocaleString("es-PA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Panama" });

/**
 * Cómo va el último cambio para Dropi (nombre, precio o precio sugerido) de una publicación: cambiado (por el favorito «Aplicar en Dropi»), pendiente, en rojo para que se note (hasta
 * que alguien lo pulse) o con error (el próximo «Aplicar en Dropi» lo vuelve a intentar).
 */
export function EstadoCambioDropi({ c }: { c: CambioDropiVista }) {
  if (c.tipo === "republicar") return <EstadoRepublicar c={c} />;
  if (c.tipo === "apagar") return <EstadoApagar c={c} />;
  if (c.tipo === "archivar") return <EstadoArchivar c={c} />;
  if (c.tipo === "crear") return <EstadoCrear c={c} />;
  const guia = c.nombreGuia ? ` · guía «${c.nombreGuia}»` : "";
  // Qué lleva el cambio: el nombre, el precio y/o el precio sugerido.
  const que = [
    c.nombre ? `«${c.nombre}»${guia}` : "",
    c.precio !== null ? `precio $${c.precio.toFixed(2)}` : "",
    c.precioSugerido !== null ? `sugerido $${c.precioSugerido.toFixed(2)}` : "",
    c.descripcion ? "descripción" : "",
    c.fotos > 0 ? `${c.fotos} ${c.fotos === 1 ? "foto" : "fotos"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
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

/**
 * Cómo va un apagado (migración 0148): hecho (sin stock y archivado en Dropi), pendiente, o con error. Si quedó sin stock pero Dropi no
 * dejó archivar (órdenes pendientes), el motivo viene en `error` y sigue pendiente: cada «Aplicar en Dropi» reintenta el archivado.
 */
function EstadoApagar({ c }: { c: CambioDropiVista }) {
  if (c.estado === "aplicado")
    return (
      <span className="flex items-center gap-1.5 text-xs text-success">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
        Apagado en Dropi el {fecha(c.aplicadoEn ?? c.creadoEn)}: sin stock y archivado.
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 text-xs text-destructive">
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
      {c.error
        ? `${c.estado === "error" ? "No se pudo apagar en Dropi" : "Apagado a medias en Dropi"}: ${c.error} Se reintenta al pulsar «Aplicar en Dropi».`
        : "Apagado pendiente: pulsa «Aplicar en Dropi» con Dropi abierto (saca el stock y archiva)."}
    </span>
  );
}

/** Cómo va un archivado (o una salida de Archivados) en Dropi (migración 0151): hecho, pendiente o con error (se reintenta). */
function EstadoArchivar({ c }: { c: CambioDropiVista }) {
  const que = c.restaurar ? "Sacada de Archivados" : "Archivada";
  if (c.estado === "aplicado")
    return (
      <span className="flex items-center gap-1.5 text-xs text-success">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
        {que} en Dropi el {fecha(c.aplicadoEn ?? c.creadoEn)}.
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 text-xs text-destructive">
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
      {c.estado === "error"
        ? `No se pudo ${c.restaurar ? "sacarla de Archivados" : "archivarla"} en Dropi: ${c.error ?? "sin detalle"} Se vuelve a intentar al pulsar «Aplicar en Dropi».`
        : `${c.restaurar ? "Salir de Archivados" : "Archivar"} pendiente en Dropi: pulsa «Aplicar en Dropi» con Dropi abierto.`}
    </span>
  );
}

/** Cómo va la publicación de un producto nuevo en Dropi (migración 0151): publicada (con su ID), pendiente o con error (se sigue desde donde quedó). */
function EstadoCrear({ c }: { c: CambioDropiVista }) {
  if (c.estado === "aplicado")
    return (
      <span className="flex items-center gap-1.5 text-xs text-success">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
        Publicada en Dropi el {fecha(c.aplicadoEn ?? c.creadoEn)}{c.nuevoDropiId ? ` con el ID ${c.nuevoDropiId}` : ""}.
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 text-xs text-destructive">
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
      {c.estado === "error"
        ? `No se pudo publicar en Dropi${c.nuevoDropiId ? ` (ya se creó el ID ${c.nuevoDropiId})` : ""}: ${c.error ?? "sin detalle"} Se sigue desde ahí al pulsar «Aplicar en Dropi».`
        : "Publicación pendiente en Dropi: pulsa «Aplicar en Dropi» con Dropi abierto."}
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
    <span className="flex items-center gap-1.5 text-xs text-destructive">
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
      {c.estado === "error"
        ? `No se pudo republicar en Dropi: ${c.error ?? "sin detalle"} Se sigue desde ahí al pulsar «Aplicar en Dropi».`
        : "Republicación pendiente: pulsa «Aplicar en Dropi» con Dropi abierto."}
    </span>
  );
}
