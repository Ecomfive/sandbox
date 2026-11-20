"use client";

// Tres bloques de la ficha de un movimiento (pedido de María José, Oceans, 19 nov 2026; migración 0984): qué tiendas
// asumen el gasto, si lo pagó otra empresa del grupo y su bien de uso. Cada bloque guarda por su cuenta (no con «Guardar
// cambios» de la ficha). Vive dentro del <form> de la ficha: sus campos no llevan `name` y Enter no envía la ficha.

import { useEffect, useState, useTransition } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import { fieldClass, labelClassSm } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { dinero } from "@/lib/af4/formato";
import { BienesUsoIcon, TiendaIcon, TransferirIcon } from "@/lib/nav-icons";
import { TIPOS_BIEN, VIDA_UTIL, type TipoBien } from "@/lib/finanzas/bienes-uso";
import { montosDelReparto, partesIguales, type ParteReparto } from "@/lib/finanzas/reparto-elegido";
import {
  crearBienDesdeMovimiento,
  eliminarPlantillaReparto,
  guardarPlantillaReparto,
  guardarRepartoMovimiento,
  marcarPagadoPorOtra,
  obtenerVinculosMovimiento,
  vincularBienMovimiento,
  type VinculosMovimiento as Datos,
} from "./vinculos-actions";

const boton = "rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50";
const botonFuerte = "rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50";
/** Enter dentro de estos campos no envía la ficha. */
const sinEnter = (e: React.KeyboardEvent) => {
  if (e.key === "Enter") e.preventDefault();
};

export function VinculosMovimiento({
  movimientoId,
  monto,
  esBien,
  puedeEscribir,
  alCambiar,
}: {
  movimientoId: string;
  monto: number;
  /** Es una compra de un bien de uso (marcado así o del tipo «Alta Bien de Uso»). */
  esBien: boolean;
  puedeEscribir: boolean;
  alCambiar: () => void;
}) {
  const [datos, setDatos] = useState<Datos | { error: string } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    obtenerVinculosMovimiento(movimientoId)
      .catch(() => ({ error: "No se pudo leer." }))
      .then((r) => vigente && setDatos(r));
    return () => {
      vigente = false;
    };
  }, [movimientoId, version]);

  const recargar = () => {
    setVersion((v) => v + 1);
    alCambiar();
  };

  if (!datos) return <p className="py-5 text-sm text-muted-foreground">Cargando reparto y vínculos…</p>;
  if ("error" in datos) return <p className="py-5 text-sm text-destructive">{datos.error}</p>;
  if (datos.faltaMigracion) return null;

  return (
    <div className="flex flex-col divide-y divide-border">
      <BloqueReparto key={`r-${version}`} id={movimientoId} monto={monto} datos={datos} puedeEscribir={puedeEscribir} alGuardar={recargar} />
      <BloqueEmpresa key={`e-${version}`} id={movimientoId} monto={monto} datos={datos} alGuardar={recargar} />
      {(esBien || datos.bien) && <BloqueBien key={`b-${version}`} id={movimientoId} datos={datos} alGuardar={recargar} />}
    </div>
  );
}

function Aviso({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {texto}
    </p>
  );
}

