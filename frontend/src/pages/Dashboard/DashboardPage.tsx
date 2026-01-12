import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Row,
  Col,
  Card,
  Table,
  Space,
  Tag,
  Tabs,
  Spin,
  App,
  Empty,
  DatePicker,
} from 'antd';
import { getBrandIconUrl } from '../../utils/imageUtils';
import { getFileUrl } from '../../utils/urlUtils';
import { formatCurrencyWithKorean, roundToWon } from '../../utils/currencyUtils';
import {
  ShoppingCartOutlined,
  DollarOutlined,
  RiseOutlined,
  FallOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  PercentageOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { purchaseService } from '../../services/purchase';
import { saleService } from '../../services/sale';
import { inventoryService } from '../../services/inventory';
import TrendingProductWidget from '../../components/Dashboard/TrendingProductWidget';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface DashboardStats {
  today_purchase_amount: number;
  today_purchase_count: number;
  today_sale_amount: number;
  today_sale_count: number;
  today_profit: number;
  today_profit_rate: number;
  week_purchase_amount: number;
  week_purchase_count: number;
  week_sale_amount: number;
  week_sale_count: number;
  week_profit: number;
  week_profit_rate: number;
  month_purchase_amount: number;
  month_purchase_count: number;
  month_sale_amount: number;
  month_sale_count: number;
  month_profit: number;
  month_profit_rate: number;
  low_stock_count: number;
  out_of_stock_count: number;
  pending_purchase_count: number;
  pending_sale_count: number;
  average_margin_rate: number;
}

interface BrandSalesStats {
  brand_id: string;
  brand_name: string;
  brand_icon_url?: string;
  sale_count: number;
  sale_amount: number;
}

interface RecentActivity {
  id: string;
  type: 'purchase' | 'sale';
  transaction_no: string;
  date: string;
  updated_at?: string;
  product_name: string;
  product_code?: string;
  product_image_url?: string;
  amount: number;
  user_name: string;
  status: string;
}

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [brandStats, setBrandStats] = useState<BrandSalesStats[]>([]);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  const [chartData, setChartData] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(29, 'day'),
    dayjs()
  ]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      await fetchStatsFromExistingAPIs();
    } catch (error) {
      message.error('대시보드 데이터를 불러오는데 실패했습니다.');
      console.error('Dashboard fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStatsFromExistingAPIs = async () => {
    try {
      const today = dayjs().startOf('day');
      const weekStart = dayjs().startOf('week');
      const monthStart = dayjs().startOf('month');

      // API 호출을 개별적으로 처리하여 하나가 실패해도 다른 것은 로드되도록 함
      let purchases: any[] = [];
      let sales: any[] = [];
      let inventory: any[] = [];

      try {
        const purchasesResponse = await purchaseService.getPurchases({ limit: 100 }); // 1000 -> 100으로 감소
        purchases = purchasesResponse.items;
      } catch (error) {
        console.error('Failed to fetch purchases:', error);
      }

      try {
        const salesResponse = await saleService.getSales({ limit: 100 }); // 1000 -> 100
        sales = salesResponse.items;
      } catch (error) {
        console.error('Failed to fetch sales:', error);
      }

      const todayPurchases = purchases.filter(p => dayjs(p.purchase_date).isSame(today, 'day'));
      const todaySales = sales.filter(s => dayjs(s.sale_date).isSame(today, 'day'));

      const todayPurchaseAmount = roundToWon(todayPurchases.reduce((sum, p) => sum + Number(p.total_amount || 0), 0));
      const todayPurchaseCount = todayPurchases.reduce((sum, p) => sum + (p.items?.reduce((s: number, i: any) => s + (i.quantity || 0), 0) || 0), 0);
      const todaySaleAmount = roundToWon(todaySales.reduce((sum, s) => sum + Number(s.total_seller_amount || 0), 0));
      const todaySaleCount = todaySales.length;

      // 판매된 상품의 실제 구매가 계산
      const todaySaleCost = todaySales.reduce((sum, sale) => {
        const saleCost = (sale.items || []).reduce((itemSum: number, item: any) => {
          const productId = item.product_id;
          const quantity = item.quantity || 1;

          // 해당 상품의 모든 구매 내역 찾기
          const productPurchases = purchases.filter(p =>
            p.items?.some((pi: any) => pi.product_id === productId)
          );

          if (productPurchases.length === 0) return itemSum;

          // 해당 상품의 평균 구매가 계산
          let totalPurchasePrice = 0;
          let totalPurchaseQty = 0;

          productPurchases.forEach(p => {
            p.items?.forEach((pi: any) => {
              if (pi.product_id === productId) {
                totalPurchasePrice += Number(pi.purchase_price || 0) * (pi.quantity || 0);
                totalPurchaseQty += pi.quantity || 0;
              }
            });
          });

          const avgPurchasePrice = totalPurchaseQty > 0 ? totalPurchasePrice / totalPurchaseQty : 0;
          return itemSum + (avgPurchasePrice * quantity);
        }, 0);

        return sum + saleCost;
      }, 0);

      const todayProfit = roundToWon(todaySaleAmount - todaySaleCost);
      const todayProfitRate = todaySaleAmount > 0 ? (todayProfit / todaySaleAmount * 100) : 0;

      const weekPurchases = purchases.filter(p => dayjs(p.purchase_date).isAfter(weekStart) || dayjs(p.purchase_date).isSame(weekStart, 'day'));
      const weekSales = sales.filter(s => dayjs(s.sale_date).isAfter(weekStart) || dayjs(s.sale_date).isSame(weekStart, 'day'));

      const weekPurchaseAmount = roundToWon(weekPurchases.reduce((sum, p) => sum + Number(p.total_amount || 0), 0));
      const weekPurchaseCount = weekPurchases.reduce((sum, p) => sum + (p.items?.reduce((s: number, i: any) => s + (i.quantity || 0), 0) || 0), 0);
      const weekSaleAmount = roundToWon(weekSales.reduce((sum, s) => sum + Number(s.total_seller_amount || 0), 0));
      const weekSaleCount = weekSales.length;

      // 이번주 판매된 상품의 실제 구매가 계산
      const weekSaleCost = weekSales.reduce((sum, sale) => {
        const saleCost = (sale.items || []).reduce((itemSum: number, item: any) => {
          const productId = item.product_id;
          const quantity = item.quantity || 1;

          const productPurchases = purchases.filter(p =>
            p.items?.some((pi: any) => pi.product_id === productId)
          );

          if (productPurchases.length === 0) return itemSum;

          let totalPurchasePrice = 0;
          let totalPurchaseQty = 0;

          productPurchases.forEach(p => {
            p.items?.forEach((pi: any) => {
              if (pi.product_id === productId) {
                totalPurchasePrice += Number(pi.purchase_price || 0) * (pi.quantity || 0);
                totalPurchaseQty += pi.quantity || 0;
              }
            });
          });

          const avgPurchasePrice = totalPurchaseQty > 0 ? totalPurchasePrice / totalPurchaseQty : 0;
          return itemSum + (avgPurchasePrice * quantity);
        }, 0);

        return sum + saleCost;
      }, 0);

      const weekProfit = roundToWon(weekSaleAmount - weekSaleCost);
      const weekProfitRate = weekSaleAmount > 0 ? (weekProfit / weekSaleAmount * 100) : 0;

      const monthPurchases = purchases.filter(p => dayjs(p.purchase_date).isAfter(monthStart) || dayjs(p.purchase_date).isSame(monthStart, 'day'));
      const monthSales = sales.filter(s => dayjs(s.sale_date).isAfter(monthStart) || dayjs(s.sale_date).isSame(monthStart, 'day'));

      const monthPurchaseAmount = roundToWon(monthPurchases.reduce((sum, p) => sum + Number(p.total_amount || 0), 0));
      const monthPurchaseCount = monthPurchases.reduce((sum, p) => sum + (p.items?.reduce((s: number, i: any) => s + (i.quantity || 0), 0) || 0), 0);
      const monthSaleAmount = roundToWon(monthSales.reduce((sum, s) => sum + Number(s.total_seller_amount || 0), 0));
      const monthSaleCount = monthSales.length;

      // 이번달 판매된 상품의 실제 구매가 계산
      const monthSaleCost = monthSales.reduce((sum, sale) => {
        const saleCost = (sale.items || []).reduce((itemSum: number, item: any) => {
          const productId = item.product_id;
          const quantity = item.quantity || 1;

          const productPurchases = purchases.filter(p =>
            p.items?.some((pi: any) => pi.product_id === productId)
          );

          if (productPurchases.length === 0) return itemSum;

          let totalPurchasePrice = 0;
          let totalPurchaseQty = 0;

          productPurchases.forEach(p => {
            p.items?.forEach((pi: any) => {
              if (pi.product_id === productId) {
                totalPurchasePrice += Number(pi.purchase_price || 0) * (pi.quantity || 0);
                totalPurchaseQty += pi.quantity || 0;
              }
            });
          });

          const avgPurchasePrice = totalPurchaseQty > 0 ? totalPurchasePrice / totalPurchaseQty : 0;
          return itemSum + (avgPurchasePrice * quantity);
        }, 0);

        return sum + saleCost;
      }, 0);

      const monthProfit = roundToWon(monthSaleAmount - monthSaleCost);
      const monthProfitRate = monthSaleAmount > 0 ? (monthProfit / monthSaleAmount * 100) : 0;

      // 재고 정보는 대시보드에서 사용하지 않으므로 제거
      const lowStockCount = 0;
      const outOfStockCount = 0;

      const pendingPurchaseCount = purchases.filter(p => p.status === 'pending').length;
      const pendingSaleCount = sales.filter(s => s.status === 'pending').length;

      const salesWithMargin = sales.filter(s => s.total_seller_margin && s.total_seller_amount);
      const averageMarginRate = salesWithMargin.length > 0
        ? salesWithMargin.reduce((sum, s) => sum + (Number(s.total_seller_margin || 0) / Number(s.total_seller_amount || 1) * 100), 0) / salesWithMargin.length
        : 0;

      setStats({
        today_purchase_amount: todayPurchaseAmount,
        today_purchase_count: todayPurchaseCount,
        today_sale_amount: todaySaleAmount,
        today_sale_count: todaySaleCount,
        today_profit: todayProfit,
        today_profit_rate: todayProfitRate,
        week_purchase_amount: weekPurchaseAmount,
        week_purchase_count: weekPurchaseCount,
        week_sale_amount: weekSaleAmount,
        week_sale_count: weekSaleCount,
        week_profit: weekProfit,
        week_profit_rate: weekProfitRate,
        month_purchase_amount: monthPurchaseAmount,
        month_purchase_count: monthPurchaseCount,
        month_sale_amount: monthSaleAmount,
        month_sale_count: monthSaleCount,
        month_profit: monthProfit,
        month_profit_rate: monthProfitRate,
        low_stock_count: lowStockCount,
        out_of_stock_count: outOfStockCount,
        pending_purchase_count: pendingPurchaseCount,
        pending_sale_count: pendingSaleCount,
        average_margin_rate: averageMarginRate,
      });

      const brandSalesMap = new Map<string, { count: number; amount: number; iconUrl?: string }>();
      monthSales.forEach(sale => {
        sale.items?.forEach((item: any) => {
          const brandName = item.product?.brand_name;
          const iconUrl = item.product?.brand_icon_url;
          if (brandName) {
            const current = brandSalesMap.get(brandName) || { count: 0, amount: 0, iconUrl };
            current.count += 1;
            current.amount += Number(item.seller_sale_price_krw || 0);
            current.iconUrl = current.iconUrl || iconUrl;
            brandSalesMap.set(brandName, current);
          }
        });
      });

      const brandStatsArray: BrandSalesStats[] = Array.from(brandSalesMap.entries())
        .map(([name, data]) => ({
          brand_id: name,
          brand_name: name,
          brand_icon_url: data.iconUrl,
          sale_count: data.count,
          sale_amount: data.amount,
        }))
        .sort((a, b) => b.sale_amount - a.sale_amount)
        .slice(0, 5);

      setBrandStats(brandStatsArray);

      // 1주일 이내 데이터 필터링
      const oneWeekAgo = dayjs().subtract(7, 'day');
      const recentPurchasesData = purchases.filter(p =>
        dayjs(p.updated_at || p.created_at).isAfter(oneWeekAgo)
      );
      const recentSalesData = sales.filter(s =>
        dayjs(s.updated_at || s.created_at).isAfter(oneWeekAgo)
      );

      // 구매 데이터 매핑
      const recentPurchases = recentPurchasesData.map(p => {
        const firstItem = p.items?.[0];

        // product 객체가 있으면 사용, 없으면 직접 필드 사용
        const product = firstItem?.product || firstItem;
        const productName = product?.product_name || '-';

        // 사이즈별 수량 계산 및 정렬
        const sizeQuantities = (p.items || [])
          .map((item: any) => ({
            size: item.size || '사이즈 미지정',
            quantity: item.quantity
          }))
          .sort((a: { size: string; quantity: number }, b: { size: string; quantity: number }) => {
            // 숫자로 변환 가능하면 숫자로 비교, 아니면 문자열로 비교
            const aNum = parseFloat(a.size);
            const bNum = parseFloat(b.size);
            if (!isNaN(aNum) && !isNaN(bNum)) {
              return aNum - bNum;
            }
            return a.size.localeCompare(b.size);
          })
          .map((item: { size: string; quantity: number }) => `${item.size}(${item.quantity}개)`)
          .join(', ');

        // 이미지 URL 생성: 브랜드명/상품코드.png 형식
        let imageUrl = '';
        if (product?.brand_name && product?.product_code) {
          imageUrl = getFileUrl(`/uploads/products/${product.brand_name}/${product.product_code}.png`) || '';
        }

        return {
          id: p.id!,
          type: 'purchase' as const,
          transaction_no: p.transaction_no || '-',
          date: p.purchase_date,
          updated_at: p.updated_at || p.created_at,
          product_name: productName,
          product_code: `${product?.product_code || ''} ${sizeQuantities}`,
          product_image_url: imageUrl,
          amount: Number(p.total_amount || 0),
          user_name: p.buyer_name || '-',
          status: String(p.status),
        };
      });

      // 판매 데이터 매핑
      const recentSalesDataMapped = recentSalesData.map(s => {
        const firstItem = s.items?.[0];

        // product 객체가 있으면 사용, 없으면 직접 필드 사용
        const product = firstItem?.product || firstItem;
        const productName = product?.product_name || '-';

        // 사이즈별 수량 계산 및 정렬
        const sizeQuantities = (s.items || [])
          .map((item: any) => ({
            size: item.size || '사이즈 미지정',
            quantity: item.quantity || 0
          }))
          .sort((a: { size: string; quantity: number }, b: { size: string; quantity: number }) => {
            // 숫자로 변환 가능하면 숫자로 비교, 아니면 문자열로 비교
            const aNum = parseFloat(a.size);
            const bNum = parseFloat(b.size);
            if (!isNaN(aNum) && !isNaN(bNum)) {
              return aNum - bNum;
            }
            return a.size.localeCompare(b.size);
          })
          .map((item: { size: string; quantity: number }) => `${item.size}(${item.quantity}개)`)
          .join(', ');

        // 이미지 URL 생성: 브랜드명/상품코드.png 형식
        let imageUrl = '';
        if (product?.brand_name && product?.product_code) {
          imageUrl = getFileUrl(`/uploads/products/${product.brand_name}/${product.product_code}.png`) || '';
        }

        return {
          id: s.id!,
          type: 'sale' as const,
          transaction_no: s.sale_number || '-',
          date: s.sale_date,
          updated_at: s.updated_at || s.created_at,
          product_name: productName,
          product_code: `${product?.product_code || ''} ${sizeQuantities}`,
          product_image_url: imageUrl,
          amount: Number(s.total_seller_amount || 0),
          user_name: s.seller_name || '-',
          status: String(s.status || 'pending'),
        };
      });

      // 전체 데이터를 updated_at 기준 최신순으로 정렬
      const combined = [...recentPurchases, ...recentSalesDataMapped]
        .sort((a, b) => dayjs(b.updated_at).valueOf() - dayjs(a.updated_at).valueOf());

      setRecentActivities(combined);

      // 차트 데이터는 별도로 생성
      generateChartData(purchases, sales, dateRange);


    } catch (error) {
      console.error('Error fetching stats:', error);
      throw error;
    }
  };

  const generateChartData = async (purchases?: any[], sales?: any[], range?: [dayjs.Dayjs, dayjs.Dayjs]) => {
    try {
      let purchaseData = purchases;
      let saleData = sales;

      if (!purchaseData || !saleData) {
        const [purchasesResponse, salesResponse] = await Promise.all([
          purchaseService.getPurchases({ limit: 500 }), // 10000 -> 500으로 감소
          saleService.getSales({ limit: 500 }), // 10000 -> 500
        ]);
        purchaseData = purchasesResponse.items;
        saleData = salesResponse.items;
      }

      const [startDate, endDate] = range || dateRange;
      const daysDiff = endDate.diff(startDate, 'day') + 1;

      const chartDataArray = Array.from({ length: daysDiff }, (_, i) => {
        const date = startDate.add(i, 'day');
        const dateStr = date.format('YYYY-MM-DD');

        const dayPurchases = purchaseData!.filter(p =>
          dayjs(p.purchase_date).format('YYYY-MM-DD') === dateStr
        );
        const daySales = saleData!.filter(s =>
          dayjs(s.sale_date).format('YYYY-MM-DD') === dateStr
        );

        const purchaseAmount = dayPurchases.reduce((sum, p) => sum + Number(p.total_amount || 0), 0);
        const saleAmount = daySales.reduce((sum, s) => sum + Number(s.total_seller_amount || 0), 0);

        // 해당 일자에 판매된 상품의 실제 구매가 계산
        const daySaleCost = daySales.reduce((sum, sale) => {
          const saleCost = (sale.items || []).reduce((itemSum: number, item: any) => {
            const productId = item.product_id;
            const quantity = item.quantity || 1;

            const productPurchases = purchaseData!.filter(p =>
              p.items?.some((pi: any) => pi.product_id === productId)
            );

            if (productPurchases.length === 0) return itemSum;

            let totalPurchasePrice = 0;
            let totalPurchaseQty = 0;

            productPurchases.forEach(p => {
              p.items?.forEach((pi: any) => {
                if (pi.product_id === productId) {
                  totalPurchasePrice += Number(pi.purchase_price || 0) * (pi.quantity || 0);
                  totalPurchaseQty += pi.quantity || 0;
                }
              });
            });

            const avgPurchasePrice = totalPurchaseQty > 0 ? totalPurchasePrice / totalPurchaseQty : 0;
            return itemSum + (avgPurchasePrice * quantity);
          }, 0);

          return sum + saleCost;
        }, 0);

        const profit = saleAmount - daySaleCost;

        return {
          date: date.format('MM/DD'),
          fullDate: dateStr,
          구매: Math.round(purchaseAmount / 10000), // 만원 단위
          판매: Math.round(saleAmount / 10000),
          순이익: Math.round(profit / 10000),
        };
      });

      setChartData(chartDataArray);
    } catch (error) {
      console.error('Error generating chart data:', error);
    }
  };

  const handleDateRangeChange = (dates: any) => {
    if (dates && dates[0] && dates[1]) {
      const newRange: [dayjs.Dayjs, dayjs.Dayjs] = [dates[0], dates[1]];
      setDateRange(newRange);
      generateChartData(undefined, undefined, newRange);
    }
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; text: string; icon: React.ReactNode }> = {
      pending: { color: 'orange', text: '대기', icon: <ClockCircleOutlined /> },
      completed: { color: 'green', text: '완료', icon: <CheckCircleOutlined /> },
      cancelled: { color: 'red', text: '취소', icon: <CloseCircleOutlined /> },
    };
    const config = statusMap[status] || { color: 'default', text: status, icon: null };
    return (
      <Tag color={config.color} icon={config.icon}>
        {config.text}
      </Tag>
    );
  };

  const activityColumns: ColumnsType<RecentActivity> = [
    {
      title: '유형',
      dataIndex: 'type',
      key: 'type',
      width: 50,
      align: 'center',
      render: (type: string) => (
        <span style={{ fontSize: 11, color: type === 'purchase' ? '#1890ff' : '#52c41a', fontWeight: 500 }}>
          {type === 'purchase' ? '구매' : '판매'}
        </span>
      ),
    },
    {
      title: '날짜',
      dataIndex: 'date',
      key: 'date',
      width: 120,
      align: 'center',
      render: (date: string, record) => (
        <div style={{ fontSize: 11, color: '#595959' }}>
          {dayjs(record.updated_at || date).format('MM/DD HH:mm')}
        </div>
      ),
    },
    {
      title: '거래번호',
      dataIndex: 'transaction_no',
      key: 'transaction_no',
      width: 120,
      align: 'center',
      render: (text: string) => (
        <div style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {text}
        </div>
      ),
    },
    {
      title: '상품',
      key: 'product',
      width: 320,
      align: 'center',
      render: (_, record) => {
        // 상품코드와 사이즈 정보 분리
        const productCodeParts = record.product_code?.split(' ') || [];
        const productCode = productCodeParts[0] || '';
        const sizeInfo = productCodeParts.slice(1).join(' ');
        // 사이즈(수량) 형식 파싱: "270(1개), 275(2개)" -> [{size: '270', qty: '1'}, ...]
        const sizeMatches = sizeInfo.match(/([^,\s]+)\((\d+)개\)/g) || [];
        const sizes = sizeMatches.map(s => {
          const match = s.match(/([^(]+)\((\d+)개\)/);
          return match ? { size: match[1], qty: match[2] } : { size: s, qty: '1' };
        });

        return (
          <div
            style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}
            onClick={() => {
              if (record.type === 'purchase') {
                navigate(`/purchases/${record.id}`);
              } else {
                navigate(`/sales/${record.id}`);
              }
            }}
          >
            <div style={{ width: 45, height: 45, flexShrink: 0, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4 }}>
              {record.product_image_url ? (
                <img
                  src={record.product_image_url}
                  alt={record.product_name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              ) : (
                <span style={{ fontSize: 8, color: '#999' }}>NO IMAGE</span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#262626' }}>{productCode}</span>
                <span style={{ fontSize: 11, color: '#595959', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={record.product_name}>
                  {record.product_name}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {sizes.map((item, idx) => (
                  <Tag key={idx} style={{ margin: 0, fontSize: 10, padding: '1px 6px', background: '#f0f5ff', border: '1px solid #adc6ff', color: '#1d39c4' }}>
                    {item.size} <span style={{ color: '#ff4d4f', fontWeight: 600 }}>×{item.qty}</span>
                  </Tag>
                ))}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      title: '금액',
      dataIndex: 'amount',
      key: 'amount',
      width: 110,
      align: 'center',
      render: (amount: number) => (
        <div style={{ textAlign: 'right', fontSize: 11 }}>
          ₩{Math.floor(amount).toLocaleString()}
        </div>
      ),
    },
    {
      title: '담당자',
      dataIndex: 'user_name',
      key: 'user_name',
      width: 90,
      align: 'center',
      render: (text: string) => (
        <div style={{ fontSize: 11 }}>
          {text}
        </div>
      ),
    },
  ];

  const filteredActivities = activeTab === 'all'
    ? recentActivities
    : recentActivities.filter(a => a.type === activeTab);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <Spin size="large" tip="대시보드 데이터 로딩중..." />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', background: '#f0f2f5' }}>
      {/* 구매, 판매, 순이익 카드 + 그래프 통합 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {/* 구매 카드 */}
        <Col xs={24} lg={8}>
          <Card
            title="🛒 구매"
            style={{ borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', height: '100%', minHeight: 360 }}
          >
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ flex: 1, padding: '6px 8px', background: '#e6f7ff', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: '#8c8c8c' }}>오늘</span>
                  <span style={{ fontSize: 10, color: '#595959' }}>{stats?.today_purchase_count}개</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 'bold', color: '#1890ff' }}>{formatCurrencyWithKorean(stats?.today_purchase_amount || 0)}</span>
              </div>
              <div style={{ flex: 1, padding: '6px 8px', background: '#f5f5f5', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: '#8c8c8c' }}>이번주</span>
                  <span style={{ fontSize: 10, color: '#595959' }}>{stats?.week_purchase_count}개</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 'bold', color: '#1890ff' }}>{formatCurrencyWithKorean(stats?.week_purchase_amount || 0)}</span>
              </div>
              <div style={{ flex: 1, padding: '6px 8px', background: '#f5f5f5', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: '#8c8c8c' }}>이번달</span>
                  <span style={{ fontSize: 10, color: '#595959' }}>{stats?.month_purchase_count}개</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 'bold', color: '#1890ff' }}>{formatCurrencyWithKorean(stats?.month_purchase_amount || 0)}</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart
                data={chartData}
                margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  type="category"
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  label={{ value: '만원', angle: 0, position: 'top', offset: 10, style: { fontSize: 10 } }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11 }}
                  formatter={(value: any) => [`${Number(value).toLocaleString()}만원`, '']}
                  labelFormatter={(label: any) => `날짜: ${label}`}
                />
                <Bar
                  dataKey="구매"
                  fill="#1890ff"
                  opacity={0.6}
                />
                <Line
                  type="monotone"
                  dataKey="구매"
                  stroke="#0050b3"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        {/* 판매 카드 */}
        <Col xs={24} lg={8}>
          <Card
            title="💰 판매"
            style={{ borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', height: '100%', minHeight: 360 }}
          >
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ flex: 1, padding: '6px 8px', background: '#f6ffed', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: '#8c8c8c' }}>오늘</span>
                  <span style={{ fontSize: 10, color: '#595959' }}>{stats?.today_sale_count}건</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 'bold', color: '#52c41a' }}>{formatCurrencyWithKorean(stats?.today_sale_amount || 0)}</span>
              </div>
              <div style={{ flex: 1, padding: '6px 8px', background: '#f5f5f5', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: '#8c8c8c' }}>이번주</span>
                  <span style={{ fontSize: 10, color: '#595959' }}>{stats?.week_sale_count}건</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 'bold', color: '#52c41a' }}>{formatCurrencyWithKorean(stats?.week_sale_amount || 0)}</span>
              </div>
              <div style={{ flex: 1, padding: '6px 8px', background: '#f5f5f5', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: '#8c8c8c' }}>이번달</span>
                  <span style={{ fontSize: 10, color: '#595959' }}>{stats?.month_sale_count}건</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 'bold', color: '#52c41a' }}>{formatCurrencyWithKorean(stats?.month_sale_amount || 0)}</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart
                data={chartData}
                margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  type="category"
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  label={{ value: '만원', angle: 0, position: 'top', offset: 10, style: { fontSize: 10 } }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11 }}
                  formatter={(value: any) => [`${Number(value).toLocaleString()}만원`, '']}
                  labelFormatter={(label: any) => `날짜: ${label}`}
                />
                <Bar
                  dataKey="판매"
                  fill="#52c41a"
                  opacity={0.6}
                />
                <Line
                  type="monotone"
                  dataKey="판매"
                  stroke="#237804"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        {/* 순이익 카드 */}
        <Col xs={24} lg={8}>
          <Card
            title="📈 순이익"
            extra={
              <DatePicker.RangePicker
                value={dateRange}
                onChange={handleDateRangeChange}
                format="YYYY-MM-DD"
                allowClear={false}
                size="small"
              />
            }
            style={{ borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', height: '100%', minHeight: 360 }}
          >
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ flex: 1, padding: '6px 8px', background: stats?.today_profit && stats.today_profit < 0 ? '#fff1f0' : '#fff7e6', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: '#8c8c8c' }}>오늘</span>
                  <span style={{ fontSize: 10, color: '#595959' }}>{stats?.today_profit_rate.toFixed(1)}%</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 'bold', color: stats?.today_profit && stats.today_profit < 0 ? '#cf1322' : '#faad14' }}>{formatCurrencyWithKorean(stats?.today_profit || 0)}</span>
              </div>
              <div style={{ flex: 1, padding: '6px 8px', background: stats?.week_profit && stats.week_profit < 0 ? '#fff1f0' : '#f5f5f5', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: '#8c8c8c' }}>이번주</span>
                  <span style={{ fontSize: 10, color: '#595959' }}>{stats?.week_profit_rate.toFixed(1)}%</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 'bold', color: stats?.week_profit && stats.week_profit < 0 ? '#cf1322' : '#faad14' }}>{formatCurrencyWithKorean(stats?.week_profit || 0)}</span>
              </div>
              <div style={{ flex: 1, padding: '6px 8px', background: stats?.month_profit && stats.month_profit < 0 ? '#fff1f0' : '#f5f5f5', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: '#8c8c8c' }}>이번달</span>
                  <span style={{ fontSize: 10, color: '#595959' }}>{stats?.month_profit_rate.toFixed(1)}%</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 'bold', color: stats?.month_profit && stats.month_profit < 0 ? '#cf1322' : '#faad14' }}>{formatCurrencyWithKorean(stats?.month_profit || 0)}</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart
                data={chartData}
                margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  type="category"
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  label={{ value: '만원', angle: 0, position: 'top', offset: 10, style: { fontSize: 10 } }}
                  domain={[(dataMin: number) => Math.min(dataMin, 0), 'auto']}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11 }}
                  formatter={(value: any) => [`${Number(value).toLocaleString()}만원`, '']}
                  labelFormatter={(label: any) => `날짜: ${label}`}
                />
                <Bar dataKey="순이익" opacity={0.6}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.순이익 < 0 ? '#cf1322' : '#faad14'} />
                  ))}
                </Bar>
                <Line
                  type="monotone"
                  dataKey="순이익"
                  strokeWidth={2}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    const dotColor = payload && payload.순이익 < 0 ? '#cf1322' : '#d48806';
                    return <circle cx={cx} cy={cy} r={3} fill={dotColor} />;
                  }}
                  stroke="#d48806"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      {/* KREAM 인기 상품 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24}>
          <TrendingProductWidget />
        </Col>
      </Row>

      {/* 최근 활동 내역 */}
      <Row gutter={16}>
        <Col xs={24}>
          <Card
            title="📋 최근 활동 내역"
            style={{ borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', width: '100%' }}
            bodyStyle={{ padding: '0' }}
            extra={
              <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                size="small"
                items={[
                  { key: 'all', label: '전체' },
                  { key: 'purchase', label: '구매' },
                  { key: 'sale', label: '판매' },
                ]}
              />
            }
          >
            <Table
              columns={activityColumns}
              dataSource={filteredActivities}
              rowKey="id"
              pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `총 ${total}건` }}
              locale={{ emptyText: '최근 활동 내역이 없습니다' }}
              style={{
                // 행 구분선 스타일
              }}
              className="activity-table-with-dividers"
            />
            <style>{`
              .activity-table-with-dividers .ant-table-tbody > tr > td {
                border-bottom: 1px solid #f0f0f0 !important;
              }
              .activity-table-with-dividers .ant-table-tbody > tr:hover > td {
                background: #fafafa !important;
              }
            `}</style>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;