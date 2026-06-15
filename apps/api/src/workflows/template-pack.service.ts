import { Injectable } from '@nestjs/common';

export interface TemplatePackItem {
  slug: string;
  name: string;
  industry: string;
  description: string;
}

export interface TemplatePack {
  id: string;
  name: string;
  description: string;
  tagline: string;
  coverEmoji: string;
  price: number;
  currency: string;
  industry: string;
  templateCount: number;
  templates: TemplatePackItem[];
  highlights: string[];
  savingsNote?: string;
}

@Injectable()
export class TemplatePackService {
  getAllPacks(): TemplatePack[] {
    return [
      this.foodBeveragePack(),
      this.retailEcommercePack(),
      this.healthcareWellnessPack(),
      this.automotiveLogisticsPack(),
      this.educationServicesPack(),
      this.professionalServicesPack(),
      this.beautyFitnessPack(),
      this.hospitalityTravelPack(),
    ];
  }

  getPackById(id: string): TemplatePack | undefined {
    return this.getAllPacks().find((p) => p.id === id);
  }

  getPacksByIndustry(industry: string): TemplatePack[] {
    return this.getAllPacks().filter((p) => p.industry === industry);
  }

  private foodBeveragePack(): TemplatePack {
    return {
      id: 'food-beverage',
      name: 'F&B Operator Kit',
      description: 'Tự động hóa nhà hàng, quán cafe, trà sữa, dịch vụ tiệc và giao đồ ăn — từ xác nhận đơn đến feedback khách hàng.',
      tagline: 'Toàn bộ quy trình F&B trong một gói',
      coverEmoji: '🍽️',
      price: 39000,
      currency: 'VND',
      industry: 'food',
      templateCount: 4,
      templates: [
        { slug: 'restaurant-order-flow', name: 'Xác nhận đơn nhà hàng', industry: 'food', description: 'Xác nhận Zalo → thông báo bếp → feedback sau ăn' },
        { slug: 'food-delivery-tracking', name: 'Giao đồ ăn tracking', industry: 'food', description: 'Xác nhận → chế biến → shipper → giao thành công' },
        { slug: 'catering-service-flow', name: 'Đặt tiệc + thực đơn', industry: 'food', description: 'Xác nhận tiệc → thực đơn → số lượng khách → feedback' },
        { slug: 'grocery-delivery-flow', name: 'Tạp hóa online', industry: 'retail', description: 'Xác nhận → đóng gói → giao hàng → đánh giá' },
      ],
      highlights: ['Tự động gửi Zalo/Email xác nhận đơn', 'Thông báo bếp/chế biến realtime', 'Feedback tự động sau khi giao', 'Nhắc khách hàng quay lại'],
    };
  }

  private retailEcommercePack(): TemplatePack {
    return {
      id: 'retail-ecommerce',
      name: 'E-Commerce Growth Kit',
      description: 'Tối ưu toàn bộ funnel bán hàng online — từ đặt hàng, recovery giỏ hàng bỏ quên, đến subscription box.',
      tagline: 'Bán hàng online thông minh hơn',
      coverEmoji: '🛒',
      price: 59000,
      currency: 'VND',
      industry: 'retail',
      templateCount: 4,
      templates: [
        { slug: 'ecommerce-order-flow', name: 'Xác nhận + giao hàng', industry: 'retail', description: 'Xác nhận Zalo → giao hàng → yêu cầu đánh giá' },
        { slug: 'ecommerce-cart-recovery', name: 'Recovery giỏ hàng', industry: 'retail', description: 'Phát hiện giỏ hàng bỏ quên → nhắc 3 lần → tặng voucher' },
        { slug: 'subscription-box-flow', name: 'Subscription Box', industry: 'retail', description: 'Đóng gói → giao → feedback → gia hạn tự động' },
        { slug: 'grocery-delivery-flow', name: 'Tạp hóa online', industry: 'retail', description: 'Đơn hàng → đóng gói → giao → feedback' },
      ],
      highlights: ['Recovery giỏ hàng bỏ quên (tăng 15-30% doanh thu)', 'Subscription box tự động', 'Zalo/Email đa kênh', 'Phân tích hành vi mua hàng'],
      savingsNote: 'Tiết kiệm 40% so với mua từng template riêng lẻ',
    };
  }

