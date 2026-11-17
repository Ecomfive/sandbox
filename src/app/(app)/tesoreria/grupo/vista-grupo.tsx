"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { claseCifra } from "@/components/af4/estilos-af4";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { dinero2, SIN_DATO } from "@/lib/af4/formato";
import { fechaCorta } from "@/lib/af4/fecha";
import { CalendarioIcon, GastoIcon, PedidoIcon, PersonaIcon } from "@/lib/nav-icons";
import { CLASES_PARTE, TIPOS_MOVIMIENTO_GRUPO, etiquetaTipoGrupo, type TipoMovGrupo } from "@/lib/finanzas/prestamos-grupo";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { ConfirmarEnFila } from "../confirmar-en-fila";
import { crearMovimientoGrupo, crearParteGrupo, eliminarMovimientoGrupo } from "../grupo-actions";

type Opcion = { id: string; nombre: string };

export interface FilaMovGrupo {
  id: string;
  fecha: string;
  vence: string | null;
  tipo: TipoMovGrupo;
  acreedor: string;
  deudor: string;
  /** Positivo sube la deuda; negativo, abono. */
  monto: number;
  concepto: string;
  ordenes: string;
  medio: string;
  origen: "manual" | "clickup";
}

const DEF: DefTabla<FilaMovGrupo> = {
  clave: "tesoreria-grupo-movimientos",
  campos: [
    { id: "concepto", etiqueta: "Concepto", tipo: "texto", valor: (r) => `${r.concepto} ${r.ordenes}` },
    { id: "deudor", etiqueta: "Debe", tipo: "seleccion", valores: (r) => [r.deudor], agrupable: true },
    { id: "acreedor", etiqueta: "Le debe a", tipo: "seleccion", valores: (r) => [r.acreedor], agrupable: true },
    { id: "tipo", etiqueta: "Tipo", tipo: "seleccion", valores: (r) => [etiquetaTipoGrupo(r.tipo)], agrupable: true },
    { id: "origen", etiqueta: "Origen", tipo: "seleccion", valores: (r) => [r.origen === "clickup" ? "ClickUp" : "A mano"] },
  ],
};
const NOMBRE: NombreFilas = { singular: "movimiento", plural: "movimientos" };
const ICONOS: Record<string, IconoComp> = { concepto: GastoIcon, deudor: PersonaIcon, acreedor: PersonaIcon, tipo: PedidoIcon, origen: CalendarioIcon };

const COLUMNAS: ColumnaTabla<FilaMovGrupo, null>[] = [
  { id: "fecha", label: "Fecha", ocultable: false, render: (r) => fechaCorta(r.fecha) },
  { id: "deudor", label: "Debe", ocultable: false, render: (r) => r.deudor },
  { id: "acreedor", label: "Le debe a", ocultable: false, render: (r) => r.acreedor },
  { id: "tipo", label: "Tipo", ocultable: true, render: (r) => etiquetaTipoGrupo(r.tipo) },
  { id: "monto", label: "Monto", ocultable: false, clase: `text-right ${claseCifra}`, render: (r) => dinero2(r.monto) },
  { id: "vence", label: "Vence", ocultable: true, render: (r) => (r.vence ? fechaCorta(r.vence) : SIN_DATO) },
  { id: "concepto", label: "Concepto", ocultable: true, render: (r) => r.concepto },
  { id: "ordenes", label: "Órdenes", ocultable: true, render: (r) => r.ordenes || SIN_DATO },
  { id: "medio", label: "Medio", ocultable: true, oculta: true, render: (r) => r.medio || SIN_DATO },
];

function Lista({ id, name, opciones, vacio, invalido }: { id: string; name: string; opciones: Opcion[]; vacio: string; invalido?: boolean }) {
  return (
    <select id={id} name={name} required defaultValue="" aria-invalid={invalido || undefined} className={`${fieldClass} w-full`}>
      <option value="" disabled>
        {vacio}
      </option>
      {opciones.map((o) => (
        <option key={o.id} value={o.id}>
          {o.nombre}
        </option>
      ))}
    </select>
  );
}

