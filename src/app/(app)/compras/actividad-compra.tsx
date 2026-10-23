"use client";

import { Actividad } from "@/components/actividad/actividad";
import { Badge } from "@/components/ui/badge";
import { Seccion } from "@/components/ui/seccion-ficha";
import type { AccionesActividad } from "@/lib/comentarios/tipos";
import { formatearFecha } from "@/lib/formato";
import { ProductoIcon } from "@/lib/nav-icons";
import {
  alternarReaccion,
  comentarCompra,
  descartarAdjuntoSubido,
  editarComentarioCompra,
  eliminarComentarioCompra,
  obtenerActividadCompra,
  prepararSubidaAdjuntoComentario,
  type ActividadCompra as Datos,
} from "./actions";
import { colorEstado, colorEtapa, etiquetaEstado, etiquetaEtapa } from "./def-compras";
import { CAMPOS_EDITABLES } from "./def-edicion-compras";

/** El nombre de cada dato en la Actividad: los de las celdas de la lista y los demás de la ficha. */
const NOMBRE_CAMPO: Record<string, string> = {
  ...Object.fromEntries(Object.entries(CAMPOS_EDITABLES).map(([clave, def]) => [clave, def.etiqueta])),
  nombre: "Nombre",
  descripcion: "Descripción",
  urlProducto: "URL del producto",
  notaProveedor: "Nota para Chin",
  documentos: "Documentos",
  planificacion: "Planificación",
  agenteEnvio: "Agente de envío",
  pais: "País",
  ventaImportacion: "Tipo de venta",
  productoRelacionado: "Producto relacionado",
  paisesDestino: "Países de destino",
  codigo: "Código",
  registroPagos: "Registro de pagos de Chin",
};
const corto = (t: string | null, max = 120) => (t && t.length > max ? `${t.slice(0, max)}…` : t);

/**
 * Un cambio de la actividad, como en ClickUp: «Etapa: [01 - Cotizar] → [04 - Tracking]», con la etiqueta de cada valor en su
 * color (etapa y estado); otro campo, en texto.
 */
function CambioEvento({ e }: { e: Datos["eventos"][number] }) {
  // Los productos de la orden y la foto se cuentan como una acción; el resto, «Dato: antes → después».
  if (e.campo === "productoAgregado") return <span>Agregó el producto {e.despues}</span>;
  if (e.campo === "productoQuitado") return <span>Quitó el producto {e.antes}</span>;
  if (e.campo === "productoCambiado")
    return (
      <span>
        Cambió {e.antes} <span className="text-muted-foreground">→</span> {e.despues}
      </span>
    );
  if (e.campo === "anulacion") return <span className="text-destructive">Anuló la compra: {e.despues}</span>;
  if (e.campo === "restauracion") return <span>Restauró la compra</span>;
  if (e.campo === "foto") return <span>{e.despues && e.despues !== "—" ? "Cambió la foto del producto" : "Quitó la foto del producto"}</span>;
  const nombre = e.campo === "etapa" ? "Etapa" : e.campo === "estado" ? "Estado" : (NOMBRE_CAMPO[e.campo] ?? e.campo);
  const valor = (v: string | null) => {
    if (v === null) return <span className="text-muted-foreground">—</span>;
    if (e.campo === "etapa") return <Badge color={colorEtapa(v)}>{etiquetaEtapa(v)}</Badge>;
    if (e.campo === "estado") return <Badge color={colorEstado(v)}>{etiquetaEstado(v)}</Badge>;
    return <span className="break-words">{corto(v)}</span>;
  };
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground">{nombre}:</span>
      {e.antes !== null && (
        <>
          {valor(e.antes)}
          <span aria-label="pasó a" className="text-muted-foreground">
            →
          </span>
        </>
      )}
      {valor(e.despues)}
    </span>
  );
}

const ACCIONES: AccionesActividad = {
  bucket: "wms-compras",
  comentar: comentarCompra,
  editar: editarComentarioCompra,
  eliminar: eliminarComentarioCompra,
  reaccionar: alternarReaccion,
  prepararSubida: prepararSubidaAdjuntoComentario,
  descartarSubida: descartarAdjuntoSubido,
};

/** Las subtareas (alternativas de proveedor), arriba de la actividad. */
function Subtareas({ datos }: { datos: Datos }) {
  if (!datos.subtareas.length) return null;
  return (
    <Seccion icono={ProductoIcon} titulo={`Subtareas (${datos.subtareas.length})`}>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
        {datos.subtareas.map((t) => (
          <li key={t.id} className="flex flex-col">
            <span>{t.nombre}</span>
            <span className="text-xs text-muted-foreground">
              {t.estado ?? "—"}
              {t.responsable ? ` · ${t.responsable}` : ""} · {formatearFecha(t.creadoEn)}
            </span>
          </li>
        ))}
      </ul>
    </Seccion>
  );
}

/**
 * La actividad de una compra, al final de su ficha: la Actividad común (`@/components/actividad/actividad`) con las acciones de
 * Compras, sus cambios de etapa y estado en color y las subtareas arriba.
 */
export function ActividadCompra({ id, puedeComentar = true, comentarioResaltado }: { id: string; puedeComentar?: boolean; comentarioResaltado?: string | null }) {
  return (
    <Actividad<Datos>
      id={id}
      obtener={obtenerActividadCompra}
      acciones={ACCIONES}
      puedeComentar={puedeComentar}
      comentarioResaltado={comentarioResaltado}
      renderCambio={(e) => <CambioEvento e={e} />}
      arriba={(d) => <Subtareas datos={d} />}
      placeholder="Escribe un comentario… usa @ para etiquetar a alguien. Empieza con «Inconveniente:» para marcar una falla."
    />
  );
}
