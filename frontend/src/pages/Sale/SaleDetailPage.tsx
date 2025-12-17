import React, { useState, useEffect } from 'react';
import {
  Card,
  Descriptions,
  Table,
  Button,
  Space,
  Tag,
  App,
  Spin,
  Row,
  Col,
  Typography,
  Image,
  Upload,
  InputNumber,
  Form,
  Input,
  DatePicker,
  message as antMessage,
} from 'antd';
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  UploadOutlined,
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { Sale, SaleItem, SaleStatus } from '../../types/sale';
import { saleService } from '../../services/sale';
import { useAuth } from '../../contexts/AuthContext';
import { getFileUrl } from '../../utils/urlUtils';
import type { ColumnsType } from 'antd/es/table';
import ExcelViewer from '../../components/ExcelViewer';

const { Title, Text } = Typography;

const SaleDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { user } = useAuth();
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingPrices, setEditingPrices] = useState<{ [key: string]: number }>({});
  const [form] = Form.useForm();

  useEffect(() => {
    if (id) {
      fetchSaleDetail();
    }
  }, [id]);

  const fetchSaleDetail = async () => {
    try {
      setLoading(true);
      const data = await saleService.getSale(id!);
      console.log('Sale detail:', data);
      console.log('Transaction statement URL:', data.transaction_statement_url);
      console.log('Tax invoice URL:', data.tax_invoice_url);
      setSale(data);
    } catch (error: any) {
      message.error(error.message || '판매 정보를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 파일 업로드 핸들러 (beforeUpload에서는 File 객체를 직접 받음)
  const handleTransactionStatementUpload = async (file: File) => {
    console.log('=== Transaction Statement Upload Debug ===');
    console.log('File object:', file);
    console.log('File name:', file?.name);
    console.log('File size:', file?.size);
    console.log('File type:', file?.type);

    if (!file || !file.name) {
      console.error('No valid file found');
      message.error('파일을 찾을 수 없습니다.');
      return false;
    }

    const formData = new FormData();
    formData.append('file', file);

    console.log('FormData created');
    console.log('Sale ID:', id);

    try {
      console.log('Calling uploadTransactionStatement...');
      const result = await saleService.uploadTransactionStatement(id!, formData);
      console.log('Upload result:', result);
      message.success('거래명세서가 업로드되었습니다.');

      // 약간의 지연 후 새로고침
      setTimeout(() => {
        fetchSaleDetail();
      }, 500);
    } catch (error: any) {
      console.error('Upload error:', error);
      console.error('Error details:', error.response?.data);
      console.error('Error status:', error.response?.status);
      message.error(`거래명세서 업로드에 실패했습니다: ${error.response?.data?.detail || error.message}`);
    }
    return false; // 자동 업로드 방지
  };

  const handleTaxInvoiceUpload = async (file: File) => {
    console.log('=== Tax Invoice Upload Debug ===');
    console.log('File object:', file);
    console.log('File name:', file?.name);
    console.log('File size:', file?.size);
    console.log('File type:', file?.type);

    if (!file || !file.name) {
      console.error('No valid file found');
      message.error('파일을 찾을 수 없습니다.');
      return false;
    }

    const formData = new FormData();
    formData.append('file', file);

    console.log('FormData created');
    console.log('Sale ID:', id);

    try {
      console.log('Calling uploadTaxInvoice...');
      const result = await saleService.uploadTaxInvoice(id!, formData);
      console.log('Upload result:', result);
      message.success('세금계산서가 업로드되었습니다.');

      // 약간의 지연 후 새로고침
      setTimeout(() => {
        fetchSaleDetail();
      }, 500);
    } catch (error: any) {
      console.error('Upload error:', error);
      console.error('Error details:', error.response?.data);
      console.error('Error status:', error.response?.status);
      message.error(`세금계산서 업로드에 실패했습니다: ${error.response?.data?.detail || error.message}`);
    }
    return false; // 자동 업로드 방지
  };

  const getStatusTag = (status?: SaleStatus) => {
    const config = {
      [SaleStatus.PENDING]: { color: 'gold', text: '대기' },
      [SaleStatus.COMPLETED]: { color: 'green', text: '완료' },
      [SaleStatus.CANCELLED]: { color: 'red', text: '취소' },
    };
    const { color, text } = config[status || SaleStatus.PENDING];
    return <Tag color={color}>{text}</Tag>;
  };

  const formatPhoneNumber = (phone: string) => {
    if (!phone) return '-';
    const numbers = phone.replace(/[^\d]/g, '');
    if (numbers.length === 11) {
      return numbers.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
    }
    return phone;
  };

  // 첫 번째 상품 정보 (모든 아이템이 같은 상품)
  const firstItem = sale?.items?.[0];

  // 사이즈별 정보 맵 생성
  const sizeInfoMap = new Map<string, { quantity: number; sellerPrice: number; companyPrice: number }>();
  sale?.items?.forEach(item => {
    const size = item.size || 'FREE';
    const current = sizeInfoMap.get(size) || { quantity: 0, sellerPrice: 0, companyPrice: 0 };
    sizeInfoMap.set(size, {
      quantity: current.quantity + (item.quantity || 0),
      sellerPrice: item.seller_sale_price_krw || 0,
      companyPrice: current.companyPrice + ((item.company_sale_price || 0) * (item.quantity || 0)),
    });
  });

  // 사이즈 정렬
  const sortedSizeEntries = Array.from(sizeInfoMap.entries()).sort(([a], [b]) => {
    const aNum = parseFloat(a);
    const bNum = parseFloat(b);
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return aNum - bNum;
    }
    return a.localeCompare(b);
  });

  // 총액 계산
  const totalQuantity = sale?.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
  const totalSellerAmount = sale?.total_seller_amount || 0;
  const totalCompanyAmount = sale?.total_company_amount || 0;

  // 파일 다운로드 핸들러
  const handleDownloadTransactionStatement = () => {
    if (sale?.transaction_statement_url) {
      // 전체 URL 생성
      const url = getFileUrl(`/uploads/${sale.transaction_statement_url}`);
      if (url) window.open(url, '_blank');
    }
  };

  const handleDownloadTaxInvoice = () => {
    if (sale?.tax_invoice_url) {
      // 전체 URL 생성
      const url = getFileUrl(`/uploads/${sale.tax_invoice_url}`);
      if (url) window.open(url, '_blank');
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!sale) {
    return <div>판매 정보를 찾을 수 없습니다.</div>;
  }

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        {/* 기본 정보 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '2px solid #1890ff', paddingBottom: 8 }}>
          <Title level={5} style={{ margin: 0 }}>
            기본 정보
          </Title>
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/sales')}
            >
              목록으로
            </Button>
            {!editMode ? (
              <>
                {(user?.role === 'admin' || user?.id === sale?.seller_id) && (
                  <Button
                    type="primary"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setEditMode(true);
                      form.setFieldsValue({
                        customer_name: sale?.customer_name,
                        customer_contact: sale?.customer_contact,
                        notes: sale?.notes,
                      });
                      // 가격 정보 초기화
                      const prices: { [key: string]: number } = {};
                      sale?.items?.forEach(item => {
                        if (item.id) {
                          prices[item.id] = item.company_sale_price || 0;
                        }
                      });
                      setEditingPrices(prices);
                    }}
                  >
                    편집
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={async () => {
                    try {
                      const values = await form.validateFields();

                      // 판매 정보 업데이트
                      await saleService.updateSale(sale!.id!, {
                        ...values,
                        items: sale!.items?.map(item => ({
                          ...item,
                          company_sale_price: editingPrices[item.id!] || item.company_sale_price,
                        })),
                      });

                      antMessage.success('저장되었습니다.');
                      setEditMode(false);
                      fetchSaleDetail();
                    } catch (error) {
                      antMessage.error('저장에 실패했습니다.');
                    }
                  }}
                >
                  저장
                </Button>
                <Button
                  icon={<CloseOutlined />}
                  onClick={() => {
                    setEditMode(false);
                    form.resetFields();
                  }}
                >
                  취소
                </Button>
              </>
            )}
          </Space>
        </div>

        {!editMode ? (
          <Descriptions
            bordered
            column={{ xxl: 3, xl: 3, lg: 2, md: 2, sm: 1, xs: 1 }}
            style={{ marginBottom: 24 }}
          >
            <Descriptions.Item label="판매번호">
              {sale.sale_number || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="판매일">
              {dayjs(sale.sale_date).format('YYYY-MM-DD')}
            </Descriptions.Item>
            <Descriptions.Item label="판매자">
              {sale.seller_name || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="고객명/고객처">
              {sale.customer_name || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="연락처">
              {formatPhoneNumber(sale.customer_contact || '')}
            </Descriptions.Item>
            <Descriptions.Item label="등록일시">
              {sale.created_at ? dayjs(sale.created_at).format('YYYY-MM-DD HH:mm') : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="총 판매자 판매금액">
              ₩{Math.floor(sale.total_seller_amount || 0).toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="총 회사 판매금액">
              ₩{Math.floor(sale.total_company_amount || 0).toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="총 판매자 마진">
              ₩{Math.floor(sale.total_seller_margin || 0).toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="비고" span={3}>
              {sale.notes || '-'}
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Form form={form} layout="vertical">
            <Descriptions
              bordered
              column={{ xxl: 3, xl: 3, lg: 2, md: 2, sm: 1, xs: 1 }}
            >
              <Descriptions.Item label="판매번호">
                {sale.sale_number || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="판매일">
                {dayjs(sale.sale_date).format('YYYY-MM-DD')}
              </Descriptions.Item>
              <Descriptions.Item label="판매자">
                {sale.seller_name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="고객명/고객처">
                <Form.Item name="customer_name" style={{ margin: 0 }}>
                  <Input placeholder="고객명 입력" />
                </Form.Item>
              </Descriptions.Item>
              <Descriptions.Item label="연락처">
                <Form.Item name="customer_contact" style={{ margin: 0 }}>
                  <Input placeholder="연락처 입력" />
                </Form.Item>
              </Descriptions.Item>
              <Descriptions.Item label="등록일시">
                {sale.created_at ? dayjs(sale.created_at).format('YYYY-MM-DD HH:mm') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="총 판매자 판매금액">
                ₩{Math.floor(sale.total_seller_amount || 0).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="총 회사 판매금액">
                ₩{Math.floor(sale.total_company_amount || 0).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="총 판매자 마진">
                ₩{Math.floor(sale.total_seller_margin || 0).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="비고" span={3}>
                <Form.Item name="notes" style={{ margin: 0 }}>
                  <Input.TextArea rows={2} placeholder="비고 입력" />
                </Form.Item>
              </Descriptions.Item>
            </Descriptions>
          </Form>
        )}

        {/* 상품 정보와 첨부 문서를 나란히 배치 */}
        <Row gutter={24}>
          {/* 좌측: 상품 정보 */}
          <Col span={12}>
            <Title level={5} style={{ marginBottom: 16, borderBottom: '2px solid #1890ff', paddingBottom: 8 }}>
              상품 정보
            </Title>

            {/* 상품 정보 카드 */}
            <div style={{
              display: 'flex',
              gap: '16px',
              backgroundColor: '#f5f5f5',
              padding: '16px',
              borderRadius: '8px',
              marginBottom: 16
            }}>
              {/* 상품 이미지 */}
              {firstItem?.product_image_url ? (
                <img
                  src={getFileUrl(firstItem.product_image_url) || ''}
                  alt={firstItem.product_name}
                  style={{
                    width: 100,
                    height: 100,
                    objectFit: 'cover',
                    borderRadius: 8,
                    border: '1px solid #d9d9d9',
                    backgroundColor: '#fff'
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div style={{
                  width: 100,
                  height: 100,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#fff',
                  borderRadius: 8,
                  border: '1px solid #d9d9d9',
                  fontSize: 32
                }}>
                  📦
                </div>
              )}

              {/* 상품 정보 */}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '18px', marginBottom: 8 }}>
                  {firstItem?.product_name || '-'}
                </div>
                <div style={{ fontSize: '14px', color: '#666', marginBottom: 4 }}>
                  상품코드: {firstItem?.product_code || '-'}
                </div>
                <div style={{ fontSize: '14px', color: '#666', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  브랜드:
                  {firstItem?.brand_name && (
                    <img
                      src={getFileUrl(`/uploads/brands/${firstItem.brand_name.toLowerCase()}.png`) || ''}
                      alt={firstItem.brand_name}
                      style={{
                        width: 20,
                        height: 20,
                        objectFit: 'contain',
                        verticalAlign: 'middle'
                      }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                  <span>{firstItem?.brand_name || '-'}</span>
                </div>
              </div>
            </div>

            {/* 사이즈별 수량 테이블 */}
            <Table
              size="small"
              dataSource={sortedSizeEntries.map(([size, info]) => ({ size, ...info }))}
              columns={[
                {
                  title: '사이즈',
                  dataIndex: 'size',
                  key: 'size',
                  align: 'center',
                  width: 120,
                },
                {
                  title: '수량',
                  dataIndex: 'quantity',
                  key: 'quantity',
                  align: 'center',
                  width: 120,
                  render: (qty) => `${qty}개`,
                },
                {
                  title: '판매자 판매가',
                  dataIndex: 'sellerPrice',
                  key: 'sellerPrice',
                  align: 'right',
                  render: (price, record) => `₩${Math.floor(price * record.quantity).toLocaleString()}`,
                },
              ]}
              pagination={false}
              bordered
              rowKey="size"
              style={{ marginBottom: 16 }}
            />

            {/* 총계 */}
            <div style={{
              padding: '16px',
              backgroundColor: '#e6f7ff',
              borderRadius: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: '14px', color: '#666' }}>총 수량</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1890ff' }}>
                  {totalQuantity}개
                </div>
              </div>
              <div>
                <div style={{ fontSize: '14px', color: '#666', textAlign: 'right' }}>총 판매자 판매금액</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1890ff' }}>
                  ₩{Math.floor(totalSellerAmount).toLocaleString()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '14px', color: '#666', textAlign: 'right' }}>총 회사 판매금액</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1890ff' }}>
                  ₩{Math.floor(totalCompanyAmount).toLocaleString()}
                </div>
              </div>
            </div>
          </Col>

          {/* 우측: 첨부 문서 */}
          <Col span={12}>
            <Title level={5} style={{ marginBottom: 16, borderBottom: '2px solid #1890ff', paddingBottom: 8 }}>
              첨부 문서
            </Title>

            <Row gutter={16}>
              {/* 거래명세서 */}
              <Col span={12}>
                <Card
                  title={
                    <Space>
                      <FileExcelOutlined />
                      <span>거래명세서</span>
                    </Space>
                  }
                  size="small"
                >
                  {sale.transaction_statement_url && sale.transaction_statement_url !== '' ? (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {/* 엑셀 미리보기 바로 표시 */}
                      <div style={{ marginBottom: 16 }}>
                        <ExcelViewer saleId={id!} type="transaction-statement" />
                      </div>
                      <Button
                        icon={<DownloadOutlined />}
                        onClick={handleDownloadTransactionStatement}
                        block
                      >
                        다운로드
                      </Button>
                      {editMode && (
                        <Upload
                          beforeUpload={handleTransactionStatementUpload}
                          accept=".xlsx,.xls,.csv"
                          showUploadList={false}
                        >
                          <Button icon={<UploadOutlined />} block>
                            재업로드
                          </Button>
                        </Upload>
                      )}
                    </Space>
                  ) : (
                    <>
                      {editMode ? (
                        <Upload
                          beforeUpload={handleTransactionStatementUpload}
                          accept=".xlsx,.xls,.csv"
                          showUploadList={false}
                        >
                          <Button icon={<UploadOutlined />} block>
                            거래명세서 업로드
                          </Button>
                        </Upload>
                      ) : (
                        <div style={{
                          padding: '60px 20px',
                          textAlign: 'center',
                          border: '2px dashed #d9d9d9',
                          borderRadius: '8px',
                          backgroundColor: '#fafafa',
                          color: '#8c8c8c'
                        }}>
                          첨부된 거래명세서가 없습니다
                        </div>
                      )}
                    </>
                  )}
                </Card>
              </Col>

              {/* 세금계산서 */}
              <Col span={12}>
                <Card
                  title={
                    <Space>
                      <FileImageOutlined />
                      <span>세금계산서</span>
                    </Space>
                  }
                  size="small"
                >
                  {sale.tax_invoice_url && sale.tax_invoice_url !== '' ? (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {/* 이미지 미리보기 바로 표시 */}
                      {!sale.tax_invoice_url.endsWith('.pdf') ? (
                        <div style={{ marginBottom: 16, border: '1px solid #d9d9d9', borderRadius: 4, padding: 8 }}>
                          <Image
                            src={getFileUrl(`/uploads/${sale.tax_invoice_url}`) || ''}
                            alt="세금계산서"
                            style={{ width: '100%', height: 'auto', maxHeight: '500px', objectFit: 'contain' }}
                            preview={{
                              mask: '크게 보기'
                            }}
                          />
                        </div>
                      ) : (
                        <div style={{
                          marginBottom: 16,
                          padding: 32,
                          textAlign: 'center',
                          backgroundColor: '#f5f5f5',
                          borderRadius: 4
                        }}>
                          <FilePdfOutlined style={{ fontSize: 48, color: '#ff4d4f' }} />
                          <Text style={{ display: 'block', marginTop: 8 }}>
                            PDF 파일은 다운로드 후 확인하세요
                          </Text>
                        </div>
                      )}

                      <Button
                        icon={<DownloadOutlined />}
                        onClick={handleDownloadTaxInvoice}
                        block
                      >
                        다운로드
                      </Button>
                      {editMode && (
                        <Upload
                          beforeUpload={handleTaxInvoiceUpload}
                          accept=".jpg,.jpeg,.png,.pdf"
                          showUploadList={false}
                        >
                          <Button icon={<UploadOutlined />} block>
                            재업로드
                          </Button>
                        </Upload>
                      )}
                    </Space>
                  ) : (
                    <>
                      {editMode ? (
                        <Upload
                          beforeUpload={handleTaxInvoiceUpload}
                          accept=".jpg,.jpeg,.png,.pdf"
                          showUploadList={false}
                        >
                          <Button icon={<UploadOutlined />} block>
                            세금계산서 업로드
                          </Button>
                        </Upload>
                      ) : (
                        <div style={{
                          padding: '60px 20px',
                          textAlign: 'center',
                          border: '2px dashed #d9d9d9',
                          borderRadius: '8px',
                          backgroundColor: '#fafafa',
                          color: '#8c8c8c'
                        }}>
                          첨부된 세금계산서가 없습니다
                        </div>
                      )}
                    </>
                  )}
                </Card>
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

    </div>
  );
};

export default SaleDetailPage;