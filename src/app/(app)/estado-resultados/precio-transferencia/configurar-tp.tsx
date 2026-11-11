"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo-ficha";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { porcentaje } from "@/lib/af4/formato";
import { BASES_COSTO, type PoliticaTP, type ReglaTP } from "@/lib/finanzas/precio-transferencia";
import { ExtractoIcon, PedidoIcon, WalletIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import { crearReglaTP, eliminarReglaTP, guardarPoliticaTP } from "./actions";

export interface OpcionTienda {
  id: string;
  nombre: string;
}

/** La política: se guarda con «Guardar política»; con solo lectura los campos quedan deshabilitados. */
export function PoliticaTPForm({
  politica,
  proveedora,
  tiendas,
  tiposCosto,
  tiposPredeterminados,
  puedeEscribir,
}: {
  politica: PoliticaTP;
  /** La importadora en uso (la elegida o ECOMFIVE). */
  proveedora: string | null;
  tiendas: OpcionTienda[];
  tiposCosto: string[];
  /** Los tipos de mercancía de siempre (marcados cuando la política no elige). */
  tiposPredeterminados: string[];
  puedeEscribir: boolean;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, iniciar] = useTransition();
  const [importadora, setImportadora] = useState(proveedora ?? "");
  const compradoras = tiendas.filter((t) => t.id !== importadora);
  const marcadaTienda = (id: string) => (politica.tiendas ? politica.tiendas.includes(id) : true);
  const marcadoTipo = (t: string) => (politica.tiposMercancia ? politica.tiposMercancia.includes(t) : tiposPredeterminados.includes(t));

  function enviar(formData: FormData) {
    const elegidas = formData.getAll("tiendas").map(String);
    formData.set("todas_tiendas", elegidas.length === compradoras.length ? "1" : "0");
    const tipos = formData.getAll("tipos").map(String);
    const iguales = tipos.length === tiposPredeterminados.length && tipos.every((t) => tiposPredeterminados.includes(t));
    formData.set("tipos_predeterminados", iguales ? "1" : "0");
    iniciar(async () => {
      const r = await guardarPoliticaTP(formData).catch(() => ({ error: "Se cortó la conexión." }));
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast("Política guardada");
        router.refresh();
      }
    });
  }

  return (
    <MarcoAF4 id="politica-tp" titulo="Política de precio de transferencia">
      <form action={enviar} className="flex max-w-5xl flex-col gap-5 p-4">
        <fieldset disabled={!puedeEscribir || pendiente} className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Margen por defecto (%)</span>
            <input name="margen" inputMode="decimal" pattern="[0-9.,]+" required defaultValue={String(politica.margenPct)} className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Costo base</span>
            <select name="base" defaultValue={politica.base} className={fieldClass}>
              {BASES_COSTO.map((b) => (
                <option key={b.clave} value={b.clave}>
                  {b.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Importadora</span>
            <select name="proveedora" value={importadora} onChange={(e) => setImportadora(e.target.value)} className={fieldClass}>
              <option value="">ECOMFIVE</option>
              {tiendas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        <fieldset disabled={!puedeEscribir || pendiente} className="flex flex-col gap-2">
          <legend className={labelClass}>Tiendas que le compran</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
            {compradoras.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="tiendas" value={t.id} defaultChecked={marcadaTienda(t.id)} className={anilloFoco} />
                {t.nombre}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset disabled={!puedeEscribir || pendiente} className="flex flex-col gap-2">
          <legend className={labelClass}>Tipos del libro que son mercancía</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
            {tiposCosto.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="tipos" value={t} defaultChecked={marcadoTipo(t)} className={anilloFoco} />
                {t}
              </label>
            ))}
          </div>
        </fieldset>
        {puedeEscribir && (
          <div>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Guardando…" : "Guardar política"}
            </Button>
          </div>
        )}
      </form>
    </MarcoAF4>
  );
}

type FilaRegla = ReglaTP & { id: string };

const DEF_REGLAS: DefTabla<FilaRegla> = {
  clave: "fin-tp-reglas",
  campos: [
    { id: "alcance", etiqueta: "Aplica a", tipo: "seleccion", valores: (r) => [r.alcance === "producto" ? "Producto" : "Categoría"], agrupable: true },
    { id: "clave", etiqueta: "Producto o categoría", tipo: "texto", valor: (r) => r.clave },
    { id: "margenPct", etiqueta: "Margen", tipo: "numero", valor: (r) => r.margenPct },
  ],
};
const ICONOS_REGLAS: Record<string, IconoComp> = { alcance: ExtractoIcon, clave: PedidoIcon, margenPct: WalletIcon };
const COLUMNAS_REGLAS: ColumnaTabla<FilaRegla, null>[] = [
  { id: "alcance", label: "Aplica a", ocultable: false, render: (r) => (r.alcance === "producto" ? "Producto" : "Categoría") },
  { id: "clave", label: "Producto o categoría", ocultable: false, render: (r) => r.clave },
  { id: "margenPct", label: "Margen", ocultable: false, clase: "text-right tabular-nums", render: (r) => porcentaje(r.margenPct) },
];

function QuitarRegla({ fila }: { fila: FilaRegla }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [confirmar, setConfirmar] = useState(false);
  const [pendiente, iniciar] = useTransition();
  if (!confirmar)
    return (
      <button type="button" onClick={() => setConfirmar(true)} aria-label={`Quitar el margen de ${fila.clave}`} className={`rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted ${anilloFoco}`}>
        Quitar
      </button>
    );
  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await eliminarReglaTP(fila.id);
            if (r.error) mostrarToast(r.error, "destructive");
            else mostrarToast("Margen quitado");
            setConfirmar(false);
            router.refresh();
          })
        }
        className={`rounded-md border border-destructive/30 bg-destructive-soft px-2 py-0.5 text-xs font-medium text-destructive disabled:opacity-40 ${anilloFoco}`}
      >
        {pendiente ? "Quitando…" : "Sí, quitar"}
      </button>
      <button type="button" onClick={() => setConfirmar(false)} className={`rounded-md border border-border px-2 py-0.5 text-xs ${anilloFoco}`}>
        No
      </button>
    </span>
  );
}

