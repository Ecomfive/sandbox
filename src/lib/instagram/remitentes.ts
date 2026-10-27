// Instagram › quién puede mandar capturas a la cuenta de fuentes (auditoría 27 oct 2026). La firma de Meta prueba que el aviso viene
// de Meta, no que quien escribió sea del equipo: sin esta lista, cualquier cuenta que le escriba a @ecomfive.fuentes creaba o cambiaba
// capturas. Son los IDs de cada persona en la cuenta de fuentes (el `sender.id` del aviso), los que ya habían mandado capturas. Para
// sumar a alguien: agregar su ID aquí, o en la variable de entorno INSTAGRAM_REMITENTES (separados por comas) sin publicar código.
// Lo compartido desde el celular con la plataforma («web:<perfil>») no pasa por aquí: ya exige sesión y permiso.
// Sin base ni red.

const EQUIPO = [
  "1830660511438138", // Alcides Andrade (soyaandrade)
  "1998016437825052", // Jhokser Gonzalez (jhokserg)
  "2020758428639311", // Hernán Betancourt (hernan.betancourt95)
];

/** Los remitentes permitidos: los del equipo más los de INSTAGRAM_REMITENTES. */
export function remitentesPermitidos(extra = process.env.INSTAGRAM_REMITENTES): Set<string> {
  const deEntorno = (extra ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{5,30}$/.test(s));
  return new Set([...EQUIPO, ...deEntorno]);
}

/** Si un remitente del webhook es del equipo. */
export const esDelEquipo = (remitenteId: string, permitidos = remitentesPermitidos()) => permitidos.has(remitenteId);
