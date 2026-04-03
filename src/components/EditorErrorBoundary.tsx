import { Component, type ErrorInfo, type ReactNode } from "react";

interface EditorErrorBoundaryProps {
  children: ReactNode;
}

interface EditorErrorBoundaryState {
  errorMessage: string | null;
}

export class EditorErrorBoundary extends Component<EditorErrorBoundaryProps, EditorErrorBoundaryState> {
  state: EditorErrorBoundaryState = {
    errorMessage: null
  };

  static getDerivedStateFromError(error: unknown): EditorErrorBoundaryState {
    return {
      errorMessage: error instanceof Error ? error.message : "Unknown editor error"
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const message = error instanceof Error ? error.message : "Unknown editor error";

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "technica.lastEditorError",
        JSON.stringify({
          message,
          stack: error instanceof Error ? error.stack ?? "" : "",
          componentStack: info.componentStack
        })
      );
    }
  }

  componentDidUpdate(previousProps: EditorErrorBoundaryProps) {
    if (this.state.errorMessage && previousProps.children !== this.props.children) {
      this.setState({ errorMessage: null });
    }
  }

  render() {
    if (this.state.errorMessage) {
      return (
        <div className="empty-state">
          <strong>That editor hit an error.</strong>
          <p>{this.state.errorMessage}</p>
          <p>Technica saved the details under `technica.lastEditorError` for debugging.</p>
        </div>
      );
    }

    return this.props.children;
  }
}
