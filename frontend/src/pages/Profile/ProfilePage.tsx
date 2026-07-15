import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Tabs, message, Divider } from 'antd';
import { LockOutlined, UserOutlined, MailOutlined, SaveOutlined, CopyOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import { userService } from '../../services/user';
import type { TabsProps } from 'antd';

const ProfilePage: React.FC = () => {
  const { user: currentUser, login } = useAuth();
  const [form] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    if (currentUser) {
      form.setFieldsValue({
        full_name: currentUser.full_name,
        email: currentUser.email,
        username: currentUser.username,
      });
    }
  }, [currentUser, form]);

  const handleProfileUpdate = async (values: any) => {
    if (!currentUser) return;

    setLoading(true);
    try {
      await userService.updateUser(currentUser.id, {
        full_name: values.full_name,
        email: values.email,
      });

      message.success('프로필이 업데이트되었습니다.');
    } catch (error: any) {
      message.error(error.response?.data?.detail || '프로필 업데이트 실패');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (values: any) => {
    if (!currentUser) return;

    if (values.new_password !== values.confirm_password) {
      message.error('새 비밀번호가 일치하지 않습니다.');
      return;
    }

    if (values.current_password === values.new_password) {
      message.error('새 비밀번호는 현재 비밀번호와 달라야 합니다.');
      return;
    }

    setPasswordLoading(true);
    try {
      await userService.changePassword(
        currentUser.id,
        values.current_password,
        values.new_password
      );

      message.success('비밀번호가 변경되었습니다.');
      passwordForm.resetFields();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '비밀번호 변경 실패');
    } finally {
      setPasswordLoading(false);
    }
  };

  const tabItems: TabsProps['items'] = [
    {
      key: '1',
      label: '기본 정보',
      children: (
        <div style={{ paddingTop: 24 }}>
          <Form
            form={form}
            layout="vertical"
            onFinish={handleProfileUpdate}
          >
            <Form.Item
              label={
                <span style={{ fontSize: 13, fontWeight: 500, color: '#333' }}>
                  아이디
                </span>
              }
              name="username"
            >
              <Input
                prefix={<UserOutlined style={{ color: '#1890ff' }} />}
                disabled
                placeholder="아이디"
                style={{
                  backgroundColor: '#fafafa',
                  borderRadius: '6px',
                  fontSize: 13,
                }}
              />
            </Form.Item>

            <Form.Item
              label={
                <span style={{ fontSize: 13, fontWeight: 500, color: '#333' }}>
                  이름
                </span>
              }
              name="full_name"
              rules={[
                { required: true, message: '이름을 입력해주세요' },
                { min: 2, message: '이름은 최소 2자 이상이어야 합니다' },
              ]}
            >
              <Input
                placeholder="이름을 입력해주세요"
                style={{
                  borderRadius: '6px',
                  fontSize: 13,
                }}
              />
            </Form.Item>

            <Form.Item
              label={
                <span style={{ fontSize: 13, fontWeight: 500, color: '#333' }}>
                  이메일
                </span>
              }
              name="email"
              rules={[
                { required: true, message: '이메일을 입력해주세요' },
                { type: 'email', message: '올바른 이메일 형식이 아닙니다' },
              ]}
            >
              <Input
                prefix={<MailOutlined style={{ color: '#1890ff' }} />}
                placeholder="이메일을 입력해주세요"
                type="email"
                style={{
                  borderRadius: '6px',
                  fontSize: 13,
                }}
              />
            </Form.Item>

            <Form.Item style={{ marginTop: 32 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                icon={<SaveOutlined />}
                block
                size="large"
                style={{
                  borderRadius: '6px',
                  fontSize: 14,
                  fontWeight: 500,
                  height: 40,
                }}
              >
                저장
              </Button>
            </Form.Item>
          </Form>
        </div>
      ),
    },
    {
      key: '2',
      label: '비밀번호 변경',
      children: (
        <div style={{ paddingTop: 24 }}>
          <Form
            form={passwordForm}
            layout="vertical"
            onFinish={handlePasswordChange}
          >
            <Form.Item
              label={
                <span style={{ fontSize: 13, fontWeight: 500, color: '#333' }}>
                  현재 비밀번호
                </span>
              }
              name="current_password"
              rules={[
                { required: true, message: '현재 비밀번호를 입력해주세요' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#1890ff' }} />}
                placeholder="현재 비밀번호를 입력해주세요"
                style={{
                  borderRadius: '6px',
                  fontSize: 13,
                }}
              />
            </Form.Item>

            <Form.Item
              label={
                <span style={{ fontSize: 13, fontWeight: 500, color: '#333' }}>
                  새 비밀번호
                </span>
              }
              name="new_password"
              rules={[
                { required: true, message: '새 비밀번호를 입력해주세요' },
                { min: 8, message: '비밀번호는 최소 8자 이상이어야 합니다' },
                {
                  pattern: /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])/,
                  message: '비밀번호는 영문, 숫자, 특수문자를 포함해야 합니다',
                },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#1890ff' }} />}
                placeholder="새 비밀번호를 입력해주세요"
                style={{
                  borderRadius: '6px',
                  fontSize: 13,
                }}
              />
            </Form.Item>

            <Form.Item
              label={
                <span style={{ fontSize: 13, fontWeight: 500, color: '#333' }}>
                  새 비밀번호 확인
                </span>
              }
              name="confirm_password"
              rules={[
                { required: true, message: '비밀번호 확인을 입력해주세요' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#1890ff' }} />}
                placeholder="새 비밀번호를 다시 입력해주세요"
                style={{
                  borderRadius: '6px',
                  fontSize: 13,
                }}
              />
            </Form.Item>

            <Divider style={{ margin: '24px 0' }} />

            <div
              style={{
                padding: '16px',
                backgroundColor: '#f6f8fb',
                borderRadius: '8px',
                border: '1px solid #e1e8ed',
                marginBottom: 24,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: '#333', marginBottom: 12 }}>
                ✓ 비밀번호 요구사항:
              </div>
              <div style={{ fontSize: 12, color: '#666', lineHeight: '1.8' }}>
                • 최소 8자 이상<br />
                • 영문 대/소문자 포함<br />
                • 숫자 포함<br />
                • 특수문자(@$!%*?&) 포함
              </div>
            </div>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={passwordLoading}
                icon={<SaveOutlined />}
                block
                size="large"
                style={{
                  borderRadius: '6px',
                  fontSize: 14,
                  fontWeight: 500,
                  height: 40,
                }}
              >
                비밀번호 변경
              </Button>
            </Form.Item>
          </Form>
        </div>
      ),
    },
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#f5f7fa',
        padding: '32px 24px',
      }}
    >
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        {/* 카드 */}
        <Card
          bordered={false}
          style={{
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
            backgroundColor: '#ffffff',
          }}
        >
          <Tabs
            items={tabItems}
            style={{ marginTop: 0 }}
            tabBarStyle={{
              borderBottomColor: '#f0f0f0',
              marginBottom: 0,
            }}
          />
        </Card>
      </div>
    </div>
  );
};

export default ProfilePage;
