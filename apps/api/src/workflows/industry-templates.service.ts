import { Injectable } from '@nestjs/common';
import { AwlDocument } from './awl.types';

/**
 * Industry workflow templates in AWL format.
 * Each template is a complete, deployable workflow for a specific industry.
 */

export interface IndustryTemplate {
  slug: string;
  name: string;
  industry: string;
  description: string;
  document: AwlDocument;
}

@Injectable()
export class IndustryTemplatesService {
  getAll(): IndustryTemplate[] {
    return [
      this.spaBooking(),
      this.restaurantOrder(),
      this.ecommerceConfirm(),
      this.freelancerInvoice(),
      this.classReminder(),
      this.healthcareClinic(),
      this.realEstateLead(),
      this.fitnessGym(),
      this.hotelBooking(),
      this.automotiveService(),
      this.legalFirm(),
      this.accountingTax(),
      this.travelAgency(),
      this.constructionProject(),
      this.insuranceRenewal(),
    ];
  }

  getByIndustry(industry: string): IndustryTemplate[] {
    return this.getAll().filter((t) => t.industry === industry);
  }

  private spaBooking(): IndustryTemplate {
    return {
      slug: 'spa-booking-flow',
      name: 'Đặt lịch Spa - Tự động nhắc + Feedback',
      industry: 'beauty',
      description: 'Tự động xác nhận lịch, nhắc 2 tiếng trước, gửi survey sau dịch vụ',
      document: {
        awl: '0.1',
        workflow: 'spa-booking-auto',
        name: 'Đặt lịch Spa',
        description: 'Tự động xác nhận Zalo → nhắc trước 2h → survey sau dịch vụ',
        category: 'booking',
        industry: 'beauty',
        trigger: { kind: 'event', config: { event: 'booking.created' } },
        steps: [
          { id: 'confirm', name: 'Gửi Zalo xác nhận', type: 'send', config: { channel: 'zalo', template: 'booking_confirm_vi' } },
          { id: 'remind', name: 'Nhắc trước 2 tiếng', type: 'wait', config: { seconds: 7200 } },
          { id: 'check', name: 'Kiểm tra trạng thái', type: 'condition', config: { field: 'booking.status', equals: 'confirmed' } },
          { id: 'feedback', name: 'Gửi survey đánh giá', type: 'send', config: { channel: 'zalo', template: 'feedback_request_vi' }, depends_on: ['remind', 'check'] },
        ],
      },
    };
  }

  private restaurantOrder(): IndustryTemplate {
    return {
      slug: 'restaurant-order-flow',
      name: 'Nhà hàng - Xác nhận đơn gọi món',
      industry: 'food',
      description: 'Xác nhận đơn, thông báo bếp, hỏi feedback sau ăn',
      document: {
        awl: '0.1',
        workflow: 'restaurant-order',
        name: 'Xác nhận đơn nhà hàng',
        category: 'order',
        industry: 'food',
        trigger: { kind: 'event', config: { event: 'order.created' } },
        steps: [
          { id: 'confirm', name: 'Gửi Zalo xác nhận', type: 'send', config: { channel: 'zalo', template: 'order_confirm_vi' } },
          { id: 'kitchen', name: 'Thông báo bếp', type: 'send', config: { channel: 'webhook', endpoint: 'kitchen-display' } },
          { id: 'wait', name: 'Chờ 1 tiếng', type: 'wait', config: { seconds: 3600 } },
          { id: 'feedback', name: 'Gửi feedback', type: 'send', config: { channel: 'zalo', template: 'feedback_request_vi' }, depends_on: ['kitchen'] },
        ],
      },
    };
  }

  private ecommerceConfirm(): IndustryTemplate {
    return {
      slug: 'ecommerce-order-flow',
      name: 'E-commerce - Xác nhận + giao hàng',
      industry: 'retail',
      description: 'Xác nhận đơn, thông báo giao hàng, yêu cầu đánh giá',
      document: {
        awl: '0.1',
        workflow: 'ecom-order-flow',
        name: 'Quy trình đơn hàng E-commerce',
        category: 'order',
        industry: 'retail',
        trigger: { kind: 'webhook', config: { endpoint: 'orders/new' } },
        steps: [
          { id: 'confirm', name: 'Xác nhận đơn hàng', type: 'send', config: { channel: 'zalo', template: 'order_confirm_vi' } },
          { id: 'prepare', name: 'Chờ xử lý', type: 'wait', config: { seconds: 1800 } },
          { id: 'ship', name: 'Thông báo giao hàng', type: 'send', config: { channel: 'zalo', template: 'shipping_notify_vi' } },
          { id: 'wait-delivery', name: 'Chờ nhận hàng', type: 'wait', config: { seconds: 86400 } },
          { id: 'review', name: 'Yêu cầu đánh giá', type: 'send', config: { channel: 'zalo', template: 'review_request_vi' }, depends_on: ['ship'] },
        ],
      },
    };
  }

