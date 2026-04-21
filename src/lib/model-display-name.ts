import { startCase } from "lodash";

export function getModelDisplayName(modelKey: string): string {
  const formatted = startCase(modelKey.toLowerCase());
  return formatted.replace(/(\d)\s+(\d)/g, "$1.$2");
}
