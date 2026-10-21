"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { AvatarRol, Chip, ChipSensible, Interruptor } from "@/components/permisos/piezas-permisos";
import { SeccionTarjeta } from "@/components/permisos/seccion-tarjeta";
import { SelectorCampo, type ValorCampo } from "@/components/permisos/selector-segmentado";
import { AfinarIcon, CandadoIcon, CheckIcon, EmbudoIcon, LapizIcon, ListaIcon, OjoIcon, PestanasIcon, RayoIcon, ReiniciarIcon } from "@/lib/nav-icons";
import { claveAfinado, valorPorDefecto, type TipoAfinado } from "@/lib/permisos/afinado";
import type { CatalogoModulo, Nivel } from "@/lib/permisos/catalogo";
import { iniciarVistaPrevia, iniciarVistaPreviaPersona } from "@/lib/vista-previa-actions";
import { fijarAfinado, type CambioAfinado } from "../permisos-actions";

export interface DatosAfinarCliente {
  catalogo: CatalogoModulo;
  destino: { tipo: "rol" | "persona"; id: string };
  nombre: string;
  rolNombre: string | null;
  color: string | null;
  nivel: Nivel;
  valores: Record<string, string>;
  base: Record<string, string>;
  puedeEscribir: boolean;
}

type Estado = "guardado" | "guardando" | "error";

// Anchos de las barras de valores de la vista previa (no hay datos reales: solo se ve qué hay y qué se puede tocar).
const ANCHOS = ["58%", "46%", "66%", "40%", "54%", "70%", "44%", "60%"];

/**
 * Afinar un módulo para un rol o una persona: qué pestañas ve, qué acciones puede usar, qué campos ve o edita y qué datos alcanza.
 * A la derecha, cómo lo vería: lo que no puede ver simplemente no aparece. Cada cambio se ve al instante y se guarda solo.
 */
