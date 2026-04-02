import type { ExportBundleFile, ImageAsset } from "../types/common";

const IMAGE_EXTENSION_BY_MIME: Record<string, string> = {
  "image/apng": "apng",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp"
};

export async function readImageAsset(file: File): Promise<ImageAsset> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });

  return {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    dataUrl
  };
}

export function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getImageAssetExtension(asset: ImageAsset): string {
  const normalizedName = asset.fileName.trim().toLowerCase();
  const extensionFromName = normalizedName.includes(".") ? normalizedName.split(".").pop() : "";

  if (extensionFromName && /^[a-z0-9]+$/.test(extensionFromName)) {
    return extensionFromName;
  }

  return IMAGE_EXTENSION_BY_MIME[asset.mimeType] ?? "png";
}

function getBase64Payload(dataUrl: string): string {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) {
    throw new Error("Attached image data is invalid.");
  }

  return match[1];
}

export function createImageAssetExport(
  contentId: string,
  role: "icon" | "art" | "portrait" | "sprite",
  asset: ImageAsset
): { runtimePath: string; file: ExportBundleFile } {
  const extension = getImageAssetExtension(asset);
  const runtimePath = `assets/${contentId}.${role}.${extension}`;

  return {
    runtimePath,
    file: {
      name: runtimePath,
      content: getBase64Payload(asset.dataUrl),
      encoding: "base64"
    }
  };
}
