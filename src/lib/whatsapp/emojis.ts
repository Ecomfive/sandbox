// Los emojis del selector de la bandeja (29 oct 2026), por grupos como en WhatsApp. Sin librería: es solo texto, y el sistema operativo los dibuja.

export interface GrupoEmojis {
  id: string;
  etiqueta: string;
  /** Un emoji que representa al grupo en la barra. */
  icono: string;
  emojis: string[];
}

const e = (t: string) => Array.from(new Intl.Segmenter("es", { granularity: "grapheme" }).segment(t.replace(/\s+/g, "")), (s) => s.segment);

export const GRUPOS_EMOJIS: GrupoEmojis[] = [
  {
    id: "caras",
    etiqueta: "Caras",
    icono: "😀",
    emojis: e(
      "😀😃😄😁😆😅😂🤣🥲☺️😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨🧐🤓😎🥸🤩🥳😏😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🫡🤭🫢🤫🤥😶😐😑😬🙄😯😦😧😮😲🥱😴🤤😪😵🤐🥴🤢🤮🤧😷🤒🤕🤑🤠😈👿💩👻💀☠️👽🤖🎃😺😸😹😻😼😽🙀😿😾",
    ),
  },
  {
    id: "gestos",
    etiqueta: "Gestos",
    icono: "👍",
    emojis: e("👋🤚🖐️✋🖖👌🤌🤏✌️🤞🤟🤘🤙👈👉👆👇☝️👍👎✊👊🤛🤜👏🙌👐🤲🤝🙏✍️💅🤳💪🦾🧠👀👅👄🙋🙆🙅🤷🤦💁🙇"),
  },
  {
    id: "simbolos",
    etiqueta: "Corazones y símbolos",
    icono: "❤️",
    emojis: e("❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝💟✅❌⭕❗❓‼️⁉️💯🔥✨🌟⭐💫⚡💥💢💦💤🎉🎊🎈🎁🏆🥇🥈🥉➕➖➗✔️☑️🔔🔕📌📍⚠️🚫⛔🆗🆕🆓🔝"),
  },
  {
    id: "objetos",
    etiqueta: "Objetos",
    icono: "📦",
    emojis: e("📦📬📮✉️📧📱💻🖥️⌨️🖨️📷📹🎥📞☎️📺⏰⌛⏳💡🔋🔌💰💵💳🧾📈📉📊📋📎✂️🔒🔓🔑🛒🛍️🚚🚛✈️🚀🚗🏍️🚲⚽🏀🎮🎯🎵🎶🎤🎧📝📅📆🗂️📁🔍🔎🏷️💼🏠🏢"),
  },
  {
    id: "comida",
    etiqueta: "Comida",
    icono: "🍕",
    emojis: e("🍎🍌🍇🍓🍑🥭🍍🥥🥑🍅🌽🥕🍞🥐🧀🍕🍔🍟🌭🌮🥗🍝🍜🍣🍤🍦🍰🎂🍩🍪🍫☕🍵🍺🍻🥂🍷🍹🧃🥤💧"),
  },
  {
    id: "naturaleza",
    etiqueta: "Naturaleza",
    icono: "🌸",
    emojis: e("🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🙈🙉🙊🐔🐧🐦🦆🦅🦉🦇🐝🦋🐢🐍🐠🐬🐳🌸🌹🌻🌷🌱🌴🌵🍀🍁🌈☀️🌤️⛅☁️🌧️⛈️❄️🌊🌍🌙"),
  },
  {
    id: "banderas",
    etiqueta: "Banderas",
    icono: "🇵🇦",
    emojis: e("🇵🇦🇨🇷🇨🇴🇲🇽🇻🇪🇪🇨🇵🇪🇨🇱🇦🇷🇺🇾🇧🇴🇬🇹🇭🇳🇳🇮🇸🇻🇩🇴🇵🇾🇪🇸🇺🇸🇧🇷"),
  },
];
