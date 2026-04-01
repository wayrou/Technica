export function confirmAction(message: string) {
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
  try {
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(message);
      return;
    }
  } catch {
    return;
  }
}
