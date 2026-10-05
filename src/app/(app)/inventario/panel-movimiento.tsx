"use client";

import { useState, type ComponentType } from "react";
import { BotonAccion } from "@/components/ui/boton-accion";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { FlechaAbajoIcon, FlechaArribaIcon, InventarioIcon, LapizIcon } from "@/lib/nav-icons";
import { registrarMovimientoStock, type LoteStock } from "./stock-actions";

export interface BodegaOpcion {
  id: string;
  nombre: string;
}
export interface UbicacionOpcion {
  id: string;
  bodegaId: string;
  codigo: string;
  propiedad: string;
}

const ETIQUETA_PROPIEDAD: Record<string, string> = { normal: "", danado: " · dañado", inspeccion: " · en inspección", retenido: " · retenido" };

const CONFIG: Record<"entrada" | "salida" | "ajuste", { titulo: string; boton: string; crear: string; exito: string; icono: ComponentType<{ className?: string }> }> = {
  entrada: { titulo: "Entrada de inventario", boton: "Entrada", crear: "Registrar entrada", exito: "Entrada registrada", icono: FlechaAbajoIcon },
  salida: { titulo: "Salida de inventario", boton: "Salida", crear: "Registrar salida", exito: "Salida registrada", icono: FlechaArribaIcon },
  ajuste: { titulo: "Ajuste de inventario", boton: "Ajuste", crear: "Registrar ajuste", exito: "Ajuste registrado", icono: LapizIcon },
};

/**
 * Una entrada, una salida o un ajuste del físico de un SKU en una bodega propia (las externas, como Dropi, no aceptan
 * movimientos a mano). El saldo puede quedar negativo: no se bloquea la salida. El ajuste lleva signo y pide motivo.
 */
