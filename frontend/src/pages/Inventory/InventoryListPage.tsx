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
  Popconfirm,
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
  DeleteOutlined,
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
  warehouse_name?: string;
  warehouse_location?: string;
  warehouse_image_url?: string;
  sizes: Array<{
    size: string;
    quantity: number;
    inventory_id: string;
    location?: string;
    warehouse_name?: string;
    warehouse_location?: string;
    warehouse_image_url?: string;
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
  const [stockAlertModalVisible, setStockAlertModalVisible] = useState(false);
  const [stockAlertType, setStockAlertType] = useState<'low' | 'out'>('low');
  const [detailEditMode, setDetailEditMode] = useState(false);
  const [detailForm] = Form.useForm();

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
            location: item.location,
            warehouse_name: item.warehouse_name,
            warehouse_location: item.warehouse_location,
            warehouse_image_url: item.warehouse_image_url
          });
          // warehouse_name이 있으면 업데이트 (null이 아닌 값 우선)
          if (item.warehouse_name && !existing.warehouse_name) {
            existing.warehouse_name = item.warehouse_name;
            existing.warehouse_location = item.warehouse_location;
            existing.warehouse_image_url = item.warehouse_image_url;
          }
        } else {
          acc.push({
            product_id: item.product_id,
            product_name: item.product_name,
            brand: item.brand,
            category: item.category,
            sku_code: item.sku_code,
            warehouse_name: item.warehouse_name,
            warehouse_location: item.warehouse_location,
            warehouse_image_url: item.warehouse_image_url,
            sizes: [{
              size: item.size,
              quantity: item.quantity,
              inventory_id: item.id,
              location: item.location,
              warehouse_name: item.warehouse_name,
              warehouse_location: item.warehouse_location,
              warehouse_image_url: item.warehouse_image_url
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
      setDetailEditMode(false);
      setDetailModalVisible(true);
    } catch (error: any) {
      console.error('상세 조회 에러:', error);
      message.error('재고 상세 정보 조회에 실패했습니다.');
    }
  };

    const handleDeleteInventory = async () => {
    try {
      if (!selectedInventoryDetail?.product_id) {
        message.error('삭제할 상품을 찾을 수 없습니다.');
        return;
      }

      console.log('삭제 대상 상세:', selectedInventoryDetail);

      // 백엔드 API 호출하여 재고 삭제 (구매/판매 이력 검증 포함)
      await inventoryService.deleteProductInventory(selectedInventoryDetail.product_id);

      message.success('재고가 삭제되었습니다.');
      setDetailModalVisible(false);
      setDetailEditMode(false);
      fetchInventory();
      fetchAllInventoryForStats();
    } catch (error: any) {
      console.error('재고 삭제 실패:', error);
      const errorMessage = error.response?.data?.detail || '재고 삭제에 실패했습니다.';
      message.error(errorMessage);
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

  const getColumns = (): ColumnsType<GroupedInventory> => {
    const baseColumns: ColumnsType<GroupedInventory> = [
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
      width: 100,
      render: (brandName: string, record) => {
        if (!brandName) return '-';
        const brand = brands.find(b => b.name === brandName);
        const iconUrl = getBrandIconUrl(brand?.icon_url);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {iconUrl && (
              <img
                src={iconUrl}
                alt={brandName}
                style={{ width: 24, height: 24, objectFit: 'contain' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <span style={{ fontSize: '13px' }}>{brandName}</span>
          </div>
        );
      },
    },
    {
      title: '상품 이미지',
      key: 'image',
      width: 80,
      render: (_, record) => {
        // API URL은 urlUtils의 getFileUrl 사용
        const imagePath = record.brand && record.sku_code
          ? getFileUrl(`/uploads/products/${record.brand}/${record.sku_code}.png`)
          : null;

        if (imagePath) {
          return (
            <div style={{ padding: '2px' }}>
              <img
                src={imagePath}
                alt={record.product_name}
                style={{
                  width: 50,
                  height: 50,
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
            </div>
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
      title: '사이즈별 재고 수량',
      key: 'inventory',
      width: 500,
      render: (_, record) => {
        // 카테고리별 고정 사이즈 정의
        const fixedSizes = record.category === 'shoes'
          ? ['220', '225', '230', '235', '240', '245', '250', '255', '260', '265', '270', '275', '280', '285', '290', '295', '300', '305', '310', '315']
          : ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

        // 사이즈별 수량 맵 생성
        const sizeMap = new Map();
        record.sizes?.forEach((sizeInfo: any) => {
          sizeMap.set(sizeInfo.size, sizeInfo.quantity);
        });

        // 신발은 10개씩 2행, 의류는 모두 1행
        const firstRow = record.category === 'shoes' ? fixedSizes.slice(0, 10) : fixedSizes;
        const secondRow = record.category === 'shoes' ? fixedSizes.slice(10) : [];

        const renderRow = (sizes: string[]) => (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4px' }}>
            <tbody>
              <tr>
                {sizes.map((size: string, index: number) => (
                  <td key={`size-${index}`} style={{
                    border: '1px solid #f0f0f0',
                    padding: '2px 4px',
                    textAlign: 'center',
                    fontSize: '11px',
                    backgroundColor: '#fafafa',
                    fontWeight: 500,
                    width: `${100 / sizes.length}%`
                  }}>
                    {size}
                  </td>
                ))}
              </tr>
              <tr>
                {sizes.map((size: string, index: number) => {
                  const qty = sizeMap.get(size) || 0;
                  return (
                    <td key={`qty-${index}`} style={{
                      border: '1px solid #f0f0f0',
                      padding: '2px 4px',
                      textAlign: 'center',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: qty > 0 ? '#1890ff' : '#d9d9d9',
                      width: `${100 / sizes.length}%`
                    }}>
                      {qty.toLocaleString()}개
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        );

        return (
          <div>
            {renderRow(firstRow)}
            {secondRow.length > 0 && renderRow(secondRow)}
          </div>
        );
      },
    },
    {
      title: '창고',
      key: 'warehouse',
      width: 130,
      render: (_, record) => {
        const warehouseName = record.warehouse_name || record.sizes?.[0]?.warehouse_name;
        const warehouseLocation = record.warehouse_location || record.sizes?.[0]?.warehouse_location;
        const warehouseImageUrl = record.warehouse_image_url || record.sizes?.[0]?.warehouse_image_url;

        if (!warehouseName) {
          return '-';
        }

        const imageUrl = warehouseImageUrl ? getFileUrl(warehouseImageUrl) : null;

        return (
          <div style={{ textAlign: 'center', padding: '2px' }}>
            <div style={{ marginBottom: '4px', fontSize: '12px', lineHeight: '1.3', fontWeight: 'bold' }}>
              [{warehouseName}] {warehouseLocation || ''}
            </div>
            {imageUrl && (
              <img
                src={imageUrl}
                alt={warehouseName}
                style={{
                  width: '100%',
                  height: '70px',
                  objectFit: 'contain',
                  borderRadius: '4px'
                }}
              />
            )}
          </div>
        );
      },
    },
    {
      title: '이력',
      key: 'action',
      width: 100,
      fixed: 'right' as 'right',
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<SearchOutlined />}
          onClick={() => handleViewDetail(record)}
        >
          이력
        </Button>
      ),
    },

  ];
    // 관리자가 아니면 작업 컬럼 제외
    if (user?.role !== 'admin') {
      return baseColumns.filter(col => col.key !== 'admin_action');
    }

    return baseColumns;
  };


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
            <div style={{ fontSize: 14, color: '#1890ff', fontWeight: 500, lineHeight: 1 }}>전체 재고</div>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#0050b3', lineHeight: 1 }}>{totalQuantity.toLocaleString()}개</div>
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
                      fontSize: 13,
                      fontWeight: 500,
                      color: '#1890ff',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>{brand.nameKr}</span>
                  </div>
                  <span style={{
                    fontSize: 15,
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
                      fontSize: 13,
                      fontWeight: 500,
                      color: '#1890ff',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>{category.nameKr}</span>
                  </div>
                  <span style={{
                    fontSize: 15,
                    fontWeight: 'bold',
                    color: '#0050b3'
                  }}>{category.count}개</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
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
        </Row>

        {/* 테이블 */}
        <Table
          columns={getColumns()}
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
        title={
          <span style={{ fontSize: 18, fontWeight: 700 }}>
            재고 상세 정보
            {detailEditMode && <Tag color="orange" style={{ marginLeft: 8 }}>수정 모드</Tag>}
          </span>
        }
        open={detailModalVisible}
        onCancel={() => {
          setDetailModalVisible(false);
          setDetailEditMode(false);
          detailForm.resetFields();
        }}
        footer={
          user?.role === 'admin' && selectedInventoryDetail ? (
            detailEditMode ? (
              <Space>
                <Button onClick={() => {
                  setDetailEditMode(false);
                  detailForm.resetFields();
                }}>
                  취소
                </Button>
                <Button type="primary" onClick={() => detailForm.submit()}>
                  저장
                </Button>
              </Space>
            ) : (
              <Space>
                <Popconfirm
                  title="재고 삭제"
                  description="이 상품의 모든 재고를 삭제하시겠습니까?"
                  onConfirm={handleDeleteInventory}
                  okText="삭제"
                  cancelText="취소"
                  okButtonProps={{ danger: true }}
                >
                  <Button danger icon={<DeleteOutlined />}>
                    삭제
                  </Button>
                </Popconfirm>
                <Button type="primary" icon={<EditOutlined />} onClick={() => {
                  setDetailEditMode(true);
                  const initialValues: any = {};
                  const fixedSizes = selectedInventoryDetail.category === 'shoes'
                    ? ['220', '225', '230', '235', '240', '245', '250', '255', '260', '265', '270', '275', '280', '285', '290', '295', '300', '305', '310', '315']
                    : ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

                  const sizeMap = new Map();
                  selectedInventoryDetail.size_inventories?.forEach((item: any) => {
                    sizeMap.set(item.size, item.quantity);
                  });

                  fixedSizes.forEach((size: string) => {
                    initialValues[`size_${size}`] = sizeMap.get(size) || 0;
                  });

                  detailForm.setFieldsValue(initialValues);
                }}>
                  재고 수정
                </Button>
                <Button onClick={() => {
                  setDetailModalVisible(false);
                  setDetailEditMode(false);
                }}>
                  닫기
                </Button>
              </Space>
            )
          ) : (
            <Button onClick={() => setDetailModalVisible(false)}>닫기</Button>
          )
        }
        width={1400}
      >
        {selectedInventoryDetail && (
          <Form
            form={detailForm}
            onFinish={async (values) => {
              try {
                console.log('Form 제출 시작, values:', values);
                console.log('selectedInventoryDetail:', selectedInventoryDetail);

                const fixedSizes = selectedInventoryDetail.category === 'shoes'
                  ? ['220', '225', '230', '235', '240', '245', '250', '255', '260', '265', '270', '275', '280', '285', '290', '295', '300', '305', '310', '315']
                  : ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

                console.log('fixedSizes:', fixedSizes);

                const sizeMap = new Map();
                selectedInventoryDetail.size_inventories?.forEach((item: any) => {
                  console.log('사이즈 맵에 추가:', item);
                  sizeMap.set(item.size, { quantity: item.quantity, id: item.id });
                });

                console.log('sizeMap:', Array.from(sizeMap.entries()));

                for (const size of fixedSizes) {
                  const newQuantity = values[`size_${size}`] || 0;
                  const sizeData = sizeMap.get(size);
                  const currentQuantity = sizeData?.quantity || 0;
                  const quantityChange = newQuantity - currentQuantity;

                  console.log(`사이즈 ${size}: 현재=${currentQuantity}, 새값=${newQuantity}, 변경량=${quantityChange}, ID=${sizeData?.id}`);

                  if (sizeData?.id) {
                    // 기존 재고가 있으면 수량 조정
                    if (quantityChange !== 0) {
                      console.log(`API 호출: adjustInventoryQuantity(${sizeData.id}, ${quantityChange}, '관리자 재고 수정')`);
                      await inventoryService.adjustInventoryQuantity(
                        sizeData.id,
                        quantityChange,
                        '관리자 재고 수정'
                      );
                    }
                  } else if (newQuantity > 0) {
                    // 재고가 없는 사이즈에 새로운 수량 추가
                    console.log(`API 호출: createInventoryForSize(${selectedInventoryDetail.product_id}, ${size}, ${newQuantity})`);
                    await inventoryService.createInventoryForSize(
                      selectedInventoryDetail.product_id,
                      size,
                      newQuantity
                    );
                  }
                }

                message.success('재고가 수정되었습니다.');
                setDetailEditMode(false);
                detailForm.resetFields();

                const updatedData = await inventoryService.getInventoryDetail(selectedInventoryDetail.product_id);
                setSelectedInventoryDetail(updatedData);

                fetchInventory();
                fetchAllInventoryForStats();
              } catch (error) {
                console.error('재고 수정 실패:', error);
                message.error('재고 수정에 실패했습니다.');
              }
            }}
          >
            <div>
            {/* 상단: 상품 정보(좌) + 사이즈별 재고(우) */}
            <Row gutter={24} style={{ marginBottom: 24 }}>
              {/* 왼쪽: 상품 정보 */}
              <Col span={12}>
                <div>
                  <h3 style={{
                    margin: 0,
                    marginBottom: 8,
                    paddingBottom: 8,
                    borderBottom: '1px solid #d9d9d9',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#595959'
                  }}>
                    상품 정보
                  </h3>
                  <div style={{ padding: 16, backgroundColor: '#f0f2f5', borderRadius: 8 }}>
                    <Row gutter={16}>
                      <Col span={8}>
                        {/* 상품 이미지 */}
                        {(() => {
                          const imagePath = selectedInventoryDetail.brand && selectedInventoryDetail.sku_code
                            ? getFileUrl(`/uploads/products/${selectedInventoryDetail.brand}/${selectedInventoryDetail.sku_code}.png`)
                            : null;

                          return imagePath ? (
                            <img
                              src={imagePath}
                              alt={selectedInventoryDetail.product_name}
                              style={{
                                width: '100%',
                                height: 'auto',
                                objectFit: 'cover',
                                borderRadius: '8px',
                                border: '1px solid #d9d9d9'
                              }}
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div style={{
                              width: '100%',
                              paddingTop: '100%',
                              backgroundColor: '#fafafa',
                              borderRadius: '8px',
                              border: '1px solid #d9d9d9',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#ccc',
                              position: 'relative'
                            }}>
                              <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                                이미지 없음
                              </span>
                            </div>
                          );
                        })()}
                      </Col>
                      <Col span={16}>
                        <div style={{ marginBottom: 12 }}>
                          <strong style={{ color: '#595959' }}>상품명:</strong>{' '}
                          <span style={{ fontSize: 15, fontWeight: 500 }}>{selectedInventoryDetail.product_name}</span>
                        </div>
                        <div style={{ marginBottom: 12 }}>
                          <strong style={{ color: '#595959' }}>브랜드:</strong>{' '}
                          <span style={{ fontSize: 15 }}>{selectedInventoryDetail.brand}</span>
                        </div>
                        <div style={{ marginBottom: 12 }}>
                          <strong style={{ color: '#595959' }}>카테고리:</strong>{' '}
                          <span style={{ fontSize: 15 }}>{selectedInventoryDetail.category}</span>
                        </div>
                        <div style={{ marginBottom: 12 }}>
                          <strong style={{ color: '#595959' }}>상품코드:</strong>{' '}
                          <Tag color="geekblue" style={{ fontSize: 13 }}>{selectedInventoryDetail.sku_code}</Tag>
                        </div>
                        <div>
                          <strong style={{ color: '#595959' }}>창고:</strong>{' '}
                          <span style={{ fontSize: 15 }}>
                            {(() => {
                              const warehouses = selectedInventoryDetail.size_inventories
                                ?.filter((item: any) => item.warehouse_name)
                                .map((item: any) => `[${item.warehouse_name}] ${item.warehouse_location || ''}`) || [];
                              const uniqueWarehouses = Array.from(new Set(warehouses));
                              return uniqueWarehouses.length > 0 ? uniqueWarehouses.join(', ') : '-';
                            })()}
                          </span>
                        </div>
                      </Col>
                    </Row>
                  </div>
                </div>
              </Col>

              {/* 오른쪽: 사이즈별 재고 */}
              <Col span={12}>
                <div>
                  <h3 style={{
                    margin: 0,
                    marginBottom: 16,
                    paddingBottom: 12,
                    borderBottom: '2px solid #1890ff',
                    fontSize: 16,
                    fontWeight: 600,
                    color: '#262626'
                  }}>
                    사이즈별 재고
                  </h3>
                  {(() => {
                    // 카테고리 확인
                    const isShoes = selectedInventoryDetail.category === 'shoes';

                    // 고정 사이즈 정의
                    const fixedSizes = isShoes
                      ? ['220', '225', '230', '235', '240', '245', '250', '255', '260', '265', '270', '275', '280', '285', '290', '295', '300', '305', '310', '315']
                      : ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

                    // 사이즈별 데이터 맵 생성
                    const sizeMap = new Map();
                    selectedInventoryDetail.size_inventories?.forEach((item: any) => {
                      sizeMap.set(item.size, { quantity: item.quantity, location: item.location, id: item.id });
                    });

                    // 창고 위치 중복 확인 및 병합 처리
                    const locations = selectedInventoryDetail.size_inventories?.map((item: any) => item.location || '-') || [];
                    const uniqueLocations = Array.from(new Set(locations));

                    // 신발은 10개씩 2행, 의류는 모두 1행
                    const firstRow = isShoes ? fixedSizes.slice(0, 10) : fixedSizes;
                    const secondRow = isShoes ? fixedSizes.slice(10) : [];

                    const renderSizeRow = (sizes: string[], rowIndex: number) => {
                      const locationForRow = uniqueLocations[rowIndex] || '-';

                      return (
                        <div key={rowIndex} style={{ marginBottom: 16 }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <tbody>
                              {/* 사이즈 행 */}
                              <tr>
                                {sizes.map((size: string, index: number) => (
                                  <td key={`size-${index}`} style={{
                                    border: '1px solid #f0f0f0',
                                    padding: '4px 6px',
                                    textAlign: 'center',
                                    fontSize: '11px',
                                    backgroundColor: '#fafafa',
                                    fontWeight: 500
                                  }}>
                                    {size}
                                  </td>
                                ))}
                              </tr>
                              {/* 수량 행 */}
                              <tr>
                                {sizes.map((size: string, index: number) => {
                                  const data = sizeMap.get(size);
                                  const qty = data?.quantity || 0;

                                  if (detailEditMode) {
                                    return (
                                      <td key={`qty-${index}`} style={{
                                        border: '1px solid #f0f0f0',
                                        padding: '2px',
                                        textAlign: 'center'
                                      }}>
                                        <Form.Item
                                          name={`size_${size}`}
                                          style={{ margin: 0 }}
                                          rules={[
                                            { required: true, message: '' },
                                            { type: 'number', min: 0, message: '' }
                                          ]}
                                        >
                                          <InputNumber
                                            min={0}
                                            size="small"
                                            style={{ width: '100%', textAlign: 'center' }}
                                            controls={false}
                                          />
                                        </Form.Item>
                                      </td>
                                    );
                                  }

                                  return (
                                    <td key={`qty-${index}`} style={{
                                      border: '1px solid #f0f0f0',
                                      padding: '4px 6px',
                                      textAlign: 'center',
                                      fontSize: '12px',
                                      fontWeight: 600,
                                      color: qty > 0 ? '#1890ff' : '#d9d9d9'
                                    }}>
                                      {qty.toLocaleString()}개
                                    </td>
                                  );
                                })}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      );
                    };

                    return (
                      <div>
                        {renderSizeRow(firstRow, 0)}
                        {secondRow.length > 0 && renderSizeRow(secondRow, 1)}
                      </div>
                    );
                  })()}
                </div>
              </Col>
            </Row>

            {/* 하단: 구매 이력(좌) + 판매 이력(우) */}
            <Row gutter={24}>
              {/* 왼쪽: 구매 이력 */}
              <Col span={12}>
                <div>
                  <h3 style={{
                    margin: 0,
                    marginBottom: 16,
                    paddingBottom: 12,
                    borderBottom: '2px solid #1890ff',
                    fontSize: 16,
                    fontWeight: 600,
                    color: '#262626'
                  }}>
                    <ShopOutlined style={{ marginRight: 8, color: '#52c41a' }} />
                    구매 이력 ({selectedInventoryDetail.purchase_history?.length || 0}건)
                  </h3>
                  <Table
                    dataSource={selectedInventoryDetail.purchase_history || []}
                    pagination={false}
                    size="small"
                    scroll={{ y: 240 }}
                    columns={[
                      {
                        title: '구매일',
                        dataIndex: 'purchase_date',
                        key: 'purchase_date',
                        width: 100,
                        render: (date: string) => new Date(date).toLocaleDateString('ko-KR')
                      },
                      {
                        title: '거래번호',
                        dataIndex: 'transaction_no',
                        key: 'transaction_no',
                        width: 130
                      },
                      {
                        title: '사이즈',
                        dataIndex: 'size',
                        key: 'size',
                        width: 70,
                        align: 'center' as 'center'
                      },
                      {
                        title: '수량',
                        dataIndex: 'quantity',
                        key: 'quantity',
                        width: 70,
                        align: 'center' as 'center',
                        render: (qty: number) => <Tag color="blue">{qty}개</Tag>
                      },
                      {
                        title: '구매가',
                        dataIndex: 'purchase_price',
                        key: 'purchase_price',
                        width: 110,
                        align: 'right' as 'right',
                        render: (price: number) => '₩' + price.toLocaleString()
                      }
                    ]}
                  />
                </div>
              </Col>

              {/* 오른쪽: 판매 이력 */}
              <Col span={12}>
                <div>
                  <h3 style={{
                    margin: 0,
                    marginBottom: 16,
                    paddingBottom: 12,
                    borderBottom: '2px solid #1890ff',
                    fontSize: 16,
                    fontWeight: 600,
                    color: '#262626'
                  }}>
                    <TagsOutlined style={{ marginRight: 8, color: '#1890ff' }} />
                    판매 이력 ({selectedInventoryDetail.sale_history?.length || 0}건)
                  </h3>
                  <Table
                    dataSource={selectedInventoryDetail.sale_history || []}
                    pagination={false}
                    size="small"
                    scroll={{ y: 240 }}
                    columns={[
                      {
                        title: '판매일',
                        dataIndex: 'sale_date',
                        key: 'sale_date',
                        width: 100,
                        render: (date: string) => new Date(date).toLocaleDateString('ko-KR')
                      },
                      {
                        title: '판매번호',
                        dataIndex: 'sale_number',
                        key: 'sale_number',
                        width: 130
                      },
                      {
                        title: '사이즈',
                        dataIndex: 'size',
                        key: 'size',
                        width: 70,
                        align: 'center' as 'center'
                      },
                      {
                        title: '수량',
                        dataIndex: 'quantity',
                        key: 'quantity',
                        width: 70,
                        align: 'center' as 'center',
                        render: (qty: number) => <Tag color="orange">{qty}개</Tag>
                      },
                      {
                        title: '판매가',
                        dataIndex: 'sale_price',
                        key: 'sale_price',
                        width: 110,
                        align: 'right' as 'right',
                        render: (price: number) => '₩' + price.toLocaleString()
                      }
                    ]}
                  />
                </div>
              </Col>
            </Row>
            </div>
          </Form>
        )}
      </Modal>


      {/* 재고 부족/품절 알림 모달 */}
      <Modal
        title={stockAlertType === 'low' ? '재고 부족 상품' : '품절 상품'}
        open={stockAlertModalVisible}
        onCancel={() => setStockAlertModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setStockAlertModalVisible(false)}>
            닫기
          </Button>
        ]}
        width={700}
      >
        <Table
          dataSource={
            stockAlertType === 'low' 
              ? allInventory.filter(item => item.is_low_stock && item.quantity > 0)
              : allInventory.filter(item => (item.available_quantity || 0) <= 0)
          }
          pagination={{ pageSize: 10 }}
          size="small"
          columns={[
            {
              title: '상품코드',
              dataIndex: 'sku_code',
              key: 'sku_code',
              width: 120,
              render: (code: string) => <Tag color="geekblue">{code}</Tag>
            },
            {
              title: '브랜드',
              dataIndex: 'brand',
              key: 'brand',
              width: 100
            },
            {
              title: '상품명',
              dataIndex: 'product_name',
              key: 'product_name',
              width: 200
            },
            {
              title: '사이즈',
              dataIndex: 'size',
              key: 'size',
              width: 80,
              align: 'center' as 'center'
            },
            {
              title: '재고',
              dataIndex: 'quantity',
              key: 'quantity',
              width: 80,
              align: 'center' as 'center',
              render: (qty: number) => (
                <Tag color={qty > 0 ? 'orange' : 'red'}>{qty}개</Tag>
              )
            }
          ]}
        />
      </Modal>


    </div>
  );
};

export default InventoryListPage;
