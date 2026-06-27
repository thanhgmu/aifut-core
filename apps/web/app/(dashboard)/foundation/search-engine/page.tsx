"use client";

import { useMemo, useState } from "react";

type IndexStatus = "Active" | "Indexed" | "Pending";

type IndexedStream = {
  id: string;
  name: string;
  source: string;
  owner: string;
  documents: string;
  accuracy: number;
  avgLatency: number;
  status: IndexStatus;
  updatedAt: string;
};

const statusOptions: IndexStatus[] = ["Active", "Indexed", "Pending"];

const indexedStreams: IndexedStream[] = [
  {
    id: "IDX-001",
    name: "Sản phẩm toàn sàn",
    source: "catalog.products",
    owner: "Commerce Core",
    documents: "184,230",
    accuracy: 98.4,
    avgLatency: 42,
    status: "Active",
    updatedAt: "2 phút trước",
  },
  {
    id: "IDX-002",
    name: "Biến thể SKU",
    source: "inventory.sku_variants",
    owner: "Inventory",
    documents: "421,088",
    accuracy: 96.9,
    avgLatency: 58,
    status: "Indexed",
    updatedAt: "9 phút trước",
  },
  {
    id: "IDX-003",
    name: "Gợi ý autocomplete",
    source: "search.suggestions",
    owner: "Search Ops",
    documents: "72,410",
    accuracy: 99.1,
    avgLatency: 31,
    status: "Active",
    updatedAt: "14 phút trước",
  },
  {
    id: "IDX-004",
    name: "Danh mục ngành hàng",
    source: "taxonomy.categories",
    owner: "Foundation",
    documents: "12,804",
    accuracy: 97.7,
    avgLatency: 37,
    status: "Indexed",
    updatedAt: "27 phút trước",
  },
  {
    id: "IDX-005",
    name: "Nhà bán & thương hiệu",
    source: "marketplace.sellers",
    owner: "Partner Hub",
    documents: "34,590",
    accuracy: 95.8,
    avgLatency: 64,
    status: "Pending",
    updatedAt: "41 phút trước",
  },
  {
    id: "IDX-006",
    name: "Kho nội dung trợ giúp",
    source: "support.knowledge_base",
    owner: "CS Enablement",
    documents: "8,925",
    accuracy: 94.6,
    avgLatency: 46,
    status: "Indexed",
    updatedAt: "1 giờ trước",
  },
  {
    id: "IDX-007",
    name: "Từ khóa chiến dịch",
    source: "growth.campaign_terms",
    owner: "Growth",
    documents: "21,604",
    accuracy: 97.2,
    avgLatency: 53,
    status: "Active",
    updatedAt: "1 giờ trước",
  },
  {
    id: "IDX-008",
    name: "Tín hiệu hành vi tìm kiếm",
    source: "analytics.search_events",
    owner: "Data Platform",
    documents: "2,884,901",
    accuracy: 93.9,
    avgLatency: 72,
    status: "Pending",
    updatedAt: "2 giờ trước",
  },
];

const metrics = [
  {
    label: "Tổng số lượt query",
    value: "12.8M",
    detail: "+18.2% trong 7 ngày",
  },
  {
    label: "Tỷ lệ chính xác Autocomplete",
    value: "98.7%",
    detail: "Top-3 suggestion match",
  },
  {
    label: "Thời gian phản hồi trung bình",
    value: "46ms",
    detail: "P95 ổn định dưới 90ms",
  },
];

const statusStyles: Record<IndexStatus, string> = {
  Active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Indexed: "border-sky-200 bg-sky-50 text-sky-700",
  Pending: "border-amber-200 bg-amber-50 text-amber-700",
};

