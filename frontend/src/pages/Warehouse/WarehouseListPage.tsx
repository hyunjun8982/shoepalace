import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Space,
  Input,
  Select,
  Modal,
  Form,
  Switch,
  App,
  Tag,
  Upload,
  Image,
  Popconfirm,
  Descriptions,
  Row,
  Col,
  Table,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UploadOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { warehouseService, Warehouse, WarehouseCreate, WarehouseUpdate } from '../../services/warehouse';
import { getFileUrl } from '../../utils/urlUtils';
import { getBrandIconUrl } from '../../utils/imageUtils';

const { Search } = Input;
const { Option } = Select;
const { TextArea } = Input;

const WarehouseListPage: React.FC = () => {
  const { message } = App.useApp();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });
  const [filters, setFilters] = useState({
    search: '',
    is_active: undefined as boolean | undefined,
  });
  const [modalVisible, setModalVisible] = useState(false);
  const [inventoryModalVisible, setInventoryModalVisible] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [selectedWarehouseInventory, setSelectedWarehouseInventory] = useState<any>(null);
  const [form] = Form.useForm();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [inventorySearch, setInventorySearch] = useState<string>('');

  useEffect(() => {
    fetchWarehouses();
  }, [pagination.current, pagination.pageSize, filters]);

  const fetchWarehouses = async () => {
    try {
      setLoading(true);
      const response = await warehouseService.getWarehouses({
        skip: (pagination.current - 1) * pagination.pageSize,
        limit: pagination.pageSize,
        ...filters,
      });
      setWarehouses(response.items);
      setTotal(response.total);
    } catch (error) {
      message.error('창고 목록 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const { warehouse_code } = await warehouseService.getNextWarehouseCode();
      setEditingWarehouse(null);
      form.resetFields();
      form.setFieldsValue({ warehouse_code, is_active: true });
      setImageFile(null);
      setImagePreview('');
      setModalVisible(true);
    } catch (error) {
      message.error('창고 코드 생성에 실패했습니다.');
    }
  };

  const handleEdit = (warehouse: Warehouse) => {
    setEditingWarehouse(warehouse);
    form.setFieldsValue({
      warehouse_code: warehouse.warehouse_code,
      name: warehouse.name,
      location: warehouse.location,
      is_active: warehouse.is_active,
      description: warehouse.description,
    });
    setImagePreview(warehouse.image_url ? getFileUrl(warehouse.image_url) || '' : '');
    setImageFile(null);
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await warehouseService.deleteWarehouse(id);
      message.success('창고가 삭제되었습니다.');
      fetchWarehouses();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '창고 삭제에 실패했습니다.');
    }
  };

  const handleViewInventory = async (warehouse: Warehouse) => {
    try {
      const data = await warehouseService.getWarehouseInventory(warehouse.id);
      setSelectedWarehouseInventory(data);
      setInventoryModalVisible(true);
    } catch (error: any) {
      message.error(error.response?.data?.detail || '재고 조회에 실패했습니다.');
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      if (editingWarehouse) {
        const updateData: WarehouseUpdate = {
          warehouse_code: values.warehouse_code,
          name: values.name,
          location: values.location,
          is_active: values.is_active,
          description: values.description,
        };
        await warehouseService.updateWarehouse(editingWarehouse.id, updateData);
        if (imageFile) {
          await warehouseService.uploadImage(editingWarehouse.id, imageFile);
        }
        message.success('창고가 수정되었습니다.');
      } else {
        const createData: WarehouseCreate = {
          warehouse_code: values.warehouse_code,
          name: values.name,
          location: values.location,
          is_active: values.is_active ?? true,
          description: values.description,
        };
        const newWarehouse = await warehouseService.createWarehouse(createData);
        if (imageFile) {
          await warehouseService.uploadImage(newWarehouse.id, imageFile);
        }
        message.success('창고가 등록되었습니다.');
      }
      setModalVisible(false);
      form.resetFields();
      setImageFile(null);
      setImagePreview('');
      fetchWarehouses();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '작업에 실패했습니다.');
    }
  };

  const handleImageChange = (info: any) => {
    const file = info.file.originFileObj || info.file;
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const inventoryColumns: ColumnsType<any> = [
    {
      title: '상품 이미지',
      key: 'image',
      width: 90,
      render: (_, record) => {
        const imagePath = record.brand && record.product_code
          ? getFileUrl(`/uploads/products/${record.brand}/${record.product_code}.png`)
          : null;

        if (imagePath) {
          return (
            <img
              src={imagePath}
              alt={record.product_name}
              style={{
                width: 60,
                height: 60,
                objectFit: 'cover',
                borderRadius: '4px',
                border: '1px solid #f0f0f0',
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          );
        }
        return <span style={{ color: '#ccc' }}>-</span>;
      },
    },
    {
      title: '상품코드',
      dataIndex: 'product_code',
      key: 'product_code',
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
      title: '카테고리',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (category: string) => {
        const categoryMap: Record<string, string> = {
          'clothing': '👕 의류',
          'shoes': '👟 신발',
          'hats': '🧢 모자',
          'socks': '🧦 양말',
          'bags': '🎒 가방',
          'accessories': '🛍️ 잡화',
          'etc': '📦 기타'
        };
        return categoryMap[category] || category || '-';
      },
    },
    {
      title: '사이즈별 재고 수량',
      key: 'inventory',
      width: 500,
      render: (_, record) => {
        // 카테고리별 고정 사이즈 정의
        const fixedSizes = record.category === 'shoes'
          ? ['220', '225', '230', '235', '240', '245', '250', '255', '260', '265', '270', '275', '280', '285', '290', '295', '300', '305', '310', '315']
          : ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

        // 사이즈별 수량 맵 생성
        const sizeMap = new Map();
        record.sizes?.forEach((sizeInfo: any) => {
          sizeMap.set(sizeInfo.size, sizeInfo.quantity);
        });

        // 신발은 10개씩 2행, 의류는 모두 1행
        const firstRow = record.category === 'shoes' ? fixedSizes.slice(0, 10) : fixedSizes;
        const secondRow = record.category === 'shoes' ? fixedSizes.slice(10) : [];

        const renderRow = (sizes: string[]) => (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4px' }}>
            <tbody>
              <tr>
                {sizes.map((size: string, index: number) => (
                  <td key={`size-${index}`} style={{
                    border: '1px solid #f0f0f0',
                    padding: '2px 4px',
                    textAlign: 'center',
                    fontSize: '11px',
                    backgroundColor: '#fafafa',
                    fontWeight: 500,
                    width: `${100 / sizes.length}%`
                  }}>
                    {size}
                  </td>
                ))}
              </tr>
              <tr>
                {sizes.map((size: string, index: number) => {
                  const qty = sizeMap.get(size) || 0;
                  return (
                    <td key={`qty-${index}`} style={{
                      border: '1px solid #f0f0f0',
                      padding: '2px 4px',
                      textAlign: 'center',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: qty > 0 ? '#1890ff' : '#d9d9d9',
                      width: `${100 / sizes.length}%`
                    }}>
                      {qty.toLocaleString()}개
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        );

        return (
          <div>
            {renderRow(firstRow)}
            {secondRow.length > 0 && renderRow(secondRow)}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Space size="middle">
            <Search
              placeholder="창고명, 코드, 위치 검색"
              allowClear
              style={{ width: 300 }}
                    size="large"
              onSearch={(value) => {
                setFilters({ ...filters, search: value });
                setPagination({ ...pagination, current: 1 });
              }}
            />
            <Select
              placeholder="상태"
              allowClear
              style={{ width: 120 }}
              onChange={(value) => {
                setFilters({ ...filters, is_active: value });
                setPagination({ ...pagination, current: 1 });
              }}
            >
              <Option value={true}>활성</Option>
              <Option value={false}>비활성</Option>
            </Select>
          </Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            창고 등록
          </Button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>로딩 중...</div>
        ) : warehouses.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
            등록된 창고가 없습니다.
          </div>
        ) : (
          <>
            <Row gutter={[16, 16]}>
              {warehouses.map((warehouse) => (
                <Col span={8} key={warehouse.id}>
                  <Card
                    hoverable
                    style={{ height: '100%' }}
                    actions={[
                      <Button
                        key="inventory"
                        type="link"
                        size="small"
                        icon={<InboxOutlined />}
                        onClick={() => handleViewInventory(warehouse)}
                      >
                        재고 보기
                      </Button>,
                      <Button
                        key="edit"
                        type="link"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(warehouse)}
                      >
                        수정
                      </Button>,
                      <Popconfirm
                        key="delete"
                        title="창고 삭제"
                        description="정말 이 창고를 삭제하시겠습니까?"
                        onConfirm={() => handleDelete(warehouse.id)}
                        okText="삭제"
                        cancelText="취소"
                      >
                        <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                          삭제
                        </Button>
                      </Popconfirm>,
                    ]}
                  >
                    <div style={{ display: 'flex', gap: 16 }}>
                      <div style={{ flexShrink: 0 }}>
                        {warehouse.image_url ? (
                          <Image
                            src={getFileUrl(warehouse.image_url) || ''}
                            alt={warehouse.name}
                            width={120}
                            height={120}
                            style={{ objectFit: 'cover', borderRadius: 8 }}
                          />
                        ) : (
                          <div style={{
                            width: 120,
                            height: 120,
                            backgroundColor: '#f0f0f0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 8,
                            color: '#8c8c8c',
                            fontSize: 12
                          }}>
                            이미지 없음
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ marginBottom: 8 }}>
                          <Tag color="blue">{warehouse.warehouse_code}</Tag>
                          <Tag color={warehouse.is_active ? 'green' : 'red'}>
                            {warehouse.is_active ? '활성' : '비활성'}
                          </Tag>
                        </div>
                        <div style={{ marginBottom: 4 }}>
                          <strong style={{ fontSize: 16 }}>{warehouse.name}</strong>
                        </div>
                        {warehouse.location && (
                          <div style={{ color: '#666', marginBottom: 4 }}>
                            위치: {warehouse.location}
                          </div>
                        )}
                        {warehouse.description && (
                          <div style={{ color: '#999', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {warehouse.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>

            {total > pagination.pageSize && (
              <div style={{ marginTop: 16, textAlign: 'right' }}>
                <Space>
                  <span>총 {total}개</span>
                  <Select
                    value={pagination.pageSize}
                    onChange={(value) => {
                      setPagination({ ...pagination, pageSize: value, current: 1 });
                    }}
                    style={{ width: 100 }}
                  >
                    <Option value={10}>10개씩</Option>
                    <Option value={20}>20개씩</Option>
                    <Option value={50}>50개씩</Option>
                  </Select>
                  <Button
                    disabled={pagination.current === 1}
                    onClick={() => setPagination({ ...pagination, current: pagination.current - 1 })}
                  >
                    이전
                  </Button>
                  <span>{pagination.current} / {Math.ceil(total / pagination.pageSize)}</span>
                  <Button
                    disabled={pagination.current >= Math.ceil(total / pagination.pageSize)}
                    onClick={() => setPagination({ ...pagination, current: pagination.current + 1 })}
                  >
                    다음
                  </Button>
                </Space>
              </div>
            )}
          </>
        )}
      </Card>

      <Modal
        title={editingWarehouse ? '창고 수정' : '창고 등록'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
          setImageFile(null);
          setImagePreview('');
        }}
        onOk={() => form.submit()}
        okText={editingWarehouse ? '수정' : '등록'}
        cancelText="취소"
        width={600}
        style={{ top: 20 }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ is_active: true }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="창고 코드"
                name="warehouse_code"
                rules={[{ required: true, message: '창고 코드를 입력해주세요.' }]}
                extra="자동 생성된 코드를 사용하거나 직접 입력할 수 있습니다."
              >
                <Input placeholder="예: WH001" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="창고명"
                name="name"
                rules={[{ required: true, message: '창고명을 입력해주세요.' }]}
              >
                <Input placeholder="예: 본사 창고" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="창고 위치" name="location">
                <Input placeholder="예: 1층, A구역" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="활성 상태" name="is_active" valuePropName="checked">
                <Switch checkedChildren="활성" unCheckedChildren="비활성" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="창고 사진">
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {imagePreview && (
                <div style={{ textAlign: 'center' }}>
                  <img
                    src={imagePreview}
                    alt="preview"
                    style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8 }}
                  />
                </div>
              )}
              <Space>
                <Upload
                  beforeUpload={() => false}
                  onChange={handleImageChange}
                  showUploadList={false}
                  accept="image/*"
                >
                  <Button icon={<UploadOutlined />} style={{ width: 120 }}>
                    {imagePreview ? '이미지 변경' : '이미지 업로드'}
                  </Button>
                </Upload>
                {imagePreview && (
                  <Button
                    danger
                    onClick={() => {
                      setImagePreview('');
                      setImageFile(null);
                    }}
                    style={{ width: 120 }}
                  >
                    이미지 제거
                  </Button>
                )}
              </Space>
            </Space>
          </Form.Item>

          <Form.Item label="설명/메모" name="description">
            <TextArea rows={3} placeholder="창고에 대한 설명이나 메모를 입력하세요." />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <div>
            <span style={{ fontSize: 18, fontWeight: 700 }}>
              {selectedWarehouseInventory ? `${selectedWarehouseInventory.warehouse.name} 재고 현황` : '재고 현황'}
            </span>
            <div style={{ borderBottom: '2px solid #1890ff', marginTop: 12, marginLeft: -24, marginRight: -24 }} />
          </div>
        }
        open={inventoryModalVisible}
        onCancel={() => {
          setInventoryModalVisible(false);
          setSelectedWarehouseInventory(null);
          setInventorySearch('');
        }}
        footer={null}
        width={1400}
        style={{ top: 20 }}
      >
        {selectedWarehouseInventory && (
          <div>
            <Row gutter={16} style={{ marginBottom: 16, marginTop: 16 }}>
              <Col span={18}>
                <div style={{ marginBottom: 16 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #f0f0f0' }}>
                    <tbody>
                      <tr>
                        <td style={{
                          width: '16.66%',
                          padding: '10px 12px',
                          fontWeight: 500,
                          backgroundColor: '#fafafa',
                          border: '1px solid #f0f0f0',
                          textAlign: 'center'
                        }}>
                          창고 코드
                        </td>
                        <td style={{
                          width: '16.67%',
                          padding: '10px 12px',
                          border: '1px solid #f0f0f0',
                          textAlign: 'center'
                        }}>
                          <Tag color="blue">{selectedWarehouseInventory.warehouse.warehouse_code}</Tag>
                        </td>
                        <td style={{
                          width: '16.66%',
                          padding: '10px 12px',
                          fontWeight: 500,
                          backgroundColor: '#fafafa',
                          border: '1px solid #f0f0f0',
                          textAlign: 'center'
                        }}>
                          창고명
                        </td>
                        <td style={{
                          width: '16.67%',
                          padding: '10px 12px',
                          border: '1px solid #f0f0f0',
                          textAlign: 'center'
                        }}>
                          {selectedWarehouseInventory.warehouse.name}
                        </td>
                        <td style={{
                          width: '16.66%',
                          padding: '10px 12px',
                          fontWeight: 500,
                          backgroundColor: '#fafafa',
                          border: '1px solid #f0f0f0',
                          textAlign: 'center'
                        }}>
                          위치
                        </td>
                        <td style={{
                          width: '16.67%',
                          padding: '10px 12px',
                          border: '1px solid #f0f0f0',
                          textAlign: 'center'
                        }}>
                          {selectedWarehouseInventory.warehouse.location || '-'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div>
                  <Search
                    placeholder="상품명, 상품코드로 검색"
                    allowClear
                    style={{ width: 300 }}
                    size="large"
                    onChange={(e) => setInventorySearch(e.target.value)}
                    value={inventorySearch}
                  />
                </div>
              </Col>
              <Col span={6}>
                {(() => {
                  const warehouse = warehouses.find(w => w.id === selectedWarehouseInventory.warehouse.id);
                  const imageUrl = warehouse?.image_url ? getFileUrl(warehouse.image_url) : null;

                  return imageUrl ? (
                    <Image
                      src={imageUrl}
                      alt={selectedWarehouseInventory.warehouse.name}
                      width="100%"
                      height={120}
                      style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid #f0f0f0' }}
                      preview={true}
                    />
                  ) : (
                    <div style={{
                      width: '100%',
                      height: 120,
                      backgroundColor: '#f0f0f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 8,
                      color: '#8c8c8c',
                      fontSize: 12
                    }}>
                      이미지 없음
                    </div>
                  );
                })()}
              </Col>
            </Row>
            <Table
              columns={inventoryColumns}
              dataSource={selectedWarehouseInventory.inventory.filter((item: any) => {
                if (!inventorySearch) return true;
                const search = inventorySearch.toLowerCase();
                return (
                  item.product_name?.toLowerCase().includes(search) ||
                  item.product_code?.toLowerCase().includes(search)
                );
              })}
              rowKey="product_id"
              pagination={{ pageSize: 5, showSizeChanger: true, pageSizeOptions: ['5', '10', '20', '50'], showTotal: (total) => `총 ${total}개` }}
              size="small"
              locale={{ emptyText: '재고가 없습니다.' }}
              scroll={{ y: 500 }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default WarehouseListPage;
