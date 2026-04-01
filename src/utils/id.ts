export function slugify(value: string, fallback = "untitled") {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
}

export function runtimeId(value: string, fallback = "untitled") {
  const id = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  return id || fallback;
}

export function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createSequentialId(prefix: string, existingIds: string[]) {
  const normalizedPrefix = runtimeId(prefix, "item");
  let counter = 1;
  let candidate = `${normalizedPrefix}_${counter}`;
  const existing = new Set(existingIds.map((id) => runtimeId(id)));

  while (existing.has(candidate)) {
    counter += 1;
    candidate = `${normalizedPrefix}_${counter}`;
  }

  return candidate;
}
