import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  DatePicker,
  Select,
  Row,
  Col,
  Statistic,
  App,
  Popconfirm,
  Modal,
  Form,
  Input,
  Spin,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CalculatorOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  Settlement,
  SettlementStatus,
  SettlementType,
  SettlementListParams,
  SettlementSummary,
} from '../../types/settlement';
import { settlementService } from '../../services/settlement';
import { useAuth } from '../../contexts/AuthContext';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { TextArea } = Input;

const SettlementListPage: React.FC = () => {
  const { message } = App.useApp();
  const { user } = useAuth();
  const [form] = Form.useForm();
  const [calculateForm] = Form.useForm();

  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<SettlementSummary | null>(null);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });
  const [filters, setFilters] = useState<SettlementListParams>({});

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCalculateModalOpen, setIsCalculateModalOpen] = useState(false);
  const [editingSettlement, setEditingSettlement] = useState<Settlement | null>(null);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    fetchSettlements();
    fetchSummary();
  }, [pagination.current, pagination.pageSize, filters]);

  const fetchSettlements = async () => {
    try {
      setLoading(true);
      const params: SettlementListParams = {
        skip: (pagination.current - 1) * pagination.pageSize,
        limit: pagination.pageSize,
        ...filters,
      };

      const response = await settlementService.getSettlements(params);
      setSettlements(response.items);
      setTotal(response.total);
    } catch (error) {
      message.error('정산 목록 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const summary = await settlementService.getSettlementSummary(
        filters.start_date,
        filters.end_date
      );
      setSummary(summary);
    } catch (error) {
      console.error('정산 요약 정보 조회 실패:', error);
    }
  };

  const handleDeleteSettlement = async (settlementId: string) => {
    try {
      await settlementService.deleteSettlement(settlementId);
      message.success('정산이 삭제되었습니다.');
      fetchSettlements();
      fetchSummary();
    } catch (error) {
      message.error('정산 삭제에 실패했습니다.');
    }
  };

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
    }));
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  const handleDateRangeChange = (dates: any) => {
    if (dates && dates.length === 2) {
      setFilters(prev => ({
        ...prev,
        start_date: dates[0].format('YYYY-MM-DD'),
        end_date: dates[1].format('YYYY-MM-DD'),
      }));
    } else {
      setFilters(prev => ({
        ...prev,
        start_date: undefined,
        end_date: undefined,
      }));
    }
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  const getStatusTag = (status: SettlementStatus) => {
    const statusConfig = {
      [SettlementStatus.PENDING]: { color: 'orange', text: '대기중', icon: <ClockCircleOutlined /> },
      [SettlementStatus.IN_PROGRESS]: { color: 'blue', text: '진행중', icon: <ClockCircleOutlined /> },
      [SettlementStatus.COMPLETED]: { color: 'green', text: '완료', icon: <CheckCircleOutlined /> },
      [SettlementStatus.CANCELLED]: { color: 'red', text: '취소', icon: null },
    };

    const config = statusConfig[status];
    return <Tag color={config.color} icon={config.icon}>{config.text}</Tag>;
  };

  const getTypeTag = (type: SettlementType) => {
    const typeConfig = {
      [SettlementType.PURCHASE]: { color: 'blue', text: '구매 정산' },
      [SettlementType.SALE]: { color: 'green', text: '판매 정산' },
      [SettlementType.MONTHLY]: { color: 'purple', text: '월간 정산' },
    };

    const config = typeConfig[type];
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const handleEdit = (settlement: Settlement) => {
    setEditingSettlement(settlement);
    form.setFieldsValue({
      ...settlement,
      settlement_date: dayjs(settlement.settlement_date),
      start_date: dayjs(settlement.start_date),
      end_date: dayjs(settlement.end_date),
    });
    setIsModalOpen(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const settlementData = {
        ...values,
        settlement_date: values.settlement_date.format('YYYY-MM-DD HH:mm:ss'),
        start_date: values.start_date.format('YYYY-MM-DD'),
        end_date: values.end_date.format('YYYY-MM-DD'),
      };

      if (editingSettlement) {
        await settlementService.updateSettlement(editingSettlement.id!, settlementData);
        message.success('정산이 수정되었습니다.');
      } else {
        await settlementService.createSettlement(settlementData);
        message.success('정산이 생성되었습니다.');
      }

      setIsModalOpen(false);
      form.resetFields();
      setEditingSettlement(null);
      fetchSettlements();
      fetchSummary();
    } catch (error) {
      console.error('정산 저장 실패:', error);
    }
  };

  const handleCalculate = async () => {
    try {
      setCalculating(true);
      const values = await calculateForm.validateFields();
      const params = {
        settlement_type: values.settlement_type,
        start_date: values.dateRange[0].format('YYYY-MM-DD'),
        end_date: values.dateRange[1].format('YYYY-MM-DD'),
        target_user_id: values.target_user_id,
      };

      await settlementService.calculateSettlement(params);
      message.success('정산이 자동 계산되었습니다.');
      setIsCalculateModalOpen(false);
      calculateForm.resetFields();
      fetchSettlements();
      fetchSummary();
    } catch (error) {
      message.error('정산 계산에 실패했습니다.');
    } finally {
      setCalculating(false);
    }
  };

  const handleStatusUpdate = async (settlementId: string, status: SettlementStatus) => {
    try {
      await settlementService.updateSettlement(settlementId, { status });
      message.success('정산 상태가 업데이트되었습니다.');
      fetchSettlements();
      fetchSummary();
    } catch (error) {
      message.error('상태 업데이트에 실패했습니다.');
    }
  };

  const columns: ColumnsType<Settlement> = [
    {
      title: '정산 유형',
      dataIndex: 'settlement_type',
      key: 'settlement_type',
      render: (type: SettlementType) => getTypeTag(type),
    },
    {
      title: '정산 기간',
      key: 'period',
      render: (_, record) => (
        <span>
          {dayjs(record.start_date).format('YYYY-MM-DD')} ~{' '}
          {dayjs(record.end_date).format('YYYY-MM-DD')}
        </span>
      ),
    },
    {
      title: '대상자',
      dataIndex: 'target_user_name',
      key: 'target_user_name',
      render: (name: string) => name || '전체',
    },
    {
      title: '거래 건수',
      dataIndex: 'transaction_count',
      key: 'transaction_count',
      render: (count: number) => `${count}건`,
    },
    {
      title: '총 거래액',
      dataIndex: 'total_amount',
      key: 'total_amount',
      render: (amount: number) => `₩${amount?.toLocaleString() || 0}`,
    },
    {
      title: '정산액',
      dataIndex: 'settlement_amount',
      key: 'settlement_amount',
      render: (amount: number) => `₩${amount?.toLocaleString() || 0}`,
    },
    {
      title: '수수료',
      dataIndex: 'fee_amount',
      key: 'fee_amount',
      render: (amount: number) => `₩${amount?.toLocaleString() || 0}`,
    },
    {
      title: '세금',
      dataIndex: 'tax_amount',
      key: 'tax_amount',
      render: (amount: number) => `₩${amount?.toLocaleString() || 0}`,
    },
    {
      title: '최종 정산액',
      dataIndex: 'final_amount',
      key: 'final_amount',
      render: (amount: number) => (
        <span style={{ fontWeight: 'bold', color: '#1890ff' }}>
          ₩{amount?.toLocaleString() || 0}
        </span>
      ),
    },
    {
      title: '상태',
      dataIndex: 'status',
      key: 'status',
      render: (status: SettlementStatus, record) => (
        <Space>
          {getStatusTag(status)}
          {user?.role === 'admin' && status === SettlementStatus.PENDING && (
            <Button
              size="small"
              type="link"
              onClick={() => handleStatusUpdate(record.id!, SettlementStatus.COMPLETED)}
            >
              완료 처리
            </Button>
          )}
        </Space>
      ),
    },
    {
      title: '정산일',
      dataIndex: 'settlement_date',
      key: 'settlement_date',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD'),
    },
    {
      title: '작업',
      key: 'action',
      render: (_, record) => (
        <Space size="small">
          {user?.role === 'admin' && (
            <>
              <Button
                type="link"
                icon={<EditOutlined />}
                onClick={() => handleEdit(record)}
              >
                수정
              </Button>
              <Popconfirm
                title="정산을 삭제하시겠습니까?"
                description="이 작업은 되돌릴 수 없습니다."
                onConfirm={() => handleDeleteSettlement(record.id!)}
                okText="삭제"
                cancelText="취소"
              >
                <Button type="link" danger icon={<DeleteOutlined />}>
                  삭제
                </Button>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      {/* 통계 카드 */}
      {summary && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="총 정산 건수"
                value={summary.total_settlements}
                suffix="건"
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="대기중"
                value={summary.pending_count}
                suffix="건"
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="완료"
                value={summary.completed_count}
                suffix="건"
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="총 정산액"
                value={summary.total_final_amount}
                prefix="₩"
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Card>
        {/* 필터 영역 */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <RangePicker
              placeholder={['시작일', '종료일']}
              onChange={handleDateRangeChange}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={4}>
            <Select
              placeholder="정산 유형"
              allowClear
              onChange={(value) => handleFilterChange('settlement_type', value)}
              style={{ width: '100%' }}
            >
              <Option value={SettlementType.PURCHASE}>구매 정산</Option>
              <Option value={SettlementType.SALE}>판매 정산</Option>
              <Option value={SettlementType.MONTHLY}>월간 정산</Option>
            </Select>
          </Col>
          <Col span={4}>
            <Select
              placeholder="상태 선택"
              allowClear
              onChange={(value) => handleFilterChange('status', value)}
              style={{ width: '100%' }}
            >
              <Option value={SettlementStatus.PENDING}>대기중</Option>
              <Option value={SettlementStatus.IN_PROGRESS}>진행중</Option>
              <Option value={SettlementStatus.COMPLETED}>완료</Option>
              <Option value={SettlementStatus.CANCELLED}>취소</Option>
            </Select>
          </Col>
          <Col span={10} style={{ textAlign: 'right' }}>
            {user?.role === 'admin' && (
              <Space>
                <Button
                  icon={<CalculatorOutlined />}
                  onClick={() => setIsCalculateModalOpen(true)}
                >
                  자동 계산
                </Button>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setEditingSettlement(null);
                    form.resetFields();
                    setIsModalOpen(true);
                  }}
                >
                  정산 생성
                </Button>
              </Space>
            )}
          </Col>
        </Row>

        {/* 테이블 */}
        <Table
          columns={columns}
          dataSource={settlements}
          loading={loading}
          rowKey="id"
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} / 총 ${total}건`,
            onChange: (page, pageSize) => {
              setPagination({ current: page, pageSize: pageSize || 10 });
            },
          }}
        />
      </Card>

      {/* 정산 생성/수정 모달 */}
      <Modal
        title={editingSettlement ? '정산 수정' : '정산 생성'}
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => {
          setIsModalOpen(false);
          form.resetFields();
          setEditingSettlement(null);
        }}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="settlement_type"
                label="정산 유형"
                rules={[{ required: true, message: '정산 유형을 선택해주세요' }]}
              >
                <Select placeholder="정산 유형 선택">
                  <Option value={SettlementType.PURCHASE}>구매 정산</Option>
                  <Option value={SettlementType.SALE}>판매 정산</Option>
                  <Option value={SettlementType.MONTHLY}>월간 정산</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="settlement_date"
                label="정산일"
                rules={[{ required: true, message: '정산일을 선택해주세요' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="start_date"
                label="시작일"
                rules={[{ required: true, message: '시작일을 선택해주세요' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="end_date"
                label="종료일"
                rules={[{ required: true, message: '종료일을 선택해주세요' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="target_user_name" label="대상자">
                <Input placeholder="대상자 이름" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="transaction_count" label="거래 건수">
                <Input type="number" placeholder="거래 건수" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="total_amount" label="총 거래액">
                <Input type="number" placeholder="총 거래액" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="settlement_amount" label="정산액">
                <Input type="number" placeholder="정산액" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="fee_amount" label="수수료">
                <Input type="number" placeholder="수수료" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="tax_amount" label="세금">
                <Input type="number" placeholder="세금" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="final_amount" label="최종 정산액">
                <Input type="number" placeholder="최종 정산액" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="status" label="상태">
            <Select placeholder="상태 선택">
              <Option value={SettlementStatus.PENDING}>대기중</Option>
              <Option value={SettlementStatus.IN_PROGRESS}>진행중</Option>
              <Option value={SettlementStatus.COMPLETED}>완료</Option>
              <Option value={SettlementStatus.CANCELLED}>취소</Option>
            </Select>
          </Form.Item>

          <Form.Item name="notes" label="메모">
            <TextArea rows={4} placeholder="메모" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 자동 계산 모달 */}
      <Modal
        title="정산 자동 계산"
        open={isCalculateModalOpen}
        onOk={handleCalculate}
        onCancel={() => {
          setIsCalculateModalOpen(false);
          calculateForm.resetFields();
        }}
        confirmLoading={calculating}
      >
        <Form form={calculateForm} layout="vertical">
          <Form.Item
            name="settlement_type"
            label="정산 유형"
            rules={[{ required: true, message: '정산 유형을 선택해주세요' }]}
          >
            <Select placeholder="정산 유형 선택">
              <Option value={SettlementType.PURCHASE}>구매 정산</Option>
              <Option value={SettlementType.SALE}>판매 정산</Option>
              <Option value={SettlementType.MONTHLY}>월간 정산</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="dateRange"
            label="정산 기간"
            rules={[{ required: true, message: '정산 기간을 선택해주세요' }]}
          >
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="target_user_id" label="대상자 ID">
            <Input placeholder="대상자 ID (선택사항)" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SettlementListPage;