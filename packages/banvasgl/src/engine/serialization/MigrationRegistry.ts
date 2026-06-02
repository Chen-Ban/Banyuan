import type { SerializedData } from './Serializer'
import { version as BANVASGL_VERSION } from '@/version.js'

/**
 * 数据迁移函数接口
 *
 * 每个 Migration 将数据从某个旧版本升级到 `version` 指定的目标版本。
 * `up` 函数操作的是 JSON.parse() 后的 plain object，不依赖任何运行时类实例。
 */
export interface Migration {
    /** 执行此迁移后数据的目标版本 */
    version: string
    /** 迁移描述 */
    description: string
    /** 在原始 JSON 层面变换 SerializedData */
    up(data: SerializedData): SerializedData
}

/** 基线版本标识——缺少 version 字段或值为 '1.0.0' 的旧数据统一视为此版本 */
const BASELINE_VERSION = '0.0.0'

/**
 * 比较两个语义版本号
 * @returns 负数表示 a < b，0 表示相等，正数表示 a > b
 */
function compareSemver(a: string, b: string): number {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < 3; i++) {
        const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
        if (diff !== 0) return diff
    }
    return 0
}

/**
 * 将数据中的版本号规范化
 * - 缺失或 '1.0.0'（旧硬编码值）→ BASELINE_VERSION
 * - 其他值保持不变
 */
function normalizeDataVersion(version: string | undefined): string {
    if (!version || version === '1.0.0') return BASELINE_VERSION
    return version
}

/**
 * MigrationRegistry —— 有序迁移管线
 *
 * 维护按版本升序排列的迁移函数链。
 * `migrate()` 比较数据版本与当前引擎版本，按序执行区间内所有迁移函数。
 *
 * 设计原则：
 * - 迁移函数操作 plain object，在 deserializeValue() 之前执行
 * - 迁移函数可独立测试，无需启动完整引擎
 * - 迁移链按 version 升序排列，每次 migrate 只执行 (dataVersion, currentVersion] 区间内的迁移
 */
export class MigrationRegistry {
    private migrations: Migration[] = []

    /**
     * 注册一个迁移函数
     * 注册后自动按 version 升序排列
     */
    public register(migration: Migration): void {
        this.migrations.push(migration)
        this.migrations.sort((a, b) => compareSemver(a.version, b.version))
    }

    /**
     * 将 SerializedData 从其 version 迁移到当前引擎版本
     *
     * @param data - JSON.parse 后的序列化数据
     * @returns 迁移后的数据（version 字段更新为当前引擎版本）
     */
    public migrate(data: SerializedData): SerializedData {
        const dataVersion = normalizeDataVersion(data.version)
        const targetVersion = BANVASGL_VERSION

        // 数据版本已经是当前版本或更新，无需迁移
        if (compareSemver(dataVersion, targetVersion) >= 0) {
            return data
        }

        // 按序执行 (dataVersion, targetVersion] 区间内的所有迁移
        let result = data
        for (const migration of this.migrations) {
            if (compareSemver(migration.version, dataVersion) <= 0) {
                continue // 跳过已经应用过的迁移
            }
            if (compareSemver(migration.version, targetVersion) > 0) {
                break // 超出目标版本，停止
            }
            result = migration.up(result)
            result.version = migration.version
        }

        // 确保最终版本号为当前引擎版本
        result.version = targetVersion
        return result
    }

    /**
     * 获取已注册的迁移数量（用于测试）
     */
    public get count(): number {
        return this.migrations.length
    }

    /**
     * 判断数据是否需要迁移
     */
    public needsMigration(data: SerializedData): boolean {
        const dataVersion = normalizeDataVersion(data.version)
        return compareSemver(dataVersion, BANVASGL_VERSION) < 0
    }
}

/**
 * 全局 MigrationRegistry 单例
 */
export const migrationRegistry = new MigrationRegistry()
