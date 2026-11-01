"use client";

import { useState } from "react";
import { BotonAccion } from "@/components/ui/boton-accion";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { DropiIcon, InventarioIcon, TransferirIcon } from "@/lib/nav-icons";
import type { BodegaOpcion } from "./panel-movimiento";
import { enviarADropi, transferirStock, type LoteStock } from "./stock-actions";

/** El lote que sale: en un producto con vencimiento se puede elegir; sin elegir, sale primero el que vence antes. */
function CampoLote({ lotes, bodega }: { lotes: LoteStock[]; bodega: string }) {
  const deBodega = lotes.filter((l) => l.bodegaId === bodega && l.cantidad > 0);
  return (
    <Campo etiqueta="Lote (si no eliges, sale primero el que vence antes)" id="campo-lote-trf">
      <select id="campo-lote-trf" name="lote_id" defaultValue="" key={bodega} className={`${fieldClass} w-full`}>
        <option value="">El que vence antes</option>
        {deBodega.map((l) => (
          <option key={l.loteId} value={l.loteId}>
            {l.lote} · vence {l.fechaVencimiento} · {l.cantidad} u.
          </option>
        ))}
      </select>
    </Campo>
  );
}

function CampoCantidad({ faltante, invalido }: { faltante: string | null; invalido: (id: string) => true | undefined }) {
  return (
    <Campo etiqueta="Cantidad" id="campo-cantidad-trf" obligatorio faltante={faltante}>
      <input id="campo-cantidad-trf" type="number" name="cantidad" required min="1" step="1" inputMode="numeric" aria-invalid={invalido("campo-cantidad-trf")} placeholder="Ej: 200" className={`${fieldClass} w-full`} />
    </Campo>
  );
}

/**
 * Transferencia entre dos bodegas propias del país: las unidades salen de una y entran en la otra en un solo paso (si algo
 * falla, no se mueve nada).
 */
export function PanelTransferencia({
  skuId,
  bodegas,
  manejaVencimiento,
  lotes,
  alGuardar,
}: {
  skuId: string;
  bodegas: BodegaOpcion[];
  manejaVencimiento: boolean;
  lotes: LoteStock[];
  alGuardar: () => void;
}) {
  const [desde, setDesde] = useState(bodegas[0]?.id ?? "");
  const destinos = bodegas.filter((b) => b.id !== desde);
  return (
    <FichaCrear
      titulo="Transferir entre bodegas"
      etiquetaCrear="Transferir"
      action={transferirStock}
      mensajeExito="Transferencia registrada"
      ocultos={{ sku_id: skuId }}
      puedeExtra={bodegas.length > 1}
      alGuardar={alGuardar}
      boton={(abrir) => (
        <BotonAccion icono={TransferirIcon} onClick={abrir} aria-haspopup="dialog" disabled={bodegas.length < 2}>
          Transferir
        </BotonAccion>
      )}
    >
      {({ faltante, invalido }) => (
        <Seccion icono={InventarioIcon} titulo="Transferencia">
          <Campo etiqueta="Sale de" id="campo-desde-trf" obligatorio faltante={faltante}>
            <select id="campo-desde-trf" name="desde_id" required data-enfocar value={desde} onChange={(e) => setDesde(e.target.value)} className={`${fieldClass} w-full`}>
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Entra a" id="campo-hacia-trf" obligatorio faltante={faltante}>
            <select id="campo-hacia-trf" name="hacia_id" required defaultValue="" key={desde} aria-invalid={invalido("campo-hacia-trf")} className={`${fieldClass} w-full`}>
              <option value="" disabled>
                Elige la bodega
              </option>
              {destinos.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre}
                </option>
              ))}
            </select>
          </Campo>
          {manejaVencimiento && <CampoLote lotes={lotes} bodega={desde} />}
          <CampoCantidad faltante={faltante} invalido={invalido} />
          <Campo etiqueta="Referencia" id="campo-referencia-trf">
            <input id="campo-referencia-trf" type="text" name="referencia" autoComplete="off" maxLength={200} placeholder="Ej: Traslado semanal" className={`${fieldClass} w-full`} />
          </Campo>
          <Campo etiqueta="Motivo (opcional)" id="campo-motivo-trf">
            <textarea id="campo-motivo-trf" name="motivo" rows={2} maxLength={500} placeholder="Ej: Se movió del Storage a la oficina" className={`${fieldClass} w-full resize-y`} />
          </Campo>
        </Seccion>
      )}
    </FichaCrear>
  );
}

/**
 * Envío a la bodega de Dropi (B280): las unidades salen de una bodega propia y el envío queda «en camino» hasta que Dropi
 * diga cuántas llegaron (pestaña «Envíos a Dropi»).
 */
export function PanelEnvioDropi({
  skuId,
  bodegas,
  manejaVencimiento,
  lotes,
  alGuardar,
}: {
  skuId: string;
  bodegas: BodegaOpcion[];
  manejaVencimiento: boolean;
  lotes: LoteStock[];
  alGuardar: () => void;
}) {
  const [desde, setDesde] = useState(bodegas[0]?.id ?? "");
  return (
    <FichaCrear
      titulo="Enviar a Dropi"
      etiquetaCrear="Registrar envío"
      action={enviarADropi}
      mensajeExito="Envío registrado: queda en camino"
      ocultos={{ sku_id: skuId }}
      puedeExtra={bodegas.length > 0}
      alGuardar={alGuardar}
      boton={(abrir) => (
        <BotonAccion icono={DropiIcon} onClick={abrir} aria-haspopup="dialog">
          Enviar a Dropi
        </BotonAccion>
      )}
    >
      {({ faltante, invalido }) => (
        <Seccion icono={InventarioIcon} titulo="Envío">
          <Campo etiqueta="Sale de" id="campo-desde-env" obligatorio faltante={faltante}>
            <select id="campo-desde-env" name="desde_id" required data-enfocar value={desde} onChange={(e) => setDesde(e.target.value)} className={`${fieldClass} w-full`}>
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre}
                </option>
              ))}
            </select>
          </Campo>
          {manejaVencimiento && <CampoLote lotes={lotes} bodega={desde} />}
          <CampoCantidad faltante={faltante} invalido={invalido} />
          <Campo etiqueta="Referencia" id="campo-referencia-env">
            <input id="campo-referencia-env" type="text" name="referencia" autoComplete="off" maxLength={200} placeholder="Ej: Remisión 0042" className={`${fieldClass} w-full`} />
          </Campo>
        </Seccion>
      )}
    </FichaCrear>
  );
}
