import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Tag,
  Space,
  message,
  Popconfirm,
  Select,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { featureRequestService } from '../../services/featureRequest';
import {
  FeatureRequest,
  FeatureRequestCreate,
  FeatureRequestUpdate,
  RequestStatus,
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_COLORS,
} from '../../types/featureRequest';
import { useAuth } from '../../contexts/AuthContext';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Title, Text } = Typography;

const FeatureRequestPage: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FeatureRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<FeatureRequest | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FeatureRequest | null>(null);
  const [form] = Form.useForm();
  const [detailForm] = Form.useForm();
  const [updating, setUpdating] = useState(false);

  // 현재 사용자가 관리자인지 확인
  const isAdmin = user?.role === 'admin';

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await featureRequestService.getList({ limit: 100 });
      setData(response.items);
      setTotal(response.total);
    } catch (error) {
      message.error('요청사항 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: FeatureRequest) => {
    setEditingItem(record);
    form.setFieldsValue({
      title: record.title,
      content: record.content,
      author_name: record.author_name,
      status: record.status,
      version: record.version,
      admin_note: record.admin_note,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await featureRequestService.delete(id);
      message.success('삭제되었습니다.');
      fetchData();
    } catch (error) {
      message.error('삭제에 실패했습니다.');
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      if (editingItem) {
        const updateData: FeatureRequestUpdate = {
          title: values.title,
          content: values.content,
          status: values.status,
          version: values.version,
          admin_note: values.admin_note,
        };
        await featureRequestService.update(editingItem.id, updateData);
        message.success('수정되었습니다.');
      } else {
        const createData: FeatureRequestCreate = {
          title: values.title,
          content: values.content,
          author_name: user?.full_name || user?.username,
        };
        await featureRequestService.create(createData);
        message.success('등록되었습니다.');
      }
      setModalVisible(false);
      fetchData();
    } catch (error) {
      message.error(editingItem ? '수정에 실패했습니다.' : '등록에 실패했습니다.');
    }
  };

  const handleRowClick = (record: FeatureRequest) => {
    setSelectedItem(record);
    detailForm.setFieldsValue({
      status: record.status,
      version: record.version || '',
      admin_note: record.admin_note || '',
    });
    setDetailModalVisible(true);
  };

  // 상세 모달에서 상태/버전/답변 업데이트
  const handleDetailUpdate = async () => {
    if (!selectedItem) return;

    try {
      setUpdating(true);
      const values = detailForm.getFieldsValue();
      const updateData: FeatureRequestUpdate = {
        status: values.status,
        version: values.version || undefined,
        admin_note: values.admin_note || undefined,
      };
      await featureRequestService.update(selectedItem.id, updateData);
      message.success('처리되었습니다.');
      setDetailModalVisible(false);
      fetchData();
    } catch (error) {
      message.error('처리에 실패했습니다.');
    } finally {
      setUpdating(false);
    }
  };

  const columns: ColumnsType<FeatureRequest> = [
    {
      title: '번호',
      key: 'index',
      width: 60,
      align: 'center',
      render: (_: any, __: any, index: number) => total - index,
    },
    {
      title: '내용',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (title: string, record: FeatureRequest) => (
        <a onClick={() => handleRowClick(record)}>{title}</a>
      ),
    },
    {
      title: '현황',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      align: 'center',
      render: (status: RequestStatus) => (
        <Tag color={REQUEST_STATUS_COLORS[status]}>
          {REQUEST_STATUS_LABELS[status]}
        </Tag>
      ),
    },
    {
      title: '버전',
      dataIndex: 'version',
      key: 'version',
      width: 80,
      align: 'center',
      render: (version: string) => version || '-',
    },
    {
      title: '작성자',
      dataIndex: 'author_name',
      key: 'author_name',
      width: 100,
      align: 'center',
      render: (name: string) => name || '-',
    },
    {
      title: '등록일',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 100,
      align: 'center',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD'),
    },
    {
      title: '관리',
      key: 'action',
      width: 100,
      align: 'center',
      render: (_: any, record: FeatureRequest) => (
        <Space size="small">
          <Button
            type="text"
            icon={<EditOutlined />}
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(record);
            }}
          />
          <Popconfirm
            title="삭제하시겠습니까?"
            onConfirm={() => handleDelete(record.id)}
            okText="삭제"
            cancelText="취소"
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              size="small"
              onClick={(e) => e.stopPropagation()}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, background: '#f0f2f5', minHeight: '100vh' }}>
      <Card>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <BulbOutlined style={{ fontSize: 24, color: '#1890ff' }} />
            <Title level={4} style={{ margin: 0 }}>사용자 요청사항</Title>
          </Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} style={{ backgroundColor: '#0d1117', borderColor: '#0d1117' }}>
            요청 등록
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{
            total,
            pageSize: 20,
            showSizeChanger: false,
            showTotal: (total) => `총 ${total}건`,
          }}
          size="middle"
          onRow={(record) => ({
            onClick: () => handleRowClick(record),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>

      {/* 등록/수정 모달 */}
      <Modal
        title={editingItem ? '요청사항 수정' : '요청사항 등록'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="title"
            label="제목"
            rules={[{ required: true, message: '제목을 입력하세요' }]}
          >
            <Input placeholder="요청사항 제목" />
          </Form.Item>

          <Form.Item
            name="content"
            label="상세 내용 (선택)"
          >
            <TextArea rows={5} placeholder="요청사항 상세 내용 (선택 입력)" />
          </Form.Item>

          {editingItem && isAdmin && (
            <>
              <Form.Item name="status" label="상태">
                <Select>
                  <Select.Option value="pending">대기</Select.Option>
                  <Select.Option value="in_progress">진행중</Select.Option>
                  <Select.Option value="completed">완료</Select.Option>
                  <Select.Option value="rejected">반려</Select.Option>
                </Select>
              </Form.Item>

              <Form.Item name="version" label="반영 버전">
                <Input placeholder="예: 1.2" />
              </Form.Item>

              <Form.Item name="admin_note" label="관리자 메모">
                <TextArea rows={2} placeholder="관리자 메모 (내부용)" />
              </Form.Item>
            </>
          )}

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setModalVisible(false)}>취소</Button>
              <Button type="primary" htmlType="submit" style={{ backgroundColor: '#0d1117', borderColor: '#0d1117' }}>
                {editingItem ? '수정' : '등록'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 상세 보기 모달 */}
      <Modal
        title="요청사항 상세"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            닫기
          </Button>,
          isAdmin && (
            <Button
              key="update"
              type="primary"
              loading={updating}
              onClick={handleDetailUpdate}
              style={{ backgroundColor: '#0d1117', borderColor: '#0d1117' }}
            >
              저장
            </Button>
          ),
        ]}
        width={650}
      >
        {selectedItem && (
          <div>
            {/* 요청 정보 */}
            <div style={{ marginBottom: 20, padding: 16, background: '#fafafa', borderRadius: 8 }}>
              <div style={{ marginBottom: 12 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>제목</Text>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{selectedItem.title}</div>
              </div>

              {selectedItem.content && (
                <div style={{ marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>상세 내용</Text>
                  <div style={{ whiteSpace: 'pre-wrap', background: '#fff', padding: 12, borderRadius: 4, border: '1px solid #e8e8e8' }}>
                    {selectedItem.content}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>작성자</Text>
                  <div>{selectedItem.author_name || '-'}</div>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>등록일</Text>
                  <div>{dayjs(selectedItem.created_at).format('YYYY-MM-DD HH:mm')}</div>
                </div>
              </div>
            </div>

            {/* 관리자 처리 영역 */}
            {isAdmin ? (
              <div style={{ padding: 16, background: '#f0f5ff', borderRadius: 8, border: '1px solid #adc6ff' }}>
                <div style={{ fontWeight: 600, marginBottom: 12, color: '#0d1b2a' }}>처리 정보</div>
                <Form form={detailForm} layout="vertical" size="small">
                  <div style={{ display: 'flex', gap: 12 }}>
                    <Form.Item name="status" label="현황" style={{ flex: 1, marginBottom: 12 }}>
                      <Select>
                        <Select.Option value="pending">대기</Select.Option>
                        <Select.Option value="in_progress">진행중</Select.Option>
                        <Select.Option value="completed">완료</Select.Option>
                        <Select.Option value="rejected">반려</Select.Option>
                      </Select>
                    </Form.Item>
                    <Form.Item name="version" label="반영 버전" style={{ flex: 1, marginBottom: 12 }}>
                      <Input placeholder="예: v1.2.0" />
                    </Form.Item>
                  </div>
                  <Form.Item name="admin_note" label="답변 / 처리 내용" style={{ marginBottom: 0 }}>
                    <TextArea rows={3} placeholder="처리 결과나 답변을 입력하세요" />
                  </Form.Item>
                </Form>
              </div>
            ) : (
              /* 일반 사용자 - 읽기 전용 */
              <div style={{ padding: 16, background: '#f6ffed', borderRadius: 8, border: '1px solid #b7eb8f' }}>
                <div style={{ fontWeight: 600, marginBottom: 12, color: '#0d1b2a' }}>처리 현황</div>
                <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>현황</Text>
                    <div>
                      <Tag color={REQUEST_STATUS_COLORS[selectedItem.status]}>
                        {REQUEST_STATUS_LABELS[selectedItem.status]}
                      </Tag>
                    </div>
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>반영 버전</Text>
                    <div style={{ fontWeight: 500 }}>{selectedItem.version || '-'}</div>
                  </div>
                </div>
                {selectedItem.admin_note && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>답변</Text>
                    <div style={{ whiteSpace: 'pre-wrap', background: '#fff', padding: 12, borderRadius: 4, border: '1px solid #d9d9d9' }}>
                      {selectedItem.admin_note}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default FeatureRequestPage;
