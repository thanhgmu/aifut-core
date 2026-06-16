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

      // ── Analytics ────────────────────────────────────────────────────────
      'analytics.title':         { vi:'Phân tích nền tảng', en:'Platform Analytics', th:'การวิเคราะห์แพลตฟอร์ม', id:'Analitik Platform', ms:'Analitik Platform', fil:'Analitika ng Platform', zh:'平台分析' },
      'analytics.overview':      { vi:'Tổng quan', en:'Platform Overview', th:'ภาพรวม', id:'Ikhtisar', ms:'Gambaran Keseluruhan', fil:'Pangkalahatang-ideya', zh:'平台概览' },
      'analytics.workflows':     { vi:'Quy trình', en:'Workflows', th:'ขั้นตอนการทำงาน', id:'Alur Kerja', ms:'Aliran Kerja', fil:'Workflows', zh:'工作流程' },
      'analytics.revenue':       { vi:'Doanh thu', en:'Revenue', th:'รายได้', id:'Pendapatan', ms:'Hasil', fil:'Kita', zh:'收入' },
      'analytics.industries':    { vi:'Ngành nghề', en:'Industry Adoption', th:'อุตสาหกรรม', id:'Adopsi Industri', ms:'Penggunaan Industri', fil:'Pag-aampon ng Industriya', zh:'行业采用' },
      'analytics.certification': { vi:'Chứng nhận', en:'Certification', th:'การรับรอง', id:'Sertifikasi', ms:'Pensijilan', fil:'Sertipikasyon', zh:'认证' },
      'analytics.tenants':       { vi:'Khách thuê', en:'Tenants', th:'ผู้เช่า', id:'Penyewa', ms:'Penyewa', fil:'Mga Tenant', zh:'租户' },
      'analytics.users':         { vi:'Người dùng', en:'Users', th:'ผู้ใช้', id:'Pengguna', ms:'Pengguna', fil:'Mga User', zh:'用户' },
      'analytics.subscriptions': { vi:'Đăng ký', en:'Subscriptions', th:'การสมัคร', id:'Langganan', ms:'Langganan', fil:'Mga Subscription', zh:'订阅' },

      // ── Marketplace ──────────────────────────────────────────────────────
      'marketplace.title':       { vi:'Chợ ứng dụng', en:'Marketplace', th:'ตลาด', id:'Marketplace', ms:'Pasaran', fil:'Marketplace', zh:'市场' },
      'marketplace.discover':    { vi:'Khám phá', en:'Discover', th:'ค้นพบ', id:'Temukan', ms:'Terokai', fil:'Tuklasin', zh:'发现' },
      'marketplace.submit':      { vi:'Gửi connector', en:'Submit Connector', th:'ส่ง Connector', id:'Kirim Konektor', ms:'Hantar Penyambung', fil:'Magsumite ng Connector', zh:'提交连接器' },
      'marketplace.official':    { vi:'Chính thức', en:'Official', th:'เป็นทางการ', id:'Resmi', ms:'Rasmi', fil:'Opisyal', zh:'官方' },
      'marketplace.community':   { vi:'Cộng đồng', en:'Community', th:'ชุมชน', id:'Komunitas', ms:'Komuniti', fil:'Komunidad', zh:'社区' },
      // ── Certification ────────────────────────────────────────────────────
      'cert.title':              { vi:'Chứng nhận Connector', en:'Connector Certification', th:'การรับรอง Connector', id:'Sertifikasi Konektor', ms:'Pensijilan Penyambung', fil:'Sertipikasyon ng Connector', zh:'连接器认证' },
      'cert.submit':             { vi:'Nộp chứng nhận', en:'Submit for Certification', th:'ส่งเพื่อการรับรอง', id:'Ajukan Sertifikasi', ms:'Hantar untuk Pensijilan', fil:'Isumite para sa Sertipikasyon', zh:'提交认证' },
      'cert.checklist':          { vi:'Danh sách kiểm tra', en:'Certification Checklist', th:'รายการตรวจสอบ', id:'Daftar Periksa', ms:'Senarai Semak', fil:'Listahan ng Sertipikasyon', zh:'认证清单' },
      'cert.status.approved':    { vi:'Đã duyệt', en:'Approved', th:'อนุมัติแล้ว', id:'Disetujui', ms:'Diluluskan', fil:'Naaprubahan', zh:'已批准' },
      'cert.status.rejected':    { vi:'Từ chối', en:'Rejected', th:'ถูกปฏิเสธ', id:'Ditolak', ms:'Ditolak', fil:'Tinanggihan', zh:'已拒绝' },
      'cert.status.pending':     { vi:'Đang chờ', en:'Pending', th:'รอดำเนินการ', id:'Tertunda', ms:'Tertunda', fil:'Nakabinbin', zh:'待审核' },
      'cert.status.in_review':   { vi:'Đang xem xét', en:'In Review', th:'อยู่ระหว่างตรวจสอบ', id:'Dalam Review', ms:'Dalam Semakan', fil:'Sinusuri', zh:'审核中' },
      'cert.badge':              { vi:'Huy hiệu', en:'Badge', th:'ป้าย', id:'Lencana', ms:'Lencana', fil:'Badge', zh:'徽章' },

      // ── Error Pages ──────────────────────────────────────────────────────
      'error.404.title':         { vi:'Trang không tìm thấy', en:'Page not found', th:'ไม่พบหน้า', id:'Halaman tidak ditemukan', ms:'Halaman tidak dijumpai', fil:'Hindi nahanap ang pahina', zh:'页面未找到' },
      'error.404.message':       { vi:'Trang bạn đang tìm không tồn tại hoặc đã được di chuyển.', en:'The page you\'re looking for doesn\'t exist or has been moved.', th:'หน้าที่คุณกำลังค้นหาไม่มีอยู่หรือถูกย้าย', id:'Halaman yang Anda cari tidak ada atau telah dipindahkan.', ms:'Halaman yang anda cari tidak wujud atau telah dipindahkan.', fil:'Ang pahinang iyong hinahanap ay wala o nailipat na.', zh:'您要找的页面不存在或已被移动。' },
      'error.500.title':         { vi:'Có lỗi xảy ra', en:'Something went wrong', th:'เกิดข้อผิดพลาด', id:'Terjadi kesalahan', ms:'Ralat berlaku', fil:'May naganap na error', zh:'出了点问题' },
      'error.500.message':       { vi:'Đã xảy ra lỗi không mong muốn. Vui lòng thử lại hoặc quay về trang chủ.', en:'An unexpected error occurred. Please try again or return to the home page.', th:'เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองอีกครั้งหรือกลับไปยังหน้าแรก', id:'Terjadi kesalahan tak terduga. Silakan coba lagi atau kembali ke halaman utama.', ms:'Ralat tidak dijangka berlaku. Sila cuba lagi atau kembali ke halaman utama.', fil:'Isang hindi inaasahang error ang naganap. Pakisubukan muli o bumalik sa home page.', zh:'发生了意外错误。请重试或返回首页。' },

      // ── Nav (extended) ───────────────────────────────────────────────────
      'nav.analytics':           { vi:'Phân tích', en:'Analytics', th:'การวิเคราะห์', id:'Analitik', ms:'Analitik', fil:'Analitika', zh:'分析' },
      'nav.certification':       { vi:'Chứng nhận', en:'Certification', th:'การรับรอง', id:'Sertifikasi', ms:'Pensijilan', fil:'Sertipikasyon', zh:'认证' },

      // ── Locale names (self-referential) ─────────────────────────────────
      'locale.name': { vi:'Tiếng Việt', en:'English', th:'ไทย', id:'Bahasa Indonesia', ms:'Bahasa Melayu', fil:'Filipino', zh:'中文' },

      // ── Dashboard / Home ────────────────────────────────────────────────
      'home.title':              { vi:'Bảng điều khiển', en:'Dashboard', th:'แดชบอร์ด', id:'Dasbor', ms:'Papan Pemuka', fil:'Dashboard', zh:'仪表板' },
      'home.stats.templates':    { vi:'Mẫu quy trình', en:'Templates', th:'แม่แบบ', id:'Templat', ms:'Templat', fil:'Template', zh:'模板' },
      'home.stats.languages':    { vi:'Ngôn ngữ', en:'Languages', th:'ภาษา', id:'Bahasa', ms:'Bahasa', fil:'Wika', zh:'语言' },
      'home.stats.workflows':    { vi:'Quy trình', en:'Workflows', th:'เวิร์กโฟลว์', id:'Alur Kerja', ms:'Aliran Kerja', fil:'Workflow', zh:'工作流程' },
      'home.stats.connectors':   { vi:'Kết nối', en:'Connectors', th:'คอนเนกเตอร์', id:'Konektor', ms:'Penyambung', fil:'Connector', zh:'连接器' },
      'home.quickActions':       { vi:'Thao tác nhanh', en:'Quick Actions', th:'ดำเนินการด่วน', id:'Aksi Cepat', ms:'Tindakan Pantas', fil:'Mabilis na Aksyon', zh:'快速操作' },
      'home.recentActivity':     { vi:'Hoạt động gần đây', en:'Recent Activity', th:'กิจกรรมล่าสุด', id:'Aktivitas Terbaru', ms:'Aktiviti Terkini', fil:'Kamakailang Aktibidad', zh:'最近活动' },

      // ── Workflows (extended) ────────────────────────────────────────────
      'workflow.title':           { vi:'Quy trình làm việc', en:'Workflows', th:'ขั้นตอนการทำงาน', id:'Alur Kerja', ms:'Aliran Kerja', fil:'Mga Workflow', zh:'工作流程' },
      'workflow.template.create': { vi:'Tạo quy trình mới', en:'Create Workflow', th:'สร้างขั้นตอน', id:'Buat Alur Kerja', ms:'Cipta Aliran Kerja', fil:'Gumawa ng Workflow', zh:'创建工作流程' },
      'workflow.execution.detail':{ vi:'Chi tiết thực thi', en:'Execution Detail', th:'รายละเอียดการดำเนินการ', id:'Detail Eksekusi', ms:'Butiran Pelaksanaan', fil:'Detalye ng Pagpapatupad', zh:'执行详情' },
      'workflow.execution.log':   { vi:'Nhật ký thực thi', en:'Execution Log', th:'บันทึกการดำเนินการ', id:'Log Eksekusi', ms:'Log Pelaksanaan', fil:'Log ng Pagpapatupad', zh:'执行日志' },
      'workflow.execution.duration':{ vi:'Thời gian', en:'Duration', th:'ระยะเวลา', id:'Durasi', ms:'Tempoh', fil:'Tagal', zh:'持续时间' },
      'workflow.execution.retry': { vi:'Thử lại', en:'Retry', th:'ลองใหม่', id:'Coba Lagi', ms:'Cuba Semula', fil:'Subok Muli', zh:'重试' },
      'workflow.filter.all':      { vi:'Tất cả', en:'All', th:'ทั้งหมด', id:'Semua', ms:'Semua', fil:'Lahat', zh:'全部' },
      'workflow.bulk.enable':     { vi:'Bật hàng loạt', en:'Enable Selected', th:'เปิดใช้งานที่เลือก', id:'Aktifkan Terpilih', ms:'Aktifkan Dipilih', fil:'I-enable ang Napili', zh:'批量启用' },
      'workflow.bulk.disable':    { vi:'Tắt hàng loạt', en:'Disable Selected', th:'ปิดใช้งานที่เลือก', id:'Nonaktifkan Terpilih', ms:'Lumpuhkan Dipilih', fil:'I-disable ang Napili', zh:'批量禁用' },

      // ── Backups (extended) ───────────────────────────────────────────────
      'backup.title':             { vi:'Sao lưu & Khôi phục', en:'Backups & Restore', th:'สำรองและกู้คืน', id:'Cadangan & Pulihkan', ms:'Sandaran & Pulihkan', fil:'Backup at I-restore', zh:'备份与恢复' },
      'backup.schedule.name':     { vi:'Tên lịch', en:'Schedule Name', th:'ชื่อกำหนดการ', id:'Nama Jadwal', ms:'Nama Jadual', fil:'Pangalan ng Iskedyul', zh:'计划名称' },
      'backup.schedule.frequency':{ vi:'Tần suất', en:'Frequency', th:'ความถี่', id:'Frekuensi', ms:'Kekerapan', fil:'Dalas', zh:'频率' },
      'backup.schedule.lastRun':  { vi:'Lần chạy cuối', en:'Last Run', th:'ทำงานล่าสุด', id:'Jalankan Terakhir', ms:'Jalan Terakhir', fil:'Huling Pagtakbo', zh:'上次运行' },
      'backup.schedule.nextRun':  { vi:'Lần chạy tiếp', en:'Next Run', th:'ครั้งต่อไป', id:'Jadwal Berikutnya', ms:'Jalan Seterusnya', fil:'Susunod na Pagtakbo', zh:'下次运行' },
      'backup.job.size':          { vi:'Dung lượng', en:'Size', th:'ขนาด', id:'Ukuran', ms:'Saiz', fil:'Laki', zh:'大小' },
      'backup.job.log':           { vi:'Nhật ký sao lưu', en:'Backup Log', th:'บันทึกสำรอง', id:'Log Cadangan', ms:'Log Sandaran', fil:'Log ng Backup', zh:'备份日志' },
      'backup.storage.used':      { vi:'Đã dùng', en:'Storage Used', th:'พื้นที่ที่ใช้', id:'Penyimpanan Terpakai', ms:'Storan Digunakan', fil:'Ginamit na Storage', zh:'已用存储' },
      'backup.storage.total':     { vi:'Tổng dung lượng', en:'Total Storage', th:'พื้นที่ทั้งหมด', id:'Total Penyimpanan', ms:'Jumlah Storan', fil:'Kabuuang Storage', zh:'总存储' },

      // ── Notifications (extended) ─────────────────────────────────────────
      'notif.title':              { vi:'Thông báo', en:'Notifications', th:'การแจ้งเตือน', id:'Notifikasi', ms:'Pemberitahuan', fil:'Mga Notipikasyon', zh:'通知' },
      'notif.template.name':      { vi:'Tên mẫu', en:'Template Name', th:'ชื่อแม่แบบ', id:'Nama Templat', ms:'Nama Templat', fil:'Pangalan ng Template', zh:'模板名称' },
      'notif.template.subject':   { vi:'Tiêu đề', en:'Subject', th:'หัวเรื่อง', id:'Subjek', ms:'Subjek', fil:'Paksa', zh:'主题' },
      'notif.template.body':      { vi:'Nội dung', en:'Body', th:'เนื้อหา', id:'Isi', ms:'Kandungan', fil:'Nilalaman', zh:'内容' },
      'notif.delivery.status':    { vi:'Trạng thái gửi', en:'Delivery Status', th:'สถานะการส่ง', id:'Status Pengiriman', ms:'Status Penghantaran', fil:'Katayuan ng Paghahatid', zh:'递送状态' },
      'notif.delivery.retry':     { vi:'Gửi lại', en:'Resend', th:'ส่งอีกครั้ง', id:'Kirim Ulang', ms:'Hantar Semula', fil:'Ipadala Muli', zh:'重新发送' },
      'notif.channel.configure':  { vi:'Cấu hình kênh', en:'Configure Channel', th:'กำหนดค่าช่องทาง', id:'Konfigurasi Saluran', ms:'Konfigurasi Saluran', fil:'I-configure ang Channel', zh:'配置渠道' },

      // ── Settings ─────────────────────────────────────────────────────────
      'settings.title':           { vi:'Cài đặt', en:'Settings', th:'การตั้งค่า', id:'Pengaturan', ms:'Tetapan', fil:'Mga Setting', zh:'设置' },
      'settings.account':         { vi:'Tài khoản', en:'Account', th:'บัญชี', id:'Akun', ms:'Akaun', fil:'Account', zh:'账户' },
      'settings.account.name':    { vi:'Tên hiển thị', en:'Display Name', th:'ชื่อที่แสดง', id:'Nama Tampilan', ms:'Nama Paparan', fil:'Display Name', zh:'显示名称' },
      'settings.account.email':   { vi:'Địa chỉ email', en:'Email Address', th:'ที่อยู่อีเมล', id:'Alamat Email', ms:'Alamat E-mel', fil:'Email Address', zh:'电子邮件' },
      'settings.security':        { vi:'Bảo mật', en:'Security', th:'ความปลอดภัย', id:'Keamanan', ms:'Keselamatan', fil:'Seguridad', zh:'安全' },
      'settings.org':             { vi:'Tổ chức', en:'Organization', th:'องค์กร', id:'Organisasi', ms:'Organisasi', fil:'Organisasyon', zh:'组织' },
      'settings.org.name':        { vi:'Tên tổ chức', en:'Organization Name', th:'ชื่อองค์กร', id:'Nama Organisasi', ms:'Nama Organisasi', fil:'Pangalan ng Organisasyon', zh:'组织名称' },
      'settings.org.members':     { vi:'Thành viên', en:'Members', th:'สมาชิก', id:'Anggota', ms:'Ahli', fil:'Mga Miyembro', zh:'成员' },
      'settings.org.invite':      { vi:'Mời thành viên', en:'Invite Member', th:'เชิญสมาชิก', id:'Undang Anggota', ms:'Jemput Ahli', fil:'Mag-imbita ng Miyembro', zh:'邀请成员' },
      'settings.language':        { vi:'Ngôn ngữ', en:'Language', th:'ภาษา', id:'Bahasa', ms:'Bahasa', fil:'Wika', zh:'语言' },
      'settings.quickLinks':      { vi:'Liên kết nhanh', en:'Quick Links', th:'ลิงก์ด่วน', id:'Tautan Cepat', ms:'Pautan Pantas', fil:'Mabilis na Link', zh:'快速链接' },

      // ── Status / Health ──────────────────────────────────────────────────
      'status.title':             { vi:'Trạng thái hệ thống', en:'System Status', th:'สถานะระบบ', id:'Status Sistem', ms:'Status Sistem', fil:'Katayuan ng Sistema', zh:'系统状态' },
      'status.service.api':       { vi:'API', en:'API', th:'API', id:'API', ms:'API', fil:'API', zh:'API' },
      'status.service.db':        { vi:'Cơ sở dữ liệu', en:'Database', th:'ฐานข้อมูล', id:'Database', ms:'Pangkalan Data', fil:'Database', zh:'数据库' },
      'status.service.web':       { vi:'Web', en:'Web', th:'เว็บ', id:'Web', ms:'Web', fil:'Web', zh:'Web' },
      'status.service.auth':      { vi:'Xác thực', en:'Authentication', th:'การตรวจสอบสิทธิ์', id:'Autentikasi', ms:'Pengesahan', fil:'Authentication', zh:'认证' },
      'status.service.workflow':  { vi:'Quy trình', en:'Workflow Engine', th:'เครื่องมือขั้นตอน', id:'Mesin Alur Kerja', ms:'Enjin Aliran Kerja', fil:'Workflow Engine', zh:'工作流引擎' },
      'status.service.notif':     { vi:'Thông báo', en:'Notification', th:'การแจ้งเตือน', id:'Notifikasi', ms:'Pemberitahuan', fil:'Notification', zh:'通知' },
      'status.service.payment':   { vi:'Thanh toán', en:'Payment', th:'การชำระเงิน', id:'Pembayaran', ms:'Pembayaran', fil:'Payment', zh:'支付' },
      'status.uptime':            { vi:'Thời gian hoạt động', en:'Uptime', th:'เวลาทำงาน', id:'Uptime', ms:'Masa Aktif', fil:'Uptime', zh:'运行时间' },
      'status.latency':           { vi:'Độ trễ', en:'Latency', th:'ความหน่วง', id:'Latensi', ms:'Kependaman', fil:'Latency', zh:'延迟' },
      'status.allOperational':    { vi:'Tất cả đều hoạt động', en:'All Systems Operational', th:'ทุกระบบทำงานปกติ', id:'Semua Sistem Berfungsi', ms:'Semua Sistem Beroperasi', fil:'Lahat ng System ay Operational', zh:'所有系统正常运行' },
      'status.degraded':          { vi:'Suy giảm hiệu suất', en:'Degraded Performance', th:'ประสิทธิภาพลดลง', id:'Kinerja Menurun', ms:'Prestasi Merosot', fil:'Nabawasan ang Pagganap', zh:'性能下降' },
      'status.down':              { vi:'Ngừng hoạt động', en:'Down', th:'หยุดทำงาน', id:'Turun', ms:'Tidak Berfungsi', fil:'Hindi Gumagana', zh:'已停运' },

      // ── API Keys ────────────────────────────────────────────────────────
      'apikey.title':             { vi:'Khóa API', en:'API Keys', th:'คีย์ API', id:'Kunci API', ms:'Kunci API', fil:'API Key', zh:'API密钥' },
      'apikey.create':            { vi:'Tạo khóa mới', en:'Create API Key', th:'สร้างคีย์ใหม่', id:'Buat Kunci Baru', ms:'Cipta Kunci Baru', fil:'Gumawa ng Bagong Key', zh:'创建新密钥' },
      'apikey.name':              { vi:'Tên khóa', en:'Key Name', th:'ชื่อคีย์', id:'Nama Kunci', ms:'Nama Kunci', fil:'Pangalan ng Key', zh:'密钥名称' },
      'apikey.scope':             { vi:'Phạm vi', en:'Scope', th:'ขอบเขต', id:'Lingkup', ms:'Skop', fil:'Saklaw', zh:'作用域' },
      'apikey.expiration':        { vi:'Hết hạn', en:'Expiration', th:'หมดอายุ', id:'Kedaluwarsa', ms:'Tamatan', fil:'Pag-expire', zh:'过期时间' },
      'apikey.lastUsed':          { vi:'Sử dụng cuối', en:'Last Used', th:'ใช้ล่าสุด', id:'Terakhir Digunakan', ms:'Kali Terakhir Diguna', fil:'Huling Gamit', zh:'最后使用' },
      'apikey.revoke':            { vi:'Thu hồi', en:'Revoke', th:'เพิกถอน', id:'Cabut', ms:'Batal', fil:'Bawiin', zh:'撤销' },
      'apikey.copy':              { vi:'Sao chép', en:'Copy', th:'คัดลอก', id:'Salin', ms:'Salin', fil:'Kopyahin', zh:'复制' },

      // ── Billing (extended) ───────────────────────────────────────────────
      'billing.title':            { vi:'Thanh toán', en:'Billing', th:'การเรียกเก็บเงิน', id:'Penagihan', ms:'Pengebilan', fil:'Billing', zh:'账单' },
      'billing.invoice.number':   { vi:'Số hóa đơn', en:'Invoice #', th:'ใบแจ้งหนี้ #', id:'Faktur #', ms:'Invois #', fil:'Invoice #', zh:'发票号' },
      'billing.invoice.date':     { vi:'Ngày', en:'Date', th:'วันที่', id:'Tanggal', ms:'Tarikh', fil:'Petsa', zh:'日期' },
      'billing.invoice.amount':   { vi:'Số tiền', en:'Amount', th:'จำนวนเงิน', id:'Jumlah', ms:'Jumlah', fil:'Halaga', zh:'金额' },
      'billing.invoice.status':   { vi:'Trạng thái', en:'Status', th:'สถานะ', id:'Status', ms:'Status', fil:'Katayuan', zh:'状态' },
      'billing.payment.method':   { vi:'Phương thức', en:'Payment Method', th:'วิธีการชำระเงิน', id:'Metode Pembayaran', ms:'Kaedah Pembayaran', fil:'Paraan ng Pagbabayad', zh:'支付方式' },
      'billing.usage.period':     { vi:'Kỳ sử dụng', en:'Usage Period', th:'รอบการใช้งาน', id:'Periode Penggunaan', ms:'Tempoh Penggunaan', fil:'Panahon ng Paggamit', zh:'使用周期' },
      'billing.usage.ai':         { vi:'AI', en:'AI Usage', th:'การใช้งาน AI', id:'Penggunaan AI', ms:'Penggunaan AI', fil:'Paggamit ng AI', zh:'AI用量' },
      'billing.usage.storage':    { vi:'Lưu trữ', en:'Storage', th:'พื้นที่จัดเก็บ', id:'Penyimpanan', ms:'Storan', fil:'Storage', zh:'存储' },
      'billing.usage.workflows':  { vi:'Số quy trình', en:'Workflow Executions', th:'การดำเนินงาน', id:'Eksekusi', ms:'Pelaksanaan', fil:'Mga Execution', zh:'工作流执行' },

      // ── Payment ──────────────────────────────────────────────────────────
      'payment.title':            { vi:'Thanh toán', en:'Payment', th:'การชำระเงิน', id:'Pembayaran', ms:'Pembayaran', fil:'Pagbabayad', zh:'支付' },
      'payment.checkout':         { vi:'Thanh toán', en:'Checkout', th:'ชำระเงิน', id:'Checkout', ms:'Checkout', fil:'Mag-checkout', zh:'结账' },
      'payment.selectGateway':    { vi:'Chọn cổng thanh toán', en:'Select Payment Gateway', th:'เลือกเกตเวย์', id:'Pilih Gateway', ms:'Pilih Gerbang', fil:'Pumili ng Gateway', zh:'选择支付网关' },
      'payment.vnpay':            { vi:'VNPay', en:'VNPay', th:'VNPay', id:'VNPay', ms:'VNPay', fil:'VNPay', zh:'VNPay' },
      'payment.momo':             { vi:'Ví MoMo', en:'MoMo Wallet', th:'MoMo Wallet', id:'Dompet MoMo', ms:'Dompet MoMo', fil:'MoMo Wallet', zh:'MoMo钱包' },
      'payment.bankTransfer':     { vi:'Chuyển khoản', en:'Bank Transfer', th:'โอนเงินผ่านธนาคาร', id:'Transfer Bank', ms:'Pindahan Bank', fil:'Bank Transfer', zh:'银行转账' },
      'payment.card':             { vi:'Thẻ ngân hàng', en:'Bank Card', th:'บัตรธนาคาร', id:'Kartu Bank', ms:'Kad Bank', fil:'Bank Card', zh:'银行卡' },
      'payment.history':          { vi:'Lịch sử', en:'Payment History', th:'ประวัติการชำระ', id:'Riwayat Pembayaran', ms:'Sejarah Pembayaran', fil:'Kasaysayan ng Pagbabayad', zh:'支付历史' },
      'payment.status.completed': { vi:'Đã thanh toán', en:'Completed', th:'เสร็จสมบูรณ์', id:'Selesai', ms:'Selesai', fil:'Tapos', zh:'已完成' },
      'payment.status.failed':    { vi:'Thất bại', en:'Failed', th:'ล้มเหลว', id:'Gagal', ms:'Gagal', fil:'Nabigo', zh:'失败' },
      'payment.status.pending':   { vi:'Đang chờ', en:'Pending', th:'รอ', id:'Menunggu', ms:'Menunggu', fil:'Nakabinbin', zh:'待支付' },

      // ── Marketplace (extended) ───────────────────────────────────────────
      'marketplace.all':          { vi:'Tất cả', en:'All', th:'ทั้งหมด', id:'Semua', ms:'Semua', fil:'Lahat', zh:'全部' },
      'marketplace.templates':    { vi:'Mẫu quy trình', en:'Templates', th:'แม่แบบ', id:'Templat', ms:'Templat', fil:'Template', zh:'模板' },
      'marketplace.connectors':   { vi:'Connector', en:'Connectors', th:'คอนเนกเตอร์', id:'Konektor', ms:'Penyambung', fil:'Connector', zh:'连接器' },
      'marketplace.featured':     { vi:'Nổi bật', en:'Featured', th:'แนะนำ', id:'Unggulan', ms:'Unggulan', fil:'Itinatampok', zh:'精选' },
      'marketplace.by':           { vi:'bởi', en:'by', th:'โดย', id:'oleh', ms:'oleh', fil:'ni', zh:'由' },
      'marketplace.version':      { vi:'Phiên bản', en:'Version', th:'เวอร์ชัน', id:'Versi', ms:'Versi', fil:'Bersyon', zh:'版本' },
      'marketplace.updated':      { vi:'Cập nhật', en:'Updated', th:'อัปเดต', id:'Diperbarui', ms:'Dikemas kini', fil:'Na-update', zh:'更新' },

      // ── Search ───────────────────────────────────────────────────────────
      'search.title':             { vi:'Tìm kiếm', en:'Search', th:'ค้นหา', id:'Cari', ms:'Cari', fil:'Maghanap', zh:'搜索' },
      'search.placeholder':       { vi:'Tìm kiếm mẫu quy trình, gói...', en:'Search templates, packs...', th:'ค้นหาแม่แบบ แพ็กเกจ...', id:'Cari templat, paket...', ms:'Cari templat, pek...', fil:'Maghanap ng template, pack...', zh:'搜索模板、套餐...' },
      'search.results':           { vi:'Kết quả', en:'Results', th:'ผลลัพธ์', id:'Hasil', ms:'Keputusan', fil:'Mga Resulta', zh:'结果' },
      'search.noResults':         { vi:'Không tìm thấy kết quả', en:'No results found', th:'ไม่พบผลลัพธ์', id:'Hasil tidak ditemukan', ms:'Tiada keputusan ditemui', fil:'Walang nakitang resulta', zh:'未找到结果' },
      'search.filter.category':   { vi:'Danh mục', en:'Category', th:'หมวดหมู่', id:'Kategori', ms:'Kategori', fil:'Kategorya', zh:'分类' },
      'search.filter.industry':   { vi:'Ngành', en:'Industry', th:'อุตสาหกรรม', id:'Industri', ms:'Industri', fil:'Industriya', zh:'行业' },
      'search.filter.price':      { vi:'Giá', en:'Price', th:'ราคา', id:'Harga', ms:'Harga', fil:'Presyo', zh:'价格' },

      // ── Templates ────────────────────────────────────────────────────────
      'template.title':           { vi:'Mẫu quy trình', en:'Templates', th:'แม่แบบ', id:'Templat', ms:'Templat', fil:'Mga Template', zh:'模板' },
      'template.packs':           { vi:'Gói mẫu', en:'Template Packs', th:'แพ็กเกจแม่แบบ', id:'Paket Templat', ms:'Pek Templat', fil:'Template Pack', zh:'模板包' },
      'template.browse':          { vi:'Duyệt', en:'Browse All', th:'เรียกดูทั้งหมด', id:'Jelajahi Semua', ms:'Layari Semua', fil:'Mag-browse Lahat', zh:'浏览全部' },
      'template.preview':         { vi:'Xem trước', en:'Preview', th:'ดูตัวอย่าง', id:'Pratinjau', ms:'Pratonton', fil:'Preview', zh:'预览' },
      'template.pack.contents':   { vi:'Nội dung gói', en:'Pack Contents', th:'เนื้อหาแพ็ก', id:'Isi Paket', ms:'Kandungan Pek', fil:'Nilalaman ng Pack', zh:'套餐内容' },
      'template.detail':          { vi:'Chi tiết', en:'Details', th:'รายละเอียด', id:'Detail', ms:'Butiran', fil:'Detalye', zh:'详情' },

      // ── Developer (extended) ─────────────────────────────────────────────
      'dev.title':                { vi:'Cổng nhà phát triển', en:'Developer Portal', th:'พอร์ทัลนักพัฒนา', id:'Portal Pengembang', ms:'Portal Pembangun', fil:'Portal ng Developer', zh:'开发者门户' },
      'dev.docs':                 { vi:'Tài liệu API', en:'API Docs', th:'เอกสาร API', id:'Dokumentasi API', ms:'Dokumen API', fil:'Dokumentasyon ng API', zh:'API文档' },
      'dev.sdks':                 { vi:'SDK', en:'SDKs', th:'SDK', id:'SDK', ms:'SDK', fil:'SDK', zh:'SDK' },
      'dev.api':                  { vi:'API', en:'API Reference', th:'อ้างอิง API', id:'Referensi API', ms:'Rujukan API', fil:'Sanggunian ng API', zh:'API参考' },
      'dev.roadmap':              { vi:'Lộ trình', en:'Roadmap', th:'แผนงาน', id:'Peta Jalan', ms:'Hala Tuju', fil:'Roadmap', zh:'路线图' },
      'dev.sdk.node':             { vi:'Node.js SDK', en:'Node.js SDK', th:'Node.js SDK', id:'Node.js SDK', ms:'Node.js SDK', fil:'Node.js SDK', zh:'Node.js SDK' },
      'dev.sdk.python':           { vi:'Python SDK', en:'Python SDK', th:'Python SDK', id:'Python SDK', ms:'Python SDK', fil:'Python SDK', zh:'Python SDK' },
      'dev.sdk.rest':             { vi:'REST API', en:'REST API', th:'REST API', id:'REST API', ms:'REST API', fil:'REST API', zh:'REST API' },
      'dev.sandbox':              { vi:'Môi trường thử nghiệm', en:'Sandbox', th:'แซนด์บ็อกซ์', id:'Sandbox', ms:'Sandbox', fil:'Sandbox', zh:'沙箱' },
      'dev.quickstart':           { vi:'Bắt đầu nhanh', en:'Quick Start', th:'เริ่มต้นด่วน', id:'Mulai Cepat', ms:'Mula Pantas', fil:'Mabilis na Pagsisimula', zh:'快速开始' },

      // ── Pricing ──────────────────────────────────────────────────────────
      'pricing.title':            { vi:'Bảng giá', en:'Pricing', th:'ราคา', id:'Harga', ms:'Harga', fil:'Presyo', zh:'定价' },
      'pricing.perMonth':         { vi:'/tháng', en:'/month', th:'/เดือน', id:'/bulan', ms:'/bulan', fil:'/buwan', zh:'/月' },
      'pricing.perYear':          { vi:'/năm', en:'/year', th:'/ปี', id:'/tahun', ms:'/tahun', fil:'/taon', zh:'/年' },
      'pricing.features':         { vi:'Tính năng', en:'Features', th:'คุณสมบัติ', id:'Fitur', ms:'Ciri', fil:'Mga Tampok', zh:'功能' },
      'pricing.getStarted':       { vi:'Bắt đầu', en:'Get Started', th:'เริ่มต้น', id:'Mulai', ms:'Mula', fil:'Magsimula', zh:'开始使用' },
      'pricing.contact':          { vi:'Liên hệ', en:'Contact Us', th:'ติดต่อเรา', id:'Hubungi Kami', ms:'Hubungi Kami', fil:'Makipag-ugnayan', zh:'联系我们' },
      'pricing.mostPopular':      { vi:'Phổ biến nhất', en:'Most Popular', th:'ได้รับความนิยม', id:'Terpopuler', ms:'Paling Popular', fil:'Pinakasikat', zh:'最受欢迎' },

      // ── ROI Calculator ───────────────────────────────────────────────────
      'roi.title':                { vi:'Máy tính ROI', en:'ROI Calculator', th:'เครื่องคำนวณ ROI', id:'Kalkulator ROI', ms:'Kalkulator ROI', fil:'ROI Calculator', zh:'ROI计算器' },
      'roi.calculate':            { vi:'Tính toán', en:'Calculate', th:'คำนวณ', id:'Hitung', ms:'Kira', fil:'Kalkulahin', zh:'计算' },
      'roi.selectIndustry':       { vi:'Chọn ngành', en:'Select Industry', th:'เลือกอุตสาหกรรม', id:'Pilih Industri', ms:'Pilih Industri', fil:'Pumili ng Industriya', zh:'选择行业' },
      'roi.employees':            { vi:'Số nhân viên', en:'Employees', th:'พนักงาน', id:'Karyawan', ms:'Pekerja', fil:'Mga Empleyado', zh:'员工数' },
      'roi.hoursSavedPerWeek':    { vi:'Giờ tiết kiệm/tuần', en:'Hours Saved/Week', th:'ชั่วโมงที่ประหยัด/สัปดาห์', id:'Jam Hemat/Minggu', ms:'Jam Jimat/Minggu', fil:'Oras na Nai-save/Linggo', zh:'每周节省小时' },
      'roi.hourlyCost':           { vi:'Chi phí/giờ', en:'Hourly Cost', th:'ต้นทุน/ชั่วโมง', id:'Biaya/Jam', ms:'Kos/Jam', fil:'Gastos/Oras', zh:'每小时成本' },
      'roi.monthly':              { vi:'Tiết kiệm/tháng', en:'Monthly Savings', th:'ประหยัด/เดือน', id:'Hemat/Bulan', ms:'Jimat/Bulan', fil:'Natipid/Buwan', zh:'每月节省' },
      'roi.yearly':               { vi:'Tiết kiệm/năm', en:'Yearly Savings', th:'ประหยัด/ปี', id:'Hemat/Tahun', ms:'Jimat/Tahun', fil:'Natipid/Taon', zh:'每年节省' },
      'roi.investment':           { vi:'Đầu tư', en:'Investment', th:'การลงทุน', id:'Investasi', ms:'Pelaburan', fil:'Pamumuhunan', zh:'投资' },

      // ── Login / Register ─────────────────────────────────────────────────
      'login.title':              { vi:'Đăng nhập', en:'Sign In', th:'เข้าสู่ระบบ', id:'Masuk', ms:'Log Masuk', fil:'Mag-sign In', zh:'登录' },
      'login.submit':             { vi:'Đăng nhập', en:'Sign In', th:'เข้าสู่ระบบ', id:'Masuk', ms:'Log Masuk', fil:'Mag-sign In', zh:'登录' },
      'login.noAccount':          { vi:'Chưa có tài khoản?', en:'No account yet?', th:'ยังไม่มีบัญชี?', id:'Belum punya akun?', ms:'Tiada akaun lagi?', fil:'Wala pang account?', zh:'还没有账户？' },
      'register.title':           { vi:'Đăng ký', en:'Sign Up', th:'สมัคร', id:'Daftar', ms:'Daftar', fil:'Mag-sign Up', zh:'注册' },
      'register.submit':          { vi:'Đăng ký', en:'Sign Up', th:'สมัคร', id:'Daftar', ms:'Daftar', fil:'Mag-sign Up', zh:'注册' },
      'register.name':            { vi:'Họ tên', en:'Full Name', th:'ชื่อเต็ม', id:'Nama Lengkap', ms:'Nama Penuh', fil:'Buong Pangalan', zh:'全名' },
      'register.company':         { vi:'Tên công ty', en:'Company Name', th:'ชื่อบริษัท', id:'Nama Perusahaan', ms:'Nama Syarikat', fil:'Pangalan ng Kumpanya', zh:'公司名称' },
      'register.agree':           { vi:'Tôi đồng ý với', en:'I agree to the', th:'ฉันยอมรับ', id:'Saya setuju dengan', ms:'Saya bersetuju dengan', fil:'Sumasang-ayon ako sa', zh:'我同意' },
      'register.terms':           { vi:'Điều khoản sử dụng', en:'Terms of Service', th:'ข้อกำหนด', id:'Ketentuan Layanan', ms:'Terma Perkhidmatan', fil:'Mga Tuntunin ng Serbisyo', zh:'服务条款' },

      // ── Welcome ──────────────────────────────────────────────────────────
      'welcome.title':            { vi:'Chào mừng đến AIFUT', en:'Welcome to AIFUT', th:'ยินดีต้อนรับสู่ AIFUT', id:'Selamat Datang di AIFUT', ms:'Selamat Datang ke AIFUT', fil:'Maligayang Pagdating sa AIFUT', zh:'欢迎来到AIFUT' },
      'welcome.description':      { vi:'Nền tảng tự động hóa doanh nghiệp thông minh, nhanh chóng.', en:'Smart, fast business automation platform.', th:'แพลตฟอร์มระบบอัตโนมัติธุรกิจที่ชาญฉลาด รวดเร็ว', id:'Platform otomatisasi bisnis yang cerdas dan cepat.', ms:'Platform automasi perniagaan yang pintar dan pantas.', fil:'Matalino at mabilis na platform ng automation ng negosyo.', zh:'智能、快速的企业自动化平台。' },
      'welcome.start':            { vi:'Bắt đầu ngay', en:'Get Started', th:'เริ่มต้น', id:'Mulai', ms:'Mula', fil:'Magsimula', zh:'立即开始' },
      'welcome.watchDemo':        { vi:'Xem video', en:'Watch Demo', th:'ดูตัวอย่าง', id:'Tonton Demo', ms:'Tonton Demo', fil:'Manood ng Demo', zh:'观看演示' },
      'welcome.readDocs':         { vi:'Đọc tài liệu', en:'Read Docs', th:'อ่านเอกสาร', id:'Baca Dokumen', ms:'Baca Dokumen', fil:'Basahin ang Docs', zh:'阅读文档' },

      // ── Onboarding (extended) ────────────────────────────────────────────
      'onboard.business':         { vi:'Giới thiệu doanh nghiệp', en:'Tell us about your business', th:'บอกเราเกี่ยวกับธุรกิจของคุณ', id:'Ceritakan tentang bisnis Anda', ms:'Beritahu kami tentang perniagaan anda', fil:'Sabihin sa amin ang tungkol sa iyong negosyo', zh:'告诉我们您的业务' },
      'onboard.industry':         { vi:'Chọn ngành nghề', en:'Choose your industry', th:'เลือกอุตสาหกรรมของคุณ', id:'Pilih industri Anda', ms:'Pilih industri anda', fil:'Pumili ng iyong industriya', zh:'选择您的行业' },
      'onboard.integration':      { vi:'Kết nối ứng dụng', en:'Connect your tools', th:'เชื่อมต่อเครื่องมือของคุณ', id:'Hubungkan alat Anda', ms:'Sambungkan alat anda', fil:'Ikonekta ang iyong mga tool', zh:'连接您的工具' },
      'onboard.complete':         { vi:'Hoàn tất thiết lập', en:'Setup Complete!', th:'ตั้งค่าเสร็จสมบูรณ์!', id:'Pengaturan Selesai!', ms:'Persediaan Selesai!', fil:'Kumpleto ang Setup!', zh:'设置完成！' },

      // ── AWL Playground ───────────────────────────────────────────────────
      'playground.title':         { vi:'AWL Playground', en:'AWL Playground', th:'สนามทดสอบ AWL', id:'Playground AWL', ms:'Playground AWL', fil:'AWL Playground', zh:'AWL游乐场' },
      'playground.description':   { vi:'Thử nghiệm ngôn ngữ quy trình AIFUT trực tiếp', en:'Test AIFUT Workflow Language live', th:'ทดสอบภาษาเวิร์กโฟลว์ AIFUT', id:'Uji Bahasa Alur Kerja AIFUT langsung', ms:'Uji Bahasa Aliran Kerja AIFUT secara langsung', fil:'Subukan ang AIFUT Workflow Language live', zh:'实时测试AIFUT工作流语言' },
      'playground.run':           { vi:'Chạy', en:'Run', th:'รัน', id:'Jalankan', ms:'Jalankan', fil:'Patakbuhin', zh:'运行' },
      'playground.export':        { vi:'Xuất AWL', en:'Export AWL', th:'ส่งออก AWL', id:'Ekspor AWL', ms:'Eksport AWL', fil:'I-export ang AWL', zh:'导出AWL' },
      'playground.example':       { vi:'Ví dụ mẫu', en:'Example', th:'ตัวอย่าง', id:'Contoh', ms:'Contoh', fil:'Halimbawa', zh:'示例' },
      'playground.editor':        { vi:'Trình soạn thảo', en:'Editor', th:'ตัวแก้ไข', id:'Editor', ms:'Editor', fil:'Editor', zh:'编辑器' },
      'playground.output':        { vi:'Kết quả', en:'Output', th:'ผลลัพธ์', id:'Keluaran', ms:'Output', fil:'Output', zh:'输出' },
      'playground.success':       { vi:'Thực thi thành công', en:'Execution successful', th:'ดำเนินการสำเร็จ', id:'Eksekusi berhasil', ms:'Pelaksanaan berjaya', fil:'Matagumpay ang pagpapatupad', zh:'执行成功' },
      'playground.error':         { vi:'Lỗi thực thi', en:'Execution error', th:'ข้อผิดพลาดในการดำเนินการ', id:'Kesalahan eksekusi', ms:'Ralat pelaksanaan', fil:'Error sa pagpapatupad', zh:'执行错误' },

      // ── Common (extended) ────────────────────────────────────────────────
      'common.back':              { vi:'Quay lại', en:'Back', th:'กลับ', id:'Kembali', ms:'Kembali', fil:'Bumalik', zh:'返回' },
      'common.next':              { vi:'Tiếp', en:'Next', th:'ถัดไป', id:'Berikutnya', ms:'Seterusnya', fil:'Susunod', zh:'下一步' },
      'common.done':              { vi:'Xong', en:'Done', th:'เสร็จ', id:'Selesai', ms:'Selesai', fil:'Tapos', zh:'完成' },
      'common.loading':           { vi:'Đang tải...', en:'Loading...', th:'กำลังโหลด...', id:'Memuat...', ms:'Memuatkan...', fil:'Naglo-load...', zh:'加载中...' },
      'common.error':             { vi:'Lỗi', en:'Error', th:'ข้อผิดพลาด', id:'Error', ms:'Ralat', fil:'Error', zh:'错误' },
      'common.success':           { vi:'Thành công', en:'Success', th:'สำเร็จ', id:'Berhasil', ms:'Berjaya', fil:'Tagumpay', zh:'成功' },
      'common.info':              { vi:'Thông tin', en:'Info', th:'ข้อมูล', id:'Info', ms:'Maklumat', fil:'Impormasyon', zh:'信息' },
      'common.warning':           { vi:'Cảnh báo', en:'Warning', th:'คำเตือน', id:'Peringatan', ms:'Amaran', fil:'Babala', zh:'警告' },
      'common.close':             { vi:'Đóng', en:'Close', th:'ปิด', id:'Tutup', ms:'Tutup', fil:'Isara', zh:'关闭' },
      'common.retry':             { vi:'Thử lại', en:'Retry', th:'ลองใหม่', id:'Coba Lagi', ms:'Cuba Semula', fil:'Subok Muli', zh:'重试' },
      'common.copy':              { vi:'Sao chép', en:'Copy', th:'คัดลอก', id:'Salin', ms:'Salin', fil:'Kopyahin', zh:'复制' },
      'common.copied':            { vi:'Đã sao chép', en:'Copied!', th:'คัดลอกแล้ว!', id:'Disalin!', ms:'Disalin!', fil:'Nakopya!', zh:'已复制！' },
      'common.print':             { vi:'In', en:'Print', th:'พิมพ์', id:'Cetak', ms:'Cetak', fil:'I-print', zh:'打印' },
      'common.goHome':            { vi:'Về trang chủ', en:'Go Home', th:'ไปหน้าแรก', id:'Ke Beranda', ms:'Ke Laman Utama', fil:'Pumunta sa Home', zh:'返回首页' },
    };
  }
}
