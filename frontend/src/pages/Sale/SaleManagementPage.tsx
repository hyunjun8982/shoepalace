import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  InputNumber,
  Space,
  App,
  Tag,
  Typography,
  Row,
  Col,
  Divider,
  Radio,
} from 'antd';
import { SaveOutlined, CalculatorOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { Sale, SaleItem } from '../../types/sale';
import { saleService } from '../../services/sale';
import { useAuth } from '../../contexts/AuthContext';

const { Title, Text } = Typography;

interface SaleItemWithPricing extends SaleItem {
  temp_company_sale_price?: number;
  temp_seller_margin?: number;
  pricing_mode?: 'price' | 'margin'; // 가격 직접 입력 또는 마진율 입력
  temp_margin_percent?: number;
}

const SaleManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const { saleId } = useParams();
  const { message } = App.useApp();
  const { user } = useAuth();

  // 연락처 포맷팅 함수
  const formatPhoneNumber = (phone: string) => {
    if (!phone) return '-';
    const numbers = phone.replace(/[^\d]/g, '');
    if (numbers.length === 11) {
      return numbers.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
    }
    return phone;
  };
  const [loading, setLoading] = useState(false);
  const [sale, setSale] = useState<Sale | null>(null);
  const [items, setItems] = useState<SaleItemWithPricing[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (saleId) {
      fetchSaleData();
    }
  }, [saleId]);

  const fetchSaleData = async () => {
    try {
      setLoading(true);
      const saleData = await saleService.getSale(saleId!);
      setSale(saleData);

      if (saleData.items) {
        const itemsWithPricing = saleData.items.map(item => ({
          ...item,
          temp_company_sale_price: item.company_sale_price || 0,
          temp_seller_margin: item.seller_margin || 0,
          pricing_mode: 'price' as const,
          temp_margin_percent: 30,
        }));
        setItems(itemsWithPricing);
      }
    } catch (error) {
      message.error('판매 정보를 불러오는데 실패했습니다.');
      navigate('/sales');
    } finally {
      setLoading(false);
    }
  };

  const handleCompanyPriceChange = (itemId: string, price: number) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        const sellerPrice = item.seller_sale_price_krw * item.quantity;
        const margin = sellerPrice - price; // 올바른 마진 계산: 판매자 판매가 - 회사 판매가

        return {
          ...item,
          temp_company_sale_price: price,
          temp_seller_margin: margin,
        };
      }
      return item;
    }));
  };

  const handleMarginPercentChange = (itemId: string, marginPercent: number) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        const sellerPrice = item.seller_sale_price_krw * item.quantity;
        const marginAmount = Math.round(sellerPrice * marginPercent / 100);
        const companyPrice = sellerPrice - marginAmount; // 회사 판매가 = 판매자 판매가 - 마진
        const margin = marginAmount; // 판매자 마진 = 마진 금액

        return {
          ...item,
          temp_margin_percent: marginPercent,
          temp_company_sale_price: companyPrice,
          temp_seller_margin: margin,
        };
      }
      return item;
    }));
  };

  const handlePricingModeChange = (itemId: string, mode: 'price' | 'margin') => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          pricing_mode: mode,
        };
      }
      return item;
    }));
  };

  const handleSaveAll = async () => {
    try {
      setSaving(true);

      // 각 아이템의 회사 가격과 마진을 저장
      for (const item of items) {
        if (item.temp_company_sale_price !== item.company_sale_price) {
          // 개별 아이템 업데이트 API 호출
          await saleService.updateSaleItem(item.id!, {
            company_sale_price: item.temp_company_sale_price,
            seller_margin: item.temp_seller_margin,
          });
        }
      }

      // 전체 판매 총액 업데이트
      const totalCompanyAmount = items.reduce((sum, item) => sum + (item.temp_company_sale_price || 0), 0);
      const totalSellerMargin = items.reduce((sum, item) => sum + (item.temp_seller_margin || 0), 0);

      await saleService.updateSale(saleId!, {
        total_company_amount: totalCompanyAmount,
        total_seller_margin: totalSellerMargin,
      });

      message.success('회사 판매가격이 저장되었습니다.');
      await fetchSaleData(); // 최신 데이터 다시 로드
    } catch (error: any) {
      message.error(error.message || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<SaleItemWithPricing> = [
    {
      title: '상품명',
      dataIndex: 'product_name',
      key: 'product_name',
      width: 200,
    },
    {
      title: '사이즈',
      dataIndex: 'size',
      key: 'size',
      width: 100,
      render: (size: string) => size || '-',
    },
    {
      title: '수량',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      align: 'center',
    },
    {
      title: '판매자 판매가(원화)',
      key: 'seller_price_krw',
      width: 150,
      align: 'right',
      render: (_, record) => (
        <div>
          <div>단가: ₩{record.seller_sale_price_krw.toLocaleString()}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            총액: ₩{(record.seller_sale_price_krw * record.quantity).toLocaleString()}
          </div>
        </div>
      ),
    },
    {
      title: '회사 판매가',
      key: 'company_price',
      width: 250,
      align: 'right',
      render: (_, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Radio.Group
            size="small"
            value={record.pricing_mode || 'price'}
            onChange={(e) => handlePricingModeChange(record.id!, e.target.value)}
            style={{ marginBottom: 4 }}
          >
            <Radio.Button value="price">가격입력</Radio.Button>
            <Radio.Button value="margin">마진율</Radio.Button>
          </Radio.Group>

          {record.pricing_mode === 'margin' ? (
            <InputNumber
              min={0}
              max={200}
              value={record.temp_margin_percent}
              onChange={(value) => handleMarginPercentChange(record.id!, value || 30)}
              style={{ width: '100%' }}
              placeholder="마진율 입력"
              addonAfter="%"
            />
          ) : (
            <InputNumber
              min={0}
              value={record.temp_company_sale_price}
              onChange={(value) => handleCompanyPriceChange(record.id!, value || 0)}
              formatter={(value) => `₩ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(value) => value!.replace(/₩\s?|(,*)/g, '') as any}
              style={{ width: '100%' }}
              placeholder="회사 판매가 입력"
            />
          )}

          <div style={{ fontSize: '11px', color: '#666', textAlign: 'center' }}>
            계산된 가격: ₩{(record.temp_company_sale_price || 0).toLocaleString()}
          </div>
        </div>
      ),
    },
    {
      title: '판매자 마진',
      key: 'seller_margin',
      width: 150,
      align: 'right',
      render: (_, record) => (
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontSize: '14px',
            fontWeight: 'bold',
            color: (record.temp_seller_margin || 0) > 0 ? '#52c41a' : '#999'
          }}>
            ₩{(record.temp_seller_margin || 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '11px', color: '#666' }}>
            {record.seller_sale_price_krw > 0
              ? `마진율: ${(((record.temp_seller_margin || 0) / (record.seller_sale_price_krw * record.quantity)) * 100).toFixed(1)}%`
              : '-'
            }
          </div>
        </div>
      ),
    },
  ];

  if (!user || user.role !== 'admin') {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Title level={3}>접근 권한이 없습니다</Title>
        <Text>관리자만 접근할 수 있는 페이지입니다.</Text>
      </div>
    );
  }

  const totalSellerAmount = items.reduce((sum, item) => sum + (item.seller_sale_price_krw * item.quantity), 0);
  const totalCompanyAmount = items.reduce((sum, item) => sum + (item.temp_company_sale_price || 0), 0);
  const totalMargin = items.reduce((sum, item) => sum + (item.temp_seller_margin || 0), 0);

  return (
    <div style={{ padding: '24px' }}>
      <Card title="판매 관리 - 회사 판매가격 설정" style={{ marginBottom: 24 }}>
        {sale && (
          <div style={{ marginBottom: 24 }}>
            <Row gutter={16}>
              <Col span={6}>
                <div>
                  <Text strong>판매일:</Text> {dayjs(sale.sale_date).format('YYYY-MM-DD')}
                </div>
              </Col>
              <Col span={6}>
                <div>
                  <Text strong>고객명:</Text> {sale.customer_name || '-'}
                </div>
              </Col>
              <Col span={6}>
                <div>
                  <Text strong>연락처:</Text> {formatPhoneNumber(sale.customer_contact || '')}
                </div>
              </Col>
              <Col span={6}>
                <div>
                  <Text strong>상태:</Text>
                  <Tag color={sale.status === 'completed' ? 'green' : 'blue'} style={{ marginLeft: 8 }}>
                    {sale.status === 'completed' ? '완료' : '대기'}
                  </Tag>
                </div>
              </Col>
            </Row>
          </div>
        )}

        <Table
          columns={columns}
          dataSource={items}
          rowKey="id"
          loading={loading}
          pagination={false}
          footer={() => (
            <div>
              <Row gutter={16} style={{ padding: '16px 0' }}>
                <Col span={8}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#666' }}>판매자 총 판매금액</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1890ff' }}>
                      ₩{totalSellerAmount.toLocaleString()}
                    </div>
                  </div>
                </Col>
                <Col span={8}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#666' }}>회사 총 판매금액</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#52c41a' }}>
                      ₩{totalCompanyAmount.toLocaleString()}
                    </div>
                  </div>
                </Col>
                <Col span={8}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#666' }}>총 판매자 마진</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#faad14' }}>
                      ₩{totalMargin.toLocaleString()}
                    </div>
                  </div>
                </Col>
              </Row>
            </div>
          )}
        />

        <Divider />

        <div style={{ textAlign: 'center' }}>
          <Space>
            <Button onClick={() => navigate('/sales')}>
              목록으로
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSaveAll}
              loading={saving}
              style={{ backgroundColor: '#0d1117', borderColor: '#0d1117' }}
            >
              모든 가격 저장
            </Button>
          </Space>
        </div>
      </Card>
    </div>
  );
};

export default SaleManagementPage;