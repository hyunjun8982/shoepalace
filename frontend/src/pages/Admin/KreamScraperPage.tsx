import React, { useState, useMemo, useRef } from 'react';
import {
  Card,
  Typography,
  Button,
  Input,
  Space,
  Alert,
  Table,
  Tag,
  message,
  Spin,
  Divider,
  Row,
  Col,
  Modal,
  Statistic,
  Switch,
} from 'antd';
import {
  SearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DatabaseOutlined,
  SaveOutlined,
  FilterOutlined,
  StopOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;

interface ScrapedProduct {
  product_name_ko: string;
  product_name_en: string;
  model_number: string;
  brand: string;
  color: string;
  category_1d?: string;
  image_url: string;
  release_price?: number;
  source_url: string;
  isExisting?: boolean;
}

interface ScrapeResult {
  total_scraped: number;
  total_saved: number;
  products: ScrapedProduct[];
  errors: string[];
}

const KreamScraperPage: React.FC = () => {
  const [keyword, setKeyword] = useState<string>('나이키');
  const [loading, setLoading] = useState<boolean>(false);
  const [allProducts, setAllProducts] = useState<ScrapedProduct[]>([]);
  const [saveModalVisible, setSaveModalVisible] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [showExistingProducts, setShowExistingProducts] = useState<boolean>(false);
  const [isAutoCollecting, setIsAutoCollecting] = useState<boolean>(false);

  const PRODUCTS_PER_PAGE = 100;
  const isAutoCollectingRef = useRef<boolean>(false);
  const allProductsRef = useRef<ScrapedProduct[]>([]);
  const currentPageRef = useRef<number>(1);

  // 품번 중복 체크 (백엔드 API 호출)
  const checkExistingProducts = async (products: ScrapedProduct[]) => {
    try {
      const productCodes = products.map(p => p.model_number);

      const response = await api.post(
        '/products/check-codes',
        { product_codes: productCodes }
      );

      const existingCodes = new Set(response.data.existing_codes);

      return products.map(product => ({
        ...product,
        isExisting: existingCodes.has(product.model_number),
      }));
    } catch (error) {
      console.error('Failed to check existing products:', error);
      // 오류 시 모두 신규로 처리
      return products.map(product => ({
        ...product,
        isExisting: false,
      }));
    }
  };

  // 자동 수집 중지
  const handleStopAutoCollecting = () => {
    isAutoCollectingRef.current = false;
    setIsAutoCollecting(false);
    message.info('자동 수집을 중지했습니다');
  };

  // 수집 계속하기
  const handleContinueScrape = () => {
    isAutoCollectingRef.current = true;
    setIsAutoCollecting(true);
    message.info('수집을 계속합니다...');
    handleScrape(true);
  };

  // 상품 수집
  const handleScrape = async (isLoadMore: boolean = false) => {
    if (!keyword.trim()) {
      message.warning('검색어를 입력하세요');
      return;
    }

    const pageToFetch = isLoadMore ? currentPageRef.current + 1 : 1;

    if (!isLoadMore) {
      setAllProducts([]);
      setCurrentPage(1);
      setIsAutoCollecting(true);
      isAutoCollectingRef.current = true;
      allProductsRef.current = [];
      currentPageRef.current = 1;
    }

    setLoading(true);

    try {
      const response = await api.post(
        '/kream-scraper/scrape',
        {
          keyword: keyword.trim(),
          max_products: PRODUCTS_PER_PAGE,
          page: pageToFetch,
          save_to_db: false,
        }
      );

      const result: ScrapeResult = response.data;

      if (result.products.length > 0) {
        const checkedProducts = await checkExistingProducts(result.products);

        const newProducts = isLoadMore
          ? [...allProductsRef.current, ...checkedProducts]
          : checkedProducts;

        // ref와 state 모두 업데이트
        allProductsRef.current = newProducts;
        currentPageRef.current = pageToFetch;
        setAllProducts(newProducts);
        setCurrentPage(pageToFetch);

        // 신규 상품 개수 계산
        const newProductCount = newProducts.filter(p => !p.isExisting).length;

        message.success(
          `${result.products.length}개 상품 수집 완료! (총 ${newProducts.length}개, 신규 ${newProductCount}개)`
        );

        // 로딩 종료
        setLoading(false);

        // 자동 수집이 활성화되어 있고 더 불러올 상품이 있으면 계속 수집
        if (isAutoCollectingRef.current && result.products.length > 0) {
          message.info('자동으로 더 수집합니다...');
          // 약간의 딜레이 후 자동 수집 (사용자가 메시지를 볼 수 있도록)
          setTimeout(() => {
            // 중지 버튼을 눌렀는지 다시 확인
            if (isAutoCollectingRef.current) {
              handleScrape(true);
            }
          }, 1500);
          return; // 여기서 리턴하여 finally의 setLoading(false) 중복 실행 방지
        } else {
          setIsAutoCollecting(false);
          isAutoCollectingRef.current = false;
        }
      } else {
        message.info('더 이상 수집할 상품이 없습니다');
        setIsAutoCollecting(false);
        isAutoCollectingRef.current = false;
      }
    } catch (error: any) {
      console.error('Scraping error:', error);
      message.error(
        error.response?.data?.detail || '수집 중 오류가 발생했습니다'
      );
      setIsAutoCollecting(false);
      isAutoCollectingRef.current = false;
    } finally {
      setLoading(false);
    }
  };

  // DB 저장
  const handleSave = async () => {
    if (allProducts.length === 0) {
      message.warning('저장할 상품이 없습니다');
      return;
    }

    const newProducts = allProducts.filter(p => !p.isExisting);

    if (newProducts.length === 0) {
      message.warning('저장할 신규 상품이 없습니다');
      return;
    }

    setSaving(true);

    try {
      // 한 번에 모든 페이지의 상품을 저장
      console.log('Saving products:', {
        keyword: keyword.trim(),
        max_products: PRODUCTS_PER_PAGE,
        total_pages: currentPage,
      });

      const response = await api.post(
        '/kream-scraper/bulk-save',
        {
          keyword: keyword.trim(),
          max_products: PRODUCTS_PER_PAGE,
          total_pages: currentPage,
        }
      );

      message.success(`총 ${response.data.total_saved}개 상품이 저장되었습니다!`);
      setSaveModalVisible(false);
      setAllProducts([]);
      setCurrentPage(1);
      setIsAutoCollecting(false);
      allProductsRef.current = [];
      currentPageRef.current = 1;
    } catch (error: any) {
      console.error('Save error:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      message.error(
        error.response?.data?.detail || error.message || '저장 중 오류가 발생했습니다'
      );
    } finally {
      setSaving(false);
    }
  };

  // 필터링된 상품 목록
  const filteredProducts = useMemo(() => {
    if (showExistingProducts) {
      return allProducts;
    }
    return allProducts.filter(p => !p.isExisting);
  }, [allProducts, showExistingProducts]);

  const newProductsCount = allProducts.filter(p => !p.isExisting).length;
  const existingProductsCount = allProducts.filter(p => p.isExisting).length;

  const columns = [
    {
      title: '상태',
      key: 'status',
      width: 70,
      render: (_: any, record: ScrapedProduct) => (
        record.isExisting ? (
          <Tag color="orange">기존</Tag>
        ) : (
          <Tag color="green">신규</Tag>
        )
      ),
    },
    {
      title: '이미지',
      dataIndex: 'image_url',
      key: 'image',
      width: 80,
      render: (url: string) =>
        url ? (
          <img
            src={url}
            alt="product"
            style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 4 }}
          />
        ) : (
          <div style={{ width: 60, height: 60, backgroundColor: '#f0f0f0', borderRadius: 4 }} />
        ),
    },
    {
      title: '브랜드',
      dataIndex: 'brand',
      key: 'brand',
      width: 90,
      render: (brand: string) => <Tag color="blue">{brand}</Tag>,
    },
    {
      title: '카테고리',
      dataIndex: 'category_1d',
      key: 'category_1d',
      width: 100,
      render: (category: string) => category ? <Tag color="purple">{category}</Tag> : '-',
    },
    {
      title: '상품명',
      key: 'product_name',
      ellipsis: true,
      render: (_: any, record: ScrapedProduct) => (
        <div>
          <div>{record.product_name_ko}</div>
          <div style={{ color: '#888', fontSize: '12px' }}>{record.product_name_en}</div>
        </div>
      ),
    },
    {
      title: '품번',
      dataIndex: 'model_number',
      key: 'model_number',
      width: 130,
      render: (model: string) => <Tag color="cyan">{model}</Tag>,
    },
    {
      title: '상세',
      dataIndex: 'source_url',
      key: 'source_url',
      width: 70,
      render: (url: string) => (
        <Button
          type="link"
          size="small"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          보기
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={24}>
        {/* 좌측: 설명 및 검색 영역 */}
        <Col xs={24} lg={10}>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {/* KREAM 소개 및 사용 방법 통합 카드 */}
            <Card style={{ borderRadius: 8 }}>
              <Row gutter={24} align="top">
                <Col span={14}>
                  {/* 제목 */}
                  <Title level={4} style={{ marginTop: 0, marginBottom: 16, color: '#1890ff' }}>
                    🔍 KREAM 상품 자동 수집
                  </Title>

                  {/* 설명 */}
                  <div style={{ marginBottom: 20 }}>
                    <Text style={{ color: '#666', fontSize: 14, lineHeight: '1.8' }}>
                      KREAM 사이트에서 검색한 상품 정보를 자동으로 슈팔라스 상품 관리 데이터베이스에 저장하는 프로그램입니다.
                      <br />
                      브랜드명으로 검색하면 상품 이미지, 품번, 카테고리 등이 자동으로 수집됩니다.
                    </Text>
                  </div>

                  <Divider style={{ margin: '16px 0' }} />

                  {/* 사용 방법 */}
                  <div style={{ marginBottom: 20 }}>
                    <Title level={5} style={{ marginBottom: 12 }}>📖 사용 방법</Title>
                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                      <Text><strong>1단계:</strong> 검색어 입력 (예: 나이키, 조던)</Text>
                      <Text><strong>2단계:</strong> "자동 수집 시작" 버튼 클릭</Text>
                      <Text><strong>3단계:</strong> 자동으로 모든 상품 수집 (원하면 중지 가능)</Text>
                      <Text><strong>4단계:</strong> 수집 완료 후 "DB에 저장"으로 일괄 저장</Text>
                    </Space>
                  </div>

                  <Divider style={{ margin: '16px 0' }} />

                  {/* 팁 */}
                  <div>
                    <Alert
                      message="💡 팁"
                      description={
                        <ul style={{ marginBottom: 0, paddingLeft: 20, fontSize: '13px' }}>
                          <li>KREAM 사이트에서 검색하듯이 검색어를 입력하면 됩니다</li>
                          <li>수집 시작하면 자동으로 페이지를 넘기며 모든 상품을 수집합니다</li>
                          <li>수집 중 언제든지 "수집 중지" 버튼으로 중지할 수 있습니다</li>
                          <li>기본적으로 신규 상품만 표시되며 필터를 끄면 기존 상품도 확인 가능합니다</li>
                        </ul>
                      }
                      type="info"
                      showIcon={false}
                      icon={<span style={{ fontSize: 16 }}>💡</span>}
                      style={{ marginBottom: 0 }}
                    />
                  </div>
                </Col>

                <Col span={10}>
                  <div style={{ position: 'sticky', top: 20, paddingTop: 4 }}>
                    <img
                      src="/images/kream-screenshot.png"
                      alt="KREAM 검색 결과"
                      style={{
                        width: '100%',
                        borderRadius: 8,
                        border: '1px solid #e8e8e8',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                        marginBottom: 8
                      }}
                    />
                    <Text style={{ fontSize: 12, color: '#999', display: 'block', textAlign: 'center' }}>
                      KREAM 사이트에서 "나이키" 검색 결과 화면
                    </Text>
                  </div>
                </Col>
              </Row>
            </Card>

            {/* 수집 설정 */}
            <Card title="🔍 상품 검색" style={{ borderRadius: 8 }}>
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <div>
                  <Text strong>검색어</Text>
                  <Input
                    placeholder="예: 나이키, 아디다스, 조던..."
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onPressEnter={() => handleScrape(false)}
                    size="large"
                    prefix={<SearchOutlined />}
                    style={{ marginTop: 8 }}
                    disabled={loading}
                  />
                </div>

                {/* 수집 액션 카드들 */}
                <Row gutter={[12, 12]}>
                  {/* 수집 시작 카드 */}
                  {!isAutoCollecting && allProducts.length === 0 && (
                    <Col span={24}>
                      <Card
                        hoverable={!loading}
                        style={{
                          borderRadius: 8,
                          border: '2px solid #667eea',
                          cursor: loading ? 'not-allowed' : 'pointer'
                        }}
                        bodyStyle={{ padding: '16px' }}
                        onClick={() => !loading && handleScrape(false)}
                      >
                        <div style={{ textAlign: 'center' }}>
                          <SearchOutlined style={{ fontSize: 32, color: '#667eea', marginBottom: 8 }} />
                          <div style={{ fontSize: 16, fontWeight: 'bold', color: '#667eea' }}>
                            자동 수집 시작
                          </div>
                        </div>
                      </Card>
                    </Col>
                  )}

                  {/* 새로 수집 & 계속하기 버튼 */}
                  {!isAutoCollecting && allProducts.length > 0 && !loading && (
                    <>
                      <Col span={12}>
                        <Card
                          hoverable
                          style={{
                            borderRadius: 8,
                            border: '2px solid #667eea',
                            cursor: 'pointer',
                            height: '100%'
                          }}
                          bodyStyle={{ padding: '16px' }}
                          onClick={() => handleScrape(false)}
                        >
                          <div style={{ textAlign: 'center' }}>
                            <SearchOutlined style={{ fontSize: 28, color: '#667eea', marginBottom: 8 }} />
                            <div style={{ fontSize: 14, fontWeight: 'bold', color: '#667eea' }}>
                              새로 수집
                            </div>
                          </div>
                        </Card>
                      </Col>
                      <Col span={12}>
                        <Card
                          hoverable
                          style={{
                            borderRadius: 8,
                            border: '2px solid #1890ff',
                            cursor: 'pointer',
                            height: '100%'
                          }}
                          bodyStyle={{ padding: '16px' }}
                          onClick={handleContinueScrape}
                        >
                          <div style={{ textAlign: 'center' }}>
                            <PlayCircleOutlined style={{ fontSize: 28, color: '#1890ff', marginBottom: 8 }} />
                            <div style={{ fontSize: 14, fontWeight: 'bold', color: '#1890ff' }}>
                              계속 수집
                            </div>
                          </div>
                        </Card>
                      </Col>
                    </>
                  )}

                  {/* 자동 수집 중지 버튼 */}
                  {isAutoCollecting && (
                    <Col span={24}>
                      <Card
                        hoverable
                        style={{
                          borderRadius: 8,
                          border: '2px solid #ff4d4f',
                          cursor: 'pointer'
                        }}
                        bodyStyle={{ padding: '16px' }}
                        onClick={handleStopAutoCollecting}
                      >
                        <div style={{ textAlign: 'center' }}>
                          <StopOutlined style={{ fontSize: 32, color: '#ff4d4f', marginBottom: 8 }} />
                          <div style={{ fontSize: 16, fontWeight: 'bold', color: '#ff4d4f' }}>
                            수집 중지
                          </div>
                          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                            클릭하여 자동 수집을 중지하세요
                          </div>
                        </div>
                      </Card>
                    </Col>
                  )}

                  {/* DB 저장 카드 */}
                  {allProducts.length > 0 && !loading && !isAutoCollecting && (
                    <Col span={24}>
                      <Card
                        hoverable={newProductsCount > 0}
                        style={{
                          borderRadius: 8,
                          border: `2px solid ${newProductsCount === 0 ? '#d9d9d9' : '#52c41a'}`,
                          cursor: newProductsCount === 0 ? 'not-allowed' : 'pointer',
                          opacity: newProductsCount === 0 ? 0.5 : 1,
                        }}
                        bodyStyle={{ padding: '16px' }}
                        onClick={() => newProductsCount > 0 && setSaveModalVisible(true)}
                      >
                        <div style={{ textAlign: 'center' }}>
                          <SaveOutlined style={{ fontSize: 28, color: newProductsCount === 0 ? '#999' : '#52c41a', marginBottom: 8 }} />
                          <div style={{ fontSize: 14, fontWeight: 'bold', color: newProductsCount === 0 ? '#999' : '#52c41a' }}>
                            DB에 저장
                          </div>
                          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                            총 <strong>{newProductsCount}</strong>개
                          </div>
                        </div>
                      </Card>
                    </Col>
                  )}
                </Row>

                {/* 수집 통계 */}
                {allProducts.length > 0 && (
                  <>
                    <Divider style={{ margin: '16px 0', borderColor: '#d9d9d9' }} />
                    <Row gutter={16}>
                      <Col span={8} style={{ textAlign: 'center' }}>
                        <Statistic
                          title="총 수집"
                          value={allProducts.length}
                          prefix={<DatabaseOutlined />}
                          valueStyle={{ color: '#1890ff', fontSize: '20px' }}
                        />
                      </Col>
                      <Col span={8} style={{ textAlign: 'center', borderLeft: '1px solid #e8e8e8', borderRight: '1px solid #e8e8e8' }}>
                        <Statistic
                          title="신규"
                          value={newProductsCount}
                          prefix={<CheckCircleOutlined />}
                          valueStyle={{ color: '#52c41a', fontSize: '20px' }}
                        />
                      </Col>
                      <Col span={8} style={{ textAlign: 'center' }}>
                        <Statistic
                          title="기존"
                          value={existingProductsCount}
                          prefix={<CloseCircleOutlined />}
                          valueStyle={{ color: '#faad14', fontSize: '20px' }}
                        />
                      </Col>
                    </Row>
                  </>
                )}
              </Space>
            </Card>
          </Space>
        </Col>

        {/* 우측: 결과 영역 */}
        <Col xs={24} lg={14}>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {/* 상품 목록 */}
            {allProducts.length > 0 && (
              <Card
                title={
                  <Row justify="space-between" align="middle">
                    <Col>📦 수집된 상품 목록</Col>
                    <Col>
                      <Space>
                        <FilterOutlined />
                        <Text>기존 상품 표시</Text>
                        <Switch
                          checked={showExistingProducts}
                          onChange={setShowExistingProducts}
                          size="small"
                        />
                      </Space>
                    </Col>
                  </Row>
                }
                style={{ borderRadius: 8 }}
              >
                <Table
                  dataSource={filteredProducts}
                  columns={columns}
                  rowKey={(record, idx) => `${record.model_number}-${idx}`}
                  scroll={{ x: 900 }}
                  pagination={{
                    pageSize: 10,
                    showSizeChanger: false,
                    showTotal: (total) => `총 ${total}개 상품`,
                  }}
                />
              </Card>
            )}

            {/* 초기 상태 안내 */}
            {!loading && allProducts.length === 0 && (
              <Card style={{ borderRadius: 8 }}>
                <div style={{ textAlign: 'center', padding: 60 }}>
                  <SearchOutlined style={{ fontSize: 64, color: '#d9d9d9', marginBottom: 16 }} />
                  <Title level={4} style={{ color: '#999' }}>검색어를 입력하고 수집을 시작하세요</Title>
                  <Text type="secondary">좌측에서 브랜드명이나 상품명을 검색하면 KREAM에서 상품 정보를 자동으로 수집합니다</Text>
                </div>
              </Card>
            )}
          </Space>
        </Col>
      </Row>

      {/* 저장 확인 모달 */}
      <Modal
        title="DB에 저장"
        open={saveModalVisible}
        onOk={handleSave}
        onCancel={() => setSaveModalVisible(false)}
        okText="저장"
        cancelText="취소"
        confirmLoading={saving}
        okButtonProps={{
          icon: <SaveOutlined />,
          style: { backgroundColor: '#52c41a', borderColor: '#52c41a' }
        }}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            message="저장 정보"
            description={
              <div>
                <p>✅ 신규 상품: <strong>{newProductsCount}개</strong></p>
                <p>⏭️ 기존 상품: <strong>{existingProductsCount}개</strong> (저장 제외)</p>
                <Divider style={{ margin: '8px 0' }} />
                <p>신규 상품만 DB에 저장됩니다.</p>
              </div>
            }
            type="info"
            showIcon
          />
        </Space>
      </Modal>

      {/* 수집 중 로딩 모달 */}
      <Modal
        open={loading}
        footer={null}
        closable={false}
        centered
        width={500}
        styles={{
          body: { textAlign: 'center', padding: '40px 20px' }
        }}
      >
        <Spin size="large" />
        <div style={{ marginTop: 20, fontSize: 18, fontWeight: 600 }}>
          KREAM에서 상품 정보를 수집하고 있습니다...
        </div>

        {/* 수집 현황 */}
        {allProducts.length > 0 && (
          <div style={{ marginTop: 24, padding: '20px', backgroundColor: '#f5f5f5', borderRadius: 8 }}>
            <Row gutter={16}>
              <Col span={8}>
                <Statistic
                  title="총 수집"
                  value={allProducts.length}
                  valueStyle={{ color: '#1890ff', fontSize: '24px' }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="신규"
                  value={allProducts.filter(p => !p.isExisting).length}
                  valueStyle={{ color: '#52c41a', fontSize: '24px' }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="페이지"
                  value={currentPage}
                  valueStyle={{ color: '#faad14', fontSize: '24px' }}
                />
              </Col>
            </Row>
          </div>
        )}

        {/* 중지 버튼 */}
        {isAutoCollecting && (
          <div style={{ marginTop: 24 }}>
            <Button
              danger
              size="large"
              icon={<StopOutlined />}
              onClick={handleStopAutoCollecting}
              style={{ minWidth: 150 }}
            >
              수집 중지
            </Button>
          </div>
        )}

        <div style={{ marginTop: 16, fontSize: 13, color: '#999' }}>
          {isAutoCollecting ? '자동으로 모든 페이지를 수집합니다' : '잠시만 기다려주세요'}
        </div>
      </Modal>
    </div>
  );
};

export default KreamScraperPage;
