import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface QrCodePanelProps {
  value: string;
  label: string;
  hint?: string;
}

export function QrCodePanel({ value, label, hint }: QrCodePanelProps) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    let isCancelled = false;

    async function buildCode() {
      try {
        const nextDataUrl = await QRCode.toDataURL(value, {
          margin: 1,
          width: 220,
          color: {
            dark: "#04110f",
            light: "#f3fbf8"
          }
        });

        if (!isCancelled) {
          setDataUrl(nextDataUrl);
        }
      } catch {
        if (!isCancelled) {
          setDataUrl("");
        }
      }
    }

    void buildCode();

    return () => {
      isCancelled = true;
    };
  }, [value]);

  return (
    <div className="qr-panel">
      <div className="qr-frame">
        {dataUrl ? <img src={dataUrl} alt={label} className="qr-image" /> : <div className="empty-state compact">QR unavailable</div>}
      </div>
      <div className="qr-copy">
        <strong>{label}</strong>
        {hint ? <span>{hint}</span> : null}
      </div>
    </div>
  );
}
