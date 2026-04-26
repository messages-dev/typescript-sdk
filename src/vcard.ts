import type { SendContactCardParams } from "./types.js";

const CRLF = "\r\n";

function escapeValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\n|\r/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function pushField(lines: string[], name: string, value: string | undefined) {
  if (value === undefined || value === "") return;
  lines.push(`${name}:${escapeValue(value)}`);
}

export function sniffImageType(
  bytes: Uint8Array,
  hint?: "JPEG" | "PNG",
): "JPEG" | "PNG" {
  if (hint) return hint;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "JPEG";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "PNG";
  }
  return "JPEG";
}

export interface BuildVCardParams extends Omit<SendContactCardParams, "photo"> {
  /** Pre-resolved photo bytes (fetched by the caller from the photo file ID). */
  photoBytes?: Uint8Array;
}

export function buildVCard(params: BuildVCardParams): string {
  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];

  const firstName = params.firstName;
  const lastName = params.lastName;
  lines.push(`N:${escapeValue(lastName)};${escapeValue(firstName)};;;`);
  lines.push(`FN:${escapeValue(`${firstName} ${lastName}`.trim())}`);

  pushField(lines, "ORG", params.org);
  pushField(lines, "TITLE", params.title);
  pushField(lines, "URL", params.url);

  if (params.phones) {
    for (const phone of params.phones) {
      const type = (phone.type ?? "cell").toUpperCase();
      lines.push(`TEL;TYPE=${type}:${escapeValue(phone.value)}`);
    }
  }

  if (params.emails) {
    for (const email of params.emails) {
      const prefix = email.type ? `EMAIL;TYPE=${email.type.toUpperCase()}` : "EMAIL";
      lines.push(`${prefix}:${escapeValue(email.value)}`);
    }
  }

  if (params.address) {
    const a = params.address;
    const parts = [
      "", // PO box
      "", // extended address
      escapeValue(a.street ?? ""),
      escapeValue(a.city ?? ""),
      escapeValue(a.region ?? ""),
      escapeValue(a.postalCode ?? ""),
      escapeValue(a.country ?? ""),
    ].join(";");
    const prefix = a.type ? `ADR;TYPE=${a.type.toUpperCase()}` : "ADR";
    lines.push(`${prefix}:${parts}`);
  }

  pushField(lines, "BDAY", params.bday);
  pushField(lines, "NOTE", params.note);

  if (params.photoBytes) {
    const type = sniffImageType(params.photoBytes, params.photoType);
    const base64 = Buffer.from(params.photoBytes).toString("base64");
    lines.push(`PHOTO;ENCODING=b;TYPE=${type}:${base64}`);
  }

  lines.push("END:VCARD");
  return lines.join(CRLF);
}
