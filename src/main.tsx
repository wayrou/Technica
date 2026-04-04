import ReactDOM from "react-dom/client";
import App from "./App";
import { TechnicaRuntimeProvider } from "./hooks/useTechnicaRuntime";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <TechnicaRuntimeProvider>
    <App />
  </TechnicaRuntimeProvider>
);
