import React, { useState, useMemo, useEffect } from 'react';
import { Layout, Menu, Avatar, Dropdown, Badge, Button, Space, Breadcrumb, Drawer, List, Typography, Tag, Empty, Image } from 'antd';
import {
  DashboardOutlined,
  ShoppingCartOutlined,
  DollarOutlined,
  InboxOutlined,
  HomeOutlined,
  TeamOutlined,
  CalculatorOutlined,
  BellOutlined,
  LogoutOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DeleteOutlined,
  CheckOutlined,
  QuestionCircleOutlined,
  CloudDownloadOutlined,
  SearchOutlined,
  GiftOutlined,
  DownloadOutlined,
  ShopOutlined,
  BulbOutlined,
  ExclamationCircleOutlined,
  CreditCardOutlined,
  BankOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { notificationService } from '../../services/notification';
import api from '../../services/api';
import { Notification, NotificationType } from '../../types/notification';
import ChatDropdown from '../Chat/ChatDropdown';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';
import 'dayjs/locale/ko';

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.locale('ko');

const { Text } = Typography;

const { Header, Sider, Content } = Layout;

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [notificationDrawerVisible, setNotificationDrawerVisible] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [sessionTimeRemaining, setSessionTimeRemaining] = useState<number | null>(null);

  // 페이지 제목 매핑
  const pageTitles: { [key: string]: string } = {
    '/dashboard': '대시보드',
    '/products': '상품 관리',
    '/products/new': '상품 등록',
    '/products/seller-finder': '상품판매처 찾기',
    '/purchases': '구매 관리',
    '/purchases/new': '구매 등록',
    '/sales': '판매 관리',
    '/sales/new': '판매 등록',
    '/inventory': '재고 관리',
    '/inventory/defective': '불량 물품 관리',
    '/warehouses': '창고 관리',
    '/settlements': '정산 관리',
    '/users': '사용자 관리',
    '/trending-products': '인기상품 관리',
    '/product-importer': '상품 자동 수집',
    '/adidas': '아디다스 쿠폰',
    '/users/new': '사용자 등록',
    '/reports': '보고서',
    '/settings': '설정',
    '/settings/codef': 'CODEF API 설정',
    '/profile': '프로필',
    '/feature-requests': '요청사항',
    '/adidas-comparison': '아디다스 구매/판매 비교',
    '/poizon-price-comparison': '포이즌 가격비교',
    '/card-transactions': '카드 내역',
    '/bank-transactions': '은행 거래내역',
  };

  // 브레드크럼 아이템 생성
  const breadcrumbItems = useMemo(() => {
    const pathSegments = location.pathname.split('/').filter(segment => segment);
    const items: Array<{ href?: string; title: JSX.Element }> = [];

    if (pathSegments.length === 0) {
      return items;
    }

    // 첫 번째 세그먼트 (메인 메뉴)
    const mainPath = `/${pathSegments[0]}`;
    const mainTitle = pageTitles[mainPath];

    if (mainTitle) {
      // 서브 페이지가 없으면 진하게, 있으면 연하게
      const isLastItem = pathSegments.length === 1;
      items.push({
        href: mainPath,
        title: <span style={{ fontWeight: isLastItem ? 600 : 400, color: isLastItem ? '#262626' : '#8c8c8c' }}>{mainTitle}</span>,
      });
    }

    // 두 번째 세그먼트 (서브 메뉴)
    if (pathSegments.length > 1) {
      const subPath = `/${pathSegments[0]}/${pathSegments[1]}`;
      let subTitle = pageTitles[subPath];

      // 동적 경로 처리
      if (!subTitle) {
        if (pathSegments[0] === 'products' && pathSegments[1] === 'edit') {
          subTitle = '상품 수정';
        } else if (pathSegments[0] === 'purchases' && pathSegments[1] !== 'new') {
          subTitle = '구매 정보';
        } else if (pathSegments[0] === 'sales' && pathSegments[1] !== 'new') {
          subTitle = '판매 정보';
        } else if (pathSegments[0] === 'users' && pathSegments[1] !== 'new') {
          subTitle = '사용자 수정';
        }
      }

      if (subTitle) {
        items.push({
          title: <span style={{ fontWeight: 600, color: '#262626' }}>{subTitle}</span>,
        });
      }
    }

    return items;
  }, [location.pathname, pageTitles]);

  // 알림 데이터 가져오기
  const fetchNotifications = async () => {
    try {
      setLoadingNotifications(true);
      const response = await notificationService.getNotifications({ limit: 20 });
      console.log('🔔 Notification response:', response);
      console.log('🔔 Items:', response.items);
      console.log('🔔 Items length:', response.items?.length);
      console.log('🔔 Unread count:', response.unread_count);
      setNotifications(response.items);
      setUnreadCount(response.unread_count);
    } catch (error) {
      console.error('알림 조회 실패:', error);
    } finally {
      setLoadingNotifications(false);
    }
  };

  // 세션 타이머 계산
  useEffect(() => {
    const calculateTimeRemaining = () => {
      const token = localStorage.getItem('access_token');

      if (!token) {
        setSessionTimeRemaining(null);
        return;
      }

      try {
        // JWT 디코딩 (payload 부분만)
        const payload = JSON.parse(atob(token.split('.')[1]));
        const expirationTime = payload.exp * 1000; // ms로 변환
        const now = Date.now();
        const remaining = Math.max(0, expirationTime - now);

        setSessionTimeRemaining(remaining);

        if (remaining === 0) {
          logout();
        }
      } catch (error) {
        console.error('토큰 파싱 오류:', error);
        setSessionTimeRemaining(null);
      }
    };

    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [logout]);

  // 세션 연장
  const handleExtendSession = async () => {
    try {
      const response = await api.post('/auth/refresh');
      if (response.data?.access_token) {
        localStorage.setItem('access_token', response.data.access_token);
        window.location.reload(); // 새 토큰으로 페이지 리로드
      }
    } catch (error) {
      console.error('세션 연장 실패:', error);
    }
  };

  // 세션 시간 포맷팅
  const formatSessionTime = (ms: number | null) => {
    if (ms === null) return '';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // 주기적으로 읽지 않은 알림 개수 업데이트
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(async () => {
      try {
        const count = await notificationService.getUnreadCount();
        setUnreadCount(count);
      } catch (error) {
        console.error('알림 개수 조회 실패:', error);
      }
    }, 30000); // 30초마다

    return () => clearInterval(interval);
  }, []);

  // 알림 읽음 처리
  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await notificationService.markAsRead(notificationId);
      fetchNotifications();
    } catch (error) {
      console.error('알림 읽음 처리 실패:', error);
    }
  };

  // 모든 알림 읽음 처리
  const handleMarkAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead();
      fetchNotifications();
    } catch (error) {
      console.error('모든 알림 읽음 처리 실패:', error);
    }
  };

  // 알림 삭제
  const handleDeleteNotification = async (notificationId: string) => {
    try {
      await notificationService.deleteNotification(notificationId);
      fetchNotifications();
    } catch (error) {
      console.error('알림 삭제 실패:', error);
    }
  };

  // 모든 알림 삭제
  const handleDeleteAllNotifications = async () => {
    try {
      // 모든 알림을 하나씩 삭제
      await Promise.all(notifications.map(n => notificationService.deleteNotification(n.id)));
      fetchNotifications();
    } catch (error) {
      console.error('모든 알림 삭제 실패:', error);
    }
  };

  interface MenuItem {
    key: string;
    icon: React.ReactElement;
    label: string;
    roles?: string[];
    children?: MenuItem[];
  }

  const menuItems: MenuItem[] = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '대시보드',
    },
    {
      key: 'inout-management',
      icon: <ShoppingCartOutlined />,
      label: '입출고 관리',
      roles: ['admin', 'buyer', 'seller'],
      children: [
        {
          key: '/purchases',
          icon: <ShoppingCartOutlined />,
          label: '구매 관리',
          roles: ['admin', 'buyer'],
        },
        {
          key: '/sales',
          icon: <DollarOutlined />,
          label: '판매 관리',
          roles: ['admin', 'seller'],
        },
      ],
    },
    {
      key: 'item-management',
      icon: <InboxOutlined />,
      label: '물품 관리',
      children: [
        {
          key: '/inventory',
          icon: <InboxOutlined />,
          label: '재고 관리',
        },
        {
          key: '/inventory/defective',
          icon: <ExclamationCircleOutlined />,
          label: '불량 물품',
        },
      ],
    },
    {
      key: 'product-info-management',
      icon: <TeamOutlined />,
      label: '상품 정보 관리',
      children: [
        {
          key: '/products',
          icon: <TeamOutlined />,
          label: '상품 목록',
        },
        {
          key: '/products/seller-finder',
          icon: <ShopOutlined />,
          label: '상품판매처 찾기',
        },
        {
          key: '/poizon-price-comparison',
          icon: <CalculatorOutlined />,
          label: '포이즌 가격비교',
        },
        {
          key: '/product-importer',
          icon: <CloudDownloadOutlined />,
          label: '상품 자동 수집',
          roles: ['admin'],
        },
        {
          key: '/trending-products',
          icon: <SearchOutlined />,
          label: '인기 상품 등록',
          roles: ['admin'],
        },
      ],
    },
    // {
    //   key: 'finance-management',
    //   icon: <CreditCardOutlined />,
    //   label: '재무 관리',
    //   children: [
    //     {
    //       key: '/card-transactions',
    //       icon: <CreditCardOutlined />,
    //       label: '카드 내역',
    //     },
    //     {
    //       key: '/bank-transactions',
    //       icon: <BankOutlined />,
    //       label: '은행 거래내역',
    //     },
    //   ],
    // },
    {
      key: 'etc-management',
      icon: <BulbOutlined />,
      label: '기타',
      roles: ['admin'],
      children: [
        {
          key: '/feature-requests',
          icon: <BulbOutlined />,
          label: '요청 게시판',
        },
        {
          key: '/users',
          icon: <UserOutlined />,
          label: '사용자 관리',
          roles: ['admin'],
        },
        {
          key: '/adidas-comparison',
          icon: <CalculatorOutlined />,
          label: '아디다스 구매비교 (임시)',
          roles: ['admin'],
        },
        {
          key: '/adidas',
          icon: <GiftOutlined />,
          label: '아디다스 쿠폰',
          roles: ['admin'],
        },
        // {
        //   key: '/settings/codef',
        //   icon: <SettingOutlined />,
        //   label: 'CODEF API 설정',
        //   roles: ['admin'],
        // },
      ],
    },
  ];

  // 사용자 권한에 따른 메뉴 필터링 (자식 메뉴도 필터링)
  const filteredMenuItems = menuItems.map(item => {
    // 자식이 있는 경우
    if (item.children) {
      const filteredChildren = item.children.filter(child => {
        if (!child.roles) return true;
        return child.roles.includes(user?.role || '');
      });

      // 필터링된 자식이 없으면 부모도 제외
      if (filteredChildren.length === 0) return null;

      // 부모의 roles 체크
      if (item.roles && !item.roles.includes(user?.role || '')) return null;

      return { ...item, children: filteredChildren };
    }

    // 자식이 없는 경우 기존 로직
    if (!item.roles) return item;
    if (item.roles.includes(user?.role || '')) return item;
    return null;
  }).filter(Boolean) as MenuItem[];

  const handleMenuClick = ({ key }: { key: string }) => {
    // '/' 로 시작하는 경로만 네비게이션 (서브메뉴 부모는 무시)
    if (key && key.startsWith('/')) {
      navigate(key);
    }
  };

  // 현재 경로에 맞는 메뉴 키 결정
  const selectedMenuKey = useMemo(() => {
    const pathname = location.pathname;

    // 전체 경로가 메뉴 아이템과 일치하는지 확인
    const findMatchingKey = (items: MenuItem[]): string | null => {
      for (const item of items) {
        // 정확히 일치하는 경우 (자식이 없는 최상위 메뉴)
        if (item.key === pathname && !item.children) {
          return item.key;
        }

        // 자식 메뉴 검색
        if (item.children) {
          for (const child of item.children) {
            if (child.key === pathname) {
              return child.key;
            }
          }
        }
      }
      return null;
    };

    const exactMatch = findMatchingKey(menuItems);
    if (exactMatch) {
      return exactMatch;
    }

    // 일치하는 키가 없으면 첫 번째 세그먼트 기준
    const pathSegments = pathname.split('/').filter(segment => segment);
    if (pathSegments.length === 0) {
      return '/dashboard';
    }

    return `/${pathSegments[0]}`;
  }, [location.pathname]);

  // 모든 서브메뉴를 기본으로 펼쳐둠
  const defaultOpenKeys = useMemo(() => {
    return menuItems
      .filter(item => item.children && item.children.length > 0)
      .map(item => item.key);
  }, []);

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '프로필',
      onClick: () => navigate('/profile'),
    },
    {
      key: 'help',
      icon: <QuestionCircleOutlined />,
      label: '도움말',
      onClick: () => navigate('/help'),
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '로그아웃',
      onClick: logout,
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={240}
        style={{
          background: '#1a1d2e',
          boxShadow: '2px 0 8px 0 rgba(0,0,0,.15)',
          position: 'relative',
        }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '0' : '0 20px',
          }}
        >
          {!collapsed ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
              <img
                src="/images/logo.png"
                alt="로고"
                style={{
                  height: 40,
                  filter: 'brightness(0) invert(1)', // 로고를 흰색으로 변환
                  flexShrink: 0,
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <div style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
                재고관리시스템
              </div>
            </div>
          ) : (
            <img
              src="/images/logo.png"
              alt="로고"
              style={{
                height: 32,
                filter: 'brightness(0) invert(1)', // 로고를 흰색으로 변환
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedMenuKey]}
          defaultOpenKeys={defaultOpenKeys}
          onClick={handleMenuClick}
          className="sidebar-menu"
          style={{
            border: 'none',
            height: 'calc(100vh - 64px - 48px - 32px)',
            overflowY: 'auto',
            background: 'transparent',
            padding: '8px',
          }}
          theme="dark"
          items={filteredMenuItems.map(item => ({
            key: item.key,
            icon: item.icon,
            label: item.label,
            ...(item.children ? {
              children: item.children.map(child => ({
                key: child.key,
                icon: child.icon,
                label: child.label,
                style: {
                  borderRadius: 6,
                  margin: '2px 0',
                },
              }))
            } : {}),
            style: {
              borderRadius: 8,
              margin: '4px 0',
            },
          }))}
        />
        {/* 버전 표시 */}
        <div
          style={{
            position: 'absolute',
            bottom: 48,
            width: '100%',
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
          }}
        >
          <span style={{
            fontSize: 13,
            color: '#94a3b8',
            fontWeight: 600,
          }}>
            {collapsed ? 'v1.0' : 'Beta v1.0'}
          </span>
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            width: '100%',
            height: 48,
            borderTop: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            cursor: 'pointer',
            transition: 'all 0.3s',
          }}
          onClick={() => setCollapsed(!collapsed)}
        >
          <Button
            type="text"
            style={{
              fontSize: 18,
              color: '#94a3b8',
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          />
        </div>
      </Sider>

      <Layout>
        <Header
          style={{
            padding: '0 24px',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 4px rgba(0,21,41,.08)',
            height: 64,
          }}
        >
          <Space size="large" style={{ flex: 1, height: '100%', alignItems: 'center' }}>
            <Breadcrumb
              items={breadcrumbItems}
              style={{ fontSize: 16, fontWeight: 600, color: '#262626' }}
            />
          </Space>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, height: '100%' }}>
            {/* 아디다스 쿠폰 프로그램 다운로드 버튼 - 비활성화 */}
            {/* {user?.role === 'admin' && (
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                size="small"
                style={{
                  background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                  border: 'none',
                  borderRadius: 6,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                onClick={() => {
                  // 다운로드 링크 생성
                  const link = document.createElement('a');
                  link.href = '/downloads/아디다스쿠폰발급프로그램_데이터.exe';
                  link.download = '아디다스쿠폰발급프로그램_데이터.exe';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
              >
                <GiftOutlined style={{ fontSize: 14 }} />
                <span style={{ fontSize: 13 }}>아디다스 쿠폰 프로그램</span>
              </Button>
            )} */}

            {sessionTimeRemaining !== null && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                background: sessionTimeRemaining < 300000 ? '#fff1f0' : '#f0f5ff',
                border: `1px solid ${sessionTimeRemaining < 300000 ? '#ffccc7' : '#d6e4ff'}`,
                borderRadius: 6,
                height: 36,
                transition: 'all 0.2s',
              }}>
                <span style={{
                  fontSize: 13,
                  color: sessionTimeRemaining < 300000 ? '#cf1322' : '#1890ff',
                  fontWeight: 600,
                  fontFamily: 'monospace',
                  minWidth: 45,
                }}>
                  {formatSessionTime(sessionTimeRemaining)}
                </span>
                <div style={{
                  width: 1,
                  height: 18,
                  background: sessionTimeRemaining < 300000 ? '#ffccc7' : '#d6e4ff',
                }} />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExtendSession();
                  }}
                  style={{
                    fontSize: 12,
                    color: sessionTimeRemaining < 300000 ? '#cf1322' : '#1890ff',
                    cursor: 'pointer',
                    padding: '2px 6px',
                    border: 'none',
                    background: 'transparent',
                    outline: 'none',
                    fontWeight: 500,
                    borderRadius: 4,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = sessionTimeRemaining < 300000 ? 'rgba(207, 19, 34, 0.1)' : 'rgba(24, 144, 255, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  연장
                </button>
              </div>
            )}

            <ChatDropdown />

            <Badge
              count={unreadCount}
              offset={[-4, 4]}
              style={{
                backgroundColor: '#ff4d4f',
                fontSize: 11,
                fontWeight: 600,
                height: 20,
                minWidth: 20,
                lineHeight: '20px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
              }}
            >
              <div
                onClick={() => {
                  setNotificationDrawerVisible(true);
                  fetchNotifications();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: 'transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f5f5f5';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <BellOutlined style={{ fontSize: 19, color: '#595959' }} />
              </div>
            </Badge>

            <Dropdown
              menu={{ items: userMenuItems }}
              placement="bottomRight"
              arrow
            >
              <div style={{
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: 8,
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                height: 40,
                border: '1px solid transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f5f5f5';
                e.currentTarget.style.borderColor = '#e8e8e8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'transparent';
              }}
              >
                <Avatar size={32} style={{ backgroundColor: '#1890ff', fontSize: 15, fontWeight: 600 }}>
                  {user?.full_name?.charAt(0)}
                </Avatar>
                <span style={{ fontSize: 14, color: '#262626', fontWeight: 500 }}>{user?.full_name}</span>
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content
          style={{
            background: '#f0f2f5',
            minHeight: 'calc(100vh - 64px)',
            overflow: 'auto',
          }}
        >
          {children}
        </Content>
      </Layout>

      {/* 알림 Drawer */}
      <Drawer
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>알림</span>
            <Space>
              {unreadCount > 0 && (
                <Button size="small" type="link" onClick={handleMarkAllAsRead}>
                  모두 읽음
                </Button>
              )}
              {notifications.length > 0 && (
                <Button size="small" type="link" danger onClick={handleDeleteAllNotifications}>
                  전체 삭제
                </Button>
              )}
            </Space>
          </div>
        }
        placement="right"
        width={400}
        onClose={() => setNotificationDrawerVisible(false)}
        open={notificationDrawerVisible}
      >
        {notifications.length === 0 ? (
          <Empty description="알림이 없습니다" />
        ) : (
          <List
            dataSource={notifications}
            renderItem={(item) => (
              <List.Item
                style={{
                  backgroundColor: item.is_read ? '#fff' : '#e6f7ff',
                  padding: '12px',
                  marginBottom: '8px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  border: '1px solid #f0f0f0',
                  position: 'relative',
                }}
                onClick={() => {
                  if (!item.is_read) {
                    handleMarkAsRead(item.id);
                  }
                  if (item.product_id) {
                    setNotificationDrawerVisible(false);
                    navigate(`/inventory`);
                  }
                }}
              >
                <div style={{ display: 'flex', width: '100%', gap: 12 }}>
                  {/* 상품 이미지 */}
                  {item.product_image_url && (
                    <div style={{ flexShrink: 0 }}>
                      <Image
                        src={item.product_image_url}
                        alt={item.product_name || '상품'}
                        width={60}
                        height={60}
                        style={{ borderRadius: 8, objectFit: 'cover' }}
                        preview={false}
                        fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Crect width='60' height='60' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='12' fill='%23bfbfbf'%3E이미지%3C/text%3E%3C/svg%3E"
                      />
                    </div>
                  )}

                  {/* 알림 내용 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Tag color={item.type === NotificationType.STOCK_OUT ? 'red' : 'orange'} style={{ margin: 0 }}>
                        {item.type === NotificationType.STOCK_OUT ? '품절' : '재고 부족'}
                      </Tag>
                      <Text style={{ fontSize: 13, fontWeight: 500, color: '#595959' }}>
                        {item.product_code}
                      </Text>
                    </div>
                    <div style={{ fontSize: 13, marginBottom: 6, lineHeight: '1.5', paddingRight: 45 }}>
                      <span style={{ fontWeight: 600, color: '#262626' }}>{item.product_name}</span>
                      <span style={{ color: '#595959' }}> </span>
                      <span style={{ color: '#0050b3', fontWeight: 600 }}>[{item.size}]</span>
                      <span style={{ color: '#595959' }}> 사이즈가 {item.type === NotificationType.STOCK_OUT ? '품절' : '재고 부족'}되었습니다.</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#8c8c8c' }}>
                      {dayjs.utc(item.created_at).local().fromNow()}
                    </div>
                  </div>

                  {/* 버튼 영역 - 우측 가운데에 세로로 배치 */}
                  <div style={{ position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {!item.is_read && (
                      <Button
                        type="text"
                        size="small"
                        icon={<CheckOutlined style={{ fontSize: 14 }} />}
                        style={{ padding: '4px', width: 24, height: 24 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkAsRead(item.id);
                        }}
                      />
                    )}
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined style={{ fontSize: 14 }} />}
                      style={{ padding: '4px', width: 24, height: 24 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNotification(item.id);
                      }}
                    />
                  </div>
                </div>
              </List.Item>
            )}
          />
        )}
      </Drawer>
    </Layout>
  );
};

export default MainLayout;