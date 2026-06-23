/**
 * ApplicationStore — 应用编辑态全局状态（zustand）
 *
 * 持有三个维度的应用元信息，独立脏标记，按需保存：
 *   - uiJSON（string）— 画布 UI 定义，引擎持有唯一真值
 *   - dataSchema（CollectionDef[]）— 数据表定义
 *   - cloudFunctions（CloudFunctionDef[]）— 云函数定义
 *
 * 脏标记：
 *   - uiJSONDirty：画布编辑后由 UIPage 通过 markUIDirty() 设置
 *   - dataSchemaDirty：DatabasePage 通过 setDataSchema() 设置
 *   - cloudFunctionsDirty：FunctionsPage 通过 setCloudFunctions() 设置
 *
 * 保存：
 *   - save()：按需保存脏维度（不传参则保存所有脏维度）
 *   - refreshFromBackend()：AI done 后拉取最新数据并推送 PreviewServer
 *   - load()：初始化加载全量数据
 *
 * 画布引擎实例（actions）直接挂载到 store：
 *   - 当前活跃画布页（UIPage / PreviewPage）将 IBanvasActions 实例挂载到 store
 *   - store 内部可直接调用引擎能力：序列化、设计尺寸读写
 *   - 外部消费方也可通过 store.actions 直接操作画布内容
 *
 * 消费方：
 *   - ApplicationLayout：写入 appName、触发 save
 *   - UIPage：挂载 actions，同步引擎 designSize 到 store，标记 uiJSONDirty
 *   - PreviewPage：挂载 actions，读 designSize
 *   - DatabasePage / FunctionsPage：CRUD 后通过 setDataSchema / setCloudFunctions 更新 store
 *   - AiBar：onBeforeSend 调用 save，done 后调用 refreshFromBackend
 *   - Sidebar：读 appName
 *   - HomePage：写 initialPrompt
 */

import { create } from "zustand";
import type { IBanvasActions } from "@banyuan/banvasgl";
import * as fullStateApi from "@/api/application/fullState";
import type { SaveAllParams } from "@/api/application/fullState";
import { applicationApi } from "@/api";
import type { CollectionDef } from "@/api/backend/schema";
import type { CloudFunctionDef } from "@/api/backend/cloudFunctions";
import { hotUpdatePreview } from "@/utils/previewBridge";

// ── 类型定义 ─────────────────────────────────────────────────────────────────────

export interface DesignSize {
  width: number;
  height: number;
}

export interface ApplicationState {
  // ── 业务数据 ─────────────────────────────────────────────────────────────────
  /** 当前应用 ID */
  appId: string | null;
  /** App.serialize() 产出的完整 UI 定义 JSON 字符串 */
  uiJSON: string;
  /** 数据表定义 */
  dataSchema: CollectionDef[];
  /** 云函数定义 */
  cloudFunctions: CloudFunctionDef[];

  // ── 三维度脏标记 ──────────────────────────────────────────────────────────
  /** uiJSON 是否有未保存的编辑 */
  uiJSONDirty: boolean;
  /** dataSchema 是否有未保存的编辑 */
  dataSchemaDirty: boolean;
  /** cloudFunctions 是否有未保存的编辑 */
  cloudFunctionsDirty: boolean;

  // ── 状态标识 ─────────────────────────────────────────────────────────────────
  /** 是否正在保存 */
  isSaving: boolean;
  /** 是否正在加载应用数据（loadStore 进行中） */
  dataLoading: boolean;

  // ── 应用元数据 ─────────────────────────────────────────────────────────────
  /** 当前应用名称 */
  appName: string;

  // ── 设计尺寸 ───────────────────────────────────────────────────────────────
  /** 当前应用设计尺寸 */
  designSize: DesignSize;

  // ── 画布引擎实例 ────────────────────────────────────────────────────────────
  /**
   * 当前活跃画布页挂载的引擎操作集（IBanvasActions）。
   * 挂载后 store 可直接调用引擎能力（序列化 / 设计尺寸），
   * 外部也可通过 store.actions 直接操作画布内容。
   */
  actions: IBanvasActions | null;

  // ── initialPrompt ──────────────────────────────────────────────────────────
  /**
   * 首页创建应用后的初始 prompt（带缓冲语义）。
   * key: appId, value: prompt
   */
  initialPrompt: Map<string, string>;
}

