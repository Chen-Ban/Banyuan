/**
 * AiBar 组件
 *
 * 应用级 AI 对话栏，撑满 Sidebar appContent 区域（flex: 1）。
 *
 * 布局：
 *   ┌─────────────────────────────────────────────┐
 *   │  ConversationPanel（flex: 1，可滚动）          │
 *   ├─────────────────────────────────────────────┤
 *   │  ┌───────────────────────────────────────┐  │
 *   │  │  图片预览区（有图片时显示）              │  │
 *   │  │  文本域（多行，自动增高）                │  │
 *   │  ├───────────────────────────────────────┤  │
 *   │  │  模型选择           [发送 / 停止 按钮]  │  │
 *   │  └───────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────┘
 *
 * 数据流：
 *   - 发送前：requestFlush() + save() 刷回 store 并持久化
 *   - initialPrompt 由 store 消费
 *   - onDone 回调调用 refreshFromBackend() 从后端拉取最新数据
 */

import { useRef, useEffect, useState, useCallback } from "react";
import { Image, Select, Tooltip, message as antdMessage } from "antd";
import {
  CloseOutlined,
  CommentOutlined,
  EditOutlined,
  PlusOutlined,
  SendOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { useXiangDi } from "@/hooks/useXiangDi";
import { aiApi } from "@/api";
import type { ProviderInfo, ImageItem } from "@/api";
import { useApplicationStore } from "@/stores/applicationStore";
import ConversationPanel from "./ConversationPanel";
import styles from "./index.module.scss";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AiBarProps {
  appId: string;
}

// ─── 粘贴图片类型 ─────────────────────────────────────────────────────────────

interface PastedImage {
  id: string;
  dataUrl: string;
  name: string;
}

// ─── AiBar ────────────────────────────────────────────────────────────────────

const AiBar: React.FC<AiBarProps> = ({ appId }) => {
  const [inputValue, setInputValue] = useState("");
  const [pastedImages, setPastedImages] = useState<PastedImage[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── ApplicationStore ────────────────────────────────────────────────────────
  const { requestFlush, consumeInitialPrompt, refreshFromBackend } = useApplicationStore()

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
      .catch(() => { /* 静默失败 */ });
  }, []);

  const handleModelChange = useCallback((provider: string) => {
    setActiveProvider(provider);
    aiApi.switchModel(provider).catch(() => { /* 静默失败 */ });
  }, []);

  // ─── 对话模式切换（编辑 = task / 对话 = chat） ────────────────────────────
  const [dialogueMode, setDialogueMode] = useState<'task' | 'chat'>('task');

  // onDone 回调：banyan 后端已在 done 事件后写库（M1 不变），前端拉取最新数据
  // （done 事件的 summary 此处用不到，省略参数）
  const handleDone = useCallback(async () => {
    await refreshFromBackend()
  }, [refreshFromBackend])

  // onBeforeSend：先 flush ref → store，再 save 到后端，保证 AI 看到最新数据
  const handleBeforeSend = useCallback(async () => {
    await requestFlush()
    await useApplicationStore.getState().save()
  }, [requestFlush])

  const {
    loading,
    historyLoading,
    history,
    messages,
    currentText,
    agentSteps,
    hasPendingTask,
    sendPrompt,
    abort,
    confirmTask,
    discardTask,
    retryError,
  } = useXiangDi({
    appId,
    onBeforeSend: handleBeforeSend,
    onDone: handleDone,
  });

  // ── 消费 initialPrompt（首页跳转后自动发送） ────────────────────────────────
  const initialPromptConsumed = useRef(false)
  useEffect(() => {
    if (initialPromptConsumed.current) return
    const prompt = consumeInitialPrompt(appId)
    if (prompt) {
      initialPromptConsumed.current = true
      sendPrompt(prompt)
    }
  }, [appId, consumeInitialPrompt, sendPrompt])

  // 监听 store.initialPrompt 变化（处理 UIPage mount 后再写入的情况）
  useEffect(() => {
    const unsub = useApplicationStore.subscribe((state) => {
      if (initialPromptConsumed.current) return
      const prompt = state.initialPrompt.get(appId)
      if (prompt) {
        initialPromptConsumed.current = true
        state.consumeInitialPrompt(appId)
        sendPrompt(prompt)
      }
    })
    return unsub
  }, [appId, sendPrompt])

  // ─── 输入框逻辑 ────────────────────────────────────────────────────────────

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

  const [uploading, setUploading] = useState(false);

  const handleSend = useCallback(async () => {
    const prompt = inputValue.trim();
    if ((!prompt && pastedImages.length === 0) || loading || uploading) return;

    // 先捕获当前图片并清空 UI
    const imagesToUpload = [...pastedImages];
    setInputValue("");
    setPastedImages([]);

    // 上传图片到 OSS
    let imageUrls: ImageItem[] = [];
    if (imagesToUpload.length > 0) {
      setUploading(true);
      try {
        const urls = await Promise.all(
          imagesToUpload.map(async (img) => {
            // dataUrl 转 Blob
            const res = await fetch(img.dataUrl);
            const blob = await res.blob();
            const file = new File([blob], img.name || `paste_${Date.now()}.png`, {
              type: blob.type || "image/png",
            });
            const publicUrl = await aiApi.uploadImage(appId, file);
            return { url: publicUrl, alt: img.name };
          }),
        );
        imageUrls = urls;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : '未知错误'
        console.warn('[AiBar] 图片上传失败:', errMsg)
        antdMessage.warning('图片上传失败，将仅发送文字内容')
        // 如果 prompt 也为空，放弃本次发送
        if (!prompt) {
          setUploading(false)
          return
        }
      } finally {
        setUploading(false);
      }
    }

    sendPrompt(prompt, dialogueMode, imageUrls);
  }, [inputValue, pastedImages, loading, uploading, sendPrompt, appId, dialogueMode]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const canSend =
    (inputValue.trim().length > 0 || pastedImages.length > 0) && !loading && !uploading;

  return (
    <div className={styles.aiBar}>
      {/* 对话面板（撑满剩余空间，可滚动） */}
      <ConversationPanel
        historyLoading={historyLoading}
        history={history}
        messages={messages}
        currentText={currentText}
        loading={loading}
        agentSteps={agentSteps}
        hasPendingTask={hasPendingTask}
        onConfirmTask={confirmTask}
        onDiscardTask={discardTask}
        onRetry={retryError}
      />

      {/* 输入框容器（底部固定高度） */}
      <div className={`${styles.inputWrapper} ${loading ? styles.inputWrapperBreathing : ''}`}>
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
            {/* + 按钮（占位，后续可扩展附件上传） */}
            <button
              className={styles.addBtn}
              aria-label="添加附件"
              disabled={loading}
              onClick={() => { /* TODO: 附件上传 */ }}
            >
              <PlusOutlined />
            </button>

            {/* 模式切换胶囊：编辑 / 对话 */}
            <div className={styles.modeCapsule}>
              <Tooltip title="编辑项目">
                <button
                  className={`${styles.modeBtn} ${dialogueMode === 'task' ? styles.modeBtnActive : ''}`}
                  onClick={() => setDialogueMode('task')}
                >
                  <EditOutlined />
                  <span>编辑</span>
                </button>
              </Tooltip>
              <Tooltip title="仅对话，不对项目做修改">
                <button
                  className={`${styles.modeBtn} ${dialogueMode === 'chat' ? styles.modeBtnActive : ''}`}
                  onClick={() => setDialogueMode('chat')}
                >
                  <CommentOutlined />
                  <span>对话</span>
                </button>
              </Tooltip>
            </div>

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
};

export default AiBar;
