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
 *     - type='text'           → 靠左灰色气泡（已冻结的文字段落）
 *     - type='tool_activity'  → 靠左无气泡进度行
 *     - type='agent_progress' → 靠左进度行
 *     - type='audit'          → 靠左审计状态行
 *     - type='phase_change'   → 靠左阶段提示行
 *     - type='done'           → 靠左完成提示行
 *     - type='error'          → 靠左错误行
 *   - currentText       → 靠左灰色气泡（正在流入的文字，末尾光标）
 */

import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import { Spin } from "antd";
import {
  CheckCircleOutlined,
  CheckOutlined,
  CloseOutlined,
  LoadingOutlined,
  StopOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import Markdown from "react-markdown";
import type { ProgressMessage, AgentStep } from "@/hooks/useXiangDi";
import type { ConversationMessage } from "@/api";
import AgentProgressCard from "../AgentProgressCard";
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
  /** SubAgent 执行进度（ADR-041 agent_progress 驱动） */
  agentSteps: AgentStep[];
  /** 是否有待确认的 task 对话（V4 事务化） */
  hasPendingTask: boolean;
  /** 确认 task 对话 */
  onConfirmTask: () => void;
  /** 撤销 task 对话 */
  onDiscardTask: () => void;
}

// ─── ConversationPanel ────────────────────────────────────────────────────────

const ConversationPanel: React.FC<ConversationPanelProps> = ({
  historyLoading,
  history,
  messages,
  currentText,
  loading,
  agentSteps,
  hasPendingTask,
  onConfirmTask,
  onDiscardTask,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // ─── 智能滚动：仅在用户已在底部时自动滚动到最新内容 ──────────────────────────
  // 阈值：距离底部 60px 以内视为"在底部"
  const SCROLL_THRESHOLD = 60;
  const isAtBottomRef = useRef(true);
  // RAF 节流：避免 text_delta 高频更新时排队大量平滑滚动动画
  const scrollRafRef = useRef<number | null>(null);

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

  // 清理 RAF（组件卸载时）
  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  // 节流版 scrollIntoView：同一帧内多次触发只执行一次
  const scheduleScrollToBottom = useCallback(() => {
    if (!isAtBottomRef.current) return;
    if (scrollRafRef.current !== null) return; // 已有待执行的 RAF，跳过
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      if (isAtBottomRef.current) {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    });
  }, []);

  // 内容维度变化时触发滚动（用 length 而非引用，避免 history/messages 数组引用每次都变）
  const scrollKey = useMemo(
    () => `${history.length}_${messages.length}_${currentText.length}`,
    [history.length, messages.length, currentText.length]
  );

  useLayoutEffect(() => {
    scheduleScrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey]);

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
          case 'tool_activity':
            return <ToolRow key={msg.id} message={msg} />;
          case 'agent_progress':
            return (
              <div key={msg.id} className={`${styles.statusRow} ${msg.isError ? styles.statusRowError : ''}`}>
                {msg.isError ? <WarningOutlined /> : <CheckCircleOutlined className={styles.doneIcon} />}
                <span>{msg.content}</span>
              </div>
            );
          case 'audit':
            return (
              <div key={msg.id} className={`${styles.statusRow} ${msg.isError ? styles.statusRowError : ''}`}>
                {msg.isError ? <WarningOutlined /> : <CheckCircleOutlined className={styles.doneIcon} />}
                <span>{msg.content}</span>
              </div>
            );
          case 'phase_change':
            return (
              <div key={msg.id} className={styles.statusRow}>
                <span className={styles.phaseText}>{msg.content}</span>
              </div>
            );
          case 'done':
            return (
              <div key={msg.id} className={styles.statusRow}>
                <CheckCircleOutlined className={styles.doneIcon} />
                <span className={styles.doneText}>完成</span>
              </div>
            );
          case 'aborted':
            return (
              <div key={msg.id} className={`${styles.statusRow} ${styles.statusRowAborted}`}>
                <StopOutlined />
                <span>{msg.content}</span>
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

      {/* ── SubAgent 进度卡片（ADR-041） ── */}
      {agentSteps.length > 0 && loading && <AgentProgressCard steps={agentSteps} />}

      {/* ── 初始思考中（无任何内容时） ── */}
      {loading &&
        messages.length === 0 &&
        !currentText &&
        agentSteps.length === 0 && (
          <div className={styles.statusRow}>
            <LoadingOutlined className={styles.thinkingIcon} />
            <span>banyan 正在思考...</span>
          </div>
        )}

      {/* ── 待确认 task 对话（确认/撤销按钮） ── */}
      {hasPendingTask && !loading && (
        <div className={styles.pendingActions}>
          <div className={styles.pendingHint}>任务已完成，请预览画布效果后确认或撤销</div>
          <div className={styles.pendingBtnGroup}>
            <button
              className={`${styles.pendingBtn} ${styles.pendingBtnConfirm}`}
              onClick={onConfirmTask}
            >
              <CheckOutlined />
              <span>确认保存</span>
            </button>
            <button
              className={`${styles.pendingBtn} ${styles.pendingBtnDiscard}`}
              onClick={onDiscardTask}
            >
              <CloseOutlined />
              <span>撤销修改</span>
            </button>
          </div>
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
  const isRunning = message.type === "tool_activity" && !message.completed;

  return (
    <div className={styles.toolRow}>
      {isRunning ? (
        <LoadingOutlined className={styles.toolIcon} />
      ) : message.isError ? (
        <WarningOutlined className={styles.toolIconError} />
      ) : (
        <CheckCircleOutlined className={styles.toolIconDone} />
      )}
      <span className={styles.toolText}>{message.content}</span>
    </div>
  );
};

export default ConversationPanel;