export default function SearchEngineDashboardPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<IndexStatus>("Active");
  const [isReindexing, setIsReindexing] = useState(false);

  const filteredStreams = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return indexedStreams.filter((stream) => {
      const matchesStatus = stream.status === status;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        stream.name.toLowerCase().includes(normalizedQuery) ||
        stream.source.toLowerCase().includes(normalizedQuery) ||
        stream.owner.toLowerCase().includes(normalizedQuery);

      return matchesStatus && matchesQuery;
    });
  }, [query, status]);

  function handleReindex() {
    setIsReindexing(true);
    window.setTimeout(() => setIsReindexing(false), 1400);
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-6 py-8 text-slate-950 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="flex flex-col gap-3">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-700">
            Foundation Search Engine
          </p>
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
                Giao diện quản lý Tìm kiếm nâng cao
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Theo dõi chất lượng autocomplete, trạng thái đánh chỉ mục và độ
                trễ phản hồi trên các luồng dữ liệu tìm kiếm trọng yếu.
              </p>
            </div>
            <div className="rounded-lg border border-white/80 bg-white/70 px-4 py-3 text-sm text-slate-600 shadow-sm shadow-slate-200/70 backdrop-blur">
              Index health:{" "}
              <span className="font-semibold text-emerald-700">Ổn định</span>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {metrics.map((metric) => (
            <article
              key={metric.label}
              className="rounded-lg border border-white/80 bg-white/65 p-5 shadow-sm shadow-slate-200/80 backdrop-blur-xl"
            >
              <p className="text-sm font-medium text-slate-500">
                {metric.label}
              </p>
              <div className="mt-4 flex items-end justify-between gap-3">
                <strong className="text-3xl font-semibold tracking-normal text-slate-950">
                  {metric.value}
                </strong>
                <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                  Live
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-500">{metric.detail}</p>
            </article>
          ))}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <label className="relative flex min-h-12 flex-1 items-center">
              <span className="pointer-events-none absolute left-4 text-slate-400">
                ⌕
              </span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm theo tên luồng, source hoặc team sở hữu..."
                className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
              />
            </label>

            <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
              {statusOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setStatus(option)}
                  className={`h-10 rounded-md px-4 text-sm font-semibold transition ${
                    status === option
                      ? "bg-slate-950 text-white shadow-sm"
                      : "text-slate-600 hover:bg-white hover:text-slate-950"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleReindex}
              disabled={isReindexing}
              className="inline-flex h-12 min-w-44 items-center justify-center gap-2 rounded-lg bg-sky-600 px-5 text-sm font-semibold text-white shadow-sm shadow-sky-200 transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none"
            >
              <span
                className={`h-4 w-4 rounded-full border-2 border-white/80 border-t-transparent ${
                  isReindexing ? "animate-spin" : ""
                }`}
              />
              {isReindexing ? "Đang re-index" : "Re-index Toàn sàn"}
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
          <div className="flex flex-col justify-between gap-2 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Luồng dữ liệu đã đánh chỉ mục
              </h2>
              <p className="text-sm text-slate-500">
                {filteredStreams.length} luồng phù hợp với bộ lọc hiện tại
              </p>
            </div>
            <span className="text-sm font-medium text-slate-500">
              Bộ lọc trạng thái: {status}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Index</th>
                  <th className="px-5 py-3 font-semibold">Luồng dữ liệu</th>
                  <th className="px-5 py-3 font-semibold">Tài liệu</th>
                  <th className="px-5 py-3 font-semibold">Chính xác</th>
                  <th className="px-5 py-3 font-semibold">Latency</th>
                  <th className="px-5 py-3 font-semibold">Trạng thái</th>
                  <th className="px-5 py-3 font-semibold">Cập nhật</th>
                  <th className="px-5 py-3 text-right font-semibold">
                    Hành động
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredStreams.map((stream) => (
                  <tr key={stream.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4 font-semibold text-slate-700">
                      {stream.id}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-950">
                        {stream.name}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {stream.source} · {stream.owner}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {stream.documents}
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-800">
                      {stream.accuracy}%
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {stream.avgLatency}ms
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[stream.status]}`}
                      >
                        {stream.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {stream.updatedAt}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                        >
                          Cấu hình Schema
                        </button>
                        <button
                          type="button"
                          className="rounded-md bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                        >
                          Xem Logs
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
