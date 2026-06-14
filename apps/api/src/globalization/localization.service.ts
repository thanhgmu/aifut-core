import { Injectable, OnModuleInit } from '@nestjs/common';
import { SUPPORTED_LOCALES, Locale } from './localization.types';

type TranslationMap = Record<string, Record<Locale, string>>;

@Injectable()
export class LocalizationService implements OnModuleInit {
  private translations: TranslationMap = {};

  async onModuleInit() {
    // Load core translations
    this.loadDefaultTranslations();
  }

  /** Get translation with fallback */
  translate(key: string, locale: Locale, fallback?: string): string {
    const entry = this.translations[key];
    if (!entry) return fallback ?? key;
    return entry[locale] ?? entry['en'] ?? key;
  }

  /** Get all translations for a locale */
  getAll(locale: Locale): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, entry] of Object.entries(this.translations)) {
      result[key] = entry[locale] ?? entry['en'] ?? key;
    }
    return result;
  }

  /** Get supported locale list */
  getSupportedLocales() {
    return SUPPORTED_LOCALES.map((code) => ({
      code,
      name: this.translate('locale.name', code, code),
    }));
  }

  private loadDefaultTranslations() {
    this.translations = {
      // ── Navigation ──────────────────────────────────────────────────────────
      'nav.dashboard':     { vi: 'Bảng điều khiển', en: 'Dashboard', th: 'แผงควบคุม', id: 'Dasbor', ms: 'Papan Pemuka', fil: 'Dashboard', zh: '仪表板' },
      'nav.workflows':     { vi: 'Quy trình', en: 'Workflows', th: 'ขั้นตอนการทำงาน', id: 'Alur Kerja', ms: 'Aliran Kerja', fil: 'Workflows', zh: '工作流程' },
      'nav.connectors':    { vi: 'Kết nối', en: 'Connectors', th: 'ตัวเชื่อมต่อ', id: 'Konektor', ms: 'Penyambung', fil: 'Connectors', zh: '连接器' },
      'nav.backups':       { vi: 'Sao lưu', en: 'Backups', th: 'สำรองข้อมูล', id: 'Cadangan', ms: 'Sandaran', fil: 'Backups', zh: '备份' },
      'nav.billing':       { vi: 'Thanh toán', en: 'Billing', th: 'การเรียกเก็บเงิน', id: 'Penagihan', ms: 'Pengebilan', fil: 'Billing', zh: '账单' },
      'nav.marketplace':   { vi: 'Chợ ứng dụng', en: 'Marketplace', th: 'ตลาด', id: 'Marketplace', ms: 'Pasaran', fil: 'Marketplace', zh: '市场' },
      'nav.settings':      { vi: 'Cài đặt', en: 'Settings', th: 'การตั้งค่า', id: 'Pengaturan', ms: 'Tetapan', fil: 'Settings', zh: '设置' },

      // ── Common actions ──────────────────────────────────────────────────────
      'common.save':       { vi: 'Lưu', en: 'Save', th: 'บันทึก', id: 'Simpan', ms: 'Simpan', fil: 'I-save', zh: '保存' },
      'common.cancel':     { vi: 'Hủy', en: 'Cancel', th: 'ยกเลิก', id: 'Batal', ms: 'Batal', fil: 'Kanselahin', zh: '取消' },
      'common.delete':     { vi: 'Xóa', en: 'Delete', th: 'ลบ', id: 'Hapus', ms: 'Padam', fil: 'Tanggalin', zh: '删除' },
      'common.edit':       { vi: 'Sửa', en: 'Edit', th: 'แก้ไข', id: 'Edit', ms: 'Sunting', fil: 'I-edit', zh: '编辑' },
      'common.create':     { vi: 'Tạo mới', en: 'Create', th: 'สร้าง', id: 'Buat', ms: 'Cipta', fil: 'Lumikha', zh: '创建' },
      'common.search':     { vi: 'Tìm kiếm', en: 'Search', th: 'ค้นหา', id: 'Cari', ms: 'Cari', fil: 'Maghanap', zh: '搜索' },
      'common.confirm':    { vi: 'Xác nhận', en: 'Confirm', th: 'ยืนยัน', id: 'Konfirmasi', ms: 'Sahkan', fil: 'Kumpirmahin', zh: '确认' },

      // ── Workflow ────────────────────────────────────────────────────────────
      'workflow.status.active':   { vi: 'Đang chạy', en: 'Active', th: 'กำลังทำงาน', id: 'Aktif', ms: 'Aktif', fil: 'Aktibo', zh: '活跃' },
      'workflow.status.draft':    { vi: 'Bản nháp', en: 'Draft', th: 'ร่าง', id: 'Draf', ms: 'Draf', fil: 'Draft', zh: '草稿' },
      'workflow.status.paused':   { vi: 'Tạm dừng', en: 'Paused', th: 'หยุดชั่วคราว', id: 'Dihentikan', ms: 'Dijeda', fil: 'Naka-pause', zh: '暂停' },
      'workflow.exec.completed':  { vi: 'Hoàn thành', en: 'Completed', th: 'เสร็จสมบูรณ์', id: 'Selesai', ms: 'Selesai', fil: 'Tapos', zh: '完成' },
      'workflow.exec.failed':     { vi: 'Thất bại', en: 'Failed', th: 'ล้มเหลว', id: 'Gagal', ms: 'Gagal', fil: 'Nabigo', zh: '失败' },
      'workflow.exec.running':    { vi: 'Đang chạy', en: 'Running', th: 'กำลังทำงาน', id: 'Berjalan', ms: 'Berjalan', fil: 'Tumatakbo', zh: '运行中' },
      'workflow.trigger.manual':  { vi: 'Thủ công', en: 'Manual', th: 'ด้วยตนเอง', id: 'Manual', ms: 'Manual', fil: 'Manual', zh: '手动' },

      // ── Billing & Plans ─────────────────────────────────────────────────────
      'plan.free':         { vi: 'Miễn phí', en: 'Free', th: 'ฟรี', id: 'Gratis', ms: 'Percuma', fil: 'Libre', zh: '免费' },
      'plan.starter':      { vi: 'Cơ bản', en: 'Starter', th: 'เริ่มต้น', id: 'Pemula', ms: 'Permula', fil: 'Panimula', zh: '起步' },
      'plan.pro':          { vi: 'Chuyên nghiệp', en: 'Pro', th: 'มืออาชีพ', id: 'Pro', ms: 'Pro', fil: 'Pro', zh: '专业' },
      'plan.team':         { vi: 'Doanh nghiệp', en: 'Team', th: 'ทีม', id: 'Tim', ms: 'Pasukan', fil: 'Team', zh: '团队' },
      'plan.monthly':      { vi: 'Tháng', en: 'Monthly', th: 'รายเดือน', id: 'Bulanan', ms: 'Bulanan', fil: 'Buwanan', zh: '月度' },
      'plan.yearly':       { vi: 'Năm', en: 'Yearly', th: 'รายปี', id: 'Tahunan', ms: 'Tahunan', fil: 'Taunan', zh: '年度' },

      // ── Status & Errors ─────────────────────────────────────────────────────
      'status.success':    { vi: 'Thành công', en: 'Success', th: 'สำเร็จ', id: 'Sukses', ms: 'Berjaya', fil: 'Tagumpay', zh: '成功' },
      'status.error':      { vi: 'Lỗi', en: 'Error', th: 'ข้อผิดพลาด', id: 'Kesalahan', ms: 'Ralat', fil: 'Error', zh: '错误' },
      'status.loading':    { vi: 'Đang tải...', en: 'Loading...', th: 'กำลังโหลด...', id: 'Memuat...', ms: 'Memuatkan...', fil: 'Naglo-load...', zh: '加载中...' },

      // ── Locale names (self-referential) ─────────────────────────────────────
      'locale.name':       { vi: 'Tiếng Việt', en: 'English', th: 'ไทย', id: 'Bahasa Indonesia', ms: 'Bahasa Melayu', fil: 'Filipino', zh: '中文' },
    };
  }
}
