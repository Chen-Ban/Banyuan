/**
 * ConversationPanel — AI 对话进度面板
 *
 * 可折叠/展开/关闭的浮层面板，展示历史消息、工具调用进度、流式文字。
 *
 * 状态机：
 *   hidden   → 无消息时不渲染
 *   expanded → 完整展开（默认）
 *   collapsed → 只显示 header 条，内容区高度收起
 *
 * 关闭（×）= 清空消息 + 回到 hidden
 * 折叠（^）= 收起内容区，header 保留
 * 展开（v）= 恢复内容区
 */

import { useEffect, useRef, useState } from "react";
import { Spin } from "antd";
import {
  RobotOutlined,
  CloseOutlined,
  UpOutlined,
  DownOutlined,
  UserOutlined,
} from "@ant-design/icons";
import type { ProgressMessage } from "@/hooks/useXiangDi";
import type { ConversationMessage, DisambiguationOptions } from "@/api";
import DisambiguationPanel from "../DisambiguationPanel";
import styles from "./index.module.scss";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ConversationPanelProps {
  visible: boolean;
  historyLoading: boolean;
  history: ConversationMessage[];
  messages: ProgressMessage[];
  currentText: string;
  loading: boolean;
  disambiguationState: DisambiguationOptions | null;
  onDisambiguationSelect: (choiceId: string) => void;
  onClose: () => void;
}

// ─── ConversationPanel ────────────────────────────────────────────────────────

const ConversationPanel: React.FC<ConversationPanelProps> = ({
  visible,
  historyLoading,
  history,
  messages,
  currentText,
  loading,
  disambiguationState,
  onDisambiguationSelect,
  onClose,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // 有新内容时自动展开
  useEffect(() => {
    if (loading || messages.length > 0) {
      setCollapsed(false);
    }
  }, [loading, messages.length]);

  // 滚动到底部
  useEffect(() => {
    if (!collapsed) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [history, messages, currentText, collapsed]);

  if (!visible) return null;

  return (
    <div className={`${styles.panel} ${collapsed ? styles.panelCollapsed : ""}`}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <span className={styles.title}>
          <RobotOutlined />
          AI 助手
        </span>
        <div className={styles.actions}>
          {/* 折叠 / 展开 */}
          <button
            className={styles.iconBtn}
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "展开" : "折叠"}
          >
            {collapsed ? <DownOutlined /> : <UpOutlined />}
          </button>
          {/* 关闭 */}
          <button
            className={styles.iconBtn}
            onClick={onClose}
            aria-label="关闭"
          >
            <CloseOutlined />
          </button>
        </div>
      </div>

      {/* ── Body（折叠时高度动画收起） ── */}
      <div className={styles.bodyWrap} ref={bodyRef}>
        <div className={styles.body}>
          {/* 加载历史 */}
          {historyLoading && (
            <div className={styles.placeholder}>
              <Spin size="small" />
              <span>加载对话历史...</span>
            </div>
          )}

          {/* 历史消息 */}
          {history.map((msg, idx) => (
            <HistoryItem key={`h_${idx}`} message={msg} />
          ))}

          {/* 流式文字 */}
          {loading && currentText && (
            <div className={styles.streamingText}>{currentText}</div>
          )}

          {/* 进度消息 */}
          {messages.map((msg) => (
            <ProgressItem key={msg.id} message={msg} />
          ))}

          {/* 消歧面板 */}
          {disambiguationState && (
            <DisambiguationPanel
              options={disambiguationState}
              onSelect={onDisambiguationSelect}
            />
          )}

          {/* 等待响应 */}
          {loading && messages.length === 0 && !currentText && !disambiguationState && (
            <div className={styles.placeholder}>
              <Spin size="small" />
              <span>AI 正在思考...</span>
            </div>
          )}

          <div ref={endRef} />
        </div>
      </div>
    </div>
  );
};

// ─── HistoryItem ──────────────────────────────────────────────────────────────

const HistoryItem: React.FC<{ message: ConversationMessage }> = ({ message }) => {
  const isUser = message.role === "user";
  const text =
    typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content);

  return (
    <div
      className={`${styles.historyItem} ${isUser ? styles.historyItemUser : styles.historyItemAssistant}`}
    >
      <span className={styles.historyRole}>
        {isUser ? <UserOutlined /> : <RobotOutlined />}
      </span>
      <span className={styles.historyContent}>{text}</span>
    </div>
  );
};

// ─── ProgressItem ─────────────────────────────────────────────────────────────

const ProgressItem: React.FC<{ message: ProgressMessage }> = ({ message }) => {
  const isToolRunning = message.type === "tool_call" && !message.completed;

  const cls = [
    styles.progressItem,
    message.type === "error" || message.isError ? styles.progressItemError : "",
    message.type === "done" ? styles.progressItemDone : "",
    message.type === "tool_call" ? styles.progressItemTool : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      {isToolRunning && <Spin size="small" className={styles.toolSpinner} />}
      <span className={styles.progressContent}>{message.content}</span>
    </div>
  );
};

export default ConversationPanel;
