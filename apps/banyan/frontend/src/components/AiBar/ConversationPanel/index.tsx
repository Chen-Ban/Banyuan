/**
 * ConversationPanel — AI 对话进度面板（微信聊天框风格）
 *
 * 绝对定位浮层，bottom 锚定在 AiBar 输入框上方，不占文档流。
 * 顶部有拖拽手柄，可拖拽改变面板高度。
 *
 * 消息渲染规则：
 *   - history user      → 靠右蓝色气泡
 *   - history assistant → 靠左灰色气泡
 *   - currentText       → 靠左灰色气泡（流式，末尾光标）
 *   - tool_call         → 靠左无气泡进度行（蓝色小字）
 *   - done              → 靠左无气泡完成提示行
 *   - error             → 靠左无气泡错误行
 *   - disambiguation    → 靠左无气泡卡片
 *
 * 状态机：
 *   expanded  → 完整展开，高度自适应内容（最大 MAX_HEIGHT），可拖拽
 *   collapsed → 只显示 header 条（body 被 flex 压缩为 0）
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Spin } from "antd";
import {
  UpOutlined,
  DownOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import type { ProgressMessage } from "@/hooks/useXiangDi";
import type { ConversationMessage, DisambiguationOptions } from "@/api";
import DisambiguationPanel from "../DisambiguationPanel";
import styles from "./index.module.scss";

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const DEFAULT_HEIGHT = 320;
const MIN_HEIGHT = 80;

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
  /** 面板可拖拽的最大高度（动态计算，由 AiBar 传入） */
  maxPanelHeight: number;
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
  maxPanelHeight,
}) => {
  const [collapsed, setCollapsed] = useState(true);
  const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT);
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

  // ─── 拖拽逻辑 ──────────────────────────────────────────────────────────────
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);
  const isDragging = useRef(false);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      dragStartY.current = e.clientY;
      dragStartHeight.current = panelHeight;

      const handleMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        // 向上拖（clientY 减小）→ 面板变高
        const delta = dragStartY.current - ev.clientY;
        const next = Math.max(
          MIN_HEIGHT,
          Math.min(maxPanelHeight, dragStartHeight.current + delta),
        );
        setPanelHeight(next);
      };

      const handleUp = () => {
        isDragging.current = false;
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [panelHeight, maxPanelHeight],
  );

  // 展开时：高度取 panelHeight，但不超过动态上限
  // 折叠时显式设置 height:'auto' 覆盖 JS 残留的 height 值
  const clampedHeight = Math.min(panelHeight, maxPanelHeight);
  const panelStyle = collapsed
    ? { height: "auto" as const }
    : { height: clampedHeight };

  // 当前轮次是否有工具调用进度（非 done/error）
  const toolMessages = messages.filter(
    (m) => m.type === "tool_call" || m.type === "tool_result",
  );
  const doneMessage = messages.find((m) => m.type === "done");
  const errorMessage = messages.find((m) => m.type === "error" || m.isError);

  return (
    <div
      className={`${styles.panel} ${collapsed ? styles.panelCollapsed : ""}`}
      style={panelStyle}
    >
      {/* ── 拖拽手柄（顶部，仅展开时可用） ── */}
      {!collapsed && (
        <div
          className={styles.resizeHandle}
          onMouseDown={handleDragStart}
          aria-label="拖拽调整高度"
        />
      )}

      {/* ── Header ── */}
      <div className={styles.header}>
        <span className={styles.title}>banyan</span>
        <div className={styles.actions}>
          <button
            className={styles.iconBtn}
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "展开" : "折叠"}
          >
            {collapsed ? <UpOutlined /> : <DownOutlined />}
          </button>
        </div>
      </div>

      {/* ── Body（聊天流） ── */}
      <div className={styles.body}>
        {/* 历史加载中 */}
        {historyLoading && (
          <div className={styles.statusRow}>
            <Spin size="small" />
            <span>加载对话历史...</span>
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
    // scrollHeight > BUBBLE_COLLAPSE_MAX_HEIGHT 说明内容超出折叠高度
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
