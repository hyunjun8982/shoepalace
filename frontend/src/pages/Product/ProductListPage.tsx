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
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { Product } from '../../types/product';
import { productService } from '../../services/product';
import { brandService, Brand } from '../../services/brand';
import { categoryService, Category } from '../../services/category';
import { useAuth } from '../../contexts/AuthContext';
import { getBrandIconUrl } from '../../utils/imageUtils';
import BrandManagementModal from '../../components/BrandManagement/BrandManagementModal';
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });
  const [filters, setFilters] = useState({
    search: '',
    categories: [] as string[],
    brands: [] as string[],
  });
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [brandManagementVisible, setBrandManagementVisible] = useState(false);

  useEffect(() => {
    fetchBrands();
    fetchCategories();
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

  const fetchCategories = async () => {
    try {
      const response = await categoryService.getCategories();
      setCategories(response.items);
    } catch (error) {
      console.error('카테고리 목록 조회 실패:', error);
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
        categories: filters.categories.length > 0 ? filters.categories.join(',') : undefined,
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
      await productService.deleteProduct(productId);
      message.success('상품이 삭제되었습니다.');
      fetchProducts();
      fetchAllProductsForStats();
    } catch (error) {
      message.error('상품 삭제에 실패했습니다.');
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
      title: '카테고리',
      dataIndex: 'category',
      key: 'category',
      width: 80,
      render: (category: string) => {
        const categoryMap: { [key: string]: string } = {
          clothing: '의류',
          shoes: '신발',
          hats: '모자',
          socks: '양말',
          bags: '가방',
          accessories: '액세서리',
          'Men Shoes': '남성 신발',
        };
        return <Tag color="blue" style={{ fontSize: '14px', padding: '4px 10px' }}>{categoryMap[category] || category}</Tag>;
      },
    },
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
      title: '수정 및 삭제',
      key: 'action',
      width: 130,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            icon={<EditOutlined />}
            onClick={() => navigate(`/products/edit/${record.id}`)}
            title="수정"
          />
          {user?.role === 'admin' && (
            <Popconfirm
              title="상품을 삭제하시겠습니까?"
              description="이 작업은 되돌릴 수 없습니다."
              onConfirm={() => handleDelete(record.id!)}
              okText="삭제"
              cancelText="취소"
            >
              <Button
                danger
                icon={<DeleteOutlined />}
                title="삭제"
              />
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

  // 특정 카테고리별 상품 수 계산 (전체 상품 기준)
  const getCategoryCount = (category: string) => {
    return allProducts.filter(p => p.category === category).length;
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

  // 카테고리 통계 계산 (고정 순서)
  const categoryStats = [
    { name: 'clothing', nameKr: '의류', count: getCategoryCount('clothing'), icon: '👕' },
    { name: 'shoes', nameKr: '신발', count: getCategoryCount('shoes'), icon: '👟' },
    { name: 'hats', nameKr: '모자', count: getCategoryCount('hats'), icon: '🧢' },
    { name: 'socks', nameKr: '양말', count: getCategoryCount('socks'), icon: '🧦' },
    { name: 'bags', nameKr: '가방', count: getCategoryCount('bags'), icon: '🎒' },
    { name: 'accessories', nameKr: '잡화', count: getCategoryCount('accessories'), icon: '🛍️' },
    { name: 'etc', nameKr: '기타', count: getCategoryCount('etc'), icon: '📦' },
  ];

  // 통계 카드 스타일
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
      {/* 통계 카드 컨테이너 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: 16 }}>
        {/* 전체 상품 카드 (2줄 높이) */}
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
            gap: '8px'
          }}>
            <div style={{ fontSize: 14, color: '#1890ff', fontWeight: 500, lineHeight: 1 }}>등록된 상품</div>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#0050b3', lineHeight: 1 }}>{total}개</div>
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

          {/* 카테고리 통계 카드 (하단) */}
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
                    color: '#0050b3',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
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
              placeholder="카테고리 선택"
              allowClear
              style={{ width: '100%' }}
              value={filters.categories}
              onChange={(value) => setFilters({ ...filters, categories: value })}
              maxTagCount="responsive"
            >
              {categories.map((category) => (
                <Option key={category.id} value={category.name}>
                  {category.icon} {category.name_kr}
                </Option>
              ))}
            </Select>
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
    

      <BrandManagementModal
        visible={brandManagementVisible}
        onClose={() => setBrandManagementVisible(false)}
        onBrandUpdate={fetchBrands}
      />

    </div>
  );
};

export default ProductListPage;