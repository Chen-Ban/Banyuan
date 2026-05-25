/**
 * AiBar 组件
 *
 * 应用级 AI 对话栏，每个子页面（画布 / 数据库 / 云函数）各自渲染实例，
 * 通过 appId 共享会话。普通流式布局，放在页面内容区底部。
 *
 * 布局：
 *   ┌─────────────────────────────────────────────┐
 *   │  对话区（历史消息 + 进度消息 + 流式文字）       │
 *   ├─────────────────────────────────────────────┤
 *   │  ┌───────────────────────────────────────┐  │
 *   │  │  图片预览区（有图片时显示）              │  │
 *   │  │  文本域（多行，自动增高）                │  │
 *   │  ├───────────────────────────────────────┤  │
 *   │  │  模型选择           [发送 / 停止 按钮]  │  │
 *   │  └───────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────┘
 */

import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { Spin, Image, Select } from "antd";
import {
  RobotOutlined,
  CloseOutlined,
  SendOutlined,
  StopOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useXiangDi } from "@/hooks/useXiangDi";
import type { ProgressMessage } from "@/hooks/useXiangDi";
import { aiApi } from "@/api";
import type { ConversationMessage, DisambiguationOptions, ProviderInfo, SchemaCollectionDef } from "@/api";
import DisambiguationPanel from "./DisambiguationPanel";
import styles from "./index.module.scss";

// ─── Imperative handle ────────────────────────────────────────────────────────

export interface AiBarHandle {
  /** 外部触发发送，供首页跳转后自动起始对话使用 */
  sendPrompt: (prompt: string) => void;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AiBarProps {
  appId: string;
  /**
   * 获取当前最新 pages 的回调。
   * AiBar 在发送请求时调用，将当前内存状态随流一并发送给 AI。
   */
  getPages: () => string[];
  /** 获取当前 Schema（可选，由 DatabasePage 提供） */
  getSchema?: () => SchemaCollectionDef[];
  /** 获取当前云函数列表（可选，由 FunctionsPage 提供） */
  getCloudFunctions?: () => Array<{
    functionId: string;
    name: string;
    displayName?: string;
    description?: string;
    flowSchema?: Record<string, unknown>;
  }>;
  onPagesUpdate: (pages: string[]) => void;
  /** 写操作工具执行完毕后实时推送当前 pages，用于画布实时更新 */
  onPagesSnapshot?: (pages: string[]) => void;
}

// ─── 粘贴图片类型 ─────────────────────────────────────────────────────────────

interface PastedImage {
  id: string;
  dataUrl: string;
  name: string;
}

// ─── AiBar ────────────────────────────────────────────────────────────────────

const AiBar = forwardRef<AiBarHandle, AiBarProps>(function AiBar({
  appId,
  getPages,
  getSchema,
  getCloudFunctions,
  onPagesUpdate,
  onPagesSnapshot,
}, ref) {
  const [inputValue, setInputValue] = useState("");
  const [pastedImages, setPastedImages] = useState<PastedImage[]>([]);
  const [progressVisible, setProgressVisible] = useState(false);
  const [disambiguationState, setDisambiguationState] =
    useState<DisambiguationOptions | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const progressEndRef = useRef<HTMLDivElement>(null);

  // ─── 模型选择 ──────────────────────────────────────────────────────────────
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [activeProvider, setActiveProvider] = useState<string>("");

  useEffect(() => {
    aiApi
      .getModels()
      .then((data) => {
        setProviders(data?.providers ?? []);
        setActiveProvider(data?.activeProvider ?? "");
      })
      .catch(() => {
        /* 静默失败，不影响主流程 */
      });
  }, []);

  const handleModelChange = useCallback((provider: string) => {
    setActiveProvider(provider);
    aiApi.switchModel(provider).catch(() => {
      /* 静默失败 */
    });
  }, []);

  const {
    loading,
    historyLoading,
    history,
    messages,
    currentText,
    sendPrompt,
    abort,
    clearMessages,
    respondToDisambiguation,
  } = useXiangDi({
    appId,
    getPages,
    getSchema,
    getCloudFunctions,
    onDone: (pages) => onPagesUpdate(pages),
    onPagesSnapshot,
    onDisambiguation: (options) => setDisambiguationState(options),
  });

  // 暴露 sendPrompt 给父组件（首页跳转后自动触发）
  useImperativeHandle(ref, () => ({ sendPrompt }), [sendPrompt]);

  const handleDisambiguationSelect = useCallback(
    async (choiceId: string) => {
      await respondToDisambiguation(choiceId);
      setDisambiguationState(null);
    },
    [respondToDisambiguation],
  );

  // 有历史消息或正在对话时自动展开面板
  useEffect(() => {
    if (history.length > 0 || messages.length > 0 || loading) {
      setProgressVisible(true);
    }
  }, [history.length, messages.length, loading]);

  useEffect(() => {
    progressEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, messages, currentText]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [inputValue, autoResize]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(e.clipboardData.items);
      const imageItems = items.filter((item) => item.type.startsWith("image/"));
      if (imageItems.length === 0) return;

      e.preventDefault();
      imageItems.forEach((item) => {
        const file = item.getAsFile();
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          setPastedImages((prev) => [
            ...prev,
            {
              id: `img_${Date.now()}_${Math.random()}`,
              dataUrl,
              name: file.name || "image",
            },
          ]);
        };
        reader.readAsDataURL(file);
      });
    },
    [],
  );

