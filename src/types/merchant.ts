export interface MerchantListingDocument {
  soldAtMerchant: boolean;
  merchantFloor: number;
}

export function createMerchantListingDocument(
  partial: Partial<MerchantListingDocument> | null | undefined = {},
): MerchantListingDocument {
  return {
    soldAtMerchant: partial?.soldAtMerchant === true,
    merchantFloor: Number.isFinite(partial?.merchantFloor) ? Number(partial?.merchantFloor) : 1,
  };
}

export function normalizeMerchantListingDocument(
  value: unknown,
  fallback: MerchantListingDocument = createMerchantListingDocument(),
): MerchantListingDocument {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<MerchantListingDocument>
    : {};

  return {
    soldAtMerchant: typeof record.soldAtMerchant === "boolean" ? record.soldAtMerchant : fallback.soldAtMerchant,
    merchantFloor: Number.isFinite(record.merchantFloor) ? Number(record.merchantFloor) : fallback.merchantFloor,
  };
}