export interface ApplicationActions {
  // ── 业务数据操作 ─────────────────────────────────────────────────────────────
  /** 初始化加载：拉取全量数据并推送 PreviewServer */
  load: (appId: string) => Promise<void>;
  /**
   * 按需保存：不传 dimensions 则保存所有脏维度，传参则保存指定维度。
   * 返回 { success, saved[], error? } 供调用方做 UI 反馈。
   */
  save: (dimensions?: SaveDimension[]) => Promise<SaveResult>;
  /** AI done 后拉取最新数据并推送 PreviewServer */
  refreshFromBackend: () => Promise<void>;
  /** 标记 uiJSON 为脏（画布编辑后由 UIPage 调用） */
  markUIDirty: () => void;
  /** 更新 dataSchema（CRUD 后调用，自动标记 dataSchemaDirty） */
  setDataSchema: (dataSchema: CollectionDef[]) => void;
  /** 更新 cloudFunctions（CRUD 后调用，自动标记 cloudFunctionsDirty） */
  setCloudFunctions: (cloudFunctions: CloudFunctionDef[]) => void;

  // ── 应用元数据 ─────────────────────────────────────────────────────────────
  setAppName: (name: string) => void;

  // ── 设计尺寸 ───────────────────────────────────────────────────────────────
  setDesignSize: (size: DesignSize) => void;
  /** Layout 机型选择器调用：更新 store 状态 + 通过 actions 通知画布引擎 */
  changeDesignSize: (size: DesignSize) => void;

  // ── 画布引擎实例挂载 ────────────────────────────────────────────────────────
  /** 活跃画布页挂载引擎实例。返回卸载函数。 */
  registerActions: (actions: IBanvasActions) => () => void;
  /** 取当前画布最新序列化结果（画布未挂载时返回 store.uiJSON 兜底） */
  getSerializedUI: () => string;

  // ── initialPrompt ──────────────────────────────────────────────────────────
  setInitialPrompt: (appId: string, prompt: string) => void;
  consumeInitialPrompt: (appId: string) => string | undefined;
  clearInitialPrompt: (appId: string) => void;

  // ── 重置 ──────────────────────────────────────────────────────────────────
  reset: () => void;
}

export type SaveDimension = 'uiJSON' | 'dataSchema' | 'cloudFunctions';

// ── SaveResult ───────────────────────────────────────────────────────────────────

export interface SaveResult {
  success: boolean;
  /** 本次实际保存的维度列表 */
  saved: SaveDimension[];
  /** 失败原因（success=false 时），调用方可映射到 toast 文案 */
  error?: string;
}

// ── Store 定义 ───────────────────────────────────────────────────────────────────

const initialState: ApplicationState = {
  appId: null,
  uiJSON: "",
  dataSchema: [],
  cloudFunctions: [],
  uiJSONDirty: false,
  dataSchemaDirty: false,
  cloudFunctionsDirty: false,
  isSaving: false,
  dataLoading: false,
  appName: "",
  designSize: { width: 1280, height: 800 },
  actions: null,
  initialPrompt: new Map(),
};

export const useApplicationStore = create<
  ApplicationState & ApplicationActions
