import React, { useState, useEffect } from 'react';
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
  App,
  Popconfirm,
  Switch,
  Modal,
  Checkbox,
  Divider,
  Empty,
  Descriptions,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ShoppingOutlined,
  TagsOutlined,
  CrownOutlined,
  ThunderboltOutlined,
  FireOutlined,
  StarOutlined,
  ManOutlined,
  GiftOutlined,
  BarcodeOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { Product } from '../../types/product';
import { productService } from '../../services/product';
import { barcodeService } from '../../services/barcode';
import { brandService, Brand } from '../../services/brand';
import { useAuth } from '../../contexts/AuthContext';
import { getBrandIconUrl } from '../../utils/imageUtils';
import BrandManagementModal from '../../components/BrandManagement/BrandManagementModal';
import { UnregisteredBarcodeModal } from '../../components/UnregisteredBarcodeModal';
import { getFileUrl } from '../../utils/urlUtils';

const { Search } = Input;
const { Option } = Select;

const ProductListPage: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]); // 통계용 전체 상품
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });
  const [filters, setFilters] = useState({
    search: '',
    brands: [] as string[],
  });
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [brandManagementVisible, setBrandManagementVisible] = useState(false);

  // 삭제 모달 관련 상태
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [relatedItems, setRelatedItems] = useState<any>(null);
  const [selectedForDelete, setSelectedForDelete] = useState<{
    barcodes: string[];
    inventories: string[];
    purchase_items: string[];
    sale_items: string[];
    deleteAll: boolean;
  }>({
    barcodes: [],
    inventories: [],
    purchase_items: [],
    sale_items: [],
    deleteAll: false,
  });

  // 바코드 스캔 관련 상태
  const [barcodeInputActive, setBarcodeInputActive] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [barcodeLookupModalVisible, setBarcodeLookupModalVisible] = useState(false);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [unregisteredBarcodeVisible, setUnregisteredBarcodeVisible] = useState(false);

  useEffect(() => {
    fetchBrands();
    fetchAllProductsForStats(); // 통계용 전체 상품 조회
    fetchProducts();
  }, [pagination.current, pagination.pageSize, filters]);

  const fetchBrands = async () => {
    try {
      const response = await brandService.getBrands();
      setBrands(response.items);
    } catch (error) {
      console.error('브랜드 목록 조회 실패:', error);
    }
  };

  const fetchAllProductsForStats = async () => {
    try {
      // 통계용으로 전체 상품 조회 (최대 1000개)
      const response = await productService.getProducts({
        skip: 0,
        limit: 1000,
      });
      setAllProducts(response.items);
    } catch (error) {
      console.error('전체 상품 조회 실패:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const response = await productService.getProducts({
        skip: (pagination.current - 1) * pagination.pageSize,
        limit: pagination.pageSize,
        search: filters.search || undefined,
        brand_ids: filters.brands.length > 0 ? filters.brands.join(',') : undefined,
      });
      setProducts(response.items);
      setTotal(response.total);
    } catch (error) {
      message.error('상품 목록 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };


  const handleDelete = async (productId: string) => {
    try {
      setLoading(true);
      // 연관 항목 조회
      const items = await productService.getRelatedItems(productId);
      setRelatedItems({ ...items, productId });
      setSelectedForDelete({
        barcodes: items.barcodes.map((b: any) => b.id),
        inventories: items.inventories.map((inv: any) => inv.id),
        purchase_items: items.purchase_items.map((pi: any) => pi.id),
        sale_items: items.sale_items.map((si: any) => si.id),
        deleteAll: false,
      });
      setDeleteModalVisible(true);
    } catch (error) {
      message.error('상품 정보 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    try {
      setLoading(true);
      await productService.deleteProductWithItems(relatedItems.productId, {
        delete_all: selectedForDelete.deleteAll,
        barcode_ids: selectedForDelete.barcodes,
        inventory_ids: selectedForDelete.inventories,
        purchase_item_ids: selectedForDelete.purchase_items,
        sale_item_ids: selectedForDelete.sale_items,
      });
      message.success('삭제되었습니다.');
      setDeleteModalVisible(false);
      fetchProducts();
      fetchAllProductsForStats();
    } catch (error) {
      message.error('삭제에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 선택된 상품 삭제
  const handleBulkDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('삭제할 상품을 선택해주세요');
      return;
    }

    try {
      setLoading(true);
      // 선택된 항목들을 순차적으로 삭제
      for (const key of selectedRowKeys) {
        await productService.deleteProduct(key as string);
      }
      message.success(`${selectedRowKeys.length}개 상품이 삭제되었습니다`);
      setSelectedRowKeys([]);
      fetchProducts();
      fetchAllProductsForStats();
    } catch (error) {
      message.error('일부 상품 삭제 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleTableChange = (newPagination: any) => {
    setPagination({
      current: newPagination.current,
      pageSize: newPagination.pageSize,
    });
  };

  // 성공 알림음 (깔끔한 음)
  const playSuccessSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
      console.log('알림음 재생 실패:', error);
    }
  };

  // 경고 알림음 (더 크고 잘 들리는 음)
  const playAlertSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // 높은 음으로 시작해서 낮은 음으로 끝나는 경고음
      oscillator.frequency.setValueAtTime(1200, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(900, audioContext.currentTime + 0.3);

      gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.4);
    } catch (error) {
      console.log('알림음 재생 실패:', error);
    }
  };

  // 바코드 스캔 핸들러
  const handleBarcodeInput = async (barcode: string) => {
    setScannedBarcode(barcode);
    setBarcodeLoading(true);
    try {
      // 바코드로 상품 조회
      const result = await barcodeService.searchByBarcode(barcode);
      if (result && result.product_id) {
        // 상품이 있으면 성공 알림음 재생하고 정보 표시
        playSuccessSound();
        setScannedProduct(result as any);
        setBarcodeLookupModalVisible(true);
      } else {
        // 상품이 없으면 경고 알림음 재생하고 미등록 상품 등록 모달 열기
        playAlertSound();
        setUnregisteredBarcodeVisible(true);
      }
    } catch (error) {
      console.error('바코드 조회 실패:', error);
      // 404 오류인 경우 경고 알림음 재생하고 미등록 상품으로 처리
      playAlertSound();
      setUnregisteredBarcodeVisible(true);
    } finally {
      setBarcodeLoading(false);
    }
  };

  // 이미지 경로 생성 함수
  const getImagePath = (productCode: string, brandName?: string) => {
    if (!brandName || !productCode) return null;
    // 개발 환경: 백엔드 API URL을 통해 접근
    // API URL은 urlUtils의 getFileUrl 사용
    return getFileUrl(`/uploads/products/${brandName}/${productCode}.png`);
  };

  // 브랜드 한글명 매핑
  const brandKoreanMap: { [key: string]: string } = {
    'Nike': '나이키',
    'Adidas': '아디다스',
    'Puma': '퓨마',
    'New Balance': '뉴발란스',
    'Supreme': '슈프림',
    'Stussy': '스투시',
    'The North Face': '노스페이스',
    'Reebok': '리복',
    'Converse': '컨버스',
    'Vans': '반스',
  };

  const columns: ColumnsType<Product> = [
    {
      title: '브랜드',
      dataIndex: 'brand_name',
      key: 'brand_name',
      width: 160,
      render: (brandName: string, record) => {
        if (!brandName) return '-';
        const koreanName = brandKoreanMap[brandName];
        const iconUrl = getBrandIconUrl(record.brand_icon_url);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {iconUrl && (
              <img
                src={iconUrl}
                alt={brandName}
                style={{
                  width: 32,
                  height: 32,
                  objectFit: 'contain'
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <span style={{ fontSize: '15px' }}>
              {brandName}
              {koreanName && <span style={{ color: '#8c8c8c' }}> ({koreanName})</span>}
            </span>
          </div>
        );
      },
    },
    {
      title: '상품 이미지',
      key: 'image',
      width: 90,
      render: (_, record) => {
        const imagePath = getImagePath(record.product_code, record.brand_name);
        if (imagePath) {
          return (
            <img
              src={imagePath}
              alt={record.product_name}
              style={{
                width: 70,
                height: 70,
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
                // 이미지 로드 실패시 기본 이미지 또는 숨김 처리
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
      dataIndex: 'product_code',
      key: 'product_code',
      width: 140,
      render: (code: string) => <Tag color="geekblue" style={{ fontSize: '14px', padding: '4px 10px' }}>{code}</Tag>,
    },
    {
      title: '상품명',
      dataIndex: 'product_name',
      key: 'product_name',
      width: 250,
      ellipsis: true,
      render: (text: string) => <span style={{ fontSize: '15px' }}>{text}</span>,
    },
    {
      title: '작업',
      key: 'action',
      width: 130,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            size="small"
            onClick={() => navigate(`/products/edit/${record.id}`)}
          >
            수정
          </Button>
          {user?.role === 'admin' && (
            <Popconfirm
              title="상품을 삭제하시겠습니까?"
              description="이 작업은 되돌릴 수 없습니다."
              onConfirm={() => handleDelete(record.id!)}
              okText="삭제"
              cancelText="취소"
            >
              <Button
                size="small"
                danger
              >
                삭제
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  // 브랜드명 매핑 - 향후 백엔드 API에서 브랜드 정보를 join해서 가져오도록 개선 필요

  // 특정 브랜드별 상품 수 계산 (전체 상품 기준)
  const getBrandCount = (brandName: string) => {
    return allProducts.filter(p => {
      const productBrand = p.brand_name || p.product_name || '';
      return productBrand.toLowerCase().includes(brandName.toLowerCase());
    }).length;
  };

  // 브랜드별 상품 수와 아이콘 정보 추출
  const getBrandInfo = (brandName: string) => {
    const filteredProducts = allProducts.filter(p =>
      p.brand_name && p.brand_name.toLowerCase().includes(brandName.toLowerCase())
    );

    // 브랜드 테이블에서 아이콘 찾기
    const brand = brands.find(b =>
      b.name.toLowerCase() === brandName.toLowerCase()
    );

    return {
      count: filteredProducts.length,
      iconUrl: getBrandIconUrl(brand?.icon_url)
    };
  };

  // 모든 브랜드 통계 계산
  const brandStats = [
    { name: 'Nike', nameKr: '나이키', ...getBrandInfo('Nike') },
    { name: 'Adidas', nameKr: '아디다스', ...getBrandInfo('Adidas') },
    { name: 'Puma', nameKr: '퓨마', ...getBrandInfo('Puma') },
    { name: 'New Balance', nameKr: '뉴발란스', ...getBrandInfo('New Balance') },
    { name: 'Supreme', nameKr: '슈프림', ...getBrandInfo('Supreme') },
    { name: 'Stussy', nameKr: '스투시', ...getBrandInfo('Stussy') },
    { name: 'The North Face', nameKr: '노스페이스', ...getBrandInfo('The North Face') },
  ].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.nameKr.localeCompare(b.nameKr, 'ko');
  }).slice(0, 7);

  // 통계 카드 스타일
  const cardStyle = {
    borderRadius: '8px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    border: '1px solid #e8e8e8',
    height: '100%'
  };

  const smallCardStyle = {
    borderRadius: '8px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    border: '1px solid #e8e8e8',
    padding: '10px 14px',
    height: '48px',
    display: 'flex',
    alignItems: 'center'
  };

  return (
    <div style={{ padding: '16px' }}>
      {/* 통계 카드 컨테이너 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: 16 }}>
        {/* 전체 상품 카드 (2줄 높이) */}
        <Card style={{
          ...cardStyle,
          width: '12.5%',
          minWidth: '120px',
          height: '104px',
          backgroundColor: '#ffffff',
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
            <div style={{ fontSize: 14, color: '#0d1b2a', fontWeight: 500, lineHeight: 1 }}>등록된 상품</div>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#0d1b2a', lineHeight: 1 }}>{total}개</div>
          </div>
        </Card>

        {/* 브랜드와 카테고리 카드 그룹 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* 브랜드 통계 카드 (상단) */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {brandStats.map((brand) => (
              <Card key={brand.name} style={{
                ...smallCardStyle,
                flex: 1,
                width: 0,
                backgroundColor: '#ffffff'
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
                      color: '#0d1b2a',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>{brand.nameKr}</span>
                  </div>
                  <span style={{
                    fontSize: 15,
                    fontWeight: 'bold',
                    color: '#0d1b2a',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}>{brand.count}개</span>
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
        {/* 숨겨진 바코드 입력 필드 */}
        <input
          type="text"
          style={{ position: 'absolute', left: '-9999px' }}
          value={scannedBarcode}
          onChange={(e) => {
            const barcode = e.target.value.trim();
            if (barcode && barcodeInputActive) {
              handleBarcodeInput(barcode);
              setScannedBarcode('');
              e.target.value = '';
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && scannedBarcode && barcodeInputActive) {
              handleBarcodeInput(scannedBarcode);
              setScannedBarcode('');
              e.currentTarget.value = '';
            }
          }}
          placeholder="바코드를 스캔하세요"
          autoFocus={barcodeInputActive}
        />

        {/* 필터 영역 */}
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Search
              placeholder="상품명, 상품코드 검색"
              allowClear
              onSearch={(value) => setFilters({ ...filters, search: value })}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={5}>
            <Select
              mode="multiple"
              placeholder="브랜드 선택"
              allowClear
              style={{ width: '100%' }}
              value={filters.brands}
              onChange={(value) => setFilters({ ...filters, brands: value })}
              maxTagCount="responsive"
            >
              {brands.map((brand) => (
                <Option key={brand.id} value={brand.id}>
                  {brand.name}
                </Option>
              ))}
            </Select>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <Space>
              <Button
                icon={<BarcodeOutlined />}
                type={barcodeInputActive ? 'primary' : 'default'}
                onClick={() => setBarcodeInputActive(!barcodeInputActive)}
                loading={barcodeLoading}
              >
                {barcodeInputActive ? '바코드 스캔 중...' : '상품 조회'}
              </Button>
              {user?.role === 'admin' && selectedRowKeys.length > 0 && (
                <Popconfirm
                  title="선택한 상품을 삭제하시겠습니까?"
                  description={`${selectedRowKeys.length}개 상품이 삭제됩니다.`}
                  onConfirm={handleBulkDelete}
                  okText="삭제"
                  cancelText="취소"
                >
                  <Button danger icon={<DeleteOutlined />}>
                    선택 삭제 ({selectedRowKeys.length})
                  </Button>
                </Popconfirm>
              )}
              {user?.role === 'admin' && (
                <>
                  <Button
                    icon={<TagsOutlined />}
                    onClick={() => setBrandManagementVisible(true)}
                  >
                    브랜드 관리
                  </Button>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => navigate('/products/new')}
                    style={{ backgroundColor: '#0d1117', borderColor: '#0d1117' }}
                  >
                    상품 등록
                  </Button>
                </>
              )}
            </Space>
          </Col>
        </Row>

        {/* 테이블 */}
        <Table
          columns={columns}
          dataSource={products}
          loading={loading}
          rowKey="id"
          rowSelection={
            user?.role === 'admin'
              ? {
                  selectedRowKeys,
                  onChange: (selectedKeys: React.Key[]) => {
                    setSelectedRowKeys(selectedKeys);
                  },
                }
              : undefined
          }
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `총 ${total}개`,
          }}
          onChange={handleTableChange}
          scroll={{ x: 800 }}
          size="middle"
        />
      </Card>

      {/* 삭제 확인 모달 */}
      <Modal
        title={relatedItems ? `${relatedItems.product.product_name} 삭제` : '상품 삭제'}
        open={deleteModalVisible}
        onCancel={() => setDeleteModalVisible(false)}
        width={700}
        footer={[
          <Button key="cancel" onClick={() => setDeleteModalVisible(false)}>
            취소
          </Button>,
          <Button
            key="submit"
            type="primary"
            danger
            loading={loading}
            onClick={handleConfirmDelete}
          >
            삭제
          </Button>,
        ]}
      >
        {relatedItems && (
          <div>
            <div style={{ marginBottom: 20, padding: '12px', backgroundColor: '#fff7e6', borderRadius: '4px' }}>
              <div style={{ fontSize: '14px' }}>
                <strong>{relatedItems.product.product_code}</strong> - {relatedItems.product.product_name}
              </div>
            </div>

            {/* 전체 삭제 옵션 */}
            <div style={{ marginBottom: 20 }}>
              <Checkbox
                checked={selectedForDelete.deleteAll}
                onChange={(e) =>
                  setSelectedForDelete({
                    ...selectedForDelete,
                    deleteAll: e.target.checked,
                    barcodes: e.target.checked ? relatedItems.barcodes.map((b: any) => b.id) : [],
                    inventories: e.target.checked ? relatedItems.inventories.map((inv: any) => inv.id) : [],
                    purchase_items: e.target.checked ? relatedItems.purchase_items.map((pi: any) => pi.id) : [],
                    sale_items: e.target.checked ? relatedItems.sale_items.map((si: any) => si.id) : [],
                  })
                }
              >
                <strong>전체 삭제 (상품 + 모든 관련 항목)</strong>
              </Checkbox>
            </div>

            {!selectedForDelete.deleteAll && (
              <>
                {/* 바코드 */}
                {relatedItems.barcodes.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#666' }}>
                      바코드 ({relatedItems.barcodes.length}개)
                    </div>
                    <div style={{ paddingLeft: 24 }}>
                      {relatedItems.barcodes.map((barcode: any) => (
                        <div key={barcode.id} style={{ marginBottom: 8 }}>
                          <Checkbox
                            checked={selectedForDelete.barcodes.includes(barcode.id)}
                            onChange={(e) => {
                              const newIds = e.target.checked
                                ? [...selectedForDelete.barcodes, barcode.id]
                                : selectedForDelete.barcodes.filter((id) => id !== barcode.id);
                              setSelectedForDelete({
                                ...selectedForDelete,
                                barcodes: newIds,
                              });
                            }}
                          >
                            {barcode.size}: {barcode.barcode_value}
                          </Checkbox>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 재고 */}
                {relatedItems.inventories.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#666' }}>
                      재고 ({relatedItems.inventories.length}개)
                    </div>
                    <div style={{ paddingLeft: 24 }}>
                      {relatedItems.inventories.map((inventory: any) => (
                        <div key={inventory.id} style={{ marginBottom: 8 }}>
                          <Checkbox
                            checked={selectedForDelete.inventories.includes(inventory.id)}
                            onChange={(e) => {
                              const newIds = e.target.checked
                                ? [...selectedForDelete.inventories, inventory.id]
                                : selectedForDelete.inventories.filter((id) => id !== inventory.id);
                              setSelectedForDelete({
                                ...selectedForDelete,
                                inventories: newIds,
                              });
                            }}
                          >
                            {inventory.size}: {inventory.quantity}개
                          </Checkbox>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 구매 항목 */}
                {relatedItems.purchase_items.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#666' }}>
                      구매 항목 ({relatedItems.purchase_items.length}개)
                    </div>
                    <div style={{ paddingLeft: 24 }}>
                      {relatedItems.purchase_items.map((item: any, index: number) => (
                        <div key={item.id} style={{ marginBottom: 8 }}>
                          <Checkbox
                            checked={selectedForDelete.purchase_items.includes(item.id)}
                            onChange={(e) => {
                              const newIds = e.target.checked
                                ? [...selectedForDelete.purchase_items, item.id]
                                : selectedForDelete.purchase_items.filter((id) => id !== item.id);
                              setSelectedForDelete({
                                ...selectedForDelete,
                                purchase_items: newIds,
                              });
                            }}
                          >
                            구매 항목 #{index + 1}: {item.quantity}개
                          </Checkbox>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 판매 항목 */}
                {relatedItems.sale_items.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#666' }}>
                      판매 항목 ({relatedItems.sale_items.length}개)
                    </div>
                    <div style={{ paddingLeft: 24 }}>
                      {relatedItems.sale_items.map((item: any, index: number) => (
                        <div key={item.id} style={{ marginBottom: 8 }}>
                          <Checkbox
                            checked={selectedForDelete.sale_items.includes(item.id)}
                            onChange={(e) => {
                              const newIds = e.target.checked
                                ? [...selectedForDelete.sale_items, item.id]
                                : selectedForDelete.sale_items.filter((id) => id !== item.id);
                              setSelectedForDelete({
                                ...selectedForDelete,
                                sale_items: newIds,
                              });
                            }}
                          >
                            판매 항목 #{index + 1}: {item.quantity}개
                          </Checkbox>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 관련 항목이 없는 경우 */}
                {relatedItems.barcodes.length === 0 &&
                  relatedItems.inventories.length === 0 &&
                  relatedItems.purchase_items.length === 0 &&
                  relatedItems.sale_items.length === 0 && (
                    <Empty description="관련 항목이 없습니다. 상품만 삭제됩니다." />
                  )}
              </>
            )}
          </div>
        )}
      </Modal>

      {/* 바코드 조회 결과 모달 */}
      <Modal
        title="상품 조회 결과"
        open={barcodeLookupModalVisible}
        onCancel={() => {
          setBarcodeLookupModalVisible(false);
          setScannedProduct(null);
          setBarcodeInputActive(true);
        }}
        footer={[
          <Button key="cancel" onClick={() => {
            setBarcodeLookupModalVisible(false);
            setScannedProduct(null);
            setBarcodeInputActive(true);
          }}>
            계속 스캔
          </Button>,
          <Button key="edit" type="primary" onClick={() => {
            setBarcodeLookupModalVisible(false);
            navigate(`/products/${scannedProduct?.id}`);
          }}>
            상품 수정
          </Button>,
        ]}
        width={600}
      >
        {scannedProduct && (
          <Descriptions column={1} bordered style={{ marginTop: 16 }}>
            <Descriptions.Item label="상품명">
              {scannedProduct.product_name}
            </Descriptions.Item>
            <Descriptions.Item label="상품코드">
              {scannedProduct.product_code}
            </Descriptions.Item>
            <Descriptions.Item label="브랜드">
              {scannedProduct.brand_name}
            </Descriptions.Item>
            <Descriptions.Item label="설명">
              {scannedProduct.description || '-'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* 미등록 바코드 모달 */}
      <UnregisteredBarcodeModal
        barcode={scannedBarcode}
        visible={unregisteredBarcodeVisible}
        onSuccess={(newProduct) => {
          message.success('상품이 등록되었습니다');
          setUnregisteredBarcodeVisible(false);
          setScannedProduct(newProduct);
          setBarcodeLookupModalVisible(true);
          fetchProducts();
          fetchAllProductsForStats();
          setBarcodeInputActive(true);
        }}
        onCancel={() => {
          setUnregisteredBarcodeVisible(false);
          setBarcodeInputActive(true);
        }}
      />

      <BrandManagementModal
        visible={brandManagementVisible}
        onClose={() => setBrandManagementVisible(false)}
        onBrandUpdate={fetchBrands}
      />

    </div>
  );
};

export default ProductListPage;