function CrearReglaPanel({ productos, categorias }: { productos: string[]; categorias: string[] }) {
  const [alcance, setAlcance] = useState<"categoria" | "producto">("categoria");
  const lista = alcance === "producto" ? productos : categorias;
  return (
    <FichaCrear titulo="Margen por producto o categoría" etiquetaCrear="Guardar margen" action={crearReglaTP} mensajeExito="Margen guardado" alAbrir={() => setAlcance("categoria")}>
      {({ faltante, invalido }) => (
        <Seccion icono={WalletIcon} titulo="Margen">
          <Campo etiqueta="Aplica a" id="tp-alcance" obligatorio faltante={faltante}>
            <select id="tp-alcance" name="alcance" required value={alcance} onChange={(e) => setAlcance(e.target.value as "categoria" | "producto")} className={`${fieldClass} w-full`}>
              <option value="categoria">Categoría</option>
              <option value="producto">Producto</option>
            </select>
          </Campo>
          <Campo etiqueta={alcance === "producto" ? "Producto" : "Categoría"} id="tp-clave" obligatorio faltante={faltante}>
            <input id="tp-clave" name="clave" required list="tp-claves" maxLength={200} data-enfocar aria-invalid={invalido("tp-clave")} placeholder={alcance === "producto" ? "Ej: CREMA FACIAL 50 ML" : "Ej: CALZADOS"} className={`${fieldClass} w-full`} />
            <datalist id="tp-claves">
              {lista.slice(0, 2000).map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </Campo>
          <Campo etiqueta="Margen (%)" id="tp-margen" obligatorio faltante={faltante}>
            <input id="tp-margen" name="margen" required inputMode="decimal" pattern="[0-9.,]+" aria-invalid={invalido("tp-margen")} placeholder="Ej: 15" className={`${fieldClass} w-full`} />
          </Campo>
        </Seccion>
      )}
    </FichaCrear>
  );
}

export function TablaReglasTP({ reglas, productos, categorias, puedeEscribir }: { reglas: FilaRegla[]; productos: string[]; categorias: string[]; puedeEscribir: boolean }) {
  return (
    <section aria-labelledby="titulo-reglas-tp" className="flex flex-col gap-2">
      <h2 id="titulo-reglas-tp" className="text-sm font-semibold">
        Márgenes por producto o categoría
      </h2>
      <TablaDatos
        def={DEF_REGLAS}
        filas={reglas}
        columnas={COLUMNAS_REGLAS}
        contexto={null}
        iconos={ICONOS_REGLAS}
        nombre={{ singular: "margen", plural: "márgenes" }}
        claveFila={(r) => r.id}
        accionPrincipal={puedeEscribir ? <CrearReglaPanel productos={productos} categorias={categorias} /> : undefined}
        accion={puedeEscribir ? { etiqueta: "Quitar", render: (r) => <QuitarRegla fila={r} /> } : undefined}
        ariaLabel="Márgenes de transferencia por producto o categoría"
        vacio="Todos los productos usan el margen por defecto."
      />
    </section>
  );
}
