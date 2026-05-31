/**
 * BanvasGL 工具集成测试（Mock 验证）
 *
 * 验证完整数据流：
 *   appJSON (string) → appJSONToProjection → AI Projection → 工具操作 → projectionToAppJSON → appJSON (string)
 *
 * 运行方式：pnpm tsx packages/xiangdi-agent/tests/tools-integration.test.ts
 */

import { createBanvasToolRegistry, type BanvasHostAdapter } from '../src/tools/createBanvasToolRegistry.js'
import type { ToolRegistry } from '../src/core/ToolRegistry.js'

/** 便捷调用包装：调用工具并返回结果 */
async function call(registry: ToolRegistry, name: string, input: Record<string, unknown>): Promise<unknown> {
    const { result, is_error } = await registry.execute(name, input)
    if (is_error) {
        // 对于预期的业务错误（如节点不存在），返回 { error: string } 格式
        if (typeof result === 'string' && result.includes('not found')) {
            throw new Error(result)
        }
    }
    return result
}

// ═══════════════════════════════════════════════════════════════════════════════
// Mock 数据：模拟 MongoDB 中的 pages（BanvasGL SerializedData 格式）
// ═══════════════════════════════════════════════════════════════════════════════

const MOCK_PAGE_DATA = {
    type: 'SCENE',
    version: '0.8.2',
    data: {
        $type: 'SCENE',
        $value: {
            id: 'page_001',
            name: '首页',
            data: { backgroundColor: '#ffffff' },
            lifetimes: { onLoad: null, onUnload: null, onShow: null, onHide: null },
            camera: {
                $type: 'ORTHOGRAPHIC',
                $value: {
                    type: 'ORTHOGRAPHIC',
                    viewport: { x: 0, y: 0, width: 375, height: 812 },
                },
            },
            children: [
                {
                    $type: 'GRAPHVIEW',
                    $value: {
                        id: 'node_header_bg',
                        type: 'GRAPHVIEW',
                        visible: true,
                        freezed: false,
                        data: {},
                        events: {
                            onClick: null, onDoubleClick: null, onLongPress: null,
                            onMouseEnter: null, onMouseLeave: null, onMouseDown: null,
                            onMouseUp: null, onMouseMove: null, onFocus: null,
                            onBlur: null, onChange: null, onScroll: null,
                        },
                        lifetimes: { onCreated: null, onAttach: null, onDestroy: null },
                        style: {},
                        matrix: {
                            transform: [
                                1, 0, 0, 0,
                                0, 1, 0, 0,
                                0, 0, 1, 0,
                                0, 0, 0, 1,
                            ],
                        },
                        viewport: { x: 0, y: 0, width: 375, height: 200 },
                        constraintBounds: { x: 0, y: 0, width: 375, height: 200 },
                        decoration: {
                            backgroundColor: '#1890ff',
                            borderRadius: 0,
                        },
                        content: {
                            $type: 'ROUNDED_RECT',
                            $value: { radii: 0 },
                        },
                        children: [],
                    },
                },
                {
                    $type: 'TEXTVIEW',
                    $value: {
                        id: 'node_title',
                        type: 'TEXTVIEW',
                        visible: true,
                        freezed: false,
                        data: {},
                        events: {
                            onClick: null, onDoubleClick: null, onLongPress: null,
                            onMouseEnter: null, onMouseLeave: null, onMouseDown: null,
                            onMouseUp: null, onMouseMove: null, onFocus: null,
                            onBlur: null, onChange: null, onScroll: null,
                        },
                        lifetimes: { onCreated: null, onAttach: null, onDestroy: null },
                        style: {},
                        matrix: {
                            transform: [
                                1, 0, 0, 20,
                                0, 1, 0, 80,
                                0, 0, 1, 0,
                                0, 0, 0, 1,
                            ],
                        },
                        viewport: { x: 0, y: 0, width: 200, height: 32 },
                        constraintBounds: { x: 0, y: 0, width: 200, height: 32 },
                        editable: true,
                        verticalAlign: 'top',
                        content: {
                            $type: 'TEXTFIELDS',
                            $value: {
                                paragraphs: [
                                    {
                                        $type: 'TEXTPARAGRAPH',
                                        $value: {
                                            elements: [
                                                {
                                                    $type: 'PRINTABLE_TEXTELEMENT',
                                                    $value: {
                                                        text: '欢迎使用',
                                                        fontSize: 24,
                                                        fontWeight: 'bold',
                                                        color: '#ffffff',
                                                        italic: false,
                                                        underline: false,
                                                    },
                                                },
                                            ],
                                            align: 'left',
                                            lineHeight: 1.5,
                                        },
                                    },
                                ],
                            },
                        },
                        children: [],
                    },
                },
            ],
        },
    },
    metadata: { timestamp: Date.now(), source: 'test' },
}

