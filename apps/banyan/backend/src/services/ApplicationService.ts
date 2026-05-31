import crypto from "node:crypto";
import { Application, IApplication } from "../models";

export interface IApplicationQuery {
  name?: string;
  application_id?: string;
  tags?: string;
  createdBy?: string;
  tenantId?: string;
}

export interface IApplicationListResult {
  applications: Partial<IApplication>[];
  total: number;
  page: number;
  pageSize: number;
}

export interface IUpdateApplicationData {
  name?: string;
  description?: string;
  appJSON?: string;
  thumbnail?: string;
  tags?: string[];
  updatedBy?: string;
}

class ApplicationService {
  /**
   * 查询应用列表（不返回 appJSON 字段，减少传输量）
   */
  async getApplicationList(
    query: IApplicationQuery = {},
    page: number = 1,
    pageSize: number = 12,
  ): Promise<IApplicationListResult> {
    const filter: any = {};

    if (query.name) {
      filter.name = { $regex: query.name, $options: "i" };
    }
    if (query.application_id) {
      filter.application_id = { $regex: query.application_id, $options: "i" };
    }
    if (query.tags) {
      filter.tags = { $in: [query.tags] };
    }
    if (query.tenantId && query.createdBy) {
      // 成员视角：同一租户下仅看自己的应用
      filter.tenantId = query.tenantId;
      filter.createdBy = query.createdBy;
    } else if (query.tenantId) {
      // 管理员视角：看租户内所有应用
      filter.tenantId = query.tenantId;
    } else if (query.createdBy) {
      // 兼容旧逻辑：无租户时按 createdBy 过滤
      filter.createdBy = query.createdBy;
    }

    const skip = (page - 1) * pageSize;

    const [total, applications] = await Promise.all([
      Application.countDocuments(filter),
      Application.find(filter)
        .select("-appJSON")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
    ]);

    return {
      applications: applications as unknown as Partial<IApplication>[],
      total,
      page,
      pageSize,
    };
  }

  /**
   * 根据ID获取应用详情（含 appJSON）
   */
  async getApplicationById(
    applicationId: string,
  ): Promise<IApplication | null> {
    const application = await Application.findOne({
      application_id: applicationId,
    }).lean();
    return application as unknown as IApplication | null;
  }

  /**
   * 创建空白应用
   *
   * 服务端自动生成 application_id，默认 name 为「未命名应用」，默认 appJSON 为空字符串。
   */
  async createApplication(
    userId: string,
    tenantId: string,
  ): Promise<IApplication> {
    const application_id = `app_${crypto.randomUUID()}`;
    const application = new Application({
      application_id,
      name: "未命名应用",
      description: "",
      appJSON: "",
      tags: [],
      version: 1,
      tenantId,
      createdBy: userId,
      updatedBy: "",
    });
    await application.save();
    return application.toObject() as unknown as IApplication;
  }

  /**
   * 更新应用（version 自增）
   */
  async updateApplication(
    applicationId: string,
    updateData: IUpdateApplicationData,
  ): Promise<IApplication | null> {
    const application = await Application.findOne({
      application_id: applicationId,
    });

    if (!application) {
      return null;
    }

    if (updateData.name !== undefined) application.name = updateData.name;
    if (updateData.description !== undefined)
      application.description = updateData.description;
    if (updateData.appJSON !== undefined) application.appJSON = updateData.appJSON;
    if (updateData.thumbnail !== undefined)
      application.thumbnail = updateData.thumbnail;
    if (updateData.tags !== undefined) application.tags = updateData.tags;
    if (updateData.updatedBy !== undefined)
      application.updatedBy = updateData.updatedBy;

    application.version = (application.version || 0) + 1;

    await application.save();
    return application.toObject() as unknown as IApplication;
  }

  /**
   * 删除应用
   */
  async deleteApplication(applicationId: string): Promise<boolean> {
    const application = await Application.findOne({
      application_id: applicationId,
    });

    if (!application) {
      return false;
    }

    await application.deleteOne();
    return true;
  }
}

export default new ApplicationService();
