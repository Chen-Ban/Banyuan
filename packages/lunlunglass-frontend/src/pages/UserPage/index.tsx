import { useState, useEffect } from "react";
import { Form, Input, Button, Card, message, Row, Col } from "antd";
import { ArrowLeftOutlined, SaveOutlined } from "@ant-design/icons";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import type { FormProps } from "antd";
import type { UserFormData, OptometryParams } from "@/types";
import FaceDiagram from "./components/FaceDiagram";
import OptometryControls from "./components/OptometryControls";
import styles from "./index.module.scss";

// 默认验光参数
const defaultOptometryParams: OptometryParams = {
  pd: {
    left: 32,
    right: 32,
  },
  left: {
    sph: -1.5,
    cyl: -0.75,
    axis: 90,
    ph: 18,
    add: 0,
  },
  right: {
    sph: -1.25,
    cyl: -0.5,
    axis: 85,
    ph: 18,
    add: 0,
  },
};

const UserPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id?: string }>();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [optometryParams, setOptometryParams] = useState<OptometryParams>(defaultOptometryParams);

  // 判断是新增还是编辑模式
  useEffect(() => {
    if (id) {
      setIsEditMode(true);
      loadUserData(id);
    } else {
      setIsEditMode(false);
    }
  }, [id]);

  // 加载用户数据（编辑模式）
  const loadUserData = async (userId: string) => {
    setInitialLoading(true);
    try {
      // 模拟API调用
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 模拟数据
      const mockUserData: UserFormData = {
        userId: userId,
        username: `用户${userId}`,
        email: `user${userId}@example.com`,
        phone: `138${String(userId).padStart(8, "0")}`,
        optometry: {
          pd: {
            left: 31.5,
            right: 32.2,
          },
          left: {
            sph: -2.25,
            cyl: -0.75,
            axis: 92,
            ph: 19,
            add: 0.5,
          },
          right: {
            sph: -2,
            cyl: -0.5,
            axis: 88,
            ph: 19.5,
            add: 0.5,
          },
        },
      };

      form.setFieldsValue(mockUserData);
      if (mockUserData.optometry) {
        setOptometryParams(mockUserData.optometry);
      }
    } catch (error) {
      message.error("加载用户数据失败");
    } finally {
      setInitialLoading(false);
    }
  };

  // 处理验光参数变化
  const handleOptometryChange = (params: OptometryParams) => {
    setOptometryParams(params);
  };

  const handleBack = () => {
    const returnTo = (location.state as any)?.returnTo;
    if (returnTo) {
      navigate(returnTo);
    } else {
      navigate("/list");
    }
  };

  const handleSubmit: FormProps<UserFormData>["onFinish"] = async (values) => {
    setLoading(true);
    try {
      const payload: UserFormData = {
        ...values,
        optometry: optometryParams,
      };
      // 模拟API调用
      await new Promise((resolve) => setTimeout(resolve, 1000));

      console.log("用户数据:", payload);
      message.success(isEditMode ? "用户更新成功！" : "用户创建成功！");

      // 检查是否有返回路径（从订单页跳转过来）
      const returnTo = (location.state as any)?.returnTo;
      if (returnTo && !isEditMode) {
        // 如果是新建用户且需要返回，则跳转回订单页并传递用户信息
        setTimeout(() => {
          navigate(returnTo, {
            state: {
              newUser: payload,
            },
          });
        }, 1500);
      } else {
        // 否则跳转到用户列表
        setTimeout(() => {
          navigate("/list");
        }, 1500);
      }
    } catch (error) {
      message.error(isEditMode ? "用户更新失败，请重试" : "用户创建失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    if (isEditMode) {
      // 编辑模式下，重置为原始数据
      loadUserData(id!);
    } else {
      // 新增模式下，清空表单
      form.resetFields();
      setOptometryParams(defaultOptometryParams);
      form.setFieldsValue({
        optometry: defaultOptometryParams,
      });
    }
  };

  if (initialLoading) {
    return <div>加载中...</div>;
  }

  return (
    <div className={styles.userPage}>
      <div className={styles.userPageHeader}>
        <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
          返回列表
        </Button>
        <h2>{isEditMode ? "编辑用户" : "新建用户"}</h2>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        className={styles.userPageForm}
        initialValues={{
          optometry: defaultOptometryParams,
        }}
      >
        <Row gutter={24}>
          {/* 左侧：用户基本信息 */}
          <Col xs={24} lg={12}>
            <Card title="用户信息" className={styles.formSectionCard}>
              <Form.Item
                label="用户ID"
                name="userId"
                rules={[
                  { required: true, message: "请输入用户ID" },
                  { pattern: /^[a-zA-Z0-9_]+$/, message: "用户ID只能包含字母、数字和下划线" },
                ]}
              >
                <Input placeholder="请输入用户ID" disabled={isEditMode} />
              </Form.Item>

              <Form.Item
                label="用户名"
                name="username"
                rules={[
                  { required: true, message: "请输入用户名" },
                  { min: 2, message: "用户名至少2个字符" },
                  { max: 50, message: "用户名最多50个字符" },
                ]}
              >
                <Input placeholder="请输入用户名" />
              </Form.Item>

              <Form.Item label="邮箱" name="email" rules={[{ type: "email", message: "请输入有效的邮箱地址" }]}>
                <Input placeholder="请输入邮箱（可选）" />
              </Form.Item>

              <Form.Item
                label="电话"
                name="phone"
                rules={[{ pattern: /^1[3-9]\d{9}$/, message: "请输入有效的手机号码" }]}
              >
                <Input placeholder="请输入电话（可选）" />
              </Form.Item>
            </Card>
          </Col>

          {/* 右侧：验光参数可视化 */}
          <Col xs={24} lg={12}>
            <Card title="验光参数" className={styles.formSectionCard}>
              <FaceDiagram params={optometryParams} />
            </Card>
          </Col>
        </Row>

        {/* 验光参数控制 */}
        <Card title="验光参数设置" className={styles.formSectionCard}>
          <OptometryControls params={optometryParams} onChange={handleOptometryChange} />
        </Card>

        <div className={styles.formActions}>
          <Button onClick={handleReset}>{isEditMode ? "重置" : "清空"}</Button>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>
            {isEditMode ? "更新用户" : "创建用户"}
          </Button>
        </div>
      </Form>
    </div>
  );
};

export default UserPage;