export function AfinarModulo({ datos }: { datos: DatosAfinarCliente }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [, empezar] = useTransition();
  const { catalogo, destino, puedeEscribir, nivel } = datos;
  const [valores, setValores] = useState<Record<string, string>>(datos.valores);
  const [estado, setEstado] = useState<Estado>("guardado");
  const enCurso = useRef(0);
  const esRol = destino.tipo === "rol";

  const v = (tipo: TipoAfinado, clave: string) => valores[claveAfinado(tipo, clave)] ?? valorPorDefecto(catalogo, tipo, clave);
  const defecto = (tipo: TipoAfinado, clave: string) => valorPorDefecto(catalogo, tipo, clave);

  function cambiar(cambios: CambioAfinado[]) {
    if (!puedeEscribir || cambios.length === 0) return;
    const antes = valores;
    const siguiente = { ...valores };
    for (const c of cambios) siguiente[claveAfinado(c.tipo, c.clave)] = c.valor;
    setValores(siguiente);
    setEstado("guardando");
    enCurso.current++;
    empezar(async () => {
      const r = await fijarAfinado(destino, catalogo.modulo, cambios).catch(() => ({ error: "Inténtalo de nuevo." }));
      enCurso.current--;
      if (r.error) {
        setValores(antes);
        setEstado("error");
        mostrarToast(r.error, "destructive");
        return;
      }
      if (enCurso.current === 0) setEstado("guardado");
      router.refresh();
    });
  }

  // Lo que se cuenta como «ajuste»: todo lo que se aparta de lo normal.
  const pestanasOcultas = catalogo.pestanas.filter((p) => v("pestana", p.clave) === "oculta");
  const accionesBloqueadas = catalogo.acciones.filter((a) => v("accion", a.clave) === "bloqueada");
  const campos = catalogo.grupos.flatMap((g) => g.campos);
  const camposOcultos = campos.filter((c) => v("campo", c.clave) === "oculto");
  const camposVer = campos.filter((c) => c.editable && v("campo", c.clave) === "ver");
  const alcanceActual = v("alcance", "alcance");
  const alcanceAparte = !!catalogo.alcance && alcanceActual !== defecto("alcance", "alcance");
  const ajustes = pestanasOcultas.length + accionesBloqueadas.length + camposOcultos.length + camposVer.length + (alcanceAparte ? 1 : 0);

  // Pestañas que calculan sus cifras con campos que se ocultaron: si siguen visibles, sus números saldrían en cero.
  const cifras = catalogo.cifrasPorPestana;
  const ocultoDeCifras = !!cifras && cifras.campos.some((c) => v("campo", c) === "oculto");
  const pestanasConCifras = cifras ? catalogo.pestanas.filter((p) => cifras.pestanas.includes(p.clave) && v("pestana", p.clave) === "visible") : [];
  const avisarCifras = ocultoDeCifras && pestanasConCifras.length > 0;

  function restablecer() {
    const cambios: CambioAfinado[] = [];
    for (const [k, valor] of Object.entries(datos.base)) {
      if (valores[k] === valor) continue;
      const i = k.indexOf(":");
      cambios.push({ tipo: k.slice(0, i) as TipoAfinado, clave: k.slice(i + 1), valor });
    }
    cambiar(cambios);
  }

  function verAsi() {
    empezar(async () => {
      try {
        if (esRol) await iniciarVistaPrevia(destino.id);
        else await iniciarVistaPreviaPersona(destino.id);
      } catch (e) {
        mostrarToast(e instanceof Error ? e.message : "No se pudo iniciar la vista previa.", "destructive");
      }
    });
  }

  function campoBulk(grupo: CatalogoModulo["grupos"][number], valor: ValorCampo) {
    const cambios: CambioAfinado[] = [];
    for (const c of grupo.campos) {
      let destinoValor: string = valor;
      if (valor === "editar" && !c.editable) destinoValor = "ver";
      if (valor === "oculto" && !c.ocultable) continue;
      if (v("campo", c.clave) !== destinoValor) cambios.push({ tipo: "campo", clave: c.clave, valor: destinoValor });
    }
    cambiar(cambios);
  }

  const boton = `inline-flex h-9 items-center gap-2 rounded-[10px] border border-border-control bg-card px-3.5 text-[13px] font-semibold whitespace-nowrap hover:bg-muted disabled:opacity-50 ${anilloFoco}`;
  const botonChico = `inline-flex h-[30px] items-center rounded-lg border border-border-control bg-card px-2.5 text-[12.5px] font-semibold hover:bg-accent disabled:opacity-50 ${anilloFoco}`;
  const textoDestino = esRol ? `una persona con el rol ${datos.nombre}` : datos.nombre;

  // ----- La vista previa: lo que no puede ver no se dibuja. -----
  const soloLectura = nivel === "r";
  const pvTabs = catalogo.pestanas.filter((p) => v("pestana", p.clave) === "visible");
  const pvActs = catalogo.acciones.filter((a) => v("accion", a.clave) === "permitida" && !(soloLectura && a.requiereEdicion));
  const nivelCampo = (c: (typeof campos)[number]): ValorCampo => {
    const x = v("campo", c.clave) as ValorCampo;
    return soloLectura && x === "editar" ? "ver" : x;
  };
  let indice = 0;
  const pvGrupos = catalogo.grupos
    .map((g) => ({
      nombre: g.nombre,
      filas: g.campos.filter((c) => nivelCampo(c) !== "oculto").map((c) => ({ etiqueta: c.etiqueta, nivel: nivelCampo(c), ancho: ANCHOS[indice++ % ANCHOS.length] })),
    }))
    .filter((g) => g.filas.length > 0);
  const pvColumnas = campos.filter((c) => nivelCampo(c) !== "oculto");
  const alcanceTexto = catalogo.alcance?.opciones.find((o) => o.valor === alcanceActual)?.etiqueta ?? "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-72 grow">
          <h1 className="text-2xl font-bold tracking-tight">Afinar «{catalogo.etiqueta}»</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {esRol ? (
              <span className="inline-flex items-center gap-2">
                <AvatarRol nombre={datos.nombre} color={datos.color} tamano="sm" />
                <b className="font-semibold">Rol {datos.nombre}</b>
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <b className="font-semibold">{datos.nombre}</b>
                {datos.rolNombre && <span className="text-muted-foreground">· rol {datos.rolNombre}</span>}
              </span>
            )}
            <Chip tono={nivel === "w" ? "primario" : "azul"}>
              {nivel === "w" ? <LapizIcon className="h-3.5 w-3.5" /> : <OjoIcon className="h-3.5 w-3.5" />}
              {nivel === "w" ? "Edición" : "Solo lectura"}
            </Chip>
            <Chip tono={ajustes > 0 ? "aviso" : "neutro"}>
              <AfinarIcon className="h-3.5 w-3.5" />
              {ajustes} ajuste{ajustes === 1 ? "" : "s"}
            </Chip>
            {estado === "guardado" && (
              <Chip tono="ok">
                <CheckIcon className="h-3.5 w-3.5" />
                Cambios guardados
              </Chip>
            )}
            {estado === "guardando" && <Chip>Guardando…</Chip>}
            {estado === "error" && <Chip tono="error">No se guardó</Chip>}
          </div>
        </div>
        {puedeEscribir && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={restablecer} className={boton}>
              <ReiniciarIcon className="h-4 w-4" />
              {esRol ? "Restablecer todo visible" : "Volver a lo de su rol"}
            </button>
            <button type="button" onClick={verAsi} className={`${boton} !border-foreground !bg-foreground !text-background hover:!bg-foreground-soft`}>
              <OjoIcon className="h-4 w-4" />
              Ver así
            </button>
          </div>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <SeccionTarjeta id="h-pestanas" icono={PestanasIcon} titulo="Pestañas y vistas" sinRelleno acciones={<Chip>{pestanasOcultas.length} ocultas</Chip>}>
            {catalogo.pestanas.map((p) => {
              const visible = v("pestana", p.clave) === "visible";
              return (
                <Interruptor
                  key={p.clave}
                  nombre={`pestana-${p.clave}`}
                  activo={visible}
                  deshabilitado={!puedeEscribir}
                  alCambiar={(on) => cambiar([{ tipo: "pestana", clave: p.clave, valor: on ? "visible" : "oculta" }])}
                  className="border-b border-border px-[18px] py-[11px] last:border-0 hover:bg-muted/50"
                >
                  <span className="grow font-medium">{p.etiqueta}</span>
                  <span className="min-w-16 text-right text-sm text-muted-foreground">{visible ? "Visible" : "Oculta"}</span>
                </Interruptor>
              );
            })}
            {avisarCifras && (
              <div role="status" className="flex flex-wrap items-center gap-3 border-t border-border bg-warning-soft px-[18px] py-3 text-sm text-warning">
                <span className="min-w-0 grow">
                  {pestanasConCifras.map((p) => p.etiqueta).join(", ")} muestra{pestanasConCifras.length === 1 ? "" : "n"} cifras de dinero: con esos campos ocultos se verían en 0.
                </span>
                {puedeEscribir && (
                  <button type="button" onClick={() => cambiar(pestanasConCifras.map((p) => ({ tipo: "pestana" as const, clave: p.clave, valor: "oculta" })))} className={botonChico}>
                    Ocultar esas pestañas
                  </button>
                )}
              </div>
            )}
          </SeccionTarjeta>

          <SeccionTarjeta id="h-acciones" icono={RayoIcon} titulo="Acciones" sinRelleno acciones={<Chip>{accionesBloqueadas.length} bloqueadas</Chip>}>
            {catalogo.acciones.map((a) => {
              const permitida = v("accion", a.clave) === "permitida";
              return (
                <Interruptor
                  key={a.clave}
                  nombre={`accion-${a.clave}`}
                  activo={permitida}
                  deshabilitado={!puedeEscribir}
                  alCambiar={(on) => cambiar([{ tipo: "accion", clave: a.clave, valor: on ? "permitida" : "bloqueada" }])}
                  className="border-b border-border px-[18px] py-[11px] last:border-0 hover:bg-muted/50"
                >
                  <span className="font-medium">{a.etiqueta}</span>
                  {a.requiereEdicion && <Chip>Requiere edición</Chip>}
                  <span className="grow" />
                  <span className="min-w-[74px] text-right text-sm text-muted-foreground">{permitida ? "Permitida" : "Bloqueada"}</span>
                </Interruptor>
              );
            })}
          </SeccionTarjeta>

          <SeccionTarjeta id="h-campos" icono={ListaIcon} titulo="Campos de la ficha y de la tabla" sinRelleno acciones={<Chip>{camposOcultos.length} ocultos · {camposVer.length} solo ver</Chip>}>
            {catalogo.grupos.map((g) => (
              <div key={g.nombre}>
                <div className="flex flex-wrap items-center gap-2.5 border-b border-border bg-muted px-[18px] py-2.5 text-[12.5px] font-bold">
                  <span>{g.nombre}</span>
                  {g.sensible && <ChipSensible />}
                  {puedeEscribir && (
                    <div role="group" aria-label={`Aplicar a todo el grupo ${g.nombre}`} className="ml-auto flex gap-1.5">
                      <button type="button" onClick={() => campoBulk(g, "editar")} className={botonChico}>
                        Editar
                      </button>
                      <button type="button" onClick={() => campoBulk(g, "ver")} className={botonChico}>
                        Solo ver
                      </button>
                      <button type="button" onClick={() => campoBulk(g, "oculto")} className={botonChico}>
                        Ocultar
                      </button>
                    </div>
                  )}
                </div>
                {g.campos.map((c) => (
                  <div key={c.clave} className="flex flex-wrap items-center gap-3.5 border-b border-border px-[18px] py-[11px] last:border-0 hover:bg-muted/50">
                    <span className="grow font-medium">{c.etiqueta}</span>
                    {!c.editable && <Chip>Calculado</Chip>}
                    {!c.ocultable && <Chip>Necesario</Chip>}
                    <SelectorCampo
                      nombre={`campo-${c.clave}`}
                      campo={c.etiqueta}
                      valor={v("campo", c.clave) as ValorCampo}
                      alCambiar={(valor) => cambiar([{ tipo: "campo", clave: c.clave, valor }])}
                      editable={c.editable}
                      ocultable={c.ocultable}
                      deshabilitado={!puedeEscribir}
                    />
                  </div>
                ))}
              </div>
            ))}
          </SeccionTarjeta>

          {catalogo.alcance && (
            <SeccionTarjeta id="h-alcance" icono={EmbudoIcon} titulo={catalogo.alcance.titulo} sinRelleno>
              <fieldset disabled={!puedeEscribir} className="m-0 border-0 p-0">
                <legend className="sr-only">Alcance de los datos</legend>
                {catalogo.alcance.opciones.map((o) => (
                  <label key={o.valor} className="flex cursor-pointer items-center gap-3 border-b border-border px-[18px] py-3 last:border-0 hover:bg-muted/50 has-[:checked]:bg-primario-suave">
                    <input
                      type="radio"
                      name="alcance"
                      checked={alcanceActual === o.valor}
                      onChange={() => cambiar([{ tipo: "alcance", clave: "alcance", valor: o.valor }])}
                      className="h-[18px] w-[18px] accent-[var(--nivel-edicion)]"
                    />
                    <span className="font-semibold">{o.etiqueta}</span>
                  </label>
                ))}
              </fieldset>
            </SeccionTarjeta>
          )}
        </div>

        <aside aria-label="Vista previa de lo que verá" className="min-w-0 lg:sticky lg:top-4">
          <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-sm">
            <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-2.5 text-[12.5px] font-semibold text-foreground-soft">
              <OjoIcon className="h-4 w-4" />
              <span className="min-w-0 grow">Así lo verá {textoDestino}</span>
            </div>
            <div className="flex gap-0.5 overflow-hidden border-b border-border px-3">
              {pvTabs.map((p, i) => (
                <span key={p.clave} className={`border-b-2 px-2.5 py-2.5 text-[12.5px] whitespace-nowrap ${i === 0 ? "border-primario font-semibold text-foreground" : "border-transparent font-medium text-muted-foreground"}`}>
                  {p.etiqueta}
                </span>
              ))}
              {pvTabs.length === 0 && <span className="px-2.5 py-2.5 text-[12.5px] text-muted-foreground">Sin pestañas</span>}
            </div>
            {pvActs.length > 0 && (
              <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
                {pvActs.map((a) => (
                  <span key={a.clave} className="inline-flex h-[30px] items-center rounded-lg border border-border-control bg-card px-2.5 text-[12.5px] font-semibold">
                    {a.etiqueta}
                  </span>
                ))}
              </div>
            )}
            <div className="pb-2">
              {pvGrupos.map((g) => (
                <div key={g.nombre}>
                  <p className="px-4 pt-3 pb-1 text-[11.5px] font-bold tracking-wide text-muted-foreground uppercase">{g.nombre}</p>
                  {g.filas.map((f) => (
                    <div key={f.etiqueta} className="grid grid-cols-[minmax(0,150px)_1fr] items-center gap-3 px-4 py-1.5">
                      <span className="text-[12.5px] font-medium text-foreground-soft">{f.etiqueta}</span>
                      {f.nivel === "editar" ? (
                        <div className="flex h-8 items-center gap-2 rounded-lg border border-border-control bg-card px-2.5">
                          <span className="h-[9px] rounded-[5px] bg-border-control/40" style={{ width: f.ancho }} />
                          <span className="grow" />
                          <LapizIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="sr-only">Editable</span>
                        </div>
                      ) : (
                        <div className="flex h-8 items-center gap-2 rounded-lg border border-border bg-muted px-2.5">
                          <span className="h-[9px] rounded-[5px] bg-border-control/40" style={{ width: f.ancho }} />
                          <span className="grow" />
                          <CandadoIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="sr-only">Solo lectura</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {pvColumnas.length > 0 && (
              <>
                <p className="border-t border-border px-4 pt-3.5 pb-1 text-[11.5px] font-bold tracking-wide text-muted-foreground uppercase">Columnas de la tabla</p>
                <div className="flex flex-wrap gap-1.5 px-4 pt-1.5 pb-4">
                  {pvColumnas.map((c) => (
                    <span key={c.clave} className="inline-flex h-[26px] items-center rounded-[7px] border border-border bg-muted px-2.5 text-xs font-semibold text-foreground-soft">
                      {c.etiqueta}
                    </span>
                  ))}
                </div>
              </>
            )}
            {catalogo.alcance && (
              <div className="flex items-center gap-2 border-t border-border bg-muted px-4 py-2.5 text-[12.5px] font-semibold text-foreground-soft">
                <EmbudoIcon className="h-4 w-4" />
                <span className="min-w-0 grow">
                  Alcance: <b>{alcanceTexto}</b>
                </span>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
