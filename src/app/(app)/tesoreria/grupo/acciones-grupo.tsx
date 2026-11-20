"use client";

import { useState, useTransition } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import { Campo } from "@/components/ui/campo-ficha";
import { anilloFoco, fieldClass, fieldClassSm } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { dinero2 } from "@/lib/af4/formato";
import { mesLargo } from "@/lib/af4/fecha";
import { CalendarioIcon, GastoIcon, PersonaIcon } from "@/lib/nav-icons";
import { ConfirmarEnFila } from "../confirmar-en-fila";
import { crearConfirmacionGrupo, guardarTasaPar, netearPar, registrarInteresGrupo } from "../grupo-actions";

const boton = `h-8 rounded-md bg-foreground px-3 text-xs font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`;

/** Netear un par (mejora 63): un abono en cada dirección por el menor de los dos saldos. */
export function BotonNetear({ a, b, nombre, monto }: { a: string; b: string; nombre: string; monto: number }) {
  return (
    <ConfirmarEnFila
      etiqueta="Netear"
      confirmar={`Sí, netear ${dinero2(monto)}`}
      ariaLabel={`Netear lo que se deben ${nombre}`}
      hecho="Neteo registrado"
      ejecutar={() => netearPar(a, b)}
    />
  );
}

export interface FilaInteres {
  a: string;
  b: string;
  /** «Costa Rica le debe a Panamá». */
  par: string;
  saldo: number;
  /** En porcentaje, o vacío. */
  tasa: string;
  /** El mes anterior y su interés calculado (0 sin tasa o sin saldo). */
  mes: string;
  interes: number;
  registrado: boolean;
}

function FilaTasaPar({ f, puedeEscribir }: { f: FilaInteres; puedeEscribir: boolean }) {
  const [tasa, setTasa] = useState(f.tasa);
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm">
      <span className="min-w-0 flex-1">
        <span className="font-medium">{f.par}</span>
        <span className={`ml-2 text-muted-foreground ${claseCifra}`}>saldo {dinero2(f.saldo)}</span>
      </span>
      {puedeEscribir ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            empezar(async () => {
              const r = await guardarTasaPar(f.a, f.b, tasa).catch(() => ({ error: "Se cortó la conexión." }));
              mostrarToast(r.error ?? "Tasa guardada", r.error ? "destructive" : "success");
            });
          }}
        >
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Tasa anual</span>
            <input
              inputMode="decimal"
              value={tasa}
              onChange={(e) => setTasa(e.target.value)}
              placeholder="Sin interés"
              aria-label={`Tasa anual de ${f.par}, en porcentaje`}
              className={`${fieldClassSm} w-24 text-right ${claseCifra}`}
            />
            <span aria-hidden="true">%</span>
          </label>
          {tasa !== f.tasa && (
            <button type="submit" disabled={pendiente} className={boton}>
              Guardar
            </button>
          )}
        </form>
      ) : (
        <span className={claseCifra}>{f.tasa ? `${f.tasa} % anual` : "Sin interés"}</span>
      )}
      {f.tasa && (
        <span className={`flex items-center gap-2 text-muted-foreground ${claseCifra}`}>
          {mesLargo(f.mes)}: {dinero2(f.interes)}
          {f.registrado ? (
            <span className="text-foreground">· registrado</span>
          ) : puedeEscribir && f.interes >= 0.01 ? (
            <ConfirmarEnFila
              etiqueta="Registrar"
              ariaLabel={`Registrar el interés de ${mesLargo(f.mes)} de ${f.par}`}
              hecho="Interés registrado"
              ejecutar={() => registrarInteresGrupo(f.a, f.b, f.mes)}
            />
          ) : null}
        </span>
      )}
    </li>
  );
}

/** Interés entre empresas (mejora 62): la tasa de cada par y el interés del mes anterior, para registrarlo como un costo. */
export function InteresEntreEmpresas({ filas, puedeEscribir }: { filas: FilaInteres[]; puedeEscribir: boolean }) {
  if (!filas.length) return <p className="px-4 py-6 text-sm text-muted-foreground">Ninguna empresa del grupo le debe a otra.</p>;
  return (
    <ul className="divide-y divide-border">
      {filas.map((f) => (
        <FilaTasaPar key={`${f.a}|${f.b}`} f={f} puedeEscribir={puedeEscribir} />
      ))}
    </ul>
  );
}

type Opcion = { id: string; nombre: string };

/** Registrar lo que dice cada empresa que le debe la otra a una fecha (mejora 68). */
export function NuevaConfirmacion({ empresas, hoy }: { empresas: Opcion[]; hoy: string }) {
  const lista = (id: string, name: string, invalido?: boolean) => (
    <select id={id} name={name} required defaultValue="" aria-invalid={invalido || undefined} className={`${fieldClass} w-full`}>
      <option value="" disabled>
        Elegir
      </option>
      {empresas.map((o) => (
        <option key={o.id} value={o.id}>
          {o.nombre}
        </option>
      ))}
    </select>
  );
  return (
    <FichaCrear titulo="Conciliar con las empresas" etiquetaBoton="Registrar saldos" etiquetaCrear="Guardar" action={crearConfirmacionGrupo} mensajeExito="Saldos guardados">
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={PersonaIcon} titulo="Par">
            <Campo etiqueta="Quien presta" id="conf-acreedor" obligatorio faltante={faltante}>
              {lista("conf-acreedor", "acreedor_id", invalido("conf-acreedor"))}
            </Campo>
            <Campo etiqueta="Quien debe" id="conf-deudor" obligatorio faltante={faltante}>
              {lista("conf-deudor", "deudor_id", invalido("conf-deudor"))}
            </Campo>
          </Seccion>
          <Seccion icono={GastoIcon} titulo="Lo que dice cada una (USD)">
            <Campo etiqueta="Según quien presta" id="conf-sa">
              <input id="conf-sa" name="saldo_acreedor" inputMode="decimal" placeholder="Ej: 12500.00" className={`${fieldClass} w-full tabular-nums`} />
            </Campo>
            <Campo etiqueta="Según quien debe" id="conf-sd">
              <input id="conf-sd" name="saldo_deudor" inputMode="decimal" placeholder="Ej: 12350.00" className={`${fieldClass} w-full tabular-nums`} />
            </Campo>
          </Seccion>
          <Seccion icono={CalendarioIcon} titulo="Corte">
            <Campo etiqueta="Fecha de corte" id="conf-fecha" obligatorio faltante={faltante}>
              <input id="conf-fecha" name="fecha_corte" type="date" required defaultValue={hoy} max={hoy} aria-invalid={invalido("conf-fecha")} className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Nota" id="conf-nota">
              <textarea id="conf-nota" name="nota" rows={2} maxLength={500} className={`${fieldClass} w-full`} />
            </Campo>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}