  private healthcareWellnessPack(): TemplatePack {
    return {
      id: 'healthcare-wellness',
      name: 'Phòng khám & Sức khỏe Kit',
      description: 'Quản lý lịch hẹn, nhắc tái khám, đơn thuốc, và chăm sóc bệnh nhân tự động cho phòng khám, nha khoa, thú y.',
      tagline: 'Chăm sóc bệnh nhân 24/7 tự động',
      coverEmoji: '🏥',
      price: 49000,
      currency: 'VND',
      industry: 'healthcare',
      templateCount: 5,
      templates: [
        { slug: 'healthcare-appointment-flow', name: 'Đặt lịch + tái khám', industry: 'healthcare', description: 'Xác nhận → nhắc 24h → hướng dẫn → tái khám' },
        { slug: 'dental-clinic-flow', name: 'Nha khoa — lịch hẹn', industry: 'healthcare', description: 'Xác nhận → nhắc → chăm sóc sau → tái khám 6 tháng' },
        { slug: 'vet-clinic-flow', name: 'Thú y — tiêm phòng', industry: 'healthcare', description: 'Xác nhận lịch → tiêm → nhắc tái khám' },
        { slug: 'pharmacy-prescription-flow', name: 'Nhà thuốc — đơn thuốc', industry: 'healthcare', description: 'Thuốc sẵn sàng → hướng dẫn → nhắc uống → mua thêm' },
        { slug: 'optometry-eyewear-flow', name: 'Kính mắt — đo mắt + nhận kính', industry: 'healthcare', description: 'Đặt lịch đo → nhắc → kính sẵn sàng → khám định kỳ' },
      ],
      highlights: ['Tự động nhắc lịch hẹn và tái khám', 'Giảm tỷ lệ bệnh nhân vắng (no-show)', 'Hướng dẫn chăm sóc sau khám', 'Quản lý đơn thuốc và nhắc uống'],
      savingsNote: 'Bao gồm template cho phòng khám, nha khoa, thú y, nhà thuốc',
    };
  }

  private automotiveLogisticsPack(): TemplatePack {
    return {
      id: 'automotive-logistics',
      name: 'Vận tải & Logistics Kit',
      description: 'Tự động hóa gara ô tô, cho thuê xe, cứu hộ, quản lý kho và giao hàng — tối ưu toàn bộ chuỗi vận tải.',
      tagline: 'Vận hành logistics không giấy tờ',
      coverEmoji: '🚚',
      price: 59000,
      currency: 'VND',
      industry: 'automotive',
      templateCount: 5,
      templates: [
        { slug: 'automotive-service-flow', name: 'Gara ô tô — bảo dưỡng', industry: 'automotive', description: 'Xác nhận → tiến độ → hoàn thành → nhắc bảo dưỡng' },
        { slug: 'car-rental-flow', name: 'Thuê xe tự lái', industry: 'automotive', description: 'Đặt xe → nhận → trả → phí quá hạn' },
        { slug: 'towing-roadside-flow', name: 'Cứu hộ giao thông', industry: 'automotive', description: 'Yêu cầu → điều động → ETA → hoàn thành' },
        { slug: 'logistics-delivery-flow', name: 'Giao hàng realtime', industry: 'logistics', description: 'Lấy hàng → vận chuyển → giao → đánh giá' },
        { slug: 'warehouse-management-flow', name: 'Quản lý kho', industry: 'logistics', description: 'Kiểm kho → cảnh báo tồn → nhập/xuất → báo cáo' },
      ],
      highlights: ['Tracking giao hàng realtime', 'Cảnh báo tồn kho thấp tự động', 'Quản lý cho thuê xe và bảo dưỡng', 'Xử lý cứu hộ khẩn cấp 24/7'],
    };
  }

  private educationServicesPack(): TemplatePack {
    return {
      id: 'education-services',
      name: 'Giáo dục & Đào tạo Kit',
      description: 'Tự động hóa trung tâm học tập, nhà trẻ, gia sư — từ nhắc lịch học đến báo cáo phụ huynh.',
      tagline: 'Kết nối phụ huynh, học viên, giáo viên',
      coverEmoji: '📚',
      price: 39000,
      currency: 'VND',
      industry: 'education',
      templateCount: 4,
      templates: [
        { slug: 'education-class-reminder', name: 'Nhắc lịch học', industry: 'education', description: 'Nhắc học viên → tài liệu → feedback sau buổi' },
        { slug: 'tutoring-center-flow', name: 'Trung tâm gia sư', industry: 'education', description: 'Đăng ký → lịch học → báo cáo tuần → học phí' },
        { slug: 'daycare-preschool-flow', name: 'Nhà trẻ — điểm danh', industry: 'education', description: 'Điểm danh sáng → báo ăn → báo ngủ → báo đón' },
        { slug: 'recruitment-flow', name: 'Tuyển dụng - Phỏng vấn', industry: 'services', description: 'Đơn ứng tuyển → PV → Offer → Onboarding' },
      ],
      highlights: ['Báo cáo hàng ngày cho phụ huynh', 'Nhắc lịch học tự động', 'Quản lý học phí và gia hạn', 'Theo dõi tiến độ học tập'],
    };
  }

