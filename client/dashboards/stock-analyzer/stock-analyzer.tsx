import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  TextInput,
  ScrollView,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { API_BASE } from "../../constants/api";
import { parseAiJsonPayload } from "../../utils/parseAiJson";
import { styles } from "../../styles";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

type TabType = "manual" | "ai";

const SESSION_STORAGE_KEY = "stock-analyzer-payload-v1";
const AI_REPORT_STORAGE_KEY = "stock-analyzer-ai-report-v1";
const AI_CHAT_STORAGE_KEY = "stock-analyzer-ai-chat-v1";

function readSession(): string {
  if (typeof sessionStorage === "undefined") return "";
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeSession(value: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (value) sessionStorage.setItem(SESSION_STORAGE_KEY, value);
    else sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function readString(key: string): string {
  if (typeof sessionStorage === "undefined") return "";
  try {
    return sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeString(key: string, value: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function formatINR(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `₹${value.toFixed(2)}`;
  }
}

function formatCompactINR(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const abs = Math.abs(value);
  if (abs >= 1e7) return `₹${(value / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(value / 1e5).toFixed(2)} L`;
  return formatINR(value);
}

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
  "#22c55e",
  "#0ea5e9",
  "#a855f7",
];

const parseAiReportPayload = parseAiJsonPayload;

function isStructuredStockAiReport(
  o: Record<string, unknown> | null,
): o is Record<string, unknown> {
  if (!o) return false;
  return (
    Array.isArray(o.key_findings) ||
    typeof o.risk_profile === "string" ||
    Array.isArray(o.redistribution_plan) ||
    Array.isArray(o.news_fundamental_thesis) ||
    Array.isArray(o.technical_notes)
  );
}

const StockAnalyzer: React.FC = () => {
  const [activeTab, setActiveTab] = React.useState<TabType>("manual");
  const [resultText, setResultText] = React.useState<string>(() =>
    readSession(),
  );
  const [aiReportText, setAiReportText] = React.useState<string>(() =>
    readString(AI_REPORT_STORAGE_KEY),
  );
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiError, setAiError] = React.useState<string>("");
  const [rebalanceTargetPct, setRebalanceTargetPct] =
    React.useState<string>("15");

  const [chatMessagesText, setChatMessagesText] = React.useState<string>(() =>
    readString(AI_CHAT_STORAGE_KEY),
  );
  const [chatInput, setChatInput] = React.useState<string>("");
  const [chatLoading, setChatLoading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string>("");
  const [enriching, setEnriching] = React.useState(false);

  const updateResultText = React.useCallback((value: string) => {
    setResultText(value);
    writeSession(value);
  }, []);

  const updateAiReport = React.useCallback((value: string) => {
    setAiReportText(value);
    writeString(AI_REPORT_STORAGE_KEY, value);
  }, []);

  const parsed = React.useMemo(() => {
    if (!resultText) return null;
    try {
      return JSON.parse(resultText);
    } catch {
      return null;
    }
  }, [resultText]);

  const chatMessages = React.useMemo(() => {
    if (!chatMessagesText) return [];
    try {
      const v = JSON.parse(chatMessagesText);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }, [chatMessagesText]);

  const setChatMessages = React.useCallback((msgs: any[]) => {
    const v = JSON.stringify(msgs);
    setChatMessagesText(v);
    writeString(AI_CHAT_STORAGE_KEY, v);
  }, []);

  const pickDocument = async () => {
    setUploadError("");
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
        ],
        copyToCacheDirectory: true,
      });

      if (res.assets && res.assets.length > 0) {
        const file = res.assets[0];
        const formData = new FormData();
        if (Platform.OS === "web") {
          formData.append("file", file.file);
        } else {
          formData.append("file", {
            uri: file.uri,
            name: file.name,
            type:
              file.mimeType ||
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          } as any);
        }

        const response: any = await fetch(
          `${API_BASE}/upload-stock-holdings-excel`,
          {
            method: "POST",
            body: formData,
          },
        );

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err?.detail ?? `Upload failed (${response.status})`);
        }

        const data = await response.json();
        updateResultText(
          JSON.stringify(
            {
              ...data,
              enrichment: {},
              manual_hints: {
                alerts: [],
                trim_suggestions: [],
                sector_weights_pct: [],
                disclaimer:
                  "Fetching Yahoo Finance data (news, fundamentals, RSI)…",
              },
            },
            null,
            2,
          ),
        );

        updateAiReport("");
        setAiError("");
        setChatMessages([]);

        setEnriching(true);
        try {
          const enrichRes = await fetch(`${API_BASE}/enrich-stock-portfolio`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              summary: data.summary,
              holdings: data.holdings,
              computed: data.computed,
            }),
          });
          if (!enrichRes.ok) {
            const err = await enrichRes.json().catch(() => ({}));
            throw new Error(
              err?.detail ?? `Market data failed (${enrichRes.status})`,
            );
          }
          const extra = await enrichRes.json();
          const merged = {
            ...data,
            enrichment: extra.enrichment ?? {},
            manual_hints: extra.manual_hints ?? {},
          };
          updateResultText(JSON.stringify(merged, null, 2));
        } catch (e: any) {
          setUploadError(
            e?.message ??
              "Market data fetch failed. You can still use parsed weights; retry upload later.",
          );
        } finally {
          setEnriching(false);
        }
      }
    } catch (e: any) {
      setUploadError(e?.message ?? "Upload failed.");
    }
  };

  const TabButton: React.FC<{ title: string; tabKey: TabType }> = ({
    title,
    tabKey,
  }) => (
    <TouchableOpacity
      style={{
        flex: 1,
        padding: 10,
        backgroundColor: activeTab === tabKey ? "#e0e0e0" : "#fff",
        borderWidth: 1,
        borderColor: "#ccc",
        ...(tabKey === "manual"
          ? { borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }
          : { borderTopRightRadius: 8, borderBottomRightRadius: 8 }),
      }}
      onPress={() => setActiveTab(tabKey)}
    >
      <Text style={{ textAlign: "center", fontWeight: "bold" }}>{title}</Text>
    </TouchableOpacity>
  );

  const summary = parsed?.summary ?? {};
  const computed = parsed?.computed ?? {};
  const allocation = computed?.allocation_by_symbol ?? [];
  const concentration = computed?.concentration ?? {};
  const manualHints = parsed?.manual_hints ?? {};
  const enrichment = parsed?.enrichment ?? {};
  const holdings = parsed?.holdings ?? [];

  const sectorData = (manualHints?.sector_weights_pct ?? []).slice(0, 12);
  const alerts = manualHints?.alerts ?? [];

  const totalVal = summary?.total_current_value ?? 0;
  const targetPct = parseFloat(rebalanceTargetPct);
  const rebalanceTopApprox =
    !Number.isNaN(targetPct) &&
    allocation[0] &&
    totalVal > 0 &&
    allocation[0].pct > targetPct
      ? (totalVal * (allocation[0].pct - targetPct)) / 100
      : null;

  const aiReportParsed = React.useMemo((): Record<string, unknown> | null => {
    if (!aiReportText) return null;
    return parseAiReportPayload(aiReportText);
  }, [aiReportText]);

  const ManualTab = () => (
    <View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {[
          {
            label: "Total current value",
            value: formatINR(summary.total_current_value),
          },
          {
            label: "Unique symbols",
            value: String(summary.unique_symbols ?? "-"),
          },
          {
            label: "Largest position",
            value:
              typeof concentration.largest_position_pct === "number"
                ? `${concentration.largest_position_pct.toFixed(1)}%`
                : "-",
          },
          {
            label: "Top 3 weight",
            value:
              typeof concentration.top_3_weight_pct === "number"
                ? `${concentration.top_3_weight_pct.toFixed(1)}%`
                : "-",
          },
          {
            label: "Concentration (HHI)",
            value:
              typeof concentration.hhi === "number"
                ? concentration.hhi.toFixed(3)
                : "-",
          },
        ].map((card) => (
          <View
            key={card.label}
            style={{
              minWidth: 200,
              padding: 12,
              backgroundColor: "#ffffff",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#e2e8f0",
            }}
          >
            <Text style={{ color: "#64748b", fontSize: 12 }}>{card.label}</Text>
            <Text style={{ color: "#0f172a", fontSize: 18, fontWeight: "700" }}>
              {card.value}
            </Text>
          </View>
        ))}
        {typeof summary.total_invested_value === "number" ? (
          <View
            style={{
              minWidth: 200,
              padding: 12,
              backgroundColor: "#ffffff",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#e2e8f0",
            }}
          >
            <Text style={{ color: "#64748b", fontSize: 12 }}>Total invested</Text>
            <Text style={{ color: "#0f172a", fontSize: 18, fontWeight: "700" }}>
              {formatINR(summary.total_invested_value)}
            </Text>
          </View>
        ) : null}
      </View>

      {!summary.total_current_value && holdings.length > 0 ? (
        <View
          style={{
            marginTop: 12,
            padding: 12,
            backgroundColor: "#fff7ed",
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "#fed7aa",
          }}
        >
          <Text style={{ color: "#9a3412", fontWeight: "700" }}>
            Total current value is ₹0 — the sheet may use formulas (re-save as
            values), different column names, or a non-holdings sheet. Try the
            sample file in client/assets or export “values only” from Excel.
          </Text>
        </View>
      ) : null}

      {summary.parse_note ? (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: "#b45309", fontSize: 13, lineHeight: 20 }}>
            {summary.parse_note}
          </Text>
        </View>
      ) : null}

      <View style={{ marginTop: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 10 }}>
          Rebalance preview (largest holding)
        </Text>
        <Text style={{ color: "#64748b", marginBottom: 8, fontSize: 13 }}>
          Set a target weight for the top name to estimate how much notional
          would move if you trim to that level (illustrative only).
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text style={{ color: "#334155" }}>Target weight %</Text>
          <TextInput
            value={rebalanceTargetPct}
            onChangeText={setRebalanceTargetPct}
            keyboardType="decimal-pad"
            style={{
              width: 80,
              borderWidth: 1,
              borderColor: "#e2e8f0",
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
              backgroundColor: "#fff",
            }}
          />
          <Text style={{ color: "#0f172a" }}>
            {rebalanceTopApprox !== null && allocation[0]
              ? `≈ ${formatINR(rebalanceTopApprox)} from ${allocation[0].name} (${allocation[0].pct.toFixed(1)}% → ${targetPct}%)`
              : "Enter a target below current top weight to estimate."}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 10 }}>
          Allocation & sectors
        </Text>
        <View style={{ flexDirection: "row", gap: 20, flexWrap: "wrap" }}>
          <View style={{ width: 400, height: 300 }}>
            <Text style={{ fontWeight: "700", marginBottom: 8 }}>
              By symbol (weight)
            </Text>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={allocation.slice(0, 12)}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={100}
                  label={(props: any) => {
                    const p = props?.payload;
                    const pct = p?.pct ?? "";
                    return `${props?.name ?? ""} (${pct}%)`;
                  }}
                >
                  {allocation.slice(0, 12).map((_: any, idx: number) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </View>

          <View style={{ width: 520, height: 320 }}>
            <Text style={{ fontWeight: "700", marginBottom: 8 }}>
              Sector mix (from Yahoo Finance)
            </Text>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sectorData} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="sector" type="category" width={78} />
                <Tooltip />
                <Bar dataKey="weight_pct" fill="#6366f1" name="Weight %" />
              </BarChart>
            </ResponsiveContainer>
          </View>
        </View>
      </View>

      <View style={{ marginTop: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 10 }}>
          Rule-based alerts
        </Text>
        <ScrollView style={{ maxHeight: 220 }}>
          {alerts.length === 0 ? (
            <Text style={{ color: "#64748b" }}>
              No concentration or technical flags from heuristics.
            </Text>
          ) : (
            alerts.map((a: any, idx: number) => (
              <View
                key={idx}
                style={{
                  padding: 10,
                  marginBottom: 8,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "#e2e8f0",
                  backgroundColor:
                    a.severity === "high"
                      ? "#fef2f2"
                      : a.severity === "medium"
                        ? "#fffbeb"
                        : "#f8fafc",
                }}
              >
                <Text style={{ fontWeight: "700", color: "#0f172a" }}>
                  {a.type}
                  {a.symbol ? ` · ${a.symbol}` : ""}
                </Text>
                <Text style={{ color: "#334155", marginTop: 4 }}>{a.message}</Text>
              </View>
            ))
          )}
        </ScrollView>
        <Text style={{ color: "#94a3b8", fontSize: 12, marginTop: 8 }}>
          {manualHints?.disclaimer ?? ""}
        </Text>
      </View>

      <View style={{ marginTop: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 10 }}>
          Holdings with live context
        </Text>
        <Text style={{ color: "#64748b", marginBottom: 8, fontSize: 13 }}>
          Quotes, fundamentals, RSI(14), 52-week range position, and recent
          headlines via Yahoo Finance (free, may be delayed).
        </Text>
        <ScrollView horizontal>
          <View style={{ minWidth: 720 }}>
            <View
              style={{
                flexDirection: "row",
                borderBottomWidth: 1,
                borderColor: "#e2e8f0",
                paddingBottom: 8,
              }}
            >
              {[
                "Symbol",
                "Qty",
                "Value",
                "Weight",
                "Yahoo",
                "Sector",
                "RSI(14)",
                "52w range",
                "Headline",
              ].map((h) => (
                <Text
                  key={h}
                  style={{
                    flex: 1,
                    minWidth: 88,
                    fontWeight: "700",
                    color: "#475569",
                    fontSize: 12,
                  }}
                >
                  {h}
                </Text>
              ))}
            </View>
            {holdings.map((h: any, idx: number) => {
              const en = enrichment[h.symbol] || {};
              const fund = en.fundamentals || {};
              const tech = en.technical || {};
              const rsi = tech.rsi14;
              const rng = tech.range_label;
              const news0 = (en.news_headlines || [])[0] ?? "";
              const yahooErr = en.error as string | undefined;
              const yahooOk =
                !yahooErr && (en.yahoo_symbol || en.quote?.regular_market_price);
              const allocRow = allocation.find(
                (x: any) => x.name === h.symbol,
              );
              return (
                <View
                  key={`${h.symbol}-${idx}`}
                  style={{
                    flexDirection: "row",
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderColor: "#f1f5f9",
                  }}
                >
                  <Text style={{ flex: 1, minWidth: 88, color: "#0f172a" }}>
                    {h.symbol}
                  </Text>
                  <Text style={{ flex: 1, minWidth: 88, color: "#334155" }}>
                    {h.qty ?? "-"}
                  </Text>
                  <Text style={{ flex: 1, minWidth: 88, color: "#334155" }}>
                    {formatCompactINR(h.current_value)}
                  </Text>
                  <Text style={{ flex: 1, minWidth: 88, color: "#334155" }}>
                    {allocRow ? `${allocRow.pct}%` : "-"}
                  </Text>
                  <Text
                    style={{
                      flex: 1,
                      minWidth: 100,
                      color: yahooErr ? "#dc2626" : "#15803d",
                      fontSize: 11,
                    }}
                    numberOfLines={3}
                  >
                    {yahooErr
                      ? yahooErr
                      : yahooOk
                        ? String(en.yahoo_symbol ?? "ok")
                        : enriching
                          ? "…"
                          : "no data"}
                  </Text>
                  <Text style={{ flex: 1, minWidth: 88, color: "#334155" }}>
                    {fund.sector ?? "-"}
                  </Text>
                  <Text style={{ flex: 1, minWidth: 88, color: "#334155" }}>
                    {typeof rsi === "number" ? rsi.toFixed(0) : "-"}
                  </Text>
                  <Text style={{ flex: 1, minWidth: 88, color: "#334155" }}>
                    {rng ?? "-"}
                  </Text>
                  <Text
                    style={{ flex: 2, minWidth: 160, color: "#475569", fontSize: 12 }}
                    numberOfLines={2}
                  >
                    {news0 || "-"}
                  </Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {Platform.OS === "web" ? (
        <TouchableOpacity
          style={[
            styles.secondaryButton,
            { marginTop: 16, alignSelf: "flex-start" },
          ]}
          onPress={() => {
            if (typeof window === "undefined" || !resultText) return;
            const blob = new Blob([resultText], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "stock-portfolio-snapshot.json";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Text style={styles.secondaryButtonText}>Export snapshot JSON</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const AITab = () => (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={async () => {
            if (!parsed) return;
            setAiLoading(true);
            setAiError("");
            try {
              const resp: any = await fetch(`${API_BASE}/analyze-stock-ai`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ stock_payload: parsed }),
              });
              const data = await resp.json();
              const structured = data?.report?.data;
              const raw = data?.report?.raw ?? "";
              if (structured) {
                updateAiReport(JSON.stringify(structured, null, 2));
              } else {
                const loose = parseAiJsonPayload(raw);
                if (loose) {
                  updateAiReport(JSON.stringify(loose, null, 2));
                } else {
                  updateAiReport(raw);
                }
              }
            } catch (e: any) {
              setAiError(e?.message ?? "Failed to generate AI report.");
            } finally {
              setAiLoading(false);
            }
          }}
        >
          <Text style={styles.secondaryButtonText}>
            {aiLoading ? "Generating..." : "Generate AI insights"}
          </Text>
        </TouchableOpacity>

        {aiError ? (
          <Text style={{ color: "#ef4444", flex: 1 }}>{aiError}</Text>
        ) : null}
      </View>

      {aiReportText ? (
        <View style={{ marginTop: 14 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>
            AI report
          </Text>
          {isStructuredStockAiReport(aiReportParsed) ? (
            <View>
              {typeof aiReportParsed.risk_profile === "string" ? (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ color: "#64748b", fontSize: 12, marginBottom: 4 }}>
                    Risk profile
                  </Text>
                  <View
                    style={{
                      alignSelf: "flex-start",
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 999,
                      backgroundColor: "#e0e7ff",
                    }}
                  >
                    <Text style={{ color: "#3730a3", fontWeight: "700" }}>
                      {String(aiReportParsed.risk_profile)}
                    </Text>
                  </View>
                </View>
              ) : null}

              {Array.isArray(aiReportParsed.key_findings) &&
              aiReportParsed.key_findings.length > 0 ? (
                <View style={{ marginTop: 4 }}>
                  <Text style={{ fontWeight: "700", fontSize: 16, marginBottom: 8 }}>
                    Key findings
                  </Text>
                  {(aiReportParsed.key_findings as unknown[]).map(
                    (x, i: number) => (
                      <Text
                        key={i}
                        style={{ color: "#334155", marginTop: 6, lineHeight: 22 }}
                      >
                        • {String(x)}
                      </Text>
                    ),
                  )}
                </View>
              ) : null}

              {Array.isArray(aiReportParsed.redistribution_plan) &&
              aiReportParsed.redistribution_plan.length > 0 ? (
                <View style={{ marginTop: 18 }}>
                  <Text style={{ fontWeight: "700", fontSize: 16, marginBottom: 8 }}>
                    Redistribution ideas
                  </Text>
                  {(aiReportParsed.redistribution_plan as any[]).map(
                    (r: any, i: number) => (
                      <View
                        key={i}
                        style={{
                          marginTop: 8,
                          padding: 12,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: "#e2e8f0",
                          backgroundColor: "#fafafa",
                        }}
                      >
                        <Text style={{ fontWeight: "700", color: "#0f172a" }}>
                          {String(r.action ?? "—")}
                          {r.symbol ? ` · ${String(r.symbol)}` : ""}
                        </Text>
                        {r.rationale ? (
                          <Text
                            style={{ color: "#475569", marginTop: 6, lineHeight: 20 }}
                          >
                            {String(r.rationale)}
                          </Text>
                        ) : null}
                        {r.priority != null && r.priority !== "" ? (
                          <Text
                            style={{ color: "#94a3b8", fontSize: 12, marginTop: 6 }}
                          >
                            Priority: {String(r.priority)}
                          </Text>
                        ) : null}
                      </View>
                    ),
                  )}
                </View>
              ) : null}

              {Array.isArray(aiReportParsed.news_fundamental_thesis) &&
              aiReportParsed.news_fundamental_thesis.length > 0 ? (
                <View style={{ marginTop: 18 }}>
                  <Text style={{ fontWeight: "700", fontSize: 16, marginBottom: 8 }}>
                    News & fundamentals
                  </Text>
                  {(aiReportParsed.news_fundamental_thesis as any[]).map(
                    (n: any, i: number) => (
                      <View
                        key={i}
                        style={{
                          marginTop: 8,
                          padding: 10,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: "#e2e8f0",
                        }}
                      >
                        <Text style={{ fontWeight: "700", color: "#1e293b" }}>
                          {n.symbol ? String(n.symbol) : "—"}
                        </Text>
                        {n.headline_angle ? (
                          <Text style={{ color: "#475569", marginTop: 4 }}>
                            {String(n.headline_angle)}
                          </Text>
                        ) : null}
                        {n.fundamental_note ? (
                          <Text
                            style={{ color: "#64748b", marginTop: 4, fontSize: 13 }}
                          >
                            {String(n.fundamental_note)}
                          </Text>
                        ) : null}
                      </View>
                    ),
                  )}
                </View>
              ) : null}

              {Array.isArray(aiReportParsed.technical_notes) &&
              aiReportParsed.technical_notes.length > 0 ? (
                <View style={{ marginTop: 18 }}>
                  <Text style={{ fontWeight: "700", fontSize: 16, marginBottom: 8 }}>
                    Technical notes
                  </Text>
                  {(aiReportParsed.technical_notes as any[]).map(
                    (t: any, i: number) => (
                      <Text
                        key={i}
                        style={{ color: "#334155", marginTop: 6, lineHeight: 22 }}
                      >
                        {t.symbol ? `${String(t.symbol)}: ` : ""}
                        {t.note != null ? String(t.note) : ""}
                      </Text>
                    ),
                  )}
                </View>
              ) : null}

              {aiReportParsed.disclaimer != null &&
              String(aiReportParsed.disclaimer).trim() !== "" ? (
                <Text style={{ color: "#94a3b8", fontSize: 12, marginTop: 16, lineHeight: 18 }}>
                  {String(aiReportParsed.disclaimer)}
                </Text>
              ) : null}
            </View>
          ) : (
            <View
              style={{
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#e2e8f0",
                backgroundColor: "#ffffff",
              }}
            >
              <Text style={{ color: "#0f172a", lineHeight: 22 }}>{aiReportText}</Text>
            </View>
          )}
        </View>
      ) : null}

      <View style={{ marginTop: 18 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>
          Ask AI
        </Text>

        <View
          style={{
            borderWidth: 1,
            borderColor: "#e2e8f0",
            borderRadius: 12,
            backgroundColor: "#ffffff",
            padding: 10,
            height: 260,
          }}
        >
          <ScrollView>
            {chatMessages.length === 0 ? (
              <Text style={{ color: "#64748b" }}>
                Ask things like “How should I trim concentration in my top
                holding?” or “Which names look stretched on RSI?”
              </Text>
            ) : null}
            {chatMessages.map((m: any, idx: number) => (
              <View key={idx} style={{ marginBottom: 10 }}>
                <Text style={{ fontWeight: "700", color: "#1e293b" }}>
                  {m.role === "user" ? "You" : "AI"}
                </Text>
                <Text style={{ color: "#0f172a", lineHeight: 20 }}>
                  {m.content}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <TextInput
            value={chatInput}
            onChangeText={setChatInput}
            placeholder="Ask about your portfolio..."
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: "#e2e8f0",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: "#ffffff",
            }}
          />
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={async () => {
              if (!parsed) return;
              const q = chatInput.trim();
              if (!q) return;

              setChatLoading(true);
              setAiError("");
              setChatInput("");

              const nextMessages = [...chatMessages, { role: "user", content: q }];
              setChatMessages(nextMessages);

              try {
                const resp: any = await fetch(`${API_BASE}/ask-stock-ai`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    stock_payload: parsed,
                    question: q,
                    history: nextMessages,
                  }),
                });
                const data = await resp.json();
                const answer = data?.answer ?? "No answer returned.";
                setChatMessages([
                  ...nextMessages,
                  { role: "assistant", content: answer },
                ]);
              } catch (e: any) {
                setAiError(e?.message ?? "Failed to ask AI.");
              } finally {
                setChatLoading(false);
              }
            }}
            disabled={chatLoading}
          >
            <Text style={styles.secondaryButtonText}>
              {chatLoading ? "Sending..." : "Send"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.contentContainer}>
      <Text style={styles.contentTitle}>Stock market analysis</Text>
      <Text style={styles.contentDescription}>
        Upload your equity holdings export (.xlsx) to map weights, pull free
        Yahoo Finance data (news, fundamentals, RSI, 52-week range), and get
        redistribution suggestions grounded in your current book.
      </Text>

      <TouchableOpacity
        style={!resultText ? styles.primaryButton : styles.secondaryButton}
        onPress={pickDocument}
      >
        <Text
          style={
            !resultText ? styles.primaryButtonText : styles.secondaryButtonText
          }
        >
          Upload stock holdings Excel
        </Text>
      </TouchableOpacity>

      {uploadError ? (
        <Text style={{ color: "#ef4444", marginTop: 10 }}>{uploadError}</Text>
      ) : null}

      {enriching ? (
        <Text style={{ color: "#2563eb", marginTop: 10, fontWeight: "600" }}>
          Loading market data (Yahoo Finance)…
        </Text>
      ) : null}

      {parsed ? (
        <View style={{ marginTop: 20 }}>
          <View style={{ flexDirection: "row", marginBottom: 10 }}>
            <TabButton title="Manual analysis" tabKey="manual" />
            <TabButton title="AI-based analysis" tabKey="ai" />
          </View>
          <View style={styles.resultContainer}>
            {activeTab === "manual" ? <ManualTab /> : <AITab />}
          </View>
        </View>
      ) : null}
    </View>
  );
};

export default StockAnalyzer;
