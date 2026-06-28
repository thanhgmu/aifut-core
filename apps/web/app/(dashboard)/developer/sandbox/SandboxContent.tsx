'use client';

import React, { useState } from 'react';
import { SandboxSessionList } from '../../../../components/developer/sandbox-session-list';
import SandboxTraceViewer from '../../../../components/developer/sandbox-trace-viewer';
import { SandboxActionExecutor } from '../../../../components/developer/sandbox-action-executor';
import WebhookLogViewer from '../../../../components/developer/webhook-log-viewer';

export default function SandboxContent() {
 const [activeTab, setActiveTab] = useState<'sandbox' | 'webhook'>('sandbox');
 const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
 const currentTenantId = 'default-tenant-id-sandbox';

 return (
 <div className="p-6 max-w-7xl mx-auto space-y-6 text-white min-h-screen" style={{ backgroundColor: '#0b1020' }}>
 <div className="border-b border-white/5 pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
 <div>
 <div className="text-xs font-mono text-gray-400 mb-1">Developer / Console Tools</div>
 <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
 {activeTab === 'sandbox' ? '🛡️ Môi trường Sandbox' : '🌐 Trình thanh tra Webhook'}
 </h1>
 <p className="text-xs text-gray-400 mt-1">
 {activeTab === 'sandbox'
 ? 'Thử nghiệm Workflow và Connector trong không gian cô lập dòng tiền ảo.'
 : 'Thanh tra và đo đạc viễn trắc gói tin Webhook đầu vào/đầu ra thời gian thực.'}
 </p>
 </div>
 <div className="flex items-center gap-2 self-start md:self-auto bg-emerald-950/20 border border-emerald-500/30 px-3 py-1.5 rounded-full text-xs font-mono text-emerald-400 animate-pulse">
 <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
 Tenant: {currentTenantId}
 </div>
 </div>

 <div className="flex border-b border-white/10 gap-2 font-mono text-sm">
 <button
 onClick={() => setActiveTab('sandbox')}
 className={`px-4 py-2 border-b-2 font-bold transition-all duration-200 ${
 activeTab === 'sandbox'
 ? 'border-amber-400 text-amber-400 bg-white/5'
 : 'border-transparent text-gray-400 hover:text-white'
 }`}
 >
 🛡️ Môi trường Sandbox
 </button>
 <button
 onClick={() => setActiveTab('webhook')}
 className={`px-4 py-2 border-b-2 font-bold transition-all duration-200 ${
 activeTab === 'webhook'
 ? 'border-blue-400 text-blue-400 bg-white/5'
 : 'border-transparent text-gray-400 hover:text-white'
 }`}
 >
 🌐 Thanh tra Webhook
 </button>
 </div>

 <div className="grid grid-cols-1 gap-6">
 {activeTab === 'sandbox' ? (
 <div className="space-y-6">
 <SandboxSessionList
 tenantId={currentTenantId}
 onSelectSession={(id) => setSelectedSessionId(id)}
 selectedSessionId={selectedSessionId}
 />
 {selectedSessionId ? (
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 <SandboxTraceViewer sessionId={selectedSessionId} />
 <SandboxActionExecutor
 tenantId={currentTenantId}
 sessionId={selectedSessionId}
 />
 </div>
 ) : (
 <div className="p-12 rounded-xl border border-dashed border-white/10 text-center text-sm font-mono text-gray-500" style={{ backdropFilter: 'blur(12px)', background: 'rgba(255,255,255,0.02)' }}>
 ✨ Vui lòng chọn một phiên thử nghiệm (Sandbox Session) ở bảng trên để mở bung nhật ký vết viễn trắc và cấu trúc dòng tiền ảo.
 </div>
 )}
 </div>
 ) : (
 <div className="rounded-xl border border-white/5 p-4" style={{ backdropFilter: 'blur(12px)', background: 'rgba(255,255,255,0.01)' }}>
 <WebhookLogViewer tenantId={currentTenantId} />
 </div>
 )}
 </div>
 </div>
 );
}