>()((set, get) => ({
  ...initialState,

  // ── 业务数据操作 ─────────────────────────────────────────────────────────────

  load: async (appId) => {
    set({ appId, dataLoading: true });
    const res = await fullStateApi.getFullState(appId);
    if (res.success && res.data) {
      set({
        uiJSON: res.data.uiJSON,
        dataSchema: res.data.collections,
        cloudFunctions: res.data.cloudFunctions,
        uiJSONDirty: false,
        dataSchemaDirty: false,
        cloudFunctionsDirty: false,
        dataLoading: false,
      });
      // 初始化推送 PreviewServer
      hotUpdatePreview(res.data.collections, res.data.cloudFunctions);
    } else {
      set({ dataLoading: false });
    }
  },

  save: async (dimensions) => {
    const { appId, appName, isSaving, actions, uiJSONDirty, dataSchemaDirty, cloudFunctionsDirty } = get();
    if (!appId) return { success: false, saved: [], error: "NO_APP_ID" };
    if (isSaving) return { success: false, saved: [], error: "ALREADY_SAVING" };

    // 确定需要保存的维度
    const toSave: SaveDimension[] = dimensions ?? [
      ...(uiJSONDirty ? ['uiJSON' as SaveDimension] : []),
      ...(dataSchemaDirty ? ['dataSchema' as SaveDimension] : []),
      ...(cloudFunctionsDirty ? ['cloudFunctions' as SaveDimension] : []),
    ];

    if (toSave.length === 0) return { success: true, saved: [] };

    set({ isSaving: true });
    try {
      const latest = get();

      // 从引擎直接序列化最新 uiJSON（引擎持有唯一真值）
      const saveUiJSON = toSave.includes('uiJSON')
        ? (actions?.app.getSerializedApp() ?? latest.uiJSON)
        : undefined;
      const saveCollections = toSave.includes('dataSchema') ? latest.dataSchema : undefined;
      const saveCloudFunctions = toSave.includes('cloudFunctions') ? latest.cloudFunctions : undefined;

      // 构建 API 请求参数（后端 save-all 已支持可选字段）
      const apiParams: SaveAllParams = {};
      if (saveUiJSON !== undefined) apiParams.uiJSON = saveUiJSON;
      if (saveCollections !== undefined) apiParams.collections = saveCollections;
      if (saveCloudFunctions !== undefined) apiParams.cloudFunctions = saveCloudFunctions;

      const tasks: Promise<unknown>[] = [
        fullStateApi.saveAll(appId, apiParams),
      ];

      // appName 仅当有脏数据时才一起保存（name 无独立脏标记，始终随业务数据一起走）
      if (appName.trim()) {
        tasks.push(applicationApi.updateApplication(appId, { name: latest.appName }));
      }

      await Promise.all(tasks);

      // 清除已保存维度的脏标记
      const clearFlags: Partial<ApplicationState> = {};
      if (toSave.includes('uiJSON')) clearFlags.uiJSONDirty = false;
      if (toSave.includes('dataSchema')) clearFlags.dataSchemaDirty = false;
      if (toSave.includes('cloudFunctions')) clearFlags.cloudFunctionsDirty = false;
      set(clearFlags as ApplicationState);

      hotUpdatePreview(latest.dataSchema, latest.cloudFunctions);
      return { success: true, saved: toSave };
    } catch (err: unknown) {
      return {
        success: false,
        saved: [],
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      set({ isSaving: false });
    }
  },

  refreshFromBackend: async () => {
    const appId = get().appId;
    if (!appId) return;
    const res = await fullStateApi.getFullState(appId);
    if (res.success && res.data) {
      set({
        uiJSON: res.data.uiJSON,
        dataSchema: res.data.collections,
        cloudFunctions: res.data.cloudFunctions,
        uiJSONDirty: false,
        dataSchemaDirty: false,
        cloudFunctionsDirty: false,
      });
      // 推送 PreviewServer
      hotUpdatePreview(res.data.collections, res.data.cloudFunctions);
    }
  },

  markUIDirty: () => {
    set({ uiJSONDirty: true });
  },

  setDataSchema: (dataSchema) => {
    set({ dataSchema, dataSchemaDirty: true });
    hotUpdatePreview(dataSchema, get().cloudFunctions);
  },

  setCloudFunctions: (cloudFunctions) => {
    set({ cloudFunctions, cloudFunctionsDirty: true });
    hotUpdatePreview(get().dataSchema, cloudFunctions);
  },

  // ── 应用元数据 ─────────────────────────────────────────────────────────────
  setAppName: (name) => set({ appName: name }),

  // ── 设计尺寸 ───────────────────────────────────────────────────────────────
  setDesignSize: (size) => set({ designSize: size }),
  changeDesignSize: (size) => {
    set({ designSize: size });
    // 直接通知画布引擎
    get().actions?.app.setDesignSize(size.width, size.height);
  },

  // ── 画布引擎实例挂载 ────────────────────────────────────────────────────────
  registerActions: (actions) => {
    set({ actions });
    return () => {
      // 仅当卸载的是当前实例时才清空，避免快速切换页面时误清新实例
      if (get().actions === actions) set({ actions: null });
    };
  },

  getSerializedUI: () => {
    const actions = get().actions;
    return actions ? actions.app.getSerializedApp() : get().uiJSON;
  },

  // ── initialPrompt ──────────────────────────────────────────────────────────
  setInitialPrompt: (appId, prompt) => {
    set((s) => {
      const next = new Map(s.initialPrompt);
      next.set(appId, prompt);
      return { initialPrompt: next };
    });
  },

  consumeInitialPrompt: (appId) => {
    const prompt = get().initialPrompt.get(appId);
    if (prompt !== undefined) {
      set((s) => {
        const next = new Map(s.initialPrompt);
        next.delete(appId);
        return { initialPrompt: next };
      });
    }
    return prompt;
  },

  clearInitialPrompt: (appId) => {
    set((s) => {
      const next = new Map(s.initialPrompt);
      next.delete(appId);
      return { initialPrompt: next };
    });
  },

  // ── 重置 ──────────────────────────────────────────────────────────────────
  reset: () => {
    set({ ...initialState, initialPrompt: new Map(), dataLoading: true });
  },
}));
