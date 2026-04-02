import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { ImageAsset } from "../types/common";
import { notify } from "../utils/dialogs";
import { formatFileSize, readImageAsset } from "../utils/assets";

interface ImageAssetFieldProps {
  label: string;
  emptyLabel: string;
  hint?: string;
  asset?: ImageAsset;
  onChange: (asset?: ImageAsset) => void;
}

export function ImageAssetField({ label, emptyLabel, hint, asset, onChange }: ImageAssetFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  async function handleSelectedFile(file: File | null) {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      notify(`${label} must be an image file.`);
      return;
    }

    try {
      onChange(await readImageAsset(file));
    } catch (error) {
      notify(error instanceof Error ? error.message : `Could not read the selected ${label.toLowerCase()}.`);
    }
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    void handleSelectedFile(event.target.files?.[0] ?? null);
    event.target.value = "";
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);
    void handleSelectedFile(event.dataTransfer.files?.[0] ?? null);
  }

  return (
    <div className="asset-field">
      <div className="asset-field-header">
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </div>

      <div
        className={isDragActive ? "asset-dropzone asset-dropzone-active" : "asset-dropzone"}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {asset ? (
          <div className="asset-preview">
            <img src={asset.dataUrl} alt={asset.fileName} className="asset-preview-image" />
            <div className="asset-preview-copy">
              <strong>{asset.fileName}</strong>
              <span>{asset.mimeType}</span>
              <span>{formatFileSize(asset.sizeBytes)}</span>
            </div>
          </div>
        ) : (
          <div className="asset-empty-state">
            <strong>{emptyLabel}</strong>
            <span>Drop an image here or choose a file.</span>
          </div>
        )}

        <div className="toolbar">
          <button type="button" className="ghost-button" onClick={() => inputRef.current?.click()}>
            {asset ? "Replace file" : "Choose file"}
          </button>
          {asset ? (
            <button type="button" className="ghost-button danger" onClick={() => onChange(undefined)}>
              Remove
            </button>
          ) : null}
        </div>
      </div>

      <input
        ref={inputRef}
        hidden
        type="file"
        accept="image/*"
        onChange={handleFileInput}
      />
    </div>
  );
}
