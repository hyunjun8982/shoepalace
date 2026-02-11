import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Button,
  message,
  Typography,
  Spin,
  Image,
  Row,
  Col,
  Tooltip,
  Input,
  InputNumber,
  Popconfirm,
  Modal,
  Checkbox,
  Pagination,
  Progress,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CloseOutlined,
  CheckSquareOutlined,
  MinusSquareOutlined,
  SearchOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import { poizonPriceService } from '../../services/poizonPrice';
import type { PoizonPriceWatchItem, PoizonPriceRefreshStatus, PriceDetail } from '../../types/poizonPrice';

const { Text } = Typography;
const { TextArea } = Input;

const SMALL_SIZES = new Set(['220', '225', '230', '235', '240', '245', '250']);
const LARGE_SIZES = new Set(['255', '260', '265', '270', '275', '280', '285', '290']);
const APPAREL_ORDER: Record<string, number> = { XS: 0, S: 1, M: 2, L: 3, XL: 4, XXL: 5, XXXL: 6, XXXXL: 7 };
const PAGE_SIZE = 30;

/** 배열에서 null이 아닌 값들의 평균 */
const avgOf = (arr: (number | null | undefined)[]): number | null => {
  const vals = arr.filter((v): v is number => v != null && v > 0);
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
};

const PoizonPriceComparisonPage: React.FC = () => {
  const [items, setItems] = useState<PoizonPriceWatchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<PoizonPriceRefreshStatus | null>(null);
  const [detailItem, setDetailItem] = useState<PoizonPriceWatchItem | null>(null);
  const [searchText, setSearchText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [filterRecommend, setFilterRecommend] = useState(false);
  const [recommendPct, setRecommendPct] = useState<number>(() => {
    const saved = localStorage.getItem('poizon_recommend_pct');
    return saved ? Number(saved) : 10;
  });

  /** 구매 권장 판정: 구매최종가가 평균가 대비 recommendPct% 이상 저렴한지 */
  const isRecommend = (sellPrice: number | null | undefined, avgPrice: number | null | undefined): boolean => {
    if (!sellPrice || !avgPrice) return false;
    return avgPrice * (1 - recommendPct / 100) >= sellPrice;
  };

  // 상품 추가 모달
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addInputValue, setAddInputValue] = useState('');

  // 선택 상태
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await poizonPriceService.getItems();
      setItems(res.items);
    } catch {
      if (!silent) message.error('데이터 조회 실패');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 가격 갱신 상태 폴링 + 실시간 데이터 갱신
  useEffect(() => {
    if (!refreshStatus?.is_refreshing) return;

    const interval = setInterval(async () => {
      try {
        const status = await poizonPriceService.getRefreshStatus();
        setRefreshStatus(status);
        fetchData(true);
        if (!status.is_refreshing) {
          clearInterval(interval);
          message.success(status.message);
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [refreshStatus?.is_refreshing, fetchData]);

  /** 줄 단위 파싱: "JM0112 59,976" 형식 (콤마 포함 숫자 지원) */
  const parseAddInput = (text: string): { article_number: string; sell_price?: number }[] => {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\s+/);
        const article_number = parts[0].toUpperCase();
        let sell_price: number | undefined;
        if (parts.length >= 2) {
          const priceStr = parts.slice(1).join('').replace(/,/g, '');
          const price = parseInt(priceStr, 10);
          if (!isNaN(price) && price > 0) {
            sell_price = price;
          }
        }
        return { article_number, sell_price };
      });
  };

  const handleAddSave = async () => {
    const parsed = parseAddInput(addInputValue);
    if (parsed.length === 0) {
      message.warning('상품코드를 입력해주세요');
      return;
    }

    setAdding(true);
    try {
      const result = await poizonPriceService.addItems(parsed);
      message.success(result.message);
      setAddInputValue('');
      setAddModalOpen(false);
      fetchData();
    } catch {
      message.error('추가 실패');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (articleNumber: string) => {
    try {
      await poizonPriceService.deleteItem(articleNumber);
      message.success('삭제 완료');
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        next.delete(articleNumber);
        return next;
      });
      fetchData();
    } catch {
      message.error('삭제 실패');
    }
  };

  const handleDeleteSelected = async () => {
    try {
      const targets = Array.from(selectedKeys);
      for (const code of targets) {
        await poizonPriceService.deleteItem(code);
      }
      message.success(`${targets.length}개 삭제 완료`);
      setSelectedKeys(new Set());
      fetchData();
    } catch {
      message.error('삭제 실패');
    }
  };

  const handleRefresh = async () => {
    try {
      const articleNumbers = Array.from(selectedKeys);
      await poizonPriceService.refreshPrices(articleNumbers);
      setRefreshStatus({ is_refreshing: true, current: 0, total: 0, message: '갱신 시작...' });
    } catch {
      message.error('가격 갱신 요청 실패');
    }
  };

  const handleSelectAll = () => {
    if (selectedKeys.size === items.length && items.length > 0) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(items.map((i) => i.article_number)));
    }
  };

  const toggleSelect = (articleNumber: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(articleNumber)) {
        next.delete(articleNumber);
      } else {
        next.add(articleNumber);
      }
      return next;
    });
  };

  const isApparel = (item: PoizonPriceWatchItem) => {
    return item.avg_price_apparel !== null && item.avg_price_small === null && item.avg_price_large === null;
  };

  /** 카드용: 전체 사이즈 평균가/최저입찰가 계산 */
  const getOverallPrices = (item: PoizonPriceWatchItem) => {
    if (item.price_details && item.price_details.length > 0) {
      return {
        avgPrice: avgOf(item.price_details.map((d) => d.average_price)),
        leakPrice: avgOf(item.price_details.map((d) => d.leak_price)),
      };
    }
    const prices = [item.avg_price_small, item.avg_price_large, item.avg_price_apparel].filter((v): v is number => v != null);
    return {
      avgPrice: prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null,
      leakPrice: null,
    };
  };

  const renderAddModal = () => {
    const parsed = parseAddInput(addInputValue);

    return (
      <Modal
        title="상품 정보 추가"
        open={addModalOpen}
        onCancel={() => { setAddModalOpen(false); setAddInputValue(''); }}
        width={700}
        footer={[
          <Button key="cancel" onClick={() => { setAddModalOpen(false); setAddInputValue(''); }}>
            취소
          </Button>,
          <Button
            key="save"
            type="primary"
            loading={adding}
            disabled={parsed.length === 0}
            onClick={handleAddSave}
          >
            저장 ({parsed.length}개)
          </Button>,
        ]}
      >
        <div style={{ display: 'flex', gap: 16, minHeight: 300 }}>
          {/* 좌측: 입력 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Text type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
              상품코드와 구매최종가를 입력하세요 (줄 단위)
            </Text>
            <TextArea
              placeholder={"JM0112 59,976\nJE1346 59,976\nIT3239 119,574\nIQ2654"}
              value={addInputValue}
              onChange={(e) => setAddInputValue(e.target.value)}
              rows={14}
              style={{ fontFamily: 'monospace', fontSize: 13, flex: 1 }}
            />
          </div>

          {/* 우측: 미리보기 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Text type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
              입력 결과 ({parsed.length}개)
            </Text>
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 6, overflow: 'auto', flex: 1, maxHeight: 370 }}>
              {/* 테이블 헤더 */}
              <div style={{
                display: 'flex',
                padding: '6px 12px',
                background: '#fafafa',
                borderBottom: '1px solid #f0f0f0',
                fontWeight: 600,
                fontSize: 12,
                position: 'sticky',
                top: 0,
              }}>
                <div style={{ width: 30 }}>No</div>
                <div style={{ flex: 1 }}>상품코드</div>
                <div style={{ width: 100, textAlign: 'right' }}>구매최종가</div>
              </div>
              {parsed.map((item, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  padding: '4px 12px',
                  borderBottom: '1px solid #f5f5f5',
                  fontSize: 12,
                }}>
                  <div style={{ width: 30, color: '#999' }}>{idx + 1}</div>
                  <div style={{ flex: 1, fontWeight: 500 }}>{item.article_number}</div>
                  <div style={{ width: 100, textAlign: 'right' }}>
                    {item.sell_price ? `${item.sell_price.toLocaleString()}원` : '-'}
                  </div>
                </div>
              ))}
              {parsed.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: '#bfbfbf', fontSize: 12 }}>
                  좌측에 데이터를 입력하세요
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>
    );
  };

  const renderPriceDetailModal = () => {
    if (!detailItem || !detailItem.price_details) return null;

    const details = detailItem.price_details;
    const apparelMode = isApparel(detailItem);

    const sorted = [...details].sort((a, b) => {
      if (apparelMode) {
        return (APPAREL_ORDER[a.size_kr] ?? 99) - (APPAREL_ORDER[b.size_kr] ?? 99);
      }
      return parseInt(a.size_kr) - parseInt(b.size_kr);
    });

    // 그룹별 평균 계산
    const calcGroupAvg = (filter: (d: PriceDetail) => boolean) => {
      const group = sorted.filter(filter);
      return {
        avgPrice: avgOf(group.map((d) => d.average_price)),
        leakPrice: avgOf(group.map((d) => d.leak_price)),
      };
    };

    const smallAvg = !apparelMode ? calcGroupAvg((d) => SMALL_SIZES.has(d.size_kr)) : null;
    const largeAvg = !apparelMode ? calcGroupAvg((d) => LARGE_SIZES.has(d.size_kr)) : null;
    const allAvg = calcGroupAvg(() => true);

    return (
      <Modal
        title={
          <div>
            <Text strong>{detailItem.article_number}</Text>
            <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>사이즈별 가격</Text>
          </div>
        }
        open={!!detailItem}
        onCancel={() => setDetailItem(null)}
        footer={null}
        width={600}
      >
        {/* 상품 이미지 + 상품명 */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
          {detailItem.logo_url && (
            <Image
              src={detailItem.logo_url}
              alt="상품 이미지"
              width={80}
              height={80}
              style={{ borderRadius: 6, objectFit: 'contain', background: '#fafafa' }}
              fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23f0f0f0'/%3E%3C/svg%3E"
            />
          )}
          {detailItem.title && (
            <Text type="secondary" style={{ fontSize: 12, flex: 1 }}>{detailItem.title}</Text>
          )}
        </div>

        <div style={{ maxHeight: 400, overflow: 'auto', fontSize: 12 }}>
          {/* 헤더 */}
          <div style={{
            display: 'flex',
            padding: '6px 8px',
            background: '#fafafa',
            borderBottom: '1px solid #f0f0f0',
            fontWeight: 600,
            alignItems: 'center',
          }}>
            <div style={{ width: apparelMode ? 55 : 105, textAlign: 'center' }}>사이즈</div>
            <div style={{ flex: 1, textAlign: 'center' }}>구매최종가</div>
            <div style={{ flex: 1, textAlign: 'center' }}>평균가</div>
            <div style={{ flex: 1, textAlign: 'center' }}>최저입찰</div>
            <div style={{ width: 80, textAlign: 'center' }}>구매권장</div>
          </div>
          {/* 행 */}
          {sorted.map((d, idx) => {
            const recommend = isRecommend(detailItem?.sell_price, d.average_price);
            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  padding: '4px 8px',
                  borderBottom: '1px solid #f5f5f5',
                  alignItems: 'center',
                  background: recommend ? 'rgba(255, 77, 79, 0.06)' : undefined,
                }}
              >
                <div style={{ width: apparelMode ? 55 : 105, fontWeight: 500 }}>
                  <span>{d.size_kr}</span>
                  {!apparelMode && d.size_us && (
                    <span style={{ color: '#999', marginLeft: 4 }}>(US {d.size_us})</span>
                  )}
                </div>
                <div style={{ flex: 1, textAlign: 'center', color: detailItem?.sell_price ? '#333' : '#ccc' }}>
                  {detailItem?.sell_price ? `${detailItem.sell_price.toLocaleString()}원` : '-'}
                </div>
                <div style={{ flex: 1, textAlign: 'center', fontWeight: 600, color: d.average_price ? '#006400' : '#ccc' }}>
                  {d.average_price ? `${d.average_price.toLocaleString()}원` : '-'}
                </div>
                <div style={{ flex: 1, textAlign: 'center', color: d.leak_price ? '#8b4513' : '#ccc' }}>
                  {d.leak_price ? `${d.leak_price.toLocaleString()}원` : '-'}
                </div>
                <div style={{ width: 80, textAlign: 'center' }}>
                  {recommend ? <span style={{ color: '#ff4d4f', fontWeight: 700 }}>✓</span> : ''}
                </div>
              </div>
            );
          })}
        </div>

        {/* 요약 — 위 테이블과 열 정렬 맞춤 */}
        <div style={{ marginTop: 12, fontSize: 12 }}>
          {/* 요약 헤더 */}
          <div style={{
            display: 'flex',
            padding: '6px 8px',
            background: '#fafafa',
            borderBottom: '1px solid #e8e8e8',
            fontWeight: 600,
            alignItems: 'center',
          }}>
            <div style={{ width: apparelMode ? 55 : 105, minWidth: 75 }}></div>
            <div style={{ flex: 1, textAlign: 'center' }}>구매최종가</div>
            <div style={{ flex: 1, textAlign: 'center' }}>평균가 평균</div>
            <div style={{ flex: 1, textAlign: 'center' }}>최저입찰 평균</div>
            <div style={{ width: 80 }}></div>
          </div>
          {!apparelMode && smallAvg && (smallAvg.avgPrice || smallAvg.leakPrice) && (
            <div style={{ display: 'flex', padding: '4px 8px', alignItems: 'center' }}>
              <div style={{ width: 105, fontWeight: 500 }}>220-250</div>
              <div style={{ flex: 1, textAlign: 'center', color: detailItem?.sell_price ? '#333' : '#ccc' }}>
                {detailItem?.sell_price ? `${detailItem.sell_price.toLocaleString()}원` : '-'}
              </div>
              <div style={{ flex: 1, textAlign: 'center', fontWeight: 600, color: '#006400' }}>
                {smallAvg.avgPrice ? `${smallAvg.avgPrice.toLocaleString()}원` : '-'}
              </div>
              <div style={{ flex: 1, textAlign: 'center', fontWeight: 600, color: '#8b4513' }}>
                {smallAvg.leakPrice ? `${smallAvg.leakPrice.toLocaleString()}원` : '-'}
              </div>
              <div style={{ width: 80, textAlign: 'center' }}>
                {isRecommend(detailItem?.sell_price, smallAvg.avgPrice)
                  ? <span style={{ color: '#ff4d4f', fontWeight: 700 }}>✓</span> : ''}
              </div>
            </div>
          )}
          {!apparelMode && largeAvg && (largeAvg.avgPrice || largeAvg.leakPrice) && (
            <div style={{ display: 'flex', padding: '4px 8px', alignItems: 'center' }}>
              <div style={{ width: 105, fontWeight: 500 }}>255-290</div>
              <div style={{ flex: 1, textAlign: 'center', color: detailItem?.sell_price ? '#333' : '#ccc' }}>
                {detailItem?.sell_price ? `${detailItem.sell_price.toLocaleString()}원` : '-'}
              </div>
              <div style={{ flex: 1, textAlign: 'center', fontWeight: 600, color: '#006400' }}>
                {largeAvg.avgPrice ? `${largeAvg.avgPrice.toLocaleString()}원` : '-'}
              </div>
              <div style={{ flex: 1, textAlign: 'center', fontWeight: 600, color: '#8b4513' }}>
                {largeAvg.leakPrice ? `${largeAvg.leakPrice.toLocaleString()}원` : '-'}
              </div>
              <div style={{ width: 80, textAlign: 'center' }}>
                {isRecommend(detailItem?.sell_price, largeAvg.avgPrice)
                  ? <span style={{ color: '#ff4d4f', fontWeight: 700 }}>✓</span> : ''}
              </div>
            </div>
          )}
          {(allAvg.avgPrice || allAvg.leakPrice) && (
            <div style={{ display: 'flex', padding: '4px 8px', borderTop: apparelMode ? 'none' : '1px solid #e8e8e8', marginTop: apparelMode ? 0 : 4, paddingTop: apparelMode ? 0 : 4, alignItems: 'center' }}>
              <div style={{ width: apparelMode ? 55 : 105, fontWeight: 500, whiteSpace: 'nowrap', minWidth: 75 }}>전체 사이즈</div>
              <div style={{ flex: 1, textAlign: 'center', color: detailItem?.sell_price ? '#333' : '#ccc' }}>
                {detailItem?.sell_price ? `${detailItem.sell_price.toLocaleString()}원` : '-'}
              </div>
              <div style={{ flex: 1, textAlign: 'center', fontWeight: 600, color: '#006400' }}>
                {allAvg.avgPrice ? `${allAvg.avgPrice.toLocaleString()}원` : '-'}
              </div>
              <div style={{ flex: 1, textAlign: 'center', fontWeight: 600, color: '#8b4513' }}>
                {allAvg.leakPrice ? `${allAvg.leakPrice.toLocaleString()}원` : '-'}
              </div>
              <div style={{ width: 80, textAlign: 'center' }}>
                {isRecommend(detailItem?.sell_price, allAvg.avgPrice)
                  ? <span style={{ color: '#ff4d4f', fontWeight: 700 }}>✓</span> : ''}
              </div>
            </div>
          )}
        </div>
      </Modal>
    );
  };

  const filteredItems = items.filter((item) => {
    // 검색 필터
    if (searchText.trim()) {
      const keyword = searchText.trim().toUpperCase();
      if (!item.article_number.toUpperCase().includes(keyword) &&
          !(item.title && item.title.toUpperCase().includes(keyword))) {
        return false;
      }
    }
    // 구매 권장 필터
    if (filterRecommend) {
      if (!item.sell_price || !item.price_details) return false;
      const hasRecommend = item.price_details.some(
        (d) => isRecommend(item.sell_price, d.average_price)
      );
      if (!hasRecommend) return false;
    }
    return true;
  });

  const paginatedItems = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // 검색 변경 시 1페이지로 리셋
  useEffect(() => { setCurrentPage(1); }, [searchText]);

  const allSelected = selectedKeys.size === items.length && items.length > 0;

  return (
    <div style={{ padding: 16, background: '#f0f2f5', minHeight: '100%' }}>
      {/* 툴바 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
          placeholder="상품코드 / 상품명 검색"
          allowClear
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 200 }}
          size="middle"
        />
        <Button
          icon={<FilterOutlined />}
          type={filterRecommend ? 'primary' : 'default'}
          ghost={filterRecommend}
          onClick={() => { setFilterRecommend(!filterRecommend); setCurrentPage(1); }}
        >
          구매 권장
        </Button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          {selectedKeys.size > 0 && (
            <Text strong style={{ fontSize: 13 }}>
              {selectedKeys.size}건 선택
            </Text>
          )}
        </div>
        <Tooltip title="포이즌 평균가 대비 구매최종가 비율" placement="bottom">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'help' }}>
            <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>권장 기준</Text>
            <InputNumber
              min={0}
              max={50}
              value={recommendPct}
              onChange={(v) => {
                const val = v ?? 10;
                setRecommendPct(val);
                localStorage.setItem('poizon_recommend_pct', String(val));
              }}
              size="small"
              style={{ width: 58 }}
              formatter={(v) => `${v}%`}
              parser={(v) => Number((v || '').replace('%', ''))}
            />
          </div>
        </Tooltip>
        <Button icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)} style={{ background: '#001529', borderColor: '#001529', color: '#fff' }}>
          상품 정보 추가
        </Button>
        <Button
          icon={<ReloadOutlined />}
          onClick={handleRefresh}
          loading={refreshStatus?.is_refreshing}
          disabled={selectedKeys.size === 0}
        >
          가격 갱신
        </Button>
        <Button
          icon={allSelected ? <MinusSquareOutlined /> : <CheckSquareOutlined />}
          onClick={handleSelectAll}
          disabled={items.length === 0}
        >
          {allSelected ? '선택 해제' : '전체 선택'}
        </Button>
        <Popconfirm
          title={`선택한 ${selectedKeys.size}개 상품을 삭제하시겠습니까?`}
          onConfirm={handleDeleteSelected}
          okText="삭제"
          cancelText="취소"
          okButtonProps={{ danger: true }}
        >
          <Button danger icon={<DeleteOutlined />} disabled={selectedKeys.size === 0}>
            삭제
          </Button>
        </Popconfirm>
      </div>

      {/* 가격 갱신 진행 배너 */}
      {refreshStatus?.is_refreshing && (
        <div style={{
          marginBottom: 12,
          padding: '12px 16px',
          background: '#e6f4ff',
          border: '1px solid #91caff',
          borderRadius: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Spin size="small" />
            <Text strong style={{ fontSize: 13 }}>{refreshStatus.message}</Text>
          </div>
          <Progress
            percent={refreshStatus.total > 0 ? Math.round((refreshStatus.current / refreshStatus.total) * 100) : 0}
            size="small"
            strokeColor="#1677ff"
          />
        </div>
      )}

      {/* 카드 그리드 */}
      <Spin spinning={loading}>
        <Row gutter={[8, 8]}>
          {paginatedItems.map((item) => {
            const selected = selectedKeys.has(item.article_number);
            return (
              <Col
                key={item.article_number}
                style={{ width: '10%', minWidth: 140 }}
              >
                <Card
                  hoverable
                  onClick={() => item.found && item.price_details && item.price_details.length > 0 && setDetailItem(item)}
                  style={{
                    minHeight: 260,
                    background: item.found ? '#fff' : '#fafafa',
                    position: 'relative',
                    cursor: item.found && item.price_details && item.price_details.length > 0 ? 'pointer' : 'default',
                    boxShadow: selected ? '0 0 0 2px #1677ff' : undefined,
                  }}
                  bodyStyle={{ padding: 10, display: 'flex', flexDirection: 'column' }}
                >
                  {/* 체크박스 */}
                  <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 4, left: 4, zIndex: 1 }}>
                    <Checkbox
                      checked={selected}
                      onChange={() => toggleSelect(item.article_number)}
                    />
                  </div>

                  {/* 삭제 버튼 */}
                  <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 4, right: 4, zIndex: 1 }}>
                    <Popconfirm
                      title={`${item.article_number} 삭제?`}
                      onConfirm={() => handleDelete(item.article_number)}
                      okText="삭제"
                      cancelText="취소"
                      okButtonProps={{ danger: true }}
                    >
                      <Button
                        type="text"
                        size="small"
                        icon={<CloseOutlined />}
                        style={{
                          color: '#bfbfbf',
                          fontSize: 10,
                          width: 20,
                          height: 20,
                          minWidth: 20,
                        }}
                      />
                    </Popconfirm>
                  </div>

                  {/* 상품 이미지 */}
                  <div onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center', marginBottom: 6, height: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {item.found && item.logo_url ? (
                      <Image
                        src={item.logo_url}
                        alt="상품 이미지"
                        width="auto"
                        height={65}
                        style={{ borderRadius: 4, objectFit: 'contain', maxWidth: '100%' }}
                        fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='65' height='65'%3E%3Crect width='65' height='65' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='10' fill='%23bfbfbf'%3E이미지%3C/text%3E%3C/svg%3E"
                      />
                    ) : (
                      <div style={{ width: 65, height: 65, background: '#f0f0f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Text type="secondary" style={{ fontSize: 10 }}>?</Text>
                      </div>
                    )}
                  </div>

                  {/* 상품코드 */}
                  <div style={{ textAlign: 'center', marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: 700, color: '#003d82' }}>
                      {item.article_number}
                    </Text>
                  </div>

                  {/* 상품명 */}
                  <Tooltip title={item.title || '미등록 상품'} placement="top">
                    <div
                      style={{
                        marginBottom: 6,
                        fontSize: 10,
                        fontWeight: 500,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical' as any,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        lineHeight: 1.3,
                        minHeight: 26,
                        cursor: 'help',
                        color: item.found ? 'inherit' : '#bfbfbf',
                      }}
                    >
                      {item.title || '미등록 상품'}
                    </div>
                  </Tooltip>

                  {/* 구분선 */}
                  <div style={{ borderTop: '1px solid #f0f0f0', marginBottom: 4 }} />

                  {/* 가격 정보 3행 */}
                  {item.found ? (() => {
                    const { avgPrice, leakPrice } = getOverallPrices(item);
                    const avgColor = item.sell_price && avgPrice && avgPrice > item.sell_price ? '#1677ff' : '#333';
                    const leakColor = item.sell_price && leakPrice && leakPrice > item.sell_price ? '#1677ff' : '#333';
                    return (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 1 }}>
                          <Text type="secondary" style={{ fontSize: 9 }}>구매최종가</Text>
                          <Text strong style={{ fontSize: 9, color: '#333' }}>
                            {item.sell_price ? `${item.sell_price.toLocaleString()}원` : '-'}
                          </Text>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 1 }}>
                          <Text type="secondary" style={{ fontSize: 9 }}>평균가</Text>
                          <Text strong style={{ fontSize: 9, color: avgColor }}>
                            {avgPrice ? `${avgPrice.toLocaleString()}원` : '-'}
                          </Text>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text type="secondary" style={{ fontSize: 9 }}>최저입찰</Text>
                          <Text strong style={{ fontSize: 9, color: leakColor }}>
                            {leakPrice ? `${leakPrice.toLocaleString()}원` : '-'}
                          </Text>
                        </div>
                      </div>
                    );
                  })() : (
                    <div>
                      {item.sell_price && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 1 }}>
                          <Text type="secondary" style={{ fontSize: 9 }}>구매최종가</Text>
                          <Text strong style={{ fontSize: 9, color: '#333' }}>
                            {item.sell_price.toLocaleString()}원
                          </Text>
                        </div>
                      )}
                      <div style={{ textAlign: 'center', padding: item.sell_price ? '4px 0' : '8px 0' }}>
                        <Text type="secondary" style={{ fontSize: 10 }}>POIZON 미등록</Text>
                      </div>
                    </div>
                  )}

                  {/* 구매 권장 사이즈 */}
                  {item.sell_price && item.price_details && (() => {
                    const recommended = item.price_details.filter(
                      (d) => isRecommend(item.sell_price, d.average_price)
                    );
                    if (recommended.length === 0) return null;
                    const sizeLabels = recommended.map((d) => d.size_kr).join(', ');
                    return (
                      <div style={{
                        marginTop: 4,
                        padding: '3px 6px',
                        background: 'rgba(255, 77, 79, 0.08)',
                        borderRadius: 4,
                        fontSize: 10,
                        color: '#ff4d4f',
                        lineHeight: 1.4,
                      }}>
                        <span style={{ fontWeight: 600 }}>구매 권장 </span>{sizeLabels}
                      </div>
                    );
                  })()}
                </Card>
              </Col>
            );
          })}
        </Row>

        {filteredItems.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Text type="secondary">
              {items.length === 0 ? '상품코드를 추가해주세요' : '검색 결과가 없습니다'}
            </Text>
          </div>
        )}

        {filteredItems.length > PAGE_SIZE && (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Pagination
              current={currentPage}
              total={filteredItems.length}
              pageSize={PAGE_SIZE}
              onChange={(page) => setCurrentPage(page)}
              showTotal={(total) => `총 ${total}개`}
              size="small"
              showSizeChanger={false}
            />
          </div>
        )}
      </Spin>

      {/* 상품 정보 추가 모달 */}
      {renderAddModal()}

      {/* 사이즈별 가격 상세 모달 */}
      {renderPriceDetailModal()}
    </div>
  );
};

export default PoizonPriceComparisonPage;
