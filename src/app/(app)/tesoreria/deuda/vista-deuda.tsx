"use client";

import { useState } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { Badge } from "@/components/ui/badge";
import { Campo } from "@/components/ui/campo-ficha";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { Ventana } from "@/components/ui/ventana";
import { diaMes, fechaCorta } from "@/lib/af4/fecha";
import { dinero, porcentaje } from "@/lib/af4/formato";
import { CLASES_PRESTAMO, saldoAl, tablaAmortizacion, tasaEfectivaAnualCiclo, type EstadoLinea, type FinanciamientoCiclo, type LineaCredito, type Prestamo } from "@/lib/finanzas/deuda";
import { CalendarioIcon, EstadoIcon, EtiquetaIcon, WalletIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import { crearPrestamo, desactivarDeuda, guardarLinea } from "../actions";
import { ConfirmarEnFila } from "../confirmar-en-fila";
import { desactivarCiclo, guardarCiclo } from "../deuda-actions";

const d2 = (v: number) => dinero(v, "USD", { decimales: 2 });
const tasaTexto = (t: number) => porcentaje(t * 100, { decimales: 2 });
const ICONOS: Record<string, IconoComp> = { nombre: EtiquetaIcon, cupo: WalletIcon, usado: WalletIcon, saldo: WalletIcon, renovacion: CalendarioIcon, estado: EstadoIcon, clase: EtiquetaIcon };

export interface Opcion {
  id: string;
  nombre: string;
}

/** Penalidad y comisión de prepago (las usa Optimizar deuda). */
function CamposPrepago({ prefijo, penalidad, comision, faltante }: { prefijo: string; penalidad?: number; comision?: number; faltante: string | null }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Campo etiqueta="Penalidad de prepago %" id={`${prefijo}-penalidad`} faltante={faltante}>
        <input id={`${prefijo}-penalidad`} name="penalidad_prepago" inputMode="decimal" defaultValue={penalidad ? String(Math.round(penalidad * 10_000) / 100) : ""} placeholder="Ej: 2" className={`${fieldClass} w-full`} />
      </Campo>
      <Campo etiqueta="Comisión de prepago en USD" id={`${prefijo}-comision`} faltante={faltante}>
        <input id={`${prefijo}-comision`} name="comision_prepago" inputMode="decimal" pattern="[0-9.,$ ]*" defaultValue={comision ? String(comision) : ""} placeholder="Ej: 150" className={`${fieldClass} w-full`} />
      </Campo>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Líneas de crédito
// ---------------------------------------------------------------------------------------------

export interface FilaLinea extends LineaCredito {
  estado: EstadoLinea;
}

function CamposLinea({ l, cuentas, faltante, invalido, sufijo }: { l?: LineaCredito; cuentas: Opcion[]; faltante: string | null; invalido: (id: string) => true | undefined; sufijo: string }) {
  const id = (x: string) => `linea-${x}-${sufijo}`;
  return (
    <Seccion icono={WalletIcon} titulo="Línea de crédito">
      <Campo etiqueta="Nombre" id={id("nombre")} obligatorio faltante={faltante}>
        <input id={id("nombre")} name="nombre" required maxLength={120} defaultValue={l?.nombre ?? ""} data-enfocar aria-invalid={invalido(id("nombre"))} placeholder="Ej: Línea rotativa" className={`${fieldClass} w-full`} />
      </Campo>
      <Campo etiqueta="Banco" id={id("banco")} faltante={faltante}>
        <input id={id("banco")} name="banco" maxLength={120} defaultValue={l?.banco ?? ""} placeholder="Ej: Banco Ejemplo" className={`${fieldClass} w-full`} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Cupo en USD" id={id("cupo")} obligatorio faltante={faltante}>
          <input id={id("cupo")} name="cupo" required inputMode="decimal" pattern="[0-9.,$ ]+" defaultValue={l ? String(l.cupo) : ""} aria-invalid={invalido(id("cupo"))} placeholder="Ej: 50000" className={`${fieldClass} w-full`} />
        </Campo>
        <Campo etiqueta="Usado hoy en USD" id={id("usado")} faltante={faltante}>
          <input id={id("usado")} name="usado" inputMode="decimal" pattern="[0-9.,$ ]+" defaultValue={l ? String(l.usado) : ""} placeholder="Ej: 12000" className={`${fieldClass} w-full`} />
        </Campo>
        <Campo etiqueta="Tasa anual %" id={id("tasa")} faltante={faltante}>
          <input id={id("tasa")} name="tasa" inputMode="decimal" defaultValue={l ? String(Math.round(l.tasaAnual * 10_000) / 100) : ""} placeholder="Ej: 12.5" className={`${fieldClass} w-full`} />
        </Campo>
        <Campo etiqueta="Renovación" id={id("renovacion")} faltante={faltante}>
          <input id={id("renovacion")} name="fecha_renovacion" type="date" defaultValue={l?.fechaRenovacion ?? ""} className={`${fieldClass} w-full`} />
        </Campo>
      </div>
      <CamposPrepago prefijo={id("prepago")} penalidad={l?.penalidadPrepago} comision={l?.comisionPrepago} faltante={faltante} />
      <Campo etiqueta="Cuenta donde se usa" id={id("cuenta")} faltante={faltante}>
        <select id={id("cuenta")} name="cuenta_id" defaultValue="" className={`${fieldClass} w-full`}>
          <option value="">Sin elegir</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </Campo>
    </Seccion>
  );
}

function EditarLinea({ l, cuentas }: { l: LineaCredito; cuentas: Opcion[] }) {
  return (
    <FichaCrear
      titulo={l.nombre}
      etiquetaCrear="Guardar cambios"
      action={guardarLinea}
      mensajeExito="Línea actualizada"
      ocultos={{ id: l.id }}
      boton={(abrir) => (
        <button type="button" onClick={abrir} aria-label={`Editar la línea ${l.nombre}`} className={`rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted ${anilloFoco}`}>
          Editar
        </button>
      )}
    >
      {({ faltante, invalido }) => <CamposLinea l={l} cuentas={cuentas} faltante={faltante} invalido={invalido} sufijo={l.id.slice(0, 8)} />}
    </FichaCrear>
  );
}

const DEF_LINEAS: DefTabla<FilaLinea> = {
  clave: "tesoreria-lineas",
  campos: [
    { id: "nombre", etiqueta: "Línea", tipo: "texto", valor: (r) => r.nombre },
    { id: "cupo", etiqueta: "Cupo", tipo: "numero", valor: (r) => r.cupo },
    { id: "usado", etiqueta: "Usado", tipo: "numero", valor: (r) => r.usado },
    { id: "estado", etiqueta: "Alerta", tipo: "seleccion", valores: (r) => [r.estado.alertas.length ? "Con alerta" : "Al día"], agrupable: true },
  ],
};

const COL_LINEAS: ColumnaTabla<FilaLinea, null>[] = [
  {
    id: "nombre",
    label: "Línea",
    ocultable: false,
    render: (r) => (
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.estado.alertas.includes("vencida") ? "bg-destructive" : r.estado.alertas.length ? "bg-warning" : "bg-success"}`} />
        {r.nombre}
        {r.banco && <span className="text-xs text-muted-foreground">{r.banco}</span>}
      </span>
    ),
  },
  { id: "cupo", label: "Cupo", ocultable: false, clase: "text-right tabular-nums", render: (r) => d2(r.cupo) },
  { id: "usado", label: "Usado", ocultable: false, clase: "text-right tabular-nums", render: (r) => `${d2(r.usado)} · ${porcentaje(r.estado.uso * 100, { decimales: 0 })}` },
  { id: "disponible", label: "Disponible", ocultable: false, clase: "text-right tabular-nums", render: (r) => d2(r.estado.disponible), total: (fs) => d2(fs.reduce((a, f) => a + f.estado.disponible, 0)) },
  { id: "tasa", label: "Tasa", ocultable: true, clase: "text-right tabular-nums", render: (r) => tasaTexto(r.tasaAnual) },
  { id: "intereses", label: "Intereses del mes", ocultable: false, clase: "text-right tabular-nums", render: (r) => d2(r.estado.interesesMes), total: (fs) => d2(fs.reduce((a, f) => a + f.estado.interesesMes, 0)) },
  {
    id: "renovacion",
    label: "Renovación",
    ocultable: false,
    render: (r) =>
      r.fechaRenovacion ? (
        <span className="whitespace-nowrap">
          {fechaCorta(r.fechaRenovacion)}
          {r.estado.diasParaRenovar !== null && <span className="ml-1.5 text-xs text-muted-foreground">{r.estado.diasParaRenovar < 0 ? "vencida" : `en ${r.estado.diasParaRenovar} días`}</span>}
        </span>
      ) : (
        "—"
      ),
  },
];

export function TablaLineas({ filas, cuentas, puedeEscribir }: { filas: FilaLinea[]; cuentas: Opcion[]; puedeEscribir: boolean }) {
  return (
    <TablaDatos
      def={DEF_LINEAS}
      filas={filas}
      columnas={COL_LINEAS}
      contexto={null}
      iconos={ICONOS}
      nombre={{ singular: "línea", plural: "líneas" }}
      claveFila={(r) => r.id}
      accionPrincipal={
        puedeEscribir ? (
          <FichaCrear titulo="Nueva línea de crédito" etiquetaCrear="Agregar línea" action={guardarLinea} mensajeExito="Línea agregada">
            {({ faltante, invalido }) => <CamposLinea cuentas={cuentas} faltante={faltante} invalido={invalido} sufijo="nueva" />}
          </FichaCrear>
        ) : undefined
      }
      accion={
        puedeEscribir
          ? {
              etiqueta: "Acciones",
              render: (r) => (
                <span className="flex items-center gap-1">
                  <EditarLinea l={r} cuentas={cuentas} />
                  <ConfirmarEnFila etiqueta="Desactivar" ariaLabel={`Desactivar la línea ${r.nombre}`} hecho="Línea desactivada" ejecutar={() => desactivarDeuda("linea", r.id)} />
                </span>
              ),
            }
          : undefined
      }
      ariaLabel="Líneas de crédito"
      vacio="Sin líneas de crédito."
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Préstamos
// ---------------------------------------------------------------------------------------------

export interface FilaPrestamo extends Prestamo {
  saldo: number;
  cuotasPagadas: number;
  proxima: { fecha: string; cuota: number } | null;
}

const etiquetaClase = (c: string) => CLASES_PRESTAMO.find((x) => x.clave === c)?.etiqueta ?? c;

const DEF_PRESTAMOS: DefTabla<FilaPrestamo> = {
  clave: "tesoreria-prestamos",
  campos: [
    { id: "nombre", etiqueta: "Préstamo", tipo: "texto", valor: (r) => r.nombre },
    { id: "clase", etiqueta: "Tipo", tipo: "seleccion", valores: (r) => [etiquetaClase(r.clase)], agrupable: true },
    { id: "saldo", etiqueta: "Saldo", tipo: "numero", valor: (r) => r.saldo },
  ],
};

const COL_PRESTAMOS: ColumnaTabla<FilaPrestamo, null>[] = [
  { id: "nombre", label: "Préstamo", ocultable: false, render: (r) => r.nombre },
  { id: "clase", label: "Tipo", ocultable: true, render: (r) => etiquetaClase(r.clase) },
  { id: "acreedor", label: "Acreedor", ocultable: true, render: (r) => r.acreedor ?? "—" },
  { id: "monto", label: "Monto", ocultable: true, clase: "text-right tabular-nums", render: (r) => d2(r.monto) },
  { id: "tasa", label: "Tasa", ocultable: true, clase: "text-right tabular-nums", render: (r) => tasaTexto(r.tasaAnual) },
  { id: "cuotas", label: "Cuotas", ocultable: false, clase: "text-right tabular-nums", render: (r) => `${r.cuotasPagadas} de ${r.plazoMeses}` },
  { id: "proxima", label: "Próxima cuota", ocultable: false, render: (r) => (r.proxima ? `${diaMes(r.proxima.fecha)} · ${d2(r.proxima.cuota)}` : "—") },
  { id: "saldo", label: "Saldo", ocultable: false, clase: "text-right tabular-nums font-medium", render: (r) => d2(r.saldo), total: (fs) => d2(fs.reduce((a, f) => a + f.saldo, 0)) },
];

function NuevoPrestamo({ tipos, cuentas, hoy }: { tipos: Opcion[]; cuentas: Opcion[]; hoy: string }) {
  return (
    <FichaCrear titulo="Nuevo préstamo" etiquetaCrear="Agregar préstamo" action={crearPrestamo} mensajeExito="Préstamo agregado" abrirConNuevo>
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={EtiquetaIcon} titulo="Préstamo">
            <Campo etiqueta="Nombre" id="prestamo-nombre" obligatorio faltante={faltante}>
              <input id="prestamo-nombre" name="nombre" required maxLength={120} data-enfocar aria-invalid={invalido("prestamo-nombre")} placeholder="Ej: Préstamo de capital de trabajo" className={`${fieldClass} w-full`} />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Acreedor" id="prestamo-acreedor" faltante={faltante}>
                <input id="prestamo-acreedor" name="acreedor" maxLength={120} placeholder="Ej: Banco Ejemplo" className={`${fieldClass} w-full`} />
              </Campo>
              <Campo etiqueta="Tipo" id="prestamo-clase" obligatorio faltante={faltante}>
                <select id="prestamo-clase" name="clase" required defaultValue="prestamo" className={`${fieldClass} w-full`}>
                  {CLASES_PRESTAMO.map((c) => (
                    <option key={c.clave} value={c.clave}>
                      {c.etiqueta}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
          </Seccion>
          <Seccion icono={WalletIcon} titulo="Condiciones">
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Monto en USD" id="prestamo-monto" obligatorio faltante={faltante}>
                <input id="prestamo-monto" name="monto" required inputMode="decimal" pattern="[0-9.,$ ]+" aria-invalid={invalido("prestamo-monto")} placeholder="Ej: 25000" className={`${fieldClass} w-full`} />
              </Campo>
              <Campo etiqueta="Tasa anual %" id="prestamo-tasa" obligatorio faltante={faltante}>
                <input id="prestamo-tasa" name="tasa" required inputMode="decimal" aria-invalid={invalido("prestamo-tasa")} placeholder="Ej: 9.5" className={`${fieldClass} w-full`} />
              </Campo>
              <Campo etiqueta="Plazo en meses" id="prestamo-plazo" obligatorio faltante={faltante}>
                <input id="prestamo-plazo" name="plazo_meses" type="number" min={1} max={480} required aria-invalid={invalido("prestamo-plazo")} placeholder="Ej: 36" className={`${fieldClass} w-full`} />
              </Campo>
              <Campo etiqueta="Desembolso" id="prestamo-desembolso" obligatorio faltante={faltante}>
                <input id="prestamo-desembolso" name="fecha_desembolso" type="date" required defaultValue={hoy} aria-invalid={invalido("prestamo-desembolso")} className={`${fieldClass} w-full`} />
              </Campo>
              <Campo etiqueta="Primera cuota" id="prestamo-primera" obligatorio faltante={faltante}>
                <input id="prestamo-primera" name="primer_vencimiento" type="date" required aria-invalid={invalido("prestamo-primera")} className={`${fieldClass} w-full`} />
              </Campo>
            </div>
          </Seccion>
          <Seccion icono={WalletIcon} titulo="Prepago">
            <CamposPrepago prefijo="prestamo-prepago" faltante={faltante} />
          </Seccion>
          <Seccion icono={CalendarioIcon} titulo="En el libro">
            <Campo etiqueta="Tipo de la cuota" id="prestamo-tipo" faltante={faltante}>
              <select id="prestamo-tipo" name="tipo_id" defaultValue="" className={`${fieldClass} w-full`}>
                <option value="">Sin elegir</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Cuenta de pago" id="prestamo-cuenta" faltante={faltante}>
              <select id="prestamo-cuenta" name="cuenta_id" defaultValue="" className={`${fieldClass} w-full`}>
                <option value="">Sin elegir</option>
                {cuentas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}

function FichaPrestamo({ p, hoy, puedeEscribir, alCerrar }: { p: FilaPrestamo; hoy: string; puedeEscribir: boolean; alCerrar: () => void }) {
  const tabla = tablaAmortizacion(p);
  const s = saldoAl(p, hoy, tabla);
  return (
    <Ventana abierto alCerrar={alCerrar} lado="derecha" ancho="lg" titulo={<span className="flex items-center gap-2">{p.nombre} <Badge tone="neutral">{etiquetaClase(p.clase)}</Badge></span>}>
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-border p-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Saldo hoy</dt>
            <dd className="font-medium tabular-nums">{d2(s.saldo)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Corriente (12 meses)</dt>
            <dd className="font-medium tabular-nums">{d2(s.corriente)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">No corriente</dt>
            <dd className="font-medium tabular-nums">{d2(s.noCorriente)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Cuota</dt>
            <dd className="font-medium tabular-nums">{d2(tabla[0]?.cuota ?? 0)}</dd>
          </div>
        </dl>
        {puedeEscribir && (
          <div>
            <ConfirmarEnFila etiqueta="Desactivar" ariaLabel={`Desactivar el préstamo ${p.nombre}`} hecho="Préstamo desactivado" ejecutar={() => desactivarDeuda("prestamo", p.id)} />
          </div>
        )}
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="tabla-datos w-full text-sm">
            <caption className="sr-only">Tabla de amortización de {p.nombre}</caption>
            <thead>
              <tr className={claseFilaEncabezado}>
                {["N.º", "Fecha", "Cuota", "Interés", "Capital", "Saldo"].map((h, i) => (
                  <th key={h} scope="col" className={`${claseEncabezadoColumna} ${i > 1 ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabla.map((c) => (
                <tr key={c.numero} className={c.fecha <= hoy ? "text-muted-foreground" : ""}>
                  <td className={claseCeldaColumna}>{c.numero}</td>
                  <td className={claseCeldaColumna}>{fechaCorta(c.fecha)}</td>
                  <td className={`${claseCeldaColumna} text-right tabular-nums`}>{d2(c.cuota)}</td>
                  <td className={`${claseCeldaColumna} text-right tabular-nums`}>{d2(c.interes)}</td>
                  <td className={`${claseCeldaColumna} text-right tabular-nums`}>{d2(c.capital)}</td>
                  <td className={`${claseCeldaColumna} text-right tabular-nums`}>{d2(c.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Ventana>
  );
}

export function TablaPrestamos({ filas, tipos, cuentas, hoy, puedeEscribir }: { filas: FilaPrestamo[]; tipos: Opcion[]; cuentas: Opcion[]; hoy: string; puedeEscribir: boolean }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const p = filas.find((f) => f.id === abierto) ?? null;
  return (
    <>
      <TablaDatos
        def={DEF_PRESTAMOS}
        filas={filas}
        columnas={COL_PRESTAMOS}
        contexto={null}
        iconos={ICONOS}
        nombre={{ singular: "préstamo", plural: "préstamos" }}
        claveFila={(r) => r.id}
        abrirFila={{ etiqueta: (r) => `Ver la amortización de ${r.nombre}`, alAbrir: (r) => setAbierto(r.id) }}
        accionPrincipal={puedeEscribir ? <NuevoPrestamo tipos={tipos} cuentas={cuentas} hoy={hoy} /> : undefined}
        ariaLabel="Préstamos y financiamientos"
        vacio="Sin préstamos."
      />
      {p && <FichaPrestamo key={p.id} p={p} hoy={hoy} puedeEscribir={puedeEscribir} alCerrar={() => setAbierto(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Financiamientos por ciclo (giros)
// ---------------------------------------------------------------------------------------------

export interface FilaCiclo extends FinanciamientoCiclo {
  saldo: number;
  proximo: string | null;
}

function CamposCiclo({ c, cuentas, hoy, faltante, invalido, sufijo }: { c?: FinanciamientoCiclo; cuentas: Opcion[]; hoy: string; faltante: string | null; invalido: (id: string) => true | undefined; sufijo: string }) {
  const id = (x: string) => `ciclo-${x}-${sufijo}`;
  return (
    <>
      <Seccion icono={EtiquetaIcon} titulo="Financiamiento">
        <Campo etiqueta="Nombre" id={id("nombre")} obligatorio faltante={faltante}>
          <input id={id("nombre")} name="nombre" required maxLength={120} defaultValue={c?.nombre ?? ""} data-enfocar aria-invalid={invalido(id("nombre"))} placeholder="Ej: Giros a proveedor" className={`${fieldClass} w-full`} />
        </Campo>
        <Campo etiqueta="Acreedor" id={id("acreedor")} faltante={faltante}>
          <input id={id("acreedor")} name="acreedor" maxLength={120} defaultValue={c?.acreedor ?? ""} placeholder="Ej: Financista Ejemplo" className={`${fieldClass} w-full`} />
        </Campo>
      </Seccion>
      <Seccion icono={WalletIcon} titulo="Condiciones">
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Monto vigente en USD" id={id("monto")} obligatorio faltante={faltante}>
            <input id={id("monto")} name="monto" required inputMode="decimal" pattern="[0-9.,$ ]+" defaultValue={c ? String(c.monto) : ""} aria-invalid={invalido(id("monto"))} placeholder="Ej: 30000" className={`${fieldClass} w-full`} />
          </Campo>
          <Campo etiqueta="Costo por ciclo %" id={id("tasa")} obligatorio faltante={faltante}>
            <input id={id("tasa")} name="tasa_ciclo" required inputMode="decimal" defaultValue={c ? String(Math.round(c.tasaCiclo * 10_000) / 100) : ""} aria-invalid={invalido(id("tasa"))} placeholder="Ej: 20" className={`${fieldClass} w-full`} />
          </Campo>
          <Campo etiqueta="Días del ciclo" id={id("dias")} obligatorio faltante={faltante}>
            <input id={id("dias")} name="dias_ciclo" type="number" min={1} max={730} required defaultValue={c ? String(c.diasCiclo) : ""} aria-invalid={invalido(id("dias"))} placeholder="Ej: 70" className={`${fieldClass} w-full`} />
          </Campo>
          <Campo etiqueta="Primer giro" id={id("inicio")} obligatorio faltante={faltante}>
            <input id={id("inicio")} name="fecha_inicio" type="date" required defaultValue={c?.fechaInicio ?? hoy} aria-invalid={invalido(id("inicio"))} className={`${fieldClass} w-full`} />
          </Campo>
        </div>
        <Campo etiqueta="Al vencer" id={id("renovable")} faltante={faltante}>
          <select id={id("renovable")} name="renovable" defaultValue={c && !c.renovable ? "no" : "si"} className={`${fieldClass} w-full`}>
            <option value="si">Se renueva (se paga el costo)</option>
            <option value="no">Se paga todo</option>
          </select>
        </Campo>
      </Seccion>
      <Seccion icono={CalendarioIcon} titulo="Prepago">
        <CamposPrepago prefijo={id("prepago")} penalidad={c?.penalidadPrepago} comision={c?.comisionPrepago} faltante={faltante} />
        <Campo etiqueta="Cuenta de pago" id={id("cuenta")} faltante={faltante}>
          <select id={id("cuenta")} name="cuenta_id" defaultValue={c?.cuentaId ?? ""} className={`${fieldClass} w-full`}>
            <option value="">Sin elegir</option>
            {cuentas.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre}
              </option>
            ))}
          </select>
        </Campo>
      </Seccion>
    </>
  );
}

function EditarCiclo({ c, cuentas, hoy }: { c: FinanciamientoCiclo; cuentas: Opcion[]; hoy: string }) {
  return (
    <FichaCrear
      titulo={c.nombre}
      etiquetaCrear="Guardar cambios"
      action={guardarCiclo}
      mensajeExito="Financiamiento actualizado"
      ocultos={{ id: c.id }}
      boton={(abrir) => (
        <button type="button" onClick={abrir} aria-label={`Editar ${c.nombre}`} className={`rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted ${anilloFoco}`}>
          Editar
        </button>
      )}
    >
      {({ faltante, invalido }) => <CamposCiclo c={c} cuentas={cuentas} hoy={hoy} faltante={faltante} invalido={invalido} sufijo={c.id.slice(0, 8)} />}
    </FichaCrear>
  );
}

const DEF_CICLOS: DefTabla<FilaCiclo> = {
  clave: "tesoreria-ciclos",
  campos: [
    { id: "nombre", etiqueta: "Financiamiento", tipo: "texto", valor: (r) => r.nombre },
    { id: "saldo", etiqueta: "Saldo", tipo: "numero", valor: (r) => r.saldo },
    { id: "renovable", etiqueta: "Al vencer", tipo: "seleccion", valores: (r) => [r.renovable ? "Se renueva" : "Se paga todo"], agrupable: true },
  ],
};

const COL_CICLOS: ColumnaTabla<FilaCiclo, null>[] = [
  {
    id: "nombre",
    label: "Financiamiento",
    ocultable: false,
    render: (r) => (
      <span className="flex items-center gap-2">
        {r.nombre}
        {r.acreedor && <span className="text-xs text-muted-foreground">{r.acreedor}</span>}
      </span>
    ),
  },
  { id: "costo", label: "Costo por ciclo", ocultable: false, clase: "text-right tabular-nums", render: (r) => `${porcentaje(r.tasaCiclo * 100, { decimales: 2 })} · ${r.diasCiclo} días` },
  { id: "tea", label: "Tasa efectiva anual", ocultable: false, clase: "text-right tabular-nums", render: (r) => tasaTexto(tasaEfectivaAnualCiclo(r.tasaCiclo, r.diasCiclo)) },
  { id: "proximo", label: "Próximo vencimiento", ocultable: false, render: (r) => (r.proximo ? `${diaMes(r.proximo)} · ${d2(r.monto * r.tasaCiclo + (r.renovable ? 0 : r.monto))}` : "—") },
  { id: "saldo", label: "Saldo", ocultable: false, clase: "text-right tabular-nums font-medium", render: (r) => d2(r.saldo), total: (fs) => d2(fs.reduce((a, f) => a + f.saldo, 0)) },
];

export function TablaCiclos({ filas, cuentas, hoy, puedeEscribir }: { filas: FilaCiclo[]; cuentas: Opcion[]; hoy: string; puedeEscribir: boolean }) {
  return (
    <TablaDatos
      def={DEF_CICLOS}
      filas={filas}
      columnas={COL_CICLOS}
      contexto={null}
      iconos={ICONOS}
      nombre={{ singular: "financiamiento", plural: "financiamientos" }}
      claveFila={(r) => r.id}
      accionPrincipal={
        puedeEscribir ? (
          <FichaCrear titulo="Nuevo financiamiento por ciclo" etiquetaCrear="Agregar financiamiento" action={guardarCiclo} mensajeExito="Financiamiento agregado">
            {({ faltante, invalido }) => <CamposCiclo cuentas={cuentas} hoy={hoy} faltante={faltante} invalido={invalido} sufijo="nuevo" />}
          </FichaCrear>
        ) : undefined
      }
      accion={
        puedeEscribir
          ? {
              etiqueta: "Acciones",
              render: (r) => (
                <span className="flex items-center gap-1">
                  <EditarCiclo c={r} cuentas={cuentas} hoy={hoy} />
                  <ConfirmarEnFila etiqueta="Desactivar" ariaLabel={`Desactivar ${r.nombre}`} hecho="Financiamiento desactivado" ejecutar={() => desactivarCiclo(r.id)} />
                </span>
              ),
            }
          : undefined
      }
      ariaLabel="Financiamientos por ciclo"
      vacio="Sin financiamientos por ciclo."
    />
  );
}
