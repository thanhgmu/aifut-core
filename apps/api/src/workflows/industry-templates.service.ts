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
      this.logisticsDelivery(),
      this.ecommerceAbandonedCart(),
      this.salonBooking(),
      this.dentalClinic(),
      this.vetClinic(),
      this.coworkingSpace(),
      this.carRental(),
      this.daycarePreschool(),
      this.laundryService(),
      this.photographyStudio(),
      this.cleaningService(),
      this.weddingPlanning(),
      this.foodDelivery(),
      this.petGrooming(),
      this.itSupport(),
      this.recruitment(),
      this.eventManagement(),
      this.yogaStudio(),
      this.tutoringCenter(),
      this.warehouseManagement(),
      this.pharmacyPrescription(),
      this.optometryEyewear(),
      this.massageSpa(),
      this.cateringService(),
      this.groceryDelivery(),
      this.landscapingService(),
      this.securityMonitoring(),
      this.staffingAgency(),
      this.movingService(),
      this.towingAssistance(),
      this.recyclingService(),
      this.printingShop(),
      this.digitalAgency(),
      this.subscriptionBox(),
      this.equipmentRental(),
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

  // ══════════════════════════════════════════════════════════════════════
  // 20 NEW INDUSTRY TEMPLATES (Phase 2 expansion - batch 2)
  // ══════════════════════════════════════════════════════════════════════

  private logisticsDelivery(): IndustryTemplate {
    return {
      slug: 'logistics-delivery-flow',
      name: 'Logistics - Giao hàng realtime',
      industry: 'logistics',
      description: 'Xác nhận đơn giao, cập nhật trạng thái realtime, xác nhận nhận hàng, feedback',
      document: {
        awl: '0.1', workflow: 'logistics-delivery', name: 'Giao hàng realtime',
        category: 'order', industry: 'logistics',
        trigger: { kind: 'event', config: { event: 'delivery.created' } },
        steps: [
          { id: 'pickup', name: 'Xác nhận lấy hàng', type: 'send', config: { channel: 'zalo', template: 'pickup_confirm_vi' } },
          { id: 'in-transit', name: 'Đang vận chuyển', type: 'send', config: { channel: 'zalo', template: 'in_transit_vi' } },
          { id: 'out-for-delivery', name: 'Đang giao', type: 'send', config: { channel: 'zalo', template: 'out_for_delivery_vi' } },
          { id: 'delivered', name: 'Xác nhận giao thành công', type: 'send', config: { channel: 'zalo', template: 'delivered_confirm_vi' } },
          { id: 'wait-feedback', name: 'Chờ 2h sau giao', type: 'wait', config: { seconds: 7200 } },
          { id: 'rating', name: 'Yêu cầu đánh giá', type: 'send', config: { channel: 'zalo', template: 'delivery_rating_vi' }, depends_on: ['delivered'] },
        ],
      },
    };
  }

  private ecommerceAbandonedCart(): IndustryTemplate {
    return {
      slug: 'ecommerce-cart-recovery',
      name: 'E-commerce - Recovery giỏ hàng',
      industry: 'retail',
      description: 'Phát hiện giỏ hàng bỏ quên sau 30 phút, nhắc 3 lần, tặng voucher giảm giá',
      document: {
        awl: '0.1', workflow: 'ecom-cart-recovery', name: 'Recovery giỏ hàng',
        category: 'marketing', industry: 'retail',
        trigger: { kind: 'event', config: { event: 'cart.abandoned' } },
        steps: [
          { id: 'wait-30m', name: 'Chờ 30 phút', type: 'wait', config: { seconds: 1800 } },
          { id: 'first-nudge', name: 'Nhắc lần 1 - Bạn quên gì đó', type: 'send', config: { channel: 'zalo', template: 'cart_nudge1_vi' } },
          { id: 'wait-4h', name: 'Chờ 4 tiếng', type: 'wait', config: { seconds: 14400 } },
          { id: 'check-still', name: 'Kiểm tra giỏ hàng vẫn còn', type: 'condition', config: { field: 'cart.abandoned', equals: 'true' } },
          { id: 'second-nudge', name: 'Nhắc lần 2 - Hàng sắp hết', type: 'send', config: { channel: 'email', template: 'cart_nudge2' }, depends_on: ['wait-4h', 'check-still'] },
          { id: 'wait-24h', name: 'Chờ 24 tiếng', type: 'wait', config: { seconds: 86400 } },
          { id: 'voucher', name: 'Tặng voucher 10% để chốt', type: 'send', config: { channel: 'zalo', template: 'cart_voucher_vi' }, depends_on: ['second-nudge'] },
        ],
      },
    };
  }

  private salonBooking(): IndustryTemplate {
    return {
      slug: 'salon-booking-flow',
      name: 'Salon/Tóc - Đặt lịch + Nhắc hẹn',
      industry: 'beauty',
      description: 'Xác nhận đặt lịch, nhắc trước 3 tiếng, gửi ảnh mẫu, feedback sau dịch vụ',
      document: {
        awl: '0.1', workflow: 'salon-booking', name: 'Đặt lịch Salon',
        category: 'booking', industry: 'beauty',
        trigger: { kind: 'event', config: { event: 'appointment.created' } },
        steps: [
          { id: 'confirm', name: 'Xác nhận lịch hẹn', type: 'send', config: { channel: 'zalo', template: 'salon_confirm_vi' } },
          { id: 'style-suggest', name: 'Gửi ảnh mẫu kiểu tóc', type: 'send', config: { channel: 'zalo', template: 'style_suggest_vi' } },
          { id: 'wait-3h', name: 'Chờ 3 tiếng', type: 'wait', config: { seconds: 10800 } },
          { id: 'remind', name: 'Nhắc lịch + hướng dẫn đường', type: 'send', config: { channel: 'zalo', template: 'salon_remind_vi' }, depends_on: ['confirm'] },
          { id: 'post-service', name: 'Feedback sau 4 tiếng', type: 'wait', config: { seconds: 14400 } },
          { id: 'feedback', name: 'Gửi survey hài lòng', type: 'send', config: { channel: 'zalo', template: 'salon_feedback_vi' }, depends_on: ['post-service'] },
        ],
      },
    };
  }

  private dentalClinic(): IndustryTemplate {
    return {
      slug: 'dental-clinic-flow',
      name: 'Nha khoa - Lịch hẹn + Tái khám',
      industry: 'healthcare',
      description: 'Xác nhận lịch hẹn nha khoa, nhắc trước 1 ngày, hướng dẫn vệ sinh, nhắc tái khám 6 tháng',
      document: {
        awl: '0.1', workflow: 'dental-appt', name: 'Lịch hẹn nha khoa',
        category: 'booking', industry: 'healthcare',
        trigger: { kind: 'event', config: { event: 'dental_appointment.created' } },
        steps: [
          { id: 'confirm', name: 'Xác nhận lịch hẹn', type: 'send', config: { channel: 'zalo', template: 'dental_confirm_vi' } },
          { id: 'day-before', name: 'Nhắc 1 ngày trước', type: 'wait', config: { seconds: 86400 } },
          { id: 'remind', name: 'Nhắc + lưu ý trước khi đi', type: 'send', config: { channel: 'zalo', template: 'dental_remind_vi' } },
          { id: 'post-care', name: 'Hướng dẫn chăm sóc sau hẹn', type: 'send', config: { channel: 'zalo', template: 'dental_postcare_vi' } },
          { id: 'wait-6mo', name: 'Chờ 6 tháng', type: 'wait', config: { seconds: 15768000 } },
          { id: 'recheck', name: 'Nhắc khám định kỳ 6 tháng', type: 'send', config: { channel: 'zalo', template: 'dental_recheck_vi' }, depends_on: ['post-care'] },
        ],
      },
    };
  }

  private vetClinic(): IndustryTemplate {
    return {
      slug: 'vet-clinic-flow',
      name: 'Phòng khám thú y - Lịch tiêm + Sức khỏe',
      industry: 'healthcare',
      description: 'Nhắc lịch tiêm phòng, theo dõi sức khỏe thú cưng, nhắc tái khám',
      document: {
        awl: '0.1', workflow: 'vet-clinic', name: 'Quy trình phòng khám thú y',
        category: 'booking', industry: 'healthcare',
        trigger: { kind: 'event', config: { event: 'pet_appointment.created' } },
        steps: [
          { id: 'confirm', name: 'Xác nhận lịch khám', type: 'send', config: { channel: 'zalo', template: 'vet_confirm_vi' } },
          { id: 'prep', name: 'Hướng dẫn trước khám', type: 'send', config: { channel: 'zalo', template: 'vet_prep_vi' } },
          { id: 'day-before', name: 'Nhắc 1 ngày trước', type: 'wait', config: { seconds: 86400 } },
          { id: 'remind', name: 'Nhắc lịch + hướng dẫn', type: 'send', config: { channel: 'zalo', template: 'vet_remind_vi' } },
          { id: 'vaccine-schedule', name: 'Lịch tiêm nhắc lại', type: 'send', config: { channel: 'zalo', template: 'vaccine_schedule_vi' } },
          { id: 'wait-30d', name: 'Chờ 30 ngày', type: 'wait', config: { seconds: 2592000 } },
          { id: 'health-check', name: 'Nhắc kiểm tra sức khỏe', type: 'send', config: { channel: 'zalo', template: 'pet_healthcheck_vi' }, depends_on: ['vaccine-schedule'] },
        ],
      },
    };
  }

  private coworkingSpace(): IndustryTemplate {
    return {
      slug: 'coworking-space-flow',
      name: 'Coworking - Đặt chỗ + Gia hạn',
      industry: 'services',
      description: 'Xác nhận đặt chỗ, nhắc check-in, thông báo hết giờ, offer gia hạn membership',
      document: {
        awl: '0.1', workflow: 'coworking-booking', name: 'Đặt chỗ Coworking',
        category: 'booking', industry: 'services',
        trigger: { kind: 'event', config: { event: 'booking.created' } },
        steps: [
          { id: 'confirm', name: 'Xác nhận đặt chỗ', type: 'send', config: { channel: 'zalo', template: 'coworking_confirm_vi' } },
          { id: 'checkin-remind', name: 'Nhắc check-in sáng hôm sau', type: 'wait', config: { seconds: 43200 } },
          { id: 'checkin', name: 'Gửi mã QR check-in', type: 'send', config: { channel: 'zalo', template: 'coworking_qr_vi' } },
          { id: 'end-notify', name: 'Thông báo sắp hết giờ', type: 'send', config: { channel: 'zalo', template: 'coworking_end_vi' } },
          { id: 'feedback', name: 'Feedback + extend offer', type: 'send', config: { channel: 'email', template: 'coworking_feedback' } },
        ],
      },
    };
  }

  private carRental(): IndustryTemplate {
    return {
      slug: 'car-rental-flow',
      name: 'Thuê xe tự lái - Nhận/Trả xe',
      industry: 'automotive',
      description: 'Xác nhận đặt xe, hướng dẫn nhận xe, nhắc trả xe, xử lý phí quá hạn',
      document: {
        awl: '0.1', workflow: 'car-rental', name: 'Quy trình thuê xe',
        category: 'booking', industry: 'automotive',
        trigger: { kind: 'event', config: { event: 'rental.created' } },
        steps: [
          { id: 'confirm', name: 'Xác nhận đặt xe', type: 'send', config: { channel: 'zalo', template: 'rental_confirm_vi' } },
          { id: 'day-before', name: 'Hướng dẫn nhận xe', type: 'send', config: { channel: 'zalo', template: 'rental_pickup_vi' } },
          { id: 'pickup', name: 'Xác nhận đã nhận xe', type: 'send', config: { channel: 'zalo', template: 'rental_picked_vi' } },
          { id: 'return-remind', name: 'Nhắc trả xe trước 2h', type: 'wait', config: { seconds: 7200 } },
          { id: 'return', name: 'Hướng dẫn trả xe', type: 'send', config: { channel: 'zalo', template: 'rental_return_vi' } },
          { id: 'overdue', name: 'Xử lý trả xe trễ', type: 'condition', config: { field: 'rental.returned_on_time', equals: 'false' } },
          { id: 'late-fee', name: 'Thông báo phí quá hạn', type: 'send', config: { channel: 'zalo', template: 'rental_late_fee_vi' }, depends_on: ['return', 'overdue'] },
        ],
      },
    };
  }

  private daycarePreschool(): IndustryTemplate {
    return {
      slug: 'daycare-preschool-flow',
      name: 'Nhà trẻ/Mầm non - Điểm danh hàng ngày',
      industry: 'education',
      description: 'Điểm danh sáng/chiều, báo ăn uống, nhắc đóng học phí, báo cáo tháng',
      document: {
        awl: '0.1', workflow: 'daycare-daily', name: 'Điểm danh nhà trẻ',
        category: 'attendance', industry: 'education',
        trigger: { kind: 'schedule', config: { cron: '0 7 * * 1-5' } },
        steps: [
          { id: 'morning', name: 'Gửi thông báo đón/trả', type: 'send', config: { channel: 'zalo', template: 'daycare_morning_vi' } },
          { id: 'meal-report', name: 'Báo ăn trưa', type: 'send', config: { channel: 'zalo', template: 'daycare_meal_vi' } },
          { id: 'nap-report', name: 'Báo giấc ngủ', type: 'send', config: { channel: 'zalo', template: 'daycare_nap_vi' } },
          { id: 'pickup', name: 'Báo giờ đón + hoạt động', type: 'send', config: { channel: 'zalo', template: 'daycare_pickup_vi' } },
          { id: 'end-month', name: 'Báo cáo cuối tháng', type: 'send', config: { channel: 'email', template: 'daycare_monthly' } },
        ],
      },
    };
  }

  private laundryService(): IndustryTemplate {
    return {
      slug: 'laundry-service-flow',
      name: 'Giặt ủi - Nhận/Giao đồ',
      industry: 'services',
      description: 'Xác nhận nhận đồ, thông báo tiến độ giặt, thông báo giao hàng, feedback',
      document: {
        awl: '0.1', workflow: 'laundry-order', name: 'Quy trình giặt ủi',
        category: 'order', industry: 'services',
        trigger: { kind: 'event', config: { event: 'laundry_order.created' } },
        steps: [
          { id: 'received', name: 'Xác nhận đã nhận đồ', type: 'send', config: { channel: 'zalo', template: 'laundry_received_vi' } },
          { id: 'washing', name: 'Đang giặt', type: 'send', config: { channel: 'zalo', template: 'laundry_washing_vi' } },
          { id: 'drying', name: 'Đang sấy/gấp', type: 'send', config: { channel: 'zalo', template: 'laundry_drying_vi' } },
          { id: 'ready', name: 'Đồ đã sẵn sàng', type: 'send', config: { channel: 'zalo', template: 'laundry_ready_vi' } },
          { id: 'delivery', name: 'Đang giao', type: 'send', config: { channel: 'zalo', template: 'laundry_delivery_vi' } },
          { id: 'delivered', name: 'Xác nhận giao + feedback', type: 'send', config: { channel: 'zalo', template: 'laundry_done_vi' } },
        ],
      },
    };
  }

  private photographyStudio(): IndustryTemplate {
    return {
      slug: 'photography-studio-flow',
      name: 'Studio chụp ảnh - Booking + Gửi ảnh',
      industry: 'services',
      description: 'Xác nhận lịch chụp, hướng dẫn chuẩn bị, gửi ảnh preview, nhắc khách lấy ảnh',
      document: {
        awl: '0.1', workflow: 'photo-studio', name: 'Quy trình studio ảnh',
        category: 'booking', industry: 'services',
        trigger: { kind: 'event', config: { event: 'photo_session.created' } },
        steps: [
          { id: 'confirm', name: 'Xác nhận lịch chụp', type: 'send', config: { channel: 'zalo', template: 'photo_confirm_vi' } },
          { id: 'prep-guide', name: 'Hướng dẫn chuẩn bị', type: 'send', config: { channel: 'zalo', template: 'photo_prep_vi' } },
          { id: 'day-before', name: 'Nhắc lịch chụp', type: 'send', config: { channel: 'zalo', template: 'photo_remind_vi' } },
          { id: 'post-shoot', name: 'Cảm ơn + thời gian nhận ảnh', type: 'send', config: { channel: 'zalo', template: 'photo_thanks_vi' } },
          { id: 'wait-7d', name: 'Chờ 7 ngày xử lý ảnh', type: 'wait', config: { seconds: 604800 } },
          { id: 'gallery', name: 'Gửi gallery + album online', type: 'send', config: { channel: 'email', template: 'photo_gallery' }, depends_on: ['post-shoot'] },
        ],
      },
    };
  }

  private cleaningService(): IndustryTemplate {
    return {
      slug: 'cleaning-service-flow',
      name: 'Dịch vụ vệ sinh - Lịch định kỳ',
      industry: 'services',
      description: 'Xác nhận lịch vệ sinh, nhắc trước 1 ngày, feedback sau dọn, offer lịch định kỳ',
      document: {
        awl: '0.1', workflow: 'cleaning-service', name: 'Vệ sinh định kỳ',
        category: 'service', industry: 'services',
        trigger: { kind: 'event', config: { event: 'cleaning.created' } },
        steps: [
          { id: 'confirm', name: 'Xác nhận lịch vệ sinh', type: 'send', config: { channel: 'zalo', template: 'cleaning_confirm_vi' } },
          { id: 'day-before', name: 'Nhắc lịch', type: 'wait', config: { seconds: 86400 } },
          { id: 'remind', name: 'Nhắc + hướng dẫn chuẩn bị', type: 'send', config: { channel: 'zalo', template: 'cleaning_remind_vi' } },
          { id: 'done', name: 'Xác nhận hoàn thành', type: 'send', config: { channel: 'zalo', template: 'cleaning_done_vi' } },
          { id: 'feedback', name: 'Feedback + offer recurring', type: 'send', config: { channel: 'zalo', template: 'cleaning_feedback_vi' } },
          { id: 'schedule-next', name: 'Gửi lịch định kỳ tuần sau', type: 'send', config: { channel: 'email', template: 'cleaning_schedule_next' } },
        ],
      },
    };
  }

  private weddingPlanning(): IndustryTemplate {
    return {
      slug: 'wedding-planning-flow',
      name: 'Cưới hỏi - Timeline + Vendor coordination',
      industry: 'services',
      description: 'Timeline đám cưới, nhắc mốc quan trọng, phối hợp vendor, guest list management',
      document: {
        awl: '0.1', workflow: 'wedding-plan', name: 'Timeline đám cưới',
        category: 'project', industry: 'services',
        trigger: { kind: 'event', config: { event: 'wedding.created' } },
        steps: [
          { id: 'welcome', name: 'Chào mừng + timeline tổng quan', type: 'send', config: { channel: 'zalo', template: 'wedding_welcome_vi' } },
          { id: 'vendor-remind', name: 'Nhắc đặt vendor 3 tháng', type: 'send', config: { channel: 'email', template: 'wedding_vendor_remind' } },
          { id: 'guest-list', name: 'Nhắc gửi danh sách khách', type: 'send', config: { channel: 'zalo', template: 'wedding_guest_vi' } },
          { id: 'wait-1mo', name: 'Chờ 1 tháng', type: 'wait', config: { seconds: 2592000 } },
          { id: 'd-day-30', name: 'Checklist 30 ngày', type: 'send', config: { channel: 'email', template: 'wedding_d30_checklist' } },
          { id: 'wait-7d', name: 'Chờ 23 ngày', type: 'wait', config: { seconds: 1987200 } },
          { id: 'd-day-7', name: 'Checklist 7 ngày cuối', type: 'send', config: { channel: 'zalo', template: 'wedding_d7_vi' }, depends_on: ['d-day-30'] },
          { id: 'post-wedding', name: 'Cảm ơn + album', type: 'send', config: { channel: 'zalo', template: 'wedding_thanks_vi' } },
        ],
      },
    };
  }

  private foodDelivery(): IndustryTemplate {
    return {
      slug: 'food-delivery-tracking',
      name: 'Giao đồ ăn - Tracking đơn hàng',
      industry: 'food',
      description: 'Xác nhận đơn, cập nhật đầu bếp/đang giao, feedback sau nhận',
      document: {
        awl: '0.1', workflow: 'food-delivery', name: 'Giao đồ ăn tracking',
        category: 'order', industry: 'food',
        trigger: { kind: 'event', config: { event: 'food_order.created' } },
        steps: [
          { id: 'confirm', name: 'Xác nhận đơn hàng', type: 'send', config: { channel: 'zalo', template: 'food_confirm_vi' } },
          { id: 'preparing', name: 'Đầu bếp đang chế biến', type: 'send', config: { channel: 'zalo', template: 'food_preparing_vi' } },
          { id: 'ready', name: 'Đồ ăn đã sẵn sàng', type: 'send', config: { channel: 'zalo', template: 'food_ready_vi' } },
          { id: 'picked-up', name: 'Shipper đã lấy hàng', type: 'send', config: { channel: 'zalo', template: 'food_picked_vi' } },
          { id: 'in-transit', name: 'Đang giao - ETA 15 phút', type: 'send', config: { channel: 'zalo', template: 'food_eta_vi' } },
          { id: 'delivered', name: 'Xác nhận giao thành công', type: 'send', config: { channel: 'zalo', template: 'food_delivered_vi' } },
          { id: 'feedback', name: 'Feedback + đánh giá', type: 'send', config: { channel: 'zalo', template: 'food_feedback_vi' }, depends_on: ['delivered'] },
        ],
      },
    };
  }

  private petGrooming(): IndustryTemplate {
    return {
      slug: 'pet-grooming-flow',
      name: 'Cắt tỉa thú cưng - Spaw',
      industry: 'services',
      description: 'Đặt lịch grooming, hướng dẫn trước khi đưa thú cưng, gửi ảnh sau grooming',
      document: {
        awl: '0.1', workflow: 'pet-grooming', name: 'Dịch vụ Spaw cho thú cưng',
        category: 'booking', industry: 'services',
        trigger: { kind: 'event', config: { event: 'grooming.created' } },
        steps: [
          { id: 'confirm', name: 'Xác nhận lịch grooming', type: 'send', config: { channel: 'zalo', template: 'grooming_confirm_vi' } },
          { id: 'prep', name: 'Hướng dẫn trước khi đưa', type: 'send', config: { channel: 'zalo', template: 'grooming_prep_vi' } },
          { id: 'day-before', name: 'Nhắc lịch', type: 'send', config: { channel: 'zalo', template: 'grooming_remind_vi' } },
          { id: 'in-progress', name: 'Thông báo đang grooming', type: 'send', config: { channel: 'zalo', template: 'grooming_progress_vi' } },
          { id: 'done', name: 'Gửi ảnh sau grooming', type: 'send', config: { channel: 'zalo', template: 'grooming_result_vi' } },
          { id: 'feedback', name: 'Đánh giá + đặt lịch kỳ sau', type: 'send', config: { channel: 'zalo', template: 'grooming_feedback_vi' }, depends_on: ['done'] },
        ],
      },
    };
  }

  private itSupport(): IndustryTemplate {
    return {
      slug: 'it-support-flow',
      name: 'IT Support - Ticket management',
      industry: 'services',
      description: 'Xác nhận ticket, cập nhật tiến độ, SLA nhắc nhở, feedback sau đóng ticket',
      document: {
        awl: '0.1', workflow: 'it-ticket', name: 'Quy trình IT Support',
        category: 'service', industry: 'services',
        trigger: { kind: 'event', config: { event: 'ticket.created' } },
        steps: [
          { id: 'acknowledge', name: 'Xác nhận đã nhận ticket', type: 'send', config: { channel: 'email', template: 'ticket_acknowledge' } },
          { id: 'assigned', name: 'Thông báo đã phân công', type: 'send', config: { channel: 'zalo', template: 'ticket_assigned_vi' } },
          { id: 'wait-4h', name: 'Chờ 4h - SLA check', type: 'wait', config: { seconds: 14400 } },
          { id: 'sla-check', name: 'Kiểm tra ticket còn mở', type: 'condition', config: { field: 'ticket.status', not_equals: 'resolved' } },
          { id: 'sla-warning', name: 'Nhắc SLA - ticket quá 4h', type: 'send', config: { channel: 'zalo', template: 'ticket_sla_vi' }, depends_on: ['wait-4h', 'sla-check'] },
          { id: 'resolved', name: 'Thông báo đã giải quyết', type: 'send', config: { channel: 'email', template: 'ticket_resolved' } },
          { id: 'feedback', name: 'Survey hài lòng', type: 'send', config: { channel: 'email', template: 'ticket_feedback' }, depends_on: ['resolved'] },
        ],
      },
    };
  }

  private recruitment(): IndustryTemplate {
    return {
      slug: 'recruitment-flow',
      name: 'Tuyển dụng - Vòng phỏng vấn + Offer',
      industry: 'services',
      description: 'Xác nhận đơn ứng tuyển, lên lịch phỏng vấn, nhắc, gửi offer, onboarding',
      document: {
        awl: '0.1', workflow: 'recruitment', name: 'Quy trình tuyển dụng',
        category: 'crm', industry: 'services',
        trigger: { kind: 'event', config: { event: 'application.created' } },
        steps: [
          { id: 'acknowledge', name: 'Xác nhận đã nhận hồ sơ', type: 'send', config: { channel: 'email', template: 'app_received' } },
          { id: 'screen', name: 'Sàng lọc CV', type: 'action', config: { action: 'auto_screen' } },
          { id: 'invite', name: 'Gửi lịch phỏng vấn', type: 'send', config: { channel: 'email', template: 'interview_invite' }, depends_on: ['screen'] },
          { id: 'day-before', name: 'Nhắc phỏng vấn ngày mai', type: 'send', config: { channel: 'zalo', template: 'interview_remind_vi' } },
          { id: 'post-interview', name: 'Feedback sau phỏng vấn', type: 'send', config: { channel: 'email', template: 'interview_feedback' } },
          { id: 'offer', name: 'Gửi offer letter', type: 'send', config: { channel: 'email', template: 'offer_letter' }, depends_on: ['post-interview'] },
          { id: 'onboarding', name: 'Hướng dẫn nhận việc', type: 'send', config: { channel: 'zalo', template: 'onboarding_guide_vi' }, depends_on: ['offer'] },
        ],
      },
    };
  }

  private eventManagement(): IndustryTemplate {
    return {
      slug: 'event-management-flow',
      name: 'Quản lý sự kiện - RSVP + Check-in',
      industry: 'services',
      description: 'Gửi invite, theo dõi RSVP, nhắc trước sự kiện, check-in QR, feedback',
      document: {
        awl: '0.1', workflow: 'event-mgmt', name: 'Quản lý sự kiện',
        category: 'marketing', industry: 'services',
        trigger: { kind: 'event', config: { event: 'event.created' } },
        steps: [
          { id: 'invite', name: 'Gửi invitation', type: 'send', config: { channel: 'email', template: 'event_invite' } },
          { id: 'wait-7d', name: 'Chờ 7 ngày', type: 'wait', config: { seconds: 604800 } },
          { id: 'rsvp-check', name: 'Kiểm tra RSVP', type: 'condition', config: { field: 'guest.rsvp_status', equals: 'pending' } },
          { id: 'remind', name: 'Nhắc RSVP', type: 'send', config: { channel: 'zalo', template: 'event_rsvp_remind_vi' }, depends_on: ['wait-7d', 'rsvp-check'] },
          { id: 'day-before', name: 'Nhắc trước sự kiện', type: 'send', config: { channel: 'zalo', template: 'event_d1_vi' } },
          { id: 'qr-code', name: 'Gửi QR check-in', type: 'send', config: { channel: 'zalo', template: 'event_qr_vi' } },
          { id: 'post-event', name: 'Feedback + ảnh sự kiện', type: 'send', config: { channel: 'email', template: 'event_post' } },
        ],
      },
    };
  }

  private yogaStudio(): IndustryTemplate {
    return {
      slug: 'yoga-studio-flow',
      name: 'Yoga/Pilates - Đặt lớp + Duy trì tập',
      industry: 'fitness',
      description: 'Đặt lớp yoga, nhắc lịch tập, theo dõi chuỗi ngày tập, nhắc đóng phí',
      document: {
        awl: '0.1', workflow: 'yoga-studio', name: 'Quy trình lớp Yoga',
        category: 'booking', industry: 'fitness',
        trigger: { kind: 'event', config: { event: 'class_booking.created' } },
        steps: [
          { id: 'confirm', name: 'Xác nhận đặt lớp', type: 'send', config: { channel: 'zalo', template: 'yoga_confirm_vi' } },
          { id: 'day-before', name: 'Nhắc lịch tập', type: 'send', config: { channel: 'zalo', template: 'yoga_remind_vi' } },
          { id: 'checkin', name: 'Check-in + cảm ơn', type: 'send', config: { channel: 'zalo', template: 'yoga_checkin_vi' } },
          { id: 'streak', name: 'Chuỗi tập: chúc mừng streak', type: 'send', config: { channel: 'zalo', template: 'yoga_streak_vi' } },
          { id: 'wait-30d', name: 'Chờ 30 ngày', type: 'wait', config: { seconds: 2592000 } },
          { id: 'membership', name: 'Offer membership renewal', type: 'send', config: { channel: 'zalo', template: 'yoga_renewal_vi' } },
        ],
      },
    };
  }

  private tutoringCenter(): IndustryTemplate {
    return {
      slug: 'tutoring-center-flow',
      name: 'Trung tâm gia sư - Đăng ký lớp',
      industry: 'education',
      description: 'Xác nhận đăng ký, lịch học, báo cáo tiến độ tuần, nhắc đóng học phí',
      document: {
        awl: '0.1', workflow: 'tutoring-center', name: 'Quy trình trung tâm gia sư',
        category: 'booking', industry: 'education',
        trigger: { kind: 'event', config: { event: 'enrollment.created' } },
        steps: [
          { id: 'welcome', name: 'Chào mừng + lịch học', type: 'send', config: { channel: 'zalo', template: 'tutor_welcome_vi' } },
          { id: 'schedule', name: 'Gửi lịch học chi tiết', type: 'send', config: { channel: 'zalo', template: 'tutor_schedule_vi' } },
          { id: 'weekly-report', name: 'Báo cáo tiến độ tuần', type: 'send', config: { channel: 'zalo', template: 'tutor_weekly_vi' } },
          { id: 'fee-remind', name: 'Nhắc đóng học phí tháng', type: 'send', config: { channel: 'zalo', template: 'tutor_fee_vi' } },
          { id: 'exam-alert', name: 'Nhắc lịch thi + ôn tập', type: 'send', config: { channel: 'zalo', template: 'tutor_exam_vi' } },
          { id: 'feedback', name: 'Feedback phụ huynh cuối tháng', type: 'send', config: { channel: 'email', template: 'tutor_parent_report' } },
        ],
      },
    };
  }

  private warehouseManagement(): IndustryTemplate {
    return {
      slug: 'warehouse-management-flow',
      name: 'Quản lý kho - Nhập/Xuất tồn',
      industry: 'logistics',
      description: 'Cảnh báo tồn kho thấp, nhắc kiểm kê, xác nhận nhập hàng, báo cáo cuối tháng',
      document: {
        awl: '0.1', workflow: 'warehouse-mgmt', name: 'Quản lý kho thông minh',
        category: 'inventory', industry: 'logistics',
        trigger: { kind: 'schedule', config: { cron: '0 8 * * 1' } },
        steps: [
          { id: 'stock-check', name: 'Kiểm tra tồn kho thấp', type: 'action', config: { action: 'low_stock_alert', threshold: 10 } },
          { id: 'low-stock', name: 'Cảnh báo tồn kho thấp', type: 'send', config: { channel: 'zalo', template: 'stock_low_vi' }, depends_on: ['stock-check'] },
          { id: 'inbound', name: 'Xác nhận nhập hàng', type: 'send', config: { channel: 'zalo', template: 'stock_inbound_vi' } },
          { id: 'outbound', name: 'Xác nhận xuất hàng', type: 'send', config: { channel: 'zalo', template: 'stock_outbound_vi' } },
          { id: 'wait-7d', name: 'Chờ 7 ngày', type: 'wait', config: { seconds: 604800 } },
          { id: 'expiry', name: 'Cảnh báo hàng sắp hết hạn', type: 'send', config: { channel: 'zalo', template: 'stock_expiry_vi' } },
          { id: 'monthly', name: 'Báo cáo tồn kho tháng', type: 'send', config: { channel: 'email', template: 'stock_monthly_report' } },
        ],
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // 15 FINAL INDUSTRY TEMPLATES (Wave 3 — hit 50/50+)
  // ══════════════════════════════════════════════════════════════════════

  private pharmacyPrescription(): IndustryTemplate {
    return {
      slug: 'pharmacy-prescription-flow',
      name: 'Nhà thuốc - Đơn thuốc + Nhắc uống',
      industry: 'healthcare',
      description: 'Nhắc uống thuốc theo đơn, thông báo thuốc sẵn sàng, nhắc tái khám, tư vấn sức khỏe',
      document: {
        awl: '0.1', workflow: 'pharmacy-rx', name: 'Quy trình nhà thuốc',
        category: 'health', industry: 'healthcare',
        trigger: { kind: 'event', config: { event: 'prescription.created' } },
        steps: [
          { id: 'ready', name: 'Thuốc đã sẵn sàng', type: 'send', config: { channel: 'zalo', template: 'rx_ready_vi' } },
          { id: 'picked-up', name: 'Hướng dẫn sử dụng', type: 'send', config: { channel: 'zalo', template: 'rx_instructions_vi' } },
          { id: 'wait-24h', name: 'Chờ 24h', type: 'wait', config: { seconds: 86400 } },
          { id: 'medication-remind', name: 'Nhắc uống thuốc', type: 'send', config: { channel: 'zalo', template: 'rx_reminder_vi' }, depends_on: ['picked-up'] },
          { id: 'wait-7d', name: 'Chờ 7 ngày', type: 'wait', config: { seconds: 604800 } },
          { id: 'refill', name: 'Nhắc mua thêm/thăm khám', type: 'send', config: { channel: 'zalo', template: 'rx_refill_vi' }, depends_on: ['medication-remind'] },
        ],
      },
    };
  }

  private optometryEyewear(): IndustryTemplate {
    return {
      slug: 'optometry-eyewear-flow',
      name: 'Kính mắt - Đo mắt + Nhận kính',
      industry: 'healthcare',
      description: 'Đặt lịch đo mắt, xác nhận đơn kính, thông báo kính sẵn sàng, nhắc khám định kỳ',
      document: {
        awl: '0.1', workflow: 'optometry-rx', name: 'Quy trình kính mắt',
        category: 'booking', industry: 'healthcare',
        trigger: { kind: 'event', config: { event: 'eye_exam.created' } },
        steps: [
          { id: 'confirm', name: 'Xác nhận lịch đo mắt', type: 'send', config: { channel: 'zalo', template: 'eye_confirm_vi' } },
          { id: 'exam-remind', name: 'Nhắc trước 1 ngày', type: 'wait', config: { seconds: 86400 } },
          { id: 'remind', name: 'Nhắc lịch đo', type: 'send', config: { channel: 'zalo', template: 'eye_remind_vi' } },
          { id: 'lens-ready', name: 'Kính đã sẵn sàng', type: 'send', config: { channel: 'zalo', template: 'eye_lens_ready_vi' } },
          { id: 'wait-6mo', name: 'Chờ 6 tháng', type: 'wait', config: { seconds: 15768000 } },
          { id: 'annual-check', name: 'Nhắc khám mắt định kỳ', type: 'send', config: { channel: 'zalo', template: 'eye_annual_vi' }, depends_on: ['lens-ready'] },
        ],
      },
    };
  }

  private massageSpa(): IndustryTemplate {
    return {
      slug: 'massage-wellness-flow',
      name: 'Massage/Wellness - Liệu trình + Membership',
      industry: 'beauty',
      description: 'Đặt lịch massage, nhắc liệu trình, theo dõi membership, feedback sau buổi',
      document: {
        awl: '0.1', workflow: 'massage-wellness', name: 'Liệu trình Massage',
        category: 'booking', industry: 'beauty',
        trigger: { kind: 'event', config: { event: 'therapy.created' } },
        steps: [
          { id: 'confirm', name: 'Xác nhận lịch massage', type: 'send', config: { channel: 'zalo', template: 'massage_confirm_vi' } },
          { id: 'day-before', name: 'Nhắc lịch 1 ngày trước', type: 'wait', config: { seconds: 86400 } },
          { id: 'remind', name: 'Nhắc lịch + chuẩn bị', type: 'send', config: { channel: 'zalo', template: 'massage_remind_vi' } },
          { id: 'session-done', name: 'Cảm ơn + feedback', type: 'send', config: { channel: 'zalo', template: 'massage_feedback_vi' } },
          { id: 'series-remind', name: 'Nhắc buổi tiếp theo trong liệu trình', type: 'send', config: { channel: 'zalo', template: 'massage_next_vi' } },
          { id: 'membership-renew', name: 'Offer gia hạn membership', type: 'send', config: { channel: 'email', template: 'massage_renewal' }, depends_on: ['session-done'] },
        ],
      },
    };
  }

  private cateringService(): IndustryTemplate {
    return {
      slug: 'catering-service-flow',
      name: 'Dịch vụ tiệc - Đặt tiệc + Thực đơn',
      industry: 'food',
      description: 'Xác nhận đặt tiệc, gửi thực đơn, xác nhận số lượng khách, nhắc sự kiện, feedback',
      document: {
        awl: '0.1', workflow: 'catering-order', name: 'Quy trình đặt tiệc',
        category: 'booking', industry: 'food',
        trigger: { kind: 'event', config: { event: 'catering_order.created' } },
        steps: [
          { id: 'confirm', name: 'Xác nhận đặt tiệc', type: 'send', config: { channel: 'zalo', template: 'catering_confirm_vi' } },
          { id: 'menu-send', name: 'Gửi thực đơn đề xuất', type: 'send', config: { channel: 'email', template: 'catering_menu' } },
          { id: 'guest-count', name: 'Yêu cầu xác nhận số khách', type: 'send', config: { channel: 'zalo', template: 'catering_guest_vi' } },
          { id: 'wait-3d', name: 'Chờ 3 ngày', type: 'wait', config: { seconds: 259200 } },
          { id: 'event-remind', name: 'Nhắc sự kiện sắp diễn ra', type: 'send', config: { channel: 'zalo', template: 'catering_event_vi' }, depends_on: ['guest-count'] },
          { id: 'post-event', name: 'Feedback + đặt lịch sau', type: 'send', config: { channel: 'zalo', template: 'catering_feedback_vi' }, depends_on: ['event-remind'] },
        ],
      },
    };
  }

  private groceryDelivery(): IndustryTemplate {
    return {
      slug: 'grocery-delivery-flow',
      name: 'Tạp hóa/Groceries - Đặt hàng online',
      industry: 'retail',
      description: 'Xác nhận đơn hàng, thông báo đang đóng gói, thông báo giao hàng, feedback',
      document: {
        awl: '0.1', workflow: 'grocery-order', name: 'Giao tạp hóa online',
        category: 'order', industry: 'retail',
        trigger: { kind: 'event', config: { event: 'grocery_order.created' } },
        steps: [
          { id: 'confirm', name: 'Xác nhận đơn hàng', type: 'send', config: { channel: 'zalo', template: 'grocery_confirm_vi' } },
          { id: 'packing', name: 'Đang đóng gói', type: 'send', config: { channel: 'zalo', template: 'grocery_packing_vi' } },
          { id: 'ready', name: 'Đã đóng gói xong', type: 'send', config: { channel: 'zalo', template: 'grocery_ready_vi' } },
          { id: 'out-for-delivery', name: 'Shipper đang giao', type: 'send', config: { channel: 'zalo', template: 'grocery_delivery_vi' } },
          { id: 'delivered', name: 'Xác nhận giao thành công', type: 'send', config: { channel: 'zalo', template: 'grocery_delivered_vi' } },
          { id: 'feedback', name: 'Đánh giá + đặt lại', type: 'send', config: { channel: 'zalo', template: 'grocery_feedback_vi' }, depends_on: ['delivered'] },
        ],
      },
    };
  }

  private landscapingService(): IndustryTemplate {
    return {
      slug: 'landscaping-service-flow',
      name: 'Cảnh quan/Sân vườn - Bảo trì định kỳ',
      industry: 'services',
      description: 'Xác nhận lịch bảo trì, nhắc trước, gửi ảnh sau dịch vụ, offer dịch vụ theo mùa',
      document: {
        awl: '0.1', workflow: 'landscaping-service', name: 'Bảo trì sân vườn',
        category: 'service', industry: 'services',
        trigger: { kind: 'event', config: { event: 'landscaping.created' } },
        steps: [
          { id: 'confirm', name: 'Xác nhận lịch bảo trì', type: 'send', config: { channel: 'zalo', template: 'garden_confirm_vi' } },
          { id: 'day-before', name: 'Nhắc lịch', type: 'wait', config: { seconds: 86400 } },
          { id: 'remind', name: 'Nhắc + hướng dẫn', type: 'send', config: { channel: 'zalo', template: 'garden_remind_vi' } },
          { id: 'done', name: 'Gửi ảnh sau thi công', type: 'send', config: { channel: 'zalo', template: 'garden_done_vi' } },
          { id: 'feedback', name: 'Feedback + lịch kế tiếp', type: 'send', config: { channel: 'zalo', template: 'garden_feedback_vi' } },
          { id: 'seasonal', name: 'Offer dịch vụ theo mùa', type: 'send', config: { channel: 'email', template: 'garden_seasonal' }, depends_on: ['done'] },
        ],
      },
    };
  }

  private securityMonitoring(): IndustryTemplate {
    return {
      slug: 'security-monitoring-flow',
      name: 'An ninh/Giám sát - Cảnh báo + Tuần tra',
      industry: 'services',
      description: 'Cảnh báo sự cố realtime, báo cáo tuần tra, nhắc bảo trì thiết bị, phản hồi khách hàng',
      document: {
        awl: '0.1', workflow: 'security-monitoring', name: 'Giám sát an ninh',
        category: 'monitoring', industry: 'services',
        trigger: { kind: 'event', config: { event: 'security.alert' } },
        steps: [
          { id: 'alert', name: 'Cảnh báo sự cố khẩn cấp', type: 'send', config: { channel: 'zalo', template: 'security_alert_vi' } },
          { id: 'dispatched', name: 'Đội ứng trực đã điều động', type: 'send', config: { channel: 'zalo', template: 'security_dispatched_vi' } },
          { id: 'resolved', name: 'Sự cố đã xử lý', type: 'send', config: { channel: 'zalo', template: 'security_resolved_vi' } },
          { id: 'patrol-report', name: 'Báo cáo tuần tra định kỳ', type: 'send', config: { channel: 'email', template: 'security_patrol' } },
          { id: 'wait-30d', name: 'Chờ 30 ngày', type: 'wait', config: { seconds: 2592000 } },
          { id: 'maintenance', name: 'Nhắc bảo trì thiết bị', type: 'send', config: { channel: 'zalo', template: 'security_maintenance_vi' }, depends_on: ['patrol-report'] },
        ],
      },
    };
  }

  private staffingAgency(): IndustryTemplate {
    return {
      slug: 'staffing-agency-flow',
      name: 'Cung ứng lao động - Điều phối nhân sự',
      industry: 'services',
      description: 'Xác nhận yêu cầu nhân sự, tìm ứng viên, xác nhận đi làm, timesheet, thanh toán',
      document: {
        awl: '0.1', workflow: 'staffing-agency', name: 'Cung ứng lao động',
        category: 'crm', industry: 'services',
        trigger: { kind: 'event', config: { event: 'staff_request.created' } },
        steps: [
          { id: 'acknowledge', name: 'Xác nhận yêu cầu', type: 'send', config: { channel: 'zalo', template: 'staff_ack_vi' } },
          { id: 'candidates', name: 'Gửi danh sách ứng viên', type: 'send', config: { channel: 'email', template: 'staff_candidates' } },
          { id: 'confirmed', name: 'Xác nhận ứng viên được chọn', type: 'send', config: { channel: 'zalo', template: 'staff_confirmed_vi' } },
          { id: 'day-before', name: 'Nhắc lịch đi làm', type: 'send', config: { channel: 'zalo', template: 'staff_remind_vi' } },
          { id: 'timesheet', name: 'Yêu cầu xác nhận timesheet', type: 'send', config: { channel: 'zalo', template: 'staff_timesheet_vi' } },
          { id: 'invoice', name: 'Gửi hóa đơn dịch vụ', type: 'send', config: { channel: 'email', template: 'staff_invoice' }, depends_on: ['timesheet'] },
        ],
      },
    };
  }

  private movingService(): IndustryTemplate {
    return {
      slug: 'moving-service-flow',
      name: 'Dịch vụ chuyển nhà/văn phòng',
      industry: 'services',
      description: 'Báo giá, xác nhận lịch, nhắc trước, cập nhật tiến độ, feedback sau dọn',
      document: {
        awl: '0.1', workflow: 'moving-service', name: 'Chuyển nhà/văn phòng',
        category: 'service', industry: 'services',
        trigger: { kind: 'event', config: { event: 'moving_request.created' } },
        steps: [
          { id: 'quote', name: 'Gửi báo giá', type: 'send', config: { channel: 'zalo', template: 'moving_quote_vi' } },
          { id: 'confirm', name: 'Xác nhận lịch chuyển', type: 'send', config: { channel: 'zalo', template: 'moving_confirm_vi' } },
          { id: 'day-before', name: 'Nhắc + checklist chuẩn bị', type: 'send', config: { channel: 'zalo', template: 'moving_checklist_vi' } },
          { id: 'in-progress', name: 'Đang chuyển đồ', type: 'send', config: { channel: 'zalo', template: 'moving_progress_vi' } },
          { id: 'done', name: 'Xác nhận hoàn thành', type: 'send', config: { channel: 'zalo', template: 'moving_done_vi' } },
          { id: 'feedback', name: 'Feedback + recommend bạn bè', type: 'send', config: { channel: 'zalo', template: 'moving_feedback_vi' }, depends_on: ['done'] },
        ],
      },
    };
  }

  private towingAssistance(): IndustryTemplate {
    return {
      slug: 'towing-roadside-flow',
      name: 'Cứu hộ giao thông - Cứu hộ 24/7',
      industry: 'automotive',
      description: 'Tiếp nhận yêu cầu cứu hộ, xác nhận vị trí, cập nhật ETA, xác nhận hoàn thành',
      document: {
        awl: '0.1', workflow: 'towing-assist', name: 'Cứu hộ giao thông',
        category: 'emergency', industry: 'automotive',
        trigger: { kind: 'event', config: { event: 'towing_request.created' } },
        steps: [
          { id: 'received', name: 'Đã nhận yêu cầu cứu hộ', type: 'send', config: { channel: 'zalo', template: 'towing_received_vi' } },
          { id: 'dispatched', name: 'Xe cứu hộ đang đến', type: 'send', config: { channel: 'zalo', template: 'towing_dispatched_vi' } },
          { id: 'eta', name: 'ETA - thời gian dự kiến', type: 'send', config: { channel: 'zalo', template: 'towing_eta_vi' } },
          { id: 'arrived', name: 'Xe cứu hộ đã tới nơi', type: 'send', config: { channel: 'zalo', template: 'towing_arrived_vi' } },
          { id: 'done', name: 'Hoàn thành cứu hộ', type: 'send', config: { channel: 'zalo', template: 'towing_done_vi' } },
          { id: 'feedback', name: 'Đánh giá dịch vụ', type: 'send', config: { channel: 'zalo', template: 'towing_feedback_vi' }, depends_on: ['done'] },
        ],
      },
    };
  }

  private recyclingService(): IndustryTemplate {
    return {
      slug: 'recycling-waste-flow',
      name: 'Tái chế/Rác thải - Lịch thu gom',
      industry: 'services',
      description: 'Thông báo lịch thu gom, nhắc khách hàng, xác nhận đã thu gom, báo cáo khối lượng',
      document: {
        awl: '0.1', workflow: 'recycling-collection', name: 'Thu gom tái chế',
        category: 'service', industry: 'services',
        trigger: { kind: 'schedule', config: { cron: '0 7 * * 1,3,5' } },
        steps: [
          { id: 'notify', name: 'Nhắc lịch thu gom hôm nay', type: 'send', config: { channel: 'zalo', template: 'recycle_notify_vi' } },
          { id: 'collected', name: 'Xác nhận đã thu gom', type: 'send', config: { channel: 'zalo', template: 'recycle_collected_vi' } },
          { id: 'weight-report', name: 'Báo cáo khối lượng tuần', type: 'send', config: { channel: 'email', template: 'recycle_weight' } },
          { id: 'missed', name: 'Xử lý lỡ lịch', type: 'condition', config: { field: 'collection.done', equals: 'false' } },
          { id: 'reschedule', name: 'Đặt lịch bù', type: 'send', config: { channel: 'zalo', template: 'recycle_reschedule_vi' }, depends_on: ['missed'] },
          { id: 'monthly', name: 'Báo cáo tháng + ảnh hưởng môi trường', type: 'send', config: { channel: 'email', template: 'recycle_monthly' } },
        ],
      },
    };
  }

  private printingShop(): IndustryTemplate {
    return {
      slug: 'printing-shop-flow',
      name: 'In ấn - Nhận đơn + Giao hàng',
      industry: 'services',
      description: 'Xác nhận đơn in, thông báo tiến độ, gửi proof cho khách duyệt, thông báo giao hàng',
      document: {
        awl: '0.1', workflow: 'print-shop', name: 'Quy trình in ấn',
        category: 'order', industry: 'services',
        trigger: { kind: 'event', config: { event: 'print_order.created' } },
        steps: [
          { id: 'confirm', name: 'Xác nhận đơn in', type: 'send', config: { channel: 'zalo', template: 'print_confirm_vi' } },
          { id: 'proof', name: 'Gửi proof cho khách duyệt', type: 'send', config: { channel: 'zalo', template: 'print_proof_vi' } },
          { id: 'approved', name: 'Xác nhận đã duyệt + đang in', type: 'send', config: { channel: 'zalo', template: 'print_printing_vi' } },
          { id: 'done', name: 'Đã in xong', type: 'send', config: { channel: 'zalo', template: 'print_done_vi' } },
          { id: 'shipped', name: 'Đã giao hàng', type: 'send', config: { channel: 'zalo', template: 'print_shipped_vi' } },
          { id: 'feedback', name: 'Feedback chất lượng', type: 'send', config: { channel: 'zalo', template: 'print_feedback_vi' }, depends_on: ['shipped'] },
        ],
      },
    };
  }

  private digitalAgency(): IndustryTemplate {
    return {
      slug: 'digital-agency-flow',
      name: 'Agency Digital - Quản lý dự án + Báo cáo',
      industry: 'services',
      description: 'Xác nhận dự án, báo cáo hàng tuần, campaign performance, nhắc thanh toán, retention',
      document: {
        awl: '0.1', workflow: 'digital-agency', name: 'Quy trình Agency Digital',
        category: 'project', industry: 'services',
        trigger: { kind: 'event', config: { event: 'project.created' } },
        steps: [
          { id: 'kickoff', name: 'Kickoff + timeline', type: 'send', config: { channel: 'email', template: 'agency_kickoff' } },
          { id: 'weekly-report', name: 'Báo cáo tuần', type: 'send', config: { channel: 'email', template: 'agency_weekly' } },
          { id: 'mid-month', name: 'Checkpoint giữa tháng', type: 'send', config: { channel: 'zalo', template: 'agency_midmonth_vi' } },
          { id: 'invoice', name: 'Gửi hóa đơn tháng', type: 'send', config: { channel: 'email', template: 'agency_invoice' } },
          { id: 'performance', name: 'Báo cáo campaign performance', type: 'send', config: { channel: 'email', template: 'agency_performance' } },
          { id: 'retention', name: 'Feedback + offer retainer', type: 'send', config: { channel: 'zalo', template: 'agency_retention_vi' }, depends_on: ['performance'] },
        ],
      },
    };
  }

  private subscriptionBox(): IndustryTemplate {
    return {
      slug: 'subscription-box-flow',
      name: 'Subscription Box - Định kỳ giao hàng',
      industry: 'retail',
      description: 'Xác nhận đơn hàng định kỳ, thông báo đang đóng gói, gửi tracking, nhắc gia hạn',
      document: {
        awl: '0.1', workflow: 'sub-box', name: 'Subscription Box định kỳ',
        category: 'subscription', industry: 'retail',
        trigger: { kind: 'schedule', config: { cron: '0 9 1 * *' } },
        steps: [
          { id: 'preparing', name: 'Đang chuẩn bị box tháng', type: 'send', config: { channel: 'zalo', template: 'subbox_preparing_vi' } },
          { id: 'shipped', name: 'Box đã gửi + tracking', type: 'send', config: { channel: 'zalo', template: 'subbox_shipped_vi' } },
          { id: 'delivered', name: 'Xác nhận giao thành công', type: 'send', config: { channel: 'zalo', template: 'subbox_delivered_vi' } },
          { id: 'feedback', name: 'Feedback box tháng này', type: 'send', config: { channel: 'zalo', template: 'subbox_feedback_vi' }, depends_on: ['delivered'] },
          { id: 'wait-25d', name: 'Chờ 25 ngày', type: 'wait', config: { seconds: 2160000 } },
          { id: 'renew-remind', name: 'Nhắc gia hạn tháng sau', type: 'send', config: { channel: 'email', template: 'subbox_renew' }, depends_on: ['feedback'] },
        ],
      },
    };
  }

  private equipmentRental(): IndustryTemplate {
    return {
      slug: 'equipment-rental-flow',
      name: 'Cho thuê thiết bị - Nhận/Trả',
      industry: 'services',
      description: 'Xác nhận đặt thiết bị, hướng dẫn sử dụng, nhắc trả, xử lý quá hạn, bảo trì',
      document: {
        awl: '0.1', workflow: 'equipment-rental', name: 'Cho thuê thiết bị/dụng cụ',
        category: 'booking', industry: 'services',
        trigger: { kind: 'event', config: { event: 'equipment_rental.created' } },
        steps: [
          { id: 'confirm', name: 'Xác nhận thuê thiết bị', type: 'send', config: { channel: 'zalo', template: 'equip_confirm_vi' } },
          { id: 'picked', name: 'Hướng dẫn sử dụng', type: 'send', config: { channel: 'zalo', template: 'equip_guide_vi' } },
          { id: 'return-remind', name: 'Nhắc trả 1 ngày trước hạn', type: 'wait', config: { seconds: 86400 } },
          { id: 'return', name: 'Nhắc trả thiết bị', type: 'send', config: { channel: 'zalo', template: 'equip_return_vi' } },
          { id: 'overdue', name: 'Xử lý trả trễ', type: 'condition', config: { field: 'rental.returned_on_time', equals: 'false' } },
          { id: 'late-fee', name: 'Thông báo phí trễ hạn', type: 'send', config: { channel: 'zalo', template: 'equip_late_fee_vi' }, depends_on: ['overdue'] },
          { id: 'maintenance', name: 'Nhắc bảo trì thiết bị', type: 'send', config: { channel: 'zalo', template: 'equip_maintenance_vi' }, depends_on: ['return'] },
        ],
      },
    };
  }
}
