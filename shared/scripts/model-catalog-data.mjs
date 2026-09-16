/** Keep provider-controlled catalog bytes inside the §A-MODELS-01 public-data boundary. */

import { forbiddenPublicDataReason } from "./public-data.mjs";

const MODEL_ID_MAX_BYTES = 256;
const DISPLAY_TEXT_MAX_BYTES = 1024;

/** §A-MODELS-01 keeps provider model identifiers relative, bounded and terminal-safe. */
export function isPortableModelId(value) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > MODEL_ID_MAX_BYTES) {
    return false;
  }
  if (value === "" || /[\p{Cc}\p{Z}\s\\]/u.test(value) || value.startsWith("/")) return false;
  const segments = value.split("/");
  return segments.every(
    (segment) =>
      segment !== "." && segment !== ".." && /^[A-Za-z0-9][A-Za-z0-9._+:[\]()-]*$/u.test(segment),
  );
}

function isPortableDisplayText(value) {
  if (value === null || value === undefined) return true;
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > DISPLAY_TEXT_MAX_BYTES) {
    return false;
  }
  return !/[\p{Cc}]/u.test(value) && forbiddenPublicDataReason(value) === null;
}

/** §A-MODELS-01 validates every provider-controlled field before projection. */
export function portableCatalogRow(model) {
  return (
    isPortableModelId(model?.slug ?? model?.value) &&
    catalogEfforts(model).every(isPortableModelId) &&
    catalogDisplayValues(model).every(isPortableDisplayText)
  );
}

function catalogEfforts(model) {
  const reasoning = model?.supported_reasoning_levels ?? [];
  return [...reasoning.map(({ effort }) => effort), ...(model?.supportedEffortLevels ?? [])];
}

function catalogDisplayValues(model) {
  const capabilities = model?.capabilities;
  return [
    model?.display_name,
    model?.displayName,
    model?.name,
    model?.description,
    ...(Array.isArray(capabilities) ? capabilities : [capabilities]),
  ];
}

/** §A-MODELS-01 prevents foreign diagnostic bytes from reaching catalog projections. */
export function portableCatalogReason(reason) {
  if (
    typeof reason !== "string" ||
    Buffer.byteLength(reason, "utf8") > DISPLAY_TEXT_MAX_BYTES ||
    forbiddenPublicDataReason(reason) !== null
  ) {
    return "catalog unavailable with a non-portable diagnostic";
  }
  return reason;
}
