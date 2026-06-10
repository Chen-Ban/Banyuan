/**
 * 构建应用 API
 */

import { post, get } from '../client'

export type Platform = 'mac' | 'win' | 'linux' | 'web' | 'ios' | 'android'
export type BuildStatus = 'pending' | 'running' | 'success' | 'failed'

export interface SubmitBuildParams {
    appJson: string
    appName: string
    platform: Platform
    width: number
    height: number
    canvasVersion: string
}

export interface SubmitBuildResponse {
    success: boolean
    taskId: string
}

export interface BuildTaskInfo {
    taskId: string
    appName: string
    platform: Platform
    status: BuildStatus
    createdAt: number
    updatedAt: number
    downloadUrl?: string
    error?: string
}

export interface BuildStatusResponse {
    success: boolean
    task: BuildTaskInfo
}

export interface BuildTaskListResponse {
    success: boolean
    tasks: BuildTaskInfo[]
}

/**
 * 提交生成应用任务
 */
export function submitBuild(params: SubmitBuildParams): Promise<SubmitBuildResponse> {
    return post<SubmitBuildResponse>('/v1/build/app', params)
}

/**
 * 查询构建任务状态
 */
export function getBuildStatus(taskId: string): Promise<BuildStatusResponse> {
    return get<BuildStatusResponse>(`/v1/build/status/${taskId}`)
}

/**
 * 查询应用的所有构建任务列表
 */
export function getBuildTasks(appId: string): Promise<BuildTaskListResponse> {
    return get<BuildTaskListResponse>(`/v1/build/tasks?appId=${encodeURIComponent(appId)}`)
}

/**
 * 下载构建产物（触发浏览器下载）
 */
export function downloadBuildArtifact(taskId: string): void {
    // 直接打开下载链接，浏览器会自动处理 Content-Disposition: attachment
    window.open(`/api/v1/build/download/${taskId}`, '_blank')
}
