"use client";

import Link from "next/link";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { Campo } from "@/components/ui/campo-ficha";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { fechaCorta } from "@/lib/af4/fecha";
import { dinero, porcentaje } from "@/lib/af4/formato";
import { CalendarioIcon, EtiquetaIcon, WalletIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import { ConfirmarEnFila } from "../confirmar-en-fila";
import { desactivarOferta, guardarOferta } from "../deuda-actions";

const d2 = (v: number) => dinero(v, "USD", { decimales: 2 });
const pct = (t: number) => porcentaje(t * 100, { decimales: 2 });
const ICONOS: Record<string, IconoComp> = { nombre: EtiquetaIcon, monto: WalletIcon, desembolso: CalendarioIcon };

/** Una deuda que la oferta puede sustituir. */
export interface OpcionDeuda {
  ref: string;
  nombre: string;
  tipo: string;
  saldo: number;
  tasaEfectivaAnual: number;
}

export interface FilaOferta {
  id: string;
  banco: string;
  nombre: string;
  monto: number;
  plazoMeses: number;
  tasaAnual: number;
  comisionApertura: number;
  graciaMeses: number;
  garantias: string | null;
  fechaDesembolso: string;
  sustituye: string[];
  nota: string | null;
  cuota: number;
  ahorroAnual: number;
  elegida: boolean;
}

function CamposOferta({ o, deudas, hoy, faltante, invalido, sufijo }: { o?: FilaOferta; deudas: OpcionDeuda[]; hoy: string; faltante: string | null; invalido: (id: string) => true | undefined; sufijo: string }) {
  const id = (x: string) => `oferta-${x}-${sufijo}`;
  return (
    <>
      <Seccion icono={EtiquetaIcon} titulo="Oferta">
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Banco" id={id("banco")} obligatorio faltante={faltante}>
            <input id={id("banco")} name="banco" required maxLength={120} defaultValue={o?.banco ?? ""} data-enfocar aria-invalid={invalido(id("banco"))} placeholder="Ej: Banco Ejemplo" className={`${fieldClass} w-full`} />
          </Campo>
          <Campo etiqueta="Nombre" id={id("nombre")} faltante={faltante}>
            <input id={id("nombre")} name="nombre" maxLength={120} defaultValue={o?.nombre ?? ""} placeholder="Ej: Préstamo comercial" className={`${fieldClass} w-full`} />
          </Campo>
        </div>
      </Seccion>
      <Seccion icono={WalletIcon} titulo="Condiciones">
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Monto en USD" id={id("monto")} obligatorio faltante={faltante}>
            <input id={id("monto")} name="monto" required inputMode="decimal" pattern="[0-9.,$ ]+" defaultValue={o ? String(o.monto) : ""} aria-invalid={invalido(id("monto"))} placeholder="Ej: 80000" className={`${fieldClass} w-full`} />
          </Campo>
          <Campo etiqueta="Plazo en meses" id={id("plazo")} obligatorio faltante={faltante}>
            <input id={id("plazo")} name="plazo_meses" type="number" min={1} max={480} required defaultValue={o ? String(o.plazoMeses) : ""} aria-invalid={invalido(id("plazo"))} placeholder="Ej: 48" className={`${fieldClass} w-full`} />
          </Campo>
          <Campo etiqueta="Tasa anual %" id={id("tasa")} obligatorio faltante={faltante}>
            <input id={id("tasa")} name="tasa" required inputMode="decimal" defaultValue={o ? String(Math.round(o.tasaAnual * 10_000) / 100) : ""} aria-invalid={invalido(id("tasa"))} placeholder="Ej: 11.5" className={`${fieldClass} w-full`} />
          </Campo>
          <Campo etiqueta="Comisión de apertura %" id={id("comision")} faltante={faltante}>
            <input id={id("comision")} name="comision_apertura" inputMode="decimal" defaultValue={o?.comisionApertura ? String(Math.round(o.comisionApertura * 10_000) / 100) : ""} placeholder="Ej: 1.5" className={`${fieldClass} w-full`} />
          </Campo>
          <Campo etiqueta="Meses de gracia" id={id("gracia")} faltante={faltante}>
            <input id={id("gracia")} name="gracia_meses" type="number" min={0} max={60} defaultValue={o?.graciaMeses ? String(o.graciaMeses) : ""} placeholder="Ej: 3" className={`${fieldClass} w-full`} />
          </Campo>
          <Campo etiqueta="Desembolso" id={id("desembolso")} obligatorio faltante={faltante}>
            <input id={id("desembolso")} name="fecha_desembolso" type="date" required defaultValue={o?.fechaDesembolso ?? hoy} aria-invalid={invalido(id("desembolso"))} className={`${fieldClass} w-full`} />
          </Campo>
        </div>
        <Campo etiqueta="Garantías" id={id("garantias")} faltante={faltante}>
          <input id={id("garantias")} name="garantias" maxLength={1000} defaultValue={o?.garantias ?? ""} placeholder="Ej: Fianza de los socios e inventario" className={`${fieldClass} w-full`} />
        </Campo>
      </Seccion>
      <Seccion icono={CalendarioIcon} titulo="Deudas que sustituye">
        {deudas.length ? (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="sr-only">Deudas que sustituye</legend>
            {deudas.map((d) => (
              <label key={d.ref} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="sustituye" value={d.ref} defaultChecked={o ? o.sustituye.includes(d.ref) : d.tasaEfectivaAnual > 0.2} className={anilloFoco} />
                <span className="flex-1">
                  {d.nombre} <span className="text-xs text-muted-foreground">{d.tipo}</span>
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {d2(d.saldo)} · {pct(d.tasaEfectivaAnual)}
                </span>
              </label>
            ))}
          </fieldset>
        ) : (
          <p className="text-sm text-muted-foreground">Sin deuda vigente.</p>
        )}
      </Seccion>
    </>
  );
}

function EditarOferta({ o, deudas, hoy }: { o: FilaOferta; deudas: OpcionDeuda[]; hoy: string }) {
  return (
    <FichaCrear
      titulo={o.nombre}
      etiquetaCrear="Guardar cambios"
      action={guardarOferta}
      mensajeExito="Oferta actualizada"
      ocultos={{ id: o.id }}
      boton={(abrir) => (
        <button type="button" onClick={abrir} aria-label={`Editar ${o.nombre}`} className={`rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted ${anilloFoco}`}>
          Editar
        </button>
      )}
    >
      {({ faltante, invalido }) => <CamposOferta o={o} deudas={deudas} hoy={hoy} faltante={faltante} invalido={invalido} sufijo={o.id.slice(0, 8)} />}
    </FichaCrear>
  );
}

const DEF: DefTabla<FilaOferta> = {
  clave: "tesoreria-ofertas",
  campos: [
    { id: "nombre", etiqueta: "Oferta", tipo: "texto", valor: (r) => r.nombre },
    { id: "banco", etiqueta: "Banco", tipo: "seleccion", valores: (r) => [r.banco], agrupable: true },
    { id: "monto", etiqueta: "Monto", tipo: "numero", valor: (r) => r.monto },
  ],
};

const COLUMNAS: ColumnaTabla<FilaOferta, null>[] = [
  {
    id: "nombre",
    label: "Oferta",
    ocultable: false,
    render: (r) => (
      <Link href={`/tesoreria/refinanciamiento?oferta=${r.id}`} scroll={false} aria-current={r.elegida ? "true" : undefined} className={`flex items-center gap-2 hover:underline ${anilloFoco} ${r.elegida ? "font-semibold" : ""}`}>
        {r.elegida && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" />}
        {r.nombre}
        <span className="text-xs font-normal text-muted-foreground">{r.banco}</span>
      </Link>
    ),
  },
  { id: "monto", label: "Monto", ocultable: false, clase: "text-right tabular-nums", render: (r) => d2(r.monto) },
  { id: "condiciones", label: "Condiciones", ocultable: false, render: (r) => `${r.plazoMeses} meses · ${pct(r.tasaAnual)}${r.graciaMeses ? ` · ${r.graciaMeses} de gracia` : ""}` },
  { id: "desembolso", label: "Desembolso", ocultable: true, render: (r) => fechaCorta(r.fechaDesembolso) },
  { id: "cuota", label: "Cuota", ocultable: false, clase: "text-right tabular-nums", render: (r) => d2(r.cuota) },
  { id: "ahorro", label: "Ahorro anual", ocultable: false, clase: "text-right tabular-nums", render: (r) => d2(r.ahorroAnual) },
];

export function TablaOfertas({ filas, deudas, hoy, puedeEscribir }: { filas: FilaOferta[]; deudas: OpcionDeuda[]; hoy: string; puedeEscribir: boolean }) {
  return (
    <TablaDatos
      def={DEF}
      filas={filas}
      columnas={COLUMNAS}
      contexto={null}
      iconos={ICONOS}
      nombre={{ singular: "oferta", plural: "ofertas" }}
      claveFila={(r) => r.id}
      accionPrincipal={
        puedeEscribir ? (
          <FichaCrear titulo="Nueva oferta de refinanciamiento" etiquetaCrear="Agregar oferta" action={guardarOferta} mensajeExito="Oferta agregada" abrirConNuevo>
            {({ faltante, invalido }) => <CamposOferta deudas={deudas} hoy={hoy} faltante={faltante} invalido={invalido} sufijo="nueva" />}
          </FichaCrear>
        ) : undefined
      }
      accion={
        puedeEscribir
          ? {
              etiqueta: "Acciones",
              render: (r) => (
                <span className="flex items-center gap-1">
                  <EditarOferta o={r} deudas={deudas} hoy={hoy} />
                  <ConfirmarEnFila etiqueta="Quitar" ariaLabel={`Quitar ${r.nombre}`} hecho="Oferta quitada" ejecutar={() => desactivarOferta(r.id)} />
                </span>
              ),
            }
          : undefined
      }
      ariaLabel="Ofertas de refinanciamiento"
      vacio="Sin ofertas cargadas."
    />
  );
}
