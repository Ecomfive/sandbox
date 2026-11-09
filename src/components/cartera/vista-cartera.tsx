"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { useFiltros } from "@/components/tabla/ganchos";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { GraficaBarrasAF4 } from "@/components/af4/graficas-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { FiltrosRapidosAF4, KpiFiltroAF4 } from "@/components/af4/kpi-filtro-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { anilloFoco } from "@/components/ui/field";
import type { Tono } from "@/components/ui/kpi-card";
import { fechaCorta } from "@/lib/af4/fecha";
import { dinero, dineroKpi, entero, fraccion } from "@/lib/af4/formato";
import { CalendarioIcon, EstadoIcon, ExtractoIcon, PersonaIcon, TiendaIcon, WalletIcon } from "@/lib/nav-icons";
import { alternarAtajo, atajoActivo, type AtajoFiltro } from "@/lib/tabla/atajos";
import type { NombreFilas } from "@/lib/tabla/pie";
import { ETIQUETA_ESTADO, ETIQUETA_TRAMO, type Clase, type ResumenCartera, type Tramo } from "@/lib/finanzas/cxc-cxp";
import type { FilaCartera, Opcion } from "@/lib/finanzas/cargar-cartera";
import { CrearDocumentoPanel } from "./crear-documento-panel";
import { VENCIDO, defDe } from "./def-cartera";
import { FichaDocumento, TONO_ESTADO, usd } from "./ficha-documento";

const NOMBRE: NombreFilas = { singular: "documento", plural: "documentos" };
const ICONOS: Record<string, IconoComp> = {
  estado: EstadoIcon,
  contraparte: PersonaIcon,
  tramo: CalendarioIcon,
  vencido: CalendarioIcon,
  unidad: TiendaIcon,
  documento: ExtractoIcon,
  motivo: ExtractoIcon,
  monto: WalletIcon,
  abonado: WalletIcon,
  saldo: WalletIcon,
  fecha: CalendarioIcon,
  vence: CalendarioIcon,
  origen: ExtractoIcon,
};

const suma = (filas: FilaCartera[], k: "monto" | "abonado" | "saldo") => usd(filas.reduce((a, f) => a + f[k], 0));

const TONO_TRAMO: Record<Tramo, Tono> = { "0-30": "success", "31-60": "warning", "61-90": "warning", "90+": "destructive", "sin-fecha": "neutral" };

function columnas(clase: Clase): ColumnaTabla<FilaCartera>[] {
  return [
    {
      id: "documento",
      label: "Documento",
      ocultable: false,
      render: (f) => (
        <span className="flex items-center gap-1.5 whitespace-nowrap font-medium">
          {f.vencido && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />}
          {f.documento || "Sin número"}
          {f.vencido && <span className="sr-only"> (vencido)</span>}
        </span>
      ),
    },
    { id: "contraparte", label: clase === "cobrar" ? "Cliente / deudor" : "Acreedor", ocultable: true, clase: "max-w-56 truncate", render: (f) => f.contraparte },
    { id: "motivo", label: "Motivo", ocultable: true, oculta: true, clase: "max-w-64 truncate text-muted-foreground", render: (f) => f.motivo || "—" },
    { id: "unidad", label: "Tienda", ocultable: true, clase: "whitespace-nowrap text-muted-foreground", render: (f) => f.unidad },
    { id: "fecha", label: "Fecha", ocultable: true, clase: "whitespace-nowrap", render: (f) => (f.fecha ? fechaCorta(f.fecha) : "—") },
    { id: "vence", label: "Vence", ocultable: true, clase: "whitespace-nowrap text-muted-foreground", render: (f) => (f.vence ? fechaCorta(f.vence) : "—") },
    { id: "tramo", label: "Antigüedad", ocultable: true, clase: "whitespace-nowrap", render: (f) => ETIQUETA_TRAMO[f.tramo] },
    { id: "monto", label: "Monto", ocultable: true, clase: "text-right tabular-nums whitespace-nowrap", render: (f) => usd(f.monto), total: (fs) => suma(fs, "monto") },
    { id: "abonado", label: "Abonado", ocultable: true, clase: "text-right tabular-nums whitespace-nowrap text-muted-foreground", render: (f) => usd(f.abonado), total: (fs) => suma(fs, "abonado") },
    { id: "saldo", label: "Saldo", ocultable: false, clase: "text-right tabular-nums whitespace-nowrap font-medium", render: (f) => usd(f.saldo), total: (fs) => suma(fs, "saldo") },
    { id: "estado", label: "Estado", ocultable: true, render: (f) => <Badge tone={TONO_ESTADO[f.estado]}>{ETIQUETA_ESTADO[f.estado]}</Badge> },
  ];
}
const COLUMNAS_COBRAR = columnas("cobrar");
const COLUMNAS_PAGAR = columnas("pagar");

