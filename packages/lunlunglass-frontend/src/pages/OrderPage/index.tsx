import { useState, useEffect } from "react";
import { Form, Input, InputNumber, Select, Button, Card, Row, Col, message, Space } from "antd";
import { ArrowLeftOutlined, SaveOutlined, UserAddOutlined, PlusOutlined, MinusCircleOutlined } from "@ant-design/icons";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import type { FormProps } from "antd";
import type { User, OrderFormData } from "@/types";
import styles from "./index.module.scss";

const { Option } = Select;

const OrderPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id?: string }>();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [userOptions, setUserOptions] = useState<User[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>();

  // 模拟搜索用户
  const searchUsers = async (searchText?: string) => {
    setUserSearchLoading(true);
    try {
      // 模拟API调用
      await new Promise((resolve) => setTimeout(resolve, 300));

      // 模拟数据
      const mockUsers: User[] = Array.from({ length: 20 }, (_, i) => {
        const index = i + 1;
        return {
          id: `user_${index}`,
          userId: `user_${index}`,
          username: searchText ? `${searchText}_${index}` : `用户${index}`,
          email: `user${index}@example.com`,
          phone: `138${String(index).padStart(8, "0")}`,
        };
      });

      setUserOptions(mockUsers);
    } catch (error) {
      message.error("搜索用户失败");
    } finally {
      setUserSearchLoading(false);
    }
  };

  // 处理从用户页返回的情况
  useEffect(() => {
    if (!id && location.state?.newUser) {
      const newUser = location.state.newUser;
      form.setFieldsValue({
        userInfo: {
          userId: newUser.userId,
          username: newUser.username,
          email: newUser.email,
          phone: newUser.phone,
        },
      });
      setSelectedUserId(newUser.userId);
      // 清除state，避免刷新时重复填充
      window.history.replaceState({}, document.title);
    }
  }, [location.state, id, form]);

  // 判断是新增还是编辑模式
  useEffect(() => {
    if (id) {
      setIsEditMode(true);
      loadOrderData(id);
    } else {
      setIsEditMode(false);
      form.setFieldsValue({
        orderInfo: {
          items: [
            {
              productId: "",
              quantity: 1,
              price: 0,
            },
          ],
          status: "pending",
        },
      });
      // 初始化时加载用户列表
      searchUsers();
    }
  }, [id]);

  // 加载订单数据（编辑模式）
  const loadOrderData = async (orderId: string) => {
    setInitialLoading(true);
    try {
      // 模拟API调用
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 模拟数据
      const mockOrderData: OrderFormData = {
        userInfo: {
          userId: `user_${orderId}`,
          username: `用户${orderId}`,
          email: `user${orderId}@example.com`,
          phone: `138${String(orderId).padStart(8, "0")}`,
        },
        orderInfo: {
          items: [
            {
              productId: `prod_${orderId}_1`,
              quantity: 2,
              price: 199.99,
            },
            {
              productId: `prod_${orderId}_2`,
              quantity: 1,
              price: 299.99,
            },
          ],
          status: "pending",
          remark: "备注信息",
        },
      };

      form.setFieldsValue(mockOrderData);
    } catch (error) {
      message.error("加载订单数据失败");
    } finally {
      setInitialLoading(false);
    }
  };

  const handleBack = () => {
    navigate("/list");
  };

  const handleSubmit: FormProps<OrderFormData>["onFinish"] = async (values) => {
    setLoading(true);
    try {
      // 模拟API调用
      await new Promise((resolve) => setTimeout(resolve, 1000));

      console.log("订单数据:", values);
      message.success(isEditMode ? "订单更新成功！" : "订单创建成功！");

      // 跳转到订单列表
      setTimeout(() => {
        navigate("/list");
      }, 1500);
    } catch (error) {
      message.error(isEditMode ? "订单更新失败，请重试" : "订单创建失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    if (isEditMode) {
      // 编辑模式下，重置为原始数据
      loadOrderData(id!);
    } else {
      // 新增模式下，清空表单
      form.resetFields();
      form.setFieldsValue({
        orderInfo: {
          items: [
            {
              productId: "",
              quantity: 1,
              price: 0,
            },
          ],
          status: "pending",
        },
      });
      setSelectedUserId(undefined);
    }
  };

  // 处理用户选择
  const handleUserSelect = (userId: string | null) => {
    if (userId) {
      setSelectedUserId(userId);
      const selectedUser = userOptions.find((u) => u.userId === userId);
      if (selectedUser) {
        form.setFieldsValue({
          userInfo: {
            userId: selectedUser.userId,
            username: selectedUser.username,
            email: selectedUser.email,
            phone: selectedUser.phone,
          },
        });
      }
    } else {
      // 清空选择
      setSelectedUserId(undefined);
      form.setFieldsValue({
        userInfo: {
          userId: undefined,
          username: undefined,
          email: undefined,
          phone: undefined,
        },
      });
    }
  };

  // 处理用户搜索
  const handleUserSearch = (value: string) => {
    if (value) {
      searchUsers(value);
    } else {
      searchUsers();
    }
  };

  // 跳转到新建用户页
  const handleCreateNewUser = () => {
    navigate("/user", {
      state: {
        returnTo: "/order",
      },
    });
  };

  // 监听商品项变化，计算总金额
  const items = Form.useWatch(["orderInfo", "items"], form) || [];
  const totalAmount = items
    .reduce((sum: number, item: any) => {
      const quantity = item?.quantity || 0;
      const price = item?.price || 0;
      return sum + quantity * price;
    }, 0)
    .toFixed(2);

  if (initialLoading) {
    return <div>加载中...</div>;
  }

  return (
    <div className={styles.orderPage}>
      <div className={styles.orderPageHeader}>
        <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
          返回列表
        </Button>
        <h2>{isEditMode ? "编辑订单" : "新建订单"}</h2>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        className={styles.orderPageForm}
        initialValues={{
          orderInfo: {
            items: [
              {
                productId: "",
                quantity: 1,
                price: 0,
              },
            ],
            status: "pending",
          },
        }}
      >
        <Row gutter={24}>
          {/* 用户信息 */}
          <Col xs={24} lg={12}>
            <Card title="用户信息" className={styles.formSectionCard}>
              {!isEditMode && (
                <Form.Item label="关联用户" className={styles.userSelectorItem}>
                  <Space.Compact style={{ width: "100%" }}>
                    <Select
                      showSearch
                      placeholder="搜索并选择用户"
                      value={selectedUserId}
                      onChange={handleUserSelect}
                      onSearch={handleUserSearch}
                      loading={userSearchLoading}
                      style={{ flex: 1 }}
                      filterOption={false}
                      allowClear
                      notFoundContent={userSearchLoading ? "搜索中..." : "暂无数据"}
                    >
                      {userOptions.map((user) => (
                        <Option key={user.id} value={user.userId}>
                          {user.username} ({user.userId})
                        </Option>
                      ))}
                    </Select>
                    <Button icon={<UserAddOutlined />} onClick={handleCreateNewUser} type="primary">
                      新建用户
                    </Button>
                  </Space.Compact>
                </Form.Item>
              )}

              <Form.Item
                label="用户ID"
                name={["userInfo", "userId"]}
                rules={[
                  { required: true, message: "请输入用户ID" },
                  { pattern: /^[a-zA-Z0-9_]+$/, message: "用户ID只能包含字母、数字和下划线" },
                ]}
              >
                <Input placeholder="请输入用户ID" disabled={!isEditMode && !!selectedUserId} />
              </Form.Item>

              <Form.Item
                label="用户名"
                name={["userInfo", "username"]}
                rules={[
                  { required: true, message: "请输入用户名" },
                  { min: 2, message: "用户名至少2个字符" },
                  { max: 50, message: "用户名最多50个字符" },
                ]}
              >
                <Input placeholder="请输入用户名" disabled={!isEditMode && !!selectedUserId} />
              </Form.Item>

              <Form.Item
                label="邮箱"
                name={["userInfo", "email"]}
                rules={[{ type: "email", message: "请输入有效的邮箱地址" }]}
              >
                <Input placeholder="请输入邮箱（可选）" disabled={!isEditMode && !!selectedUserId} />
              </Form.Item>

              <Form.Item
                label="电话"
                name={["userInfo", "phone"]}
                rules={[{ pattern: /^1[3-9]\d{9}$/, message: "请输入有效的手机号码" }]}
              >
                <Input placeholder="请输入电话（可选）" disabled={!isEditMode && !!selectedUserId} />
              </Form.Item>
            </Card>
          </Col>

          {/* 订单信息 */}
          <Col xs={24} lg={12}>
            <Card title="订单信息" className={styles.formSectionCard}>
              <Form.List name={["orderInfo", "items"]}>
                {(fields, { add, remove }) => (
                  <>
                    {fields.map(({ key, name, ...restField }) => (
                      <div key={key} className={styles.orderItem}>
                        <Row gutter={16} align="middle">
                          <Col span={24}>
                            <Form.Item
                              {...restField}
                              label="商品ID"
                              name={[name, "productId"]}
                              rules={[{ required: true, message: "请选择商品" }]}
                            >
                              <Input placeholder="请选择商品" />
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <Form.Item
                              {...restField}
                              label="数量"
                              name={[name, "quantity"]}
                              rules={[
                                { required: true, message: "请输入数量" },
                                { type: "number", min: 1, message: "数量至少为1" },
                              ]}
                            >
                              <InputNumber placeholder="数量" min={1} style={{ width: "100%" }} />
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <Form.Item
                              {...restField}
                              label="单价（元）"
                              name={[name, "price"]}
                              rules={[
                                { required: true, message: "请输入单价" },
                                { type: "number", min: 0.01, message: "单价必须大于0" },
                              ]}
                            >
                              <InputNumber
                                placeholder="单价"
                                min={0.01}
                                step={0.01}
                                precision={2}
                                style={{ width: "100%" }}
                              />
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <Form.Item label=" " colon={false}>
                              <Button
                                type="link"
                                danger
                                icon={<MinusCircleOutlined />}
                                onClick={() => remove(name)}
                                disabled={fields.length === 1}
                              >
                                删除
                              </Button>
                            </Form.Item>
                          </Col>
                        </Row>
                      </div>
                    ))}
                    <Form.Item>
                      <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                        添加商品
                      </Button>
                    </Form.Item>
                  </>
                )}
              </Form.List>

              <Form.Item label="总金额">
                <Input value={`¥${totalAmount}`} disabled className={styles.totalAmountInput} />
              </Form.Item>

              <Form.Item
                label="订单状态"
                name={["orderInfo", "status"]}
                rules={[{ required: true, message: "请选择订单状态" }]}
              >
                <Select placeholder="请选择订单状态">
                  <Option value="pending">待处理</Option>
                  <Option value="processing">处理中</Option>
                  <Option value="completed">已完成</Option>
                  <Option value="cancelled">已取消</Option>
                </Select>
              </Form.Item>

              <Form.Item label="备注" name={["orderInfo", "remark"]}>
                <Input.TextArea placeholder="请输入备注（可选）" rows={4} maxLength={500} showCount />
              </Form.Item>
            </Card>
          </Col>
        </Row>

        <div className={styles.formActions}>
          <Button onClick={handleReset}>{isEditMode ? "重置" : "清空"}</Button>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>
            {isEditMode ? "更新订单" : "创建订单"}
          </Button>
        </div>
      </Form>
    </div>
  );
};

export default OrderPage;
