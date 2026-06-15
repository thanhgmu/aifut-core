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
      // ── Navigation ──────────────────────────────────────────────────────
      'nav.dashboard':     { vi:'Bảng điều khiển', en:'Dashboard', th:'แผงควบคุม', id:'Dasbor', ms:'Papan Pemuka', fil:'Dashboard', zh:'仪表板' },
      'nav.workflows':     { vi:'Quy trình', en:'Workflows', th:'ขั้นตอนการทำงาน', id:'Alur Kerja', ms:'Aliran Kerja', fil:'Workflows', zh:'工作流程' },
      'nav.connectors':    { vi:'Kết nối', en:'Connectors', th:'ตัวเชื่อมต่อ', id:'Konektor', ms:'Penyambung', fil:'Connectors', zh:'连接器' },
      'nav.backups':       { vi:'Sao lưu', en:'Backups', th:'สำรองข้อมูล', id:'Cadangan', ms:'Sandaran', fil:'Backups', zh:'备份' },
      'nav.billing':       { vi:'Thanh toán', en:'Billing', th:'การเรียกเก็บเงิน', id:'Penagihan', ms:'Pengebilan', fil:'Billing', zh:'账单' },
      'nav.marketplace':   { vi:'Chợ ứng dụng', en:'Marketplace', th:'ตลาด', id:'Marketplace', ms:'Pasaran', fil:'Marketplace', zh:'市场' },
      'nav.settings':      { vi:'Cài đặt', en:'Settings', th:'การตั้งค่า', id:'Pengaturan', ms:'Tetapan', fil:'Settings', zh:'设置' },
      'nav.templates':     { vi:'Mẫu quy trình', en:'Templates', th:'แม่แบบ', id:'Templat', ms:'Templat', fil:'Template', zh:'模板' },
      'nav.roi':           { vi:'Tính ROI', en:'ROI Calc', th:'คำนวณ ROI', id:'Kalkulator ROI', ms:'Kalkulator ROI', fil:'ROI Calculator', zh:'ROI计算' },
      'nav.playground':    { vi:'AWL Playground', en:'Playground', th:'สนามทดสอบ', id:'Playground', ms:'Playground', fil:'Playground', zh:'游乐场' },
      'nav.developers':    { vi:'Nhà phát triển', en:'Developers', th:'นักพัฒนา', id:'Pengembang', ms:'Pembangun', fil:'Developers', zh:'开发者' },

      // ── Common actions ──────────────────────────────────────────────────
      'common.save':       { vi:'Lưu', en:'Save', th:'บันทึก', id:'Simpan', ms:'Simpan', fil:'I-save', zh:'保存' },
      'common.cancel':     { vi:'Hủy', en:'Cancel', th:'ยกเลิก', id:'Batal', ms:'Batal', fil:'Kanselahin', zh:'取消' },
      'common.delete':     { vi:'Xóa', en:'Delete', th:'ลบ', id:'Hapus', ms:'Padam', fil:'Tanggalin', zh:'删除' },
      'common.edit':       { vi:'Sửa', en:'Edit', th:'แก้ไข', id:'Edit', ms:'Sunting', fil:'I-edit', zh:'编辑' },
      'common.create':     { vi:'Tạo mới', en:'Create', th:'สร้าง', id:'Buat', ms:'Cipta', fil:'Lumikha', zh:'创建' },
      'common.search':     { vi:'Tìm kiếm', en:'Search', th:'ค้นหา', id:'Cari', ms:'Cari', fil:'Maghanap', zh:'搜索' },
      'common.confirm':    { vi:'Xác nhận', en:'Confirm', th:'ยืนยัน', id:'Konfirmasi', ms:'Sahkan', fil:'Kumpirmahin', zh:'确认' },
      'common.duplicate':  { vi:'Nhân bản', en:'Duplicate', th:'ทำสำเนา', id:'Duplikat', ms:'Duplikat', fil:'Kopyahin', zh:'复制' },
      'common.export':     { vi:'Xuất', en:'Export', th:'ส่งออก', id:'Ekspor', ms:'Eksport', fil:'I-export', zh:'导出' },
      'common.import':     { vi:'Nhập', en:'Import', th:'นำเข้า', id:'Impor', ms:'Import', fil:'I-import', zh:'导入' },
      'common.filter':     { vi:'Lọc', en:'Filter', th:'กรอง', id:'Filter', ms:'Tapis', fil:'I-filter', zh:'筛选' },
      'common.refresh':    { vi:'Làm mới', en:'Refresh', th:'รีเฟรช', id:'Segarkan', ms:'Segar semula', fil:'I-refresh', zh:'刷新' },
      'common.viewAll':    { vi:'Xem tất cả', en:'View all', th:'ดูทั้งหมด', id:'Lihat semua', ms:'Lihat semua', fil:'Tingnan lahat', zh:'查看全部' },
      'common.noData':     { vi:'Không có dữ liệu', en:'No data', th:'ไม่มีข้อมูล', id:'Tidak ada data', ms:'Tiada data', fil:'Walang data', zh:'无数据' },

      // ── Workflow ────────────────────────────────────────────────────────
      'workflow.status.active':   { vi:'Đang chạy', en:'Active', th:'กำลังทำงาน', id:'Aktif', ms:'Aktif', fil:'Aktibo', zh:'活跃' },
      'workflow.status.draft':    { vi:'Bản nháp', en:'Draft', th:'ร่าง', id:'Draf', ms:'Draf', fil:'Draft', zh:'草稿' },
      'workflow.status.paused':   { vi:'Tạm dừng', en:'Paused', th:'หยุดชั่วคราว', id:'Dihentikan', ms:'Dijeda', fil:'Naka-pause', zh:'暂停' },
      'workflow.status.disabled': { vi:'Đã tắt', en:'Disabled', th:'ปิดใช้งาน', id:'Dinonaktifkan', ms:'Dilumpuhkan', fil:'Naka-disable', zh:'已禁用' },
      'workflow.status.archived': { vi:'Đã lưu trữ', en:'Archived', th:'เก็บถาวร', id:'Diarsipkan', ms:'Diarkibkan', fil:'Naka-archive', zh:'已归档' },
      'workflow.exec.completed':  { vi:'Hoàn thành', en:'Completed', th:'เสร็จสมบูรณ์', id:'Selesai', ms:'Selesai', fil:'Tapos', zh:'完成' },
      'workflow.exec.failed':     { vi:'Thất bại', en:'Failed', th:'ล้มเหลว', id:'Gagal', ms:'Gagal', fil:'Nabigo', zh:'失败' },
      'workflow.exec.running':    { vi:'Đang chạy', en:'Running', th:'กำลังทำงาน', id:'Berjalan', ms:'Berjalan', fil:'Tumatakbo', zh:'运行中' },
      'workflow.exec.pending':    { vi:'Chờ xử lý', en:'Pending', th:'รอดำเนินการ', id:'Tertunda', ms:'Tertunda', fil:'Nakabinbin', zh:'待处理' },
      'workflow.exec.cancelled':  { vi:'Đã hủy', en:'Cancelled', th:'ยกเลิก', id:'Dibatalkan', ms:'Dibatalkan', fil:'Kinansela', zh:'已取消' },
      'workflow.trigger.manual':  { vi:'Thủ công', en:'Manual', th:'ด้วยตนเอง', id:'Manual', ms:'Manual', fil:'Manual', zh:'手动' },
      'workflow.trigger.schedule':{ vi:'Lịch trình', en:'Schedule', th:'กำหนดการ', id:'Jadwal', ms:'Jadual', fil:'Iskedyul', zh:'定时' },
      'workflow.trigger.webhook': { vi:'Webhook', en:'Webhook', th:'เว็บฮุค', id:'Webhook', ms:'Webhook', fil:'Webhook', zh:'Webhook' },
      'workflow.trigger.event':   { vi:'Sự kiện', en:'Event', th:'เหตุการณ์', id:'Acara', ms:'Acara', fil:'Evento', zh:'事件' },
      'workflow.step.action':     { vi:'Hành động', en:'Action', th:'ดำเนินการ', id:'Aksi', ms:'Tindakan', fil:'Aksyon', zh:'动作' },
      'workflow.step.send':       { vi:'Gửi', en:'Send', th:'ส่ง', id:'Kirim', ms:'Hantar', fil:'Ipadala', zh:'发送' },
      'workflow.step.condition':  { vi:'Điều kiện', en:'Condition', th:'เงื่อนไข', id:'Kondisi', ms:'Syarat', fil:'Kundisyon', zh:'条件' },
      'workflow.step.wait':       { vi:'Chờ', en:'Wait', th:'รอ', id:'Tunggu', ms:'Tunggu', fil:'Maghintay', zh:'等待' },
      'workflow.step.transform':  { vi:'Chuyển đổi', en:'Transform', th:'แปลง', id:'Transformasi', ms:'Transformasi', fil:'I-transform', zh:'转换' },

      // ── Connector ───────────────────────────────────────────────────────
      'connector.status.active':  { vi:'Đang kết nối', en:'Active', th:'เชื่อมต่ออยู่', id:'Terhubung', ms:'Bersambung', fil:'Konektado', zh:'已连接' },
      'connector.status.error':   { vi:'Lỗi', en:'Error', th:'ข้อผิดพลาด', id:'Error', ms:'Ralat', fil:'Error', zh:'错误' },
      'connector.status.pending': { vi:'Đang chờ', en:'Pending', th:'รอ', id:'Menunggu', ms:'Menunggu', fil:'Nakabinbin', zh:'待连接' },
      'connector.status.disabled':{ vi:'Đã ngắt', en:'Disabled', th:'ปิดใช้งาน', id:'Nonaktif', ms:'Dilumpuhkan', fil:'Naka-disable', zh:'已断开' },
      'connector.verify':         { vi:'Kiểm tra kết nối', en:'Verify', th:'ตรวจสอบ', id:'Verifikasi', ms:'Sahkan', fil:'I-verify', zh:'验证连接' },
      'connector.configure':      { vi:'Cấu hình', en:'Configure', th:'กำหนดค่า', id:'Konfigurasi', ms:'Konfigurasi', fil:'I-configure', zh:'配置' },

      // ── Billing & Plans ─────────────────────────────────────────────────
      'plan.free':         { vi:'Miễn phí', en:'Free', th:'ฟรี', id:'Gratis', ms:'Percuma', fil:'Libre', zh:'免费' },
      'plan.starter':      { vi:'Cơ bản', en:'Starter', th:'เริ่มต้น', id:'Pemula', ms:'Permula', fil:'Panimula', zh:'起步' },
      'plan.pro':          { vi:'Chuyên nghiệp', en:'Pro', th:'มืออาชีพ', id:'Pro', ms:'Pro', fil:'Pro', zh:'专业' },
      'plan.team':         { vi:'Doanh nghiệp', en:'Team', th:'ทีม', id:'Tim', ms:'Pasukan', fil:'Team', zh:'团队' },
      'plan.monthly':      { vi:'Tháng', en:'Monthly', th:'รายเดือน', id:'Bulanan', ms:'Bulanan', fil:'Buwanan', zh:'月度' },
      'plan.yearly':       { vi:'Năm', en:'Yearly', th:'รายปี', id:'Tahunan', ms:'Tahunan', fil:'Taunan', zh:'年度' },
      'plan.upgrade':      { vi:'Nâng cấp', en:'Upgrade', th:'อัปเกรด', id:'Tingkatkan', ms:'Naik taraf', fil:'Mag-upgrade', zh:'升级' },
      'plan.downgrade':    { vi:'Hạ cấp', en:'Downgrade', th:'ลดระดับ', id:'Turunkan', ms:'Turun taraf', fil:'Mag-downgrade', zh:'降级' },
      'plan.current':      { vi:'Gói hiện tại', en:'Current plan', th:'แผนปัจจุบัน', id:'Paket saat ini', ms:'Pelan semasa', fil:'Kasalukuyang plano', zh:'当前套餐' },

      // ── Backup ──────────────────────────────────────────────────────────
      'backup.status.pending':  { vi:'Đang chờ', en:'Pending', th:'รอ', id:'Menunggu', ms:'Menunggu', fil:'Nakabinbin', zh:'待备份' },
      'backup.status.running':  { vi:'Đang sao lưu', en:'Running', th:'กำลังสำรอง', id:'Mencadangkan', ms:'Menyandarkan', fil:'Nagba-backup', zh:'备份中' },
      'backup.status.completed':{ vi:'Đã sao lưu', en:'Completed', th:'สำรองเสร็จ', id:'Selesai', ms:'Selesai', fil:'Tapos', zh:'备份完成' },
      'backup.status.failed':   { vi:'Thất bại', en:'Failed', th:'ล้มเหลว', id:'Gagal', ms:'Gagal', fil:'Nabigo', zh:'备份失败' },
      'backup.create':          { vi:'Tạo sao lưu', en:'Create backup', th:'สร้างสำรอง', id:'Buat cadangan', ms:'Buat sandaran', fil:'Gumawa ng backup', zh:'创建备份' },
      'backup.restore':         { vi:'Khôi phục', en:'Restore', th:'กู้คืน', id:'Pulihkan', ms:'Pulihkan', fil:'I-restore', zh:'恢复' },

      // ── Auth & Users ────────────────────────────────────────────────────
      'auth.login':          { vi:'Đăng nhập', en:'Sign in', th:'เข้าสู่ระบบ', id:'Masuk', ms:'Log Masuk', fil:'Mag-sign in', zh:'登录' },
      'auth.register':       { vi:'Đăng ký', en:'Sign up', th:'สมัคร', id:'Daftar', ms:'Daftar', fil:'Mag-sign up', zh:'注册' },
      'auth.logout':         { vi:'Đăng xuất', en:'Sign out', th:'ออกจากระบบ', id:'Keluar', ms:'Log Keluar', fil:'Mag-sign out', zh:'退出' },
      'auth.email':          { vi:'Email', en:'Email', th:'อีเมล', id:'Email', ms:'E-mel', fil:'Email', zh:'邮箱' },
      'auth.password':       { vi:'Mật khẩu', en:'Password', th:'รหัสผ่าน', id:'Kata sandi', ms:'Kata Laluan', fil:'Password', zh:'密码' },
      'auth.forgotPassword': { vi:'Quên mật khẩu?', en:'Forgot password?', th:'ลืมรหัสผ่าน?', id:'Lupa kata sandi?', ms:'Lupa kata laluan?', fil:'Nakalimutan ang password?', zh:'忘记密码？' },
      'auth.rememberMe':     { vi:'Ghi nhớ', en:'Remember me', th:'จำฉัน', id:'Ingat saya', ms:'Ingat saya', fil:'Tandaan ako', zh:'记住我' },

      // ── Marketplace ─────────────────────────────────────────────────────
      'marketplace.browse':    { vi:'Duyệt', en:'Browse', th:'เรียกดู', id:'Jelajah', ms:'Layari', fil:'Mag-browse', zh:'浏览' },
      'marketplace.install':   { vi:'Cài đặt', en:'Install', th:'ติดตั้ง', id:'Pasang', ms:'Pasang', fil:'I-install', zh:'安装' },
      'marketplace.uninstall': { vi:'Gỡ', en:'Uninstall', th:'ถอน', id:'Copot', ms:'Nyahpasang', fil:'I-uninstall', zh:'卸载' },
      'marketplace.published': { vi:'Đã xuất bản', en:'Published', th:'เผยแพร่', id:'Diterbitkan', ms:'Diterbitkan', fil:'Nai-publish', zh:'已发布' },
      'marketplace.downloads': { vi:'Lượt tải', en:'Downloads', th:'ดาวน์โหลด', id:'Unduhan', ms:'Muat turun', fil:'Mga download', zh:'下载量' },

      // ── Notification ────────────────────────────────────────────────────
      'notif.channel.email':  { vi:'Email', en:'Email', th:'อีเมล', id:'Email', ms:'E-mel', fil:'Email', zh:'邮件' },
      'notif.channel.zalo':   { vi:'Zalo', en:'Zalo', th:'Zalo', id:'Zalo', ms:'Zalo', fil:'Zalo', zh:'Zalo' },
      'notif.channel.sms':    { vi:'SMS', en:'SMS', th:'SMS', id:'SMS', ms:'SMS', fil:'SMS', zh:'短信' },
      'notif.channel.slack':  { vi:'Slack', en:'Slack', th:'Slack', id:'Slack', ms:'Slack', fil:'Slack', zh:'Slack' },
      'notif.channel.webhook':{ vi:'Webhook', en:'Webhook', th:'เว็บฮุค', id:'Webhook', ms:'Webhook', fil:'Webhook', zh:'Webhook' },
      'notif.send':           { vi:'Gửi thông báo', en:'Send notification', th:'ส่งการแจ้งเตือน', id:'Kirim notifikasi', ms:'Hantar pemberitahuan', fil:'Magpadala ng notifikasyon', zh:'发送通知' },
      'notif.template.create':{ vi:'Tạo mẫu', en:'Create template', th:'สร้างแม่แบบ', id:'Buat templat', ms:'Buat templat', fil:'Gumawa ng template', zh:'创建模板' },

      // ── Time ────────────────────────────────────────────────────────────
      'time.justNow':    { vi:'Vừa xong', en:'Just now', th:'เมื่อกี้', id:'Baru saja', ms:'Baru sahaja', fil:'Ngayon lang', zh:'刚刚' },
      'time.minutesAgo': { vi:'phút trước', en:'minutes ago', th:'นาทีที่แล้ว', id:'menit lalu', ms:'minit lalu', fil:'minuto ang nakalipas', zh:'分钟前' },
      'time.hoursAgo':   { vi:'giờ trước', en:'hours ago', th:'ชั่วโมงที่แล้ว', id:'jam lalu', ms:'jam lalu', fil:'oras ang nakalipas', zh:'小时前' },
      'time.daysAgo':    { vi:'ngày trước', en:'days ago', th:'วันที่แล้ว', id:'hari lalu', ms:'hari lalu', fil:'araw ang nakalipas', zh:'天前' },
      'time.today':      { vi:'Hôm nay', en:'Today', th:'วันนี้', id:'Hari ini', ms:'Hari ini', fil:'Ngayon', zh:'今天' },
      'time.yesterday':  { vi:'Hôm qua', en:'Yesterday', th:'เมื่อวาน', id:'Kemarin', ms:'Semalam', fil:'Kahapon', zh:'昨天' },

      // ── Onboarding ──────────────────────────────────────────────────────
      'onboard.welcome':     { vi:'Chào mừng đến AIFUT', en:'Welcome to AIFUT', th:'ยินดีต้อนรับสู่ AIFUT', id:'Selamat datang di AIFUT', ms:'Selamat datang ke AIFUT', fil:'Maligayang pagdating sa AIFUT', zh:'欢迎来到AIFUT' },
      'onboard.step':        { vi:'Bước', en:'Step', th:'ขั้นตอน', id:'Langkah', ms:'Langkah', fil:'Hakbang', zh:'步骤' },
      'onboard.finish':      { vi:'Hoàn tất', en:'Finish', th:'เสร็จ', id:'Selesai', ms:'Selesai', fil:'Tapusin', zh:'完成' },
      'onboard.skip':        { vi:'Bỏ qua', en:'Skip', th:'ข้าม', id:'Lewati', ms:'Langkau', fil:'Laktawan', zh:'跳过' },
      'onboard.workspace':   { vi:'Tạo workspace đầu tiên', en:'Create your first workspace', th:'สร้างพื้นที่ทำงานแรก', id:'Buat workspace pertama', ms:'Buat ruang kerja pertama', fil:'Gumawa ng unang workspace', zh:'创建第一个工作区' },
      'onboard.template':    { vi:'Chọn template ngành', en:'Choose industry template', th:'เลือกแม่แบบอุตสาหกรรม', id:'Pilih templat industri', ms:'Pilih templat industri', fil:'Pumili ng template ng industriya', zh:'选择行业模板' },
      'onboard.connect':     { vi:'Kết nối ứng dụng', en:'Connect your apps', th:'เชื่อมต่อแอปของคุณ', id:'Hubungkan aplikasi Anda', ms:'Sambungkan apl anda', fil:'Ikonekta ang iyong mga app', zh:'连接你的应用' },

      // ── Industry names ──────────────────────────────────────────────────
      'industry.food':        { vi:'F&B', en:'F&B', th:'อาหาร', id:'Makanan', ms:'Makanan', fil:'Pagkain', zh:'餐饮' },
      'industry.retail':      { vi:'Bán lẻ', en:'Retail', th:'ค้าปลีก', id:'Ritel', ms:'Runcit', fil:'Tingi', zh:'零售' },
      'industry.healthcare':  { vi:'Y tế', en:'Healthcare', th:'การดูแลสุขภาพ', id:'Kesehatan', ms:'Penjagaan kesihatan', fil:'Pangangalagang pangkalusugan', zh:'医疗' },
      'industry.education':   { vi:'Giáo dục', en:'Education', th:'การศึกษา', id:'Pendidikan', ms:'Pendidikan', fil:'Edukasyon', zh:'教育' },
      'industry.beauty':      { vi:'Làm đẹp', en:'Beauty', th:'ความงาม', id:'Kecantikan', ms:'Kecantikan', fil:'Kagandahan', zh:'美容' },
      'industry.fitness':     { vi:'Thể hình', en:'Fitness', th:'ฟิตเนส', id:'Kebugaran', ms:'Kecergasan', fil:'Fitness', zh:'健身' },
      'industry.services':    { vi:'Dịch vụ', en:'Services', th:'บริการ', id:'Layanan', ms:'Perkhidmatan', fil:'Serbisyo', zh:'服务' },
      'industry.legal':       { vi:'Pháp lý', en:'Legal', th:'กฎหมาย', id:'Hukum', ms:'Undang-undang', fil:'Legal', zh:'法律' },
      'industry.accounting':  { vi:'Kế toán', en:'Accounting', th:'บัญชี', id:'Akuntansi', ms:'Perakaunan', fil:'Accounting', zh:'会计' },
      'industry.travel':      { vi:'Du lịch', en:'Travel', th:'ท่องเที่ยว', id:'Perjalanan', ms:'Pelancongan', fil:'Paglalakbay', zh:'旅游' },
      'industry.automotive':  { vi:'Ô tô', en:'Automotive', th:'ยานยนต์', id:'Otomotif', ms:'Automotif', fil:'Automotive', zh:'汽车' },
      'industry.hospitality': { vi:'Khách sạn', en:'Hospitality', th:'การบริการ', id:'Perhotelan', ms:'Hospitaliti', fil:'Hospitality', zh:'酒店' },
      'industry.logistics':   { vi:'Logistics', en:'Logistics', th:'โลจิสติกส์', id:'Logistik', ms:'Logistik', fil:'Logistics', zh:'物流' },
      'industry.construction':{ vi:'Xây dựng', en:'Construction', th:'ก่อสร้าง', id:'Konstruksi', ms:'Pembinaan', fil:'Konstruksyon', zh:'建筑' },
      'industry.insurance':   { vi:'Bảo hiểm', en:'Insurance', th:'ประกันภัย', id:'Asuransi', ms:'Insurans', fil:'Insurance', zh:'保险' },
      'industry.realestate':  { vi:'Bất động sản', en:'Real Estate', th:'อสังหาริมทรัพย์', id:'Properti', ms:'Hartanah', fil:'Real Estate', zh:'房地产' },

      // ── Errors ──────────────────────────────────────────────────────────
      'error.generic':         { vi:'Đã xảy ra lỗi', en:'An error occurred', th:'เกิดข้อผิดพลาด', id:'Terjadi kesalahan', ms:'Ralat berlaku', fil:'May naganap na error', zh:'发生错误' },
      'error.network':         { vi:'Lỗi kết nối', en:'Network error', th:'เครือข่ายผิดพลาด', id:'Kesalahan jaringan', ms:'Ralat rangkaian', fil:'Error sa network', zh:'网络错误' },
      'error.timeout':         { vi:'Hết thời gian', en:'Request timed out', th:'หมดเวลา', id:'Waktu habis', ms:'Masa tamat', fil:'Nag-time out', zh:'请求超时' },
      'error.notFound':        { vi:'Không tìm thấy', en:'Not found', th:'ไม่พบ', id:'Tidak ditemukan', ms:'Tidak dijumpai', fil:'Hindi natagpuan', zh:'未找到' },
      'error.unauthorized':    { vi:'Không có quyền', en:'Unauthorized', th:'ไม่ได้รับอนุญาต', id:'Tidak diizinkan', ms:'Tidak dibenarkan', fil:'Hindi awtorisado', zh:'未授权' },
      'error.forbidden':       { vi:'Bị từ chối', en:'Forbidden', th:'ถูกปฏิเสธ', id:'Dilarang', ms:'Dilarang', fil:'Ipinagbabawal', zh:'禁止访问' },
      'error.rateLimit':       { vi:'Vượt quá giới hạn', en:'Rate limited', th:'จำกัดอัตรา', id:'Dibatasi', ms:'Dihadkan', fil:'Na-rate limit', zh:'频率限制' },
      'error.validation':      { vi:'Dữ liệu không hợp lệ', en:'Invalid data', th:'ข้อมูลไม่ถูกต้อง', id:'Data tidak valid', ms:'Data tidak sah', fil:'Invalid na data', zh:'数据无效' },

      // ── AI / Governance ────────────────────────────────────────────────
      'ai.usage':              { vi:'Sử dụng AI', en:'AI Usage', th:'การใช้งาน AI', id:'Penggunaan AI', ms:'Penggunaan AI', fil:'Paggamit ng AI', zh:'AI用量' },
      'ai.calls':              { vi:'Lượt gọi AI', en:'AI Calls', th:'การเรียก AI', id:'Panggilan AI', ms:'Panggilan AI', fil:'Mga tawag sa AI', zh:'AI调用' },
      'ai.budget':             { vi:'Ngân sách AI', en:'AI Budget', th:'งบประมาณ AI', id:'Anggaran AI', ms:'Belanjawan AI', fil:'Badyet ng AI', zh:'AI预算' },
      'ai.model':              { vi:'Mô hình AI', en:'AI Model', th:'โมเดล AI', id:'Model AI', ms:'Model AI', fil:'Modelo ng AI', zh:'AI模型' },
      'ai.cost':               { vi:'Chi phí AI', en:'AI Cost', th:'ค่าใช้จ่าย AI', id:'Biaya AI', ms:'Kos AI', fil:'Gastos ng AI', zh:'AI费用' },
      'ai.tokens':             { vi:'Tokens', en:'Tokens', th:'โทเค็น', id:'Token', ms:'Token', fil:'Token', zh:'Token' },

      // ── Locale names (self-referential) ─────────────────────────────────
      'locale.name': { vi:'Tiếng Việt', en:'English', th:'ไทย', id:'Bahasa Indonesia', ms:'Bahasa Melayu', fil:'Filipino', zh:'中文' },
    };
  }
}
