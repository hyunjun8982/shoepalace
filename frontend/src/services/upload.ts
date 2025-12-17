import api from './api';

export const uploadService = {
  // 영수증 업로드
  async uploadReceipt(file: File): Promise<{ file_url: string; file_name: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/uploads/receipt', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // 영수증 삭제
  async deleteReceipt(fileUrl: string): Promise<void> {
    await api.delete('/uploads/receipt', { params: { file_url: fileUrl } });
  },
};