/**
 * Una cartera completa: indicadores (total, vencido, antigüedad e incobrable; cada uno filtra la tabla), la concentración
 * por contraparte (las 5 primeras, también filtran), la tabla con «Agregar» y la ficha de cada documento.
 */
export function VistaCartera({
  clase,
  filas,
  resumen,
  unidades,
  cuentas,
  contrapartes,
  puedeEscribir,
}: {
  clase: Clase;
  filas: FilaCartera[];
  resumen: ResumenCartera;
  unidades: Opcion[];
  cuentas: Opcion[];
  contrapartes: string[];
  puedeEscribir: boolean;
}) {
  const def = defDe(clase);
  const [abierta, setAbierta] = useState<string | null>(null);
  const atajoVencido: AtajoFiltro = { id: "vencido", etiqueta: "Vencidos", ayuda: "Filtrar la tabla: solo lo vencido", filtro: { campo: "vencido", valor: { tipo: "seleccion", valores: [VENCIDO] } } };
  const tramos: Tramo[] = ["0-30", "31-60", "61-90", "90+", ...(resumen.tramos["sin-fecha"] > 0 ? (["sin-fecha"] as Tramo[]) : [])];

  const pctDelTotal = (v: number) => (resumen.total > 0 ? fraccion(v / resumen.total, { decimales: 0 }) : null);
  const atajoTramo = (t: Tramo): AtajoFiltro => ({
    id: `tramo-${t}`,
    etiqueta: ETIQUETA_TRAMO[t],
    ayuda: `Filtrar la tabla: antigüedad ${ETIQUETA_TRAMO[t].toLowerCase()}`,
    filtro: { campo: "tramo", valor: { tipo: "seleccion", valores: [ETIQUETA_TRAMO[t]] } },
    suma: true,
  });
  const vencidoPct = pctDelTotal(resumen.vencido);

  return (
    <>
      <FilaKpiAF4>
        <KpiAF4
          titulo={clase === "cobrar" ? "Total por cobrar" : "Total por pagar"}
          destacado
          valor={dineroKpi(resumen.total)}
          subtexto={`${entero(resumen.documentosAbiertos)} ${resumen.documentosAbiertos === 1 ? "documento abierto" : "documentos abiertos"}`}
        />
        <KpiFiltroAF4
          def={def}
          atajo={atajoVencido}
          titulo="Vencido"
          tono={resumen.vencido > 0 ? "destructive" : "success"}
          valor={dineroKpi(resumen.vencido)}
          subtexto={`${vencidoPct ? `${vencidoPct} del total · ` : ""}${entero(resumen.documentosVencidos)} ${resumen.documentosVencidos === 1 ? "documento" : "documentos"}`}
        />
        <KpiFiltroAF4
          def={def}
          atajo={atajoTramo("90+")}
          titulo={ETIQUETA_TRAMO["90+"]}
          tono={resumen.tramos["90+"] > 0 ? TONO_TRAMO["90+"] : "neutral"}
          valor={dineroKpi(resumen.tramos["90+"])}
          subtexto={pctDelTotal(resumen.tramos["90+"]) ? `${pctDelTotal(resumen.tramos["90+"])} del total` : undefined}
        />
        {clase === "cobrar" && resumen.incobrable > 0 && (
          <KpiFiltroAF4
            def={def}
            atajo={{ id: "incobrable", etiqueta: "Incobrable", ayuda: "Filtrar la tabla: lo marcado incobrable", filtro: { campo: "estado", valor: { tipo: "seleccion", valores: [ETIQUETA_ESTADO.incobrable] } } }}
            tono="destructive"
            titulo="Incobrable"
            valor={dineroKpi(resumen.incobrable)}
          />
        )}
      </FilaKpiAF4>

      <div className="flex flex-wrap gap-6">
        <div className="min-w-0 flex-[3_1_34rem]">
          <GraficaBarrasAF4
            id={`grafica-antiguedad-${clase}`}
            titulo="Antigüedad del saldo"
            detalle="USD"
            alto={220}
            etiquetaEje="Antigüedad"
            datos={tramos.map((t) => ({ etiqueta: ETIQUETA_TRAMO[t], saldo: resumen.tramos[t] }))}
            series={[{ clave: "saldo", nombre: "Saldo abierto", color: 1 }]}
            notas={Object.fromEntries(tramos.map((t) => [ETIQUETA_TRAMO[t], pctDelTotal(resumen.tramos[t]) ? `${pctDelTotal(resumen.tramos[t])} del total` : ""]))}
            accion={<FiltrosRapidosAF4 def={def} atajos={tramos.map(atajoTramo)} etiqueta="Filtrar la tabla por antigüedad" />}
          />
        </div>
        <Concentracion clase={clase} resumen={resumen} />
      </div>

      <TablaDatos
        def={def}
        filas={filas}
        columnas={clase === "cobrar" ? COLUMNAS_COBRAR : COLUMNAS_PAGAR}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        formatearTotal={usd}
        anchoMinimo="60rem"
        accionPrincipal={puedeEscribir ? <CrearDocumentoPanel clase={clase} unidades={unidades} contrapartes={contrapartes} /> : undefined}
        abrirFila={{ etiqueta: (f) => `Abrir ${f.documento || "el documento"} de ${f.contraparte}`, alAbrir: (f) => setAbierta(f.id) }}
        ariaLabel={clase === "cobrar" ? "Cuentas por cobrar" : "Cuentas por pagar"}
        vacio={clase === "cobrar" ? "No hay cuentas por cobrar. Agrégalas o importa el Excel." : "No hay cuentas por pagar. Agrégalas o importa el Excel."}
      />
      <FichaDocumento clase={clase} fila={filas.find((f) => f.id === abierta)} unidades={unidades} cuentas={cuentas} puedeEscribir={puedeEscribir} alCerrar={() => setAbierta(null)} />
    </>
  );
}

