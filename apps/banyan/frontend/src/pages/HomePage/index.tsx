/**
 * HomePage - Landing page
 *
 * Design: Grainient animated background, TextPressure brand title,
 * DecryptedText subtitle.
 *
 * Flow: User enters prompt -> creates blank app -> navigates to UI page with initialPrompt.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { App, Spin, Select } from "antd";
import { SendOutlined } from "@ant-design/icons";
import { applicationApi, aiApi } from "@/api";
import type { ProviderInfo } from "@/api";
import { getErrorMessage } from "@/utils/error";
import { useApplicationStore } from "@/stores/applicationStore";
import Grainient from "./components/reactbits/Grainient";
import TextPressure from "./components/reactbits/TextPressure";
import DecryptedText from "./components/reactbits/DecryptedText";
import styles from "./index.module.scss";

// -- Example prompts --

const SUGGESTIONS = [
  "帮我做一个眼镜店 POS 收银系统",
  "设计一个任务管理看板，支持拖拽排序",
  "做一个餐厅点餐界面，有菜单和购物车",
  "创建一个数据大屏，展示销售趋势图表",
];

// -- Component --

const HomePage = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [focused, setFocused] = useState(false);

  // -- Model selection --
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
        /* silent */
      });
  }, []);

  const handleModelChange = useCallback((provider: string) => {
    setActiveProvider(provider);
    aiApi.switchModel(provider).catch(() => {
      /* silent */
    });
  }, []);

  // -- Auto-resize textarea --
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [prompt]);

  // -- Submit --
  const handleSubmit = useCallback(async () => {
    const text = prompt.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const res = await applicationApi.createApplication();
      const app = res.data!;
      // 通过 store 传递初始 prompt（带缓冲：UIPage 尚未 mount 时暂存，mount 后读取并清除）
      useApplicationStore.getState().setInitialPrompt(app.application_id, text);
      navigate(`/application/${app.application_id}/ui`);
    } catch (err) {
      message.error(getErrorMessage(err));
      setSubmitting(false);
    }
  }, [prompt, submitting, navigate, message]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleSuggestion = useCallback((text: string) => {
    setPrompt(text);
    textareaRef.current?.focus();
  }, []);

  const canSend = prompt.trim().length > 0 && !submitting;

  return (
    <div className={styles.page}>
      {/* -- Grainient Background -- */}
      <div className={styles.bgLayer}>
        <Grainient
          color1="#6366f1"
          color2="#8b5cf6"
          color3="#1e1b4b"
          timeSpeed={1}
          grainAmount={0.1}
          contrast={1.3}
          saturation={0.9}
          zoom={1.0}
          warpStrength={0.8}
          warpFrequency={4.0}
          warpSpeed={1.5}
        />
      </div>

      {/* -- Main Content -- */}
      <div className={styles.hero}>
        {/* TextPressure brand title - no fontUrl to avoid network blocking */}
        <div className={styles.titleWrap}>
          <TextPressure
            text="Banyan"
            fontFamily="system-ui"
            fontUrl=""
            width={false}
            weight={true}
            italic={false}
            alpha={false}
            flex={true}
            stroke={false}
            textColor="#ffffff"
            minFontSize={24}
          />
        </div>

        {/* DecryptedText subtitle */}
        <div className={styles.subtitleWrap}>
          <DecryptedText
            text="以画布为山石  以组件为草木  以数据为活水  以 AI 为匠心"
            speed={100}
            maxIterations={20}
            sequential={true}
            revealDirection="start"
            animateOn="view"
            loop={true}
            loopDelay={2000}
            className={styles.subtitleChar}
            encryptedClassName={styles.subtitleCharEncrypted}
          />
        </div>

        {/* Input card */}
        <div
          className={`${styles.inputCard} ${focused ? styles.inputCardFocused : ""}`}
        >
          <div className={styles.inputInner}>
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              placeholder="描述你想要的应用，例如：帮我做一个眼镜店 POS 收银系统..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              disabled={submitting}
              rows={1}
            />
            <div className={styles.inputFooter}>
              <div className={styles.footerLeft}>
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
              <button
                className={`${styles.sendBtn} ${canSend ? styles.sendBtnActive : ""}`}
                onClick={handleSubmit}
                disabled={!canSend}
                aria-label="发送"
              >
                {submitting ? <Spin size="small" /> : <SendOutlined />}
              </button>
            </div>
          </div>
        </div>

        {/* Suggestions */}
        <div className={styles.suggestions}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              className={styles.suggestionChip}
              onClick={() => handleSuggestion(s)}
              disabled={submitting}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HomePage;
