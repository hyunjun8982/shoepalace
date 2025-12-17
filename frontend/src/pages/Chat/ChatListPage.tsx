/**
 * 채팅방 목록 페이지
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  List,
  Avatar,
  Badge,
  Button,
  Modal,
  Form,
  Input,
  Select,
  message,
  Tabs,
  Empty,
  Space,
  Tag,
} from 'antd';
import {
  MessageOutlined,
  TeamOutlined,
  UserOutlined,
  PlusOutlined,
  ShoppingCartOutlined,
  DollarOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';

import { chatService } from '../../services/chat';
import { ChatRoom, RoomType, ChatRoomCreate } from '../../types/chat';

dayjs.extend(relativeTime);
dayjs.locale('ko');

const ChatListPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchRooms();
  }, [activeTab]);

  const fetchRooms = async () => {
    try {
      setLoading(true);
      const type = activeTab === 'all' ? undefined : (activeTab as RoomType);
      const response = await chatService.getRooms(type);
      setRooms(response.rooms);
    } catch (error: any) {
      if (error.response?.status === 401) {
        message.error('로그인이 필요합니다.');
        navigate('/login');
      } else {
        message.error('채팅방 목록을 불러오는데 실패했습니다.');
        console.error('Failed to fetch rooms:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoom = async (values: any) => {
    try {
      const roomData: ChatRoomCreate = {
        name: values.name,
        type: values.type,
        description: values.description,
        participant_ids: values.participant_ids || [],
      };

      const newRoom = await chatService.createRoom(roomData);
      message.success('채팅방이 생성되었습니다.');
      setCreateModalVisible(false);
      form.resetFields();
      navigate(`/chat/${newRoom.id}`);
    } catch (error) {
      message.error('채팅방 생성에 실패했습니다.');
    }
  };

  const getRoomIcon = (type: RoomType) => {
    switch (type) {
      case RoomType.GENERAL:
        return <TeamOutlined />;
      case RoomType.DIRECT:
        return <UserOutlined />;
      case RoomType.GROUP:
        return <TeamOutlined />;
      case RoomType.PURCHASE:
        return <ShoppingCartOutlined />;
      case RoomType.SALE:
        return <DollarOutlined />;
      case RoomType.PRODUCT:
        return <AppstoreOutlined />;
      default:
        return <MessageOutlined />;
    }
  };

  const getRoomTypeTag = (type: RoomType) => {
    const typeMap: Record<RoomType, { color: string; text: string }> = {
      [RoomType.GENERAL]: { color: 'blue', text: '전체' },
      [RoomType.DIRECT]: { color: 'green', text: '1:1' },
      [RoomType.GROUP]: { color: 'purple', text: '그룹' },
      [RoomType.PURCHASE]: { color: 'orange', text: '구매' },
      [RoomType.SALE]: { color: 'cyan', text: '판매' },
      [RoomType.PRODUCT]: { color: 'magenta', text: '상품' },
    };

    const config = typeMap[type];
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const getRoomTitle = (room: ChatRoom) => {
    if (room.name) return room.name;

    if (room.type === RoomType.DIRECT) {
      const otherUser = room.participants.find((p) => p.user_id !== localStorage.getItem('user_id'));
      return otherUser?.user.full_name || '알 수 없음';
    }

    return `${room.type} 채팅방`;
  };

  const tabItems = [
    { key: 'all', label: '전체', icon: <MessageOutlined /> },
    { key: RoomType.GENERAL, label: '전체 채팅', icon: <TeamOutlined /> },
    { key: RoomType.DIRECT, label: '1:1 채팅', icon: <UserOutlined /> },
    { key: RoomType.GROUP, label: '그룹', icon: <TeamOutlined /> },
    { key: RoomType.PURCHASE, label: '구매', icon: <ShoppingCartOutlined /> },
    { key: RoomType.SALE, label: '판매', icon: <DollarOutlined /> },
    { key: RoomType.PRODUCT, label: '상품', icon: <AppstoreOutlined /> },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={
          <Space>
            <MessageOutlined />
            <span>채팅</span>
          </Space>
        }
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalVisible(true)}
          >
            새 채팅방
          </Button>
        }
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems.map((item) => ({
            key: item.key,
            label: (
              <span>
                {item.icon} {item.label}
              </span>
            ),
          }))}
        />

        <List
          loading={loading}
          dataSource={rooms}
          locale={{
            emptyText: (
              <Empty description="채팅방이 없습니다">
                <Button type="primary" onClick={() => setCreateModalVisible(true)}>
                  채팅방 만들기
                </Button>
              </Empty>
            ),
          }}
          renderItem={(room) => (
            <List.Item
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/chat/${room.id}`)}
            >
              <List.Item.Meta
                avatar={
                  <Badge count={room.unread_count} offset={[-5, 5]}>
                    <Avatar icon={getRoomIcon(room.type)} />
                  </Badge>
                }
                title={
                  <Space>
                    {getRoomTitle(room)}
                    {getRoomTypeTag(room.type)}
                    <span style={{ fontSize: 12, color: '#999' }}>
                      {room.participants.length}명
                    </span>
                  </Space>
                }
                description={
                  room.last_message ? (
                    <div style={{ color: '#666' }}>
                      <span style={{ fontWeight: room.unread_count > 0 ? 'bold' : 'normal' }}>
                        {room.last_message.user.full_name}:{' '}
                        {room.last_message.message.length > 50
                          ? room.last_message.message.substring(0, 50) + '...'
                          : room.last_message.message}
                      </span>
                      <span style={{ marginLeft: 8, fontSize: 12, color: '#999' }}>
                        {dayjs(room.last_message.created_at).fromNow()}
                      </span>
                    </div>
                  ) : (
                    <span style={{ color: '#999' }}>메시지가 없습니다</span>
                  )
                }
              />
            </List.Item>
          )}
        />
      </Card>

      {/* 채팅방 생성 모달 */}
      <Modal
        title="새 채팅방 만들기"
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        okText="생성"
        cancelText="취소"
      >
        <Form form={form} layout="vertical" onFinish={handleCreateRoom}>
          <Form.Item
            name="type"
            label="채팅방 유형"
            rules={[{ required: true, message: '채팅방 유형을 선택해주세요' }]}
          >
            <Select placeholder="유형 선택">
              <Select.Option value={RoomType.GENERAL}>전체 채팅</Select.Option>
              <Select.Option value={RoomType.GROUP}>그룹 채팅</Select.Option>
              <Select.Option value={RoomType.DIRECT}>1:1 채팅</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="name"
            label="채팅방 이름"
            rules={[{ required: true, message: '채팅방 이름을 입력해주세요' }]}
          >
            <Input placeholder="예: 구매팀 채팅방" />
          </Form.Item>

          <Form.Item name="description" label="설명">
            <Input.TextArea rows={3} placeholder="채팅방에 대한 간단한 설명" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ChatListPage;
