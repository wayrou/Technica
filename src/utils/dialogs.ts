function isDesktopRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let toastRoot: HTMLDivElement | null = null;

function getToastRoot() {
  if (typeof document === "undefined") {
    return null;
  }

  if (toastRoot && document.body.contains(toastRoot)) {
    return toastRoot;
  }

  toastRoot = document.createElement("div");
  toastRoot.className = "technica-toast-root";
  document.body.appendChild(toastRoot);
  return toastRoot;
}

function showToast(message: string) {
  const root = getToastRoot();
  if (!root) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = "technica-toast";
  toast.textContent = message;
  root.appendChild(toast);

  window.requestAnimationFrame(() => {
    toast.classList.add("visible");
  });

  const dismiss = () => {
    toast.classList.remove("visible");
    window.setTimeout(() => {
      toast.remove();
      if (root.childElementCount === 0) {
        root.remove();
        if (toastRoot === root) {
          toastRoot = null;
        }
      }
    }, 180);
  };

  window.setTimeout(dismiss, 2800);
}

export function confirmAction(message: string) {
  if (isDesktopRuntime()) {
    return true;
  }

  try {
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      return window.confirm(message);
    }
  } catch {
    return true;
  }

  return true;
}

export function notify(message: string) {
  if (typeof window === "undefined") {
    return;
  }

  showToast(message);
}
