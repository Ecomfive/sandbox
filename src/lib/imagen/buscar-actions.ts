"use server";

import { getUsuarioActual } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { detectarImagen } from "@/lib/seguridad/imagen";
import { createServiceClient } from "@/lib/supabase/server";
import { huellaFoto } from "@/lib/wms/huella-foto";
import { pedirIA, proveedorTexto } from "@/lib/publicaciones/ia/proveedor";
import { AMBITOS, depurar, elegirParaComparar, ordenar, porHuella, porNombre, unirCoincidencias, type Ambito, type Coincidencia } from "./buscar";
import { cargarCandidatos } from "./candidatos-datos";
import { leerDescripcion, leerVerificacion, MAX_CANDIDATOS_IA, pedidoDescribir, pedidoVerificar } from "./ia-imagen";

/** Lo que ve la pantalla de cada coincidencia (sin la huella). */
export type CoincidenciaVista = Omit<Coincidencia, "huella">;

export interface RespuestaBusquedaImagen {
  coincidencias: CoincidenciaVista[];
  /** Qué producto dijo la IA que es la foto, si se usó. */
  descripcion: string | null;
  /** Si la IA comparó las fotos (no solo la huella). */
  conIA: boolean;
  /** Un aviso que no impide el resultado («la IA no respondió: se muestran las fotos parecidas»). */
  aviso: string | null;
  /** Dónde se buscó. */
  ambitos: Ambito[];
  /** Cuántos se quitaron de la lista por ser otro producto (según la IA) o parecerse solo de lejos. */
  descartadas: number;
}

/** La imagen llega ya reducida desde el navegador (JPG, PNG o WebP de ~170 KB, como data URL); aquí se revisa por su contenido, no por lo que declara. */
const DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_CARACTERES = 700_000;
const TOPE_RESULTADOS = 40;

/**
 * Buscar por imagen (26 oct 2026): una foto encuentra, en las partes del sistema que la persona puede abrir, los productos que se ven igual. Primero por la
 * huella de la foto (gratis); con `conIA`, la IA de visión dice qué es la foto, se suman los productos que se llaman parecido y compara las fotos de los
 * mejores candidatos para decir cuáles son el mismo producto. Si no hay IA conectada o falla, se devuelve lo de la huella con un aviso. Devuelve el error
 * como valor.
 */
export async function buscarPorImagen(imagen: string, opciones: { ambitos?: Ambito[]; conIA?: boolean } = {}): Promise<RespuestaBusquedaImagen | { error: string }> {
  const usuario = await getUsuarioActual();
  if (!usuario) return { error: "Inicia sesión para buscar por imagen." };
  const pedidos = Array.isArray(opciones.ambitos) && opciones.ambitos.length ? opciones.ambitos : AMBITOS.map((a) => a.valor);
  // Solo las partes del sistema que la persona puede abrir.
  const ambitos = AMBITOS.filter((a) => pedidos.includes(a.valor) && usuario.modulos.includes(a.modulo)).map((a) => a.valor);
  if (!ambitos.length) return { error: "No tienes acceso a las partes del sistema donde buscar." };
  if (typeof imagen !== "string" || imagen.length > MAX_CARACTERES) return { error: "La imagen es muy pesada: prueba con otra." };
  const m = DATA_URL.exec(imagen);
  if (!m) return { error: "Solo se aceptan imágenes JPG, PNG o WebP." };
  const bytes = new Uint8Array(Buffer.from(m[1], "base64"));
  if (!detectarImagen(bytes)) return { error: "Ese archivo no es una imagen válida." };
  const huella = await huellaFoto(bytes);
  if (!huella) return { error: "No se pudo leer la imagen." };

  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  if (!(await puedeVerPaisId(supabase, usuario.paisesPermitidos, pais.id))) return { error: "No tienes acceso al país seleccionado." };
  const candidatos = (await Promise.all(ambitos.map((a) => cargarCandidatos(`${a}:${pais.id}`, supabase, a, pais.id)))).flat();

  let coincidencias = porHuella(huella, candidatos);
  let descripcion: string | null = null;
  let conIA = false;
  let aviso: string | null = null;

  if (opciones.conIA !== false) {
    if (!proveedorTexto()) {
      aviso = "No hay una IA conectada: se muestran solo las fotos parecidas.";
    } else {
      const consumo = { operacion: "busqueda_imagen", modulo: "imagen", usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email } };
      // 1) Qué es la foto → candidatos por nombre.
      const d = await pedirIA(pedidoDescribir(imagen), false, consumo);
      const desc = "texto" in d ? leerDescripcion(d.texto) : null;
      if (desc) {
        descripcion = desc.producto || null;
        coincidencias = unirCoincidencias(coincidencias, desc.seguro ? porNombre(desc.palabras, candidatos) : []);
      }
      // 2) Comparar las fotos de los mejores candidatos: las casi iguales por huella y los que más se llaman como dijo la IA.
      const aComparar = elegirParaComparar(coincidencias, MAX_CANDIDATOS_IA);
      if (aComparar.length) {
        const v = await pedirIA(pedidoVerificar(imagen, aComparar.map((c) => ({ nombre: c.nombre, foto: c.foto as string }))), false, consumo);
        if ("texto" in v) {
          const resultados = leerVerificacion(v.texto, aComparar.length);
          if (resultados.length) {
            conIA = true;
            for (const r of resultados) {
              const c = aComparar[r.n - 1];
              c.veredicto = r.veredicto;
              c.motivo = r.motivo;
            }
          } else aviso = "La IA no pudo comparar las fotos: se muestran las parecidas por la huella.";
        } else aviso = `${v.error} Se muestran las fotos parecidas por la huella.`;
      } else if (!desc) aviso = "La IA no pudo reconocer el producto: se muestran solo las fotos parecidas.";
    }
  }

  const { visibles, descartadas } = depurar(coincidencias, conIA);
  const salida = ordenar(visibles)
    .slice(0, TOPE_RESULTADOS)
    .map((c): CoincidenciaVista => {
      const { huella: _huella, ...resto } = c;
      void _huella;
      return resto;
    });
  return { coincidencias: salida, descripcion, conIA, aviso, ambitos, descartadas };
}