/** Las 5 contrapartes con más saldo abierto, con su parte del total; pulsar una filtra la tabla por ella. */
function Concentracion({ clase, resumen }: { clase: Clase; resumen: ResumenCartera }) {
  const def = defDe(clase);
  const [filtros, cambiar] = useFiltros(def);
  return (
    <MarcoAF4
      id={`concentracion-${clase}`}
      titulo={clase === "cobrar" ? "Clientes con más saldo" : "Acreedores con más saldo"}
      detalle={resumen.top.length ? `Top ${resumen.top.length}: ${fraccion(resumen.parteTop, { decimales: 0 })}` : undefined}
      className="flex-[1_1_20rem]"
    >
      {resumen.top.length === 0 ? (
        <p className="px-1 py-2 text-sm text-muted-foreground">Sin saldo abierto.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {resumen.top.map((c) => {
            const atajo: AtajoFiltro = { id: `contraparte-${c.contraparte}`, etiqueta: c.contraparte, ayuda: `Filtrar la tabla: ${c.contraparte}`, filtro: { campo: "contraparte", valor: { tipo: "seleccion", valores: [c.contraparte] } }, suma: true };
            const activo = atajoActivo(filtros, atajo);
            return (
              <li key={c.contraparte}>
                <button
                  type="button"
                  aria-pressed={activo}
                  onClick={() => cambiar(alternarAtajo(filtros, atajo))}
                  className={`flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${activo ? "bg-muted ring-1 ring-foreground" : ""} ${anilloFoco}`}
                >
                  <span className="flex w-full items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate">{c.contraparte}</span>
                    <span className="tabular-nums font-medium">{dinero(c.saldo)}</span>
                    <span className="w-14 text-right tabular-nums text-xs text-muted-foreground">{fraccion(c.parte)}</span>
                  </span>
                  <span aria-hidden="true" className="h-1 w-full overflow-hidden rounded-full bg-border">
                    <span className={`block h-full rounded-full ${c.parte >= 0.5 ? "bg-warning" : "bg-[var(--grafica-1)]"}`} style={{ width: `${Math.max(2, c.parte * 100)}%` }} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </MarcoAF4>
  );
}
