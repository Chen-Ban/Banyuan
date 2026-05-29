/**
 * ConversationPanel — AI 对话面板（微信聊天框风格）
 *
 * 撑满 AiBar 的剩余空间（flex: 1），内部可滚动。
 * 不再使用绝对定位浮层，不再有拖拽手柄，不再有折叠/展开状态机。
 *
 * 消息渲染规则：
 *   - history user      → 靠右蓝色气泡
 *   - history assistant → 靠左灰色气泡
 *   - messages（按时间顺序混排）：
 *     - type='text'       → 靠左灰色气泡（已冻结的文字段落）
 *     - type='tool_call'  → 靠左无气泡进度行
 *     - type='tool_result'(error) → 靠左错误行
 *     - type='done'       → 靠左完成提示行
 *     - type='error'      → 靠左错误行
 *   - currentText       → 靠左灰色气泡（正在流入的文字，末尾光标）
 *   - disambiguation    → 靠左无气泡卡片
 */

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { Spin } from "antd";
import {
  CheckCircleOutlined,
  LoadingOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import Markdown from "react-markdown";
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
  const panelRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // ─── 智能滚动：仅在用户已在底部时自动滚动到最新内容 ──────────────────────────
  // 阈值：距离底部 60px 以内视为"在底部"
  const SCROLL_THRESHOLD = 60;
  const isAtBottomRef = useRef(true);

  // 监听滚动事件，记录用户是否在底部
  const handleScroll = useCallback(() => {
    const el = panelRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distanceToBottom <= SCROLL_THRESHOLD;
  }, []);

  // 注册滚动监听
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // 当内容更新时，仅在用户已在底部时才滚动
  useLayoutEffect(() => {
    if (isAtBottomRef.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [history, messages, currentText]);

  const isEmpty =
    !historyLoading &&
    history.length === 0 &&
    messages.length === 0 &&
    !currentText &&
    !loading;

  return (
    <div ref={panelRef} className={styles.panel}>
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

      {/* ── 当前轮次：按时间顺序混排渲染 messages ── */}
      {messages.map((msg) => {
        switch (msg.type) {
          case 'text':
            return <TextBubble key={msg.id} content={msg.content} />;
          case 'tool_call':
            return <ToolRow key={msg.id} message={msg} />;
          case 'tool_result':
            // 只有错误的 tool_result 才会被加入 messages
            return (
              <div key={msg.id} className={`${styles.statusRow} ${styles.statusRowError}`}>
                <WarningOutlined />
                <span>{msg.content}</span>
              </div>
            );
          case 'done':
            return (
              <div key={msg.id} className={styles.statusRow}>
                <CheckCircleOutlined className={styles.doneIcon} />
                <span className={styles.doneText}>完成</span>
              </div>
            );
          case 'error':
            return (
              <div key={msg.id} className={`${styles.statusRow} ${styles.statusRowError}`}>
                <WarningOutlined />
                <span>{msg.content}</span>
              </div>
            );
          default:
            return null;
        }
      })}

      {/* ── 当前轮次：正在流入的文字（尚未冻结，末尾光标） ── */}
      {loading && currentText && (
        <div className={styles.bubbleRow}>
          <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>
            <span className={styles.bubbleText}>
              <Markdown>{currentText}</Markdown>
              <span className={styles.cursor}>▋</span>
            </span>
          </div>
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

// ─── TextBubble（已冻结的文字段落，assistant 靠左气泡） ───────────────────────

const TextBubble: React.FC<{ content: string }> = ({ content }) => {
  return (
    <div className={styles.bubbleRow}>
      <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>
        <span className={styles.bubbleText}>
          <Markdown>{content}</Markdown>
        </span>
      </div>
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
          {isUser ? text : <Markdown>{text}</Markdown>}
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
