import { ColumnsType } from 'antd/es/table';
import { Button, Tag, Image, Tooltip, Modal } from 'antd';
import { CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { Purchase, PaymentType } from '../../types/purchase';
import dayjs from 'dayjs';
import { getFileUrl } from '../../utils/urlUtils';

export const getColumns = (
  navigate: any,
  handleDelete: (id: string) => void,
  handleConfirm?: (id: string) => void,
  handleUnconfirm?: (id: string) => void,
  currentUserRole?: string
): ColumnsType<Purchase> => [
  {
    title: '구매번호',
    key: 'purchase_info',
    width: 130,
    render: (_, record) => (
      <div style={{ lineHeight: '1.4' }}>
        <div style={{ fontWeight: 500, fontSize: '13px' }}>
          {record.transaction_no?.startsWith('P') ? record.transaction_no : `P${record.transaction_no}`}
        </div>
        <div style={{ fontSize: '11px', color: '#888' }}>
          {dayjs(record.purchase_date).format('YYYY-MM-DD')}
        </div>
      </div>
    ),
  },
  {
    title: '구매처',
    dataIndex: 'supplier',
    key: 'supplier',
    width: 100,
    render: (text: string) => <span style={{ fontSize: '13px' }}>{text || '-'}</span>,
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
              style={{ width: 20, height: 20, objectFit: 'contain' }}
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
    title: '상품',
    key: 'product_image',
    width: 60,
    render: (_, record) => {
      if (!record.items || record.items.length === 0) {
        return (
          <div style={{
            width: 44,
            height: 44,
            backgroundColor: '#f5f5f5',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            color: '#bbb'
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
              width={44}
              height={44}
              style={{ objectFit: 'cover', borderRadius: 4 }}
              preview={{ mask: '확대' }}
              fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH5QkbBQEfH0J0gAAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVBkLmUHAAACNUlEQVRo3u2ZT0gUURjAf++dmZ3d3V1X13+5mrqmYhYdCqKDRX+gQ0QHRQ8FQUFBh4IOQdChCLoERUGHoEMQFEUQBEUQBR0iKII0TcvM1DL/rbq77szs7MybDgaytjO7s+4W9L7TvO+9N9/3vu+9N/MGhBBCCCGEEEIIIYQQQgghhBBCCOEVSk4N7D9wEIDW1lYAmpqaANi5cycAnZ2dAKiqCkBfXx8Aw8PD3hZq27YUGBkZkQKDg4NSYGpqSgpMTEzI/unpaSng8/mkgNfrBaCoqAiA8vJyACorKwEoLS0FIC8vD4Dbt2/PvoC1a9cCcOTIEQAKCgoAmJiY4M2bNwDcu3ePeDyeEdi7dy8A586dA2DRokUAPHjwgGvXrgFgGMacF7B//34ALl++DEBZWRkAHz584MKFC1y9ejEjfW/fvgXg5MmTANTW1gLw6NEjzp49y9jYmLcCFhY27qqqSvv27aNQT4/kdDqd5cuXUygQCEihqqoqKRQKhaRQTU2NFKqpqZFCVVVVUigYDEqhsrIyKeT3+6VQIBCQ444ePSqNnzhxAoDCwkIA4vE4T58+5e7duwBEo1FvBUSjUS5evMjz588B0HXdk/4jkQg3b97k+vXrjI6OArMooKGhgc7OTlauXJm13kajUW7dusXVq1eJRCLeCti0aRN79uyhvr7e0046nc6HDx+4c+cOr1+/9lZAbW0t69evZ+3atYRCIdLF6XRy//59Hjx4wOjoqBS4cuUKFy9elGshT548kcGRI0eGzp8/f0YIIYQQ4n/iN5kkr0OZF2IAAAAAAElFTkSuQmCC"
            />
          </div>
        );
      }

      return (
        <div style={{
          width: 44,
          height: 44,
          backgroundColor: '#f5f5f5',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          color: '#bbb'
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
      const code = record.items[0]?.product?.product_code || '-';
      return <span style={{ fontWeight: 500, fontSize: '12px', whiteSpace: 'normal', wordBreak: 'break-all' }}>{code}</span>;
    },
  },
  {
    title: '상품명',
    key: 'product_names',
    width: 200,
    render: (_, record) => {
      if (!record.items || record.items.length === 0) return '-';
      const name = record.items[0]?.product?.product_name || record.items[0]?.product_name || '-';
      return <span style={{ fontSize: '12px', whiteSpace: 'normal', wordBreak: 'break-word', color: '#333' }}>{name}</span>;
    },
  },
  {
    title: '수량',
    key: 'sizes_quantity',
    width: 70,
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

      const tooltipContent = (
        <div style={{ minWidth: 100 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.2)' }}>사이즈별 수량</div>
          {sortedEntries.map(([size, qty], idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
              <span style={{ color: 'rgba(255,255,255,0.85)' }}>{size}</span>
              <span style={{ fontWeight: 500 }}>{qty}개</span>
            </div>
          ))}
        </div>
      );

      return (
        <Tooltip title={tooltipContent} placement="left">
          <span style={{ cursor: 'pointer', fontWeight: 600, fontSize: '13px', color: '#1890ff' }}>
            {total}개
          </span>
        </Tooltip>
      );
    },
  },
  {
    title: '총액',
    dataIndex: 'total_amount',
    key: 'total_amount',
    width: 100,
    render: (amount: number) => (
      <span style={{ fontWeight: 600, fontSize: '13px' }}>₩{amount?.toLocaleString() || 0}</span>
    ),
  },
  {
    title: '결제',
    key: 'payment_info',
    width: 70,
    render: (_, record) => {
      const typeMap: Record<string, { text: string; color: string }> = {
        [PaymentType.CORP_CARD]: { text: '법인카드', color: 'blue' },
        [PaymentType.CORP_ACCOUNT]: { text: '법인계좌', color: 'green' },
        [PaymentType.PERSONAL_CARD]: { text: '개인카드', color: 'orange' },
        [PaymentType.PERSONAL_CARD_INSER]: { text: '개인(인서)', color: 'purple' },
        [PaymentType.PERSONAL_CARD_DAHEE]: { text: '개인(다희)', color: 'magenta' },
      };
      const config = typeMap[record.payment_type];
      return (
        <Tag color={config?.color || 'default'} style={{ margin: 0, fontSize: '11px' }}>
          {config?.text || '-'}
        </Tag>
      );
    },
  },
  {
    title: '구매자',
    dataIndex: 'buyer_name',
    key: 'buyer_name',
    width: 70,
    render: (name: string) => <span style={{ fontSize: '13px' }}>{name || '-'}</span>,
  },
  {
    title: '입고확인',
    key: 'confirm_status',
    width: 90,
    align: 'center',
    render: (_, record) => {
      if (record.is_confirmed) {
        const isAdmin = currentUserRole === 'admin';
        return (
          <Tooltip title={isAdmin ? '클릭하여 입고확인 취소' : `${record.receiver_name || '확인자'} (${record.confirmed_at ? dayjs(record.confirmed_at).format('MM/DD HH:mm') : ''})`}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                cursor: isAdmin ? 'pointer' : 'default',
                minHeight: 40,
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (isAdmin && handleUnconfirm) {
                  Modal.confirm({
                    title: '입고확인 취소',
                    icon: <ExclamationCircleOutlined />,
                    content: '입고확인을 취소하시겠습니까?',
                    okText: '취소하기',
                    cancelText: '닫기',
                    okButtonProps: { danger: true },
                    onOk: () => handleUnconfirm(record.id),
                  });
                }
              }}
            >
              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
              <span style={{ fontSize: 11, color: '#52c41a' }}>{record.receiver_name || '완료'}</span>
            </div>
          </Tooltip>
        );
      } else {
        return (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 40,
            }}
          >
            <Button
              size="small"
              style={{
                fontSize: 11,
                padding: '2px 10px',
                height: 24,
                color: '#faad14',
                borderColor: '#faad14',
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (handleConfirm) {
                  Modal.confirm({
                    title: '입고 완료 처리',
                    icon: <ExclamationCircleOutlined />,
                    content: '입고 완료 처리하시겠습니까?',
                    okText: '확인',
                    cancelText: '취소',
                    onOk: () => handleConfirm(record.id),
                  });
                }
              }}
            >
              대기중
            </Button>
          </div>
        );
      }
    },
  },
];
