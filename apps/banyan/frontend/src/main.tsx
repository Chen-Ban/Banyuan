import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { installFlowViews } from '@banyuan/banyan-sdk';
import "antd/dist/reset.css";
import "./index.css";
import App from "./App.tsx";

// 注册流程图视图类型到 BanvasGL 核心层（NodeView / EdgeView / PortView）
installFlowViews();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
