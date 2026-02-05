import React, { useState, useEffect } from 'react';
import {
  Card,
  Tabs,
  Button,
  message,
  Typography,
  Spin,
  Modal,
  Form,
  InputNumber,
  Space,
  Image,
  Row,
  Col,
  Pagination,
  List,
  Tooltip,
  Input,
  Popconfirm,
  Select,
  Tag,
  Table,
} from 'antd';
import { ShopOutlined, SwapOutlined } from '@ant-design/icons';
import { poizonProductsService, PoizonProduct, PriceInfo } from '../../services/poizonProducts';
import { naverShoppingService, NaverSeller } from '../../services/naverShopping';
import { naverShoppingFilterService, NaverFilter } from '../../services/naverShoppingFilter';
import { poizonService, SizeWithPrice } from '../../services/poizon';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';

dayjs.extend(relativeTime);
dayjs.locale('ko');

const { Text, Link } = Typography;

type BrandKey = 'adidas' | 'nike' | 'jordan' | 'adidas_originals';

interface BrandInfo {
  key: BrandKey;
  label: string;
  color: string;
}

const BRANDS: BrandInfo[] = [
  { key: 'adidas', label: '아디다스', color: '#000000' },
  { key: 'nike', label: '나이키', color: '#111111' },
  { key: 'jordan', label: '조던', color: '#E4002B' },
  { key: 'adidas_originals', label: '아디다스 오리지널', color: '#0D4BA3' },
];