const MOCK_APP_JSON: string = JSON.stringify({
    type: 'APP',
    version: '0.8.2',
    data: {
        lifetimes: { onLaunch: null, onUnlaunch: null },
        scenes: [MOCK_PAGE_DATA.data],
    },
    metadata: { timestamp: Date.now(), source: 'test' },
})

// ═══════════════════════════════════════════════════════════════════════════════
// Mock BanvasHostAdapter
// ═══════════════════════════════════════════════════════════════════════════════

function createTestAdapter(initialAppJSON: string): BanvasHostAdapter & { currentAppJSON: () => string } {
    let appJSON = initialAppJSON
    return {
        async getAppJSON() { return appJSON },
        async setAppJSON(newAppJSON: string) { appJSON = newAppJSON },
        async getAppMeta() {
            let version = '0.8.2'
            if (appJSON) {
                try {
                    const parsed = JSON.parse(appJSON)
                    if (parsed.version) version = parsed.version
                } catch { /* ignore */ }
            }
            return { id: 'test-app', name: 'Test App', version }
        },
        currentAppJSON() { return appJSON },
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 测试工具
// ═══════════════════════════════════════════════════════════════════════════════

let passed = 0
let failed = 0

function assert(condition: boolean, message: string): void {
    if (condition) {
        passed++
        console.log(`  ✅ ${message}`)
    } else {
        failed++
        console.error(`  ❌ ${message}`)
    }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
    const actualStr = JSON.stringify(actual)
    const expectedStr = JSON.stringify(expected)
    if (actualStr === expectedStr) {
        passed++
        console.log(`  ✅ ${message}`)
    } else {
        failed++
        console.error(`  ❌ ${message}`)
        console.error(`     Expected: ${expectedStr}`)
        console.error(`     Actual:   ${actualStr}`)
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 测试用例
// ═══════════════════════════════════════════════════════════════════════════════

async function testGetAppState() {
    console.log('\n📋 Test: GET_APP_STATE')

    const adapter = createTestAdapter(MOCK_APP_JSON)
    const registry = createBanvasToolRegistry(adapter)

    // 获取所有页面
    const allPages = await call(registry, 'banvas_get_app_state', {})
    assert(Array.isArray(allPages), '返回值应为数组')
    assert((allPages as any[]).length === 1, '应有 1 个页面')

    const page = (allPages as any[])[0]
    assertEqual(page.id, 'page_001', '页面 ID 正确')
    assertEqual(page.name, '首页', '页面名称正确')
    assertEqual(page.size, { width: 375, height: 812 }, '页面尺寸正确')
    assert(page.children.length === 2, '应有 2 个子节点')

    // 验证第一个子节点（GRAPHVIEW）
    const headerBg = page.children[0]
    assertEqual(headerBg.type, 'GRAPHVIEW', '第一个节点类型正确')
    assertEqual(headerBg.id, 'node_header_bg', '第一个节点 ID 正确')
    assertEqual(headerBg.transform, { x: 0, y: 0 }, '坐标正确（原点）')
    assertEqual(headerBg.size, { width: 375, height: 200 }, '尺寸正确')
    assert(headerBg.decoration?.fill?.color === '#1890ff', '装饰颜色正确')

    // 验证第二个子节点（TEXTVIEW）
    const title = page.children[1]
    assertEqual(title.type, 'TEXTVIEW', '第二个节点类型正确')
    assertEqual(title.id, 'node_title', '第二个节点 ID 正确')
    assertEqual(title.transform, { x: 20, y: 80 }, '文本坐标正确')
    assert(title.content?.paragraphs?.[0]?.elements?.[0]?.text === '欢迎使用', '文本内容正确')

    // 按 pageId 获取
    const singlePage = await call(registry, 'banvas_get_app_state', { pageId: 'page_001' })
    assertEqual((singlePage as any).id, 'page_001', '按 ID 获取页面正确')

    // 不存在的 pageId
    const notFound = await call(registry, 'banvas_get_app_state', { pageId: 'nonexistent' })
    assert((notFound as any).error !== undefined, '不存在的页面返回 error')
}

async function testAddNode() {
    console.log('\n📋 Test: ADD_NODE (AI Projection 格式)')

    const adapter = createTestAdapter(MOCK_APP_JSON)
    const registry = createBanvasToolRegistry(adapter)

    // 使用 AI Projection 格式添加节点
    const result = await call(registry, 'banvas_add_node', {
        pageId: 'page_001',
        node: {
            type: 'GRAPHVIEW',
            transform: { x: 20, y: 220 },
            size: { width: 335, height: 48 },
            decoration: { fill: { color: '#ff4d4f' }, cornerRadius: 12 },
            content: { graphType: 'ROUNDED_RECT', data: { radii: 12 } },
        },
    })

    assert((result as any).nodeId !== undefined, '返回了新节点 ID')
    assert((result as any).message === '节点已添加', '操作成功消息')

    // 验证节点已写入
    const state = await call(registry, 'banvas_get_app_state', { pageId: 'page_001' })
    const children = (state as any).children
    assert(children.length === 3, '添加后应有 3 个子节点')

    const newNode = children[2]
    assertEqual(newNode.type, 'GRAPHVIEW', '新节点类型正确')
    assertEqual(newNode.transform, { x: 20, y: 220 }, '新节点坐标正确')
    assertEqual(newNode.size, { width: 335, height: 48 }, '新节点尺寸正确')
}

async function testUpdateNode() {
    console.log('\n📋 Test: UPDATE_NODE')

    const adapter = createTestAdapter(MOCK_APP_JSON)
    const registry = createBanvasToolRegistry(adapter)

    // 更新节点装饰
    const result = await call(registry, 'banvas_update_node', {
        pageId: 'page_001',
        nodeId: 'node_header_bg',
        patch: {
            decoration: { fill: { color: '#52c41a' } },
        },
    })
    assertEqual((result as any).message, '节点已更新', '更新成功')

    // 验证更新已生效
    const state = await call(registry, 'banvas_get_app_state', { pageId: 'page_001' })
    const headerBg = (state as any).children[0]
    assert(headerBg.decoration?.fill?.color === '#52c41a', '装饰颜色更新正确')

    // 不存在的节点
    const notFound = await call(registry, 'banvas_update_node', {
        pageId: 'page_001',
        nodeId: 'nonexistent',
        patch: {},
    })
    assert((notFound as any).error !== undefined, '不存在的节点返回 error')
}

async function testMoveAndResize() {
    console.log('\n📋 Test: MOVE_NODE & RESIZE_NODE')

    const adapter = createTestAdapter(MOCK_APP_JSON)
    const registry = createBanvasToolRegistry(adapter)

    // 移动节点
    await call(registry, 'banvas_move_node', {
        pageId: 'page_001',
        nodeId: 'node_title',
        x: 50,
        y: 100,
    })

    let state = await call(registry, 'banvas_get_app_state', { pageId: 'page_001' })
    let title = (state as any).children[1]
    assertEqual(title.transform, { x: 50, y: 100 }, '移动后坐标正确')

    // 调整尺寸
    await call(registry, 'banvas_resize_node', {
        pageId: 'page_001',
        nodeId: 'node_title',
        width: 300,
        height: 40,
    })

    state = await call(registry, 'banvas_get_app_state', { pageId: 'page_001' })
    title = (state as any).children[1]
    assertEqual(title.size, { width: 300, height: 40 }, '调整后尺寸正确')
}

async function testDeleteNode() {
    console.log('\n📋 Test: DELETE_NODE')

    const adapter = createTestAdapter(MOCK_APP_JSON)
    const registry = createBanvasToolRegistry(adapter)

    const result = await call(registry, 'banvas_delete_node', {
        pageId: 'page_001',
        nodeId: 'node_header_bg',
    })
    assertEqual((result as any).message, '节点已删除', '删除成功')

    const state = await call(registry, 'banvas_get_app_state', { pageId: 'page_001' })
    const children = (state as any).children
    assert(children.length === 1, '删除后应有 1 个子节点')
    assertEqual(children[0].id, 'node_title', '剩余节点是 title')
}

async function testCreatePage() {
    console.log('\n📋 Test: CREATE_PAGE')

    const adapter = createTestAdapter(MOCK_APP_JSON)
    const registry = createBanvasToolRegistry(adapter)

    const result = await call(registry, 'banvas_create_page', {
        name: '设置页',
        width: 375,
        height: 667,
        backgroundColor: '#f5f5f5',
    })

    assert((result as any).pageId !== undefined, '返回了新页面 ID')

    const allPages = await call(registry, 'banvas_get_app_state', {})
    assert((allPages as any[]).length === 2, '应有 2 个页面')

    const newPage = (allPages as any[])[1]
    assertEqual(newPage.name, '设置页', '新页面名称正确')
    assertEqual(newPage.size, { width: 375, height: 667 }, '新页面尺寸正确')
    assertEqual(newPage.backgroundColor, '#f5f5f5', '新页面背景色正确')
}

async function testApplyPatch() {
    console.log('\n📋 Test: APPLY_PATCH（批量操作事务性）')

    const adapter = createTestAdapter(MOCK_APP_JSON)
    const registry = createBanvasToolRegistry(adapter)

    const result = await call(registry, 'banvas_apply_patch', {
        operations: [
            {
                tool: 'banvas_add_node',
                input: {
                    pageId: 'page_001',
                    node: {
                        type: 'GRAPHVIEW',
                        transform: { x: 0, y: 400 },
                        size: { width: 375, height: 100 },
                        content: { graphType: 'ROUNDED_RECT', data: { radii: 0 } },
                    },
                },
            },
            {
                tool: 'banvas_move_node',
                input: {
                    pageId: 'page_001',
                    nodeId: 'node_title',
                    x: 30,
                    y: 90,
                },
            },
        ],
    })

    assert((result as any).message?.includes('批量操作完成'), '批量操作完成')
    assert((result as any).results?.length === 2, '返回 2 个结果')

    // 验证最终状态
    const state = await call(registry, 'banvas_get_app_state', { pageId: 'page_001' })
    const children = (state as any).children
    assert(children.length === 3, '批量添加后应有 3 个节点')

    // 验证 move 生效
    const title = children.find((c: any) => c.id === 'node_title')
    assertEqual(title.transform, { x: 30, y: 90 }, '批量 move 生效')
}

async function testRoundTrip() {
    console.log('\n📋 Test: Round-trip（pages → projection → 修改 → pages → 验证版本）')

    const adapter = createTestAdapter(MOCK_APP_JSON)
    const registry = createBanvasToolRegistry(adapter)

    // 执行一次添加操作
    await call(registry, 'banvas_add_node', {
        pageId: 'page_001',
        node: {
            type: 'IMAGEVIEW',
            transform: { x: 20, y: 300 },
            size: { width: 100, height: 100 },
            src: 'https://example.com/test.png',
        },
    })

    // 验证写回的 appJSON 保持正确的 SerializedData 格式
    const appJSON = adapter.currentAppJSON()
    assert(appJSON.length > 0, 'appJSON 不为空')

    const parsed = JSON.parse(appJSON)
    assertEqual(parsed.type, 'APP', 'SerializedData.type 正确')
    assertEqual(parsed.version, '0.8.2', 'version 从原始数据正确提取并保留')
    assert(Array.isArray(parsed.data.scenes), 'data.scenes 是数组')
    assert(parsed.data.scenes.length === 1, '仍然是 1 个页面')

    const sceneWrapper = parsed.data.scenes[0]
    assertEqual(sceneWrapper.$type, 'SCENE', 'scene.$type 正确')
    assert(sceneWrapper.$value.children.length === 3, '写回的 children 包含 3 个节点')

    // 验证新加的图片节点在写回数据中
    const imgNode = sceneWrapper.$value.children[2]
    assertEqual(imgNode.$type, 'IMAGEVIEW', '新节点 $type 正确')
    assert(imgNode.$value.id !== undefined, '新节点有 ID')
}

// ═══════════════════════════════════════════════════════════════════════════════
// 运行所有测试
// ═══════════════════════════════════════════════════════════════════════════════

async function runAll() {
    console.log('🧪 BanvasGL Agent 工具集成测试\n' + '═'.repeat(60))

    try {
        await testGetAppState()
        await testAddNode()
        await testUpdateNode()
        await testMoveAndResize()
        await testDeleteNode()
        await testCreatePage()
        await testApplyPatch()
        await testRoundTrip()
    } catch (err) {
        console.error('\n💥 Unexpected error:', err)
        failed++
    }

    console.log('\n' + '═'.repeat(60))
    console.log(`📊 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`)

    if (failed > 0) {
        process.exit(1)
    } else {
        console.log('\n🎉 All tests passed!')
    }
}

runAll()
