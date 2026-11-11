"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { fechaCorta } from "@/lib/af4/fecha";
import { dinero } from "@/lib/af4/formato";
import { CalendarioIcon, EtiquetaIcon, ExtractoIcon, WalletIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import { eliminarSaldoBancario, guardarSaldoBancario } from "../actions";
import { ConfirmarEnFila } from "../confirmar-en-fila";

export interface FilaUltimoSaldo {
  id: string;
  cuenta: string;
  clase: string;
  saldo: number | null;
  fecha: string | null;
  origen: "manual" | "extracto" | null;
  dias: number | null;
  viejo: boolean;
}

export interface FilaSaldoManual {
  id: string;
  cuenta: string;
  fecha: string;
  saldo: number;
  nota: string;
}

const CLASES: Record<string, string> = { banco: "Banco", billetera: "Billetera", tarjeta: "Tarjeta", otro: "Otro" };
const d2 = (v: number) => dinero(v, "USD", { decimales: 2 });

const DEF_ULTIMOS: DefTabla<FilaUltimoSaldo> = {
  clave: "tesoreria-ultimos-saldos",
  campos: [
    { id: "cuenta", etiqueta: "Cuenta", tipo: "texto", valor: (r) => r.cuenta },
    { id: "clase", etiqueta: "Clase", tipo: "seleccion", valores: (r) => [CLASES[r.clase] ?? r.clase], agrupable: true },
    { id: "saldo", etiqueta: "Saldo", tipo: "numero", valor: (r) => r.saldo ?? 0 },
    { id: "fecha", etiqueta: "Fecha", tipo: "texto", valor: (r) => r.fecha ?? "" },
    { id: "origen", etiqueta: "Origen", tipo: "seleccion", valores: (r) => [r.origen === "manual" ? "Carga manual" : r.origen === "extracto" ? "Extracto" : "Sin dato"], agrupable: true },
  ],
};
const COL_ULTIMOS: ColumnaTabla<FilaUltimoSaldo, null>[] = [
  {
    id: "cuenta",
    label: "Cuenta",
    ocultable: false,
    render: (r) => (
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.saldo === null ? "bg-muted-foreground" : r.viejo ? "bg-warning" : "bg-success"}`} />
        {r.cuenta}
        {r.viejo && <span className="sr-only">(saldo viejo)</span>}
      </span>
    ),
  },
  { id: "clase", label: "Clase", ocultable: true, render: (r) => CLASES[r.clase] ?? r.clase },
  { id: "saldo", label: "Último saldo", ocultable: false, clase: "text-right tabular-nums", render: (r) => (r.saldo === null ? "—" : d2(r.saldo)) },
  { id: "fecha", label: "Al", ocultable: false, render: (r) => (r.fecha ? `${fechaCorta(r.fecha)}${r.dias ? ` · hace ${r.dias} días` : " · hoy"}` : "—") },
  { id: "origen", label: "Origen", ocultable: true, render: (r) => (r.origen === "manual" ? "Carga manual" : r.origen === "extracto" ? "Extracto" : "—") },
];

const DEF_MANUALES: DefTabla<FilaSaldoManual> = {
  clave: "tesoreria-saldos-manuales",
  campos: [
    { id: "cuenta", etiqueta: "Cuenta", tipo: "seleccion", valores: (r) => [r.cuenta], agrupable: true },
    { id: "fecha", etiqueta: "Fecha", tipo: "texto", valor: (r) => r.fecha },
    { id: "saldo", etiqueta: "Saldo", tipo: "numero", valor: (r) => r.saldo },
    { id: "nota", etiqueta: "Nota", tipo: "texto", valor: (r) => r.nota },
  ],
};
const COL_MANUALES: ColumnaTabla<FilaSaldoManual, null>[] = [
  { id: "cuenta", label: "Cuenta", ocultable: false, render: (r) => r.cuenta },
  { id: "fecha", label: "Fecha", ocultable: false, render: (r) => fechaCorta(r.fecha) },
  { id: "saldo", label: "Saldo", ocultable: false, clase: "text-right tabular-nums", render: (r) => d2(r.saldo) },
  { id: "nota", label: "Nota", ocultable: true, render: (r) => <span className="text-muted-foreground">{r.nota}</span> },
];
const ICONOS: Record<string, IconoComp> = { cuenta: WalletIcon, clase: EtiquetaIcon, saldo: WalletIcon, fecha: CalendarioIcon, origen: ExtractoIcon, nota: ExtractoIcon };

function CrearSaldoBancario({ cuentas, hoy }: { cuentas: { id: string; nombre: string }[]; hoy: string }) {
  return (
    <FichaCrear titulo="Saldo de una cuenta" etiquetaCrear="Guardar saldo" action={guardarSaldoBancario} mensajeExito="Saldo guardado" abrirConNuevo>
      {({ faltante, invalido }) => (
        <Seccion icono={WalletIcon} titulo="Saldo">
          <Campo etiqueta="Cuenta" id="saldo-cuenta" obligatorio faltante={faltante}>
            <select id="saldo-cuenta" name="cuenta_id" required defaultValue="" data-enfocar aria-invalid={invalido("saldo-cuenta")} className={`${fieldClass} w-full`}>
              <option value="" disabled>
                Elige una cuenta
              </option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Fecha" id="saldo-fecha" obligatorio faltante={faltante}>
            <input id="saldo-fecha" name="fecha" type="date" required max={hoy} defaultValue={hoy} aria-invalid={invalido("saldo-fecha")} className={`${fieldClass} w-full`} />
          </Campo>
          <Campo etiqueta="Saldo al final del día" id="saldo-monto" obligatorio faltante={faltante}>
            <input id="saldo-monto" name="saldo" required inputMode="decimal" pattern="-?[0-9.,$ ]+" aria-invalid={invalido("saldo-monto")} placeholder="Ej: 18250.40" className={`${fieldClass} w-full`} />
          </Campo>
          <Campo etiqueta="Nota" id="saldo-nota" faltante={faltante}>
            <input id="saldo-nota" name="nota" maxLength={500} placeholder="Ej: Banca en línea" className={`${fieldClass} w-full`} />
          </Campo>
        </Seccion>
      )}
    </FichaCrear>
  );
}

export function TablasSaldos({
  ultimos,
  manuales,
  cuentas,
  hoy,
  puedeEscribir,
}: {
  ultimos: FilaUltimoSaldo[];
  manuales: FilaSaldoManual[] | null;
  cuentas: { id: string; nombre: string }[];
  hoy: string;
  puedeEscribir: boolean;
}) {
  return (
    <>
      <section aria-labelledby="titulo-ultimos" className="flex flex-col gap-2">
        <h2 id="titulo-ultimos" className="text-sm font-semibold">
          Último saldo por cuenta
        </h2>
        <TablaDatos
          def={DEF_ULTIMOS}
          filas={ultimos}
          columnas={COL_ULTIMOS}
          contexto={null}
          iconos={ICONOS}
          nombre={{ singular: "cuenta", plural: "cuentas" }}
          claveFila={(r) => r.id}
          ariaLabel="Último saldo de cada cuenta"
          vacio="No hay cuentas de caja."
        />
      </section>
      {manuales && (
        <section aria-labelledby="titulo-manuales" className="flex flex-col gap-2">
          <h2 id="titulo-manuales" className="text-sm font-semibold">
            Saldos cargados a mano
          </h2>
          <TablaDatos
            def={DEF_MANUALES}
            filas={manuales}
            columnas={COL_MANUALES}
            contexto={null}
            iconos={ICONOS}
            nombre={{ singular: "saldo", plural: "saldos" }}
            claveFila={(r) => r.id}
            accionPrincipal={puedeEscribir ? <CrearSaldoBancario cuentas={cuentas} hoy={hoy} /> : undefined}
            accion={
              puedeEscribir
                ? {
                    etiqueta: "Eliminar",
                    render: (r) => (
                      <ConfirmarEnFila etiqueta="Eliminar" ariaLabel={`Eliminar el saldo de ${r.cuenta} del ${fechaCorta(r.fecha)}`} hecho="Saldo eliminado" ejecutar={() => eliminarSaldoBancario(r.id)} />
                    ),
                  }
                : undefined
            }
            ariaLabel="Saldos cargados a mano"
            vacio="Sin saldos cargados a mano."
          />
        </section>
      )}
    </>
  );
}
