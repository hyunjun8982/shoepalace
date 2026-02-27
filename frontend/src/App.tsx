import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntdApp } from 'antd';
import koKR from 'antd/locale/ko_KR';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './components/Layout/MainLayout';
import LoginPage from './pages/Login/LoginPage';
import RegisterPage from './pages/Register/RegisterPage';
import DashboardPage from './pages/Dashboard/DashboardPage';
import PurchaseListPage from './pages/Purchase/PurchaseListPage';
import PurchaseFormPage from './pages/Purchase/PurchaseFormPage';
import PurchaseDetailPage from './pages/Purchase/PurchaseDetailPage';
import SaleListPage from './pages/Sale/SaleListPage';
import SaleFormPage from './pages/Sale/SaleFormPage';
import SaleDetailPage from './pages/Sale/SaleDetailPage';
import SaleManagementPage from './pages/Sale/SaleManagementPage';
import InventoryListPage from './pages/Inventory/InventoryListPage';
import DefectiveItemsPage from './pages/Inventory/DefectiveItemsPage';
import ProductListPage from './pages/Product/ProductListPage';
import ProductFormPage from './pages/Product/ProductFormPage';
import ProductSellerFinderPage from './pages/Product/ProductSellerFinderPage';
import ProductSellerFinderTablePage from './pages/Product/ProductSellerFinderTablePage';
import SettlementListPage from './pages/Settlement/SettlementListPage';
import UserListPage from './pages/User/UserListPage';
import UserFormPage from './pages/User/UserFormPage';
import TrendingProductManagePage from './pages/TrendingProducts/TrendingProductManagePage';
import WarehouseListPage from './pages/Warehouse/WarehouseListPage';
import HelpPage from './pages/Help/HelpPage';
import ProductImporterPage from './pages/Admin/ProductImporterPage';
import KreamScraperPage from './pages/Admin/KreamScraperPage';
import ChatListPage from './pages/Chat/ChatListPage';
import ChatRoomPage from './pages/Chat/ChatRoomPage';
import ChatWindowPage from './pages/Chat/ChatWindowPage';
import AdidasAccountListPage from './pages/Adidas/AdidasAccountListPage';
import AdidasCouponPage from './pages/Adidas/AdidasCouponPage';
import FeatureRequestPage from './pages/FeatureRequest/FeatureRequestPage';
import AdidasComparisonPage from './pages/AdidasComparison/AdidasComparisonPage';
import PoizonPriceComparisonPage from './pages/Poizon/PoizonPriceComparisonPage';
import MobilePhotoCapturePage from './pages/Mobile/MobilePhotoCapturePage';
import MobileReceiptCapturePage from './pages/Mobile/MobileReceiptCapturePage';
import CardTransactionListPage from './pages/CardTransaction/CardTransactionListPage';
import BankTransactionListPage from './pages/BankTransaction/BankTransactionListPage';
import CodefSettingsPage from './pages/Admin/CodefSettingsPage';

// Ant Design 한국어 설정
const antdConfig = {
  locale: koKR,
  theme: {
    token: {
      colorPrimary: '#1890ff',
      borderRadius: 6,
    },
  },
};

