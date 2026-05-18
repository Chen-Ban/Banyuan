import React, { useCallback, useEffect, useState } from 'react'
import { Button, Input, Modal, Popconfirm, message } from 'antd'
import { ThunderboltOutlined } from '@ant-design/icons'
import { functionsApi, aiApi } from '@/api'
import type { AppFunction } from '@/api'
import { getErrorMessage } from '@/utils/error'
import FunctionDiffPreview from './FunctionDiffPreview'
import styles from './FunctionsTab.module.scss'

interface FunctionsTabProps {
    appId: string
}

const DEFAULT_CODE = `// 云函数入口
// ctx.db — 数据库操作对象
// ctx.input — 调用时传入的参数
async function handler(ctx) {
  return { message: 'Hello from cloud function!' }
}
`

interface EditorState {
    open: boolean
    isNew: boolean
    name: string
    code: string
    description: string
}

const CLOSED_EDITOR: EditorState = {
    open: false,
    isNew: false,
    name: '',
    code: '',
    description: '',
}

// ─── AI 优化状态 ──────────────────────────────────────────────────────────────

interface AiOptimizeState {
    /** 正在优化的函数名 */
    targetName: string | null
    /** 是否正在请求中 */
    loading: boolean
    /** AI 返回的新代码 */
    newCode: string | null
    /** 变更说明 */
    changelog: string | null
    /** 错误信息 */
    error: string | null
}

const INITIAL_AI_STATE: AiOptimizeState = {
    targetName: null,
    loading: false,
    newCode: null,
    changelog: null,
    error: null,
}

