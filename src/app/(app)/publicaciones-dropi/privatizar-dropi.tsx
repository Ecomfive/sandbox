"use client";

import { BotonIconoFila } from "./boton-icono-fila";
import { motivoPrivatizar, motivoQuitarPrivatizacion } from "@/lib/publicaciones/botones-fila";

import { useEffect, useRef, useState, useTransition } from "react";
import { BotonAccion } from "@/components/ui/boton-accion";
import { Campo } from "@/components/ui/campo-ficha";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { usePuedeAbrir } from "@/components/modulos-contexto";
import { CandadoAbiertoIcon, CandadoIcon, DeshacerIcon } from "@/lib/nav-icons";
import { esBodegaDropi } from "@/lib/publicaciones/automatico";
import { faltantesPrivatizar, inicialesDe, limpiarIniciales, nombrePrivado, normalizarDatosPrivatizar } from "@/lib/publicaciones/privatizar-dropi";
import { codigoBodega } from "@/lib/publicaciones/sincronizar-dropi";
import { buscarDropshippersParaPrivatizar, privatizarPublicacion, quitarPrivatizacion } from "./actions";
import { VentanaDeshacerApagado } from "./apagar-dropi";
import { estadoBotones, type FilaPublicacion } from "./def-publicaciones";

/** Las bodegas de ECOMFIVE con stock de este producto en Dropi (la B280 es de Dropi y no se mueve desde aquí), de más a menos stock. */
const bodegasConStock = (p: FilaPublicacion) => (p.bodegasDropi ?? []).filter((b) => !esBodegaDropi(b.id) && b.stock > 0).sort((a, b) => b.stock - a.stock);

/**
 * Si una publicación se puede privatizar: es una pública con ID de Dropi, activa, ya publicada y con stock en una bodega de ECOMFIVE. Lo usan el
 * botón de la ficha y el de la fila.
 */
export const puedePrivatizar = (p: FilaPublicacion): boolean =>
  p.dropiId.trim() !== "" && !p.duplicadaDe && !p.archivada && !p.sinPublicar && p.enDropi !== "archivado" && p.tipoDropi !== "privado" && bodegasConStock(p).length > 0;

const numero = (t: string) => Number(t.replace(",", "."));

/**
 * «Privatizar en Dropi» (pedido de Jhokser, 26 oct 2026): dejarle un producto a un solo dropshipper. Pide lo que Dropi necesita (el correo con que
 * el dropshipper entra a Dropi, cuántas unidades se le reservan, de qué bodega y a qué precio) y el nombre para el «P-XX»; el sistema lo deja
 * pendiente y «Aplicar en Dropi» crea el producto privado, se lo asigna y le saca esas unidades al público. Cuando Dropi lo confirma, el sistema
 * crea la publicación privada. Nada se privatiza solo.
 */
