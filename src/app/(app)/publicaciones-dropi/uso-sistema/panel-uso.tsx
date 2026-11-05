"use client";

import { useMemo, useState, useTransition } from "react";
import { Delta, Pastilla, claseThLista, claseTdLista } from "@/components/panel/piezas-panel";
import { fieldClassSm, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { AlertaIcon, TiendaIcon, VentasIcon } from "@/lib/nav-icons";
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
import { AnilloUso, AvanceMotivos, CifraUso, FilaMotivo, FilaProporcion, GraficaSemanas, LeyendaUso, TarjetaUso } from "./graficas-uso";

const etiquetaTipo = (t: AltaPublicacion["tipo"]) => TIPOS_ALTA.find((x) => x.valor === t)?.etiqueta ?? t;
const etiquetaMotivo = (m: MotivoFuera) => MOTIVOS_FUERA.find((x) => x.valor === m)?.etiqueta ?? m;
const textoPorcentaje = (c: Conteo) => {
  const p = porcentajeSistema(c);
  return p === null ? "—" : `${p} %`;
};
const dia = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "UTC" });

const claseCelda = `${claseTdLista} align-middle whitespace-normal`;

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
    <tr className="hover:bg-muted/50">
      <td className={claseCelda}>
        <span className="block font-medium">{a.nombre}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{numeroPublicacion(a.numero)}</span>
      </td>
      <td className={claseCelda}>{nombrePais}</td>
      <td className={`${claseCelda} whitespace-nowrap`}>{dia(a.fecha)}</td>
      <td className={claseCelda}>
        <Pastilla>{etiquetaTipo(a.tipo)}</Pastilla>
      </td>
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
          className={`${fieldClassSm} w-48`}
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
          className={`${fieldClassSm} w-52`}
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
  // La gráfica va de la semana más vieja a la más nueva; `porSemana` viene al revés.
  const semanas = [...r.porSemana].reverse().map((s) => ({ ...s, etiqueta: dia(s.semana) }));
  const ultima = r.porSemana[0] ?? null;
  const pctUltima = ultima ? porcentajeSistema(ultima) : null;
  const pctAnterior = r.porSemana[1] ? porcentajeSistema(r.porSemana[1]) : null;
  const cambio = pctUltima !== null && pctAnterior !== null ? pctUltima - pctAnterior : null;

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

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <TarjetaUso titulo="Todo lo creado" detalle="Desde el 24 de octubre" neon>
          <AnilloUso total={r.total} />
        </TarjetaUso>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <CifraUso titulo="Productos nuevos en el sistema" valor={textoPorcentaje(nuevos)} detalle={`${nuevos.sistema} en el sistema · ${nuevos.dropi} en Dropi`} icono={TiendaIcon} color={nuevos.dropi > 0 ? "ambar" : "verde"} />
            <CifraUso
              titulo="Última semana"
              valor={ultima ? textoPorcentaje(ultima) : "—"}
              detalle={
                ultima ? (
                  <>
                    Semana del {dia(ultima.semana)}
                    {cambio !== null && (
                      <>
                        {" · "}
                        <Delta valor={cambio} sufijo=" puntos" decimales={0} />
                      </>
                    )}
                  </>
                ) : (
                  "Sin datos"
                )
              }
              icono={VentasIcon}
              color="azul"
            />
            <CifraUso titulo="Hecho en Dropi sin motivo" valor={r.sinMotivo} detalle={`de ${r.total.dropi} hechos en Dropi`} icono={AlertaIcon} color={r.sinMotivo > 0 ? "ambar" : "verde"} />
          </div>
          <TarjetaUso titulo="Por qué se hace en Dropi" detalle="Lo que hay que arreglar para que nadie tenga que ir allá">
            {r.motivos.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {r.motivos.map((m) => (
                  <FilaMotivo key={m.motivo} etiqueta={etiquetaMotivo(m.motivo)} n={m.n} maximo={r.motivos[0].n} />
                ))}
              </div>
            )}
            <AvanceMotivos hechos={r.total.dropi - r.sinMotivo} total={r.total.dropi} />
          </TarjetaUso>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <TarjetaUso titulo="Por semana" detalle="El porcentaje es lo creado en el sistema">
          <GraficaSemanas semanas={semanas} />
          <LeyendaUso />
        </TarjetaUso>
        <TarjetaUso titulo="Por tipo" detalle="Qué se creó">
          <div className="flex flex-col gap-4">
            {r.porTipo.map((f) => (
              <FilaProporcion key={f.tipo} etiqueta={etiquetaTipo(f.tipo)} conteo={f} />
            ))}
          </div>
        </TarjetaUso>
        <TarjetaUso titulo="Por país" detalle="Dónde se creó">
          <div className="flex flex-col gap-4">
            {r.porPais.map((f) => (
              <FilaProporcion key={f.pais} etiqueta={nombrePais(f.pais)} conteo={f} />
            ))}
          </div>
        </TarjetaUso>
      </div>

      <TarjetaUso titulo={`Hecho en Dropi (${enDropi.length})`} detalle="Dropi no dice quién creó un producto. «Lo pasó al sistema» es quien lo registró aquí después: es a quien hay que preguntarle.">
        <div className="-mx-5 -mb-5 overflow-x-auto border-t border-border">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {["Publicación", "País", "Fecha", "Qué fue", "Lo pasó al sistema", "Motivo", "Nota"].map((t) => (
                  <th key={t} scope="col" className={claseThLista}>
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
      </TarjetaUso>
    </div>
  );
}
