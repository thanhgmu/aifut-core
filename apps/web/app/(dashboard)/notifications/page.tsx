'use client';

import React, { useState, useEffect, useCallback } from 'react';

/* ── Mock Data ────────────────────────────────────────────────── */

type ChannelStatus = 'Connected' | 'Disconnected';
type ChannelKey = 'EMAIL' | 'ZALO' | 'SMS' | 'WEBHOOK' | 'PUSH' | 'TELEGRAM';

interface ChannelDef {
  key: ChannelKey;
  label: string;
  icon: string;
  status: ChannelStatus;
  activeTemplates: number;
  accentColor: string;
}

const MOCK_CHANNELS: ChannelDef[] = [
  { key: 'EMAIL', label: 'Email', icon: '✉️', status: 'Connected', activeTemplates: 14, accentColor: 'from-blue-500 to-indigo-500' },
  { key: 'ZALO', label: 'Zalo', icon: '💬', status: 'Connected', activeTemplates: 8, accentColor: 'from-sky-400 to-blue-500' },
  { key: 'SMS', label: 'SMS', icon: '📱', status: 'Connected', activeTemplates: 6, accentColor: 'from-green-400 to-emerald-500' },
  { key: 'WEBHOOK', label: 'Webhook', icon: '🔗', status: 'Connected', activeTemplates: 3, accentColor: 'from-purple-400 to-violet-500' },
  { key: 'PUSH', label: 'Push Notification', icon: '🔔', status: 'Disconnected', activeTemplates: 2, accentColor: 'from-amber-400 to-orange-500' },
  { key: 'TELEGRAM', label: 'Telegram', icon: '📨', status: 'Disconnected', activeTemplates: 2, accentColor: 'from-rose-400 to-pink-500' },
];

type TemplateStatus = 'Active' | 'Inactive' | 'Draft';

interface TemplateRow {
  id: string;
  name: string;
  code: string;
  channel: ChannelKey;
  language: string;
  status: TemplateStatus;
}

