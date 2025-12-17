import React, { useState, useEffect } from 'react';
import {
  Card,
  Typography,
  Button,
  Row,
  Col,
  Statistic,
  message,
  Space,
  Alert,
} from 'antd';
import { DownloadOutlined, ThunderboltOutlined, InfoCircleOutlined } from '@ant-design/icons';
import {
  getAvailableBrands,
  importBrandProducts,
  getBrandSummary,
  BrandInfo,
  ImportRequest,
  BrandSummary,
} from '../../services/productImporter';

const { Title, Text } = Typography;

const ProductImporterPage: React.FC = () => {
  const [brands, setBrands] = useState<BrandInfo[]>([]);
  const [loadingBrands, setLoadingBrands] = useState<{ [key: string]: boolean }>({});
  const [loadingAll, setLoadingAll] = useState<boolean>(false);
  const [brandSummaries, setBrandSummaries] = useState<{ [key: string]: BrandSummary }>({});

  useEffect(() => {
    loadBrands();
  }, []);

  const loadBrands = async () => {
    try {
      const data = await getAvailableBrands();
      setBrands(data);

      // 각 브랜드의 통계 로드
      data.forEach(async (brand) => {
        try {
          const summary = await getBrandSummary(brand.key);
          setBrandSummaries(prev => ({ ...prev, [brand.key]: summary }));
        } catch (err) {
          console.error(`Failed to load summary for ${brand.key}:`, err);
        }
      });
    } catch (err: any) {
      message.error('브랜드 목록을 불러오는데 실패했습니다.');
    }
  };

  const handleImportBrand = async (brandKey: string) => {
    setLoadingBrands(prev => ({ ...prev, [brandKey]: true }));

    try {
      const request: ImportRequest = {
        brand: brandKey,
        update_existing: true,
      };

      const result = await importBrandProducts(request);

      message.success({
        content: (
          <div>
            <div>✅ {brandKey} 수집 완료!</div>
            <div>생성: {result.stats.created}개</div>
            <div>업데이트: {result.stats.updated}개</div>
            <div>건너뜀: {result.stats.skipped}개</div>
            <div>실패: {result.stats.failed}개</div>
          </div>
        ),
        duration: 5,
      });

      // 통계 새로고침
      const summary = await getBrandSummary(brandKey);
      setBrandSummaries(prev => ({ ...prev, [brandKey]: summary }));
    } catch (err: any) {
      message.error(err.response?.data?.detail || `${brandKey} 상품 수집에 실패했습니다.`);
    } finally {
      setLoadingBrands(prev => ({ ...prev, [brandKey]: false }));
    }
  };

  const handleImportAll = async () => {
    setLoadingAll(true);

    try {
      const results = await Promise.allSettled(
        brands.map(brand => {
          const request: ImportRequest = {
            brand: brand.key,
            update_existing: true,
          };
          return importBrandProducts(request);
        })
      );

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failCount = results.filter(r => r.status === 'rejected').length;

      message.success({
        content: (
          <div>
            <div>✅ 전체 브랜드 수집 완료!</div>
            <div>성공: {successCount}개 브랜드</div>
            <div>실패: {failCount}개 브랜드</div>
          </div>
        ),
        duration: 5,
      });

      // 모든 브랜드 통계 새로고침
      loadBrands();
    } catch (err: any) {
      message.error('전체 브랜드 수집에 실패했습니다.');
    } finally {
      setLoadingAll(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* 안내 메시지 */}
        <Alert
          message="브랜드별로 상품 데이터를 자동으로 수집하고 업데이트할 수 있습니다"
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
          action={
            <Button
              type="primary"
              size="small"
              icon={<ThunderboltOutlined />}
              loading={loadingAll}
              onClick={handleImportAll}
              disabled={brands.length === 0}
            >
              전체 브랜드 실행
            </Button>
          }
          style={{
            borderRadius: 8,
          }}
        />

        {/* 브랜드 카드 그리드 */}
        <Row gutter={[16, 16]}>
          {brands.map((brand) => {
            const summary = brandSummaries[brand.key];
            const isLoading = loadingBrands[brand.key] || false;

            return (
              <Col xs={24} sm={12} lg={8} xl={6} key={brand.key}>
                <Card
                  hoverable
                  style={{
                    height: '100%',
                    borderRadius: 8,
                  }}
                  bodyStyle={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    height: '100%',
                  }}
                >
                  <div>
                    <Title level={4} style={{ marginBottom: 4 }}>
                      {brand.name}
                    </Title>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      {brand.description}
                    </Text>
                    {summary && (
                      <div style={{ marginTop: 20 }}>
                        <Statistic
                          title="등록된 상품"
                          value={summary.total_products}
                          suffix="개"
                          valueStyle={{ fontSize: 28, color: '#1890ff' }}
                        />
                      </div>
                    )}
                  </div>
                  <Button
                    type="primary"
                    icon={<DownloadOutlined />}
                    loading={isLoading}
                    onClick={() => handleImportBrand(brand.key)}
                    block
                    size="large"
                    style={{ marginTop: 20 }}
                  >
                    {isLoading ? '수집 중...' : '실행'}
                  </Button>
                </Card>
              </Col>
            );
          })}
        </Row>

        {/* 빈 상태 */}
        {brands.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <Text type="secondary">사용 가능한 브랜드가 없습니다.</Text>
          </div>
        )}
      </Space>
    </div>
  );
};

export default ProductImporterPage;
