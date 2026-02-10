import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Input,
  Button,
  Space,
  Tag,
  Typography,
  Form,
  InputNumber,
  message,
  Statistic,
  Row,
  Col,
  Popconfirm,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  DeleteOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { adidasComparisonService } from '../../services/adidasComparison';
import type {
  AdidasComparisonSummary,
  AdidasComparisonStats,
} from '../../types/adidasComparison';

const { Title } = Typography;

const AdidasComparisonPage: React.FC = () => {
  const [summaryData, setSummaryData] = useState<AdidasComparisonSummary[]>([]);
  const [stats, setStats] = useState<AdidasComparisonStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [totalPurchased, setTotalPurchased] = useState(0);
  const [totalSold, setTotalSold] = useState(0);

  const [form] = Form.useForm();
  const [addingPurchase, setAddingPurchase] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, statsRes] = await Promise.all([
        adidasComparisonService.getSummary(searchKeyword || undefined),
        adidasComparisonService.getStats(),
      ]);
      setSummaryData(summaryRes.items);
      setTotalPurchased(summaryRes.total_purchased);
      setTotalSold(summaryRes.total_sold);
      setStats(statsRes);
    } catch (err) {
      message.error('데이터 조회 실패');
    } finally {
      setLoading(false);
    }
  }, [searchKeyword]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddPurchase = async () => {
    try {
      const values = await form.validateFields();
      setAddingPurchase(true);
      await adidasComparisonService.addPurchase({
        product_code: values.product_code.trim().toUpperCase(),
        quantity: values.quantity,
        note: values.note?.trim() || undefined,
      });
      message.success('구매내역 추가 완료');
      form.resetFields();
      fetchData();
    } catch (err: any) {
      if (err?.errorFields) return; // validation error
      message.error('추가 실패');
    } finally {
      setAddingPurchase(false);
    }
  };

  const handleDeleteAll = async () => {
    try {
      const result = await adidasComparisonService.deleteAll();
      message.success(result.message);
      fetchData();
    } catch {
      message.error('삭제 실패');
    }
  };

  const columns = [
    {
      title: 'No',
      key: 'index',
      width: 40,
      render: (_: any, __: any, index: number) => index + 1,
    },
    {
      title: '품번',
      dataIndex: 'product_code',
      key: 'product_code',
      width: 100,
      render: (code: string) => <strong>{code}</strong>,
    },
    {
      title: '구매',
      dataIndex: 'total_purchased_qty',
      key: 'total_purchased_qty',
      width: 70,
      align: 'right' as const,
      sorter: (a: AdidasComparisonSummary, b: AdidasComparisonSummary) =>
        a.total_purchased_qty - b.total_purchased_qty,
      render: (qty: number) => qty > 0 ? `${qty.toLocaleString()}개` : '-',
    },
    {
      title: '판매',
      dataIndex: 'total_sales_qty',
      key: 'total_sales_qty',
      width: 70,
      align: 'right' as const,
      sorter: (a: AdidasComparisonSummary, b: AdidasComparisonSummary) =>
        a.total_sales_qty - b.total_sales_qty,
      render: (qty: number) => qty > 0 ? `${qty.toLocaleString()}개` : '-',
    },
    {
      title: '재고',
      dataIndex: 'inventory_qty',
      key: 'inventory_qty',
      width: 70,
      align: 'right' as const,
      render: (qty: number | null) => qty !== null ? `${qty.toLocaleString()}개` : '-',
    },
    {
      title: '상태',
      key: 'status',
      width: 130,
      render: (_: any, record: AdidasComparisonSummary) => {
        // 재고 있으면 구매-판매 vs 재고 비교, 없으면 구매 vs 판매 비교
        if (record.inventory_qty !== null) {
          if (record.inventory_match)
            return <span style={{ color: '#389e0d' }}>일치</span>;
          const gap = record.difference - record.inventory_qty;
          if (gap > 0)
            return <span style={{ color: '#d48806', fontWeight: 'bold' }}>구매가 {gap.toLocaleString()}개 많음</span>;
          return <span style={{ color: '#cf1322', fontWeight: 'bold' }}>판매가 {Math.abs(gap).toLocaleString()}개 많음</span>;
        }
        // 재고 없을 때: 구매 vs 판매 비교
        if (record.difference === 0)
          return <span style={{ color: '#389e0d' }}>일치</span>;
        if (record.difference > 0)
          return <span style={{ color: '#d48806', fontWeight: 'bold' }}>구매가 {record.difference.toLocaleString()}개 많음</span>;
        return <span style={{ color: '#cf1322', fontWeight: 'bold' }}>판매가 {Math.abs(record.difference).toLocaleString()}개 많음</span>;
      },
    },
  ];

  return (
    <div style={{ padding: 24, background: '#f0f2f5', minHeight: '100%' }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Title level={4} style={{ margin: 0 }}>아디다스 구매/판매 비교</Title>
        <Tag color="orange">임시</Tag>
      </div>

      {/* 통계 카드 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small">
              <Statistic title="구매 총 수량" value={totalPurchased} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="판매 총 수량" value={totalSold} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="구매 품번수" value={stats.purchase_product_codes} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="판매 품번수" value={stats.sale_product_codes} />
            </Card>
          </Col>
        </Row>
      )}

      {/* 수동 입력 + 검색 영역 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
          <Form form={form} layout="inline" style={{ gap: 8 }}>
            <Form.Item
              name="product_code"
              rules={[{ required: true, message: '품번 입력' }]}
              style={{ marginBottom: 0 }}
            >
              <Input placeholder="품번" style={{ width: 120 }} />
            </Form.Item>
            <Form.Item
              name="quantity"
              rules={[{ required: true, message: '수량' }]}
              style={{ marginBottom: 0 }}
            >
              <InputNumber placeholder="수량" min={1} style={{ width: 80 }} />
            </Form.Item>
            <Form.Item name="note" style={{ marginBottom: 0 }}>
              <Input placeholder="비고" style={{ width: 120 }} />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddPurchase}
                loading={addingPurchase}
              >
                구매 추가
              </Button>
            </Form.Item>
          </Form>

          <Space>
            <Input
              placeholder="품번 검색"
              prefix={<SearchOutlined />}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onPressEnter={() => fetchData()}
              allowClear
              style={{ width: 180 }}
            />
            <Button icon={<ReloadOutlined />} onClick={fetchData}>
              새로고침
            </Button>
            <Popconfirm
              title="전체 데이터를 삭제하시겠습니까?"
              description="구매/판매 데이터 모두 삭제됩니다."
              onConfirm={handleDeleteAll}
              okText="삭제"
              cancelText="취소"
              okButtonProps={{ danger: true }}
            >
              <Button danger icon={<DeleteOutlined />}>
                전체 삭제
              </Button>
            </Popconfirm>
          </Space>
        </div>
      </Card>

      {/* 비교 테이블 */}
      <Card size="small" bodyStyle={{ padding: '8px 12px' }}>
        <Table
          columns={columns}
          dataSource={summaryData}
          rowKey="product_code"
          loading={loading}
          size="small"
          tableLayout="fixed"
          pagination={{
            pageSize: 100,
            showSizeChanger: true,
            pageSizeOptions: ['50', '100', '200'],
            showTotal: (total) => `총 ${total}개 품번`,
          }}
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={2}>
                  <strong>합계</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  <strong>{totalPurchased.toLocaleString()}개</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  <strong>{totalSold.toLocaleString()}개</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} />
                <Table.Summary.Cell index={5} />
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </Card>
    </div>
  );
};

export default AdidasComparisonPage;
