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
import { styles } from "../../styles";
import { parseAiJsonPayload } from "../../utils/parseAiJson";
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
} from "recharts";

type TabType = "manual" | "ai";

const SESSION_STORAGE_KEY = "mf-analyzer-holdings-v1";
const AI_REPORT_STORAGE_KEY = "mf-analyzer-ai-report-v1";
const AI_CHAT_STORAGE_KEY = "mf-analyzer-ai-chat-v1";

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

function isMfAiReport(o: Record<string, unknown> | null): boolean {
  if (!o) return false;
  const riskOk =
    o.risk_profile === "low" || o.risk_profile === "moderate" || o.risk_profile === "high";
  return (
    riskOk ||
    Array.isArray(o.key_findings) ||
    Array.isArray(o.concentration_flags) ||
    Array.isArray(o.overlap_signals) ||
    Array.isArray(o.recommendations) ||
    typeof o.disclaimer === "string"
  );
}

const MFAnalyzer: React.FC = () => {
  const [activeTab, setActiveTab] = React.useState<TabType>("manual");
  const [resultText, setResultText] = React.useState<string>(() =>
    readSession(),
  );
  const [aiReportText, setAiReportText] = React.useState<string>(() =>
    readString(AI_REPORT_STORAGE_KEY),
  );
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiError, setAiError] = React.useState<string>("");

  const [chatMessagesText, setChatMessagesText] = React.useState<string>(() =>
    readString(AI_CHAT_STORAGE_KEY),
  );
  const [chatInput, setChatInput] = React.useState<string>("");
  const [chatLoading, setChatLoading] = React.useState(false);

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

  const aiParsed = React.useMemo(() => {
    if (!aiReportText) return null;
    return parseAiJsonPayload(aiReportText);
  }, [aiReportText]);

  const pickDocument = async () => {
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
        `${API_BASE}/upload-mf-holdings-excel`,
        {
          method: "POST",
          body: formData,
        },
      );

      const data = await response.json();
      updateResultText(JSON.stringify(data, null, 2));

      updateAiReport("");
      setAiError("");
      setChatMessages([]);
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

  const allocationCategory = computed?.allocation_by_category ?? [];
  const allocationSubCategory = computed?.allocation_by_sub_category ?? [];
  const allocationAmc = computed?.allocation_by_amc ?? [];
  const topSchemes = computed?.top_schemes_by_current_value ?? [];

  const ManualTab = () => (
    <View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {[
          {
            label: "Total Invested",
            value: formatINR(summary.total_invested),
          },
          {
            label: "Current Value",
            value: formatINR(summary.current_value),
          },
          {
            label: "Profit / Loss",
            value: formatINR(summary.profit_loss),
          },
          {
            label: "P/L %",
            value:
              typeof summary.profit_loss_pct === "number"
                ? `${summary.profit_loss_pct.toFixed(2)}%`
                : "-",
          },
          {
            label: "Portfolio XIRR",
            value:
              typeof summary.xirr_pct === "number"
                ? `${summary.xirr_pct.toFixed(2)}%`
                : "-",
          },
          {
            label: "As on",
            value: summary.as_on ?? "-",
          },
        ].map((card) => (
          <View
            key={card.label}
            style={{
              minWidth: 220,
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
      </View>

      <View style={{ marginTop: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 10 }}>
          Allocation
        </Text>

        <View style={{ flexDirection: "row", gap: 20, flexWrap: "wrap" }}>
          <View style={{ width: 420, height: 320 }}>
            <Text style={{ fontWeight: "700", marginBottom: 8 }}>
              By Category
            </Text>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={allocationCategory}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={110}
                  label
                >
                  {allocationCategory.map((_: any, idx: number) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </View>

          <View style={{ width: 520, height: 320 }}>
            <Text style={{ fontWeight: "700", marginBottom: 8 }}>
              Top Schemes (by current value)
            </Text>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topSchemes}>
                <XAxis dataKey="name" hide />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </View>
        </View>

        <View
          style={{
            marginTop: 20,
            flexDirection: "row",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <View style={{ width: 520, height: 320 }}>
            <Text style={{ fontWeight: "700", marginBottom: 8 }}>
              By Sub-category
            </Text>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={allocationSubCategory.slice(0, 10)}>
                <XAxis dataKey="name" hide />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </View>

          <View style={{ width: 520, height: 320 }}>
            <Text style={{ fontWeight: "700", marginBottom: 8 }}>By AMC</Text>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={allocationAmc.slice(0, 10)}>
                <XAxis dataKey="name" hide />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </View>
        </View>
      </View>

      <View style={{ marginTop: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 10 }}>
          Holdings
        </Text>
        <View style={{ backgroundColor: "#fff", borderRadius: 12 }}>
          <Text style={{ color: "#64748b" }}>
            Parsed {computed?.counts?.rows ?? 0} rows (
            {computed?.counts?.unique_schemes ?? 0} schemes)
          </Text>
          <Text style={{ color: "#64748b", marginTop: 6 }}>
            (Detailed holdings table UI comes next; for now we’re using the
            server-normalized JSON.)
          </Text>
        </View>
      </View>
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
              const resp: any = await fetch(`${API_BASE}/analyze-mf-ai`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mf_payload: parsed }),
              });
              const data = await resp.json();
              const structured = data?.report?.data;
              const raw = data?.report?.raw ?? "";
              if (structured) {
                updateAiReport(JSON.stringify(structured, null, 2));
              } else {
                updateAiReport(raw);
              }
            } catch (e: any) {
              setAiError(e?.message ?? "Failed to generate AI report.");
            } finally {
              setAiLoading(false);
            }
          }}
        >
          <Text style={styles.secondaryButtonText}>
            {aiLoading ? "Generating..." : "Generate AI Insights"}
          </Text>
        </TouchableOpacity>

        {aiError ? (
          <Text style={{ color: "#ef4444", flex: 1 }}>{aiError}</Text>
        ) : null}
      </View>

      {aiReportText ? (
        <View style={{ marginTop: 14 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>
            AI Report
          </Text>
          <View
            style={{
              padding: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#e2e8f0",
              backgroundColor: "#ffffff",
            }}
          >
            {aiParsed && isMfAiReport(aiParsed) ? (
              <View>
                {typeof aiParsed.risk_profile === "string" ? (
                  <View style={{ marginBottom: 10 }}>
                    <Text style={{ color: "#64748b", fontSize: 12 }}>
                      Risk profile
                    </Text>
                    <Text style={{ color: "#0f172a", fontSize: 18, fontWeight: "700" }}>
                      {String(aiParsed.risk_profile).toUpperCase()}
                    </Text>
                  </View>
                ) : null}

                {Array.isArray(aiParsed.key_findings) && aiParsed.key_findings.length > 0 ? (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontWeight: "700", marginBottom: 6 }}>
                      Key findings
                    </Text>
                    {(aiParsed.key_findings as unknown[]).slice(0, 12).map((x, i) => (
                      <Text key={i} style={{ color: "#0f172a", lineHeight: 20, marginTop: 2 }}>
                        • {String(x)}
                      </Text>
                    ))}
                  </View>
                ) : null}

                {Array.isArray(aiParsed.concentration_flags) &&
                aiParsed.concentration_flags.length > 0 ? (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontWeight: "700", marginBottom: 6 }}>
                      Concentration flags
                    </Text>
                    {(aiParsed.concentration_flags as any[]).slice(0, 10).map((f, i) => (
                      <View
                        key={i}
                        style={{
                          padding: 10,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: "#fee2e2",
                          backgroundColor: "#fef2f2",
                          marginBottom: 8,
                        }}
                      >
                        <Text style={{ fontWeight: "700", color: "#7f1d1d" }}>
                          {String(f?.title ?? "Flag")}
                        </Text>
                        {f?.evidence ? (
                          <Text style={{ color: "#991b1b", marginTop: 4, lineHeight: 20 }}>
                            Evidence: {String(f.evidence)}
                          </Text>
                        ) : null}
                        {f?.impact ? (
                          <Text style={{ color: "#7f1d1d", marginTop: 4, lineHeight: 20 }}>
                            Impact: {String(f.impact)}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null}

                {Array.isArray(aiParsed.overlap_signals) && aiParsed.overlap_signals.length > 0 ? (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontWeight: "700", marginBottom: 6 }}>
                      Overlap signals
                    </Text>
                    {(aiParsed.overlap_signals as any[]).slice(0, 10).map((s, i) => (
                      <View
                        key={i}
                        style={{
                          padding: 10,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: "#fde68a",
                          backgroundColor: "#fffbeb",
                          marginBottom: 8,
                        }}
                      >
                        <Text style={{ fontWeight: "700", color: "#78350f" }}>
                          {String(s?.title ?? "Signal")}
                        </Text>
                        {s?.evidence ? (
                          <Text style={{ color: "#92400e", marginTop: 4, lineHeight: 20 }}>
                            Evidence: {String(s.evidence)}
                          </Text>
                        ) : null}
                        {s?.action ? (
                          <Text style={{ color: "#78350f", marginTop: 4, lineHeight: 20 }}>
                            Action: {String(s.action)}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null}

                {Array.isArray(aiParsed.recommendations) && aiParsed.recommendations.length > 0 ? (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontWeight: "700", marginBottom: 6 }}>
                      Recommendations
                    </Text>
                    {(aiParsed.recommendations as any[]).slice(0, 12).map((r, i) => (
                      <View
                        key={i}
                        style={{
                          padding: 10,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: "#dbeafe",
                          backgroundColor: "#eff6ff",
                          marginBottom: 8,
                        }}
                      >
                        <Text style={{ fontWeight: "700", color: "#1e3a8a" }}>
                          {String(r?.title ?? "Recommendation")}
                        </Text>
                        {r?.why ? (
                          <Text style={{ color: "#1d4ed8", marginTop: 4, lineHeight: 20 }}>
                            Why: {String(r.why)}
                          </Text>
                        ) : null}
                        {r?.how ? (
                          <Text style={{ color: "#1e3a8a", marginTop: 4, lineHeight: 20 }}>
                            How: {String(r.how)}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null}

                {typeof aiParsed.disclaimer === "string" && aiParsed.disclaimer.trim() ? (
                  <Text style={{ color: "#94a3b8", fontSize: 12, lineHeight: 18 }}>
                    {aiParsed.disclaimer}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text style={{ color: "#0f172a", lineHeight: 22 }}>
                {aiReportText}
              </Text>
            )}
          </View>
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
                Ask questions like “Is my portfolio too risky?” or “Where am I
                over-concentrated?”
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
            placeholder="Type your question..."
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
                const resp: any = await fetch(`${API_BASE}/ask-mf-ai`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    mf_payload: parsed,
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
      <Text style={styles.contentTitle}>MF Analyzer</Text>
      <Text style={styles.contentDescription}>
        Upload your mutual fund holdings statement (.xlsx) to get allocation,
        concentration, and holdings insights.
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
          Upload MF Holdings Excel
        </Text>
      </TouchableOpacity>

      {parsed ? (
        <View style={{ marginTop: 20 }}>
          <View style={{ flexDirection: "row", marginBottom: 10 }}>
            <TabButton title="Manual Analysis" tabKey="manual" />
            <TabButton title="AI Analysis" tabKey="ai" />
          </View>
          <View style={styles.resultContainer}>
            {activeTab === "manual" ? <ManualTab /> : <AITab />}
          </View>
        </View>
      ) : null}
    </View>
  );
};

export default MFAnalyzer;
