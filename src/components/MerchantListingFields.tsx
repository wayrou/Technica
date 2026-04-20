import type { MerchantListingDocument } from "../types/merchant";

interface MerchantListingFieldsProps {
  value: MerchantListingDocument;
  onChange: (next: MerchantListingDocument) => void;
  disabled?: boolean;
}

export function MerchantListingFields({
  value,
  onChange,
  disabled = false,
}: MerchantListingFieldsProps) {
  return (
    <div className="subsection">
      <h4>Traveling Merchant</h4>
      <div className="form-grid">
        <label className="field checkbox-field full">
          <input
            type="checkbox"
            checked={value.soldAtMerchant}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...value,
                soldAtMerchant: event.target.checked,
                merchantFloor: event.target.checked ? value.merchantFloor : 1,
              })
            }
          />
          <span>Sold by traveling merchant</span>
        </label>
        <label className="field">
          <span>Merchant floor</span>
          <input
            type="number"
            min={1}
            value={value.merchantFloor}
            disabled={disabled || !value.soldAtMerchant}
            onChange={(event) =>
              onChange({
                ...value,
                merchantFloor: Number(event.target.value || 1),
              })
            }
          />
        </label>
      </div>
    </div>
  );
}
