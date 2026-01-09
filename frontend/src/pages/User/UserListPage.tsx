import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  Card,
  Button,
  Space,
  Tag,
  Select,
  Input,
  Popconfirm,
  App,
  Row,
  Col,
  Switch,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { UserRole } from '../../types/user';
import { User } from '../../types';
import { userService } from '../../services/user';
import { authService } from '../../services/auth';
import dayjs from 'dayjs';

const { Option } = Select;

const UserListPage: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [searchText, setSearchText] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | undefined>();
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>();
  const [currentUser, setCurrentUser] = useState<User | null>(null);

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

  // 사용자 목록 조회
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = {
        ...(searchText && { search: searchText }),
        ...(roleFilter && { role: roleFilter }),
        ...(activeFilter !== undefined && { is_active: activeFilter }),
      };

      const data = await userService.getUsers(params);
      setUsers(data);
    } catch (error) {
      message.error('사용자 목록 조회 실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [searchText, roleFilter, activeFilter]);

  // 사용자 삭제
  const handleDelete = async (id: string) => {
    try {
      await userService.deleteUser(id);
      message.success('사용자 삭제 완료');
      fetchUsers();
    } catch (error) {
      message.error('사용자 삭제 실패');
    }
  };

  // 활성화 상태 변경
  const handleToggleActive = async (userId: string, isActive: boolean) => {
    try {
      await userService.updateUser(userId, { is_active: isActive });
      message.success(`사용자 ${isActive ? '활성화' : '비활성화'} 완료`);
      fetchUsers();
    } catch (error) {
      message.error('상태 변경 실패');
    }
  };

  // 테이블 컬럼 정의
  const columns = [
    {
      title: '아이디',
      dataIndex: 'username',
      key: 'username',
      width: 120,
    },
    {
      title: '이름',
      dataIndex: 'full_name',
      key: 'full_name',
      width: 120,
    },
    {
      title: '이메일',
      dataIndex: 'email',
      key: 'email',
      width: 200,
    },
    {
      title: '역할',
      dataIndex: 'role',
      key: 'role',
      width: 100,
      render: (role: string) => {
        const roleMap: Record<string, { text: string; color: string }> = {
          admin: { text: '관리자', color: 'red' },
          buyer: { text: '구매자', color: 'blue' },
          seller: { text: '판매자', color: 'green' },
        };
        const config = roleMap[role];
        return <Tag color={config?.color}>{config?.text}</Tag>;
      },
    },
    {
      title: '상태',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (isActive: boolean, record: User) => (
        <Switch
          checked={isActive}
          onChange={(checked) => handleToggleActive(record.id, checked)}
          checkedChildren="활성"
          unCheckedChildren="비활성"
          disabled={currentUser?.role !== 'admin' || currentUser?.id === record.id}
        />
      ),
    },
    {
      title: '가입일',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '작업',
      key: 'action',
      width: 120,
      render: (_: any, record: User) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/users/${record.id}`)}
          />
          {currentUser?.role === 'admin' && currentUser?.id !== record.id && (
            <Popconfirm
              title="정말 삭제하시겠습니까?"
              onConfirm={() => handleDelete(record.id)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        {/* 필터 영역 */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Input
              placeholder="아이디, 이름, 이메일 검색"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          <Col span={4}>
            <Select
              style={{ width: '100%' }}
              placeholder="역할"
              allowClear
              value={roleFilter}
              onChange={setRoleFilter}
            >
              <Option value="admin">관리자</Option>
              <Option value="buyer">구매자</Option>
              <Option value="seller">판매자</Option>
            </Select>
          </Col>
          <Col span={4}>
            <Select
              style={{ width: '100%' }}
              placeholder="상태"
              allowClear
              value={activeFilter}
              onChange={setActiveFilter}
            >
              <Option value={true}>활성</Option>
              <Option value={false}>비활성</Option>
            </Select>
          </Col>
          <Col span={10} style={{ textAlign: 'right' }}>
            {currentUser?.role === 'admin' && (
              <Button
                type="primary"
                icon={<UserAddOutlined />}
                onClick={() => navigate('/users/new')}
                style={{ backgroundColor: '#0d1117', borderColor: '#0d1117' }}
              >
                사용자 등록
              </Button>
            )}
          </Col>
        </Row>

        {/* 테이블 */}
        <Table
          loading={loading}
          columns={columns}
          dataSource={users}
          rowKey="id"
          pagination={{
            showSizeChanger: true,
            showTotal: (total) => `총 ${total}명`,
          }}
        />
      </Card>
    </div>
  );
};

export default UserListPage;