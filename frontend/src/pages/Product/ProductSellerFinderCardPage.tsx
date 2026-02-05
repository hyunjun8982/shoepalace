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
  Tag,
  Table,
} from 'antd';
import { ShopOutlined, SwapOutlined } from '@ant-design/icons';
import { poizonProductsService, PoizonProduct, PriceInfo } from '../../services/poizonProducts';
import { naverShoppingService, NaverSeller } from '../../services/naverShopping';
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

const ProductSellerFinderCardPage: React.FC = () => {
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

  // 포이즌 가격 정보
  const [priceData, setPriceData] = useState<Map<number, PriceInfo[]>>(new Map());
  const [loadingPrices, setLoadingPrices] = useState<Set<number>>(new Set());

  // 가격비교 모달
  const [compareModalVisible, setCompareModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<PoizonProduct | null>(null);

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
    // 검색 결과 및 가격 정보 초기화
    setNaverSellerData(new Map());
    setPriceData(new Map());
  }, [activeBrand]);

  // 페이지 변경 시 네이버쇼핑 검색 및 가격 정보 로드
  useEffect(() => {
    if (products.length > 0) {
      searchCurrentPageProducts();
      loadCurrentPagePrices();
    }
  }, [currentPage, products]);

  // 현재 페이지 상품들의 가격 정보 로드
  const loadCurrentPagePrices = async () => {
    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = startIdx + pageSize;
    const visibleProducts = products.slice(startIdx, endIdx);

    // SPU ID가 있고 아직 로드하지 않은 상품들만
    const spuIdsToLoad = visibleProducts
      .filter(p => p.spu_id && !priceData.has(p.spu_id) && !loadingPrices.has(p.spu_id))
      .map(p => p.spu_id as number);

    if (spuIdsToLoad.length === 0) return;

    // 로딩 상태 추가
    setLoadingPrices(prev => {
      const newSet = new Set(prev);
      spuIdsToLoad.forEach(id => newSet.add(id));
      return newSet;
    });

    try {
      const response = await poizonProductsService.getBatchPrices(spuIdsToLoad);

      // 결과 저장
      setPriceData(prev => {
        const newMap = new Map(prev);
        Object.entries(response.prices).forEach(([spuId, prices]) => {
          newMap.set(parseInt(spuId), prices as PriceInfo[]);
        });
        return newMap;
      });
    } catch (error) {
      console.error('가격 정보 로드 실패:', error);
    } finally {
      // 로딩 상태 제거
      setLoadingPrices(prev => {
        const newSet = new Set(prev);
        spuIdsToLoad.forEach(id => newSet.delete(id));
        return newSet;
      });
    }
  };

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
    loadProducts(activeBrand);
    loadLastUpdate(activeBrand);
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

    // 순차적으로 검색 (API 과부하 방지)
    for (const product of productsToSearch) {
      await searchNaverSellers(product.article_number);
      // 각 요청 사이에 짧은 딜레이
      await new Promise(resolve => setTimeout(resolve, 300));
    }
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

  // 현재 페이지의 상품들
  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = startIdx + pageSize;
  const currentProducts = products.slice(startIdx, endIdx);

  // 포이즌 평균가 표시
  const renderPriceInfo = (product: PoizonProduct) => {
    if (!product.spu_id) {
      return <Text type="secondary" style={{ fontSize: 10 }}>가격 정보 없음</Text>;
    }

    const prices = priceData.get(product.spu_id);
    const isLoading = loadingPrices.has(product.spu_id);

    if (isLoading || !prices) {
      return (
        <div style={{ textAlign: 'center' }}>
          <Spin size="small" />
        </div>
      );
    }

    if (prices.length === 0) {
      return <Text type="secondary" style={{ fontSize: 10 }}>가격 정보 없음</Text>;
    }

    const apparel = isApparel(product);

    if (apparel) {
      const avgPrice = calculateAveragePrice(prices, 'apparel');
      return (
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: 2 }}>
            <Text type="secondary" style={{ fontSize: 9 }}>S~XXL 평균</Text>
          </div>
          <Text strong style={{ fontSize: 12, color: '#52c41a' }}>
            {avgPrice ? `${avgPrice.toLocaleString()}원` : '-'}
          </Text>
        </div>
      );
    } else {
      const smallAvg = calculateAveragePrice(prices, 'small');
      const largeAvg = calculateAveragePrice(prices, 'large');
      return (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <Text type="secondary" style={{ fontSize: 9 }}>220-250</Text>
            <Text strong style={{ fontSize: 11, color: '#52c41a' }}>
              {smallAvg ? `${smallAvg.toLocaleString()}` : '-'}
            </Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text type="secondary" style={{ fontSize: 9 }}>255-290</Text>
            <Text strong style={{ fontSize: 11, color: '#1890ff' }}>
              {largeAvg ? `${largeAvg.toLocaleString()}` : '-'}
            </Text>
          </div>
        </div>
      );
    }
  };

  const renderSellerInfo = (product: PoizonProduct) => {
    const productCode = product.article_number;
    const sellers = naverSellerData.get(productCode);
    const isSearching = searchingProducts.has(productCode);

    // 판매처 개수 및 최저가
    let sellerCount = 0;
    let minPrice: number | null = null;
    if (sellers && sellers.length > 0) {
      sellerCount = sellers.length;
      minPrice = Math.min(...sellers.map(s => parseInt(s.lprice)));
    }

    return (
      <div>
        {/* 포이즌 평균가 */}
        <div style={{ marginBottom: 8, padding: 6, background: '#f6ffed', borderRadius: 4 }}>
          <div style={{ marginBottom: 4 }}>
            <Text type="secondary" style={{ fontSize: 9 }}>포이즌 평균가</Text>
          </div>
          {renderPriceInfo(product)}
        </div>

        {/* 판매처 요약 */}
        <div style={{ marginBottom: 8, padding: 6, background: '#f5f5f5', borderRadius: 4 }}>
          {isSearching || !sellers ? (
            <div style={{ textAlign: 'center' }}>
              <Spin size="small" />
              <Text type="secondary" style={{ fontSize: 9, marginLeft: 4 }}>검색 중...</Text>
            </div>
          ) : sellerCount === 0 ? (
            <Text type="secondary" style={{ fontSize: 10, textAlign: 'center', display: 'block' }}>
              판매처 없음
            </Text>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 10 }}>
                  <ShopOutlined style={{ marginRight: 2 }} />
                  {sellerCount}개 판매처
                </Text>
                <Text style={{ fontSize: 11, color: '#ff4d4f', fontWeight: 600 }}>
                  {minPrice?.toLocaleString()}원~
                </Text>
              </div>
            </div>
          )}
        </div>

        {/* 가격비교 버튼 */}
        <Button
          type="primary"
          size="small"
          icon={<SwapOutlined />}
          onClick={() => {
            setSelectedProduct(product);
            setCompareModalVisible(true);
          }}
          disabled={!sellers || sellers.length === 0}
          style={{ width: '100%', fontSize: 11 }}
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
                    style={{ height: '100%', minHeight: 360 }}
                    bodyStyle={{ padding: 12, display: 'flex', flexDirection: 'column', height: '100%' }}
                  >
                    {/* 상품 이미지 */}
                    <div style={{ textAlign: 'center', marginBottom: 8 }}>
                      <Image
                        src={product.logo_url || ''}
                        alt="상품 이미지"
                        width="100%"
                        height={120}
                        style={{ borderRadius: 4, objectFit: 'cover' }}
                        fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Crect width='120' height='120' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='12' fill='%23bfbfbf'%3E이미지%3C/text%3E%3C/svg%3E"
                      />
                    </div>

                    {/* 상품코드 */}
                    <div style={{ textAlign: 'center', marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, fontWeight: 700, color: '#003d82' }}>
                        {product.article_number}
                      </Text>
                    </div>

                    {/* 카테고리/브랜드 */}
                    <div style={{ textAlign: 'center', marginBottom: 4 }}>
                      <Text type="secondary" style={{ fontSize: 10 }}>
                        {product.level1_category_name && `${product.level1_category_name}/`}
                        {product.brand_name}
                      </Text>
                    </div>

                    {/* 상품명 */}
                    <div style={{ marginBottom: 8, minHeight: 32 }}>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          lineHeight: 1.3,
                        }}
                      >
                        {product.title}
                      </Text>
                    </div>

                    {/* 구분선 */}
                    <div style={{ borderTop: '1px solid #f0f0f0', marginBottom: 8 }} />

                    {/* 네이버쇼핑 판매처 정보 */}
                    <div style={{ flex: 1 }}>
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

      {/* 가격비교 모달 */}
      <Modal
        title={
          <div>
            <Text strong>가격 비교</Text>
            {selectedProduct && (
              <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                {selectedProduct.article_number}
              </Text>
            )}
          </div>
        }
        open={compareModalVisible}
        onCancel={() => {
          setCompareModalVisible(false);
          setSelectedProduct(null);
        }}
        footer={null}
        width={700}
      >
        {selectedProduct && (() => {
          const prices = selectedProduct.spu_id ? priceData.get(selectedProduct.spu_id) : null;
          const sellers = naverSellerData.get(selectedProduct.article_number) || [];
          const apparel = isApparel(selectedProduct);

          // 포이즌 평균가 계산
          let poizonAvg: { label: string; price: number | null }[] = [];
          if (apparel) {
            poizonAvg = [{ label: 'S~XXL', price: calculateAveragePrice(prices || [], 'apparel') }];
          } else {
            poizonAvg = [
              { label: '220-250', price: calculateAveragePrice(prices || [], 'small') },
              { label: '255-290', price: calculateAveragePrice(prices || [], 'large') },
            ];
          }

          return (
            <div>
              {/* 상품 정보 */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 16, padding: 12, background: '#fafafa', borderRadius: 8 }}>
                <Image
                  src={selectedProduct.logo_url || ''}
                  alt="상품 이미지"
                  width={80}
                  height={80}
                  style={{ borderRadius: 4, objectFit: 'cover' }}
                  fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23f0f0f0'/%3E%3C/svg%3E"
                />
                <div style={{ flex: 1 }}>
                  <Text strong style={{ fontSize: 14, color: '#003d82' }}>{selectedProduct.article_number}</Text>
                  <br />
                  <Text style={{ fontSize: 12 }}>{selectedProduct.title}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {selectedProduct.level1_category_name} / {selectedProduct.brand_name}
                  </Text>
                </div>
              </div>

              {/* 포이즌 평균가 */}
              <div style={{ marginBottom: 16 }}>
                <Text strong style={{ fontSize: 13 }}>포이즌 평균가</Text>
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  {poizonAvg.map((item, idx) => (
                    <Tag
                      key={idx}
                      color="green"
                      style={{ padding: '4px 12px', fontSize: 12 }}
                    >
                      {item.label}: {item.price ? `${item.price.toLocaleString()}원` : '-'}
                    </Tag>
                  ))}
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
                    diff: poizonAvg[0].price ? parseInt(seller.lprice) - poizonAvg[0].price : null,
                  }))}
                  columns={[
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
                    {
                      title: '평균가 대비',
                      dataIndex: 'diff',
                      key: 'diff',
                      align: 'right' as const,
                      render: (diff: number | null) => {
                        if (diff === null) return '-';
                        const color = diff > 0 ? '#ff4d4f' : diff < 0 ? '#52c41a' : '#000';
                        const prefix = diff > 0 ? '+' : '';
                        return (
                          <Text style={{ color, fontWeight: 600 }}>
                            {prefix}{diff.toLocaleString()}원
                          </Text>
                        );
                      },
                    },
                  ]}
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
    </div>
  );
};

export default ProductSellerFinderCardPage;
