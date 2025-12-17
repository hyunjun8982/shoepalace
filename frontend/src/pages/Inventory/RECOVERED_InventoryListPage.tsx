import React, { useState, useEffect } from 'react';
import './InventoryListPage.css';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Input,
  Select,
  Row,
  Col,
  Badge,
  App,
  Modal,
  Form,
  InputNumber,
  Tooltip,
} from 'antd';
import {
  SearchOutlined,
  EditOutlined,
  SwapOutlined,
  AlertOutlined,
  DownloadOutlined,
  PlusCircleOutlined,
  MinusCircleOutlined,
  InboxOutlined,
  AppstoreOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  ShopOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { InventoryDetail, AdjustmentType, InventoryAdjustmentCreate } from '../../types/inventory';
import { inventoryService } from '../../services/inventory';
import { useAuth } from '../../contexts/AuthContext';
import { getBrandIconUrl } from '../../utils/imageUtils';
import { brandService, Brand } from '../../services/brand';
import { getFileUrl } from '../../utils/urlUtils';


// 그룹화된 재고 타입
interface GroupedInventory {
  product_id: string;
  product_name: string;
  brand: string;
  category: string;
  sku_code: string;
  sizes: Array<{
    size: string;
    quantity: number;
    inventory_id: string;
    location?: string;
  }>;
}

const { Search } = Input;
const { Option } = Select;
const { TextArea } = Input;

const InventoryListPage: React.FC = () => {
  const { message } = App.useApp();
  const { user } = useAuth();
  const [inventory, setInventory] = useState<InventoryDetail[]>([]);
  const [groupedInventory, setGroupedInventory] = useState<GroupedInventory[]>([]);
  const [allInventory, setAllInventory] = useState<InventoryDetail[]>([]); // 통계용 전체 재고
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });
  const [filters, setFilters] = useState({
    search: '',
    category: undefined as string | undefined,
    low_stock_only: false,
  });
  const [adjustModalVisible, setAdjustModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<InventoryDetail | null>(null);
  const [selectedInventoryDetail, setSelectedInventoryDetail] = useState<any>(null);
  const [adjustForm] = Form.useForm();

  const fetchBrands = async () => {
    try {
      const response = await brandService.getBrands();
      setBrands(response.items);
    } catch (error) {
      console.error('브랜드 목록 조회 실패:', error);
    }
  };

  useEffect(() => {
    fetchBrands();
    fetchAllInventoryForStats(); // 통계용 전체 재고 조회
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [pagination.current, pagination.pageSize, filters]);

  const fetchAllInventoryForStats = async () => {
    try {
      // 통계용으로 전체 재고 조회 (최대 10000개)
      const response = await inventoryService.getInventoryList({
        skip: 0,
        limit: 10000,
      });
      setAllInventory(response.items);
    } catch (error: any) {
      console.error('전체 재고 조회 실패:', error);
      console.error('에러 응답:', JSON.stringify(error.response?.data, null, 2));
    }
  };

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const response = await inventoryService.getInventoryList({
        skip: 0,  // 그룹화를 위해 전체 조회
        limit: 10000,
        ...filters,
      });
      setInventory(response.items);
      
      // 상품별로 그룹화 (product_id 기준)
      const grouped = response.items.reduce((acc: any, item: any) => {
        const existing = acc.find((g: any) => g.product_id === item.product_id);
        if (existing) {
          existing.sizes.push({
            size: item.size,
            quantity: item.quantity,
            inventory_id: item.id,
            location: item.location
          });
        } else {
          acc.push({
            product_id: item.product_id,
            product_name: item.product_name,
            brand: item.brand,
            category: item.category,
            sku_code: item.sku_code,
            sizes: [{
              size: item.size,
              quantity: item.quantity,
              inventory_id: item.id,
              location: item.location
            }]
          });
        }
        return acc;
      }, []);
      
      // 페이지네이션 적용
      const start = (pagination.current - 1) * pagination.pageSize;
      const end = start + pagination.pageSize;
      setGroupedInventory(grouped.slice(start, end));
      setTotal(grouped.length);
    } catch (error: any) {
      console.error('재고 조회 에러 상세:', JSON.stringify(error.response?.data, null, 2));
      console.error('에러 전체:', error);
      message.error('재고 목록 조회에 실패했습니다: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleAdjustment = (record: InventoryDetail) => {
    setSelectedProduct(record);
    adjustForm.resetFields();
    adjustForm.setFieldsValue({
      product_id: record.product_id,
      quantity: 0,
    });
    setAdjustModalVisible(true);
  };

  const handleViewDetail = async (record: GroupedInventory) => {
    try {
      if (!record.product_id) {
        message.error('상품 ID가 없습니다.');
        return;
      }
      console.log('상세 조회 요청 product_id:', record.product_id);
      const data = await inventoryService.getInventoryDetail(record.product_id);
      console.log('상세 조회 응답:', data);
      setSelectedInventoryDetail(data);
      setDetailModalVisible(true);
    } catch (error: any) {
      console.error('상세 조회 에러:', error);
      message.error('재고 상세 정보 조회에 실패했습니다.');
    }
  };

    const handleAdjustmentSubmit = async (values: any) => {
    try {
      const adjustmentData: InventoryAdjustmentCreate = {
        product_id: values.product_id,
        adjustment_type: values.adjustment_type,
        quantity: values.adjustment_type === AdjustmentType.SALE ||
                  values.adjustment_type === AdjustmentType.DAMAGE ?
                  -Math.abs(values.quantity) : Math.abs(values.quantity),
        notes: values.notes,
      };

      await inventoryService.createAdjustment(adjustmentData);
      message.success('재고 조정이 완료되었습니다.');
      setAdjustModalVisible(false);
      fetchInventory();
      fetchAllInventoryForStats();
    } catch (error) {
      message.error('재고 조정에 실패했습니다.');
    }
  };

  const getStockStatus = (available: number, minLevel: number) => {
    if (available <= 0) {
      return <Tag color="error">품절</Tag>;
    } else if (available <= minLevel) {
      return <Tag color="warning">재고 부족</Tag>;
    } else if (available <= minLevel * 2) {
      return <Tag color="orange">재고 주의</Tag>;
    }
    return <Tag color="success">정상</Tag>;
  };

  const columns: ColumnsType<GroupedInventory> = [
    {
      title: 'No.',
      key: 'serial',
      width: 60,
      align: 'center' as 'center',
      render: (_: any, __: any, index: number) => {
        return total - (pagination.current - 1) * pagination.pageSize - index;
      },
    },
    {
      title: '카테고리',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (category: string) => {
        const categoryMap: Record<string, string> = {
          'clothing': '👕 의류',
          'shoes': '👟 신발',
          'hats': '🧢 모자',
          'socks': '🧦 양말',
          'bags': '🎒 가방',
          'accessories': '🛍️ 잡화',
          'etc': '📦 기타'
        };
        return categoryMap[category] || category || '-';
      },
    },
    {
      title: '브랜드',
      dataIndex: 'brand',
      key: 'brand',
      width: 140,
      render: (brandName: string, record) => {
        if (!brandName) return '-';
        const brand = brands.find(b => b.name === brandName);
        const iconUrl = getBrandIconUrl(brand?.icon_url);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {iconUrl && (
              <img
                src={iconUrl}
                alt={brandName}
                style={{ width: 32, height: 32, objectFit: 'contain' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <span style={{ fontSize: '14px' }}>{brandName}</span>
          </div>
        );
      },
    },
    {
      title: '상품 이미지',
      key: 'image',
      width: 90,
      render: (_, record) => {
        // API URL은 urlUtils의 getFileUrl 사용
        const imagePath = record.brand && record.sku_code
          ? getFileUrl(`/uploads/products/${record.brand}/${record.sku_code}.png`)
          : null;

        if (imagePath) {
          return (
            <img
              src={imagePath}
              alt={record.product_name}
              style={{
                width: 60,
                height: 60,
                objectFit: 'cover',
                borderRadius: '4px',
                border: '1px solid #f0f0f0',
                cursor: 'pointer'
              }}
              onClick={() => {
                const modal = document.createElement('div');
                modal.style.cssText = `
                  position: fixed;
                  top: 0;
                  left: 0;
                  width: 100%;
                  height: 100%;
                  background: rgba(0,0,0,0.8);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  z-index: 9999;
                  cursor: pointer;
                `;
                modal.onclick = () => modal.remove();

                const img = document.createElement('img');
                img.src = imagePath;
                img.style.cssText = `
                  max-width: 90%;
                  max-height: 90%;
                  object-fit: contain;
                  border-radius: 8px;
                `;

                modal.appendChild(img);
                document.body.appendChild(modal);
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          );
        }
        return <span style={{ color: '#ccc' }}>-</span>;
      },
    },
    {
      title: '상품코드',
      dataIndex: 'sku_code',
      key: 'sku_code',
      width: 120,
      render: (code: string) => <Tag color="geekblue" style={{ fontSize: '13px' }}>{code || '-'}</Tag>,
    },
    {
      title: '상품명',
      dataIndex: 'product_name',
      key: 'product_name',
      width: 200,
      render: (name: string) => (
        <span style={{ fontWeight: 500, fontSize: '14px' }}>{name}</span>
      ),
    },
    {
      title: '재고 (사이즈별)',
      key: 'inventory',
      width: 250,
      render: (_, record) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {record.sizes?.map((sizeInfo: any, index: number) => (
            <Tag 
              key={index}
              color={sizeInfo.quantity > 0 ? 'green' : 'red'} 
              style={{ margin: 0, fontSize: '13px' }}
            >
              {sizeInfo.size}: {sizeInfo.quantity}개
            </Tag>
          ))}
        </div>
      ),
    },
    {
      title: '창고 위치',
      key: 'location',
      width: 150,
      render: (_, record) => {
        const locations = record.sizes?.map((s: any) => s.location).filter((l: any) => l);
        const uniqueLocations = Array.from(new Set(locations));
        return uniqueLocations.join(', ') || '-';
      },
    },
    {
      title: '작업',
      key: 'action',
      width: 180,
      fixed: 'right' as 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<SearchOutlined />}
            onClick={() => handleViewDetail(record)}
          >
            상세
          </Button>
        </Space>
      ),
    },
  ];


  // 통계 계산 (전체 데이터 기준)
  const totalQuantity = allInventory.reduce((sum, item) => sum + item.quantity, 0);
  const totalAvailable = allInventory.reduce((sum, item) => sum + (item.available_quantity || 0), 0);
  const lowStockCount = allInventory.filter(item => item.is_low_stock).length;
  const outOfStockCount = allInventory.filter(item => (item.available_quantity || 0) <= 0).length;

  // 브랜드별 재고 통계 (고정 브랜드 목록)
  const getBrandInventory = (brandName: string) => {
    return allInventory
      .filter(item => item.brand === brandName)
      .reduce((sum, item) => sum + item.quantity, 0);
  };

  const getBrandInfo = (brandName: string) => {
    // 브랜드 테이블에서 아이콘 찾기
    const brand = brands.find(b =>
      b.name.toLowerCase() === brandName.toLowerCase()
    );

    return {
      count: getBrandInventory(brandName),
      iconUrl: getBrandIconUrl(brand?.icon_url)
    };
  };


  const brandStats = [
    { name: 'Nike', nameKr: '나이키', ...getBrandInfo('Nike') },
    { name: 'Adidas', nameKr: '아디다스', ...getBrandInfo('Adidas') },
    { name: 'New Balance', nameKr: '뉴발란스', ...getBrandInfo('New Balance') },
    { name: 'Converse', nameKr: '컨버스', ...getBrandInfo('Converse') },
    { name: 'Vans', nameKr: '반스', ...getBrandInfo('Vans') },
    { name: 'Puma', nameKr: '퓨마', ...getBrandInfo('Puma') },
    { name: 'Asics', nameKr: '아식스', ...getBrandInfo('Asics') },
  ].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.nameKr.localeCompare(b.nameKr, 'ko');
  }).slice(0, 7);

  // 카테고리별 재고 통계 (고정 순서)
  const getCategoryInventory = (categoryName: string) => {
    return allInventory
      .filter(item => item.category === categoryName)
      .reduce((sum, item) => sum + item.quantity, 0);
  };

  const categoryStats = [
    { name: 'clothing', nameKr: '의류', count: getCategoryInventory('clothing'), icon: '👕' },
    { name: 'shoes', nameKr: '신발', count: getCategoryInventory('shoes'), icon: '👟' },
    { name: 'hats', nameKr: '모자', count: getCategoryInventory('hats'), icon: '🧢' },
    { name: 'socks', nameKr: '양말', count: getCategoryInventory('socks'), icon: '🧦' },
    { name: 'bags', nameKr: '가방', count: getCategoryInventory('bags'), icon: '🎒' },
    { name: 'accessories', nameKr: '잡화', count: getCategoryInventory('accessories'), icon: '🛍️' },
    { name: 'etc', nameKr: '기타', count: getCategoryInventory('etc'), icon: '📦' },
  ];

  // 통계 카드 스타일 (상품 관리 페이지와 동일)
  const cardStyle = {
    borderRadius: '8px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    border: '1px solid #e8f4fd',
    height: '100%'
  };

  const smallCardStyle = {
    borderRadius: '8px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    border: '1px solid #e8f4fd',
    padding: '10px 14px',
    height: '48px',
    display: 'flex',
    alignItems: 'center'
  };

  return (
    <div style={{ padding: '16px' }}>
      {/* 통계 카드 컨테이너 - 상품 관리와 동일한 스타일 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: 16 }}>
        {/* 전체 재고 카드 (왼쪽, 2줄 높이) */}
        <Card style={{
          ...cardStyle,
          width: '12.5%',
          minWidth: '120px',
          height: '104px',
          backgroundColor: '#f0f8ff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px'
          }}>
            <div style={{ fontSize: 18, color: '#1890ff', fontWeight: 500, lineHeight: 1 }}>전체 재고</div>
            <div style={{ fontSize: 32, fontWeight: 'bold', color: '#0050b3', lineHeight: 1 }}>{totalQuantity.toLocaleString()}개</div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
              가용 {totalAvailable.toLocaleString()}개
            </div>
          </div>
        </Card>

        {/* 브랜드와 카테고리 카드 그룹 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* 브랜드별 재고 (상단) */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {brandStats.map((brand) => (
              <Card key={brand.name} style={{
                ...smallCardStyle,
                flex: 1,
                width: 0,
                backgroundColor: '#f0f8ff'
              }}>
                <div style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    minWidth: 0,
                    flex: 1
                  }}>
                    {brand.iconUrl && (
                      <img
                        src={brand.iconUrl}
                        alt={brand.name}
                        style={{
                          width: 32,
                          height: 32,
                          objectFit: 'contain',
                          flexShrink: 0
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    <span style={{
                      fontSize: 16,
                      fontWeight: 500,
                      color: '#1890ff',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>{brand.nameKr}</span>
                  </div>
                  <span style={{
                    fontSize: 18,
                    fontWeight: 'bold',
                    color: '#0050b3',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}>{brand.count}개</span>
                </div>
              </Card>
            ))}
          </div>

          {/* 카테고리별 재고 (하단) */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {categoryStats.map((category) => (
              <Card key={category.name} style={{
                ...smallCardStyle,
                flex: 1,
                width: 0,
                backgroundColor: '#f0f8ff'
              }}>
                <div style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    minWidth: 0,
                    flex: 1
                  }}>
                    <span style={{
                      fontSize: 20,
                      opacity: 0.7,
                      flexShrink: 0
                    }}>{category.icon}</span>
                    <span style={{
                      fontSize: 16,
                      fontWeight: 500,
                      color: '#1890ff',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>{category.nameKr}</span>
                  </div>
                  <span style={{
                    fontSize: 18,
                    fontWeight: 'bold',
                    color: '#0050b3'
                  }}>{category.count}개</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* 재고 상태 요약 카드 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: 16 }}>
        <Card style={{
          ...smallCardStyle,
          flex: 1,
          backgroundColor: '#fff7e6',
          borderColor: '#ffd591'
        }}>
          <div style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <Space>
              <WarningOutlined style={{ fontSize: 20, color: '#fa8c16' }} />
              <span style={{ fontSize: 16, fontWeight: 500, color: '#fa8c16' }}>재고 부족</span>
            </Space>
            <span style={{ fontSize: 20, fontWeight: 'bold', color: '#d46b08' }}>{lowStockCount}개</span>
          </div>
        </Card>
        <Card style={{
          ...smallCardStyle,
          flex: 1,
          backgroundColor: '#fff1f0',
          borderColor: '#ffccc7'
        }}>
          <div style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <Space>
              <CloseCircleOutlined style={{ fontSize: 20, color: '#ff4d4f' }} />
              <span style={{ fontSize: 16, fontWeight: 500, color: '#ff4d4f' }}>품절</span>
            </Space>
            <span style={{ fontSize: 20, fontWeight: 'bold', color: '#cf1322' }}>{outOfStockCount}개</span>
          </div>
        </Card>
      </div>

      <Card
        style={{
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
        }}
      >
        {/* 필터 영역 */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <Search
              placeholder="상품명, 브랜드, SKU 검색"
              allowClear
              onSearch={(value) => setFilters({ ...filters, search: value })}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={4}>
            <Select
              placeholder="카테고리"
              allowClear
              style={{ width: '100%' }}
              onChange={(value) => setFilters({ ...filters, category: value })}
            >
              <Option value="shoes">신발</Option>
              <Option value="clothing">의류</Option>
              <Option value="accessories">액세서리</Option>
            </Select>
          </Col>
          <Col span={4}>
            <Select
              placeholder="재고 상태"
              allowClear
              style={{ width: '100%' }}
              onChange={(value) => setFilters({ ...filters, low_stock_only: value === 'low' })}
            >
              <Option value="all">전체</Option>
              <Option value="low">재고 부족</Option>
            </Select>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <Button icon={<DownloadOutlined />}>
              엑셀 다운로드
            </Button>
          </Col>
        </Row>

        {/* 테이블 */}
        <Table
          columns={columns}
          dataSource={groupedInventory}
          loading={loading}
          rowKey="product_id"
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `총 ${total}개`,
            onChange: (page, pageSize) => {
              setPagination({ current: page, pageSize: pageSize || 10 });
            },
          }}
          rowClassName={(record) => ''}
        />
      </Card>

      {/* 재고 조정 모달 */}
      <Modal
        title="재고 조정"
        open={adjustModalVisible}
        onCancel={() => setAdjustModalVisible(false)}
        footer={null}
        width={500}
      >
        {selectedProduct && (
          <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f0f2f5', borderRadius: 4 }}>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>{selectedProduct.product_name}</div>
            <Space size="middle" style={{ fontSize: 12 }}>
              <span>현재 재고: <strong>{selectedProduct.quantity}</strong></span>
              <span>가용 재고: <strong>{selectedProduct.available_quantity}</strong></span>
            </Space>
          </div>
        )}

        <Form
          form={adjustForm}
          layout="vertical"
          onFinish={handleAdjustmentSubmit}
        >
          <Form.Item name="product_id" hidden>
            <Input />
          </Form.Item>

          <Form.Item
            label="조정 유형"
            name="adjustment_type"
            rules={[{ required: true, message: '조정 유형을 선택해주세요.' }]}
          >
            <Select placeholder="조정 유형 선택">
              <Option value={AdjustmentType.PURCHASE}>
                <PlusCircleOutlined style={{ color: '#52c41a' }} /> 구매 입고
              </Option>
              <Option value={AdjustmentType.RETURN}>
                <PlusCircleOutlined style={{ color: '#1890ff' }} /> 반품 입고
              </Option>
              <Option value={AdjustmentType.SALE}>
                <MinusCircleOutlined style={{ color: '#faad14' }} /> 판매 출고
              </Option>
              <Option value={AdjustmentType.DAMAGE}>
                <MinusCircleOutlined style={{ color: '#ff4d4f' }} /> 파손/손실
              </Option>
              <Option value={AdjustmentType.ADJUSTMENT}>
                <SwapOutlined /> 재고 조정
              </Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="수량"
            name="quantity"
            rules={[
              { required: true, message: '수량을 입력해주세요.' },
              { type: 'number', min: 1, message: '1개 이상 입력해주세요.' }
            ]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="메모" name="notes">
            <TextArea rows={3} placeholder="조정 사유를 입력하세요" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setAdjustModalVisible(false)}>
                취소
              </Button>
              <Button type="primary" htmlType="submit">
                조정 확인
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 재고 상세 모달 (구매/판매 이력 포함) */}
      <Modal
        title="재고 상세 정보"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            닫기
          </Button>
        ]}
        width={900}
      >
        {selectedInventoryDetail && (
          <div>
            {/* 상품 기본 정보 */}
            <div style={{ marginBottom: 24, padding: 16, backgroundColor: '#f0f2f5', borderRadius: 8 }}>
              <Row gutter={16}>
                <Col span={24}>
                  <div style={{ marginBottom: 8 }}>
                    <strong>상품명:</strong> {selectedInventoryDetail.product_name}
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <strong>브랜드:</strong> {selectedInventoryDetail.brand}
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <strong>카테고리:</strong> {selectedInventoryDetail.category}
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <strong>상품코드:</strong> {selectedInventoryDetail.sku_code}
                  </div>
                </Col>
              </Row>
              
              {/* 사이즈별 재고 정보 */}
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #d9d9d9' }}>
                <strong style={{ display: 'block', marginBottom: 12 }}>사이즈별 재고:</strong>
                <Table
                  dataSource={selectedInventoryDetail.size_inventories?.sort((a: any, b: any) => {
                    // 사이즈를 숫자로 변환하여 정렬 (숫자가 아닌 경우 문자열 정렬)
                    const aNum = parseFloat(a.size);
                    const bNum = parseFloat(b.size);
                    if (!isNaN(aNum) && !isNaN(bNum)) {
                      return aNum - bNum;
                    }
                    return a.size.localeCompare(b.size);
                  })}
                  pagination={false}
                  size="small"
                  columns={[
                    {
                      title: '사이즈',
                      dataIndex: 'size',
                      key: 'size',
                      width: 100,
                      align: 'center' as 'center'
                    },
                    {
                      title: '수량',
                      dataIndex: 'quantity',
                      key: 'quantity',
                      width: 100,
                      align: 'center' as 'center',
                      render: (qty: number) => (
                        <Tag color={qty > 0 ? 'green' : 'red'}>
                          {qty}개
                        </Tag>
                      )
                    },
                    {
                      title: '창고 위치',
                      dataIndex: 'location',
                      key: 'location',
                      align: 'center' as 'center',
                      render: (location: string) => location || '-'
                    }
                  ]}
                />
              </div>
            </div>

            {/* 구매 이력 */}
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 12 }}>
                <ShopOutlined style={{ marginRight: 8, color: '#52c41a' }} />
                구매 이력 ({selectedInventoryDetail.purchase_history?.length || 0}건)
              </h3>
              <Table
                dataSource={selectedInventoryDetail.purchase_history || []}
                pagination={false}
                size="small"
                scroll={{ y: 200 }}
                columns={[
                  {
                    title: '구매일',
                    dataIndex: 'purchase_date',
                    key: 'purchase_date',
                    width: 120,
                    render: (date: string) => new Date(date).toLocaleDateString('ko-KR')
                  },
                  {
                    title: '거래번호',
                    dataIndex: 'transaction_no',
                    key: 'transaction_no',
                    width: 150
                  },
                  {
                    title: '사이즈',
                    dataIndex: 'size',
                    key: 'size',
                    width: 80,
                    align: 'center' as 'center'
                  },
                  {
                    title: '수량',
                    dataIndex: 'quantity',
                    key: 'quantity',
                    width: 80,
                    align: 'center' as 'center',
                    render: (qty: number) => <Tag color="blue">{qty}개</Tag>
                  },
                  {
                    title: '구매가',
                    dataIndex: 'purchase_price',
                    key: 'purchase_price',
                    width: 120,
                    align: 'right' as 'right',
                    render: (price: number) => '₩' + price.toLocaleString()
                  },
                  {
                    title: '공급처',
                    dataIndex: 'supplier',
                    key: 'supplier',
                    width: 150
                  },
                  {
                    title: '구매자',
                    dataIndex: 'buyer_name',
                    key: 'buyer_name',
                    width: 100
                  }
                ]}
              />
            </div>

            {/* 판매 이력 */}
            <div>
              <h3 style={{ marginBottom: 12 }}>
                <TagsOutlined style={{ marginRight: 8, color: '#1890ff' }} />
                판매 이력 ({selectedInventoryDetail.sale_history?.length || 0}건)
              </h3>
              <Table
                dataSource={selectedInventoryDetail.sale_history || []}
                pagination={false}
                size="small"
                scroll={{ y: 200 }}
                columns={[
                  {
                    title: '판매일',
                    dataIndex: 'sale_date',
                    key: 'sale_date',
                    width: 120,
                    render: (date: string) => new Date(date).toLocaleDateString('ko-KR')
                  },
                  {
                    title: '판매번호',
                    dataIndex: 'sale_number',
                    key: 'sale_number',
                    width: 150
                  },
                  {
                    title: '사이즈',
                    dataIndex: 'size',
                    key: 'size',
                    width: 80,
                    align: 'center' as 'center'
                  },
                  {
                    title: '수량',
                    dataIndex: 'quantity',
                    key: 'quantity',
                    width: 80,
                    align: 'center' as 'center',
                    render: (qty: number) => <Tag color="orange">{qty}개</Tag>
                  },
                  {
                    title: '판매가',
                    dataIndex: 'sale_price',
                    key: 'sale_price',
                    width: 120,
                    align: 'right' as 'right',
                    render: (price: number) => '₩' + price.toLocaleString()
                  },
                  {
                    title: '고객',
                    dataIndex: 'customer_name',
                    key: 'customer_name',
                    width: 150
                  },
                  {
                    title: '판매자',
                    dataIndex: 'seller_name',
                    key: 'seller_name',
                    width: 100
                  }
                ]}
              />
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
};

export default InventoryListPage;