const App: React.FC = () => {
  return (
    <ConfigProvider {...antdConfig}>
      <AntdApp>
        <AuthProvider>
          <Router>
          <Routes>
            {/* 로그인 페이지 */}
            <Route path="/login" element={<LoginPage />} />

            {/* 회원가입 페이지 */}
            <Route path="/register" element={<RegisterPage />} />

            {/* 모바일 사진 촬영 페이지 (로그인 불필요 - 토큰 기반 인증) */}
            <Route path="/mobile/photo/:token" element={<MobilePhotoCapturePage />} />

            {/* 모바일 영수증 촬영 페이지 (로그인 불필요 - 토큰 기반 인증) */}
            <Route path="/mobile/receipt/:token" element={<MobileReceiptCapturePage />} />

            {/* 채팅 창 (팝업 전용 - 레이아웃 없음) */}
            <Route
              path="/chat-window/:roomId"
              element={
                <ProtectedRoute>
                  <ChatWindowPage />
                </ProtectedRoute>
              }
            />

            {/* 보호된 라우트들 */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Routes>
                      {/* 대시보드 */}
                      <Route path="/dashboard" element={<DashboardPage />} />

                      {/* 상품 관리 */}
                      <Route path="/products" element={<ProductListPage />} />
                      <Route path="/products/new" element={<ProductFormPage />} />
                      <Route path="/products/edit/:productId" element={<ProductFormPage />} />
                      <Route path="/products/seller-finder" element={<ProductSellerFinderPage />} />
                      <Route path="/products/seller-finder-table" element={<ProductSellerFinderTablePage />} />

                      {/* 구매 관리 */}
                      <Route
                        path="/purchases"
                        element={
                          <ProtectedRoute requiredRole="buyer">
                            <PurchaseListPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/purchases/new"
                        element={
                          <ProtectedRoute requiredRole="buyer">
                            <PurchaseFormPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/purchases/:id"
                        element={
                          <ProtectedRoute requiredRole="buyer">
                            <PurchaseDetailPage />
                          </ProtectedRoute>
                        }
                      />

                      {/* 판매 관리 */}
                      <Route
                        path="/sales"
                        element={
                          <ProtectedRoute requiredRole="seller">
                            <SaleListPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/sales/new"
                        element={
                          <ProtectedRoute requiredRole="seller">
                            <SaleFormPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/sales/:id"
                        element={
                          <ProtectedRoute requiredRole="seller">
                            <SaleDetailPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/sales/edit/:saleId"
                        element={
                          <ProtectedRoute requiredRole="seller">
                            <SaleFormPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/sales/manage/:saleId"
                        element={
                          <ProtectedRoute requiredRole="admin">
                            <SaleManagementPage />
                          </ProtectedRoute>
                        }
                      />

                      {/* 재고 관리 */}
                      <Route path="/inventory" element={<InventoryListPage />} />
                      <Route path="/inventory/defective" element={<DefectiveItemsPage />} />

                      {/* 창고 관리 */}
                      <Route path="/warehouses" element={<WarehouseListPage />} />

                      {/* 인기상품 관리 */}
                      <Route path="/trending-products" element={<TrendingProductManagePage />} />

                      {/* 상품 자동 수집 */}
                      <Route path="/product-importer" element={<KreamScraperPage />} />

                      {/* 아디다스 쿠폰 */}
                      <Route path="/adidas" element={<AdidasAccountListPage />} />

                      {/* 채팅 */}
                      <Route path="/chat" element={<ChatListPage />} />
                      <Route path="/chat/:roomId" element={<ChatRoomPage />} />

                      {/* 카드 내역 관리 */}
                      <Route path="/card-transactions" element={<CardTransactionListPage />} />

                      {/* 은행 거래내역 관리 */}
                      <Route path="/bank-transactions" element={<BankTransactionListPage />} />

                      {/* 정산 관리 */}
                      <Route path="/settlements" element={<SettlementListPage />} />

                      {/* 사용자 관리 */}
                      <Route
                        path="/users"
                        element={
                          <ProtectedRoute requiredRole="admin">
                            <UserListPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/users/new"
                        element={
                          <ProtectedRoute requiredRole="admin">
                            <UserFormPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/users/:id"
                        element={
                          <ProtectedRoute requiredRole="admin">
                            <UserFormPage />
                          </ProtectedRoute>
                        }
                      />

                      {/* 보고서 */}
                      <Route path="/reports" element={<div>보고서 페이지 (개발 예정)</div>} />

                      {/* CODEF 설정 (관리자) */}
                      <Route
                        path="/settings/codef"
                        element={
                          <ProtectedRoute requiredRole="admin">
                            <CodefSettingsPage />
                          </ProtectedRoute>
                        }
                      />

                      {/* 프로필 */}
                      <Route path="/profile" element={<div>프로필 페이지 (개발 예정)</div>} />

                      {/* 도움말 */}
                      <Route path="/help" element={<HelpPage />} />

                      {/* 요청사항 */}
                      <Route path="/feature-requests" element={<FeatureRequestPage />} />

                      {/* 포이즌 가격비교 */}
                      <Route path="/poizon-price-comparison" element={<PoizonPriceComparisonPage />} />

                      {/* 아디다스 구매/판매 비교 (임시) */}
                      <Route
                        path="/adidas-comparison"
                        element={
                          <ProtectedRoute requiredRole="admin">
                            <AdidasComparisonPage />
                          </ProtectedRoute>
                        }
                      />

                      {/* 기본 리다이렉트 */}
                      <Route path="/" element={<Navigate to="/dashboard" replace />} />
                      <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                  </MainLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
          </Router>
        </AuthProvider>
      </AntdApp>
    </ConfigProvider>
  );
};

export default App;