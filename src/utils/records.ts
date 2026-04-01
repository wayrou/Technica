import type { KeyValueRecord } from "../types/common";

export function parseCommaList(input: string) {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function serializeCommaList(values: string[]) {
  return values.join(", ");
}

export function parseMultilineList(input: string) {
  return input
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function serializeMultilineList(values: string[]) {
  return values.join("\n");
}

export function parseKeyValueLines(input: string) {
  return input.split("\n").reduce<KeyValueRecord>((record, rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      return record;
    }

    const separatorIndex = line.includes("=") ? line.indexOf("=") : line.indexOf(":");
    if (separatorIndex === -1) {
      record[line] = "";
      return record;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key) {
      record[key] = value;
    }
    return record;
  }, {});
}

export function serializeKeyValueLines(record: KeyValueRecord) {
  return Object.entries(record)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}
