// La Actividad con comentarios (como la de Compras y ClickUp), compartida entre módulos: los datos que la pantalla recibe y las
// acciones que cada módulo le da. Compras la usa con sus tablas `wms_compra_*` y Gestión de IDs Dropi con `dropi_publicacion_*`
// (migración 0132). Solo tipos: sirven al servidor y al navegador.

/** Un archivo de la actividad: con su enlace firmado de una hora (o null si no se pudo firmar). */
export interface AdjuntoActividad {
  id: string;
  nombre: string;
  clase: string;
  url: string | null;
  creadoEn: string;
}

/** Las reacciones de un comentario, por emoji: cuántas, si una es mía y de quiénes. */
export interface ReaccionComentario {
  emoji: string;
  n: number;
  mia: boolean;
  nombres: string[];
}

export interface ComentarioActividad {
  id: string;
  autor: string | null;
  texto: string;
  creadoEn: string;
  /** Los archivos que se adjuntaron en él (la captura de un pago, un comprobante…). */
  adjuntos: AdjuntoActividad[];
  /** A qué comentario responde (un solo nivel), o null. */
  respuestaA: string | null;
  reacciones: ReaccionComentario[];
  /** Cuándo se editó por última vez (null si nunca). */
  editadoEn: string | null;
  /** Si lo escribió la persona que mira (entonces lo puede editar o eliminar). */
  mio: boolean;
}

/** Un cambio de la entidad: un dato que pasó de un valor a otro, o una línea ya armada (`texto`, la de la auditoría). */
export interface EventoActividad {
  id: string;
  campo: string;
  antes: string | null;
  despues: string | null;
  ocurridoEn: string;
  autor: string | null;
  origen: string;
  /** Si viene, se muestra tal cual en vez de «Dato: antes → después». */
  texto?: string;
}

export interface DatosActividad {
  comentarios: ComentarioActividad[];
  /** Los archivos sueltos (fuera de un comentario). */
  adjuntos: AdjuntoActividad[];
  eventos: EventoActividad[];
}

/** Un archivo que ya se subió al almacenamiento para un comentario (falta revisarlo y guardarlo al comentar). */
export interface AdjuntoSubido {
  ruta: string;
  nombre: string;
}

type Resultado = Promise<{ error?: string }>;

/** Lo que cada módulo le da a la Actividad: sus acciones del servidor (cada una revisa permisos y acceso) y su bucket. */
export interface AccionesActividad {
  bucket: string;
  comentar: (entidadId: string, texto: string, menciones: string[], adjuntos: AdjuntoSubido[], respuestaA?: string | null) => Resultado;
  editar: (comentarioId: string, texto: string, menciones: string[], archivos: { quitar?: string[]; agregar?: AdjuntoSubido[] }) => Resultado;
  eliminar: (comentarioId: string) => Resultado;
  reaccionar: (comentarioId: string, emoji: string) => Promise<{ error?: string; reacciones?: ReaccionComentario[] }>;
  prepararSubida: (entidadId: string, nombreArchivo: string) => Promise<{ ruta: string; token: string } | { error: string }>;
  descartarSubida: (entidadId: string, ruta: string) => Promise<void>;
}
