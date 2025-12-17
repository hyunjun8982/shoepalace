import React, { useState, useEffect } from 'react';
import {
  Card,
  Upload,
  Button,
  Table,
  Space,
  App,
  Statistic,
  Row,
  Col,
  Popconfirm,
  Tag,
  Input,
  Select,
  Tabs,
} from 'antd';
import {
  UploadOutlined,
  DeleteOutlined,
  FileExcelOutlined,
  TrophyOutlined,
  ShoppingOutlined,
} from '@ant-design/icons';
import type { UploadProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { trendingProductService, TrendingProduct, TrendingProductStats } from '../../services/trendingProduct';
import dayjs from 'dayjs';

const TrendingProductManagePage: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [products, setProducts] = useState<TrendingProduct[]>([]);
  const [stats, setStats] = useState<TrendingProductStats | null>(null);
  const [dataPeriod, setDataPeriod] = useState<string>('');
  const [category, setCategory] = useState<string>('apparel');
  const [filterCategory, setFilterCategory] = useState<string>('apparel');
  const [categories, setCategories] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 100,
  });

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchData();
  }, [pagination.current, pagination.pageSize, filterCategory]);

  const fetchCategories = async () => {
    try {
      const cats = await trendingProductService.getCategories();
      setCategories(cats);
      if (cats.length > 0 && !category) {
        setCategory(cats[0]);
      }
    } catch (error) {
      console.error('카테고리 목록 조회 실패:', error);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [productsData, statsData] = await Promise.all([
        trendingProductService.getTrendingProducts({
          skip: (pagination.current - 1) * pagination.pageSize,
          limit: pagination.pageSize,
          category: filterCategory,
        }),
        trendingProductService.getStats(),
      ]);

      setProducts(productsData.items);
      setTotal(productsData.total);
      setStats(statsData);
    } catch (error) {
      message.error('데이터 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (file: File) => {
    try {
      setUploading(true);
      const result = await trendingProductService.uploadExcel(file, category, dataPeriod || undefined);
      message.success(`${result.uploaded_count}개 상품 업로드 완료! (카테고리: ${category})`);
      fetchData();
      setDataPeriod('');
    } catch (error: any) {
      message.error(error.response?.data?.detail || '업로드 실패');
    } finally {
      setUploading(false);
    }
  };

  const uploadProps: UploadProps = {
    name: 'file',
    accept: '.xlsx,.xls',
    maxCount: 1,
    showUploadList: false,
    beforeUpload: (file) => {
      const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                      file.type === 'application/vnd.ms-excel';
      if (!isExcel) {
        message.error('엑셀 파일만 업로드 가능합니다!');
        return Upload.LIST_IGNORE;
      }
      handleUpload(file);
      return false;
    },
  };

  const handleDeleteAll = async () => {
    try {
      setLoading(true);
      await trendingProductService.deleteAll();
      message.success('모든 데이터가 삭제되었습니다.');
      fetchData();
      fetchCategories();
    } catch (error) {
      message.error('삭제 실패');
    } finally {
      setLoading(false);
    }
  };

  // 전체 카테고리 옵션 (고정값)
  const allCategoryOptions = [
    { value: 'apparel', label: '👕 의류' },
    { value: 'shoes', label: '👟 신발' },
    { value: 'hat', label: '🧢 모자' },
    { value: 'socks', label: '🧦 양말' },
    { value: 'bag', label: '👜 가방' },
    { value: 'accessories', label: '🎒 잡화' },
    { value: 'etc', label: '📦 기타' },
  ];

  // 카테고리 레이블 맵핑
  const getCategoryLabel = (cat: string) => {
    const option = allCategoryOptions.find(opt => opt.value === cat);
    return option ? option.label : cat;
  };

  // 등록된 카테고리 옵션 (필터용 - DB에서 가져온 카테고리만)
  const categoryOptions = categories
    .map(cat => ({
      value: cat,
      label: getCategoryLabel(cat),
    }))
    .sort((a, b) => {
      const aIndex = allCategoryOptions.findIndex(opt => opt.value === a.value);
      const bIndex = allCategoryOptions.findIndex(opt => opt.value === b.value);
      return aIndex - bIndex;
    });

  const columns: ColumnsType<TrendingProduct> = [
    {
      title: '순위',
      dataIndex: 'rank',
      key: 'rank',
      width: 70,
      render: (rank: number) => (
        <Tag color={rank <= 10 ? 'gold' : rank <= 30 ? 'blue' : 'default'}>
          {rank}위
        </Tag>
      ),
    },
    {
      title: '브랜드',
      dataIndex: 'brand',
      key: 'brand',
      width: 100,
    },
    {
      title: '상품명',
      dataIndex: 'product_name',
      key: 'product_name',
      width: 250,
      ellipsis: true,
    },
    {
      title: '모델번호',
      dataIndex: 'model_number',
      key: 'model_number',
      width: 180,
      render: (text: string) => text || '-',
    },
    {
      title: 'KREAM',
      key: 'kream_link',
      width: 80,
      align: 'center',
      render: (_: any, record: TrendingProduct) => (
        <Button
          type="link"
          size="small"
          onClick={() => window.open(`https://kream.co.kr/products/${record.kream_product_id}`, '_blank')}
        >
          보기
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      {/* 업로드 영역 */}
      <Card
        title={
          <Space>
            <FileExcelOutlined />
            KREAM 인기 상품 데이터 관리
          </Space>
        }
        extra={
          <Space>
            {total > 0 && (
              <Popconfirm
                title="모든 데이터를 삭제하시겠습니까?"
                description="이 작업은 되돌릴 수 없습니다."
                onConfirm={handleDeleteAll}
                okText="삭제"
                cancelText="취소"
              >
                <Button danger icon={<DeleteOutlined />}>
                  전체 삭제
                </Button>
              </Popconfirm>
            )}
          </Space>
        }
        style={{ marginBottom: 24 }}
      >
        <Row gutter={16} align="middle">
          <Col>
            <div style={{ marginBottom: 4, fontSize: 12, color: '#8c8c8c' }}>카테고리</div>
            <Select
              value={category}
              onChange={setCategory}
              style={{ width: 180 }}
              options={allCategoryOptions}
            />
          </Col>
          <Col>
            <div style={{ marginBottom: 4, fontSize: 12, color: '#8c8c8c' }}>데이터 기간 (선택)</div>
            <Input
              placeholder="예: 2024-10 최근 30일"
              value={dataPeriod}
              onChange={(e) => setDataPeriod(e.target.value)}
              style={{ width: 250 }}
            />
          </Col>
          <Col>
            <div style={{ marginBottom: 4, fontSize: 12, color: 'transparent' }}>-</div>
            <Upload {...uploadProps}>
              <Button icon={<UploadOutlined />} loading={uploading} type="primary">
                엑셀 파일 업로드
              </Button>
            </Upload>
          </Col>
          <Col flex="auto">
            <div style={{ fontSize: 12, color: '#8c8c8c', lineHeight: 1.5 }}>
              <div>* 업로드 시 선택한 카테고리의 기존 데이터만 삭제되고 새 데이터로 교체됩니다.</div>
              <div>* 파일 형식: 순위, 브랜드, 상품명, 상품ID, 모델번호 (5개 컬럼)</div>
            </div>
          </Col>
        </Row>
      </Card>

      {/* 테이블 */}
      <Card title="인기 상품 목록">
        <Tabs
          activeKey={filterCategory || allCategoryOptions[0]?.value}
          onChange={(key) => {
            setFilterCategory(key);
            setPagination({ current: 1, pageSize: 100 });
          }}
          tabBarExtraContent={
            products.length > 0 && products[0]?.upload_date && (
              <span style={{ fontSize: 13, color: '#8c8c8c', marginLeft: 16 }}>
                업로드: {dayjs(products[0].upload_date).format('YYYY-MM-DD HH:mm')}
              </span>
            )
          }
          items={allCategoryOptions.map(cat => ({
            key: cat.value,
            label: cat.label,
            children: (
              <Row gutter={16}>
                <Col span={12}>
                  <Table
                    columns={columns}
                    dataSource={products.slice(0, 50)}
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                    size="small"
                  />
                </Col>
                <Col span={12}>
                  <Table
                    columns={columns}
                    dataSource={products.slice(50, 100)}
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                    size="small"
                  />
                </Col>
              </Row>
            ),
          }))}
        />
      </Card>
    </div>
  );
};

export default TrendingProductManagePage;
