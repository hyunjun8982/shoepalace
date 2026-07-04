import React, { useState, useEffect, useRef } from 'react';
import { Input, Spin, message } from 'antd';
import { BarcodeOutlined } from '@ant-design/icons';
import { barcodeService, BarcodeSearchResult } from '../services/barcode';

interface BarcodeInputProps {
  onBarcodeFound: (result: BarcodeSearchResult) => void;
  onBarcodeNotFound?: (barcode: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const BarcodeInput: React.FC<BarcodeInputProps> = ({
  onBarcodeFound,
  onBarcodeNotFound,
  placeholder = '바코드 스캔 또는 검색...',
  disabled = false,
}) => {
  const [barcode, setBarcode] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<any>(null);
  const barcodeBufferRef = useRef('');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 전역 키보드 리스너 (바코드 스캐너 감지)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 입력 필드에 포커스되어 있으면 무시 (사용자 입력)
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        return;
      }

      // 수정자 키 무시
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
        return;
      }

      // Enter 키: 버퍼 제출
      if (e.key === 'Enter' && barcodeBufferRef.current) {
        e.preventDefault();
        handleBarcodeSearch(barcodeBufferRef.current.trim());
        barcodeBufferRef.current = '';
        return;
      }

      // 일반 문자 추가
      if (e.key.length === 1 && !disabled) {
        barcodeBufferRef.current += e.key;

        // 타임아웃 초기화 (마지막 입력으로부터 150ms 후 처리)
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        timeoutRef.current = setTimeout(() => {
          if (barcodeBufferRef.current) {
            handleBarcodeSearch(barcodeBufferRef.current.trim());
            barcodeBufferRef.current = '';
          }
        }, 150);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [disabled]);

  // 바코드 검색
  const handleBarcodeSearch = async (barcodeValue: string) => {
    if (!barcodeValue) return;

    setLoading(true);
    try {
      const result = await barcodeService.searchByBarcode(barcodeValue);
      message.success(`상품 검색됨: ${result.product_name}`);
      onBarcodeFound(result);
      setBarcode('');
    } catch (error: any) {
      if (error.message.includes('등록되지 않았습니다')) {
        // 미등록 바코드
        if (onBarcodeNotFound) {
          onBarcodeNotFound(barcodeValue);
        }
      } else {
        message.error(error.message || '바코드 검색에 실패했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  // 수동 입력 후 Enter 키
  const handleInputChange = (value: string) => {
    setBarcode(value);
  };

  const handleInputPressEnter = async () => {
    if (barcode) {
      await handleBarcodeSearch(barcode);
    }
  };

  // 복사-붙여넣기 지원
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text').trim();
    if (pastedText) {
      setBarcode(pastedText);
      setTimeout(() => handleBarcodeSearch(pastedText), 0);
    }
  };

  return (
    <Input
      ref={inputRef}
      prefix={<BarcodeOutlined />}
      placeholder={placeholder}
      value={barcode}
      onChange={(e) => handleInputChange(e.target.value)}
      onPressEnter={handleInputPressEnter}
      onPaste={handlePaste}
      disabled={disabled || loading}
      suffix={loading && <Spin size="small" />}
      allowClear
      size="large"
      style={{ fontSize: '16px' }}
    />
  );
};
