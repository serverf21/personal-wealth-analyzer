import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Platform,
} from "react-native";
import { styles } from "../../styles";
import { API_BASE } from "../../constants/api";
import { parseAiJsonPayload } from "../../utils/parseAiJson";

type TabType = "manual" | "ai";

const FORM_KEY = "north-star-inputs-v1";
const PAYLOAD_KEY = "north-star-payload-v1";
const AI_REPORT_KEY = "north-star-ai-v1";
const AI_CHAT_KEY = "north-star-chat-v1";

type SkillRow = { name: string; proficiency: string };

type FormState = {
  netWorthLakh: string;
  salaryMonthlyLakh: string;
  expensesMonthlyLakh: string;
  sideIncomeLakh: string;
  emergencyFundLakh: string;
  equityLakh: string;
  mfLakh: string;
  bondsLakh: string;
  fdsLakh: string;
  cryptoLakh: string;
  startupEquityLakh: string;
  targetMilestone: "1" | "5" | "10";
  horizonProfile: "balanced" | "near_term" | "long_term";
  salaryVsMarket: string;
  skillDemand: string;
  skillsJson: string;
};

const defaultForm = (): FormState => ({
  netWorthLakh: "",
  salaryMonthlyLakh: "",
  expensesMonthlyLakh: "",
  sideIncomeLakh: "",
  emergencyFundLakh: "",
  equityLakh: "",
  mfLakh: "",
  bondsLakh: "",
  fdsLakh: "",
  cryptoLakh: "",
  startupEquityLakh: "",
  targetMilestone: "1",
  horizonProfile: "balanced",
  salaryVsMarket: "0.9",
  skillDemand: "65",
  skillsJson: '[{"name":"python","proficiency":4},{"name":"sales","proficiency":3}]',
});

function readForm(): FormState {
  if (typeof sessionStorage === "undefined") return defaultForm();
  try {
    const raw = sessionStorage.getItem(FORM_KEY);
    if (!raw) return defaultForm();
    return { ...defaultForm(), ...JSON.parse(raw) };
  } catch {
    return defaultForm();
  }
}

function writeForm(f: FormState): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(FORM_KEY, JSON.stringify(f));
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

