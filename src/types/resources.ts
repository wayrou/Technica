export type ResourceKey =
  | "metalScrap"
  | "wood"
  | "chaosShards"
  | "steamComponents"
  | "alloy"
  | "drawcord"
  | "fittings"
  | "resin"
  | "chargeCells";

export type ResourceWalletDocument = Record<ResourceKey, number>;

export const resourceKeys: ResourceKey[] = [
  "metalScrap",
  "wood",
  "chaosShards",
  "steamComponents",
  "alloy",
  "drawcord",
  "fittings",
  "resin",
  "chargeCells"
];

export const basicResourceKeys: ResourceKey[] = ["metalScrap", "wood", "chaosShards", "steamComponents"];
export const advancedResourceKeys: ResourceKey[] = ["alloy", "drawcord", "fittings", "resin", "chargeCells"];

export const resourceLabels: Record<ResourceKey, string> = {
  metalScrap: "Metal Scrap",
  wood: "Wood",
  chaosShards: "Chaos Shards",
  steamComponents: "Steam Components",
  alloy: "Alloy",
  drawcord: "Drawcord",
  fittings: "Fittings",
  resin: "Resin",
  chargeCells: "Charge Cells"
};

export function createResourceWalletDocument(
  partial?: Partial<ResourceWalletDocument> | null,
): ResourceWalletDocument {
  return resourceKeys.reduce<ResourceWalletDocument>((wallet, key) => {
    wallet[key] = Number(partial?.[key] ?? 0);
    return wallet;
  }, {} as ResourceWalletDocument);
}

export function toPartialResourceWalletDocument(
  wallet: Partial<ResourceWalletDocument> | null | undefined,
): Partial<ResourceWalletDocument> {
  return Object.fromEntries(
    resourceKeys
      .map((key) => [key, Number(wallet?.[key] ?? 0)] as const)
      .filter(([, amount]) => Number.isFinite(amount) && amount > 0),
  ) as Partial<ResourceWalletDocument>;
}
