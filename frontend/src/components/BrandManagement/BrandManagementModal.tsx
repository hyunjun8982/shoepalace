import React, { useState, useEffect } from 'react';
import {
  Modal,
  Table,
  Button,
  Space,
  Form,
  Input,
  Upload,
  App,
  Popconfirm,
  Image,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { brandService, Brand } from '../../services/brand';
import { getBrandIconUrl } from '../../utils/imageUtils';

const { TextArea } = Input;

interface BrandManagementModalProps {
  visible: boolean;
  onClose: () => void;
  onBrandUpdate: () => void;
}

const BrandManagementModal: React.FC<BrandManagementModalProps> = ({
  visible,
  onClose,
  onBrandUpdate,
}) => {
  const { message } = App.useApp();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [form] = Form.useForm();
  const [createForm] = Form.useForm();
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string>('');
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createIconFile, setCreateIconFile] = useState<File | null>(null);
  const [createIconPreview, setCreateIconPreview] = useState<string>('');

  useEffect(() => {
    if (visible) {
      fetchBrands();
    }
  }, [visible]);

  const fetchBrands = async () => {
    try {
      setLoading(true);
      const response = await brandService.getBrands();
      setBrands(response.items);
    } catch (error) {
      message.error('브랜드 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };


  const handleCreate = () => {
    setCreateModalVisible(true);
  };

  const handleCreateSubmit = async (values: any) => {
    try {
      await brandService.createBrand(
        values.name,
        values.description || null,
        createIconFile
      );
      message.success('브랜드가 생성되었습니다.');
      setCreateModalVisible(false);
      createForm.resetFields();
      setCreateIconFile(null);
      setCreateIconPreview('');
      fetchBrands();
      onBrandUpdate();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '브랜드 생성에 실패했습니다.');
    }
  };

  const handleCreateIconChange = (info: any) => {
    const file = info.file.originFileObj || info.file;
    if (!file) return;

    setCreateIconFile(file);

    // 미리보기
    const reader = new FileReader();
    reader.onload = (e) => {
      setCreateIconPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleEdit = (brand: Brand) => {
    setEditingBrand(brand);
    form.setFieldsValue({
      name: brand.name,
      description: brand.description || '',
    });
    setIconPreview(getBrandIconUrl(brand.icon_url) || '');
    setEditModalVisible(true);
  };

  const handleDelete = async (brandId: string) => {
    try {
      await brandService.deleteBrand(brandId);
      message.success('브랜드가 삭제되었습니다.');
      fetchBrands();
      onBrandUpdate();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '브랜드 삭제에 실패했습니다.');
    }
  };

  const handleEditSubmit = async (values: any) => {
    if (!editingBrand) return;

    try {
      await brandService.updateBrand(
        editingBrand.id,
        values.name,
        values.description || null,
        iconFile
      );
      message.success('브랜드가 수정되었습니다.');
      setEditModalVisible(false);
      form.resetFields();
      setIconFile(null);
      setIconPreview('');
      setEditingBrand(null);
      fetchBrands();
      onBrandUpdate();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '브랜드 수정에 실패했습니다.');
    }
  };

  const handleIconChange = (info: any) => {
    const file = info.file.originFileObj || info.file;
    if (!file) return;

    setIconFile(file);

    // 미리보기
    const reader = new FileReader();
    reader.onload = (e) => {
      setIconPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const columns: ColumnsType<Brand> = [
    {
      title: '로고',
      key: 'icon',
      width: 80,
      render: (_, record) => {
        const iconUrl = getBrandIconUrl(record.icon_url);
        return iconUrl ? (
          <Image
            src={iconUrl}
            alt={record.name}
            width={40}
            height={40}
            style={{ objectFit: 'contain' }}
          />
        ) : (
          <span style={{ color: '#8c8c8c' }}>없음</span>
        );
      },
    },
    {
      title: '브랜드명',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '설명',
      dataIndex: 'description',
      key: 'description',
      render: (text) => text || '-',
    },
    {
      title: '작업',
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            수정
          </Button>
          <Popconfirm
            title="브랜드 삭제"
            description="정말 이 브랜드를 삭제하시겠습니까?"
            onConfirm={() => handleDelete(record.id)}
            okText="삭제"
            cancelText="취소"
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
            >
              삭제
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Modal
        title="브랜드 관리"
        open={visible}
        onCancel={onClose}
        footer={[
          <Button key="create" type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            브랜드 추가
          </Button>,
          <Button key="close" onClick={onClose}>
            닫기
          </Button>,
        ]}
        width={800}
        style={{ top: 20 }}
      >
        <Table
          columns={columns}
          dataSource={brands}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Modal>

      {/* 브랜드 수정 모달 */}
      <Modal
        title="브랜드 수정"
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false);
          form.resetFields();
          setIconFile(null);
          setIconPreview('');
          setEditingBrand(null);
        }}
        onOk={() => form.submit()}
        okText="수정"
        cancelText="취소"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleEditSubmit}
        >
          <Form.Item
            label="브랜드명"
            name="name"
            rules={[{ required: true, message: '브랜드명을 입력해주세요.' }]}
          >
            <Input placeholder="예: Nike" />
          </Form.Item>

          <Form.Item label="설명" name="description">
            <TextArea rows={3} placeholder="브랜드 설명 (선택사항)" />
          </Form.Item>

          <Form.Item label="로고 이미지">
            <Upload
              listType="picture-card"
              showUploadList={false}
              beforeUpload={() => false}
              onChange={handleIconChange}
              accept="image/*"
            >
              {iconPreview ? (
                <img
                  src={iconPreview}
                  alt="brand-icon"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : (
                <div>
                  <PlusOutlined />
                  <div style={{ marginTop: 8 }}>로고 업로드</div>
                </div>
              )}
            </Upload>
            {iconPreview && (
              <Button
                danger
                size="small"
                onClick={() => {
                  setIconPreview('');
                  setIconFile(null);
                }}
                style={{ marginTop: 8 }}
              >
                이미지 제거
              </Button>
            )}
          </Form.Item>
        </Form>
      </Modal>

      {/* 브랜드 생성 모달 */}
      <Modal
        title="새 브랜드 추가"
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false);
          createForm.resetFields();
          setCreateIconFile(null);
          setCreateIconPreview('');
        }}
        onOk={() => createForm.submit()}
        okText="추가"
        cancelText="취소"
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreateSubmit}
        >
          <Form.Item
            label="브랜드명"
            name="name"
            rules={[{ required: true, message: '브랜드명을 입력해주세요.' }]}
          >
            <Input placeholder="예: Nike" />
          </Form.Item>

          <Form.Item label="설명" name="description">
            <TextArea rows={3} placeholder="브랜드 설명 (선택사항)" />
          </Form.Item>

          <Form.Item label="로고 이미지">
            <Upload
              listType="picture-card"
              showUploadList={false}
              beforeUpload={() => false}
              onChange={handleCreateIconChange}
              accept="image/*"
            >
              {createIconPreview ? (
                <img
                  src={createIconPreview}
                  alt="brand-icon"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : (
                <div>
                  <PlusOutlined />
                  <div style={{ marginTop: 8 }}>로고 업로드</div>
                </div>
              )}
            </Upload>
            {createIconPreview && (
              <Button
                danger
                size="small"
                onClick={() => {
                  setCreateIconPreview('');
                  setCreateIconFile(null);
                }}
                style={{ marginTop: 8 }}
              >
                이미지 제거
              </Button>
            )}
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default BrandManagementModal;