const ProductSellerFinderPage: React.FC = () => {
  const [activeBrand, setActiveBrand] = useState<BrandKey>('adidas');
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<PoizonProduct[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalFetched, setTotalFetched] = useState(0);
  const [syncModalVisible, setSyncModalVisible] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [form] = Form.useForm();

  // 네이버쇼핑 판매처 데이터
  const [naverSellerData, setNaverSellerData] = useState<Map<string, NaverSeller[]>>(new Map());
  const [searchingProducts, setSearchingProducts] = useState<Set<string>>(new Set());

  // 더 보기 모달
  const [sellerModalVisible, setSellerModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<PoizonProduct | null>(null);

  // 필터 관리
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filters, setFilters] = useState<NaverFilter[]>([]);
  const [filterLoading, setFilterLoading] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');
  const [addingFilter, setAddingFilter] = useState(false);

  // 가격 모달
  const [priceModalVisible, setPriceModalVisible] = useState(false);
  const [selectedPriceProduct, setSelectedPriceProduct] = useState<PoizonProduct | null>(null);
  const [sizesWithPrices, setSizesWithPrices] = useState<SizeWithPrice[]>([]);
  const [priceLoading, setPriceLoading] = useState(false);

  // 포이즌 가격 정보 (사이즈별 상세 모달용)
  const [priceData, setPriceData] = useState<Map<number, PriceInfo[]>>(new Map());

  // 가격비교 모달
  const [compareModalVisible, setCompareModalVisible] = useState(false);
  const [compareProduct, setCompareProduct] = useState<PoizonProduct | null>(null);

  // 사이즈별 가격 상세 모달
  const [sizeDetailModalVisible, setSizeDetailModalVisible] = useState(false);
  const [sizeDetailProduct, setSizeDetailProduct] = useState<PoizonProduct | null>(null);

  const pageSize = 20;

  // 평균가 계산 함수
  const calculateAveragePrice = (prices: PriceInfo[], type: 'small' | 'large' | 'apparel'): number | null => {
    if (!prices || prices.length === 0) return null;

    let filteredPrices: PriceInfo[];

    if (type === 'small') {
      // 신발 소형: 220-250
      filteredPrices = prices.filter(p => {
        const size = parseInt(p.size_kr);
        return !isNaN(size) && size >= 220 && size <= 250;
      });
    } else if (type === 'large') {
      // 신발 대형: 255-290
      filteredPrices = prices.filter(p => {
        const size = parseInt(p.size_kr);
        return !isNaN(size) && size >= 255 && size <= 290;
      });
    } else {
      // 의류: XS~XXXXL
      const apparelSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'];
      filteredPrices = prices.filter(p => apparelSizes.includes(p.size_kr.toUpperCase()));
    }

    const validPrices = filteredPrices.filter(p => p.average_price !== null && p.average_price > 0);
    if (validPrices.length === 0) return null;

    const sum = validPrices.reduce((acc, p) => acc + (p.average_price || 0), 0);
    return Math.round(sum / validPrices.length);
  };

  // 상품이 신발인지 의류인지 판별
  const isApparel = (product: PoizonProduct): boolean => {
    const category = product.level1_category_name?.toLowerCase() || '';
    return category.includes('의류') || category.includes('옷') || category.includes('apparel') || category.includes('clothing');
  };

  // 브랜드 변경 시 DB에서 상품 조회
  useEffect(() => {
    loadProducts(activeBrand);
    loadLastUpdate(activeBrand);
    // 네이버쇼핑 검색 결과 및 가격 정보 초기화
    setNaverSellerData(new Map());
    setPriceData(new Map());
  }, [activeBrand]);

  // 페이지 변경 시 또는 상품 로드 완료 시 자동으로 네이버쇼핑 검색
  useEffect(() => {
    if (products.length > 0) {
      searchCurrentPageProducts();
    }
  }, [currentPage, products]);

  const loadProducts = async (brandKey: BrandKey) => {
    setLoading(true);
    try {
      const response = await poizonProductsService.getProductsByBrand(brandKey);

      setProducts(response.products);
      setTotalFetched(response.total);
      setCurrentPage(1);

      if (response.total === 0) {
        message.info(`${response.brand_name} 상품이 없습니다. 먼저 업데이트를 진행하세요.`);
      }
    } catch (error: any) {
      console.error('상품 조회 실패:', error);
      message.error(error.response?.data?.detail || '상품 조회에 실패했습니다.');
      setProducts([]);
      setTotalFetched(0);
    } finally {
      setLoading(false);
    }
  };

  const loadLastUpdate = async (brandKey: BrandKey) => {
    try {
      const response = await poizonProductsService.getLastUpdate(brandKey);
      if (response.last_update) {
        setLastUpdate(response.last_update);
      } else {
        setLastUpdate(null);
      }
    } catch (error) {
      console.error('마지막 업데이트 시간 조회 실패:', error);
      setLastUpdate(null);
    }
  };

  const searchNaverSellers = async (productCode: string) => {
    // 이미 검색 중이면 무시
    if (searchingProducts.has(productCode)) {
      return;
    }

    // 검색 중 상태 추가
    setSearchingProducts(prev => new Set(prev).add(productCode));

    try {
      const response = await naverShoppingService.searchProduct(productCode);

      // 결과 저장
      setNaverSellerData(prev => {
        const newMap = new Map(prev);
        newMap.set(productCode, response.sellers);
        return newMap;
      });

      // 판매처 없음 알림 제거 (조용히 처리)
    } catch (error: any) {
      console.error('네이버쇼핑 검색 실패:', error);
      message.error(`${productCode} 검색 실패: ${error.response?.data?.detail || error.message}`);
    } finally {
      // 검색 중 상태 제거
      setSearchingProducts(prev => {
        const newSet = new Set(prev);
        newSet.delete(productCode);
        return newSet;
      });
    }
  };

  const handleReload = () => {
    setNaverSellerData(new Map()); // 판매처 데이터 초기화
    setPriceData(new Map()); // 사이즈별 가격 데이터 초기화
    loadProducts(activeBrand);
    loadLastUpdate(activeBrand);
  };

  // 동시 요청 수 제한하며 병렬 처리 (throttle)
  const throttledPromiseAll = async <T,>(
    tasks: (() => Promise<T>)[],
    concurrency: number = 3,
    delayMs: number = 100
  ): Promise<T[]> => {
    const results: T[] = [];
    const executing: Set<Promise<void>> = new Set();

    for (const task of tasks) {
      const p = (async () => {
        const result = await task();
        results.push(result);
        // 각 요청 후 약간의 딜레이
        await new Promise(resolve => setTimeout(resolve, delayMs));
      })();

      executing.add(p);
      p.finally(() => executing.delete(p));

      // 동시 실행 수가 concurrency에 도달하면 하나가 완료될 때까지 대기
      if (executing.size >= concurrency) {
        await Promise.race(executing);
      }
    }

    // 남은 모든 작업 완료 대기
    await Promise.all(executing);
    return results;
  };

  const searchCurrentPageProducts = async () => {
    // 현재 페이지의 상품들만 검색
    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = startIdx + pageSize;
    const visibleProducts = products.slice(startIdx, endIdx);

    // 이미 검색된 상품 제외
    const productsToSearch = visibleProducts.filter(
      p => !naverSellerData.has(p.article_number) && !searchingProducts.has(p.article_number)
    );

    if (productsToSearch.length === 0) {
      return;
    }

    // 동시 요청 3개로 제한하여 병렬 처리 (429 에러 방지)
    await throttledPromiseAll(
      productsToSearch.map(product => () => searchNaverSellers(product.article_number)),
      3,  // 동시 요청 최대 3개
      100 // 각 요청 후 100ms 딜레이
    );
  };

  const handleSync = async (values: { endPage: number }) => {
    setSyncLoading(true);
    try {
      const response = await poizonProductsService.syncBrandProducts(
        activeBrand,
        values.endPage
      );

      message.success(response.message);
      setSyncModalVisible(false);
      form.resetFields();

      // 백그라운드에서 처리 중이므로 잠시 후 새로고침
      setTimeout(() => {
        loadProducts(activeBrand);
        loadLastUpdate(activeBrand);
      }, 2000);
    } catch (error: any) {
      console.error('업데이트 실패:', error);
      message.error(error.response?.data?.detail || '업데이트에 실패했습니다.');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleShowAllSellers = (product: PoizonProduct) => {
    setSelectedProduct(product);
    setSellerModalVisible(true);
  };

  const loadFilters = async () => {
    setFilterLoading(true);
    try {
      const filterList = await naverShoppingFilterService.getFilters();
      setFilters(filterList);
    } catch (error: any) {
      console.error('필터 조회 실패:', error);
      message.error(error.response?.data?.detail || '필터 조회에 실패했습니다.');
    } finally {
      setFilterLoading(false);
    }
  };

  const handleOpenFilterModal = () => {
    setFilterModalVisible(true);
    loadFilters();
  };

  const handleAddFilter = async () => {
    if (!newFilterName.trim()) {
      message.warning('판매처명을 입력하세요.');
      return;
    }

    setAddingFilter(true);
    try {
      await naverShoppingFilterService.createFilter({ mall_name: newFilterName.trim() });
      message.success('필터가 추가되었습니다.');
      setNewFilterName('');
      loadFilters();
    } catch (error: any) {
      console.error('필터 추가 실패:', error);
      message.error(error.response?.data?.detail || '필터 추가에 실패했습니다.');
    } finally {
      setAddingFilter(false);
    }
  };

  const handleDeleteFilter = async (filterId: number, mallName: string) => {
    try {
      await naverShoppingFilterService.deleteFilter(filterId);
      message.success(`필터가 삭제되었습니다: ${mallName}`);
      loadFilters();
    } catch (error: any) {
      console.error('필터 삭제 실패:', error);
      message.error(error.response?.data?.detail || '필터 삭제에 실패했습니다.');
    }
  };

  // 가격 확인 버튼 클릭
  const handleOpenPriceModal = async (product: PoizonProduct) => {
    if (!product.spu_id) {
      message.warning('이 상품은 SPU ID가 없어 가격 조회를 할 수 없습니다.');
      return;
    }

    setSelectedPriceProduct(product);
    setPriceModalVisible(true);
    setSizesWithPrices([]);
    setPriceLoading(true);

    try {
      // 모든 사이즈와 가격 정보 한번에 조회
      const response = await poizonService.getProductPrices(product.spu_id);
      setSizesWithPrices(response.sizes);

      if (response.sizes.length === 0) {
        message.info('사이즈 정보가 없습니다.');
      }
    } catch (error: any) {
      console.error('가격 조회 실패:', error);
      message.error('가격 정보를 가져오는데 실패했습니다.');
    } finally {
      setPriceLoading(false);
    }
  };

  // 현재 페이지의 상품들
  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = startIdx + pageSize;
  const currentProducts = products.slice(startIdx, endIdx);

  // 포이즌 평균가 표시 (상품 데이터에서 바로 사용) - 항상 2줄로 고정
  const renderPriceInfo = (product: PoizonProduct) => {
    const apparel = isApparel(product);

    if (apparel) {
      // 의류도 2줄로 표시 (높이 일관성)
      return (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 9 }}>S-XXL</Text>
            <Text strong style={{ fontSize: 9, color: '#006400' }}>
              {product.avg_price_apparel ? `${product.avg_price_apparel.toLocaleString()}원` : '-'}
            </Text>
          </div>
          <div style={{ height: 13 }} /> {/* 빈 공간으로 높이 맞춤 */}
        </>
      );
    } else {
      return (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 9 }}>220-250</Text>
            <Text strong style={{ fontSize: 9, color: '#006400' }}>
              {product.avg_price_small ? `${product.avg_price_small.toLocaleString()}원` : '-'}
            </Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 9 }}>255-290</Text>
            <Text strong style={{ fontSize: 9, color: '#006400' }}>
              {product.avg_price_large ? `${product.avg_price_large.toLocaleString()}원` : '-'}
            </Text>
          </div>
        </>
      );
    }
  };

  const renderSellerInfo = (product: PoizonProduct) => {
    const productCode = product.article_number;
    const sellers = naverSellerData.get(productCode);
    const isSearching = searchingProducts.has(productCode);
    const hasSellers = sellers && sellers.length > 0;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* POIZON 평균가 - 고정 높이 */}
        <div
          style={{
            marginBottom: 6,
            padding: '4px 6px',
            background: 'rgba(0, 32, 96, 0.08)',
            borderRadius: 4,
            height: 48,
            cursor: product.spu_id ? 'pointer' : 'default',
          }}
          onClick={async () => {
            if (product.spu_id) {
              setSizeDetailProduct(product);
              setSizeDetailModalVisible(true);
              // 사이즈별 가격 정보가 없으면 API 호출
              if (!priceData.has(product.spu_id)) {
                try {
                  const response = await poizonProductsService.getBatchPrices([product.spu_id]);
                  setPriceData(prev => {
                    const newMap = new Map(prev);
                    Object.entries(response.prices).forEach(([spuId, prices]) => {
                      newMap.set(parseInt(spuId), prices as PriceInfo[]);
                    });
                    return newMap;
                  });
                } catch (error) {
                  console.error('사이즈별 가격 정보 로드 실패:', error);
                }
              }
            }
          }}
        >
          <Text style={{ fontSize: 8, color: '#002060', display: 'block', marginBottom: 2 }}>POIZON 평균가</Text>
          {renderPriceInfo(product)}
        </div>

        {/* 판매처 목록 - 고정 높이 */}
        <div style={{ height: 150, marginBottom: 6, overflowY: 'auto' }}>
          {isSearching || !sellers ? (
            <div style={{ textAlign: 'center', paddingTop: 40 }}>
              <Spin size="small" />
              <div style={{ marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 9 }}>검색 중...</Text>
              </div>
            </div>
          ) : sellers.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 45 }}>
              <Text type="secondary" style={{ fontSize: 9 }}>판매처 없음</Text>
            </div>
          ) : (
            sellers.slice(0, 10).map((seller, idx) => (
              <div
                key={idx}
                style={{
                  padding: '4px 6px',
                  background: '#f5f5f5',
                  borderRadius: 4,
                  marginBottom: 3,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Link
                  href={seller.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 9, fontWeight: 600, flex: 1, marginRight: 4 }}
                  ellipsis
                >
                  {seller.mallName}
                </Link>
                <Text style={{ fontSize: 9, color: '#ff4d4f', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {parseInt(seller.lprice).toLocaleString()}
                </Text>
              </div>
            ))
          )}
        </div>

        {/* 가격비교 버튼 - 항상 하단에 고정 */}
        <Button
          type="primary"
          size="small"
          icon={<SwapOutlined />}
          onClick={() => {
            setCompareProduct(product);
            setCompareModalVisible(true);
          }}
          disabled={!hasSellers}
          style={{
            width: '100%',
            fontSize: 11,
            backgroundColor: hasSellers ? '#006400' : undefined,
            borderColor: hasSellers ? '#006400' : undefined,
          }}
        >
          가격비교
        </Button>
      </div>
    );
  };

  const tabItems = BRANDS.map((brand) => ({
    key: brand.key,
    label: (
      <span style={{
        fontSize: 15,
        fontWeight: activeBrand === brand.key ? 600 : 400,
        color: activeBrand === brand.key ? brand.color : '#595959'
      }}>
        {brand.label}
      </span>
    ),
  }));

  return (
    <div style={{ padding: 24, background: '#f0f2f5', minHeight: '100vh' }}>
      <Card bodyStyle={{ padding: '4px 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Tabs
            activeKey={activeBrand}
            items={tabItems}
            onChange={(key) => setActiveBrand(key as BrandKey)}
            size="large"
            style={{ flex: 1, marginBottom: 0 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginLeft: 24 }}>
            <Space>
              <Button
                onClick={handleOpenFilterModal}
              >
                판매처 필터
              </Button>
              <Button
                onClick={() => setSyncModalVisible(true)}
                type="primary"
              >
                업데이트
              </Button>
              <Button
                onClick={handleReload}
                loading={loading}
              >
                새로고침
              </Button>
            </Space>
            {lastUpdate && (
              <div style={{ marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  마지막 업데이트: {dayjs(lastUpdate).fromNow()}
                </Text>
              </div>
            )}
          </div>
        </div>

        {loading && products.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>
              <Text type="secondary">상품 정보를 불러오는 중...</Text>
            </div>
          </div>
        ) : (
          <>
            <Row gutter={[8, 8]}>
              {currentProducts.map((product) => (
                <Col
                  key={`${product.brand_key}-${product.article_number}`}
                  style={{ width: '10%', minWidth: 140 }}
                >
                  <Card
                    hoverable
                    style={{ height: 400 }}
                    bodyStyle={{ padding: 10, display: 'flex', flexDirection: 'column', height: '100%' }}
                  >
                    {/* 상품 이미지 */}
                    <div style={{ textAlign: 'center', marginBottom: 6, height: 75, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Image
                        src={product.logo_url || ''}
                        alt="상품 이미지"
                        width="auto"
                        height={70}
                        style={{ borderRadius: 4, objectFit: 'contain', maxWidth: '100%' }}
                        fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='70' height='70'%3E%3Crect width='70' height='70' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='10' fill='%23bfbfbf'%3E이미지%3C/text%3E%3C/svg%3E"
                      />
                    </div>

                    {/* 상품코드 */}
                    <div style={{ textAlign: 'center', marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, fontWeight: 700, color: '#003d82' }}>
                        {product.article_number}
                      </Text>
                    </div>

                    {/* 상품명 */}
                    <Tooltip title={product.title} placement="top">
                      <div
                        style={{
                          marginBottom: 6,
                          fontSize: 10,
                          fontWeight: 500,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical' as any,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          lineHeight: 1.3,
                          minHeight: 26,
                          cursor: 'help',
                        }}
                      >
                        {product.title}
                      </div>
                    </Tooltip>

                    {/* 구분선 */}
                    <div style={{ borderTop: '1px solid #f0f0f0', marginBottom: 6 }} />

                    {/* 네이버쇼핑 판매처 정보 */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      {renderSellerInfo(product)}
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>

            {/* 페이지네이션 */}
            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <Pagination
                current={currentPage}
                pageSize={pageSize}
                total={totalFetched}
                showSizeChanger={false}
                showTotal={(total) => `총 ${total.toLocaleString()}개의 상품`}
                onChange={(page) => setCurrentPage(page)}
              />
            </div>
          </>
        )}
      </Card>

      {/* 포이즌 상품 업데이트 모달 */}
      <Modal
        title="포이즌 상품 검색 업데이트"
        open={syncModalVisible}
        onCancel={() => {
          setSyncModalVisible(false);
          form.resetFields();
        }}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSync}
          initialValues={{ endPage: 495 }}
        >
          <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.endPage !== currentValues.endPage}>
            {({ getFieldValue }) => {
              const endPage = getFieldValue('endPage') || 495;
              const estimatedProducts = endPage * 20;
              return (
                <Form.Item
                  label="페이지 수"
                  name="endPage"
                  rules={[{ required: true, message: '페이지 수를 입력하세요' }]}
                  extra={`총 약 ${estimatedProducts.toLocaleString()}개 상품을 업데이트합니다.`}
                >
                  <InputNumber min={1} max={495} style={{ width: '100%' }} />
                </Form.Item>
              );
            }}
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setSyncModalVisible(false)}>
                취소
              </Button>
              <Button type="primary" htmlType="submit" loading={syncLoading}>
                업데이트
              </Button>
            </Space>
          </Form.Item>
        </Form>

        <div style={{ marginTop: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            • 포이즌 API에서 최신 상품 정보를 가져옵니다<br />
            • 기존 데이터는 삭제되고 새로 추가됩니다 (정렬 순서 유지)<br />
            • 백그라운드에서 처리되므로 창을 닫으셔도 됩니다<br />
            • 전체 업데이트 권장: 495페이지 (약 9,900개 상품)
          </Text>
        </div>
      </Modal>

      {/* 전체 판매처 보기 모달 */}
      <Modal
        title={selectedProduct ? `${selectedProduct.article_number} 판매처 목록` : '판매처 목록'}
        open={sellerModalVisible}
        onCancel={() => {
          setSellerModalVisible(false);
          setSelectedProduct(null);
        }}
        footer={[
          <Button key="close" onClick={() => {
            setSellerModalVisible(false);
            setSelectedProduct(null);
          }}>
            닫기
          </Button>
        ]}
        width={600}
      >
        {selectedProduct && (() => {
          const sellers = naverSellerData.get(selectedProduct.article_number) || [];
          return (
            <>
              <div style={{ marginBottom: 16 }}>
                <Text strong style={{ fontSize: 14, color: '#1890ff' }}>
                  <ShopOutlined style={{ marginRight: 4 }} />
                  총 {sellers.length}개 판매처
                </Text>
              </div>
              <List
                dataSource={sellers}
                renderItem={(seller, index) => (
                  <List.Item
                    style={{
                      padding: '12px 16px',
                      background: index % 2 === 0 ? '#fafafa' : 'white',
                      borderRadius: 4,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                      <div style={{ flex: 1, marginRight: 16 }}>
                        <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                          {index + 1}. {seller.mallName}
                        </Text>
                        <Link
                          href={seller.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 11 }}
                        >
                          판매처 바로가기 →
                        </Link>
                      </div>
                      <Text style={{ fontSize: 14, color: '#ff4d4f', fontWeight: 700 }}>
                        {parseInt(seller.lprice).toLocaleString()}원
                      </Text>
                    </div>
                  </List.Item>
                )}
                style={{ maxHeight: 500, overflowY: 'auto' }}
              />
            </>
          );
        })()}
      </Modal>

      {/* 필터 관리 모달 */}
      <Modal
        title="판매처 필터 관리"
        open={filterModalVisible}
        onCancel={() => {
          setFilterModalVisible(false);
          setNewFilterName('');
        }}
        footer={[
          <Button key="close" onClick={() => {
            setFilterModalVisible(false);
            setNewFilterName('');
          }}>
            닫기
          </Button>
        ]}
        width={600}
      >
        <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            • 등록된 판매처는 네이버쇼핑 검색 결과에서 제외됩니다<br />
            • 예: "KREAM", "4910" 등 제외하고 싶은 판매처명을 입력하세요
          </Text>
        </div>

        {/* 필터 추가 */}
        <div style={{ marginBottom: 24 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            새 필터 추가
          </Text>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={newFilterName}
              onChange={(e) => setNewFilterName(e.target.value)}
              onPressEnter={handleAddFilter}
              disabled={addingFilter}
            />
            <Button
              type="primary"
              onClick={handleAddFilter}
              loading={addingFilter}
            >
              추가
            </Button>
          </Space.Compact>
        </div>

        {/* 필터 목록 */}
        <div>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            등록된 필터 ({filters.length}개)
          </Text>
          {filterLoading ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <Spin />
            </div>
          ) : filters.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <Text type="secondary">등록된 필터가 없습니다.</Text>
            </div>
          ) : (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <Row gutter={[8, 8]}>
                {filters.map((filter) => (
                  <Col key={filter.id} span={6}>
                    <Card
                      size="small"
                      style={{
                        borderRadius: 6,
                        border: '1px solid #e8e8e8',
                      }}
                      bodyStyle={{ padding: 12 }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <Text strong style={{ fontSize: 13 }}>
                          {filter.mall_name}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {dayjs(filter.created_at).format('YYYY-MM-DD')}
                        </Text>
                        <Popconfirm
                          title="필터 삭제"
                          description={`"${filter.mall_name}" 필터를 삭제하시겠습니까?`}
                          onConfirm={() => handleDeleteFilter(filter.id, filter.mall_name)}
                          okText="삭제"
                          cancelText="취소"
                          okButtonProps={{ danger: true }}
                        >
                          <Button
                            danger
                            size="small"
                            block
                          >
                            삭제
                          </Button>
                        </Popconfirm>
                      </div>
                    </Card>
                  </Col>
                ))}
              </Row>
            </div>
          )}
        </div>
      </Modal>

      {/* 가격 확인 모달 */}
      <Modal
        title="가격 확인"
        open={priceModalVisible}
        onCancel={() => {
          setPriceModalVisible(false);
          setSelectedPriceProduct(null);
          setSizesWithPrices([]);
        }}
        footer={[
          <Button
            key="close"
            onClick={() => {
              setPriceModalVisible(false);
              setSelectedPriceProduct(null);
              setSizesWithPrices([]);
            }}
          >
            닫기
          </Button>
        ]}
        width={700}
      >
        {selectedPriceProduct && (
          <>
            {/* 상품 정보 */}
            <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
              <Text strong style={{ display: 'block', marginBottom: 4 }}>
                {selectedPriceProduct.title}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                상품코드: {selectedPriceProduct.article_number}
              </Text>
            </div>

            {/* 사이즈별 가격 카드 */}
            {priceLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Spin size="large" />
                <div style={{ marginTop: 16 }}>
                  <Text type="secondary">가격 정보를 불러오는 중...</Text>
                </div>
              </div>
            ) : sizesWithPrices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Text type="secondary">사이즈 정보가 없습니다.</Text>
              </div>
            ) : (
              <div>
                <Text strong style={{ display: 'block', marginBottom: 12 }}>
                  사이즈별 평균가격
                </Text>
                <Row gutter={[12, 12]}>
                  {sizesWithPrices.map((item) => (
                    <Col span={12} key={item.sku_id}>
                      <Card
                        size="small"
                        style={{
                          background: item.average_price ? '#fff' : '#f5f5f5',
                          border: item.average_price ? '1px solid #d9d9d9' : '1px solid #e8e8e8'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <Text strong style={{ fontSize: 16, display: 'block' }}>
                              {item.size_kr}mm
                            </Text>
                            {item.size_us && (
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                US {item.size_us}
                              </Text>
                            )}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            {item.average_price ? (
                              <>
                                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                                  평균가
                                </Text>
                                <Text strong style={{ fontSize: 16, color: '#1890ff' }}>
                                  {item.average_price.toLocaleString()}원
                                </Text>
                              </>
                            ) : (
                              <Text type="secondary" style={{ fontSize: 13 }}>
                                가격 정보 없음
                              </Text>
                            )}
                          </div>
                        </div>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </div>
            )}
          </>
        )}
      </Modal>

      {/* 가격비교 모달 */}
      <Modal
        title={
          <div>
            <Text strong>가격 비교</Text>
            {compareProduct && (
              <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                {compareProduct.article_number}
              </Text>
            )}
          </div>
        }
        open={compareModalVisible}
        onCancel={() => {
          setCompareModalVisible(false);
          setCompareProduct(null);
        }}
        footer={null}
        width={700}
      >
        {compareProduct && (() => {
          const sellers = naverSellerData.get(compareProduct.article_number) || [];
          const apparel = isApparel(compareProduct);

          // 포이즌 평균가 (상품 데이터에서 바로 사용)
          const smallAvg = compareProduct.avg_price_small;
          const largeAvg = compareProduct.avg_price_large;
          const apparelAvg = compareProduct.avg_price_apparel;

          // 테이블 컬럼 구성
          const baseColumns = [
            {
              title: '판매처',
              dataIndex: 'mallName',
              key: 'mallName',
              render: (text: string, record: any) => (
                <Link href={record.link} target="_blank" rel="noopener noreferrer">
                  {text}
                </Link>
              ),
            },
            {
              title: '판매가',
              dataIndex: 'price',
              key: 'price',
              align: 'right' as const,
              render: (price: number) => (
                <Text strong style={{ color: '#ff4d4f' }}>
                  {price.toLocaleString()}원
                </Text>
              ),
              sorter: (a: any, b: any) => a.price - b.price,
              defaultSortOrder: 'ascend' as const,
            },
          ];

          const diffColumn = (avgPrice: number | null, title: string) => ({
            title: (
              <div style={{ textAlign: 'right' }}>
                <div>{title}</div>
                <div style={{ fontSize: 10, color: '#1890ff', fontWeight: 400 }}>
                  ({avgPrice ? `${avgPrice.toLocaleString()}원` : '-'})
                </div>
              </div>
            ),
            key: title,
            align: 'right' as const,
            render: (_: any, record: any) => {
              if (avgPrice === null) return '-';
              const diff = record.price - avgPrice;
              const color = diff > 0 ? '#ff4d4f' : diff < 0 ? '#52c41a' : '#000';
              const prefix = diff > 0 ? '+' : '';
              return (
                <Text style={{ color, fontWeight: 600 }}>
                  {prefix}{diff.toLocaleString()}원
                </Text>
              );
            },
          });

          const columns = apparel
            ? [...baseColumns, diffColumn(apparelAvg, 'S-XXL 평균가')]
            : [...baseColumns, diffColumn(smallAvg, '220-250 평균가'), diffColumn(largeAvg, '255-290 평균가')];

          return (
            <div>
              {/* 상품 정보 */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 16, padding: 12, background: '#fafafa', borderRadius: 8 }}>
                <Image
                  src={compareProduct.logo_url || ''}
                  alt="상품 이미지"
                  width={80}
                  height={80}
                  style={{ borderRadius: 4, objectFit: 'cover' }}
                  fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23f0f0f0'/%3E%3C/svg%3E"
                />
                <div style={{ flex: 1 }}>
                  <Text strong style={{ fontSize: 14, color: '#003d82' }}>{compareProduct.article_number}</Text>
                  <br />
                  <Text style={{ fontSize: 12 }}>{compareProduct.title}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {compareProduct.level1_category_name} / {compareProduct.brand_name}
                  </Text>
                </div>
              </div>

              {/* 판매처 목록 */}
              <div>
                <Text strong style={{ fontSize: 13 }}>판매처 ({sellers.length}개)</Text>
                <Table
                  dataSource={sellers.map((seller, idx) => ({
                    key: idx,
                    mallName: seller.mallName,
                    price: parseInt(seller.lprice),
                    link: seller.link,
                  }))}
                  columns={columns}
                  pagination={false}
                  size="small"
                  style={{ marginTop: 8 }}
                  scroll={{ y: 300 }}
                />
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* 사이즈별 가격 상세 모달 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text strong style={{ fontSize: 14 }}>POIZON 사이즈별 평균가</Text>
            {sizeDetailProduct && (
              <Text style={{ fontSize: 13, color: '#1890ff', fontWeight: 600 }}>
                {sizeDetailProduct.article_number}
              </Text>
            )}
          </div>
        }
        open={sizeDetailModalVisible}
        onCancel={() => {
          setSizeDetailModalVisible(false);
          setSizeDetailProduct(null);
        }}
        footer={null}
        width={420}
      >
        {sizeDetailProduct && (() => {
          const prices = sizeDetailProduct.spu_id ? priceData.get(sizeDetailProduct.spu_id) : null;
          const apparel = isApparel(sizeDetailProduct);

          if (!prices || prices.length === 0) {
            return (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <Text type="secondary">가격 정보가 없습니다.</Text>
              </div>
            );
          }

          // 중복 사이즈 제거 (첫 번째 것만 사용)
          const seenSizes = new Set<string>();
          const uniquePrices = prices.filter(p => {
            const sizeKey = p.size_kr.toUpperCase();
            if (seenSizes.has(sizeKey)) return false;
            seenSizes.add(sizeKey);
            return true;
          });

          // 사이즈 정렬
          const sortedPrices = [...uniquePrices].sort((a, b) => {
            if (apparel) {
              const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'];
              const getOrder = (size: string) => {
                const idx = sizeOrder.indexOf(size.toUpperCase());
                return idx >= 0 ? idx : 999;
              };
              return getOrder(a.size_kr) - getOrder(b.size_kr);
            } else {
              return parseInt(a.size_kr) - parseInt(b.size_kr);
            }
          });

          return (
            <div>
              {/* 상품 정보 - 컴팩트 */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 12,
                padding: '8px 10px',
                background: '#fafafa',
                borderRadius: 6
              }}>
                <Image
                  src={sizeDetailProduct.logo_url || ''}
                  alt="상품 이미지"
                  width={44}
                  height={44}
                  style={{ borderRadius: 4, objectFit: 'cover' }}
                  fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44'%3E%3Crect width='44' height='44' fill='%23f0f0f0'/%3E%3C/svg%3E"
                />
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <Text style={{ fontSize: 12, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sizeDetailProduct.title}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 10 }}>
                    {sizeDetailProduct.brand_name}
                  </Text>
                </div>
              </div>

              {/* 사이즈별 가격 - 그리드 레이아웃 */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 8,
                padding: '4px 0',
              }}>
                {sortedPrices.map((p, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '8px 12px',
                      background: p.average_price ? '#f0f7ff' : '#fafafa',
                      borderRadius: 8,
                      border: p.average_price ? '1px solid #d6e4ff' : '1px solid #e8e8e8',
                      textAlign: 'center',
                    }}
                  >
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>
                      {p.size_kr}
                    </Text>
                    <Text style={{
                      fontSize: 13,
                      color: p.average_price ? '#1890ff' : '#bfbfbf',
                      fontWeight: 600,
                    }}>
                      {p.average_price ? `${p.average_price.toLocaleString()}원` : '-'}
                    </Text>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

export default ProductSellerFinderPage;
