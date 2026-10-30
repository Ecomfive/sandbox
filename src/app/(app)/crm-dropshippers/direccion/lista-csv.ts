import { ETIQUETA_SEGMENTO } from "@/lib/crm/salud";
import { celdaCsv } from "@/lib/tabla/csv";
import { contactosParaLista } from "./actions";
import type { FilaDireccion } from "./datos-direccion";

const TIPO: Record<string, string> = { vip: "VIP", black: "BLACK", regular: "Regular" };

/**
 * Descarga la lista de un segmento para una difusión (fase 3): un CSV con cada dropshipper, su estado, salud y pedidos, y su correo y
 * WhatsApp (el número solo si quien la pide puede verlo). No envía nada. `extra` agrega una columna (p. ej. sus pedidos de un producto).
 */
export async function descargarLista(
  filas: FilaDireccion[],
  segmento: string,
  archivo: string,
  extra?: { titulo: string; valor: (f: FilaDireccion) => string | number },
): Promise<{ ok: true; conTelefono: boolean } | { error: string }> {
  const r = await contactosParaLista(
    filas.map((f) => f.id),
    segmento,
  );
  if ("error" in r) return r;
  const contacto = new Map(r.contactos.map((c) => [c.id, c]));
  const encabezado = ["Código", "Dropshipper", "Estado", "Salud", "Tipo", "Pedidos 30 días", "Último pedido", "Lo lleva", ...(extra ? [extra.titulo] : []), "Correo", ...(r.conTelefono ? ["WhatsApp"] : [])];
  const lineas = [encabezado.map(celdaCsv).join(",")];
  for (const f of filas) {
    const c = contacto.get(f.id);
    lineas.push(
      [
        f.codigo,
        f.nombre,
        ETIQUETA_SEGMENTO[f.segmento],
        f.salud.puntaje,
        TIPO[f.nivel] ?? f.nivel,
        f.pedidos30,
        f.ultimoPedido,
        f.responsable,
        ...(extra ? [extra.valor(f)] : []),
        c?.correo,
        ...(r.conTelefono ? [c?.telefono] : []),
      ]
        .map(celdaCsv)
        .join(","),
    );
  }
  const blob = new Blob(["﻿" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${archivo}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return { ok: true, conTelefono: r.conTelefono };
}