const MOCK_TEMPLATES: TemplateRow[] = [
  { id: 'tmpl-001', name: 'Xác nhận đơn hàng', code: 'ORDER_CONFIRM_VN', channel: 'EMAIL', language: 'vi', status: 'Active' },
  { id: 'tmpl-002', name: 'Thông báo giao hàng', code: 'DELIVERY_NOTIFY_VN', channel: 'EMAIL', language: 'vi', status: 'Active' },
  { id: 'tmpl-003', name: 'Mã OTP đăng nhập', code: 'OTP_LOGIN', channel: 'SMS', language: 'vi', status: 'Active' },
  { id: 'tmpl-004', name: 'Quên mật khẩu', code: 'PASSWORD_RESET', channel: 'EMAIL', language: 'en', status: 'Active' },
  { id: 'tmpl-005', name: 'Chào mừng thành viên mới', code: 'WELCOME_VN', channel: 'ZALO', language: 'vi', status: 'Active' },
  { id: 'tmpl-006', name: 'Khuyến mãi cuối tuần', code: 'PROMO_WEEKEND', channel: 'ZALO', language: 'vi', status: 'Draft' },
  { id: 'tmpl-007', name: 'Thông báo bảo trì', code: 'MAINTENANCE_ALERT', channel: 'EMAIL', language: 'en', status: 'Active' },
  { id: 'tmpl-008', name: 'Xác nhận thanh toán', code: 'PAYMENT_SUCCESS', channel: 'SMS', language: 'vi', status: 'Inactive' },
  { id: 'tmpl-009', name: 'Hoàn tiền thành công', code: 'REFUND_CONFIRM', channel: 'EMAIL', language: 'en', status: 'Active' },
  { id: 'tmpl-010', name: 'Cảnh báo hệ thống', code: 'SYS_ALERT_CRITICAL', channel: 'WEBHOOK', language: 'en', status: 'Active' },
  { id: 'tmpl-011', name: 'Nhắc lịch hẹn', code: 'APPOINTMENT_REMINDER', channel: 'PUSH', language: 'vi', status: 'Draft' },
  { id: 'tmpl-012', name: 'Thông báo cập nhật', code: 'UPDATE_AVAILABLE', channel: 'TELEGRAM', language: 'en', status: 'Inactive' },
  { id: 'tmpl-013', name: 'Xác nhận email', code: 'EMAIL_VERIFY', channel: 'EMAIL', language: 'vi', status: 'Active' },
  { id: 'tmpl-014', name: 'Thông báo nợ', code: 'DEBT_REMINDER_VN', channel: 'SMS', language: 'vi', status: 'Active' },
  { id: 'tmpl-015', name: 'Mời tham gia sự kiện', code: 'EVENT_INVITE', channel: 'ZALO', language: 'vi', status: 'Draft' },
  { id: 'tmpl-016', name: 'Push thông báo đơn hàng', code: 'ORDER_PUSH_VN', channel: 'PUSH', language: 'vi', status: 'Draft' },
  { id: 'tmpl-017', name: 'Cảnh báo qua Webhook', code: 'WEBHOOK_ALERT', channel: 'WEBHOOK', language: 'en', status: 'Active' },
  { id: 'tmpl-018', name: 'Telegram broadcast', code: 'TG_BROADCAST', channel: 'TELEGRAM', language: 'en', status: 'Inactive' },
  { id: 'tmpl-019', name: 'OTP qua Zalo', code: 'ZALO_OTP_LOGIN', channel: 'ZALO', language: 'vi', status: 'Active' },
  { id: 'tmpl-020', name: 'Khuyến mãi đặc biệt', code: 'PROMO_SPECIAL', channel: 'EMAIL', language: 'vi', status: 'Draft' },
  { id: 'tmpl-021', name: 'Thông báo batch SMS', code: 'SMS_BATCH_NOTIFY', channel: 'SMS', language: 'vi', status: 'Active' },
  { id: 'tmpl-022', name: 'Webhook healthcheck', code: 'WH_HEALTHCHECK', channel: 'WEBHOOK', language: 'en', status: 'Active' },
  { id: 'tmpl-023', name: 'Cảnh báo qua Telegram', code: 'TG_ALERT', channel: 'TELEGRAM', language: 'en', status: 'Draft' },
  { id: 'tmpl-024', name: 'Welcome EN', code: 'WELCOME_EN', channel: 'EMAIL', language: 'en', status: 'Active' },
  { id: 'tmpl-025', name: 'Push nhắc nhở', code: 'PUSH_REMINDER', channel: 'PUSH', language: 'vi', status: 'Inactive' },
  { id: 'tmpl-026', name: 'Zalo broadcast tin tức', code: 'ZALO_NEWS', channel: 'ZALO', language: 'vi', status: 'Draft' },
  { id: 'tmpl-027', name: 'SMS OTP EN', code: 'OTP_LOGIN_EN', channel: 'SMS', language: 'en', status: 'Active' },
  { id: 'tmpl-028', name: 'Email quảng cáo', code: 'EMAIL_PROMO', channel: 'EMAIL', language: 'vi', status: 'Inactive' },
  { id: 'tmpl-029', name: 'Thông báo qua Zalo pay', code: 'ZALO_PAY_NOTIFY', channel: 'ZALO', language: 'vi', status: 'Active' },
  { id: 'tmpl-030', name: 'SMS cảnh báo hệ thống', code: 'SMS_SYS_ALERT', channel: 'SMS', language: 'en', status: 'Active' },
  { id: 'tmpl-031', name: 'Webhook event log', code: 'WH_EVENT_LOG', channel: 'WEBHOOK', language: 'en', status: 'Draft' },
  { id: 'tmpl-032', name: 'Push khuyến mãi', code: 'PUSH_PROMO', channel: 'PUSH', language: 'vi', status: 'Inactive' },
  { id: 'tmpl-033', name: 'Telegram confirmation', code: 'TG_CONFIRM', channel: 'TELEGRAM', language: 'en', status: 'Draft' },
  { id: 'tmpl-034', name: 'Xác nhận Zalo QR', code: 'ZALO_QR_CONFIRM', channel: 'ZALO', language: 'vi', status: 'Active' },
  { id: 'tmpl-035', name: 'SMS thông báo khuyến mãi', code: 'SMS_PROMO', channel: 'SMS', language: 'vi', status: 'Draft' },
];

/* ── Channel Status Helpers ───────────────────────────────────── */

const CHANNEL_LABELS: Record<ChannelKey, string> = {
  EMAIL: 'Email',
  ZALO: 'Zalo',
  SMS: 'SMS',
  WEBHOOK: 'Webhook',
  PUSH: 'Push Notification',
  TELEGRAM: 'Telegram',
};

