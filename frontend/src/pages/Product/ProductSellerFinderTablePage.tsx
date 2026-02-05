import React, { useState, useEffect } from 'react';
import {
  Card,
  Tabs,
  Table,
  Button,
  message,
  Typography,
  Tag,
  Spin,
  Modal,
  Form,
  InputNumber,
  Space,
  Image,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined, ShopOutlined } from '@ant-design/icons';
import { poizonProductsService, PoizonProduct } from '../../services/poizonProducts';
import { naverShoppingService, NaverSeller } from '../../services/naverShopping';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';

dayjs.extend(relativeTime);
dayjs.locale('ko');

const { Title, Text, Link } = Typography;

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

  // 브랜드 변경 시 DB에서 상품 조회
  useEffect(() => {
    loadProducts(activeBrand);
    loadLastUpdate(activeBrand);
    // 네이버쇼핑 검색 결과 초기화
    setNaverSellerData(new Map());
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
    loadProducts(activeBrand);
    loadLastUpdate(activeBrand);
  };

  const searchCurrentPageProducts = async () => {
    // 현재 페이지의 상품들만 검색
    const startIdx = (currentPage - 1) * 20;
    const endIdx = startIdx + 20;
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

  const columns: ColumnsType<PoizonProduct> = [
    {
      title: '번호',
      key: 'index',
      width: 70,
      align: 'center',
      render: (_, __, index) => (
        <Text>{(currentPage - 1) * 20 + index + 1}</Text>
      ),
    },
    {
      title: '상품코드',
      dataIndex: 'article_number',
      key: 'article_number',
      width: 130,
      align: 'center',
      render: (articleNumber: string) => (
        <Text style={{ fontSize: 14, fontWeight: 700, color: '#003d82' }}>
          {articleNumber}
        </Text>
      ),
    },
    {
      title: '이미지',
      dataIndex: 'logo_url',
      key: 'logo_url',
      width: 80,
      align: 'center',
      render: (logoUrl: string | null) => (
        <Image
          src={logoUrl || ''}
          alt="상품 이미지"
          width={60}
          height={60}
          style={{ borderRadius: 4, objectFit: 'cover' }}
          fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Crect width='60' height='60' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='12' fill='%23bfbfbf'%3E이미지%3C/text%3E%3C/svg%3E"
        />
      ),
    },
    {
      title: '상품 정보',
      key: 'product_info',
      width: 280,
      render: (_, record) => (
        <div style={{ lineHeight: 1.6 }}>
          <div style={{ fontSize: 11, color: '#595959', marginBottom: 4 }}>
            {record.level1_category_name && `${record.level1_category_name}/`}
            {record.brand_name}
          </div>
          <div style={{
            fontSize: 13,
            fontWeight: 500,
            wordBreak: 'break-word',
            whiteSpace: 'normal'
          }}>
            {record.title}
          </div>
        </div>
      ),
    },
    {
      title: '네이버쇼핑 판매처 정보',
      key: 'naver_sellers',
      width: 350,
      render: (_, record) => {
        const productCode = record.article_number;
        const sellers = naverSellerData.get(productCode);
        const isSearching = searchingProducts.has(productCode);

        // 검색 중 또는 미검색 (자동 검색 대기 중)
        if (isSearching || !sellers) {
          return (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <Spin size="small" />
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                검색 중...
              </Text>
            </div>
          );
        }

        // 검색 결과 없음
        if (sellers.length === 0) {
          return (
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                판매처 없음
              </Text>
            </div>
          );
        }

        // 검색 결과 있음
        return (
          <div style={{ textAlign: 'left' }}>
            <div style={{ marginBottom: 8 }}>
              <Text strong style={{ fontSize: 12, color: '#1890ff' }}>
                <ShopOutlined style={{ marginRight: 4 }} />
                {sellers.length}개 판매처
              </Text>
            </div>
            <div style={{ maxHeight: 120, overflowY: 'auto' }}>
              {sellers.slice(0, 3).map((seller, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '8px',
                    background: '#f5f5f5',
                    borderRadius: 4,
                    marginBottom: 4,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Link
                    href={seller.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 11, fontWeight: 600 }}
                  >
                    {seller.mallName}
                  </Link>
                  <Text style={{ fontSize: 11, color: '#ff4d4f', fontWeight: 600 }}>
                    {parseInt(seller.lprice).toLocaleString()}원
                  </Text>
                </div>
              ))}
              {sellers.length > 3 && (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  외 {sellers.length - 3}개 판매처
                </Text>
              )}
            </div>
          </div>
        );
      },
    },
  ];

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 }}>
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
            <Table
              columns={columns}
              dataSource={products}
              rowKey={(record) => `${record.brand_key}-${record.article_number}`}
              loading={loading}
              pagination={{
                current: currentPage,
                pageSize: 20,
                total: totalFetched,
                showSizeChanger: false,
                showTotal: (total) => `총 ${total}건`,
                onChange: (page) => setCurrentPage(page),
              }}
              locale={{
                emptyText: (
                  <div style={{ padding: '60px 0' }}>
                    <Text type="secondary">상품 정보가 없습니다.</Text>
                  </div>
                ),
              }}
              size="middle"
              scroll={{ x: 1200 }}
            />

            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <Text type="secondary">
                총 {totalFetched.toLocaleString()}개의 상품
              </Text>
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
    </div>
  );
};

export default ProductSellerFinderPage;
