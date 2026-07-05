import React, { useState, useEffect } from 'react';
import {
  Card as AntCard,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  AutoComplete,
  App,
  Tag,
  Popconfirm,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { Card, CardType, CARD_ISSUER_LABELS, CARD_TYPE_LABELS } from '../../types/card';
import { cardService } from '../../services/card';

const { Option } = Select;

const CardManagePage: React.FC = () => {
  const { message } = App.useApp();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchCards();
  }, []);

  const fetchCards = async () => {
    try {
      setLoading(true);
      const data = await cardService.getCards({ limit: 1000, is_active: true });
      setCards(data.items);
    } catch (error: any) {
      message.error(error.message || '카드 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCard = () => {
    setEditingCard(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleEditCard = (card: Card) => {
    setEditingCard(card);
    form.setFieldsValue({
      card_type: card.card_type,
      card_issuer: card.card_issuer,
      card_number: card.card_number,
      owner_name: card.owner_name,
      notes: card.notes,
    });
    setIsModalOpen(true);
  };

  const handleDeleteCard = async (id: string) => {
    try {
      setLoading(true);
      await cardService.deleteCard(id);
      message.success('카드가 삭제되었습니다.');
      await fetchCards();
    } catch (error: any) {
      message.error(error.message || '카드 삭제에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      if (editingCard) {
        await cardService.updateCard(editingCard.id, values);
        message.success('카드가 수정되었습니다.');
      } else {
        await cardService.createCard(values);
        message.success('카드가 추가되었습니다.');
      }
      setIsModalOpen(false);
      form.resetFields();
      await fetchCards();
    } catch (error: any) {
      message.error(error.message || '저장에 실패했습니다.');
    }
  };

  const columns: ColumnsType<Card> = [
    {
      title: '카드 구분',
      dataIndex: 'card_type',
      key: 'card_type',
      width: 100,
      render: (type: string) => (
        <Tag color={type === 'corp' ? 'blue' : 'green'}>
          {CARD_TYPE_LABELS[type] || type}
        </Tag>
      ),
    },
    {
      title: '카드사',
      dataIndex: 'card_issuer',
      key: 'card_issuer',
      width: 120,
      render: (issuer: string) => CARD_ISSUER_LABELS[issuer] || issuer,
    },
    {
      title: '카드번호',
      dataIndex: 'card_number',
      key: 'card_number',
      width: 150,
      render: (number: string) => `****-${number}`,
    },
    {
      title: '소유주',
      dataIndex: 'owner_name',
      key: 'owner_name',
      width: 150,
    },
    {
      title: '비고',
      dataIndex: 'notes',
      key: 'notes',
      render: (text: string) => text || '-',
    },
    {
      title: '작업',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEditCard(record)}
          />
          <Popconfirm
            title="카드 삭제"
            description="이 카드를 삭제하시겠습니까?"
            onConfirm={() => handleDeleteCard(record.id)}
            okText="삭제"
            cancelText="취소"
          >
            <Button type="primary" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <AntCard
        title="결제 카드 관리"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAddCard}
          >
            카드 추가
          </Button>
        }
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>카드 목록을 불러오는 중...</div>
        ) : cards.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>등록된 카드가 없습니다.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '16px' }}>
            {cards.map(card => (
              <AntCard
                key={card.id}
                hoverable
                style={{
                  background: card.card_type === 'corp' ? '#f0f5ff' : '#fff7f0',
                  borderLeft: `4px solid ${card.card_type === 'corp' ? '#1890ff' : '#ff7a45'}`
                }}
              >
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <Tag color={card.card_type === 'corp' ? 'blue' : 'orange'}>
                      {card.card_type === 'corp' ? '법인카드' : '개인카드'}
                    </Tag>
                    <Space>
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleEditCard(card)}
                      />
                      <Popconfirm
                        title="카드 삭제"
                        description="이 카드를 삭제하시겠습니까?"
                        onConfirm={() => handleDeleteCard(card.id)}
                        okText="삭제"
                        cancelText="취소"
                      >
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                        />
                      </Popconfirm>
                    </Space>
                  </div>

                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>카드사</div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{CARD_ISSUER_LABELS[card.card_issuer] || card.card_issuer}</div>
                  </div>

                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>카드번호</div>
                    <div style={{ fontSize: '14px', fontFamily: 'monospace', letterSpacing: '2px' }}>
                      ****-****-****-{card.card_number}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>소유주</div>
                    <div style={{ fontSize: '14px' }}>{card.owner_name}</div>
                  </div>

                  {card.notes && (
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f0f0f0' }}>
                      <div style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>비고</div>
                      <div style={{ fontSize: '12px' }}>{card.notes}</div>
                    </div>
                  )}
                </div>
              </AntCard>
            ))}
          </div>
        )}
      </AntCard>

      {/* 카드 추가/수정 모달 */}
      <Modal
        title={editingCard ? '카드 수정' : '카드 추가'}
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          form.resetFields();
        }}
        footer={null}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            card_type: 'personal',
          }}
        >
          <Form.Item
            name="card_type"
            label="카드 구분"
            rules={[{ required: true, message: '카드 구분을 선택해주세요' }]}
          >
            <Select>
              <Option value="corp">법인카드</Option>
              <Option value="personal">개인카드</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="card_issuer"
            label="카드사 (목록 선택 또는 직접 입력)"
            rules={[{ required: true, message: '카드사를 선택하거나 입력해주세요' }]}
          >
            <AutoComplete
              placeholder="신한, KB국민 등 카드사 선택 또는 입력"
              options={[
                { label: '신한', value: 'shinhan' },
                { label: 'KB국민', value: 'kb' },
                { label: '현대', value: 'hyundai' },
                { label: '삼성', value: 'samsung' },
                { label: '롯데', value: 'lotte' },
                { label: '하나', value: 'hana' },
                { label: 'NH농협', value: 'nh' },
                { label: '우리', value: 'woori' },
                { label: 'SC제일', value: 'sc' },
                { label: '씨티', value: 'citi' },
              ]}
              filterOption={(inputValue, option) =>
                (option?.label ?? '').toLowerCase().includes(inputValue.toLowerCase())
              }
            />
          </Form.Item>

          <Form.Item
            name="card_number"
            label="카드번호 (마지막 4자리)"
            rules={[
              { required: true, message: '카드번호를 입력해주세요' },
              { pattern: /^\d{4}$/, message: '4자리 숫자를 입력해주세요' },
            ]}
          >
            <Input placeholder="예: 1234" maxLength={4} />
          </Form.Item>

          <Form.Item
            name="owner_name"
            label="카드 소유주"
            rules={[{ required: true, message: '소유주명을 입력해주세요' }]}
          >
            <Input placeholder="예: 홍길동" />
          </Form.Item>

          <Form.Item
            name="notes"
            label="비고"
          >
            <Input.TextArea rows={2} placeholder="카드에 대한 메모" />
          </Form.Item>

          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setIsModalOpen(false)}>취소</Button>
              <Button type="primary" htmlType="submit">
                {editingCard ? '수정' : '추가'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CardManagePage;
