/**
 * Seed notification templates for all industry workflow templates.
 * These templates are referenced by AWL workflows when deploying.
 *
 * Run: npx ts-node apps/api/src/notifications/seed-templates.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SeedTemplate {
  key: string;
  name: string;
  channel: string;
  subject: string;
  body: string;
}

const TEMPLATES: SeedTemplate[] = [
  // ── Booking Confirmation ───────────────────────────────────────────
  { key: 'booking_confirm_vi', name: 'Xác nhận đặt lịch', channel: 'zalo',
    subject: 'Xác nhận đặt lịch',
    body: '📅 *XÁC NHẬN ĐẶT LỊCH*\n\nCảm ơn {{customer_name}} đã đặt lịch tại {{business_name}}.\n\n📌 Dịch vụ: {{service_name}}\n🕐 Thời gian: {{appointment_time}}\n📍 Địa chỉ: {{address}}\n\nVui lòng đến đúng giờ. Liên hệ {{hotline}} nếu cần hỗ trợ.' },

  { key: 'booking_remind_vi', name: 'Nhắc lịch hẹn', channel: 'zalo',
    subject: 'Nhắc lịch hẹn',
    body: '⏰ *NHẮC LỊCH HẸN*\n\nXin chào {{customer_name}},\n\nBạn có lịch hẹn tại {{business_name}} vào lúc {{appointment_time}}.\n\nHẹn gặp bạn!' },

  { key: 'app_received', name: 'Xác nhận hồ sơ', channel: 'email',
    subject: 'Đã nhận hồ sơ của bạn - {{business_name}}',
    body: '<h2>Cảm ơn bạn đã ứng tuyển</h2><p>Chúng tôi đã nhận được hồ sơ của bạn cho vị trí <strong>{{position}}</strong>.</p><p>Chúng tôi sẽ liên hệ trong thời gian sớm nhất.</p><p>Trân trọng,<br>{{business_name}}</p>' },

  // ── Order Confirmation ─────────────────────────────────────────────
  { key: 'order_confirm_vi', name: 'Xác nhận đơn hàng', channel: 'zalo',
    subject: 'Xác nhận đơn hàng',
    body: '🛒 *XÁC NHẬN ĐƠN HÀNG*\n\nMã đơn: {{order_code}}\nTổng tiền: {{order_total}}\n\n{{items}}\n\nCảm ơn bạn đã mua hàng tại {{business_name}}!' },

  { key: 'in_transit_vi', name: 'Đang vận chuyển', channel: 'zalo',
    subject: 'Đơn hàng đang vận chuyển',
    body: '🚚 *ĐƠN HÀNG ĐANG VẬN CHUYỂN*\n\nMã đơn: {{order_code}}\nĐơn hàng của bạn đang trên đường giao.\n\n📦 Dự kiến giao: {{eta}}' },

  { key: 'delivered_confirm_vi', name: 'Giao hàng thành công', channel: 'zalo',
    subject: 'Giao hàng thành công',
    body: '✅ *GIAO HÀNG THÀNH CÔNG*\n\nMã đơn: {{order_code}}\nĐơn hàng của bạn đã được giao thành công.\n\nCảm ơn bạn đã mua sắm tại {{business_name}}! ❤️' },

  { key: 'delivery_rating_vi', name: 'Đánh giá giao hàng', channel: 'zalo',
    subject: 'Đánh giá dịch vụ',
    body: '⭐ *ĐÁNH GIÁ DỊCH VỤ*\n\nBạn hài lòng với dịch vụ giao hàng như thế nào?\n\n👉 Đánh giá ngay: {{review_link}}' },

  // ── Cart Recovery ──────────────────────────────────────────────────
  { key: 'cart_nudge1_vi', name: 'Nhắc giỏ hàng lần 1', channel: 'zalo',
    subject: 'Bạn quên gì đó?',
    body: '🛒 *BẠN QUÊN GÌ ĐÓ?*\n\nGiỏ hàng của bạn vẫn còn:\n{{cart_items}}\n\n👉 Mua ngay: {{cart_link}}' },

  { key: 'cart_voucher_vi', name: 'Tặng voucher giỏ hàng', channel: 'zalo',
    subject: 'Voucher ưu đãi cho bạn',
    body: '🎁 *VOUCHER ĐẶC BIỆT*\n\nTặng bạn mã GIẢM {{discount}}% cho đơn hàng này!\n\nMã: {{voucher_code}}\n👉 Mua ngay: {{cart_link}}\n\n*Ưu đãi có hạn, nhanh tay bạn nhé!*' },

  // ── Feedback ───────────────────────────────────────────────────────
  { key: 'review_request_vi', name: 'Yêu cầu đánh giá', channel: 'zalo',
    subject: 'Đánh giá trải nghiệm',
    body: '⭐ *ĐÁNH GIÁ TRẢI NGHIỆM*\n\n{{customer_name}} ơi, trải nghiệm của bạn hôm nay thế nào?\n\n👉 {{review_link}}\n\nÝ kiến của bạn giúp {{business_name}} phục vụ tốt hơn!' },

  { key: 'feedback_request', name: 'Khảo sát hài lòng', channel: 'email',
    subject: 'Chia sẻ trải nghiệm của bạn - {{business_name}}',
    body: '<h2>Cảm ơn bạn đã sử dụng dịch vụ</h2><p>Chúng tôi rất mong nhận được phản hồi từ bạn.</p><p><a href="{{survey_link}}">👉 Đánh giá ngay</a></p><p>Trân trọng,<br>{{business_name}}</p>' },

  // ── Membership ─────────────────────────────────────────────────────
  { key: 'membership_welcome_vi', name: 'Chào mừng hội viên', channel: 'zalo',
    subject: 'Chào mừng bạn đến với {{business_name}}',
    body: '🎉 *CHÀO MỪNG HỘI VIÊN MỚI*\n\nChào mừng {{customer_name}} đến với {{business_name}}!\n\n🎁 Ưu đãi đặc biệt cho bạn: {{welcome_offer}}\n\nCảm ơn bạn đã tin tưởng!' },

  { key: 'membership_renewal_vi', name: 'Gia hạn membership', channel: 'zalo',
    subject: 'Gia hạn hội viên',
    body: '🔄 *GIA HẠN HỘI VIÊN*\n\n{{customer_name}} ơi, membership của bạn sắp hết hạn ({{expiry_date}}).\n\n👉 Gia hạn ngay: {{renewal_link}}\n\nTiếp tục tận hưởng các đặc quyền!' },

  // ── Healthcare ─────────────────────────────────────────────────────
  { key: 'dental_confirm_vi', name: 'Xác nhận lịch nha khoa', channel: 'zalo',
    subject: 'Xác nhận lịch hẹn nha khoa',
    body: '🦷 *XÁC NHẬN LỊCH HẸN NHA KHOA*\n\nCảm ơn {{customer_name}} đã đặt lịch tại {{business_name}}.\n\n🕐 Thời gian: {{appointment_time}}\n📌 Địa chỉ: {{address}}\n\nHãy đánh răng trước khi đến nhé!' },

  { key: 'dental_remind_vi', name: 'Nhắc lịch nha khoa', channel: 'zalo',
    subject: 'Nhắc lịch hẹn nha khoa',
    body: '⏰ *NHẮC LỊCH KHÁM RĂNG*\n\n{{customer_name}} thân mến, ngày mai bạn có lịch khám tại {{business_name}} lúc {{appointment_time}}.\n\nHẹn gặp bạn!' },

  // ── Education ──────────────────────────────────────────────────────
  { key: 'tutor_welcome_vi', name: 'Chào mừng học viên', channel: 'zalo',
    subject: 'Chào mừng đến với lớp học',
    body: '📚 *CHÀO MỪNG HỌC VIÊN MỚI*\n\nChào {{student_name}}, chào mừng bạn đến với lớp {{class_name}}!\n\n📅 Lịch học: {{schedule}}\n📍 Địa điểm: {{location}}\n\nChúc bạn học tập tốt!' },

  { key: 'tutor_fee_vi', name: 'Nhắc đóng học phí', channel: 'zalo',
    subject: 'Thông báo học phí',
    body: '💰 *THÔNG BÁO HỌC PHÍ*\n\n{{student_name}} thân mến, học phí tháng {{month}} là {{amount}}.\n\n📅 Hạn đóng: {{due_date}}\n\nVui lòng đóng học phí đúng hạn.' },

  // ── Gym / Yoga ─────────────────────────────────────────────────────
  { key: 'yoga_remind_vi', name: 'Nhắc lớp yoga', channel: 'zalo',
    subject: 'Nhắc lịch tập yoga',
    body: '🧘 *NHẮC LỊCH TẬP YOGA*\n\n{{customer_name}} ơi, lớp yoga của bạn bắt đầu sau 2 tiếng!\n\n🕐 {{class_time}}\n📍 {{studio_address}}\n\nNhớ mang thảm tập nhé!' },

  { key: 'yoga_streak_vi', name: 'Chuỗi ngày tập', channel: 'zalo',
    subject: 'Bạn đã tập {{streak}} ngày liên tiếp!',
    body: '🔥 *CHUỖI TẬP LUYỆN*\n\nChúc mừng {{customer_name}}! Bạn đã tập {{streak}} ngày liên tiếp!\n\n💪 Hãy duy trì nhé! Bạn đang làm rất tốt!' },

  // ── Automotive ─────────────────────────────────────────────────────
  { key: 'garage_remind_vi', name: 'Nhắc bảo dưỡng xe', channel: 'zalo',
    subject: 'Đến hạn bảo dưỡng xe',
    body: '🔧 *NHẮC BẢO DƯỠNG XE*\n\nXe {{license_plate}} của bạn đã đến hạn bảo dưỡng.\n\n📅 Hạn: {{due_date}}\n📍 {{garage_address}}\n\nĐặt lịch ngay để xe luôn vận hành tốt!' },

  { key: 'rental_confirm_vi', name: 'Xác nhận thuê xe', channel: 'zalo',
    subject: 'Xác nhận thuê xe',
    body: '🚗 *XÁC NHẬN THUÊ XE*\n\nCảm ơn {{customer_name}} đã thuê xe tại {{business_name}}.\n\n🚘 Xe: {{car_model}}\n📅 Từ {{pickup_date}} đến {{return_date}}\n💰 Tổng: {{total_price}}\n\nVui lòng mang theo CMND/CCCD khi nhận xe.' },

  // ── Insurance ──────────────────────────────────────────────────────
  { key: 'renewal_notice_vi', name: 'Thông báo gia hạn bảo hiểm', channel: 'zalo',
    subject: 'Hợp đồng bảo hiểm sắp hết hạn',
    body: '📋 *THÔNG BÁO GIA HẠN*\n\nHợp đồng bảo hiểm của bạn sẽ hết hạn vào {{expiry_date}}.\n\n👉 Gia hạn ngay để được bảo vệ liên tục.\n\nLiên hệ {{hotline}} để được tư vấn.' },

  // ── Real Estate ────────────────────────────────────────────────────
  { key: 'realestate_lead_vi', name: 'Lead bất động sản mới', channel: 'zalo',
    subject: 'Khách hàng mới quan tâm',
    body: '🏠 *KHÁCH HÀNG MỚI*\n\n{{customer_name}} quan tâm: {{property_name}}\n📞 {{phone}}\n📧 {{email}}\n\nHãy liên hệ ngay để chốt deal!' },

  // ── Wedding ────────────────────────────────────────────────────────
  { key: 'wedding_welcome_vi', name: 'Chào mừng cặp đôi', channel: 'zalo',
    subject: 'Cảm ơn bạn đã tin tưởng!',
    body: '💍 *CHÀO MỪNG CẶP ĐÔI*\n\nCảm ơn {{customer_name}} đã tin tưởng {{business_name}}!\n\n📅 Ngày cưới: {{wedding_date}}\n\nChúng tôi sẽ đồng hành cùng bạn trong hành trình này! ❤️' },

  // ── IT Support ─────────────────────────────────────────────────────
  { key: 'ticket_assigned_vi', name: 'Ticket đã phân công', channel: 'zalo',
    subject: 'Ticket IT của bạn đã được tiếp nhận',
    body: '🎫 *TICKET ĐÃ TIẾP NHẬN*\n\nMã ticket: {{ticket_code}}\nVấn đề: {{issue_summary}}\n\nKỹ thuật viên {{technician}} sẽ liên hệ trong {{response_time}}.\n\nTheo dõi: {{ticket_link}}' },

  { key: 'ticket_sla_vi', name: 'Cảnh báo SLA', channel: 'zalo',
    subject: 'Ticket quá hạn xử lý',
    body: '⚠️ *CẢNH BÁO SLA*\n\nTicket {{ticket_code}} đã quá {{sla_hours}} giờ mà chưa được xử lý.\n\nVui lòng kiểm tra ngay!' },

  // ── Weekly Report ──────────────────────────────────────────────────
  { key: 'weekly_report', name: 'Báo cáo tuần', channel: 'email',
    subject: 'Báo cáo hoạt động tuần {{week}} - {{business_name}}',
    body: '<h2>Báo cáo tuần {{week}}</h2><p>Xin chào {{manager_name}},</p><table border="1" cellpadding="8"><tr><th>Chỉ số</th><th>Tuần này</th><th>Tuần trước</th></tr><tr><td>Đơn hàng</td><td>{{orders_this_week}}</td><td>{{orders_last_week}}</td></tr><tr><td>Doanh thu</td><td>{{revenue_this_week}}</td><td>{{revenue_last_week}}</td></tr><tr><td>Khách mới</td><td>{{new_customers}}</td><td>{{prev_customers}}</td></tr></table><br><p>Trân trọng,<br>{{business_name}} Automation</p>' },

  // ── Events ─────────────────────────────────────────────────────────
  { key: 'event_invite', name: 'Invitation', channel: 'email',
    subject: 'Bạn được mời tham gia sự kiện {{event_name}}',
    body: '<h2>🎉 THƯ MỜI</h2><p>Bạn thân mến,</p><p>Chúng tôi trân trọng mời bạn tham gia sự kiện <strong>{{event_name}}</strong>.</p><p>📅 {{event_date}}<br>📍 {{event_location}}</p><p><a href="{{rsvp_link}}">👉 Xác nhận tham dự</a></p><p>Trân trọng,<br>{{organizer}}</p>' },

  { key: 'event_qr_vi', name: 'QR Check-in', channel: 'zalo',
    subject: 'Mã QR check-in sự kiện',
    body: '✅ *MÃ CHECK-IN SỰ KIỆN*\n\n{{customer_name}} ơi, đây là mã QR của bạn:\n\n{{qr_code}}\n\nHãy đưa mã này tại cổng check-in.\n\n📅 {{event_date}}\n📍 {{event_location}}' },

  // ── Moving Service ─────────────────────────────────────────────────
  { key: 'moving_confirm_vi', name: 'Xác nhận chuyển nhà', channel: 'zalo',
    subject: 'Xác nhận dịch vụ chuyển nhà',
    body: '📦 *XÁC NHẬN CHUYỂN NHÀ*\n\nCảm ơn {{customer_name}} đã sử dụng dịch vụ của {{business_name}}.\n\n📅 Ngày chuyển: {{move_date}}\n📍 Từ: {{from_address}}\n📍 Đến: {{to_address}}\n\nĐội chuyển nhà sẽ có mặt lúc {{arrival_time}}.' },

  { key: 'moving_checklist_vi', name: 'Checklist chuyển nhà', channel: 'zalo',
    subject: 'Checklist chuẩn bị chuyển nhà',
    body: '📋 *CHECKLIST CHUẨN BỊ*\n\n{{customer_name}} ơi, ngày mai là ngày chuyển nhà rồi!\n\n✅ Đóng gói đồ dễ vỡ\n✅ Chuẩn bị vali quần áo\n✅ Kiểm tra lại giấy tờ\n✅ Sạc đầy pin điện thoại\n\nHẹn gặp bạn sáng mai lúc {{arrival_time}}!' },

  // ── Cleaning Service ───────────────────────────────────────────────
  { key: 'cleaning_confirm_vi', name: 'Xác nhận vệ sinh', channel: 'zalo',
    subject: 'Xác nhận lịch vệ sinh',
    body: '🧹 *XÁC NHẬN LỊCH VỆ SINH*\n\nCảm ơn {{customer_name}}!\n\n📅 Ngày: {{cleaning_date}}\n🕐 Giờ: {{cleaning_time}}\n📍 Địa chỉ: {{address}}\n\nĐội vệ sinh của {{business_name}} sẽ đến đúng giờ.' },
];

async function seed() {
  console.log('Seeding notification templates...\n');

  // Get all tenants
  const tenants = await prisma.tenant.findMany();
  if (tenants.length === 0) {
    console.log('No tenants found. Run the main seed first.');
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const tenant of tenants) {
    console.log(`\nTenant: ${tenant.slug} (${tenant.id})`);
    for (const tpl of TEMPLATES) {
      const existing = await prisma.notificationTemplate.findUnique({
        where: { tenantId_key: { tenantId: tenant.id, key: tpl.key } },
      });
      if (existing) {
        skipped++;
        continue;
      }
      await prisma.notificationTemplate.create({
        data: {
          tenantId: tenant.id,
          key: tpl.key,
          name: tpl.name,
          channel: tpl.channel.toUpperCase() as any,
          subjectTemplate: tpl.subject,
          bodyTemplate: tpl.body,
          format: 'markdown',
        },
      });
      created++;
    }
  }

  console.log(`\n✓ Done: ${created} templates created, ${skipped} skipped`);
  console.log('Total notification templates available:', TEMPLATES.length);
}

seed()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
