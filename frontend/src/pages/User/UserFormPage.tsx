import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Card,
  Form,
  Input,
  Select,
  Switch,
  Button,
  Space,
  App,
  Row,
  Col,
  Divider,
} from 'antd';
import { SaveOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { UserCreate, UserUpdate, UserRole } from '../../types/user';
import { User } from '../../types';
import { userService } from '../../services/user';
import { authService } from '../../services/auth';

const { Option } = Select;

const UserFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const isEdit = !!id && id !== 'new';

  // 현재 사용자 정보 조회
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const user = await authService.getCurrentUser();
        setCurrentUser(user);
      } catch (error) {
        console.error('Failed to fetch current user:', error);
      }
    };
    fetchCurrentUser();
  }, []);

  // 수정 모드일 때 사용자 정보 조회
  useEffect(() => {
    if (isEdit) {
      fetchUser();
    }
  }, [id]);

  const fetchUser = async () => {
    if (!id || id === 'new') return;

    setLoading(true);
    try {
      const user = await userService.getUser(id);
      setEditingUser(user);
      form.setFieldsValue({
        ...user,
        password: undefined, // 비밀번호는 표시하지 않음
      });
    } catch (error) {
      message.error('사용자 정보 조회 실패');
      navigate('/users');
    } finally {
      setLoading(false);
    }
  };

  // 폼 제출
  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      if (isEdit) {
        // 수정 모드
        const updateData: UserUpdate = {
          username: values.username,
          email: values.email,
          full_name: values.full_name,
          role: values.role,
          is_active: values.is_active,
        };

        // 비밀번호는 입력된 경우에만 포함
        if (values.password) {
          updateData.password = values.password;
        }

        await userService.updateUser(id, updateData);
        message.success('사용자 정보가 수정되었습니다.');
      } else {
        // 생성 모드
        const createData: UserCreate = {
          username: values.username,
          email: values.email,
          password: values.password,
          full_name: values.full_name,
          role: values.role,
          is_active: values.is_active,
        };

        await userService.createUser(createData);
        message.success('사용자가 등록되었습니다.');
      }
      navigate('/users');
    } catch (error: any) {
      message.error(error.response?.data?.detail || '저장 실패');
    } finally {
      setLoading(false);
    }
  };

  // 권한 체크: 관리자만 역할과 활성화 상태 변경 가능
  const isAdmin = currentUser?.role === 'admin';
  const isSelf = currentUser?.id === id;

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <h2>{isEdit ? '사용자 정보 수정' : '사용자 등록'}</h2>
        <Divider />

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            role: UserRole.BUYER,
            is_active: true,
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="아이디"
                name="username"
                rules={[
                  { required: true, message: '아이디를 입력해주세요' },
                  { min: 3, message: '최소 3자 이상 입력해주세요' },
                  { max: 50, message: '최대 50자까지 입력 가능합니다' },
                  { pattern: /^[a-zA-Z0-9_]+$/, message: '영문, 숫자, _ 만 사용 가능합니다' },
                ]}
              >
                <Input placeholder="아이디" disabled={isEdit} />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                label="이름"
                name="full_name"
                rules={[
                  { required: true, message: '이름을 입력해주세요' },
                  { max: 100, message: '최대 100자까지 입력 가능합니다' },
                ]}
              >
                <Input placeholder="이름" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="이메일"
                name="email"
                rules={[
                  { required: true, message: '이메일을 입력해주세요' },
                  { type: 'email', message: '올바른 이메일 형식이 아닙니다' },
                  { max: 100, message: '최대 100자까지 입력 가능합니다' },
                ]}
              >
                <Input placeholder="이메일" />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                label={isEdit ? '비밀번호 (변경시에만 입력)' : '비밀번호'}
                name="password"
                rules={[
                  { required: !isEdit, message: '비밀번호를 입력해주세요' },
                  { min: 6, message: '최소 6자 이상 입력해주세요' },
                ]}
              >
                <Input.Password placeholder="비밀번호" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="역할"
                name="role"
                rules={[{ required: true, message: '역할을 선택해주세요' }]}
              >
                <Select
                  placeholder="역할 선택"
                  disabled={!isAdmin || (isEdit && isSelf)}
                >
                  <Option value={UserRole.ADMIN}>관리자</Option>
                  <Option value={UserRole.BUYER}>구매자</Option>
                  <Option value={UserRole.SELLER}>판매자</Option>
                </Select>
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                label="계정 상태"
                name="is_active"
                valuePropName="checked"
              >
                <Switch
                  checkedChildren="활성"
                  unCheckedChildren="비활성"
                  disabled={!isAdmin || (isEdit && isSelf)}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider />

          <Space>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              icon={<SaveOutlined />}
              style={{ backgroundColor: '#0d1117', borderColor: '#0d1117' }}
            >
              {isEdit ? '수정' : '등록'}
            </Button>
            <Button onClick={() => navigate('/users')} icon={<ArrowLeftOutlined />}>
              목록으로
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
};

export default UserFormPage;