  private professionalServicesPack(): TemplatePack {
    return {
      id: 'professional-services',
      name: 'Dịch vụ Chuyên nghiệp Kit',
      description: 'Dành cho văn phòng luật, kế toán, agency, IT support — quản lý vụ việc, hóa đơn, báo cáo khách hàng.',
      tagline: 'Xây dựng quy trình chuyên nghiệp',
      coverEmoji: '💼',
      price: 69000,
      currency: 'VND',
      industry: 'services',
      templateCount: 8,
      templates: [
        { slug: 'legal-case-flow', name: 'Văn phòng luật', industry: 'legal', description: 'Tiếp nhận → tiến độ → hạn nộp → hóa đơn' },
        { slug: 'accounting-tax-flow', name: 'Kế toán — nhắc thuế', industry: 'accounting', description: 'Yêu cầu chứng từ → nhắc → báo cáo thuế' },
        { slug: 'digital-agency-flow', name: 'Agency Digital', industry: 'services', description: 'Kickoff → báo cáo tuần → performance → retainer' },
        { slug: 'it-support-flow', name: 'IT Support ticket', industry: 'services', description: 'Ticket → SLA → giải quyết → survey' },
        { slug: 'freelancer-invoice-flow', name: 'Freelancer — gửi hóa đơn', industry: 'services', description: 'Báo giá → nhắc thanh toán → cảm ơn' },
        { slug: 'photography-studio-flow', name: 'Studio chụp ảnh', industry: 'services', description: 'Booking → chụp → gửi ảnh → gallery' },
        { slug: 'wedding-planning-flow', name: 'Cưới hỏi — timeline', industry: 'services', description: 'Timeline → vendor → guest → checklist → cảm ơn' },
        { slug: 'recruitment-flow', name: 'Tuyển dụng', industry: 'services', description: 'Đơn → PV → Offer → Onboarding' },
      ],
      highlights: ['8 templates cho 6 ngành dịch vụ', 'Quản lý SLA và deadline tự động', 'Báo cáo chuyên nghiệp gửi khách hàng', 'Tự động hóa quy trình báo giá → thanh toán'],
      savingsNote: 'Tiết kiệm 55% so với mua từng template',
    };
  }

  private beautyFitnessPack(): TemplatePack {
    return {
      id: 'beauty-fitness',
      name: 'Làm đẹp & Thể hình Kit',
      description: 'Quản lý lịch hẹn spa, salon, massage, gym, yoga — nhắc khách, duy trì membership, feedback tự động.',
      tagline: 'Giữ chân khách hàng làm đẹp & gym',
      coverEmoji: '💆',
      price: 49000,
      currency: 'VND',
      industry: 'beauty',
      templateCount: 5,
      templates: [
        { slug: 'spa-booking-flow', name: 'Spa — đặt lịch', industry: 'beauty', description: 'Xác nhận → nhắc → survey sau dịch vụ' },
        { slug: 'salon-booking-flow', name: 'Salon/Tóc — booking', industry: 'beauty', description: 'Xác nhận → ảnh mẫu → nhắc → feedback' },
        { slug: 'massage-wellness-flow', name: 'Massage/Wellness', industry: 'beauty', description: 'Đặt lịch → liệu trình → membership → feedback' },
        { slug: 'fitness-member-flow', name: 'Gym — duy trì hội viên', industry: 'fitness', description: 'Chào mừng → lịch lớp → tần suất → gia hạn' },
        { slug: 'yoga-studio-flow', name: 'Yoga/Pilates — lớp tập', industry: 'fitness', description: 'Đặt lớp → nhắc → streak → membership' },
      ],
      highlights: ['Nhắc lịch hẹn giảm no-show 40%', 'Tự động gửi ảnh mẫu và feedback', 'Theo dõi streak và tần suất tập luyện', 'Membership renewal tự động'],
    };
  }

  private hospitalityTravelPack(): TemplatePack {
    return {
      id: 'hospitality-travel',
      name: 'Khách sạn & Du lịch Kit',
      description: 'Tự động hóa đặt phòng khách sạn, tour du lịch, sự kiện — từ xác nhận booking đến feedback sau dịch vụ.',
      tagline: 'Trải nghiệm khách hàng 5 sao tự động',
      coverEmoji: '🏨',
      price: 49000,
      currency: 'VND',
      industry: 'hospitality',
      templateCount: 4,
      templates: [
        { slug: 'hotel-booking-flow', name: 'Khách sạn — đặt phòng', industry: 'hospitality', description: 'Xác nhận → pre-check-in → welcome → review' },
        { slug: 'travel-booking-flow', name: 'Du lịch — tour', industry: 'travel', description: 'Itinerary → thông tin bay → checklist → review' },
        { slug: 'event-management-flow', name: 'Quản lý sự kiện', industry: 'services', description: 'Invite → RSVP → QR check-in → feedback' },
        { slug: 'coworking-space-flow', name: 'Coworking — đặt chỗ', industry: 'services', description: 'Đặt chỗ → QR check-in → hết giờ → feedback' },
      ],
      highlights: ['Pre-check-in tự động cho khách sạn', 'Gửi itinerary chi tiết cho khách du lịch', 'QR check-in sự kiện', 'Coworking space management'],
    };
  }
}
