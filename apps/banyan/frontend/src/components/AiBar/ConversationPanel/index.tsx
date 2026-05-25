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
 *   hidden    → visible=false，不渲染
 *   expanded  → 完整展开，高度由 panelHeight 控制（默认 220px，可拖拽）
 *   collapsed → 只显示 header 条（body 被 flex 压缩为 0）
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Spin } from "antd";
import {
  RobotOutlined,
  CloseOutlined,
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
const MAX_HEIGHT = 600;

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
          Math.min(MAX_HEIGHT, dragStartHeight.current + delta)
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
    [panelHeight]
  );

  if (!visible) return null;

  const panelStyle = collapsed ? undefined : { height: panelHeight };

  // 当前轮次是否有工具调用进度（非 done/error）
  const toolMessages = messages.filter(
    (m) => m.type === "tool_call" || m.type === "tool_result"
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
        <span className={styles.title}>
          <RobotOutlined />
          AI 助手
        </span>
        <div className={styles.actions}>
          <button
            className={styles.iconBtn}
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "展开" : "折叠"}
          >
            {collapsed ? <DownOutlined /> : <UpOutlined />}
          </button>
          <button
            className={styles.iconBtn}
            onClick={onClose}
            aria-label="关闭"
          >
            <CloseOutlined />
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
              <span>AI 正在思考...</span>
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

  return (
    <div
      className={`${styles.bubbleRow} ${isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant}`}
    >
      <div
        className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAssistant}`}
      >
        <span className={styles.bubbleText}>{text}</span>
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