  const removeImage = useCallback((id: string) => {
    setPastedImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const handleSend = useCallback(() => {
    const prompt = inputValue.trim();
    if ((!prompt && pastedImages.length === 0) || loading) return;
    setInputValue("");
    setPastedImages([]);
    sendPrompt(prompt);
  }, [inputValue, pastedImages, loading, sendPrompt]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleClose = useCallback(() => {
    setProgressVisible(false);
    clearMessages();
  }, [clearMessages]);

  const canSend =
    (inputValue.trim().length > 0 || pastedImages.length > 0) && !loading;

  return (
    <div className={styles.aiBar}>
      {/* 对话区 */}
      {progressVisible && (
        <div className={styles.progressPanel}>
          <div className={styles.progressHeader}>
            <span className={styles.progressTitle}>
              <RobotOutlined /> AI 助手
            </span>
            <button
              className={styles.closeBtn}
              onClick={handleClose}
              aria-label="关闭"
            >
              <CloseOutlined />
            </button>
          </div>
          <div className={styles.progressBody}>
            {/* 加载历史中 */}
            {historyLoading && (
              <div className={styles.loadingPlaceholder}>
                <Spin size="small" />
                <span>加载对话历史...</span>
              </div>
            )}

            {/* 历史消息 */}
            {history.map((msg, idx) => (
              <HistoryItem key={`history_${idx}`} message={msg} />
            ))}

            {/* 当前轮次：流式文字 */}
            {loading && currentText && (
              <div className={styles.streamingText}>{currentText}</div>
            )}

            {/* 当前轮次：进度消息 */}
            {messages.map((msg) => (
              <ProgressItem key={msg.id} message={msg} />
            ))}

            {/* 消歧面板 */}
            {disambiguationState && (
              <DisambiguationPanel
                options={disambiguationState}
                onSelect={handleDisambiguationSelect}
              />
            )}

            {/* 等待 AI 响应 */}
            {loading &&
              messages.length === 0 &&
              !currentText &&
              !disambiguationState && (
                <div className={styles.loadingPlaceholder}>
                  <Spin size="small" />
                  <span>AI 正在思考...</span>
                </div>
              )}
            <div ref={progressEndRef} />
          </div>
        </div>
      )}

      {/* 输入框容器 */}
      <div className={styles.inputWrapper}>
        {pastedImages.length > 0 && (
          <div className={styles.imagePreviewRow}>
            <Image.PreviewGroup>
              {pastedImages.map((img) => (
                <div key={img.id} className={styles.imageThumb}>
                  <Image
                    src={img.dataUrl}
                    alt={img.name}
                    width={60}
                    height={60}
                    style={{
                      objectFit: "cover",
                      borderRadius: 7,
                      display: "block",
                    }}
                    preview={{ mask: false }}
                  />
                  <button
                    className={styles.imageRemoveBtn}
                    onClick={() => removeImage(img.id)}
                    aria-label="移除图片"
                  >
                    <CloseOutlined />
                  </button>
                </div>
              ))}
            </Image.PreviewGroup>
          </div>
        )}

        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="描述你想要的效果，AI 将自动理解意图..."
          disabled={loading}
        />

        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            {providers.length > 0 && (
              <Select
                size="small"
                variant="borderless"
                value={activeProvider}
                onChange={handleModelChange}
                popupMatchSelectWidth={false}
                className={styles.modelSelect}
                options={providers.map((p) => ({
                  value: p.provider,
                  label: p.model,
                }))}
              />
            )}
          </div>
          <div className={styles.toolbarRight}>
            {loading ? (
              <button
                className={`${styles.actionBtn} ${styles.stopBtn}`}
                onClick={abort}
                aria-label="停止"
              >
                <StopOutlined />
              </button>
            ) : (
              <button
                className={`${styles.actionBtn} ${styles.sendBtn} ${canSend ? styles.sendBtnActive : ""}`}
                onClick={handleSend}
                disabled={!canSend}
                aria-label="发送"
              >
                <SendOutlined />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

// ─── HistoryItem（历史消息展示）──────────────────────────────────────────────

const HistoryItem: React.FC<{ message: ConversationMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  const text = typeof message.content === 'string'
    ? message.content
    : JSON.stringify(message.content);

  return (
    <div className={`${styles.historyItem} ${isUser ? styles.historyItemUser : styles.historyItemAssistant}`}>
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

export default AiBar;
