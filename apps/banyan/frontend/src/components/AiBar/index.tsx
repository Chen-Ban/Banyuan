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
 */

import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { Image, Select, Tooltip } from "antd";
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
import type { DisambiguationOptions, ProviderInfo, ImageItem } from "@/api";
import ConversationPanel from "./ConversationPanel";
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
   * 发送前保存当前应用状态的回调（可选）。
   * AiBar 在发送请求前先 await 此函数，确保 DB 是最新快照，
   * 后端 XiangDi 通过内部 API 按需拉取，无需随请求体传入。
   */
  onBeforeSend?: () => Promise<void>;
  /** 写操作工具执行完毕后实时推送当前 pages，用于画布实时更新 */
  onPagesSnapshot?: (pages: string[]) => void;
  /** AI 完成后回调，携带最终 pages JSON */
  onDone?: (pages: string[]) => void;
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
  onBeforeSend,
  onPagesSnapshot,
  onDone,
}, ref) {
  const [inputValue, setInputValue] = useState("");
  const [pastedImages, setPastedImages] = useState<PastedImage[]>([]);
  const [disambiguationState, setDisambiguationState] =
    useState<DisambiguationOptions | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const {
    loading,
    historyLoading,
    history,
    messages,
    currentText,
    sendPrompt,
    abort,
    respondToDisambiguation,
  } = useXiangDi({
    appId,
    onBeforeSend,
    onDone,
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
      } catch {
        // 上传失败时仍然发送文本（图片丢弃）
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
        disambiguationState={disambiguationState}
        onDisambiguationSelect={handleDisambiguationSelect}
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
});

export default AiBar;
