import ReactDOM from "react-dom/client";
import App from "./App";
import { ChaosCoreDatabaseProvider } from "./hooks/useChaosCoreDatabase";
import { TechnicaRuntimeProvider } from "./hooks/useTechnicaRuntime";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <TechnicaRuntimeProvider>
    <ChaosCoreDatabaseProvider>
      <App />
    </ChaosCoreDatabaseProvider>
  </TechnicaRuntimeProvider>
);
