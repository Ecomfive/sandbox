"use client";

import { useMemo, useState, useTransition } from "react";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { fieldClassSm, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { numeroPublicacion } from "@/lib/publicaciones/publicacion";
import {
  MOTIVOS_FUERA,
  TIPOS_ALTA,
  porcentajeSistema,
  resumirUso,
  type AltaPublicacion,
  type Conteo,
  type MotivoFuera,
} from "@/lib/publicaciones/origen";
import { guardarMotivoUso } from "./actions";

const etiquetaTipo = (t: AltaPublicacion["tipo"]) => TIPOS_ALTA.find((x) => x.valor === t)?.etiqueta ?? t;
const etiquetaMotivo = (m: MotivoFuera) => MOTIVOS_FUERA.find((x) => x.valor === m)?.etiqueta ?? m;
const textoPorcentaje = (c: Conteo) => {
  const p = porcentajeSistema(c);
  return p === null ? "—" : `${p} %`;
};
const dia = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "UTC" });

const claseCelda = "px-3 py-2 align-top";
const claseTitulo = "px-3 py-2 text-left text-xs font-medium text-muted-foreground";
const claseNumero = `${claseCelda} text-right tabular-nums`;

function TablaConteos({ titulo, encabezado, filas }: { titulo: string; encabezado: string; filas: (Conteo & { clave: string; etiqueta: string })[] }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h2 className="text-sm font-semibold tracking-tight">{titulo}</h2>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th scope="col" className={claseTitulo}>
                {encabezado}
              </th>
              <th scope="col" className={`${claseTitulo} text-right`}>
                Sistema
              </th>
              <th scope="col" className={`${claseTitulo} text-right`}>
                Dropi
              </th>
              <th scope="col" className={`${claseTitulo} text-right`}>
                En el sistema
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave} className="border-t border-border">
                <td className={claseCelda}>{f.etiqueta}</td>
                <td className={claseNumero}>{f.sistema}</td>
                <td className={claseNumero}>{f.dropi}</td>
                <td className={`${claseNumero} font-medium`}>{textoPorcentaje(f)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FilaDropi({ a, puedeEscribir, nombrePais }: { a: AltaPublicacion; puedeEscribir: boolean; nombrePais: string }) {
  const { mostrarToast } = useToast();
  const [motivo, setMotivo] = useState<string>(a.motivo ?? "");
  const [nota, setNota] = useState(a.nota);
  const [pending, startTransition] = useTransition();

  const guardar = (m: string, n: string) =>
    startTransition(async () => {
      const r = await guardarMotivoUso(a.id, m, n);
      if (r.error) mostrarToast(r.error, "destructive");
    });

  return (
    <tr className="border-t border-border">
      <td className={claseCelda}>
        <span className="block font-medium">{a.nombre}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{numeroPublicacion(a.numero)}</span>
      </td>
      <td className={claseCelda}>{nombrePais}</td>
      <td className={`${claseCelda} whitespace-nowrap`}>{dia(a.fecha)}</td>
      <td className={claseCelda}>{etiquetaTipo(a.tipo)}</td>
      <td className={claseCelda}>{a.persona ?? "—"}</td>
      <td className={claseCelda}>
        <select
          aria-label={`Motivo de ${a.nombre}`}
          value={motivo}
          disabled={!puedeEscribir || pending}
          onChange={(e) => {
            setMotivo(e.target.value);
            guardar(e.target.value, nota);
          }}
          className={`${fieldClassSm} w-56`}
        >
          <option value="">Sin motivo</option>
          {MOTIVOS_FUERA.map((m) => (
            <option key={m.valor} value={m.valor}>
              {m.etiqueta}
            </option>
          ))}
        </select>
      </td>
      <td className={claseCelda}>
        <input
          aria-label={`Nota de ${a.nombre}`}
          value={nota}
          maxLength={300}
          placeholder={motivo ? "Qué pasó exactamente" : "Elige primero el motivo"}
          disabled={!puedeEscribir || !motivo}
          onChange={(e) => setNota(e.target.value)}
          onBlur={() => {
            if (motivo && nota.trim() !== a.nota) guardar(motivo, nota);
          }}
          className={`${fieldClassSm} w-64`}
        />
      </td>
    </tr>
  );
}

export function PanelUso({ altas, paises, puedeEscribir }: { altas: AltaPublicacion[]; paises: { codigo: string; nombre: string }[]; puedeEscribir: boolean }) {
  const [pais, setPais] = useState("");
  const visibles = useMemo(() => (pais ? altas.filter((a) => a.pais === pais) : altas), [altas, pais]);
  const r = useMemo(() => resumirUso(visibles), [visibles]);
  const enDropi = visibles.filter((a) => a.origen === "dropi");
  const nombrePais = (codigo: string) => paises.find((p) => p.codigo === codigo)?.nombre ?? codigo;
  const nuevos = r.porTipo.find((t) => t.tipo === "nuevo") ?? { sistema: 0, dropi: 0 };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Lo creado desde el 24 de octubre de 2026: qué salió del sistema y qué se hizo directo en Dropi. El motivo de cada caso dice qué hay que arreglar para que nadie tenga que ir a Dropi.
        </p>
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>País</span>
          <select value={pais} onChange={(e) => setPais(e.target.value)} className={`${fieldClassSm} w-44`}>
            <option value="">Todos</option>
            {paises.filter((p) => altas.some((a) => a.pais === p.codigo)).map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      <KpiGrid>
        <KpiCard titulo="Productos nuevos en el sistema" valor={textoPorcentaje(nuevos)} subtexto={`${nuevos.sistema} en el sistema · ${nuevos.dropi} en Dropi`} tono={nuevos.dropi > 0 ? "warning" : "success"} />
        <KpiCard titulo="Todo lo creado en el sistema" valor={textoPorcentaje(r.total)} subtexto={`${r.total.sistema} en el sistema · ${r.total.dropi} en Dropi`} tono="info" />
        <KpiCard titulo="Hecho en Dropi sin motivo" valor={r.sinMotivo} subtexto={`de ${r.total.dropi} hechos en Dropi`} tono={r.sinMotivo > 0 ? "warning" : "success"} />
      </KpiGrid>

      <div className="grid gap-6 lg:grid-cols-3">
        <TablaConteos titulo="Por tipo" encabezado="Qué fue" filas={r.porTipo.map((t) => ({ ...t, clave: t.tipo, etiqueta: etiquetaTipo(t.tipo) }))} />
        <TablaConteos titulo="Por semana" encabezado="Semana del" filas={r.porSemana.map((s) => ({ ...s, clave: s.semana, etiqueta: dia(s.semana) }))} />
        <TablaConteos titulo="Por país" encabezado="País" filas={r.porPais.map((p) => ({ ...p, clave: p.pais, etiqueta: nombrePais(p.pais) }))} />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Por qué se hace en Dropi</h2>
        {r.motivos.length ? (
          <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border bg-card p-0 text-sm">
            {r.motivos.map((m) => (
              <li key={m.motivo} className="flex items-center justify-between gap-4 px-3 py-2">
                <span>{etiquetaMotivo(m.motivo)}</span>
                <span className="font-medium tabular-nums">{m.n}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Todavía no hay motivos anotados: anótalos en la lista de abajo.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Hecho en Dropi ({enDropi.length})</h2>
        <p className="text-xs text-muted-foreground">Dropi no dice quién creó un producto. «Lo pasó al sistema» es quien lo registró aquí después: es a quien hay que preguntarle.</p>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {["Publicación", "País", "Fecha", "Qué fue", "Lo pasó al sistema", "Motivo", "Nota"].map((t) => (
                  <th key={t} scope="col" className={claseTitulo}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enDropi.map((a) => (
                <FilaDropi key={a.id} a={a} puedeEscribir={puedeEscribir} nombrePais={nombrePais(a.pais)} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