function CrearMovimientoPanel({ partes, hoy }: { partes: Opcion[]; hoy: string }) {
  return (
    <FichaCrear titulo="Nuevo movimiento" etiquetaCrear="Guardar movimiento" action={crearMovimientoGrupo} mensajeExito="Movimiento guardado">
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={PersonaIcon} titulo="Quién">
            <Campo etiqueta="Debe (quien recibió la plata)" id="grupo-deudor" obligatorio faltante={faltante}>
              <Lista id="grupo-deudor" name="deudor_id" opciones={partes} vacio="Elegir" invalido={invalido("grupo-deudor")} />
            </Campo>
            <Campo etiqueta="Le debe a (quien prestó o pagó)" id="grupo-acreedor" obligatorio faltante={faltante}>
              <Lista id="grupo-acreedor" name="acreedor_id" opciones={partes} vacio="Elegir" invalido={invalido("grupo-acreedor")} />
            </Campo>
          </Seccion>
          <Seccion icono={GastoIcon} titulo="Movimiento">
            <Campo etiqueta="Tipo" id="grupo-tipo" obligatorio faltante={faltante}>
              <select id="grupo-tipo" name="tipo" required defaultValue="prestamo" className={`${fieldClass} w-full`}>
                {TIPOS_MOVIMIENTO_GRUPO.map((t) => (
                  <option key={t.clave} value={t.clave}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Monto (USD)" id="grupo-monto" obligatorio faltante={faltante} mensaje="Debe ser mayor a cero">
              <input id="grupo-monto" name="monto" type="number" inputMode="decimal" step="0.01" min="0.01" required aria-invalid={invalido("grupo-monto")} placeholder="Ej: 2500.00" className={`${fieldClass} w-full tabular-nums`} />
            </Campo>
            <Campo etiqueta="Concepto" id="grupo-concepto" obligatorio faltante={faltante}>
              <input id="grupo-concepto" name="concepto" required maxLength={300} data-enfocar aria-invalid={invalido("grupo-concepto")} placeholder="Ej: Pago de órdenes con la tarjeta" className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Órdenes de compra" id="grupo-ordenes">
              <input id="grupo-ordenes" name="ordenes" placeholder="Ej: ECOM03-0016, ECOM03-0017" className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Medio" id="grupo-medio">
              <input id="grupo-medio" name="medio" maxLength={60} placeholder="Ej: Tarjeta de Alcides, Payoneer" className={`${fieldClass} w-full`} />
            </Campo>
          </Seccion>
          <Seccion icono={CalendarioIcon} titulo="Fechas">
            <Campo etiqueta="Fecha" id="grupo-fecha" obligatorio faltante={faltante}>
              <input id="grupo-fecha" name="fecha" type="date" required defaultValue={hoy} aria-invalid={invalido("grupo-fecha")} className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Vence (vacío = sin fecha)" id="grupo-vence">
              <input id="grupo-vence" name="vence" type="date" className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Nota" id="grupo-nota">
              <textarea id="grupo-nota" name="nota" rows={2} maxLength={1000} className={`${fieldClass} w-full`} />
            </Campo>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}

export function CrearParteGrupo() {
  return (
    <FichaCrear titulo="Nueva parte" etiquetaBoton="Agregar parte" etiquetaCrear="Agregar parte" action={crearParteGrupo} mensajeExito="Parte agregada">
      {({ faltante, invalido }) => (
        <Seccion icono={PersonaIcon} titulo="Parte">
          <Campo etiqueta="Nombre" id="parte-nombre" obligatorio faltante={faltante}>
            <input id="parte-nombre" name="nombre" required maxLength={80} data-enfocar aria-invalid={invalido("parte-nombre")} placeholder="Ej: Ecomfive Honduras" className={`${fieldClass} w-full`} />
          </Campo>
          <Campo etiqueta="Qué es" id="parte-clase" obligatorio faltante={faltante}>
            <select id="parte-clase" name="clase" required defaultValue="empresa" className={`${fieldClass} w-full`}>
              {CLASES_PARTE.map((c) => (
                <option key={c.clave} value={c.clave}>
                  {c.etiqueta}
                </option>
              ))}
            </select>
          </Campo>
        </Seccion>
      )}
    </FichaCrear>
  );
}

function Eliminar({ fila }: { fila: FilaMovGrupo }) {
  if (fila.origen !== "manual") return null;
  return (
    <ConfirmarEnFila
      etiqueta="Eliminar"
      ariaLabel={`Eliminar el movimiento «${fila.concepto}»`}
      hecho="Movimiento eliminado"
      ejecutar={() => eliminarMovimientoGrupo(fila.id)}
    />
  );
}

export function TablaMovimientosGrupo({ filas, partes, hoy, puedeEscribir }: { filas: FilaMovGrupo[]; partes: Opcion[]; hoy: string; puedeEscribir: boolean }) {
  return (
    <TablaDatos
      def={DEF}
      filas={filas}
      columnas={COLUMNAS}
      contexto={null}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(r) => r.id}
      accionPrincipal={puedeEscribir ? <CrearMovimientoPanel partes={partes} hoy={hoy} /> : undefined}
      accion={puedeEscribir ? { etiqueta: "", render: (r) => <Eliminar fila={r} /> } : undefined}
      ariaLabel="Movimientos de préstamos del grupo"
      vacio="Todavía no hay movimientos. Regístralos con «Agregar» o importa las listas de ClickUp."
    />
  );
}
