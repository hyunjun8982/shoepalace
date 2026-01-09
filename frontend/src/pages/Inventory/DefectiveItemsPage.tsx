import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Input,
  Row,
  Col,
  App,
  Tooltip,
  Popconfirm,
  Image,
} from 'antd';
import {
  SearchOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { InventoryDetail } from '../../types/inventory';
import { inventoryService } from '../../services/inventory';
import { useAuth } from '../../contexts/AuthContext';
import { brandService, Brand } from '../../services/brand';
import { getBrandIconUrl } from '../../utils/imageUtils';
import { getFileUrl } from '../../utils/urlUtils';

const { Search } = Input;

const DefectiveItemsPage: React.FC = () => {
  const { message } = App.useApp();
  const { user } = useAuth();
  const [defectiveItems, setDefectiveItems] = useState<InventoryDetail[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
  });
  const [searchText, setSearchText] = useState('');

  const fetchBrands = async () => {
    try {
      const response = await brandService.getBrands();
      setBrands(response.items);
    } catch (error) {
      console.error('Failed to fetch brands:', error);
    }
  };

  useEffect(() => {
    fetchBrands();
  }, []);

  useEffect(() => {
    fetchDefectiveItems();
  }, [pagination.current, pagination.pageSize, searchText]);

  const fetchDefectiveItems = async () => {
    try {
      setLoading(true);
      const response = await inventoryService.getDefectiveInventoryList({
        skip: (pagination.current - 1) * pagination.pageSize,
        limit: pagination.pageSize,
        search: searchText || undefined,
      });
      setDefectiveItems(response.items);
      setTotal(response.total);
    } catch (error: any) {
      console.error('Failed to fetch defective items:', error);
      message.error('불량 물품 목록 조회 실패: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleUnmarkDefective = async (inventoryId: string) => {
    try {
      await inventoryService.markDefective(inventoryId, 'remove');
      message.success('정상 처리되었습니다.');
      fetchDefectiveItems();
    } catch (error) {
      message.error('정상 처리에 실패했습니다.');
    }
  };

  const columns: ColumnsType<InventoryDetail> = [
    {
      title: 'No.',
      key: 'serial',
      width: 60,
      align: 'center',
      render: (_, __, index) => {
        return total - (pagination.current - 1) * pagination.pageSize - index;
      },
    },
    {
      title: '브랜드',
      dataIndex: 'brand',
      key: 'brand',
      width: 100,
      render: (brandName: string) => {
        if (!brandName) return '-';
        const brand = brands.find(b => b.name === brandName);
        const iconUrl = getBrandIconUrl(brand?.icon_url);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {iconUrl && (
              <img
                src={iconUrl}
                alt={brandName}
                style={{ width: 24, height: 24, objectFit: 'contain' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <span style={{ fontSize: '13px' }}>{brandName}</span>
          </div>
        );
      },
    },
    {
      title: '상품 이미지',
      key: 'image',
      width: 80,
      render: (_, record) => {
        const imagePath = record.brand && record.sku_code
          ? getFileUrl(`/uploads/products/${record.brand}/${record.sku_code}.png`)
          : null;

        if (imagePath) {
          return (
            <Image
              src={imagePath}
              width={50}
              height={50}
              style={{ objectFit: 'cover', borderRadius: '4px' }}
              preview={{ mask: '크게보기' }}
              fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH5QkbBQEfH0J0gAAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVBkLmUHAAACNUlEQVRo3u2ZT0gUURjAf++dmZ3d3V1X13+5mrqmYhYdCqKDRX+gQ0QHRQ8FQUFBh4IOQdChCLoERUGHoEMQFEUQBEUQBR0iKII0TcvM1DL/rbq77szs7MybDgaytjO7s+4W9L7TvO+9N9/3vu+9N/MGhBBCCCGEEEIIIYQQQgghhBBCCOEVSk4N7D9wEIDW1lYAmpqaANi5cycAnZ2dAKiqCkBfXx8Aw8PD3hZq27YUGBkZkQKDg4NSYGpqSgpMTEzI/unpaSng8/mkgNfrBaCoqAiA8vJyACorKwEoLS0FIC8vD4Dbt2/PvoC1a9cCcOTIEQAKCgoAmJiY4M2bNwDcu3ePeDyeEdi7dy8A586dA2DRokUAPHjwgGvXrgFgGMacF7B//34ALl++DEBZWRkAHz584MKFC1y9ejEjfW/fvgXg5MmTANTW1gLw6NEjzp49y9jYmLcCFhY27qqqSvv27aNQT4/kdDqd5cuXUygQCEihqqoqKRQKhaRQTU2NFKqpqZFCVVVVUigYDEqhsrIyKeT3+6VQIBCQ444ePSqNnzhxAoDCwkIA4vE4T58+5e7duwBEo1FvBUSjUS5evMjz588B0HXdk/4jkQg3b97k+vXrjI6OArMooKGhgc7OTlauXJm13kajUW7dusXVq1eJRCLeCti0aRN79uyhvr7e0046nc6HDx+4c+cOr1+/9lZAbW0t69evZ+3atYRCIdLF6XRy//59Hjx4wOjoqBS4cuUKFy9elGshT548kcGRI0eGzp8/f0YIIYQQ4n/iN5kkr0OZF2IAAAAAAElFTkSuQmCC"
            />
          );
        }
        return <span style={{ color: '#ccc' }}>-</span>;
      },
    },
    {
      title: '상품코드',
      dataIndex: 'sku_code',
      key: 'sku_code',
      width: 120,
      render: (code: string) => <Tag color="geekblue" style={{ fontSize: '13px' }}>{code || '-'}</Tag>,
    },
    {
      title: '상품명',
      dataIndex: 'product_name',
      key: 'product_name',
      width: 200,
      render: (name: string) => (
        <span style={{ fontWeight: 500, fontSize: '14px' }}>{name}</span>
      ),
    },
    {
      title: '사이즈',
      dataIndex: 'size',
      key: 'size',
      width: 80,
      align: 'center',
      render: (size: string) => <Tag>{size || 'FREE'}</Tag>,
    },
    {
      title: '불량 사진',
      dataIndex: 'defect_image_url',
      key: 'defect_image_url',
      width: 80,
      align: 'center' as 'center',
      render: (imageUrl: string) => {
        if (!imageUrl) {
          return <span style={{ color: '#ccc', fontSize: 11 }}>없음</span>;
        }
        return (
          <Image
            src={getFileUrl(imageUrl) || ''}
            width={50}
            height={50}
            style={{ objectFit: 'cover', borderRadius: '4px', border: '1px solid #d9d9d9' }}
            preview={{ mask: '보기' }}
            fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH5QkbBQEfH0J0gAAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVBkLmUHAAACNUlEQVRo3u2ZT0gUURjAf++dmZ3d3V1X13+5mrqmYhYdCqKDRX+gQ0QHRQ8FQUFBh4IOQdChCLoERUGHoEMQFEUQBEUQBR0iKII0TcvM1DL/rbq77szs7MybDgaytjO7s+4W9L7TvO+9N9/3vu+9N/MGhBBCCCGEEEIIIYQQQgghhBBCCOEVSk4N7D9wEIDW1lYAmpqaANi5cycAnZ2dAKiqCkBfXx8Aw8PD3hZq27YUGBkZkQKDg4NSYGpqSgpMTEzI/unpaSng8/mkgNfrBaCoqAiA8vJyACorKwEoLS0FIC8vD4Dbt2/PvoC1a9cCcOTIEQAKCgoAmJiY4M2bNwDcu3ePeDyeEdi7dy8A586dA2DRokUAPHjwgGvXrgFgGMacF7B//34ALl++DEBZWRkAHz584MKFC1y9ejEjfW/fvgXg5MmTANTW1gLw6NEjzp49y9jYmLcCFhY27qqqSvv27aNQT4/kdDqd5cuXUygQCEihqqoqKRQKhaRQTU2NFKqpqZFCVVVVUigYDEqhsrIyKeT3+6VQIBCQ444ePSqNnzhxAoDCwkIA4vE4T58+5e7duwBEo1FvBUSjUS5evMjz588B0HXdk/4jkQg3b97k+vXrjI6OArMooKGhgc7OTlauXJm13kajUW7dusXVq1eJRCLeCti0aRN79uyhvr7e0046nc6HDx+4c+cOr1+/9lZAbW0t69evZ+3atYRCIdLF6XRy//59Hjx4wOjoqBS4cuUKFy9elGshT548kcGRI0eGzp8/f0YIIYQQ4n/iN5kkr0OZF2IAAAAAAElFTkSuQmCC"
          />
        );
      },
    },
    {
      title: '불량 사유',
      dataIndex: 'defect_reason',
      key: 'defect_reason',
      width: 200,
      render: (reason: string) => (
        <Tooltip title={reason}>
          <span style={{
            display: 'block',
            maxWidth: 180,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: '#595959'
          }}>
            {reason || '-'}
          </span>
        </Tooltip>
      ),
    },
    {
      title: '작업',
      key: 'action',
      width: 120,
      align: 'center',
      render: (_, record) => (
        <Space size="small">
          <Popconfirm
            title="정상 처리"
            description="해당 재고를 정상 처리하시겠습니까?"
            onConfirm={() => handleUnmarkDefective(record.id!)}
            okText="확인"
            cancelText="취소"
            okButtonProps={{ style: { backgroundColor: '#0d1b2a', borderColor: '#0d1b2a' } }}
          >
            <Button
              size="small"
              icon={<CheckCircleOutlined />}
              style={{
                backgroundColor: '#0d1b2a',
                borderColor: '#0d1b2a',
                color: '#fff',
              }}
            >
              정상 처리
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px' }}>
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>불량 물품 관리</span>
            <Tag color="red">{total}건</Tag>
          </div>
        }
        extra={
          <Button icon={<ReloadOutlined />} onClick={fetchDefectiveItems}>
            새로고침
          </Button>
        }
        style={{
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
        }}
      >
        {/* 검색 영역 */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <Search
              placeholder="상품명, 상품코드 검색"
              allowClear
              onSearch={(value) => {
                setSearchText(value);
                setPagination({ ...pagination, current: 1 });
              }}
              style={{ width: '100%' }}
            />
          </Col>
        </Row>

        {/* 테이블 */}
        <Table
          columns={columns}
          dataSource={defectiveItems}
          loading={loading}
          rowKey="id"
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `총 ${total}건`,
            onChange: (page, pageSize) => {
              setPagination({ current: page, pageSize: pageSize || 20 });
            },
          }}
        />
      </Card>
    </div>
  );
};

export default DefectiveItemsPage;
