"use client";

import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { ESTADOS, ETIQUETA_CATEGORIA, ETIQUETA_ESTADO, ETIQUETA_METODO, METODOS_COBRO } from "@/lib/deliverys/liquidacion";
import { EnvioIcon, WalletIcon } from "@/lib/nav-icons";
import { crearEntregaDelivery } from "../actions";

type Opcion = { id: string; nombre: string };
const TARIFAS = ["entrega", "compartida", "cambio", "fuera_ruta"] as const;

/** «Agregar» de Entregas: un pedido suelto, con su orden y lo que el repartidor cobró contra entrega. */
export function CrearEntregaPanel({ repartidores, tiendas, hoy }: { repartidores: Opcion[]; tiendas: Opcion[]; hoy: string }) {
  return (
    <FichaCrear titulo="Nueva entrega" etiquetaCrear="Registrar entrega" action={crearEntregaDelivery} mensajeExito="Entrega registrada" puedeExtra={repartidores.length > 0}>
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={EnvioIcon} titulo="Entrega">
            <Campo etiqueta="Fecha" id="ent-fecha" obligatorio faltante={faltante}>
              <input id="ent-fecha" name="fecha" type="date" required defaultValue={hoy} aria-invalid={invalido("ent-fecha")} className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Repartidor" id="ent-repartidor" obligatorio faltante={faltante}>
              <select id="ent-repartidor" name="repartidor_id" required defaultValue="" data-enfocar aria-invalid={invalido("ent-repartidor")} className={`${fieldClass} w-full`}>
                <option value="" disabled>
                  Elegir repartidor
                </option>
                {repartidores.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Tienda" id="ent-tienda" obligatorio faltante={faltante}>
              <select id="ent-tienda" name="unidad_id" required defaultValue="" aria-invalid={invalido("ent-tienda")} className={`${fieldClass} w-full`}>
                <option value="" disabled>
                  Elegir tienda
                </option>
                {tiendas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Orden" id="ent-orden">
              <input id="ent-orden" name="orden" maxLength={60} placeholder="Ej: 21650" className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Estado" id="ent-estado" obligatorio faltante={faltante}>
              <select id="ent-estado" name="estado" required defaultValue="entregado" aria-invalid={invalido("ent-estado")} className={`${fieldClass} w-full`}>
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>
                    {ETIQUETA_ESTADO[e]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Tarifa" id="ent-categoria">
              <select id="ent-categoria" name="categoria" defaultValue="entrega" className={`${fieldClass} w-full`}>
                {TARIFAS.map((c) => (
                  <option key={c} value={c}>
                    {ETIQUETA_CATEGORIA[c]}
                  </option>
                ))}
                <option value="">Sin tarifa</option>
              </select>
            </Campo>
            <Campo etiqueta="Zona" id="ent-zona">
              <input id="ent-zona" name="zona" maxLength={80} placeholder="Ej: Zona 5" className={`${fieldClass} w-full`} />
            </Campo>
          </Seccion>
          <Seccion icono={WalletIcon} titulo="Cobro contra entrega">
            <Campo etiqueta="A cobrar (USD)" id="ent-cobrar">
              <input id="ent-cobrar" name="monto_cobrar" type="number" inputMode="decimal" step="0.01" min="0" placeholder="Ej: 39.99" className={`${fieldClass} w-full tabular-nums`} />
            </Campo>
            <Campo etiqueta="Cobrado (USD)" id="ent-cobrado">
              <input id="ent-cobrado" name="cobrado" type="number" inputMode="decimal" step="0.01" min="0" placeholder="Ej: 39.99" className={`${fieldClass} w-full tabular-nums`} />
            </Campo>
            <Campo etiqueta="Cómo se cobró" id="ent-metodo">
              <select id="ent-metodo" name="metodo_cobro" defaultValue="" className={`${fieldClass} w-full`}>
                <option value="">Sin cobro</option>
                {METODOS_COBRO.map((m) => (
                  <option key={m} value={m}>
                    {ETIQUETA_METODO[m]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Nota" id="ent-nota">
              <textarea id="ent-nota" name="nota" rows={2} maxLength={500} placeholder="Ej: Cliente pidió cambio de talla" className={`${fieldClass} w-full`} />
            </Campo>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}
