import type { ChatterDocument } from "../types/chatter";
import { createChatterId } from "../types/chatter";
import { isoNow } from "../utils/date";

export function createBlankChatter(): ChatterDocument {
  const createdAt = isoNow();
  const location = "tavern";
  const content = "";

  return {
    id: createChatterId(location, content),
    location,
    content,
    aerissResponse: "",
    createdAt,
    updatedAt: createdAt,
  };
}

export function createSampleChatter(): ChatterDocument {
  const createdAt = isoNow();
  const location = "port";
  const content = "Routes are tight this week. If the Charter Guild misses one more convoy, half the district starts eating steam biscuits.";

  return {
    id: createChatterId(location, content),
    location,
    content,
    aerissResponse: "Then we stay ahead of the shortage and move before the panic pricing starts.",
    createdAt,
    updatedAt: createdAt,
  };
}