  private freelancerInvoice(): IndustryTemplate {
    return {
      slug: 'freelancer-invoice-flow',
      name: 'Freelancer - Gửi báo giá + Nhắc thanh toán',
      industry: 'services',
      description: 'Gửi báo giá, nhắc thanh toán 3 ngày trước hạn, cảm ơn sau khi nhận',
      document: {
        awl: '0.1',
        workflow: 'freelancer-invoice',
        name: 'Quy trình gửi hóa đơn Freelancer',
        category: 'finance',
        industry: 'services',
        trigger: { kind: 'manual', config: {} },
        steps: [
          { id: 'quote', name: 'Gửi báo giá', type: 'send', config: { channel: 'email', template: 'quote_template' } },
          { id: 'remind', name: 'Nhắc thanh toán', type: 'wait', config: { seconds: 259200 } },
          { id: 'thanks', name: 'Gửi cảm ơn + receipt', type: 'send', config: { channel: 'email', template: 'payment_thanks' }, depends_on: ['quote', 'remind'] },
        ],
      },
    };
  }

  private classReminder(): IndustryTemplate {
    return {
      slug: 'education-class-reminder',
      name: 'Trung tâm học - Nhắc lịch học',
      industry: 'education',
      description: 'Nhắc học viên lịch học trước 1 ngày, thông báo tài liệu, gửi feedback sau buổi',
      document: {
        awl: '0.1',
        workflow: 'edu-class-reminder',
        name: 'Nhắc lịch học trung tâm',
        category: 'scheduling',
        industry: 'education',
        trigger: { kind: 'schedule', config: { cron: '0 8 * * *' } },
        steps: [
          { id: 'notify', name: 'Nhắc lịch học hôm nay', type: 'send', config: { channel: 'zalo', template: 'class_reminder_vi' } },
          { id: 'material', name: 'Gửi tài liệu', type: 'send', config: { channel: 'email', template: 'class_material' } },
          { id: 'post-class', name: 'Feedback sau buổi', type: 'wait', config: { seconds: 14400 } },
          { id: 'survey', name: 'Gửi survey', type: 'send', config: { channel: 'zalo', template: 'feedback_request_vi' }, depends_on: ['notify'] },
        ],
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // 10 NEW INDUSTRY TEMPLATES (Phase 2 expansion)
  // ══════════════════════════════════════════════════════════════════════

  private healthcareClinic(): IndustryTemplate {
    return {
      slug: 'healthcare-appointment-flow',
      name: 'Phòng khám - Đặt lịch + Nhắc tái khám',
      industry: 'healthcare',
      description: 'Xác nhận lịch khám, nhắc trước 1 ngày, hướng dẫn xét nghiệm, nhắc tái khám',
      document: {
        awl: '0.1', workflow: 'healthcare-appt', name: 'Quy trình đặt lịch phòng khám',
        description: 'Xác nhận Zalo → nhắc trước 24h → hướng dẫn → tái khám',
        category: 'booking', industry: 'healthcare',
        trigger: { kind: 'event', config: { event: 'appointment.created' } },
        steps: [
          { id: 'confirm', name: 'Xác nhận lịch khám', type: 'send', config: { channel: 'zalo', template: 'appt_confirm_vi' } },
          { id: 'wait-24h', name: 'Chờ 24 tiếng', type: 'wait', config: { seconds: 86400 } },
          { id: 'remind', name: 'Nhắc lịch khám ngày mai', type: 'send', config: { channel: 'zalo', template: 'appt_reminder_vi' } },
          { id: 'instructions', name: 'Hướng dẫn trước khám', type: 'send', config: { channel: 'zalo', template: 'pre_checkup_vi' }, depends_on: ['confirm'] },
          { id: 'wait-post', name: 'Chờ 48h sau khám', type: 'wait', config: { seconds: 172800 } },
          { id: 'recheck', name: 'Nhắc tái khám', type: 'send', config: { channel: 'zalo', template: 'recheck_reminder_vi' }, depends_on: ['remind'] },
        ],
      },
    };
  }

  private realEstateLead(): IndustryTemplate {
    return {
      slug: 'realestate-lead-flow',
      name: 'Bất động sản - Chăm sóc lead + Xem nhà',
      industry: 'realestate',
      description: 'Tiếp nhận lead, gửi thông tin dự án, hẹn xem nhà, nhắc sau 3 ngày',
      document: {
        awl: '0.1', workflow: 're-lead', name: 'Chăm sóc lead BĐS',
        category: 'crm', industry: 'realestate',
        trigger: { kind: 'event', config: { event: 'lead.created' } },
        steps: [
          { id: 'welcome', name: 'Gửi thông tin dự án', type: 'send', config: { channel: 'zalo', template: 'project_intro_vi' } },
          { id: 'schedule', name: 'Yêu cầu hẹn xem nhà', type: 'send', config: { channel: 'zalo', template: 'viewing_request_vi' } },
          { id: 'wait-3d', name: 'Chờ 3 ngày', type: 'wait', config: { seconds: 259200 } },
          { id: 'followup', name: 'Follow-up nếu chưa hẹn', type: 'condition', config: { field: 'lead.viewing_scheduled', equals: 'false' } },
          { id: 'resend', name: 'Gửi lại thông tin + KM', type: 'send', config: { channel: 'zalo', template: 'promo_last_chance_vi' }, depends_on: ['wait-3d', 'followup'] },
        ],
      },
    };
  }

  private fitnessGym(): IndustryTemplate {
    return {
      slug: 'fitness-member-flow',
      name: 'Gym/Fitness - Duy trì hội viên',
      industry: 'fitness',
      description: 'Chào mừng hội viên mới, lịch lớp hàng tuần, nhắc hết hạn, feedback',
      document: {
        awl: '0.1', workflow: 'fitness-member', name: 'Duy trì hội viên Gym',
        category: 'membership', industry: 'fitness',
        trigger: { kind: 'event', config: { event: 'member.created' } },
        steps: [
          { id: 'welcome', name: 'Chào mừng hội viên mới', type: 'send', config: { channel: 'zalo', template: 'gym_welcome_vi' } },
          { id: 'weekly', name: 'Lịch lớp tuần (Thứ 2 hàng tuần)', type: 'send', config: { channel: 'email', template: 'weekly_schedule' } },
          { id: 'wait-month', name: 'Chờ 30 ngày', type: 'wait', config: { seconds: 2592000 } },
          { id: 'check', name: 'Kiểm tra tần suất tập', type: 'condition', config: { field: 'member.visits_30d', less_than: 5 } },
          { id: 'reengage', name: 'Gửi ưu đãi quay lại', type: 'send', config: { channel: 'zalo', template: 'comeback_offer_vi' }, depends_on: ['wait-month', 'check'] },
          { id: 'expire-notify', name: 'Nhắc hết hạn 7 ngày', type: 'send', config: { channel: 'zalo', template: 'expiry_reminder_vi' } },
        ],
      },
    };
  }

  private hotelBooking(): IndustryTemplate {
    return {
      slug: 'hotel-booking-flow',
      name: 'Khách sạn - Đặt phòng + Check-in',
      industry: 'hospitality',
      description: 'Xác nhận đặt phòng, hướng dẫn check-in, hỏi dịch vụ thêm, feedback sau ở',
      document: {
        awl: '0.1', workflow: 'hotel-booking', name: 'Quy trình đặt phòng khách sạn',
        category: 'booking', industry: 'hospitality',
        trigger: { kind: 'event', config: { event: 'reservation.created' } },
        steps: [
          { id: 'confirm', name: 'Xác nhận đặt phòng', type: 'send', config: { channel: 'email', template: 'booking_confirm_hotel' } },
          { id: 'pre-checkin', name: 'Hướng dẫn check-in + dịch vụ', type: 'send', config: { channel: 'zalo', template: 'hotel_precheckin_vi' } },
          { id: 'day-before', name: 'Nhắc 1 ngày trước', type: 'wait', config: { seconds: 86400 } },
          { id: 'welcome', name: 'Gửi welcome + voucher', type: 'send', config: { channel: 'zalo', template: 'hotel_welcome_vi' }, depends_on: ['confirm'] },
          { id: 'post-stay', name: 'Feedback sau khi ở', type: 'wait', config: { seconds: 43200 } },
          { id: 'review', name: 'Yêu cầu đánh giá', type: 'send', config: { channel: 'email', template: 'review_request_hotel' }, depends_on: ['post-stay'] },
        ],
      },
    };
  }

  private automotiveService(): IndustryTemplate {
    return {
      slug: 'automotive-service-flow',
      name: 'Gara ô tô - Đặt lịch + Bảo dưỡng',
      industry: 'automotive',
      description: 'Xác nhận lịch sửa chữa, thông báo tiến độ, nhắc bảo dưỡng định kỳ',
      document: {
        awl: '0.1', workflow: 'auto-service', name: 'Dịch vụ Gara ô tô',
        category: 'service', industry: 'automotive',
        trigger: { kind: 'event', config: { event: 'service.created' } },
        steps: [
          { id: 'confirm', name: 'Xác nhận lịch sửa xe', type: 'send', config: { channel: 'zalo', template: 'service_confirm_vi' } },
          { id: 'progress', name: 'Cập nhật tiến độ sửa', type: 'send', config: { channel: 'zalo', template: 'service_progress_vi' } },
          { id: 'complete', name: 'Thông báo hoàn thành', type: 'send', config: { channel: 'zalo', template: 'service_done_vi' } },
          { id: 'wait-90d', name: 'Chờ 90 ngày', type: 'wait', config: { seconds: 7776000 } },
          { id: 'maintenance', name: 'Nhắc bảo dưỡng định kỳ', type: 'send', config: { channel: 'zalo', template: 'maintenance_remind_vi' }, depends_on: ['complete'] },
        ],
      },
    };
  }

  private legalFirm(): IndustryTemplate {
    return {
      slug: 'legal-case-flow',
      name: 'Văn phòng luật - Quản lý vụ việc',
      industry: 'legal',
      description: 'Xác nhận tiếp nhận vụ việc, nhắc hạn nộp, cập nhật tiến độ, hóa đơn',
      document: {
        awl: '0.1', workflow: 'legal-case', name: 'Quy trình vụ việc pháp lý',
        category: 'crm', industry: 'legal',
        trigger: { kind: 'manual', config: {} },
        steps: [
          { id: 'welcome', name: 'Xác nhận tiếp nhận + tài liệu', type: 'send', config: { channel: 'email', template: 'case_welcome' } },
          { id: 'wait-7d', name: 'Chờ 7 ngày', type: 'wait', config: { seconds: 604800 } },
          { id: 'update', name: 'Cập nhật tiến độ', type: 'send', config: { channel: 'email', template: 'case_update' } },
          { id: 'deadline', name: 'Nhắc hạn 14 ngày', type: 'wait', config: { seconds: 1209600 } },
          { id: 'deadline-notify', name: 'Thông báo hạn chót', type: 'send', config: { channel: 'zalo', template: 'deadline_warning_vi' }, depends_on: ['update'] },
          { id: 'invoice', name: 'Gửi hóa đơn', type: 'send', config: { channel: 'email', template: 'legal_invoice' }, depends_on: ['deadline'] },
        ],
      },
    };
  }

  private accountingTax(): IndustryTemplate {
    return {
      slug: 'accounting-tax-flow',
      name: 'Kế toán - Nhắc thuế + Báo cáo',
      industry: 'accounting',
      description: 'Nhắc hạn nộp thuế, gửi báo cáo hàng tháng, hạn chót quyết toán',
      document: {
        awl: '0.1', workflow: 'acct-tax', name: 'Quy trình kế toán thuế',
        category: 'finance', industry: 'accounting',
        trigger: { kind: 'schedule', config: { cron: '0 9 1 * *' } },
        steps: [
          { id: 'request-docs', name: 'Yêu cầu chứng từ tháng', type: 'send', config: { channel: 'zalo', template: 'doc_request_vi' } },
          { id: 'wait-docs', name: 'Chờ 7 ngày', type: 'wait', config: { seconds: 604800 } },
          { id: 'remind', name: 'Nhắc nộp chứng từ', type: 'send', config: { channel: 'zalo', template: 'doc_reminder_vi' } },
          { id: 'deadline', name: 'Hạn nộp thuế 20 hàng tháng', type: 'send', config: { channel: 'email', template: 'tax_deadline' } },
          { id: 'report', name: 'Gửi báo cáo tài chính', type: 'send', config: { channel: 'email', template: 'monthly_report' } },
        ],
      },
    };
  }

  private travelAgency(): IndustryTemplate {
    return {
      slug: 'travel-booking-flow',
      name: 'Du lịch - Lịch trình + Nhắc chuyến',
      industry: 'travel',
      description: 'Gửi itinerary, nhắc trước 1 ngày, check-in online, survey sau tour',
      document: {
        awl: '0.1', workflow: 'travel-booking', name: 'Quy trình đặt tour du lịch',
        category: 'booking', industry: 'travel',
        trigger: { kind: 'event', config: { event: 'booking.confirmed' } },
        steps: [
          { id: 'itinerary', name: 'Gửi lịch trình chi tiết', type: 'send', config: { channel: 'email', template: 'travel_itinerary' } },
          { id: 'flight-info', name: 'Gửi thông tin bay', type: 'send', config: { channel: 'zalo', template: 'flight_info_vi' } },
          { id: 'day-before', name: 'Nhắc 1 ngày trước đi', type: 'wait', config: { seconds: 86400 } },
          { id: 'checklist', name: 'Gửi checklist chuẩn bị', type: 'send', config: { channel: 'zalo', template: 'travel_checklist_vi' }, depends_on: ['itinerary'] },
          { id: 'post-trip', name: 'Survey sau chuyến đi', type: 'wait', config: { seconds: 172800 } },
          { id: 'feedback', name: 'Yêu cầu đánh giá + ảnh', type: 'send', config: { channel: 'email', template: 'trip_review' }, depends_on: ['post-trip'] },
        ],
      },
    };
  }

  private constructionProject(): IndustryTemplate {
    return {
      slug: 'construction-project-flow',
      name: 'Xây dựng - Quản lý dự án',
      industry: 'construction',
      description: 'Cập nhật tiến độ hàng tuần, nhắc thanh toán đợt, biên bản nghiệm thu',
      document: {
        awl: '0.1', workflow: 'construction-pm', name: 'Quản lý dự án xây dựng',
        category: 'project', industry: 'construction',
        trigger: { kind: 'event', config: { event: 'project.started' } },
        steps: [
          { id: 'welcome', name: 'Khởi công + timeline', type: 'send', config: { channel: 'zalo', template: 'project_start_vi' } },
          { id: 'weekly-update', name: 'Cập nhật tiến độ tuần', type: 'send', config: { channel: 'email', template: 'weekly_progress' } },
          { id: 'milestone', name: 'Check milestone 30%', type: 'condition', config: { field: 'project.progress_pct', greater_or_equal: 30 } },
          { id: 'payment-remind', name: 'Nhắc thanh toán đợt 1', type: 'send', config: { channel: 'zalo', template: 'payment_due_vi' }, depends_on: ['milestone'] },
          { id: 'final', name: 'Cập nhật 90%', type: 'condition', config: { field: 'project.progress_pct', greater_or_equal: 90 } },
          { id: 'handover', name: 'Biên bản nghiệm thu + bàn giao', type: 'send', config: { channel: 'email', template: 'handover_doc' }, depends_on: ['final'] },
        ],
      },
    };
  }

  private insuranceRenewal(): IndustryTemplate {
    return {
      slug: 'insurance-renewal-flow',
      name: 'Bảo hiểm - Gia hạn + Bồi thường',
      industry: 'insurance',
      description: 'Nhắc gia hạn 30 ngày trước, quy trình bồi thường, khảo sát hài lòng',
      document: {
        awl: '0.1', workflow: 'insurance-renewal', name: 'Quy trình bảo hiểm',
        category: 'membership', industry: 'insurance',
        trigger: { kind: 'schedule', config: { cron: '0 10 * * *' } },
        steps: [
          { id: 'check', name: 'Kiểm tra hợp đồng sắp hết hạn', type: 'action', config: { action: 'query_expiring', days: 30 } },
          { id: 'renewal', name: 'Gửi thông báo gia hạn', type: 'send', config: { channel: 'zalo', template: 'renewal_notice_vi' }, depends_on: ['check'] },
          { id: 'wait-15d', name: 'Chờ 15 ngày', type: 'wait', config: { seconds: 1296000 } },
          { id: 'urgent', name: 'Nhắc khẩn còn 15 ngày', type: 'send', config: { channel: 'zalo', template: 'renewal_urgent_vi' }, depends_on: ['renewal'] },
          { id: 'cancel-check', name: 'Kiểm tra sau hết hạn', type: 'condition', config: { field: 'policy.renewed', equals: 'false' } },
          { id: 'reactivate', name: 'Gửi offer tái kích hoạt', type: 'send', config: { channel: 'email', template: 'reactivate_offer' }, depends_on: ['urgent', 'cancel-check'] },
        ],
      },
    };
  }
}
