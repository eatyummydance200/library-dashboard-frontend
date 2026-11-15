// 전역 CSS를 먼저 불러온다. 화면별 CSS(컴포넌트에서 import)가 그 뒤에 와서 같은 우선순위면 이긴다.
import "./style.css";
import "./shell.css";
import "./tds.css";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(<App />);
