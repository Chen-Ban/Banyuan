/**
 * ConversationPanel — AI 对话面板（微信聊天框风格）
 *
 * 撑满 AiBar 的剩余空间（flex: 1），内部可滚动。
 * 不再使用绝对定位浮层，不再有拖拽手柄，不再有折叠/展开状态机。
 *
 * 消息渲染规则：
 *   - history user      → 靠右蓝色气泡
 *   - history assistant → 靠左灰色气泡
 *   - currentText       → 靠左灰色气泡（流式，末尾光标）
 *   - tool_call         → 靠左无气泡进度行（蓝色小字）
 *   - done              → 靠左无气泡完成提示行
 *   - error             → 靠左无气泡错误行
 *   - disambiguation    → 靠左无气泡卡片
 */

import { useEffect, useRef, useState } from "react";
import { Spin } from "antd";
import {
  CheckCircleOutlined,
  LoadingOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import type { ProgressMessage } from "@/hooks/useXiangDi";
import type { ConversationMessage, DisambiguationOptions } from "@/api";
import DisambiguationPanel from "../DisambiguationPanel";
import styles from "./index.module.scss";

// assistant 气泡折叠时最多显示的行数
const BUBBLE_COLLAPSE_LINES = 4;
// 每行大约 13px * 1.6 行高 ≈ 21px，4 行约 84px
const BUBBLE_COLLAPSE_MAX_HEIGHT = BUBBLE_COLLAPSE_LINES * 21;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ConversationPanelProps {
  historyLoading: boolean;
  history: ConversationMessage[];
  messages: ProgressMessage[];
  currentText: string;
  loading: boolean;
  disambiguationState: DisambiguationOptions | null;
  onDisambiguationSelect: (choiceId: string) => void;
}

// ─── ConversationPanel ────────────────────────────────────────────────────────

const ConversationPanel: React.FC<ConversationPanelProps> = ({
  historyLoading,
  history,
  messages,
  currentText,
  loading,
  disambiguationState,
  onDisambiguationSelect,
}) => {
  const endRef = useRef<HTMLDivElement>(null);

  // 滚动到底部
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, messages, currentText]);

  // 当前轮次是否有工具调用进度（非 done/error）
  const toolMessages = messages.filter(
    (m) => m.type === "tool_call" || m.type === "tool_result",
  );
  const doneMessage = messages.find((m) => m.type === "done");
  const errorMessage = messages.find((m) => m.type === "error" || m.isError);

  const isEmpty =
    !historyLoading &&
    history.length === 0 &&
    messages.length === 0 &&
    !currentText &&
    !loading;

  return (
    <div className={styles.panel}>
      {/* 历史加载中 */}
      {historyLoading && (
        <div className={styles.statusRow}>
          <Spin size="small" />
          <span>加载对话历史...</span>
        </div>
      )}

      {/* 空状态：assistant 欢迎消息 */}
      {isEmpty && (
        <div className={styles.welcomeWrap}>
          <div className={`${styles.bubble} ${styles.bubbleAssistant} ${styles.welcomeBubble}`}>
            <span className={styles.bubbleText}>
              👋 你好！我是你的 AI 设计助手。
            </span>
            <span className={styles.bubbleText}>
              告诉我你想要什么样的页面或效果，我来帮你实现。
            </span>
          </div>
        </div>
      )}

      {/* ── 历史消息气泡 ── */}
      {history.map((msg, idx) => (
        <HistoryBubble key={`h_${idx}`} message={msg} />
      ))}

      {/* ── 当前轮次：工具调用进度行（在流式气泡之前） ── */}
      {toolMessages.map((msg) => (
        <ToolRow key={msg.id} message={msg} />
      ))}

      {/* ── 当前轮次：流式输出气泡（assistant 靠左） ── */}
      {loading && currentText && (
        <div className={styles.bubbleRow}>
          <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>
            <span className={styles.bubbleText}>
              {currentText}
              <span className={styles.cursor}>▋</span>
            </span>
          </div>
        </div>
      )}

      {/* ── 当前轮次：完成提示行 ── */}
      {doneMessage && !loading && (
        <div className={styles.statusRow}>
          <CheckCircleOutlined className={styles.doneIcon} />
          <span className={styles.doneText}>完成</span>
        </div>
      )}

      {/* ── 当前轮次：错误行 ── */}
      {errorMessage && (
        <div className={`${styles.statusRow} ${styles.statusRowError}`}>
          <WarningOutlined />
          <span>{errorMessage.content}</span>
        </div>
      )}

      {/* ── 消歧面板（靠左，无气泡） ── */}
      {disambiguationState && (
        <DisambiguationPanel
          options={disambiguationState}
          onSelect={onDisambiguationSelect}
        />
      )}

      {/* ── 初始思考中（无任何内容时） ── */}
      {loading &&
        messages.length === 0 &&
        !currentText &&
        !disambiguationState && (
          <div className={styles.statusRow}>
            <LoadingOutlined className={styles.thinkingIcon} />
            <span>banyan 正在思考...</span>
          </div>
        )}

      <div ref={endRef} />
    </div>
  );
};

// ─── HistoryBubble ────────────────────────────────────────────────────────────

const HistoryBubble: React.FC<{ message: ConversationMessage }> = ({
  message,
}) => {
  const isUser = message.role === "user";
  const text =
    typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content);

  // assistant 气泡：默认折叠，超过阈值时显示展开按钮
  const [expanded, setExpanded] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = textRef.current;
    if (!el || isUser) return;
    setOverflows(el.scrollHeight > BUBBLE_COLLAPSE_MAX_HEIGHT + 4);
  }, [text, isUser]);

  return (
    <div
      className={`${styles.bubbleRow} ${isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant}`}
    >
      <div
        className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAssistant}`}
      >
        <span
          ref={textRef}
          className={styles.bubbleText}
          style={
            !isUser && !expanded && overflows
              ? {
                  maxHeight: BUBBLE_COLLAPSE_MAX_HEIGHT,
                  overflow: "hidden",
                  display: "block",
                }
              : undefined
          }
        >
          {text}
        </span>
        {!isUser && overflows && (
          <button
            className={styles.bubbleToggleBtn}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "收起 ▲" : "展开 ▼"}
          </button>
        )}
      </div>
    </div>
  );
};

// ─── ToolRow ──────────────────────────────────────────────────────────────────

const ToolRow: React.FC<{ message: ProgressMessage }> = ({ message }) => {
  const isRunning = message.type === "tool_call" && !message.completed;

  return (
    <div className={styles.toolRow}>
      {isRunning ? (
        <LoadingOutlined className={styles.toolIcon} />
      ) : (
        <CheckCircleOutlined className={styles.toolIconDone} />
      )}
      <span className={styles.toolText}>{message.content}</span>
    </div>
  );
};

export default ConversationPanel;