function VentanaPrivatizar({ p, alCerrar }: { p: FilaPublicacion; alCerrar: () => void }) {
  const { mostrarToast } = useToast();
  const bodegas = bodegasConStock(p);
  const puedeCrm = usePuedeAbrir("crm-dropshippers");
  const [dropshipper, setDropshipper] = useState("");
  const [dropshipperId, setDropshipperId] = useState<string | null>(null);
  const [correo, setCorreo] = useState("");
  const [iniciales, setIniciales] = useState("");
  const [inicialesAMano, setInicialesAMano] = useState(false);
  const [unidades, setUnidades] = useState("");
  const [bodega, setBodega] = useState(String(bodegas[0]?.id ?? ""));
  const [precio, setPrecio] = useState(p.precioVenta != null ? String(p.precioVenta) : "");
  const [busqueda, setBusqueda] = useState("");
  const [encontrados, setEncontrados] = useState<{ id: string; nombre: string; correo: string; tienda: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const ultima = useRef(0);

  // Buscar en el CRM al escribir (con una pausa), solo si la persona puede abrir el CRM.
  useEffect(() => {
    if (!puedeCrm || busqueda.trim().length < 2) return;
    const turno = ++ultima.current;
    const t = setTimeout(() => {
      buscarDropshippersParaPrivatizar(p.id, busqueda)
        .then((r) => {
          if (turno === ultima.current) setEncontrados(r.resultados);
        })
        .catch(() => undefined);
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda, p.id, puedeCrm]);

  // Lo que se muestra: nada hasta escribir al menos dos letras (sin tocar el estado desde el efecto).
  const resultados = puedeCrm && busqueda.trim().length >= 2 ? encontrados : [];

  function cambiarNombre(n: string) {
    setDropshipper(n);
    setDropshipperId(null);
    if (!inicialesAMano) setIniciales(inicialesDe(n));
  }
  function elegir(x: { id: string; nombre: string; correo: string }) {
    setDropshipper(x.nombre);
    setDropshipperId(x.id);
    if (x.correo) setCorreo(x.correo);
    if (!inicialesAMano) setIniciales(inicialesDe(x.nombre));
    setBusqueda("");
    setEncontrados([]);
  }

  const nombre = iniciales ? nombrePrivado(iniciales, p.nombre) : "";
  const bodegaElegida = bodegas.find((b) => String(b.id) === bodega) ?? null;
  const datos = normalizarDatosPrivatizar({ correo, dropshipper, dropshipperId, iniciales, unidades: numero(unidades), bodega: Number(bodega), precio: numero(precio), nombre, origen: p.id });
  const faltan = faltantesPrivatizar(datos, bodegaElegida?.stock ?? null);
  const pasos = [
    `Comprobar que ${datos.correo || "el correo"} tiene cuenta de dropshipper en Dropi`,
    `Crear el producto privado «${nombre || "P-XX …"}»${datos.precio ? ` a $${datos.precio.toFixed(2)}` : ""}, con las fotos y garantías del público`,
    `Ponerle ${datos.unidades ? datos.unidades.toLocaleString("es-PA") : "las"} unidades y asignárselo a ${datos.dropshipper || "el dropshipper"} en «Productos privados»`,
    `Sacarle esas unidades al público (ID ${p.dropiId})`,
  ];

  function confirmar() {
    setError(null);
    empezar(async () => {
      const r = await privatizarPublicacion(p.id, { correo, dropshipper, dropshipperId, iniciales, unidades: numero(unidades), bodega: Number(bodega), precio: numero(precio) }).catch(() => ({ error: "No se pudo. Inténtalo de nuevo.", detalle: undefined }));
      if (r.error) return void setError(r.error);
      alCerrar();
      mostrarToast(r.detalle ?? "Privatización pendiente");
    });
  }

  return (
    <Ventana abierto alCerrar={alCerrar} titulo="Privatizar en Dropi" ancho="md">
      <form
        className="flex flex-col gap-4 p-5 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (!faltan.length && !pendiente) confirmar();
        }}
      >
        <p className="m-0 truncate font-medium">
          {p.nombre} <span className="font-normal text-muted-foreground">· ID {p.dropiId}</span>
        </p>
        {puedeCrm && (
          <div className="flex flex-col gap-1.5">
            <Campo etiqueta="Buscar en el CRM" id="priv-buscar">
              <input id="priv-buscar" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} autoComplete="off" placeholder="Ej: nombre, tienda o correo" className={`${fieldClass} w-full`} />
            </Campo>
            {resultados.length > 0 && (
              <ul className="m-0 flex list-none flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-card p-0">
                {resultados.map((x) => (
                  <li key={x.id}>
                    <button type="button" onClick={() => elegir(x)} className={`flex w-full min-w-0 flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted ${anilloFoco}`}>
                      <span className="max-w-full truncate font-medium">{x.nombre}</span>
                      <span className="max-w-full truncate text-xs text-muted-foreground">{[x.tienda, x.correo].filter(Boolean).join(" · ") || "Sin correo"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre del dropshipper" id="priv-nombre" obligatorio>
            <input id="priv-nombre" value={dropshipper} onChange={(e) => cambiarNombre(e.target.value)} maxLength={120} autoComplete="off" placeholder="Ej: María Álvarez" className={`${fieldClass} w-full`} />
          </Campo>
          <Campo etiqueta="Correo en Dropi" id="priv-correo" obligatorio>
            <input id="priv-correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} maxLength={200} autoComplete="off" placeholder="Ej: maria@correo.com" className={`${fieldClass} w-full`} />
          </Campo>
          <Campo etiqueta="Iniciales del «P-XX»" id="priv-iniciales" obligatorio>
            <input
              id="priv-iniciales"
              value={iniciales}
              onChange={(e) => {
                setIniciales(limpiarIniciales(e.target.value));
                setInicialesAMano(true);
              }}
              maxLength={6}
              autoComplete="off"
              placeholder="Ej: MA"
              className={`${fieldClass} w-full uppercase`}
            />
          </Campo>
          <Campo etiqueta="Precio de venta ($)" id="priv-precio" obligatorio>
            <input id="priv-precio" type="number" inputMode="decimal" min={0.1} step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Ej: 9.99" className={`${fieldClass} w-full tabular-nums`} />
          </Campo>
          <Campo etiqueta="Unidades que se le reservan" id="priv-unidades" obligatorio>
            <input id="priv-unidades" type="number" inputMode="numeric" min={1} step={1} max={bodegaElegida?.stock} value={unidades} onChange={(e) => setUnidades(e.target.value)} placeholder="Ej: 50" className={`${fieldClass} w-full tabular-nums`} />
          </Campo>
          <Campo etiqueta="Bodega de donde salen" id="priv-bodega" obligatorio>
            <select id="priv-bodega" value={bodega} onChange={(e) => setBodega(e.target.value)} className={`${fieldClass} w-full`}>
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>
                  {codigoBodega(b.id)} · {b.nombre} ({b.stock.toLocaleString("es-PA")} u.)
                </option>
              ))}
            </select>
          </Campo>
        </div>
        {nombre && (
          <p className="m-0 text-muted-foreground">
            Nombre en Dropi: <span className="font-medium text-foreground">{nombre}</span>
          </p>
        )}
        <ol className="m-0 flex list-none flex-col gap-0.5 p-0 text-xs text-muted-foreground">
          {pasos.map((t, i) => (
            <li key={t}>
              {i + 1}. {t}
            </li>
          ))}
        </ol>
        {error && (
          <p role="alert" className="m-0 text-destructive">
            {error}
          </p>
        )}
        {faltan.length > 0 && <p className="m-0 text-xs text-muted-foreground">Falta: {faltan.join(" ")}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pendiente || faltan.length > 0} className={`inline-flex min-h-10 items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40 ${anilloFoco}`}>
            {pendiente ? "Un momento..." : "Privatizar y dejar pendiente para Dropi"}
          </button>
          <button type="button" onClick={alCerrar} className={`inline-flex min-h-10 items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
            Cancelar
          </button>
        </div>
      </form>
    </Ventana>
  );
}

/**
 * «Quitar privatización» (pedido de Hernán, 30 oct 2026): el candado cerrado de un ID privado. Deja pendiente que «Aplicar en Dropi» le saque el stock
 * al privado, le quite el correo en «Productos privados», le devuelva esas unidades al público que se elija (el del mismo producto) y lo archive.
 * Se puede elegir no devolverlas (quedan fuera, como con «Apagar»). Nada se toca en Dropi hasta «Aplicar en Dropi».
 */
function VentanaQuitarPrivatizacion({ p, alCerrar }: { p: FilaPublicacion; alCerrar: () => void }) {
  const { mostrarToast } = useToast();
  const publicos = p.publicosDelProducto;
  const [destino, setDestino] = useState(publicos[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const elegido = publicos.find((x) => x.id === destino) ?? null;
  const unidades = p.stockProveedor ?? 0;
  const quien = p.privatizadoA || p.privatizadoEmail;
  const pasos = [
    unidades > 0 ? `Sacarle al privado sus ${unidades.toLocaleString("es-PA")} unidades` : "Sacarle al privado el stock que tenga",
    `Quitar la privatización${quien ? ` (${quien})` : ""} en «Productos privados»`,
    elegido ? `Devolver esas unidades al público «${elegido.nombre}» (ID ${elegido.dropiId})` : "No devolver las unidades a un público",
    "Archivar el privado",
  ];

  function confirmar() {
    setError(null);
    empezar(async () => {
      const r = await quitarPrivatizacion(p.id, elegido?.id ?? null).catch(() => ({ error: "No se pudo. Inténtalo de nuevo.", detalle: undefined }));
      if (r.error) return void setError(r.error);
      alCerrar();
      mostrarToast(r.detalle ?? "Quitar privatización pendiente");
    });
  }

  return (
    <Ventana abierto alCerrar={alCerrar} titulo="Quitar privatización" ancho="md">
      <div className="flex flex-col gap-4 p-5 text-sm">
        <p className="m-0 truncate font-medium">
          {p.nombre} <span className="font-normal text-muted-foreground">· ID {p.dropiId}</span>
        </p>
        <Campo etiqueta="Devolver las unidades a" id="quitar-priv-destino">
          <select id="quitar-priv-destino" value={destino} onChange={(e) => setDestino(e.target.value)} className={`${fieldClass} w-full`}>
            {publicos.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre} · ID {x.dropiId}
                {x.stock != null ? ` (${x.stock.toLocaleString("es-PA")} u.)` : ""}
              </option>
            ))}
            <option value="">No devolverlas (solo sacarlas)</option>
          </select>
        </Campo>
        {!publicos.length && <p className="m-0 text-xs text-muted-foreground">No hay un público activo de este producto: las unidades solo se sacan del privado.</p>}
        <ol className="m-0 flex list-none flex-col gap-0.5 p-0 text-xs text-muted-foreground">
          {pasos.map((t, i) => (
            <li key={t}>
              {i + 1}. {t}
            </li>
          ))}
        </ol>
        <p className="m-0 text-xs text-muted-foreground">Queda pendiente hasta que alguien pulse «Aplicar en Dropi». Si Dropi no deja archivar (órdenes pendientes), se reintenta en el siguiente.</p>
        {error && (
          <p role="alert" className="m-0 text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={confirmar} disabled={pendiente} className={`inline-flex min-h-10 items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40 ${anilloFoco}`}>
            {pendiente ? "Un momento..." : "Quitar privatización y dejar pendiente para Dropi"}
          </button>
          <button type="button" onClick={alCerrar} className={`inline-flex min-h-10 items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
            Cancelar
          </button>
        </div>
      </div>
    </Ventana>
  );
}

/** La ventana del candado: privatizar un público, quitarle la privatización a un privado o, si ya hay un apagado esperando en el privado, deshacerlo. */
function VentanaCandado({ p, alCerrar }: { p: FilaPublicacion; alCerrar: () => void }) {
  if (p.tipoDropi !== "privado") return <VentanaPrivatizar p={p} alCerrar={alCerrar} />;
  if (p.apagadoPendiente) return <VentanaDeshacerApagado p={p} abierta alCerrar={alCerrar} />;
  return <VentanaQuitarPrivatizacion p={p} alCerrar={alCerrar} />;
}

/**
 * El botón del candado en la ficha. Un público lo tiene abierto («Privatizar en Dropi»); un privado, cerrado («Quitar privatización», 30 oct 2026). La
 * ventana solo existe mientras está abierta, así cada vez sale vacía.
 */
export function BotonPrivatizarDropi({ p, deshabilitado }: { p: FilaPublicacion; deshabilitado: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const privado = p.tipoDropi === "privado";
  return (
    <>
      <BotonAccion icono={privado ? (p.apagadoPendiente ? DeshacerIcon : CandadoIcon) : CandadoAbiertoIcon} tono={privado ? (p.apagadoPendiente ? "alerta" : "privado") : "neutro"} disabled={deshabilitado} onClick={() => setAbierta(true)}>
        {privado ? (p.apagadoPendiente ? "Deshacer apagado" : "Quitar privatización") : "Privatizar en Dropi"}
      </BotonAccion>
      {abierta && <VentanaCandado p={p} alCerrar={() => setAbierta(false)} />}
    </>
  );
}

/**
 * El candado de cada fila, junto al de apagar (30 oct 2026): **abierto** en un público (privatizarlo) y **cerrado** en un privado (quitarle la
 * privatización). Si no se puede usar, va apagado y dice por qué.
 */
export function BotonPrivatizarFila({ f }: { f: FilaPublicacion }) {
  const [abierta, setAbierta] = useState(false);
  const privado = f.tipoDropi === "privado";
  // Siempre se ve (27 oct 2026): si no se puede usar, va apagado y dice por qué.
  return (
    <>
      <BotonIconoFila
        texto={
          privado
            ? f.apagadoPendiente
              ? "Quitar privatización (pendiente: pulsa para deshacer)"
              : "Quitar privatización"
            : f.privatizaciones.length
              ? "Privatizar en Dropi (hay una pendiente)"
              : "Privatizar en Dropi"
        }
        motivo={privado ? motivoQuitarPrivatizacion(estadoBotones(f)) : motivoPrivatizar(estadoBotones(f))}
        icono={privado ? CandadoIcon : CandadoAbiertoIcon}
        nombre={f.nombre}
        onClick={() => setAbierta(true)}
        // Privado: el candado cerrado en el morado de lo privado (30 oct 2026, pedido de Hernán); con «Quitar privatización» pendiente, en rojo.
        activo={privado ? (f.apagadoPendiente ? "rojo" : "violeta") : f.privatizaciones.length ? "violeta" : undefined}
      />
      {abierta && <VentanaCandado p={f} alCerrar={() => setAbierta(false)} />}
    </>
  );
}