const STATUS_BADGE: Record<TemplateStatus, { label: string; css: string }> = {
  Active: { label: 'Hoạt động', css: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' },
  Inactive: { label: 'Ngưng', css: 'bg-rose-500/15 text-rose-400 border border-rose-500/30' },
  Draft: { label: 'Nháp', css: 'bg-amber-500/15 text-amber-400 border border-amber-500/30' },
};

/* ── Skeleton Shimmer ─────────────────────────────────────────── */

function SkeletonRow() {
  return (
    <tr className="border-t border-white/5 animate-pulse">
      <td className="py-3 px-4"><div className="h-4 w-36 bg-white/5 rounded" /></td>
      <td className="py-3 px-4"><div className="h-4 w-28 bg-white/5 rounded" /></td>
      <td className="py-3 px-4"><div className="h-4 w-20 bg-white/5 rounded" /></td>
      <td className="py-3 px-4"><div className="h-4 w-12 bg-white/5 rounded" /></td>
      <td className="py-3 px-4"><div className="h-5 w-20 bg-white/5 rounded-full" /></td>
    </tr>
  );
}

/* ── Glass Card Wrapper ───────────────────────────────────────── */

function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-white/5 p-5 transition-all duration-300 ${className}`}
      style={{ backdropFilter: 'blur(12px)', background: 'rgba(255,255,255,0.02)' }}
    >
      {children}
    </div>
  );
}

/* ── Channel Grid Card ────────────────────────────────────────── */

function ChannelCard({ channel }: { channel: ChannelDef }) {
  const isConnected = channel.status === 'Connected';
  return (
    <div
      className="group relative overflow-hidden rounded-xl border border-white/5 p-4 transition-all duration-300 hover:border-white/15 hover:-translate-y-0.5 cursor-pointer"
      style={{ backdropFilter: 'blur(12px)', background: 'rgba(255,255,255,0.02)' }}
    >
      {/* Accent gradient bar */}
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${channel.accentColor} opacity-70`} />

      <div className="flex flex-col gap-3 pt-1">
        {/* Row: icon + label */}
        <div className="flex items-center justify-between">
          <span className="text-2xl">{channel.icon}</span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              isConnected
                ? 'bg-emerald-500/12 text-emerald-400 border border-emerald-500/25'
                : 'bg-rose-500/12 text-rose-400 border border-rose-500/25'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            {channel.status}
          </span>
        </div>

        <span className="text-sm font-bold text-white/90">{channel.label}</span>

        {/* Active templates counter */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="font-mono text-indigo-300 text-base font-extrabold">{channel.activeTemplates}</span>
          <span>biểu mẫu đang kích hoạt</span>
        </div>

        {/* Hover tooltip */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-[#0b1020]/80 rounded-xl">
          <span className="text-xs font-mono text-indigo-300 bg-indigo-500/20 px-3 py-1 rounded-full border border-indigo-500/30">
            Quản lý &gt;
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Template Filter Bar ──────────────────────────────────────── */

function FilterBar({
  search,
  onSearchChange,
  channelFilter,
  onChannelFilterChange,
  statusFilter,
  onStatusFilterChange,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  channelFilter: string;
  onChannelFilterChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
      {/* Search */}
      <div className="relative w-full sm:w-72">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Tìm kiếm biểu mẫu..."
          className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all font-mono"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 w-full sm:w-auto">
        <select
          value={channelFilter}
          onChange={(e) => onChannelFilterChange(e.target.value)}
          className="flex-1 sm:flex-none bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 font-mono appearance-none cursor-pointer"
        >
          <option value="ALL" className="bg-[#0b1020]">📡 Tất cả kênh</option>
          <option value="EMAIL" className="bg-[#0b1020]">✉️ Email</option>
          <option value="ZALO" className="bg-[#0b1020]">💬 Zalo</option>
          <option value="SMS" className="bg-[#0b1020]">📱 SMS</option>
          <option value="WEBHOOK" className="bg-[#0b1020]">🔗 Webhook</option>
          <option value="PUSH" className="bg-[#0b1020]">🔔 Push</option>
          <option value="TELEGRAM" className="bg-[#0b1020]">📨 Telegram</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="flex-1 sm:flex-none bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 font-mono appearance-none cursor-pointer"
        >
          <option value="ALL" className="bg-[#0b1020]">📋 Tất cả trạng thái</option>
          <option value="Active" className="bg-[#0b1020]">✅ Hoạt động</option>
          <option value="Inactive" className="bg-[#0b1020]">⛔ Ngưng</option>
          <option value="Draft" className="bg-[#0b1020]">📝 Nháp</option>
        </select>
      </div>
    </div>
  );
}

/* ── Main Page Component ──────────────────────────────────────── */

export default function NotificationCenterDashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [channels] = useState<ChannelDef[]>(MOCK_CHANNELS);
  const [templates] = useState<TemplateRow[]>(MOCK_TEMPLATES);

  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  /* ── Simulate initial loading ────────────────────────────────── */
  useEffect(() => {
    const t = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(t);
  }, []);

  /* ── Filtered templates ─────────────────────────────────────── */
  const filteredTemplates = useCallback(() => {
    return templates.filter((t) => {
      const matchSearch =
        search === '' ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.code.toLowerCase().includes(search.toLowerCase());
      const matchChannel = channelFilter === 'ALL' || t.channel === channelFilter;
      const matchStatus = statusFilter === 'ALL' || t.status === statusFilter;
      return matchSearch && matchChannel && matchStatus;
    });
  }, [templates, search, channelFilter, statusFilter]);

  const visibleTemplates = filteredTemplates();

  /* ── Compute summary stats ──────────────────────────────────── */
  const totalActive = templates.filter((t) => t.status === 'Active').length;
  const connectedChannels = channels.filter((c) => c.status === 'Connected').length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 text-white min-h-screen" style={{ backgroundColor: '#0b1020' }}>
      {/* ── BREADCRUMB ─────────────────────────────────────────── */}
      <div className="text-xs font-mono text-gray-400 mb-1">Dashboard / Cấu hình Thông báo</div>

      {/* ════════════════════════════════════════════════════════════
         BLOCK 1 — HEADER
         ════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            🎛️ Trung tâm Điều phối Thông báo đa kênh
          </h1>
          <p className="text-xs text-gray-400 mt-1 max-w-2xl">
            Cấu hình 6 kênh truyền thông và quản lý 35 biểu mẫu seed dữ liệu — bao gồm Email, Zalo,
            SMS, Webhook, Push Notification và Telegram.
          </p>
        </div>

        {/* Summary badges */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 bg-emerald-950/20 border border-emerald-500/30 px-3 py-1.5 rounded-full text-xs font-mono text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {connectedChannels}/{channels.length} kênh kết nối
          </span>
          <span className="inline-flex items-center gap-1.5 bg-indigo-950/20 border border-indigo-500/30 px-3 py-1.5 rounded-full text-xs font-mono text-indigo-400">
            {totalActive} biểu mẫu hoạt động
          </span>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
         BLOCK 2 — CHANNEL TABS GRID
         ════════════════════════════════════════════════════════════ */}
      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-blue-300 uppercase tracking-wider">
            📡 Tổng quan Kênh Truyền thông
          </h2>
          <span className="text-[10px] font-mono text-gray-500">
            {channels.length} kênh · {connectedChannels} online
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {channels.map((ch) => (
            <ChannelCard key={ch.key} channel={ch} />
          ))}
        </div>
      </GlassCard>

      {/* ════════════════════════════════════════════════════════════
         BLOCK 3 — TEMPLATE LIST TABLE
         ════════════════════════════════════════════════════════════ */}
      <GlassCard className="overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-blue-300 uppercase tracking-wider">
            📋 Danh sách Biểu mẫu Thông báo
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-gray-500">
              {visibleTemplates.length} / {templates.length} biểu mẫu
            </span>
            <button className="text-[10px] font-mono text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 border border-indigo-500/25 rounded px-2.5 py-1 transition-all">
              + Tạo mới
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          channelFilter={channelFilter}
          onChannelFilterChange={setChannelFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
        />

        {/* Table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm font-mono">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-gray-500">
                <th className="py-3 px-4 font-semibold">Tên biểu mẫu</th>
                <th className="py-3 px-4 font-semibold">Mã biểu mẫu</th>
                <th className="py-3 px-4 font-semibold">Kênh</th>
                <th className="py-3 px-4 font-semibold">Ngôn ngữ</th>
                <th className="py-3 px-4 font-semibold">Trạng thái</th>
              </tr>
            </thead>

            {isLoading ? (
              /* ── Skeleton Loading ── */
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </tbody>
            ) : visibleTemplates.length === 0 ? (
              /* ── Empty State ── */
              <tbody>
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <div
                      className="inline-flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/10 px-8 py-10"
                      style={{ backdropFilter: 'blur(8px)', background: 'rgba(255,255,255,0.01)' }}
                    >
                      <span className="text-3xl">📭</span>
                      <span className="text-sm text-gray-400">
                        Không tìm thấy biểu mẫu nào phù hợp với bộ lọc hiện tại.
                      </span>
                      <span className="text-xs text-gray-500">
                        Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc kênh / trạng thái.
                      </span>
                    </div>
                  </td>
                </tr>
              </tbody>
            ) : (
              /* ── Template Data Rows ── */
              <tbody>
                {visibleTemplates.map((tmpl) => (
                  <tr
                    key={tmpl.id}
                    className="border-t border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 text-white/90 font-medium">{tmpl.name}</td>
                    <td className="py-3 px-4 text-indigo-300/80 text-[12px]">{tmpl.code}</td>
                    <td className="py-3 px-4">
                      <span className="text-xs whitespace-nowrap">
                        {CHANNEL_LABELS[tmpl.channel]}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] uppercase tracking-wider bg-white/5 px-2 py-0.5 rounded border border-white/10">
                        {tmpl.language === 'vi' ? '🇻🇳 VI' : '🇬🇧 EN'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${STATUS_BADGE[tmpl.status].css}`}
                      >
                        {STATUS_BADGE[tmpl.status].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
      </GlassCard>

      {/* ── Footer meta ────────────────────────────────────────── */}
      <div className="text-[10px] font-mono text-gray-600 text-center pt-2">
        Notification Template Manager v0.1 · 6 kênh · 35 biểu mẫu seed · Phiên bản Dashboard Điều phối
      </div>
    </div>
  );
}
