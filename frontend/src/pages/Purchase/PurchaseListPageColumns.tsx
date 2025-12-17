import { ColumnsType } from 'antd/es/table';
import { Button, Space, Tag, Popconfirm, Image } from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { Purchase, PaymentType, PurchaseStatus } from '../../types/purchase';
import dayjs from 'dayjs';
import { getFileUrl } from '../../utils/urlUtils';

export const getColumns = (
  navigate: any,
  handleDelete: (id: string) => void
): ColumnsType<Purchase> => [
  {
    title: (
      <div>
        <div>구매번호</div>
        <div style={{ fontSize: '11px', fontWeight: 'normal', color: '#999' }}>(구매일)</div>
      </div>
    ),
    key: 'purchase_info',
    width: 120,
    render: (_, record) => (
      <div style={{ lineHeight: '1.4' }}>
        <div style={{ fontWeight: 500, fontSize: '13px' }}>
          {record.transaction_no?.startsWith('P') ? record.transaction_no : `P${record.transaction_no}`}
        </div>
        <div style={{ fontSize: '12px', color: '#666' }}>
          ({dayjs(record.purchase_date).format('YYYY-MM-DD')})
        </div>
      </div>
    ),
  },
  {
    title: '구매처',
    dataIndex: 'supplier',
    key: 'supplier',
    width: 120,
  },
  {
    title: '브랜드',
    key: 'brand',
    width: 100,
    render: (_, record) => {
      if (!record.items || record.items.length === 0) return '-';
      const brandName = record.items[0]?.product?.brand_name;
      if (!brandName) return '-';

      const iconUrl = getFileUrl(`/uploads/brands/${brandName.toLowerCase()}.png`);
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
    title: '상품사진',
    key: 'product_image',
    width: 70,
    render: (_, record) => {
      if (!record.items || record.items.length === 0) {
        return (
          <div style={{
            width: 50,
            height: 50,
            backgroundColor: '#f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            color: '#999'
          }}>
            No Image
          </div>
        );
      }

      const firstItem = record.items[0];
      let imageUrl = firstItem.product_image_url;

      if (!imageUrl && firstItem.product) {
        const brandName = firstItem.product.brand_name;
        const productCode = firstItem.product.product_code;
        if (brandName && productCode) {
          imageUrl = getFileUrl(`/uploads/products/${brandName}/${productCode}.png`) || undefined;
        }
      }

      if (imageUrl) {
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <Image
              src={imageUrl}
              width={50}
              height={50}
              style={{ objectFit: 'cover', cursor: 'pointer' }}
              preview={{
                mask: '크게보기'
              }}
              fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH5QkbBQEfH0J0gAAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVBkLmUHAAACNUlEQVRo3u2ZT0gUURjAf++dmZ3d3V1X13+5mrqmYhYdCqKDRX+gQ0QHRQ8FQUFBh4IOQdChCLoERUGHoEMQFEUQBEUQBR0iKII0TcvM1DL/rbq77szs7MybDgaytjO7s+4W9L7TvO+9N9/3vu+9N/MGhBBCCCGEEEIIIYQQQgghhBBCCOEVSk4N7D9wEIDW1lYAmpqaANi5cycAnZ2dAKiqCkBfXx8Aw8PD3hZq27YUGBkZkQKDg4NSYGpqSgpMTEzI/unpaSng8/mkgNfrBaCoqAiA8vJyACorKwEoLS0FIC8vD4Dbt2/PvoC1a9cCcOTIEQAKCgoAmJiY4M2bNwDcu3ePeDyeEdi7dy8A586dA2DRokUAPHjwgGvXrgFgGMacF7B//34ALl++DEBZWRkAHz584MKFC1y9ejEjfW/fvgXg5MmTANTW1gLw6NEjzp49y9jYmLcCFhY27qqqSvv27aNQT4/kdDqd5cuXUygQCEihqqoqKRQKhaRQTU2NFKqpqZFCVVVVUigYDEqhsrIyKeT3+6VQIBCQ444ePSqNnzhxAoDCwkIA4vE4T58+5e7duwBEo1FvBUSjUS5evMjz588B0HXdk/4jkQg3b97k+vXrjI6OArMooKGhgc7OTlauXJm13kajUW7dusXVq1eJRCLeCti0aRN79uyhvr7e0046nc6HDx+4c+cOr1+/9lZAbW0t69evZ+3atYRCIdLF6XRy//59Hjx4wOjoqBS4cuUKFy9elGshT548kcGRI0eGzp8/f0YIIYQQ4n/iN5kkr0OZF2IAAAAAAElFTkSuQmCC"
            />
          </div>
        );
      }

      return (
        <div style={{
          width: 50,
          height: 50,
          backgroundColor: '#f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          color: '#999'
        }}>
          No Image
        </div>
      );
    },
  },
  {
    title: '상품번호',
    key: 'product_codes',
    width: 120,
    render: (_, record) => {
      if (!record.items || record.items.length === 0) return '-';
      // 첫 번째 아이템의 상품번호만 표시 (같은 상품의 여러 사이즈이므로)
      const code = record.items[0]?.product?.product_code || '-';
      return <span style={{ fontWeight: 600, whiteSpace: 'normal', wordBreak: 'break-all' }}>{code}</span>;
    },
  },
  {
    title: '상품명',
    key: 'product_names',
    width: 240,
    render: (_, record) => {
      if (!record.items || record.items.length === 0) return '-';
      // 첫 번째 아이템의 상품명만 표시 (같은 상품의 여러 사이즈이므로)
      const name = record.items[0]?.product?.product_name || record.items[0]?.product_name || '-';
      return <span style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{name}</span>;
    },
  },
  {
    title: '사이즈별 수량',
    key: 'sizes_quantity',
    width: 150,
    render: (_, record) => {
      if (!record.items || record.items.length === 0) return '-';
      const sizeMap = new Map<string, number>();
      record.items.forEach(item => {
        const size = item.size || 'FREE';
        const current = sizeMap.get(size) || 0;
        sizeMap.set(size, current + (item.quantity || 1));
      });

      const sortedEntries = Array.from(sizeMap.entries()).sort(([a], [b]) => {
        const aNum = parseFloat(a);
        const bNum = parseFloat(b);
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return aNum - bNum;
        }
        return a.localeCompare(b);
      });

      const total = record.items.reduce((sum, item) => sum + (item.quantity || 0), 0);

      return (
        <div style={{
          width: '100%',
          fontSize: '12px',
          margin: '-8px -16px',
        }}>
          <table style={{
            borderCollapse: 'collapse',
            width: '100%',
          }}>
            <tbody>
              {sortedEntries.map(([size, qty], idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 500, color: '#666' }}>{size}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>{qty}개</td>
                </tr>
              ))}
              <tr style={{ backgroundColor: '#f0f7ff' }}>
                <td colSpan={2} style={{
                  padding: '6px 8px',
                  fontWeight: 700,
                  fontSize: '13px',
                  color: '#1890ff',
                  textAlign: 'right',
                  borderTop: '2px solid #1890ff'
                }}>
                  총 {total}개
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      );
    },
  },
  {
    title: '총액',
    dataIndex: 'total_amount',
    key: 'total_amount',
    width: 90,
    align: 'left',
    render: (amount: number) => (
      <span style={{ fontWeight: 600 }}>₩{amount.toLocaleString()}</span>
    ),
  },
  {
    title: '결제방식',
    key: 'payment_info',
    width: 70,
    align: 'center',
    render: (_, record) => {
      const typeMap = {
        [PaymentType.CORP_CARD]: { text: '법인카드', color: 'blue' },
        [PaymentType.CORP_ACCOUNT]: { text: '법인계좌', color: 'green' },
        [PaymentType.PERSONAL_CARD]: { text: '개인카드', color: 'orange' },
      };
      const config = typeMap[record.payment_type];
      return (
        <Tag color={config.color} style={{ margin: 0, fontSize: '11px' }}>
          {config.text}
        </Tag>
      );
    },
  },
  {
    title: '창고',
    key: 'warehouse',
    width: 120,
    align: 'center' as 'center',
    render: (_, record) => {
      const warehouse = record.items?.[0]?.warehouse;
      if (!warehouse) return '-';
      return (
        <div style={{ lineHeight: '1.4' }}>
          <div style={{ fontWeight: 500 }}>[{warehouse.name}]</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{warehouse.location || '-'}</div>
        </div>
      );
    },
  },
  {
    title: '구매자',
    dataIndex: 'buyer_name',
    key: 'buyer_name',
    width: 70,
    align: 'center',
    render: (name: string) => name || '알 수 없음',
  },
];