/** Qué tiendas asumen el gasto y con qué porcentaje. Sin elegir, se queda en su tienda (o A DISTRIBUIR por la base). */
function BloqueReparto({ id, monto, datos, puedeEscribir, alGuardar }: { id: string; monto: number; datos: Datos; puedeEscribir: boolean; alGuardar: () => void }) {
  const { mostrarToast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [partes, setPartes] = useState<ParteReparto[]>(datos.reparto);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const [plantilla, setPlantilla] = useState("");
  const [plantillas, setPlantillas] = useState(datos.plantillas);
  const [nombrePlantilla, setNombrePlantilla] = useState<string | null>(null);
  const nombre = (u: string) => datos.tiendas.find((t) => t.id === u)?.nombre ?? "Tienda";
  const elegidas = new Set(partes.map((p) => p.unidadId));

  function usarPlantilla(id: string) {
    setPlantilla(id);
    const p = plantillas.find((x) => x.id === id);
    if (p) setPartes(p.partes);
  }

  function guardarPlantilla() {
    setError(null);
    empezar(async () => {
      const r = await guardarPlantillaReparto(id, nombrePlantilla ?? "", partes).catch(() => ({ error: "No se pudo guardar." }));
      if ("error" in r && r.error) setError(r.error);
      else if ("id" in r) {
        mostrarToast("Plantilla guardada");
        const nueva = { id: r.id, nombre: r.nombre, partes };
        setPlantillas((a) => [...a.filter((x) => x.id !== r.id), nueva].sort((x, y) => x.nombre.localeCompare(y.nombre)));
        setPlantilla(r.id);
        setNombrePlantilla(null);
      }
    });
  }

  function borrarPlantilla() {
    if (!plantilla || !confirm("¿Borrar esta plantilla? Los movimientos que ya la usaron no cambian.")) return;
    empezar(async () => {
      const r = await eliminarPlantillaReparto(plantilla).catch(() => ({ error: "No se pudo borrar." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast("Plantilla borrada");
        setPlantillas((a) => a.filter((x) => x.id !== plantilla));
        setPlantilla("");
      }
    });
  }
  const suma = partes.reduce((s, p) => s + p.porcentaje, 0);
  const montos = montosDelReparto(monto, partes);

  function alternar(u: string) {
    const lista = elegidas.has(u) ? partes.filter((p) => p.unidadId !== u).map((p) => p.unidadId) : [...partes.map((p) => p.unidadId), u];
    setPartes(partesIguales(lista));
  }

  function guardar(lista: ParteReparto[]) {
    setError(null);
    empezar(async () => {
      const r = await guardarRepartoMovimiento(id, lista).catch(() => ({ error: "No se pudo guardar." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast(lista.length ? "Reparto guardado" : "Reparto quitado");
        setAbierto(false);
        alGuardar();
      }
    });
  }

  return (
    <Seccion icono={TiendaIcon} titulo="Tiendas que lo asumen">
      {!abierto && (
        <>
          {datos.reparto.length ? (
            <ul className="flex flex-col gap-1 text-sm">
              {montosDelReparto(monto, datos.reparto).map((x) => (
                <li key={x.unidadId} className="flex justify-between gap-3">
                  <span>
                    {nombre(x.unidadId)} <span className="text-muted-foreground">· {datos.reparto.find((p) => p.unidadId === x.unidadId)?.porcentaje} %</span>
                  </span>
                  <span className={claseCifra}>{dinero(x.monto, "USD", { decimales: 2 })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Su tienda; si es A DISTRIBUIR, todas por la base del mes.</p>
          )}
          {puedeEscribir && datos.tiendas.length > 1 && (
            <div>
              <button type="button" className={boton} onClick={() => setAbierto(true)}>
                {datos.reparto.length ? "Cambiar tiendas" : "Elegir tiendas"}
              </button>
            </div>
          )}
        </>
      )}
      {abierto && (
        <div role="group" aria-label="Tiendas que asumen el movimiento" className="flex flex-col gap-3">
          {plantillas.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Usar una plantilla</span>
                <select value={plantilla} onChange={(e) => usarPlantilla(e.target.value)} className={`${fieldClass} w-60`}>
                  <option value="">Elegir plantilla</option>
                  {plantillas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </label>
              {plantilla && (
                <button type="button" className={boton} disabled={pendiente} onClick={borrarPlantilla}>
                  Borrar plantilla
                </button>
              )}
            </div>
          )}
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {datos.tiendas.map((t) => {
              const parte = partes.find((p) => p.unidadId === t.id);
              return (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <label className="flex min-w-0 flex-1 items-center gap-2">
                    <input type="checkbox" className="h-4 w-4" checked={!!parte} onChange={() => alternar(t.id)} />
                    <span className="truncate">{t.nombre}</span>
                  </label>
                  {parte && (
                    <label className="flex items-center gap-1">
                      <span className="sr-only">Porcentaje de {t.nombre}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0.01"
                        max="100"
                        step="0.01"
                        value={parte.porcentaje}
                        onKeyDown={sinEnter}
                        onChange={(e) => setPartes((a) => a.map((p) => (p.unidadId === t.id ? { ...p, porcentaje: Number(e.target.value) } : p)))}
                        className={`${fieldClass} w-20 py-1 text-right tabular-nums`}
                      />
                      <span aria-hidden="true">%</span>
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
          {partes.length > 1 && (
            <p className={`flex items-center gap-1.5 text-sm ${claseCifra}`}>
              {Math.abs(suma - 100) > 0.01 && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />}
              Suma {Math.round(suma * 100) / 100} % · {montos.map((x) => `${nombre(x.unidadId)} ${dinero(x.monto, "USD", { decimales: 2 })}`).join(" · ")}
            </p>
          )}
          <Aviso texto={error} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={botonFuerte} disabled={pendiente || partes.length < 2 || Math.abs(suma - 100) > 0.01} onClick={() => guardar(partes)}>
              {pendiente ? "Guardando…" : "Guardar reparto"}
            </button>
            {partes.length > 1 && (
              <button type="button" className={boton} disabled={pendiente} onClick={() => setPartes(partesIguales(partes.map((p) => p.unidadId)))}>
                Partes iguales
              </button>
            )}
            {datos.reparto.length > 0 && (
              <button type="button" className={boton} disabled={pendiente} onClick={() => guardar([])}>
                Quitar reparto
              </button>
            )}
            {partes.length > 1 && Math.abs(suma - 100) <= 0.01 && nombrePlantilla === null && (
              <button type="button" className={boton} disabled={pendiente} onClick={() => setNombrePlantilla("")}>
                Guardar como plantilla
              </button>
            )}
            <button type="button" className={boton} disabled={pendiente} onClick={() => { setPartes(datos.reparto); setAbierto(false); setError(null); setNombrePlantilla(null); }}>
              Cancelar
            </button>
          </div>
          {nombrePlantilla !== null && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Nombre de la plantilla</span>
                <input
                  value={nombrePlantilla}
                  onChange={(e) => setNombrePlantilla(e.target.value)}
                  onKeyDown={sinEnter}
                  maxLength={80}
                  data-enfocar
                  placeholder="Ej: Alquiler Plaza 100"
                  className={`${fieldClass} w-60`}
                />
              </label>
              <button type="button" className={botonFuerte} disabled={pendiente || nombrePlantilla.trim().length < 2} onClick={guardarPlantilla}>
                {pendiente ? "Guardando…" : "Guardar plantilla"}
              </button>
              <button type="button" className={boton} disabled={pendiente} onClick={() => setNombrePlantilla(null)}>
                No
              </button>
            </div>
          )}
        </div>
      )}
    </Seccion>
  );
}

/** «Lo pagó otra empresa»: genera la deuda en Préstamos del grupo y lo saca del flujo de la dueña. */
function BloqueEmpresa({ id, monto, datos, alGuardar }: { id: string; monto: number; datos: Datos; alGuardar: () => void }) {
  const { mostrarToast } = useToast();
  const [elegido, setElegido] = useState(datos.pagador?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  if (!datos.duena) return null;

  function guardar(pagador: string | null) {
    setError(null);
    empezar(async () => {
      const r = await marcarPagadoPorOtra(id, pagador).catch(() => ({ error: "No se pudo guardar." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast(pagador ? "Quedó en Préstamos del grupo" : "Se quitó de Préstamos del grupo");
        alGuardar();
      }
    });
  }

  return (
    <Seccion icono={TransferirIcon} titulo="Quién lo pagó">
      {datos.pagador ? (
        <p className="text-sm">
          Lo pagó <strong className="font-medium">{datos.pagador.nombre}</strong>: {datos.duena.nombre} le debe {dinero(monto, "USD", { decimales: 2 })} en{" "}
          <a href="/tesoreria/grupo" className="underline">Préstamos del grupo</a>. No entra al flujo de {datos.duena.nombre}.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{datos.duena.nombre}, la dueña del gasto.</p>
      )}
      {datos.puedeEmpresas && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>{datos.pagador ? "Cambiar quién lo pagó" : "Lo pagó otra empresa"}</span>
            <select value={elegido} onChange={(e) => setElegido(e.target.value)} className={`${fieldClass} w-56`}>
              <option value="">Elegir empresa o socio</option>
              {datos.pagadores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={botonFuerte} disabled={pendiente || !elegido || elegido === datos.pagador?.id} onClick={() => guardar(elegido)}>
            {pendiente ? "Guardando…" : "Guardar"}
          </button>
          {datos.pagador && (
            <button type="button" className={boton} disabled={pendiente} onClick={() => guardar(null)}>
              Lo pagó {datos.duena.nombre}
            </button>
          )}
        </div>
      )}
      <Aviso texto={error} />
    </Seccion>
  );
}

/** El bien de uso de esta compra: crearlo con el monto del movimiento o vincular uno que ya existe. */
function BloqueBien({ id, datos, alGuardar }: { id: string; datos: Datos; alGuardar: () => void }) {
  const { mostrarToast } = useToast();
  const [tipo, setTipo] = useState<TipoBien>("Equipos Computación");
  const [meses, setMeses] = useState(String(VIDA_UTIL["Equipos Computación"]));
  const [existente, setExistente] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function hacer(accion: () => Promise<{ error?: string }>, ok: string) {
    setError(null);
    empezar(async () => {
      const r = await accion().catch(() => ({ error: "No se pudo guardar." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast(ok);
        alGuardar();
      }
    });
  }

  return (
    <Seccion icono={BienesUsoIcon} titulo="Bien de uso">
      {datos.bien ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <a href="/bienes-de-uso" className="underline">{datos.bien.nombre}</a>
          {datos.puedeBienes && (
            <button type="button" className={boton} disabled={pendiente} onClick={() => hacer(() => vincularBienMovimiento(id, null), "Bien desvinculado")}>
              Desvincular
            </button>
          )}
        </div>
      ) : datos.puedeBienes ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Tipo</span>
              <select
                value={tipo}
                onChange={(e) => {
                  const t = e.target.value as TipoBien;
                  setTipo(t);
                  setMeses(String(VIDA_UTIL[t]));
                }}
                className={`${fieldClass} w-48`}
              >
                {TIPOS_BIEN.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Vida útil (meses)</span>
              <input type="number" min="1" max="600" step="1" value={meses} onKeyDown={sinEnter} onChange={(e) => setMeses(e.target.value)} className={`${fieldClass} w-28 tabular-nums`} />
            </label>
            <button type="button" className={botonFuerte} disabled={pendiente || !(Number(meses) >= 1)} onClick={() => hacer(() => crearBienDesdeMovimiento(id, tipo, Number(meses)), "Bien de uso creado")}>
              {pendiente ? "Creando…" : "Crear el bien de uso"}
            </button>
          </div>
          {datos.bienesSueltos.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>O vincular uno que ya existe</span>
                <select value={existente} onChange={(e) => setExistente(e.target.value)} className={`${fieldClass} w-72`}>
                  <option value="">Elegir bien</option>
                  {datos.bienesSueltos.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className={boton} disabled={pendiente || !existente} onClick={() => hacer(() => vincularBienMovimiento(id, existente), "Bien vinculado")}>
                Vincular
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sin bien de uso vinculado.</p>
      )}
      <Aviso texto={error} />
    </Seccion>
  );
}
