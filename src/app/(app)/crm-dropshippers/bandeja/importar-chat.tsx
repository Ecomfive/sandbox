"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { ProgresoCarga } from "@/components/ui/progreso-carga";
import { Ventana } from "@/components/ui/ventana";
import type { AreaCrm } from "@/lib/crm/areas";
import { supabase } from "@/lib/supabase/client";
import {
  autoresDe,
  leerChatExportado,
  nombreDelArchivo,
  numerarRepetidos,
  proponerNosotros,
  tipoDeArchivo,
  ZONAS_IMPORTAR,
  zonaPorNumero,
  type MensajeExportado,
} from "@/lib/whatsapp/importar";
import { abrirZip } from "@/lib/whatsapp/zip";
import type { NumeroVista } from "./datos-bandeja";
import { archivoImportadoListo, conversacionParaImportar, guardarLoteImportado, permisoArchivoImportado, type MensajeAImportar } from "./importar-actions";

const MAX_ARCHIVO = 25 * 1024 * 1024;
/** Lotes de hasta 500 mensajes o ~600 KB, para no pasar el límite de una acción del servidor. */
const LOTE_MENSAJES = 500;
const LOTE_BYTES = 600_000;

interface Leido {
  nombreArchivo: string;
  mensajes: MensajeExportado[];
  repetidos: number[];
  autores: { nombre: string; mensajes: number }[];
  archivos: Map<string, Blob>;
  contacto: string | null;
}

const fecha = (local: string) => new Date(`${local}Z`).toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Lee lo que eligió la persona: el .txt del chat (suelto o dentro del .zip) y los archivos que lo acompañan. */
async function leerArchivos(lista: File[]): Promise<Leido | { error: string }> {
  const textos: { nombre: string; texto: string }[] = [];
  const archivos = new Map<string, Blob>();
  let principal = "";
  for (const f of lista) {
    if (/\.zip$/i.test(f.name)) {
      principal ||= f.name;
      const dentro = await abrirZip(new Uint8Array(await f.arrayBuffer()), MAX_ARCHIVO);
      for (const a of dentro) {
        if (/\.txt$/i.test(a.nombre)) textos.push({ nombre: f.name, texto: new TextDecoder().decode(a.datos) });
        else archivos.set(a.nombre, new Blob([a.datos as BlobPart], { type: tipoDeArchivo(a.nombre).mime }));
      }
    } else if (/\.txt$/i.test(f.name)) {
      textos.push({ nombre: f.name, texto: await f.text() });
    } else if (f.size <= MAX_ARCHIVO) {
      archivos.set(f.name, f);
    }
  }
  // Si hay varios .txt (un archivo de texto que se mandó por el chat, por ejemplo), el chat es el que tiene más mensajes.
  const elegido = textos.map((t) => ({ ...t, mensajes: leerChatExportado(t.texto) })).sort((a, b) => b.mensajes.length - a.mensajes.length)[0];
  if (!elegido) return { error: "Falta el archivo del chat: el .txt (o el .zip) que da WhatsApp con «Exportar chat»." };
  if (!elegido.mensajes.length) return { error: "No se encontraron mensajes en el archivo. ¿Es un chat exportado de WhatsApp?" };
  const nombreArchivo = principal || elegido.nombre;
  return {
    nombreArchivo,
    mensajes: elegido.mensajes,
    repetidos: numerarRepetidos(elegido.mensajes),
    autores: autoresDe(elegido.mensajes),
    archivos,
    contacto: nombreDelArchivo(nombreArchivo) ?? nombreDelArchivo(elegido.nombre),
  };
}

/** Lotes para `guardarLoteImportado`. */
function enLotes(mensajes: MensajeAImportar[]): MensajeAImportar[][] {
  const lotes: MensajeAImportar[][] = [];
  let actual: MensajeAImportar[] = [];
  let bytes = 0;
  for (const m of mensajes) {
    const tam = (m.texto?.length ?? 0) * 2 + m.autor.length + 120;
    if (actual.length && (actual.length >= LOTE_MENSAJES || bytes + tam > LOTE_BYTES)) {
      lotes.push(actual);
      actual = [];
      bytes = 0;
    }
    actual.push(m);
    bytes += tam;
  }
  if (actual.length) lotes.push(actual);
  return lotes;
}

/**
 * «Importar chat» (28 oct 2026): trae a la bandeja el historial que quedó en el celular de la empresa, exportado con «Exportar chat» de
 * WhatsApp (Android o iPhone, con o sin archivos). Se lee aquí mismo, la persona dice quién es la empresa en el chat y la zona del
 * celular, y se guarda por lotes sin repetir nada; las fotos, audios y documentos se suben después, de tres en tres.
 */
