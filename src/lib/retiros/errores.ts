// Mensajes de error que ve la persona al eliminar algo. La base responde con textos técnicos («violates foreign key
// constraint...») que no dicen qué hacer; aquí se traducen. Sin React, para poder probarlo.

/**
 * El aviso que se muestra cuando no se pudo eliminar. `que` es lo que se intentó borrar («el retiro #0007», «la cuenta
 * "Banco A"»). Un mensaje que ya es de la aplicación y ya explica («No se puede eliminar: tiene 3 retiros...») se
 * muestra tal cual; un error de llave foránea (algo más depende de eso) se explica; cualquier otro lleva el mensaje
 * de la base después de decir qué no se pudo hacer.
 */
export function mensajeErrorAlEliminar(que: string, errorDeLaBase: string): string {
  const texto = errorDeLaBase.trim();
  if (/^no se pu(ede|do) eliminar/i.test(texto)) return texto;
  const minusculas = texto.toLowerCase();
  if (minusculas.includes("foreign key") || minusculas.includes("violates") || minusculas.includes("23503")) {
    return `No se puede eliminar ${que}: tiene otros registros asociados.`;
  }
  return `No se pudo eliminar ${que}: ${texto}`;
}