const FunctionsTab: React.FC<FunctionsTabProps> = ({ appId }) => {
    const [functions, setFunctions] = useState<AppFunction[]>([])
    const [loading, setLoading] = useState(false)
    const [editor, setEditor] = useState<EditorState>(CLOSED_EDITOR)
    const [saving, setSaving] = useState(false)
    const [validateResult, setValidateResult] = useState<{ valid: boolean; error?: string } | null>(null)

    // 测试运行
    const [runInput, setRunInput] = useState('{}')
    const [runResult, setRunResult] = useState<{ result: unknown; logs: string[] } | null>(null)
    const [running, setRunning] = useState(false)

    // AI 优化状态
    const [aiState, setAiState] = useState<AiOptimizeState>(INITIAL_AI_STATE)
    const [applying, setApplying] = useState(false)

    const loadFunctions = useCallback(async () => {
        if (!appId) return
        setLoading(true)
        try {
            const res = await functionsApi.listFunctions(appId)
            setFunctions(res.data ?? [])
        } catch (err: unknown) {
            message.error(getErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }, [appId])

    useEffect(() => {
        loadFunctions()
    }, [loadFunctions])

    // ── 新增 ──
    const handleAdd = () => {
        setEditor({
            open: true,
            isNew: true,
            name: '',
            code: DEFAULT_CODE,
            description: '',
        })
        setValidateResult(null)
        setRunResult(null)
        setRunInput('{}')
    }

    // ── 编辑 ──
    const handleEdit = (fn: AppFunction) => {
        setEditor({
            open: true,
            isNew: false,
            name: fn.name,
            code: fn.code,
            description: fn.description,
        })
        setValidateResult(null)
        setRunResult(null)
        setRunInput('{}')
    }

    // ── 删除 ──
    const handleDelete = async (name: string) => {
        try {
            await functionsApi.deleteFunction(appId, name)
            message.success('已删除')
            loadFunctions()
        } catch (err: unknown) {
            message.error(getErrorMessage(err))
        }
    }

    // ── 保存 ──
    const handleSave = async () => {
        if (!editor.name.trim()) {
            message.warning('请输入函数名称')
            return
        }
        setSaving(true)
        try {
            await functionsApi.upsertFunction(appId, editor.name.trim(), {
                code: editor.code,
                description: editor.description,
            })
            message.success(editor.isNew ? '创建成功' : '保存成功')
            setEditor(CLOSED_EDITOR)
            loadFunctions()
        } catch (err: unknown) {
            message.error(getErrorMessage(err))
        } finally {
            setSaving(false)
        }
    }

    // ── 校验 ──
    const handleValidate = async () => {
        if (!editor.name.trim()) {
            message.warning('请先输入函数名称')
            return
        }
        try {
            const res = await functionsApi.validateCode(appId, editor.name.trim(), editor.code)
            setValidateResult(res.data ?? { valid: true })
        } catch (err: unknown) {
            message.error(getErrorMessage(err))
        }
    }

    // ── 测试运行 ──
    const handleRun = async () => {
        if (!editor.name.trim()) {
            message.warning('请先保存函数')
            return
        }
        setRunning(true)
        try {
            let parsedInput: unknown = {}
            try {
                parsedInput = JSON.parse(runInput)
            } catch {
                message.warning('输入参数不是合法 JSON')
                setRunning(false)
                return
            }
            const res = await functionsApi.runFunction(appId, editor.name.trim(), parsedInput)
            setRunResult(res.data ?? { result: null, logs: [] })
        } catch (err: unknown) {
            message.error(getErrorMessage(err))
        } finally {
            setRunning(false)
        }
    }

    // ── AI 优化 ──
    const handleAiOptimize = async (fn: AppFunction) => {
        setAiState({
            targetName: fn.name,
            loading: true,
            newCode: null,
            changelog: null,
            error: null,
        })

        try {
            // 通过 AI 对话接口发送优化请求
            // 构造一个专门的优化 prompt
            const prompt = `请优化以下云函数代码，提升代码质量、性能和可读性。函数名：${fn.name}，功能描述：${fn.description || '无'}。\n\n当前代码：\n\`\`\`javascript\n${fn.code}\n\`\`\`\n\n请直接返回优化后的完整代码，用 \`\`\`javascript 代码块包裹。并在代码块之前简要说明做了哪些优化。`

            let resultText = ''

            await aiApi.aiChat({
                appId,
                prompt,
                onEvent: (event) => {
                    if (event.type === 'text_delta') {
                        resultText += event.text
                        // 实时更新流式文本（可选，此处简化为最终结果）
                    } else if (event.type === 'error') {
                        setAiState((prev) => ({
                            ...prev,
                            loading: false,
                            error: event.message,
                        }))
                    }
                },
            })

            // 从 AI 返回的文本中提取代码块
            const codeMatch = resultText.match(/```(?:javascript|js)?\s*\n([\s\S]*?)\n```/)
            const newCode = codeMatch ? codeMatch[1] : null

            // 提取代码块之前的说明文字作为 changelog
            const changelogText = codeMatch
                ? resultText.slice(0, resultText.indexOf('```')).trim()
                : resultText.trim()

            if (newCode) {
                setAiState((prev) => ({
                    ...prev,
                    loading: false,
                    newCode,
                    changelog: changelogText || '代码已优化',
                }))
            } else {
                setAiState((prev) => ({
                    ...prev,
                    loading: false,
                    error: '无法从 AI 响应中提取代码，请重试',
                }))
            }
        } catch (err: unknown) {
            setAiState((prev) => ({
                ...prev,
                loading: false,
                error: getErrorMessage(err),
            }))
        }
    }

    // ── 应用 AI 优化结果 ──
    const handleApplyOptimize = async () => {
        if (!aiState.targetName || !aiState.newCode) return

        setApplying(true)
        try {
            await functionsApi.upsertFunction(appId, aiState.targetName, {
                code: aiState.newCode,
                description: functions.find((f) => f.name === aiState.targetName)?.description ?? '',
            })
            message.success('AI 优化已应用')
            setAiState(INITIAL_AI_STATE)
            loadFunctions()
        } catch (err: unknown) {
            message.error(getErrorMessage(err))
        } finally {
            setApplying(false)
        }
    }

    // ── 取消 AI 优化 ──
    const handleCancelOptimize = () => {
        setAiState(INITIAL_AI_STATE)
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <span className={styles.headerTitle}>云函数</span>
                <Button size="small" type="primary" onClick={handleAdd}>
                    + 新增
                </Button>
            </div>

            <div className={styles.functionList}>
                {loading && <div className={styles.empty}>加载中...</div>}
                {!loading && functions.length === 0 && (
                    <div className={styles.empty}>暂无云函数，点击上方"新增"创建</div>
                )}
                {functions.map((fn) => (
                    <div key={fn.name} className={styles.functionItem} onClick={() => handleEdit(fn)}>
                        <div className={styles.functionInfo}>
                            <div className={styles.functionName}>{fn.name}</div>
                            {fn.description && (
                                <div className={styles.functionDesc}>{fn.description}</div>
                            )}
                        </div>
                        <div className={styles.functionActions}>
                            <Button
                                size="small"
                                type="text"
                                icon={<ThunderboltOutlined />}
                                onClick={(e) => { e.stopPropagation(); handleAiOptimize(fn) }}
                                title="AI 优化"
                                loading={aiState.targetName === fn.name && aiState.loading}
                                style={{ padding: '0 4px', minWidth: 20, fontSize: 12, color: '#722ed1' }}
                            />
                            <Button
                                size="small"
                                type="text"
                                onClick={(e) => { e.stopPropagation(); handleEdit(fn) }}
                                title="编辑"
                                style={{ padding: '0 4px', minWidth: 20, fontSize: 12 }}
                            >✎</Button>
                            <Popconfirm
                                title="确定删除此函数？"
                                onConfirm={(e) => { e?.stopPropagation(); handleDelete(fn.name) }}
                                onCancel={(e) => e?.stopPropagation()}
                            >
                                <Button
                                    size="small"
                                    type="text"
                                    danger
                                    onClick={(e) => e.stopPropagation()}
                                    title="删除"
                                    style={{ padding: '0 4px', minWidth: 20 }}
                                >×</Button>
                            </Popconfirm>
                        </div>
                    </div>
                ))}
            </div>

            {/* AI 优化 Diff 预览 */}
            {aiState.targetName && (aiState.newCode || aiState.error) && (
                <div className={styles.aiPreviewSection}>
                    {aiState.error ? (
                        <div className={styles.aiError}>
                            <span>AI 优化失败：{aiState.error}</span>
                            <Button size="small" onClick={handleCancelOptimize}>关闭</Button>
                        </div>
                    ) : aiState.newCode ? (
                        <FunctionDiffPreview
                            currentCode={functions.find((f) => f.name === aiState.targetName)?.code ?? ''}
                            newCode={aiState.newCode}
                            changelog={aiState.changelog ?? undefined}
                            onApply={handleApplyOptimize}
                            onCancel={handleCancelOptimize}
                            applying={applying}
                        />
                    ) : null}
                </div>
            )}

            {/* AI 优化加载中提示 */}
            {aiState.loading && (
                <div className={styles.aiLoading}>
                    AI 正在分析并优化函数 <strong>{aiState.targetName}</strong>...
                </div>
            )}

            {/* 编辑弹窗 */}
            <Modal
                open={editor.open}
                title={editor.isNew ? '新增云函数' : `编辑：${editor.name}`}
                onCancel={() => setEditor(CLOSED_EDITOR)}
                width={680}
                footer={[
                    <Button key="validate" onClick={handleValidate}>校验代码</Button>,
                    <Button key="cancel" onClick={() => setEditor(CLOSED_EDITOR)}>取消</Button>,
                    <Button key="save" type="primary" loading={saving} onClick={handleSave}>保存</Button>,
                ]}
                destroyOnHidden
            >
                <div className={styles.editorContent}>
                    <div className={styles.editorMeta}>
                        <div className={styles.editorField}>
                            <span className={styles.editorLabel}>函数名称</span>
                            <Input
                                size="small"
                                value={editor.name}
                                onChange={(e) => setEditor((s) => ({ ...s, name: e.target.value }))}
                                disabled={!editor.isNew}
                                placeholder="如：getUserList"
                            />
                        </div>
                        <div className={styles.editorField}>
                            <span className={styles.editorLabel}>描述</span>
                            <Input
                                size="small"
                                value={editor.description}
                                onChange={(e) => setEditor((s) => ({ ...s, description: e.target.value }))}
                                placeholder="函数用途说明"
                            />
                        </div>
                    </div>

                    <div className={`${styles.editorField} ${styles.fullWidth}`}>
                        <span className={styles.editorLabel}>代码</span>
                        <Input.TextArea
                            className={styles.codeArea}
                            value={editor.code}
                            onChange={(e) => setEditor((s) => ({ ...s, code: e.target.value }))}
                            rows={12}
                            placeholder="编写云函数代码..."
                        />
                    </div>

                    {validateResult && (
                        <div className={`${styles.validateResult} ${validateResult.valid ? styles.valid : styles.invalid}`}>
                            {validateResult.valid ? '✓ 代码校验通过' : `✗ ${validateResult.error ?? '校验失败'}`}
                        </div>
                    )}

                    {/* 测试运行面板 */}
                    {!editor.isNew && (
                        <div className={styles.runPanel}>
                            <div className={styles.runPanelTitle}>测试运行</div>
                            <Input.TextArea
                                className={styles.codeArea}
                                value={runInput}
                                onChange={(e) => setRunInput(e.target.value)}
                                rows={3}
                                placeholder='输入 JSON 参数，如 {"userId": "123"}'
                            />
                            <Button
                                size="small"
                                type="primary"
                                loading={running}
                                onClick={handleRun}
                                style={{ marginTop: 6 }}
                            >
                                运行
                            </Button>
                            {runResult && (
                                <>
                                    <div className={styles.runResult}>
                                        {JSON.stringify(runResult.result, null, 2)}
                                    </div>
                                    {runResult.logs.length > 0 && (
                                        <div className={styles.runLogs}>
                                            {runResult.logs.join('\n')}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    )
}

export default FunctionsTab
