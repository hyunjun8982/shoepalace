import React, { useEffect, useState } from 'react';
import { Card, Tabs, List, Tag, Spin, Alert, Button } from 'antd';
import { trendingProductService, TrendingProductWithInventory } from '../../services/trendingProduct';

const TrendingProductWidget: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<TrendingProductWithInventory[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await trendingProductService.getTrendingProductsWithInventory();
      setProducts(data);
    } catch (err: any) {
      setError(err.message || '데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 카테고리 레이블 맵핑
  const getCategoryLabel = (cat: string) => {
    const labelMap: Record<string, string> = {
      'apparel': '의류 (apparel)',
      'shoes': '신발 (shoes)',
      'hat': '모자 (hat)',
      'socks': '양말 (socks)',
      'bag': '가방 (bag)',
      'accessories': '잡화 (accessories)',
      'etc': '기타 (etc)',
    };
    return labelMap[cat] || cat;
  };

  // 카테고리별로 상품 그룹화
  const groupByCategory = () => {
    const grouped: { [key: string]: TrendingProductWithInventory[] } = {};

    products.forEach(product => {
      const category = product.category || '기타';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(product);
    });

    // 각 카테고리별로 rank 순서로 정렬 (100개 전체)
    Object.keys(grouped).forEach(category => {
      grouped[category] = grouped[category]
        .sort((a, b) => a.rank - b.rank);
    });

    return grouped;
  };

  const categoryGroups = groupByCategory();

  // 탭 아이템 생성 (전체 탭 제거)
  const tabItems = Object.keys(categoryGroups).sort().map(category => ({
    key: category,
    label: getCategoryLabel(category),
    children: (
      <List
        dataSource={categoryGroups[category]}
        pagination={{
          pageSize: 10,
          size: 'small',
          showSizeChanger: false,
          style: { marginBottom: 16 },
        }}
        renderItem={(item) => (
          <List.Item
            style={{
              padding: '8px 16px',
              borderBottom: '1px solid #f0f0f0',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Tag color="blue" style={{ margin: 0, fontSize: 11, padding: '2px 6px', minWidth: '40px', textAlign: 'center' }}>
              {item.rank}위
            </Tag>
            <div style={{ fontSize: 11, color: '#8c8c8c', fontWeight: 500, width: '80px', wordBreak: 'break-word' }}>
              {item.brand}
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div
                style={{
                  fontSize: 12,
                  color: '#262626',
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={item.product_name}
              >
                {item.product_name}
              </div>
              <div style={{ fontSize: 10, color: '#8c8c8c' }}>
                {item.model_number}
              </div>
            </div>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: item.inventory_count > 0 ? '#52c41a' : '#d9d9d9',
              minWidth: '45px',
              textAlign: 'right',
            }}>
              {item.inventory_count}개
            </div>
            <Button
              type="link"
              size="small"
              onClick={() => window.open(`https://kream.co.kr/products/${item.kream_product_id}`, '_blank')}
              style={{ fontSize: 11, minWidth: '55px', padding: '0 8px' }}
            >
              KREAM
            </Button>
          </List.Item>
        )}
      />
    ),
  }));

  if (loading) {
    return (
      <Card
        style={{
          borderRadius: '8px',
          border: '1px solid #e8e8e8',
          boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
        }}
        bodyStyle={{ padding: '16px' }}
        headStyle={{ padding: '12px 16px' }}
      >
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (error || products.length === 0) {
    return (
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img
              src="/images/kream/kream_logo.png"
              alt="KREAM"
              style={{ height: 32 }}
            />
            <span>인기상품</span>
          </div>
        }
        style={{
          borderRadius: '8px',
          border: '1px solid #e8e8e8',
          boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
        }}
        bodyStyle={{ padding: '16px' }}
        headStyle={{ padding: '12px 16px' }}
      >
        <Alert
          message={error || '등록된 인기상품이 없습니다.'}
          type="info"
          showIcon
        />
      </Card>
    );
  }

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img
            src="/images/kream/kream_logo.png"
            alt="KREAM"
            style={{ height: 32 }}
          />
          <span>인기상품</span>
        </div>
      }
      style={{
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
      bodyStyle={{ padding: 0, flex: 1, overflow: 'auto' }}
      headStyle={{ padding: '12px 16px' }}
    >
      <Tabs
        defaultActiveKey={tabItems[0]?.key}
        items={tabItems}
        size="small"
        style={{ padding: '0 16px' }}
        tabBarStyle={{ marginBottom: 0 }}
      />
    </Card>
  );
};

export default TrendingProductWidget;