function writeString(key: string, v: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (v) sessionStorage.setItem(key, v);
    else sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function parseNum(s: string): number | null {
  const t = s.trim().replace(/,/g, "");
  if (!t) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function lakhToInr(l: number | null): number {
  return (l ?? 0) * 100_000;
}

function formatINR(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return `₹${v.toFixed(0)}`;
  }
}

function milestoneInr(key: string): number {
  if (key === "5") return 50_000_000;
  if (key === "10") return 100_000_000;
  return 10_000_000;
}

function buildSnapshot(form: FormState): Record<string, unknown> {
  let skills: SkillRow[] = [];
  try {
    skills = JSON.parse(form.skillsJson);
  } catch {
    skills = [];
  }
  return {
    inputs: {
      net_worth_lakh: parseNum(form.netWorthLakh),
      salary_monthly_inr: lakhToInr(parseNum(form.salaryMonthlyLakh)),
      expenses_monthly_inr: lakhToInr(parseNum(form.expensesMonthlyLakh)),
      side_income_monthly_inr: lakhToInr(parseNum(form.sideIncomeLakh)),
      emergency_fund_inr: lakhToInr(parseNum(form.emergencyFundLakh)),
      equity_investments_inr: lakhToInr(parseNum(form.equityLakh)),
      mutual_funds_inr: lakhToInr(parseNum(form.mfLakh)),
      bonds_inr: lakhToInr(parseNum(form.bondsLakh)),
      fds_inr: lakhToInr(parseNum(form.fdsLakh)),
      crypto_inr: lakhToInr(parseNum(form.cryptoLakh)),
      startup_equity_inr: lakhToInr(parseNum(form.startupEquityLakh)),
    },
    career_profile: {
      salary_vs_market_pct: parseNum(form.salaryVsMarket) ?? 0.9,
      skill_demand_score: parseNum(form.skillDemand) ?? 65,
      upskill_readiness: 60,
      skills: skills.map((s) => ({
        name: s.name,
        proficiency: parseNum(String(s.proficiency)) ?? 3,
      })),
    },
    horizon_profile: form.horizonProfile,
    target_milestone_inr: milestoneInr(form.targetMilestone),
    risk_tolerance: 50,
  };
}

const NorthStar: React.FC = () => {
  const [tab, setTab] = React.useState<TabType>("manual");
  const [form, setForm] = React.useState<FormState>(readForm);
  const [payload, setPayload] = React.useState<Record<string, unknown> | null>(() => {
    try {
      const raw = readString(PAYLOAD_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [aiReport, setAiReport] = React.useState(readString(AI_REPORT_KEY));
  const [aiLoading, setAiLoading] = React.useState(false);
  const [askLoading, setAskLoading] = React.useState(false);
  const [aiError, setAiError] = React.useState("");
  const [chatQ, setChatQ] = React.useState("");
  const [chatHistory, setChatHistory] = React.useState<{ q: string; a: string }[]>(() => {
    try {
      const raw = readString(AI_CHAT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const setField = (k: keyof FormState, v: string) => {
    const next = { ...form, [k]: v };
    setForm(next);
    writeForm(next);
  };

  const compute = async () => {
    setLoading(true);
    setError("");
    try {
      const body = buildSnapshot(form);
      const res = await fetch(`${API_BASE}/compute-north-star`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPayload(data);
      writeString(PAYLOAD_KEY, JSON.stringify(data));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const extractAiReportJson = (data: Record<string, unknown>): Record<string, unknown> | null => {
    const report = data.report as Record<string, unknown> | undefined;
    if (!report) return null;
    if (report.data && typeof report.data === "object") {
      return report.data as Record<string, unknown>;
    }
    if (typeof report.raw === "string") {
      return parseAiJsonPayload(report.raw);
    }
    return parseAiJsonPayload(JSON.stringify(report));
  };

  const runAi = async () => {
    if (!payload) {
      setAiError("Compute North Star on the Manual tab first.");
      return;
    }
    setAiLoading(true);
    setAiError("");
    try {
      const res = await fetch(`${API_BASE}/analyze-north-star-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ north_star_payload: payload, question: "report" }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Request failed (${res.status})`);
      }
      const data = await res.json();
      const parsed = extractAiReportJson(data);
      if (!parsed) throw new Error("Could not parse AI report JSON.");
      const raw = JSON.stringify(parsed, null, 2);
      setAiReport(raw);
      writeString(AI_REPORT_KEY, raw);
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiLoading(false);
    }
  };

  const askAi = async () => {
    const q = chatQ.trim();
    if (!payload) {
      setAiError("Compute North Star on the Manual tab first.");
      return;
    }
    if (!q) {
      setAiError("Enter a question.");
      return;
    }
    if (askLoading) return;

    setAiError("");
    setAskLoading(true);
    setChatQ("");

    let historyForApi: { role: string; content: string }[] = [];
    setChatHistory((prev) => {
      historyForApi = prev.flatMap((h) => [
        { role: "user", content: h.q },
        { role: "assistant", content: h.a },
      ]);
      return [...prev, { q, a: "Thinking…" }];
    });

    try {
      const res = await fetch(`${API_BASE}/ask-north-star-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          north_star_payload: payload,
          question: q,
          history: historyForApi,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Request failed (${res.status})`);
      }
      const data = await res.json();
      const answer =
        typeof data.answer === "string"
          ? data.answer
          : typeof data.report === "string"
            ? data.report
            : "";
      if (!answer) throw new Error("Empty answer from server.");

      setChatHistory((prev) => {
        const next = [...prev.slice(0, -1), { q, a: answer }];
        writeString(AI_CHAT_KEY, JSON.stringify(next));
        return next;
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setAiError(msg);
      setChatHistory((prev) => {
        const next = prev[prev.length - 1]?.a === "Thinking…" ? prev.slice(0, -1) : prev;
        writeString(AI_CHAT_KEY, JSON.stringify(next));
        return next;
      });
    } finally {
      setAskLoading(false);
    }
  };

  const wm = (payload?.wealth_metrics ?? {}) as Record<string, unknown>;
  const recs = ((payload?.recommendations as Record<string, unknown>)?.recommendations ?? []) as Record<string, unknown>[];
  const sims = ((payload?.simulation as Record<string, unknown>)?.scenarios ?? []) as Record<string, unknown>[];
  const ideas = ((payload?.startup_opportunities as Record<string, unknown>)?.ideas ?? []) as Record<string, unknown>[];
  const reasoning = (payload?.reasoning ?? {}) as Record<string, unknown>;
  const answer = (reasoning.answer ?? {}) as Record<string, unknown>;
  const aiParsed = React.useMemo((): Record<string, unknown> | null => {
    const p = parseAiJsonPayload(aiReport);
    if (!p) return null;
    if (p.data && typeof p.data === "object" && !Array.isArray(p.data)) {
      return p.data as Record<string, unknown>;
    }
    return p;
  }, [aiReport]);

  const isNorthStarAiReport = (o: Record<string, unknown> | null): boolean =>
    !!o &&
    (typeof o.summary === "string" ||
      Array.isArray(o.top_actions_explained) ||
      Array.isArray(o.risks));

  const renderAiReport = (report: Record<string, unknown>) => (
    <View
      style={{
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#e2e8f0",
        backgroundColor: "#ffffff",
        marginBottom: 16,
      }}
    >
      {typeof report.summary === "string" ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: "700", marginBottom: 6, color: "#0f172a" }}>Summary</Text>
          <Text style={{ color: "#334155", lineHeight: 22 }}>{report.summary}</Text>
        </View>
      ) : null}

      {Array.isArray(report.top_actions_explained) && report.top_actions_explained.length > 0 ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: "700", marginBottom: 6, color: "#0f172a" }}>Top actions</Text>
          {(report.top_actions_explained as Record<string, unknown>[]).map((item, i) => (
            <View
              key={i}
              style={{
                marginBottom: 8,
                padding: 10,
                borderRadius: 8,
                backgroundColor: "#f8fafc",
                borderWidth: 1,
                borderColor: "#e2e8f0",
              }}
            >
              <Text style={{ fontWeight: "700", color: "#1e40af" }}>
                {String(item.action ?? `Action ${i + 1}`)}
              </Text>
              {item.why ? (
                <Text style={{ marginTop: 4, color: "#334155", lineHeight: 20 }}>{String(item.why)}</Text>
              ) : null}
              {item.horizon_note ? (
                <Text style={{ marginTop: 4, color: "#64748b", fontSize: 13, lineHeight: 18 }}>
                  {String(item.horizon_note)}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {typeof report.simulation_note === "string" && report.simulation_note ? (
        <View style={{ marginBottom: 10 }}>
          <Text style={{ fontWeight: "700", marginBottom: 4, color: "#0f172a" }}>Simulation</Text>
          <Text style={{ color: "#334155", lineHeight: 20 }}>{report.simulation_note}</Text>
        </View>
      ) : null}

      {typeof report.startup_note === "string" && report.startup_note ? (
        <View style={{ marginBottom: 10 }}>
          <Text style={{ fontWeight: "700", marginBottom: 4, color: "#0f172a" }}>Startup opportunity</Text>
          <Text style={{ color: "#334155", lineHeight: 20 }}>{report.startup_note}</Text>
        </View>
      ) : null}

      {Array.isArray(report.risks) && report.risks.length > 0 ? (
        <View style={{ marginBottom: 10 }}>
          <Text style={{ fontWeight: "700", marginBottom: 6, color: "#0f172a" }}>Risks</Text>
          {(report.risks as unknown[]).map((r, i) => (
            <Text key={i} style={{ color: "#991b1b", lineHeight: 20, marginTop: 2 }}>
              • {String(r)}
            </Text>
          ))}
        </View>
      ) : null}

      {typeof report.disclaimer === "string" ? (
        <Text style={{ color: "#94a3b8", fontSize: 12, marginTop: 8, lineHeight: 18 }}>
          {report.disclaimer}
        </Text>
      ) : null}
    </View>
  );

  const inputStyle = {
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#fff",
    minHeight: 40,
  };

  const inputRow = (label: string, key: keyof FormState, placeholder?: string) => (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 13, marginBottom: 4, color: "#444" }}>{label}</Text>
      <TextInput
        style={inputStyle}
        value={form[key] as string}
        onChangeText={(t) => setField(key, t)}
        placeholder={placeholder ?? "₹ Lakh"}
        keyboardType="decimal-pad"
      />
    </View>
  );

  const askButtonStyle = {
    marginTop: 8,
    backgroundColor: payload && !askLoading ? "#4b5563" : "#9ca3af",
    padding: 12,
    borderRadius: 8,
    alignItems: "center" as const,
    ...(Platform.OS === "web" ? { cursor: askLoading || !payload ? "not-allowed" : "pointer" } : {}),
  };

  return (
    <ScrollView
      style={styles.contentContainer}
      contentContainerStyle={{ paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
    >
      <Text style={styles.contentTitle}>North Star Mode ⭐</Text>
      <Text style={styles.contentDescription}>
        Strategic wealth milestone advisor — engines compute NW, simulations, recommendations, startup ideas, and knowledge-graph reasoning.
      </Text>

      <View style={{ flexDirection: "row", marginVertical: 12, gap: 8 }}>
        {(["manual", "ai"] as TabType[]).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: tab === t ? "#2563eb" : "#e5e7eb",
            }}
          >
            <Text style={{ color: tab === t ? "#fff" : "#111", fontWeight: "600" }}>
              {t === "manual" ? "Manual" : "AI Insights"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "manual" && (
        <View>
          <Text style={{ fontWeight: "700", fontSize: 16, marginBottom: 8 }}>Financial snapshot</Text>
          {inputRow("Net worth (₹ Lakh)", "netWorthLakh")}
          {inputRow("Salary / month (₹ Lakh)", "salaryMonthlyLakh")}
          {inputRow("Expenses / month (₹ Lakh)", "expensesMonthlyLakh")}
          {inputRow("Side income / month (₹ Lakh)", "sideIncomeLakh")}
          {inputRow("Emergency fund (₹ Lakh)", "emergencyFundLakh")}
          {inputRow("Equity investments (₹ Lakh)", "equityLakh")}
          {inputRow("Mutual funds (₹ Lakh)", "mfLakh")}
          {inputRow("Bonds (₹ Lakh)", "bondsLakh")}
          {inputRow("FDs (₹ Lakh)", "fdsLakh")}
          {inputRow("Crypto (₹ Lakh)", "cryptoLakh")}
          {inputRow("Startup equity (₹ Lakh)", "startupEquityLakh")}

          <Text style={{ fontWeight: "700", fontSize: 16, marginTop: 12, marginBottom: 8 }}>Career & skills</Text>
          {inputRow("Salary vs market (0–1)", "salaryVsMarket", "e.g. 0.85")}
          {inputRow("Skill demand score (0–100)", "skillDemand")}
          <Text style={{ fontSize: 13, marginBottom: 4, color: "#444" }}>Skills JSON</Text>
          <TextInput
            style={{ ...inputStyle, minHeight: 72 }}
            value={form.skillsJson}
            onChangeText={(t) => setField("skillsJson", t)}
            multiline
          />

          <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {(["1", "5", "10"] as const).map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setField("targetMilestone", m)}
                style={{
                  padding: 8,
                  borderRadius: 6,
                  backgroundColor: form.targetMilestone === m ? "#059669" : "#f3f4f6",
                }}
              >
                <Text>₹{m}Cr target</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={compute}
            disabled={loading}
            style={{
              marginTop: 16,
              backgroundColor: "#2563eb",
              padding: 14,
              borderRadius: 8,
              alignItems: "center",
            }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "700" }}>Compute North Star</Text>
            )}
          </TouchableOpacity>

          {error ? <Text style={{ color: "#b91c1c", marginTop: 10 }}>{error}</Text> : null}

          {payload && (
            <View style={{ marginTop: 24 }}>
              <Text style={{ fontWeight: "700", fontSize: 18, marginBottom: 8 }}>Wealth metrics</Text>
              <Text>Net worth: {formatINR(wm.net_worth_inr as number)}</Text>
              <Text>FI score: {String(wm.fi_score)} / 100</Text>
              <Text>Wealth velocity: {String(wm.wealth_velocity_score)} / 100</Text>
              <Text>Savings rate: {String(wm.savings_rate_pct)}%</Text>
              <Text>Emergency fund: {String(wm.emergency_fund_months)} months</Text>

              <Text style={{ fontWeight: "700", fontSize: 16, marginTop: 16 }}>Milestone ETAs (months)</Text>
              {wm.milestones && typeof wm.milestones === "object"
                ? Object.entries(wm.milestones as Record<string, Record<string, unknown>>).map(([k, v]) => (
                    <Text key={k}>
                      ₹{Number(k) / 1e7}Cr — base: {String((v.base as Record<string, unknown>)?.months ?? "—")} mo
                    </Text>
                  ))
                : null}

              <Text style={{ fontWeight: "700", fontSize: 16, marginTop: 16 }}>Top recommendations</Text>
              <Text style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
                Scores computed from your inputs + simulation engine (not hardcoded).
              </Text>
              {recs.slice(0, 5).map((r) => {
                const horizons = (r.horizons ?? {}) as Record<string, Record<string, unknown>>;
                const h36 = horizons["36"];
                const h60 = horizons["60"];
                return (
                  <View
                    key={String(r.action_id)}
                    style={{
                      marginBottom: 10,
                      padding: 12,
                      backgroundColor: "#f9fafb",
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: "#e2e8f0",
                    }}
                  >
                    <Text style={{ fontWeight: "700", color: "#1e40af" }}>
                      #{String(r.rank)} {String(r.action_label)} — {String(r.composite_score)}/100
                    </Text>
                    <Text style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                      Confidence {String(r.confidence_pct)}% · Scenario {String(r.linked_simulation)}
                    </Text>
                    {h36 ? (
                      <Text style={{ fontSize: 13, color: "#334155", marginTop: 6 }}>
                        3Y NW delta: {formatINR(h36.expected_nw_delta_inr as number)} · 5Y:{" "}
                        {formatINR((h60?.expected_nw_delta_inr as number) ?? 0)}
                      </Text>
                    ) : null}
                    <Text style={{ fontSize: 12, color: "#555", marginTop: 6, lineHeight: 18 }}>
                      {String((r.reasoning_chain as Record<string, unknown>)?.summary ?? "")}
                    </Text>
                  </View>
                );
              })}

              <Text style={{ fontWeight: "700", fontSize: 16, marginTop: 16 }}>Simulation scenarios</Text>
              {sims.slice(0, 6).map((s) => (
                <Text key={String(s.id)}>
                  #{String(s.rank)} {String(s.name)} — path score {String(s.path_score)}
                </Text>
              ))}

              <Text style={{ fontWeight: "700", fontSize: 16, marginTop: 16 }}>Startup ideas</Text>
              {ideas.slice(0, 5).map((i) => (
                <View key={String(i.id)} style={{ marginBottom: 6 }}>
                  <Text style={{ fontWeight: "600" }}>
                    #{String(i.rank)} {String(i.title)} — wealth score {String(i.wealth_creation_score)}
                  </Text>
                  <Text style={{ fontSize: 12, color: "#666" }}>{String(i.one_liner)}</Text>
                </View>
              ))}

              <Text style={{ fontWeight: "700", fontSize: 16, marginTop: 16 }}>Knowledge graph reasoning</Text>
              <Text>
                Top action toward ₹10Cr:{" "}
                {((answer.top_action as Record<string, unknown>)?.label as string) ?? "—"} (score{" "}
                {String((answer.top_action as Record<string, unknown>)?.score ?? "—")})
              </Text>
            </View>
          )}
        </View>
      )}

      {tab === "ai" && (
        <View>
          {!payload ? (
            <Text style={{ color: "#b45309", marginBottom: 12, lineHeight: 20 }}>
              Run Compute on the Manual tab first so AI has your wealth snapshot.
            </Text>
          ) : null}

          <TouchableOpacity
            onPress={runAi}
            disabled={aiLoading || !payload}
            style={{
              backgroundColor: payload && !aiLoading ? "#7c3aed" : "#a78bfa",
              padding: 12,
              borderRadius: 8,
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>
              {aiLoading ? "Generating report…" : "Generate AI report"}
            </Text>
          </TouchableOpacity>

          {aiError ? (
            <Text style={{ color: "#b91c1c", marginBottom: 12, lineHeight: 20 }}>{aiError}</Text>
          ) : null}

          {aiParsed && isNorthStarAiReport(aiParsed) ? (
            renderAiReport(aiParsed)
          ) : aiReport ? (
            <Text style={{ fontFamily: "monospace", fontSize: 12, marginBottom: 16 }}>{aiReport}</Text>
          ) : (
            <Text style={{ color: "#666", marginBottom: 16 }}>
              Generate a structured report: summary, top actions, simulation, startup note, and risks.
            </Text>
          )}

          <Text style={{ fontWeight: "700", marginTop: 8, marginBottom: 8, fontSize: 16 }}>Ask North Star</Text>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TextInput
              style={{ ...inputStyle, flex: 1, minHeight: 44 }}
              value={chatQ}
              onChangeText={(t) => {
                setChatQ(t);
                if (aiError) setAiError("");
              }}
              placeholder="What action gets me to ₹10Cr fastest?"
              editable={!askLoading}
              onSubmitEditing={() => {
                void askAi();
              }}
              returnKeyType="send"
              blurOnSubmit={Platform.OS !== "web"}
            />
            <Pressable
              onPress={() => {
                if (askLoading) return;
                void askAi();
              }}
              style={askButtonStyle}
              accessibilityRole="button"
              accessibilityState={{ disabled: askLoading || !payload }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>
                {askLoading ? "Thinking…" : "Ask"}
              </Text>
            </Pressable>
          </View>

          {chatHistory.length > 0 ? (
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontWeight: "700", marginBottom: 8 }}>Conversation</Text>
              {chatHistory.map((h, idx) => (
                <View
                  key={idx}
                  style={{
                    marginBottom: 10,
                    padding: 12,
                    backgroundColor: "#f8fafc",
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: "#e2e8f0",
                  }}
                >
                  <Text style={{ fontWeight: "700", color: "#1e3a8a" }}>You</Text>
                  <Text style={{ marginTop: 4, color: "#334155", lineHeight: 20 }}>{h.q}</Text>
                  <Text style={{ fontWeight: "700", color: "#0f172a", marginTop: 10 }}>North Star</Text>
                  <Text style={{ marginTop: 4, color: "#334155", lineHeight: 22 }}>{h.a}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
};

export default NorthStar;
