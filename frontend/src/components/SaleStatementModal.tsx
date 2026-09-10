import React, { useRef, useState } from 'react';
import { Modal, Button, message, Input, Space } from 'antd';
import { PrinterOutlined, MailOutlined } from '@ant-design/icons';
import { Sale, SaleItem } from '../types/sale';
import { saleService } from '../services/sale';

interface SaleStatementModalProps {
  visible: boolean;
  sales: Sale[];
  onClose: () => void;
}

// 품목별 집계 행
interface ProductSummary {
  product_name: string;
  product_code: string;
  brand_name: string;
  sizeQuantities: { [size: string]: number };
  totalQuantity: number;
  totalAmount: number;
}

export const SaleStatementModal: React.FC<SaleStatementModalProps> = ({
  visible,
  sales,
  onClose,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [sending, setSending] = useState(false);

  // 거래명세서 메일 발송
  const handleSendEmail = async () => {
    const email = recipientEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      message.warning('올바른 수신자 이메일을 입력해주세요');
      return;
    }

    const saleIds = sales.map(s => s.id!).filter(Boolean);
    if (saleIds.length === 0) {
      message.warning('발송할 판매 건이 없습니다');
      return;
    }

    try {
      setSending(true);
      const result = await saleService.sendStatementEmail(saleIds, email);
      message.success(result.message || '거래명세서를 발송했습니다');
      setRecipientEmail('');
    } catch (error: any) {
      message.error(error.response?.data?.detail || '메일 발송에 실패했습니다');
    } finally {
      setSending(false);
    }
  };

  const handlePrintAndSave = () => {
    const printWindow = window.open('', '', 'width=900,height=600');
    if (printWindow && contentRef.current) {
      printWindow.document.write(contentRef.current.innerHTML);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 100);
      message.info('인쇄 또는 "다른 이름으로 저장"에서 PDF로 저장하세요');
    }
  };

  const getItemPrice = (item: SaleItem) => item.seller_sale_price_krw || 0;

  const calculateTotal = () => {
    return sales.reduce((sum, s) => {
      const itemTotal = s.items?.reduce((itemSum, item) => {
        return itemSum + getItemPrice(item) * item.quantity;
      }, 0) || 0;
      return sum + itemTotal;
    }, 0);
  };

  const calculateTotalQuantity = () => {
    return sales.reduce((sum, s) => {
      const qty = s.items?.reduce((itemSum, item) => itemSum + item.quantity, 0) || 0;
      return sum + qty;
    }, 0);
  };

  // 품목별 사이즈·수량 집계 (선택된 모든 판매 건 합산)
  const buildProductSummary = (): ProductSummary[] => {
    const map = new Map<string, ProductSummary>();

    sales.forEach(sale => {
      sale.items?.forEach(item => {
        const name = item.product_name || item.product?.product_name || '-';
        const code = item.product_code || item.product?.product_code || '-';
        const brand = item.brand_name || item.product?.brand_name || '';
        const key = `${code}__${name}`;

        if (!map.has(key)) {
          map.set(key, {
            product_name: name,
            product_code: code,
            brand_name: brand,
            sizeQuantities: {},
            totalQuantity: 0,
            totalAmount: 0,
          });
        }

        const summary = map.get(key)!;
        const size = item.size || '-';
        summary.sizeQuantities[size] = (summary.sizeQuantities[size] || 0) + item.quantity;
        summary.totalQuantity += item.quantity;
        summary.totalAmount += getItemPrice(item) * item.quantity;
      });
    });

    return Array.from(map.values());
  };

  // 사이즈 정렬 (숫자 사이즈 우선 오름차순, 문자 사이즈는 뒤에)
  const sortSizes = (sizes: string[]): string[] => {
    return sizes.sort((a, b) => {
      const aNum = parseFloat(a);
      const bNum = parseFloat(b);
      const aIsNum = !isNaN(aNum);
      const bIsNum = !isNaN(bNum);
      if (aIsNum && bIsNum) return aNum - bNum;
      if (aIsNum) return -1;
      if (bIsNum) return 1;
      return a.localeCompare(b);
    });
  };

  const productSummary = buildProductSummary();

  return (
    <Modal
      title="거래명세서 추출"
      open={visible}
      onCancel={onClose}
      width={900}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Space.Compact style={{ flex: 1, maxWidth: 420 }}>
            <Input
              placeholder="수신자 이메일 입력"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              onPressEnter={handleSendEmail}
              prefix={<MailOutlined style={{ color: '#999' }} />}
              disabled={sending}
            />
            <Button
              type="primary"
              icon={<MailOutlined />}
              onClick={handleSendEmail}
              loading={sending}
              style={{ backgroundColor: '#1d39c4', borderColor: '#1d39c4' }}
            >
              메일 발송
            </Button>
          </Space.Compact>
          <Space>
            <Button onClick={onClose}>닫기</Button>
            <Button
              type="primary"
              icon={<PrinterOutlined />}
              onClick={handlePrintAndSave}
              style={{ backgroundColor: '#1890ff' }}
            >
              인쇄 / PDF 저장
            </Button>
          </Space>
        </div>
      }
      bodyStyle={{ maxHeight: '70vh', overflow: 'auto' }}
    >
      <div
        ref={contentRef}
        style={{
          padding: '40px',
          backgroundColor: '#fff',
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
        }}
      >
        {/* 헤더 */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', margin: '0 0 10px 0' }}>
            거 래 명 세 서
          </h1>
          <div style={{ color: '#666', fontSize: '12px' }}>
            {new Date().toLocaleDateString('ko-KR', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            })}
          </div>
        </div>

        {/* 요약 정보 */}
        <table style={{ width: '100%', marginBottom: 30, borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ padding: '8px', borderBottom: '1px solid #ccc', width: '20%' }}>
                <strong>판매 건수</strong>
              </td>
              <td style={{ padding: '8px', borderBottom: '1px solid #ccc' }}>
                {sales.length}건
              </td>
              <td style={{ padding: '8px', borderBottom: '1px solid #ccc', width: '20%' }}>
                <strong>총 수량</strong>
              </td>
              <td style={{ padding: '8px', borderBottom: '1px solid #ccc' }}>
                {calculateTotalQuantity()}개
              </td>
            </tr>
            <tr>
              <td style={{ padding: '8px', borderBottom: '1px solid #ccc' }}>
                <strong>총 판매금액</strong>
              </td>
              <td style={{ padding: '8px', borderBottom: '1px solid #ccc' }}>
                ₩{calculateTotal().toLocaleString()}
              </td>
              <td style={{ padding: '8px', borderBottom: '1px solid #ccc' }}>
                <strong>작성일</strong>
              </td>
              <td style={{ padding: '8px', borderBottom: '1px solid #ccc' }}>
                {new Date().toLocaleDateString('ko-KR')}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 품목별 사이즈·수량 집계 */}
        <div style={{ marginBottom: 30 }}>
          <h3 style={{ fontSize: '16px', borderLeft: '4px solid #1890ff', paddingLeft: 8, marginBottom: 12 }}>
            품목별 사이즈·수량 집계
          </h3>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              border: '1px solid #ddd',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#f9f9f9' }}>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd', width: '30%' }}>
                  상품명
                </th>
                <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #ddd', width: '18%' }}>
                  품번
                </th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd', width: '30%' }}>
                  사이즈별 수량
                </th>
                <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #ddd', width: '10%' }}>
                  총 수량
                </th>
                <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #ddd', width: '12%' }}>
                  금액
                </th>
              </tr>
            </thead>
            <tbody>
              {productSummary.map((p, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px' }}>
                    {p.product_name}
                    {p.brand_name && (
                      <span style={{ color: '#999', fontSize: '12px', marginLeft: 6 }}>[{p.brand_name}]</span>
                    )}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center' }}>{p.product_code}</td>
                  <td style={{ padding: '10px' }}>
                    {sortSizes(Object.keys(p.sizeQuantities))
                      .map(size => `${size}(${p.sizeQuantities[size]})`)
                      .join(', ')}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold' }}>
                    {p.totalQuantity}개
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    ₩{p.totalAmount.toLocaleString()}
                  </td>
                </tr>
              ))}
              <tr style={{ backgroundColor: '#fafafa', fontWeight: 'bold' }}>
                <td colSpan={3} style={{ padding: '10px', textAlign: 'right' }}>
                  합계
                </td>
                <td style={{ padding: '10px', textAlign: 'center' }}>
                  {calculateTotalQuantity()}개
                </td>
                <td style={{ padding: '10px', textAlign: 'right' }}>
                  ₩{calculateTotal().toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 판매 건별 상세 */}
        {sales.map((sale) => (
          <div key={sale.id} style={{ marginBottom: 30 }}>
            {/* 판매 정보 헤더 */}
            <div
              style={{
                backgroundColor: '#f5f5f5',
                padding: '12px',
                marginBottom: 12,
                borderLeft: '4px solid #1890ff',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {sale.sale_number && (
                  <div>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>판매번호</div>
                    <div style={{ fontWeight: 'bold' }}>{sale.sale_number}</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>판매일</div>
                  <div style={{ fontWeight: 'bold' }}>
                    {new Date(sale.sale_date).toLocaleDateString('ko-KR')}
                  </div>
                </div>
                {sale.customer_name && (
                  <div>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>고객처</div>
                    <div style={{ fontWeight: 'bold' }}>{sale.customer_name}</div>
                  </div>
                )}
                {sale.seller_name && (
                  <div>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>판매자</div>
                    <div style={{ fontWeight: 'bold' }}>{sale.seller_name}</div>
                  </div>
                )}
              </div>
            </div>

            {/* 상품 항목 테이블 */}
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                marginBottom: 20,
                border: '1px solid #ddd',
              }}
            >
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9' }}>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', width: '28%' }}>
                    상품명
                  </th>
                  <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #ddd', width: '17%' }}>
                    품번
                  </th>
                  <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #ddd', width: '12%' }}>
                    사이즈
                  </th>
                  <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #ddd', width: '10%' }}>
                    수량
                  </th>
                  <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd', width: '18%' }}>
                    판매가
                  </th>
                  <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd', width: '15%' }}>
                    합계
                  </th>
                </tr>
              </thead>
              <tbody>
                {sale.items && sale.items.length > 0 ? (
                  <>
                    {sale.items.map((item, itemIndex) => (
                      <tr key={itemIndex} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '10px' }}>
                          {item.product_name || item.product?.product_name || '-'}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          {item.product_code || item.product?.product_code || '-'}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          {item.size || '-'}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          {item.quantity}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right' }}>
                          ₩{getItemPrice(item).toLocaleString()}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right' }}>
                          ₩{(getItemPrice(item) * item.quantity).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ backgroundColor: '#fafafa', fontWeight: 'bold' }}>
                      <td colSpan={3} style={{ padding: '10px', textAlign: 'right' }}>
                        소계
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        {sale.items.reduce((sum, item) => sum + item.quantity, 0)}
                      </td>
                      <td colSpan={2} style={{ padding: '10px', textAlign: 'right' }}>
                        ₩
                        {sale.items
                          .reduce((sum, item) => sum + getItemPrice(item) * item.quantity, 0)
                          .toLocaleString()}
                      </td>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                      상품 항목이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ))}

        {/* 최종 합계 */}
        <div
          style={{
            marginTop: 40,
            padding: '20px',
            backgroundColor: '#f0f0f0',
            borderRadius: '4px',
            textAlign: 'right',
          }}
        >
          <div style={{ marginBottom: 10 }}>
            <strong>총 판매 금액: ₩{calculateTotal().toLocaleString()}</strong>
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            본 명세서는 거래 확인용 문서입니다.
          </div>
        </div>
      </div>
    </Modal>
  );
};
