"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { mesCorto } from "@/lib/af4/fecha";
import { dinero, veces } from "@/lib/af4/formato";
import { ETIQUETA_ESTADO, INDICADORES_COVENANT, type EstadoCovenant } from "@/lib/finanzas/covenants";
import { EstadoIcon, EtiquetaIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import { ConfirmarEnFila } from "../confirmar-en-fila";
import { desactivarCovenant, guardarCovenant } from "../deuda-actions";

const ICONOS: Record<string, IconoComp> = { indicador: EtiquetaIcon, estado: EstadoIcon };
const PUNTO: Record<EstadoCovenant, string> = { cumple: "bg-success", riesgo: "bg-warning", incumple: "bg-destructive", sin_dato: "bg-muted-foreground" };
const fmt = (v: number | null, f: "veces" | "dinero") => (v === null ? "—" : f === "veces" ? veces(v, 2) : dinero(v));

/** Un contrato al que se le puede poner un covenant: «general» o «<ámbito>:<id>». */
export interface OpcionContrato {
  valor: string;
  etiqueta: string;
  grupo: string;
}

export interface FilaCovenant {
  id: string;
  indicador: string;
  formato: "veces" | "dinero";
  sentido: "max" | "min";
  umbral: number;
  contrato: string;
  valor: number | null;
  estado: EstadoCovenant;
  peor: EstadoCovenant;
  serie: { fecha: string; valor: number | null; estado: EstadoCovenant }[];
  primerIncumplimiento: string | null;
  nota: string | null;
}

function NuevoCovenant({ contratos }: { contratos: OpcionContrato[] }) {
  const grupos = [...new Set(contratos.map((c) => c.grupo))];
  return (
    <FichaCrear titulo="Nuevo covenant" etiquetaCrear="Agregar covenant" action={guardarCovenant} mensajeExito="Covenant agregado" abrirConNuevo>
      {({ faltante, invalido }) => (
        <Seccion icono={EtiquetaIcon} titulo="Covenant">
          <Campo etiqueta="Contrato" id="covenant-contrato" obligatorio faltante={faltante}>
            <select id="covenant-contrato" name="contrato" required defaultValue="general" data-enfocar className={`${fieldClass} w-full`}>
              {grupos.map((g) => (
                <optgroup key={g} label={g}>
                  {contratos
                    .filter((c) => c.grupo === g)
                    .map((c) => (
                      <option key={c.valor} value={c.valor}>
                        {c.etiqueta}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Indicador" id="covenant-indicador" obligatorio faltante={faltante}>
              <select id="covenant-indicador" name="indicador" required defaultValue="" aria-invalid={invalido("covenant-indicador")} className={`${fieldClass} w-full`}>
                <option value="" disabled>
                  Elegir
                </option>
                {INDICADORES_COVENANT.map((i) => (
                  <option key={i.clave} value={i.clave}>
                    {i.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Umbral (veces o USD)" id="covenant-umbral" obligatorio faltante={faltante}>
              <input id="covenant-umbral" name="umbral" required inputMode="decimal" aria-invalid={invalido("covenant-umbral")} placeholder="Ej: 3.5" className={`${fieldClass} w-full`} />
            </Campo>
          </div>
          <Campo etiqueta="Nota" id="covenant-nota" faltante={faltante}>
            <input id="covenant-nota" name="nota" maxLength={500} placeholder="Ej: Cláusula 8.2 del contrato" className={`${fieldClass} w-full`} />
          </Campo>
        </Seccion>
      )}
    </FichaCrear>
  );
}

const DEF: DefTabla<FilaCovenant> = {
  clave: "tesoreria-covenants",
  campos: [
    { id: "indicador", etiqueta: "Covenant", tipo: "seleccion", valores: (r) => [r.indicador], agrupable: true },
    { id: "contrato", etiqueta: "Contrato", tipo: "seleccion", valores: (r) => [r.contrato], agrupable: true },
    { id: "estado", etiqueta: "Estado", tipo: "seleccion", valores: (r) => [ETIQUETA_ESTADO[r.peor]], agrupable: true },
  ],
};

const COLUMNAS: ColumnaTabla<FilaCovenant, null>[] = [
  {
    id: "indicador",
    label: "Covenant",
    ocultable: false,
    render: (r) => (
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${PUNTO[r.peor]}`} />
        {r.indicador} {r.sentido === "max" ? "≤" : "≥"} {fmt(r.umbral, r.formato)}
      </span>
    ),
  },
  { id: "contrato", label: "Contrato", ocultable: true, render: (r) => r.contrato },
  { id: "valor", label: "Último cierre", ocultable: false, clase: "text-right tabular-nums", render: (r) => fmt(r.valor, r.formato) },
  {
    id: "estado",
    label: "Hoy",
    ocultable: false,
    render: (r) => (
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${PUNTO[r.estado]}`} />
        {ETIQUETA_ESTADO[r.estado]}
      </span>
    ),
  },
  {
    id: "serie",
    label: "Próximos 6 meses",
    ocultable: false,
    render: (r) => (
      <span className="flex items-center gap-1" role="img" aria-label={r.serie.map((m) => `${mesCorto(m.fecha)}: ${ETIQUETA_ESTADO[m.estado]}`).join(", ")}>
        {r.serie.map((m) => (
          <span key={m.fecha} aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${PUNTO[m.estado]}`} />
        ))}
      </span>
    ),
  },
  { id: "incumple", label: "Incumpliría en", ocultable: false, render: (r) => (r.primerIncumplimiento ? mesCorto(r.primerIncumplimiento) : "—") },
];

export function TablaCovenants({ filas, contratos, puedeEscribir }: { filas: FilaCovenant[]; contratos: OpcionContrato[]; puedeEscribir: boolean }) {
  return (
    <TablaDatos
      def={DEF}
      filas={filas}
      columnas={COLUMNAS}
      contexto={null}
      iconos={ICONOS}
      nombre={{ singular: "covenant", plural: "covenants" }}
      claveFila={(r) => r.id}
      accionPrincipal={puedeEscribir ? <NuevoCovenant contratos={contratos} /> : undefined}
      accion={
        puedeEscribir
          ? { etiqueta: "Acciones", render: (r) => <ConfirmarEnFila etiqueta="Quitar" ariaLabel={`Quitar el covenant ${r.indicador}`} hecho="Covenant quitado" ejecutar={() => desactivarCovenant(r.id)} /> }
          : undefined
      }
      ariaLabel="Covenants"
      vacio="Sin covenants."
    />
  );
}

