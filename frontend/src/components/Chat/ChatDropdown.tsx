/**
 * 채팅 드롭다운 컴포넌트
 * 헤더에 표시되는 채팅 아이콘과 드롭다운 메뉴
 */

import React, { useEffect, useState } from 'react';
import { Badge, Drawer, List, Avatar, Empty, Spin, Typography, Button, Modal, Form, Input, Select } from 'antd';
import { MessageOutlined, PlusOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';

import { chatService } from '../../services/chat';
import { ChatRoom, RoomType, ChatRoomCreate } from '../../types/chat';

dayjs.extend(relativeTime);
dayjs.locale('ko');

const { Text } = Typography;

const ChatDropdown: React.FC = () => {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (dropdownVisible) {
      fetchRooms();
    }
  }, [dropdownVisible]);

  const fetchRooms = async () => {
    try {
      setLoading(true);
      const response = await chatService.getRooms(undefined, 0, 20);
      setRooms(response.rooms);

      // 읽지 않은 메시지 총 개수 계산
      const totalUnread = response.rooms.reduce((sum, room) => sum + (room.unread_count || 0), 0);
      setUnreadCount(totalUnread);
    } catch (error) {
      console.error('Failed to fetch rooms:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRoomClick = (room: ChatRoom) => {
    // 새 창으로 채팅방 열기
    const width = 460;
    const height = 700;
    const left = window.screen.width - width - 100;
    const top = 100;

    window.open(
      `/chat-window/${room.id}`,
      `chat_${room.id}`,
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,status=no,toolbar=no,menubar=no,location=no`
    );

    setDropdownVisible(false);
    fetchRooms(); // 읽지 않은 메시지 카운트 업데이트
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
      setCreateModalVisible(false);
      form.resetFields();

      // 새로 만든 채팅방 바로 열기
      const width = 460;
      const height = 700;
      const left = window.screen.width - width - 100;
      const top = 100;

      window.open(
        `/chat-window/${newRoom.id}`,
        `chat_${newRoom.id}`,
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,status=no,toolbar=no,menubar=no,location=no`
      );

      fetchRooms();
    } catch (error) {
      console.error('Failed to create room:', error);
    }
  };

  const getRoomIcon = (type: RoomType) => {
    switch (type) {
      case 'general':
        return <TeamOutlined style={{ color: '#1890ff' }} />;
      case 'direct':
        return <UserOutlined style={{ color: '#52c41a' }} />;
      case 'group':
        return <TeamOutlined style={{ color: '#722ed1' }} />;
      default:
        return <MessageOutlined style={{ color: '#faad14' }} />;
    }
  };

  return (
    <>
      <Badge count={unreadCount} offset={[-5, 5]}>
        <Button
          type="text"
          icon={<MessageOutlined style={{ fontSize: 20 }} />}
          onClick={() => {
            setDropdownVisible(true);
            fetchRooms();
          }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        />
      </Badge>

      <Drawer
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>채팅</span>
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => setCreateModalVisible(true)}
              style={{ backgroundColor: '#1a1d2e', borderColor: '#1a1d2e' }}
            >
              새 채팅
            </Button>
          </div>
        }
        placement="right"
        onClose={() => setDropdownVisible(false)}
        open={dropdownVisible}
        width={400}
      >
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Spin />
          </div>
        ) : rooms.length === 0 ? (
          <Empty
            description="참여 중인 채팅방이 없습니다"
            style={{ padding: 40 }}
          />
        ) : (
          <List
            dataSource={rooms}
            split={false}
            renderItem={(room) => (
              <List.Item
                style={{
                  padding: '16px 12px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f0f0f0',
                  marginBottom: 0,
                }}
                onClick={() => handleRoomClick(room)}
              >
                <List.Item.Meta
                  avatar={
                    <Avatar
                      size={48}
                      icon={getRoomIcon(room.type)}
                      style={{ backgroundColor: '#e6f7ff' }}
                    />
                  }
                  title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Text strong style={{ fontSize: 15 }}>
                        {room.name || '이름 없는 채팅방'}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {room.last_message ? dayjs(room.last_message.created_at).format('M월 D일') : ''}
                      </Text>
                    </div>
                  }
                  description={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text
                        ellipsis
                        style={{
                          color: '#666',
                          fontSize: 13,
                          flex: 1,
                        }}
                      >
                        {room.last_message ? room.last_message.message : '메시지가 없습니다'}
                      </Text>
                      {room.unread_count > 0 && (
                        <Badge
                          count={room.unread_count}
                          style={{
                            backgroundColor: '#1a1d2e',
                            marginLeft: 8,
                          }}
                        />
                      )}
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Drawer>

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
            rules={[{ required: true, message: '채팅방 유형을 선택하세요' }]}
          >
            <Select placeholder="유형 선택">
              <Select.Option value="general">전체 채팅</Select.Option>
              <Select.Option value="group">그룹 채팅</Select.Option>
              <Select.Option value="direct">1:1 다이렉트</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="name"
            label="채팅방 이름"
            rules={[{ required: true, message: '채팅방 이름을 입력하세요' }]}
          >
            <Input placeholder="채팅방 이름" />
          </Form.Item>

          <Form.Item name="description" label="설명">
            <Input.TextArea rows={3} placeholder="채팅방 설명 (선택사항)" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default ChatDropdown;
