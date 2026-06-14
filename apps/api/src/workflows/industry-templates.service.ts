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
}
