import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from "antd";
import { installFlowViews } from '@banyuan/banyan-sdk';
import { banyanTheme } from "./theme/antdTheme";
import "antd/dist/reset.css";
import "./styles/global.scss";
import App from "./App.tsx";

// 注册流程图视图类型到 BanvasGL 核心层（NodeView / EdgeView / PortView）
installFlowViews();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfigProvider theme={banyanTheme}>
      <App />
    </ConfigProvider>
  </StrictMode>
);
