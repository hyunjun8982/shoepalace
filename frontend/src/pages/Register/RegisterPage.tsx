import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, message, Space, App } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, IdcardOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { userService } from '../../services/user';
import { UserCreate, UserRole } from '../../types/user';

const { Text } = Typography;

const RegisterPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { message: messageApi } = App.useApp();

  const onFinish = async (values: any) => {
    try {
      setLoading(true);

      const userData: UserCreate = {
        username: values.username,
        email: values.email,
        password: values.password,
        full_name: values.full_name,
        role: UserRole.BUYER, // 기본 역할: 구매자
        is_active: true,
      };

      await userService.register(userData);
      messageApi.success('회원가입이 완료되었습니다. 로그인해주세요.');
      navigate('/login');
    } catch (error: any) {
      messageApi.error(error.response?.data?.detail || '회원가입 실패');
    } finally {
      setLoading(false);
    }
  };

  const validatePassword = (_: any, value: string) => {
    if (!value) {
      return Promise.reject('비밀번호를 입력해주세요.');
    }
    if (value.length < 6) {
      return Promise.reject('비밀번호는 최소 6자 이상이어야 합니다.');
    }
    return Promise.resolve();
  };

  const validateConfirmPassword = (_: any, value: string) => {
    if (!value) {
      return Promise.reject('비밀번호를 다시 입력해주세요.');
    }
    if (value !== form.getFieldValue('password')) {
      return Promise.reject('비밀번호가 일치하지 않습니다.');
    }
    return Promise.resolve();
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#1a1d2e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <Card
        style={{
          width: 400,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          borderRadius: 8,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src="/images/logo.png"
            alt="로고"
            style={{ height: 120, marginBottom: 24 }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <Text style={{ display: 'block', fontSize: 18, fontWeight: 500, color: '#262626' }}>회원가입</Text>
        </div>

        <Form
          form={form}
          name="register"
          onFinish={onFinish}
          layout="vertical"
          requiredMark={false}
        >
          <Form.Item
            name="username"
            label="아이디"
            rules={[
              { required: true, message: '아이디를 입력해주세요.' },
              { min: 3, message: '최소 3자 이상 입력해주세요.' },
              { max: 50, message: '최대 50자까지 입력 가능합니다.' },
              { pattern: /^[a-zA-Z0-9_]+$/, message: '영문, 숫자, _ 만 사용 가능합니다.' },
            ]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="아이디"
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="full_name"
            label="이름"
            rules={[
              { required: true, message: '이름을 입력해주세요.' },
              { max: 100, message: '최대 100자까지 입력 가능합니다.' },
            ]}
          >
            <Input
              prefix={<IdcardOutlined />}
              placeholder="이름"
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="email"
            label="이메일"
            rules={[
              { required: true, message: '이메일을 입력해주세요.' },
              { type: 'email', message: '올바른 이메일 형식이 아닙니다.' },
              { max: 100, message: '최대 100자까지 입력 가능합니다.' },
            ]}
          >
            <Input
              prefix={<MailOutlined />}
              placeholder="이메일"
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="password"
            label="비밀번호"
            rules={[{ validator: validatePassword }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="비밀번호 (최소 6자)"
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label="비밀번호 확인"
            dependencies={['password']}
            rules={[{ validator: validateConfirmPassword }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="비밀번호 확인"
              size="large"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              size="large"
              block
              style={{
                height: 48,
                borderRadius: 6,
              }}
            >
              회원가입
            </Button>
          </Form.Item>
        </Form>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <Space>
            <Text type="secondary">이미 계정이 있으신가요?</Text>
            <Button type="link" onClick={() => navigate('/login')} style={{ padding: 0 }}>
              로그인
            </Button>
          </Space>
        </div>
      </Card>
    </div>
  );
};

export default RegisterPage;