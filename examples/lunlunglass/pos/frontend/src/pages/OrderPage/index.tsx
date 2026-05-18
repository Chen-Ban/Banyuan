import { useState, useEffect, useCallback } from "react";
import { Form, Input, InputNumber, Select, Button, Card, Row, Col, message, Space } from "antd";
import { ArrowLeftOutlined, SaveOutlined, UserAddOutlined, PlusOutlined, MinusCircleOutlined } from "@ant-design/icons";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import type { FormProps } from "antd";
import { userApi, orderApi } from "@/api";
import PrintButton from "@/components/PrintButton";
import { getErrorMessage } from "@/utils/error";
import type { User, OrderFormData } from "@/types";
import styles from "./index.module.scss";

const { Option } = Select;

interface OrderItemFormValue {
  productId?: string;
  quantity?: number;
  price?: number;
}

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

  // 搜索用户
  const searchUsers = useCallback(async (searchText?: string) => {
    setUserSearchLoading(true);
    try {
      const res = await userApi.searchUsers(searchText || '');
      setUserOptions(res.data.users);
    } catch {
      message.error("搜索用户失败");
    } finally {
      setUserSearchLoading(false);
    }
  }, []);

  // 加载订单数据（编辑模式）
  const loadOrderData = useCallback(async (orderId: string) => {
    setInitialLoading(true);
    try {
      const res = await orderApi.fetchOrder(orderId);
      const order = res.data!;

      const orderFormData: OrderFormData = {
        userInfo: {
          userId: order.userId,
          username: order.username,
        },
        orderInfo: {
          items: order.items.map(item => ({
            productId: item.product.id,
            quantity: item.quantity,
            price: item.price,
          })),
          status: order.status,
        },
      };

      form.setFieldsValue(orderFormData);
    } catch {
      message.error("加载订单数据失败");
    } finally {
      setInitialLoading(false);
    }
  }, [form]);

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
          items: [{ productId: "", quantity: 1, price: 0 }],
          status: "pending",
        },
      });
      searchUsers();
    }
  }, [id, form, loadOrderData, searchUsers]);

  const handleBack = () => {
    navigate("/list");
  };

  const handleSubmit: FormProps<OrderFormData>["onFinish"] = async (values) => {
    setLoading(true);
    try {
      if (isEditMode) {
        await orderApi.updateOrder(id!, values);
        message.success("订单更新成功！");
      } else {
        await orderApi.createOrder(values);
        message.success("订单创建成功！");
      }
      setTimeout(() => { navigate("/list"); }, 1000);
    } catch (error: unknown) {
      message.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    if (isEditMode) {
      loadOrderData(id!);
    } else {
      form.resetFields();
      form.setFieldsValue({
        orderInfo: {
          items: [{ productId: "", quantity: 1, price: 0 }],
          status: "pending",
        },
      });
      setSelectedUserId(undefined);
    }
  };

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
      setSelectedUserId(undefined);
      form.setFieldsValue({
        userInfo: { userId: undefined, username: undefined, email: undefined, phone: undefined },
      });
    }
  };

  const handleUserSearch = (value: string) => {
    searchUsers(value || undefined);
  };

  const handleCreateNewUser = () => {
    navigate("/user", { state: { returnTo: "/order" } });
  };

  const items: OrderItemFormValue[] = Form.useWatch(["orderInfo", "items"], form) || [];
  const totalAmount = items
    .reduce((sum: number, item: OrderItemFormValue | undefined) => {
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
        {/* 打印按钮：仅编辑模式（已有订单）显示 */}
        {isEditMode && id && (
          <PrintButton
            orderId={id}
            className={styles.printBtn}
          />
        )}
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        className={styles.orderPageForm}
        initialValues={{
          orderInfo: {
            items: [{ productId: "", quantity: 1, price: 0 }],
            status: "pending",
          },
        }}
      >
        <Row gutter={24}>
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
                        <Option key={user.userId} value={user.userId}>
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
                <Input value={`\u00A5${totalAmount}`} disabled className={styles.totalAmountInput} />
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
