import React, { useEffect, useState } from 'react';
import { Card, Spin, Alert, Button, Space, Pagination } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { trendingProductService, KreamProductItem } from '../../services/trendingProduct';

// 이미지 프록시 URL (Render 프록시 사용 - KREAM Referer 체크 우회)
const getImageUrl = (originalUrl: string) => {
  if (!originalUrl) return '';
  if (originalUrl.includes('kream-phinf.pstatic.net')) {
    return `https://shoepalace-pxos.onrender.com/image?url=${encodeURIComponent(originalUrl)}`;
  }
  return originalUrl;
};

type DateRangeType = 'realtime' | 'weekly' | 'monthly';

// 카테고리 ID 매핑 (KREAM category_filter 값)
const CATEGORY_OPTIONS: { id: string; label: string }[] = [
  { id: '12', label: '신발' },
  { id: '281', label: '패딩' },
  { id: '38', label: '상의' },
];

const DATE_RANGE_OPTIONS: { value: DateRangeType; label: string }[] = [
  { value: 'realtime', label: '급상승' },
  { value: 'weekly', label: '주간' },
  { value: 'monthly', label: '월간' },
];

const TrendingProductWidget: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<KreamProductItem[]>([]);
  const [categoryId, setCategoryId] = useState<string>('12');
  const [dateRange, setDateRange] = useState<DateRangeType>('realtime');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    fetchData();
  }, [categoryId, dateRange]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      setCurrentPage(1);

      const params: { category_id: string; date_range?: 'weekly' | 'monthly' } = {
        category_id: categoryId,
      };
      if (dateRange !== 'realtime') {
        params.date_range = dateRange;
      }

      const response = await trendingProductService.getKreamRanking(params);

      const productItems = (response?.items || [])
        .filter(item => item.product_item)
        .map(item => item.product_item);
      setProducts(productItems);
    } catch (err: any) {
      console.error('KREAM API Error:', err);
      setError(err.message || '데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 순위 변동 파싱
  const parseFlucRanking = (flucRanking: any) => {
    if (!flucRanking?.lookups?.[0]?.text) return null;
    const text = flucRanking.lookups[0].text;
    if (text === '-') return { type: 'same', value: '-' };
    if (text === 'NEW') return { type: 'new', value: 'NEW' };
    const match = text.match(/([▲▼])(\d+)/);
    if (match) {
      return { type: match[1] === '▲' ? 'up' : 'down', value: match[2] };
    }
    return null;
  };

  const renderFlucRanking = (flucRanking: any) => {
    const parsed = parseFlucRanking(flucRanking);
    if (!parsed) return <span style={{ fontSize: 11, color: '#a0a0a0' }}>-</span>;

    if (parsed.type === 'same') {
      return <span style={{ fontSize: 11, color: '#a0a0a0' }}>-</span>;
    }
    if (parsed.type === 'new') {
      return <span style={{ fontSize: 11, color: '#31b46e', fontWeight: 600 }}>NEW</span>;
    }
    if (parsed.type === 'up') {
      return <span style={{ fontSize: 11, color: '#f15746', fontWeight: 500 }}>▲{parsed.value}</span>;
    }
    if (parsed.type === 'down') {
      return <span style={{ fontSize: 11, color: '#31b46e', fontWeight: 500 }}>▼{parsed.value}</span>;
    }
    return null;
  };

  // 거래량 포맷
  const formatVolume = (volume: number) => {
    if (!volume) return '';
    if (volume >= 10000) {
      return `거래 ${(volume / 10000).toFixed(1)}만`;
    }
    return `거래 ${volume.toLocaleString()}`;
  };

  // 현재 페이지 상품들
  const currentProducts = products.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (loading) {
    return (
      <Card
        style={{ borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
        bodyStyle={{ padding: '16px' }}
      >
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 12, color: '#8c8c8c', fontSize: 13 }}>KREAM 데이터 로딩중...</div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img
              src="/images/kream/kream_logo.png"
              alt="KREAM"
              style={{ height: 24 }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <span style={{ fontSize: 15, fontWeight: 600 }}>인기상품</span>
          </div>
          {/* 카테고리 버튼 - KREAM 스타일 pill 버튼 */}
          <div style={{ display: 'flex', gap: 8 }}>
            {CATEGORY_OPTIONS.map(opt => (
              <div
                key={opt.id}
                onClick={() => setCategoryId(opt.id)}
                style={{
                  padding: '5px 14px',
                  borderRadius: 18,
                  fontSize: 13,
                  fontWeight: categoryId === opt.id ? 600 : 400,
                  cursor: 'pointer',
                  border: categoryId === opt.id ? '1px solid #222' : '1px solid #ebebeb',
                  backgroundColor: categoryId === opt.id ? '#222' : '#fff',
                  color: categoryId === opt.id ? '#fff' : '#222',
                  transition: 'all 0.2s',
                }}
              >
                {opt.label}
              </div>
            ))}
          </div>
        </div>
      }
      extra={
        <Space size={8}>
          {/* 기간 버튼 */}
          <div style={{ display: 'flex', gap: 8 }}>
            {DATE_RANGE_OPTIONS.map(opt => (
              <div
                key={opt.value}
                onClick={() => setDateRange(opt.value)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 18,
                  fontSize: 13,
                  fontWeight: dateRange === opt.value ? 600 : 400,
                  cursor: 'pointer',
                  border: dateRange === opt.value ? '1px solid #222' : '1px solid #ebebeb',
                  backgroundColor: dateRange === opt.value ? '#222' : '#fff',
                  color: dateRange === opt.value ? '#fff' : '#222',
                  transition: 'all 0.2s',
                }}
              >
                {opt.label}
              </div>
            ))}
          </div>
          <Button
            type="text"
            icon={<ReloadOutlined />}
            onClick={fetchData}
            size="small"
          />
        </Space>
      }
      style={{ borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
      bodyStyle={{ padding: '16px' }}
    >
      {error ? (
        <Alert
          message={error}
          type="error"
          showIcon
          action={<Button size="small" onClick={fetchData}>재시도</Button>}
        />
      ) : products.length === 0 ? (
        <Alert message="표시할 데이터가 없습니다." type="info" showIcon />
      ) : (
        <>
          {/* 그리드 레이아웃 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(10, minmax(100px, 1fr))',
            gap: '16px 12px',
          }}>
            {currentProducts.map((item, index) => {
              const rank = item.ranking?.text || String((currentPage - 1) * pageSize + index + 1);
              const productName = item.name || '';
              const imageUrl = item.product_image?.url || '';
              const price = item.price?.text || '';
              const bgColor = item.product_image?.bgcolor || '#f4f4f4';
              const volume = item.trading_volume;

              return (
                <div
                  key={item.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => window.open(`https://kream.co.kr/products/${item.id}`, '_blank')}
                >
                  {/* 이미지 영역 - aspect-ratio 사용 */}
                  <div style={{
                    position: 'relative',
                    backgroundColor: bgColor,
                    borderRadius: 10,
                    width: '100%',
                    aspectRatio: '1 / 1',
                    overflow: 'hidden',
                  }}>
                    <img
                      src={getImageUrl(imageUrl)}
                      alt={productName}
                      style={{
                        position: 'absolute',
                        top: '10%',
                        left: '10%',
                        width: '80%',
                        height: '80%',
                        objectFit: 'contain',
                      }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    {/* 거래량 배지 */}
                    {volume > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        backgroundColor: 'rgba(255,255,255,0.95)',
                        borderRadius: 10,
                        padding: '2px 8px',
                        fontSize: 10,
                        color: '#333',
                        fontWeight: 500,
                      }}>
                        {formatVolume(volume)}
                      </div>
                    )}
                  </div>

                  {/* 정보 영역 - 고정 높이 */}
                  <div style={{ marginTop: 8, height: 56 }}>
                    {/* 순위 + 상품명 */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        marginBottom: 4,
                        height: 18,
                      }}
                      title={productName}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#222', flexShrink: 0 }}>{rank}</span>
                      <span
                        style={{
                          fontSize: 11,
                          color: '#222',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {productName}
                      </span>
                    </div>

                    {/* 가격 */}
                    <div style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#222',
                      height: 18,
                      lineHeight: '18px',
                    }}>
                      {price}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 페이지네이션 */}
          {products.length > pageSize && (
            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <Pagination
                current={currentPage}
                pageSize={pageSize}
                total={products.length}
                onChange={setCurrentPage}
                size="small"
                showSizeChanger={false}
              />
            </div>
          )}
        </>
      )}
    </Card>
  );
};

export default TrendingProductWidget;