export function PanelMovimiento({
  skuId,
  tipo,
  bodegas,
  ubicaciones,
  manejaVencimiento = false,
  lotes = [],
  alGuardar,
}: {
  skuId: string;
  tipo: "entrada" | "salida" | "ajuste";
  /** El producto se mueve por lote: la entrada pide lote y fecha de vencimiento, el ajuste el lote, y la salida puede nombrarlo. */
  manejaVencimiento?: boolean;
  /** Los lotes con unidades del producto (para elegir uno en una salida o un ajuste). */
  lotes?: LoteStock[];
  bodegas: BodegaOpcion[];
  ubicaciones: UbicacionOpcion[];
  alGuardar: () => void;
}) {
  const c = CONFIG[tipo];
  const [bodega, setBodega] = useState(bodegas[0]?.id ?? "");
  const delasUbicaciones = ubicaciones.filter((u) => u.bodegaId === bodega);
  const lotesDeBodega = lotes.filter((l) => l.bodegaId === bodega);
  // En una entrada se puede escribir un lote nuevo o repetir uno existente; en una salida o ajuste se elige uno existente.
  const lotePorTexto = tipo === "entrada";
  return (
    <FichaCrear
      titulo={c.titulo}
      etiquetaCrear={c.crear}
      action={registrarMovimientoStock}
      mensajeExito={c.exito}
      ocultos={{ sku_id: skuId, tipo }}
      puedeExtra={bodegas.length > 0}
      alGuardar={alGuardar}
      boton={(abrir) => (
        <BotonAccion icono={c.icono} onClick={abrir} aria-haspopup="dialog">
          {c.boton}
        </BotonAccion>
      )}
    >
      {({ faltante, invalido }) => (
        <Seccion icono={InventarioIcon} titulo="Movimiento">
          <Campo etiqueta="Bodega" id="campo-bodega-mov" obligatorio faltante={faltante}>
            <select
              id="campo-bodega-mov"
              name="bodega_id"
              required
              data-enfocar
              aria-invalid={invalido("campo-bodega-mov")}
              value={bodega}
              onChange={(e) => setBodega(e.target.value)}
              className={`${fieldClass} w-full`}
            >
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre}
                </option>
              ))}
            </select>
          </Campo>
          {delasUbicaciones.length > 0 && (
            <Campo etiqueta="Ubicación (opcional)" id="campo-ubicacion-mov">
              <select id="campo-ubicacion-mov" name="ubicacion_id" defaultValue="" key={bodega} className={`${fieldClass} w-full`}>
                <option value="">Sin ubicación</option>
                {delasUbicaciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo}
                    {ETIQUETA_PROPIEDAD[u.propiedad] ?? ""}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          {manejaVencimiento && lotePorTexto && (
            <>
              <Campo etiqueta="Lote" id="campo-lote-mov" obligatorio faltante={faltante}>
                <input id="campo-lote-mov" type="text" name="lote_codigo" required maxLength={80} autoComplete="off" list="lotes-existentes-mov" aria-invalid={invalido("campo-lote-mov")} placeholder="Ej: L2411-A" className={`${fieldClass} w-full`} />
                <datalist id="lotes-existentes-mov">
                  {lotes.map((l) => (
                    <option key={l.loteId + l.bodegaId} value={l.lote} />
                  ))}
                </datalist>
              </Campo>
              <Campo etiqueta="Fecha de vencimiento" id="campo-vencimiento-mov" obligatorio faltante={faltante}>
                <input id="campo-vencimiento-mov" type="date" name="vencimiento" required aria-invalid={invalido("campo-vencimiento-mov")} className={`${fieldClass} w-full`} />
              </Campo>
            </>
          )}
          {manejaVencimiento && !lotePorTexto && (
            <Campo etiqueta={tipo === "ajuste" ? "Lote" : "Lote (si no eliges, sale primero el que vence antes)"} id="campo-lote-elegido-mov" obligatorio={tipo === "ajuste"} faltante={faltante}>
              <select id="campo-lote-elegido-mov" name="lote_id" required={tipo === "ajuste"} defaultValue="" key={bodega} aria-invalid={tipo === "ajuste" ? invalido("campo-lote-elegido-mov") : undefined} className={`${fieldClass} w-full`}>
                <option value="">{tipo === "ajuste" ? "Elige el lote" : "El que vence antes"}</option>
                {lotesDeBodega.map((l) => (
                  <option key={l.loteId} value={l.loteId}>
                    {l.lote} · vence {l.fechaVencimiento} · {l.cantidad} u.
                    {l.estado === "vencido" ? " · vencido" : ""}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          <Campo etiqueta={tipo === "ajuste" ? "Cantidad (con signo: -3 resta, 3 suma)" : "Cantidad"} id="campo-cantidad-mov" obligatorio faltante={faltante}>
            <input
              id="campo-cantidad-mov"
              type="number"
              name="cantidad"
              required
              step="1"
              {...(tipo === "ajuste" ? {} : { min: "1" })}
              inputMode="numeric"
              aria-invalid={invalido("campo-cantidad-mov")}
              placeholder="Ej: 10"
              className={`${fieldClass} w-full`}
            />
          </Campo>
          <Campo etiqueta="Referencia" id="campo-referencia-mov">
            <input id="campo-referencia-mov" type="text" name="referencia" autoComplete="off" maxLength={200} placeholder="Ej: Compra #0012" className={`${fieldClass} w-full`} />
          </Campo>
          <Campo etiqueta={tipo === "ajuste" ? "Motivo" : "Motivo (opcional)"} id="campo-motivo-mov" obligatorio={tipo === "ajuste"} faltante={faltante}>
            <textarea
              id="campo-motivo-mov"
              name="motivo"
              rows={2}
              maxLength={500}
              required={tipo === "ajuste"}
              aria-invalid={tipo === "ajuste" ? invalido("campo-motivo-mov") : undefined}
              placeholder="Ej: Conteo del inventario inicial"
              className={`${fieldClass} w-full resize-y`}
            />
          </Campo>
        </Seccion>
      )}
    </FichaCrear>
  );
}