export function ImportarChat({
  abierto,
  alCerrar,
  conversacion,
  numeros,
  areas,
  alTerminar,
}: {
  abierto: boolean;
  alCerrar: () => void;
  /** El chat abierto, o `null` para importar el de alguien que todavía no ha escrito al número nuevo. */
  conversacion: { id: string; nombre: string; nombrePerfil: string | null; numeroId: string } | null;
  numeros: NumeroVista[];
  areas: AreaCrm[];
  alTerminar: (conversacionId: string) => void;
}) {
  const [leido, setLeido] = useState<Leido | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nosotros, setNosotros] = useState<string[]>([]);
  const [numeroId, setNumeroId] = useState(conversacion?.numeroId ?? numeros[0]?.id ?? "");
  const [zona, setZona] = useState(() => zonaPorNumero(numeros.find((n) => n.id === (conversacion?.numeroId ?? numeros[0]?.id))?.numero ?? ""));
  const [telefono, setTelefono] = useState("");
  const [area, setArea] = useState<AreaCrm>(areas[0] ?? "atencion");
  const [progreso, setProgreso] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  function cerrar() {
    if (progreso) return;
    setLeido(null);
    setError(null);
    setResultado(null);
    alCerrar();
  }

  async function elegir(lista: File[]) {
    setError(null);
    setResultado(null);
    setLeido(null);
    if (!lista.length) return;
    setProgreso("Leyendo el chat…");
    const r = await leerArchivos(lista).catch((e: unknown) => ({ error: e instanceof Error ? e.message : "No se pudo leer el archivo." }));
    setProgreso(null);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setLeido(r);
    setNosotros(proponerNosotros(r.autores.map((a) => a.nombre), [conversacion?.nombre, conversacion?.nombrePerfil, r.contacto]));
    if (!conversacion && r.contacto && /^\+?[\d\s()-]{7,}$/.test(r.contacto)) setTelefono(r.contacto);
  }

  async function importar() {
    if (!leido || !listo) return;
    setError(null);
    try {
      let id = conversacion?.id ?? null;
      if (!id) {
        setProgreso("Preparando el chat…");
        const c = await conversacionParaImportar(numeroId, telefono, area, leido.contacto);
        if ("error" in c) throw new Error(c.error);
        id = c.id;
      }
      const todos: MensajeAImportar[] = leido.mensajes.map((m, i) => ({ local: m.local, autor: m.autor, texto: m.texto, archivo: m.archivo, tipo: m.tipo, n: leido.repetidos[i] }));
      const lotes = enLotes(todos);
      const total = { nuevos: 0, yaEstaban: 0, posteriores: 0 };
      const archivos: { mensajeId: string; archivo: string }[] = [];
      let hechos = 0;
      for (const [i, lote] of lotes.entries()) {
        setProgreso(`Guardando mensajes ${hechos.toLocaleString("es-PA")} de ${todos.length.toLocaleString("es-PA")}…`);
        const r = await guardarLoteImportado(id, lote, nosotros, zona, i === lotes.length - 1);
        if ("error" in r) throw new Error(r.error);
        total.nuevos += r.nuevos;
        total.yaEstaban += r.yaEstaban;
        total.posteriores += r.posteriores;
        archivos.push(...r.archivos);
        hechos += lote.length;
      }

      // Los archivos, de tres en tres: permiso firmado, subida directa al bucket y aviso de que llegó.
      let subidos = 0;
      let sinArchivo = 0;
      let fallidos = 0;
      const cola = [...archivos];
      const subirUno = async () => {
        for (let a = cola.shift(); a; a = cola.shift()) {
          const blob = leido.archivos.get(a.archivo);
          if (!blob) {
            sinArchivo++;
            continue;
          }
          const permiso = await permisoArchivoImportado(a.mensajeId).catch(() => ({ error: "No se pudo preparar la subida." }));
          if ("error" in permiso) {
            if (/migración/.test(permiso.error)) throw new Error(permiso.error);
            fallidos++;
            continue;
          }
          const { error: e } = await supabase.storage.from("whatsapp-importados").uploadToSignedUrl(permiso.ruta, permiso.token, blob, { contentType: tipoDeArchivo(a.archivo).mime });
          const listo = e ? null : await archivoImportadoListo(a.mensajeId).catch(() => null);
          if (listo && "ok" in listo) subidos++;
          else fallidos++;
          setProgreso(`Subiendo fotos, audios y documentos: ${subidos + fallidos + sinArchivo} de ${archivos.length}…`);
        }
      };
      if (archivos.length) {
        setProgreso(`Subiendo fotos, audios y documentos: 0 de ${archivos.length}…`);
        await Promise.all([subirUno(), subirUno(), subirUno()]);
      }

      const partes = [`${total.nuevos.toLocaleString("es-PA")} mensajes importados`];
      if (total.yaEstaban) partes.push(`${total.yaEstaban.toLocaleString("es-PA")} ya estaban de antes`);
      if (total.posteriores) partes.push(`${total.posteriores.toLocaleString("es-PA")} ya habían llegado por WhatsApp al sistema`);
      if (subidos) partes.push(`${subidos} archivos subidos`);
      if (sinArchivo) partes.push(`${sinArchivo} archivos no venían en lo que elegiste (exporta «Incluir archivos» para traerlos)`);
      if (fallidos) partes.push(`${fallidos} archivos no se pudieron subir (vuelve a importar el mismo chat para reintentarlos)`);
      setResultado(`${partes.join(" · ")}.`);
      setLeido(null);
      alTerminar(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo importar. Inténtalo de nuevo.");
    } finally {
      setProgreso(null);
    }
  }

  const conArchivo = leido ? leido.mensajes.filter((m) => m.archivo) : [];
  const encontrados = leido ? conArchivo.filter((m) => leido.archivos.has(m.archivo!)).length : 0;
  const nuevo = !conversacion;
  // Con dos o más autores, al menos uno es la empresa y al menos uno no; con uno solo (solo escribió un lado), vale cualquiera.
  const autoresBien = !!leido && (leido.autores.length === 1 || (nosotros.length > 0 && nosotros.length < leido.autores.length));
  const listo = autoresBien && (!nuevo || (!!telefono.trim() && !!numeroId));

  return (
    <Ventana abierto={abierto} alCerrar={cerrar} titulo={conversacion ? `Importar el chat con ${conversacion.nombre}` : "Importar un chat del celular"} ancho="md">
      <div className="flex flex-col gap-4 text-sm">
        <div className="flex flex-col gap-1.5 rounded-lg bg-muted px-3 py-2.5 text-[13px] text-muted-foreground">
          <p className="m-0">
            Trae el historial que quedó en el celular. En WhatsApp, abre el chat › menú <strong className="text-foreground">⋮</strong> › Más › <strong className="text-foreground">Exportar chat</strong>{" "}
            (en iPhone: toca el nombre del contacto › Exportar chat). Elige <strong className="text-foreground">Incluir archivos</strong> para traer fotos, audios y documentos.
          </p>
          <p className="m-0">Sube aquí el .zip o el .txt (y los archivos, si salieron sueltos). Puedes importar el mismo chat otra vez: lo que ya está no se repite.</p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Archivo del chat</span>
          <input
            type="file"
            multiple
            disabled={!!progreso}
            accept=".txt,.zip,image/*,audio/*,video/*,application/pdf,.opus"
            onChange={(e) => void elegir([...(e.target.files ?? [])])}
            className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted"
          />
        </label>

        {leido && (
          <>
            <p className="m-0">
              <strong className="tabular-nums">{leido.mensajes.length.toLocaleString("es-PA")} mensajes</strong> del {fecha(leido.mensajes[0].local)} al {fecha(leido.mensajes[leido.mensajes.length - 1].local)}
              {conArchivo.length > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  · {conArchivo.length} con archivo, {encontrados} {encontrados === 1 ? "encontrado" : "encontrados"}
                </span>
              )}
            </p>

            <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
              <legend className={`${labelClass} mb-1.5`}>¿Quién es la empresa en este chat?</legend>
              <p className="m-0 mb-1 text-[13px] text-muted-foreground">Marca el nombre con que salen los mensajes del celular de la empresa: quedan como enviados (verde). Los demás, como recibidos.</p>
              {leido.autores.map((a) => (
                <label key={a.nombre} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={nosotros.includes(a.nombre)}
                    onChange={(e) => setNosotros((x) => (e.target.checked ? [...x, a.nombre] : x.filter((n) => n !== a.nombre)))}
                    className="h-4 w-4"
                  />
                  <span>{a.nombre}</span>
                  <span className="text-muted-foreground tabular-nums">· {a.mensajes.toLocaleString("es-PA")} mensajes</span>
                </label>
              ))}
            </fieldset>

            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Hora del celular</span>
              <select value={zona} onChange={(e) => setZona(Number(e.target.value))} className={fieldClass}>
                {ZONAS_IMPORTAR.map((z) => (
                  <option key={z.valor} value={z.valor}>
                    {z.etiqueta}
                  </option>
                ))}
              </select>
            </label>

            {nuevo && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className={labelClass}>WhatsApp de la persona</span>
                  <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" placeholder="+58 412 555 0000" className={fieldClass} />
                </label>
                {numeros.length > 1 && (
                  <label className="flex flex-col gap-1.5">
                    <span className={labelClass}>Número de la empresa</span>
                    <select value={numeroId} onChange={(e) => setNumeroId(e.target.value)} className={fieldClass}>
                      {numeros.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {areas.length > 1 && (
                  <label className="flex flex-col gap-1.5">
                    <span className={labelClass}>Área del chat</span>
                    <select value={area} onChange={(e) => setArea(e.target.value as AreaCrm)} className={fieldClass}>
                      {areas.map((a) => (
                        <option key={a} value={a}>
                          {a === "atencion" ? "Atención" : a === "comercial" ? "Comercial" : "Dirección"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
          </>
        )}

        {progreso && <ProgresoCarga mensaje={progreso} />}
        {error && (
          <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-destructive">
            {error}
          </p>
        )}
        {resultado && (
          <p role="status" className="m-0 rounded-md bg-success-soft px-3 py-2 text-success">
            {resultado}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={cerrar} disabled={!!progreso}>
            {resultado ? "Cerrar" : "Cancelar"}
          </Button>
          {leido && (
            <Button type="button" onClick={() => void importar()} disabled={!listo || !!progreso}>
              Importar {leido.mensajes.length.toLocaleString("es-PA")} mensajes
            </Button>
          )}
        </div>
      </div>
    </Ventana>
  );
}
