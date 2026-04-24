import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from "react-native";
import { styles } from "../../styles";
import { API_BASE } from "../../constants/api";
import { parseAiJsonPayload } from "../../utils/parseAiJson";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

type TabType = "manual" | "ai";

const STORAGE_KEY = "wealth-distribution-form-v2";
const AI_REPORT_KEY = "wealth-distribution-ai-v1";
const AI_CHAT_KEY = "wealth-distribution-chat-v1";

export const WEALTH_SEGMENTS = [
  {
    id: "insurance",
    label: "Insurance",
    purpose: "Health, term, and critical protection",
    min: 8,
    max: 12,
  },
  {
    id: "emergency_fund",
    label: "Emergency fund",
    purpose: "3–6 months of essentials",
    min: 10,
    max: 15,
  },
  {
    id: "short_term",
    label: "Short-term expenses",
    purpose: "Travel, gadgets, taxes, upcoming spending",
    min: 10,
    max: 15,
  },
  {
    id: "safe_stable",
    label: "Safe / stable investments",
    purpose: "FD, debt funds, gold, arbitrage, PPF-like stability",
    min: 15,
    max: 25,
  },
  {
    id: "growth_risky",
    label: "Growth / risky investments",
    purpose: "Equity MFs, index funds, stocks, small/mid caps",
    min: 35,
    max: 50,
  },
  {
    id: "speculative",
    label: "Speculative / fun",
    purpose: "High-risk ideas only, if you want",
    min: 0,
    max: 5,
  },
] as const;

export type WealthSegmentRow = {
  id: string;
  label: string;
  purpose: string;
  minPct: number;
  maxPct: number;
  midPct: number;
  minLakh: number;
  maxLakh: number;
  midLakh: number;
};

type FormState = {
  netWorthLakh: string;
  annualIncomeLakh: string;
  upcomingExpensesLakh: string;
  upcomingHorizon: "6" | "12";
  notes: string;
};

const defaultForm = (): FormState => ({
  netWorthLakh: "",
  annualIncomeLakh: "",
  upcomingExpensesLakh: "",
  upcomingHorizon: "6",
  notes: "",
});

function readForm(): FormState {
  if (typeof sessionStorage === "undefined") return defaultForm();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultForm();
    const p = JSON.parse(raw);
    const f = { ...defaultForm(), ...p };
    if (p.upcomingHorizon === "12") f.upcomingHorizon = "12";
    else f.upcomingHorizon = "6";
    return f;
  } catch {
    return defaultForm();
  }
}

function writeForm(f: FormState): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(f));
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

function formatLakh(n: number): string {
  return `₹${n.toFixed(2)} L`;
}

export type ManualPlan = {
  netWorthLakh: number;
  upcomingLakh: number | null;
  incomeLakh: number | null;
  horizonMonths: 6 | 12;
  segments: WealthSegmentRow[];
  alerts: { type: string; message: string }[];
  hints: string[];
};

/** Ideal ₹ split from net worth using reference bands (midpoint % per segment). */
export function computeManualPlan(form: FormState): ManualPlan | null {
  const nw = parseNum(form.netWorthLakh);
  if (nw == null || nw <= 0) return null;

  const segments: WealthSegmentRow[] = WEALTH_SEGMENTS.map((seg) => {
    const mid = (seg.min + seg.max) / 2;
    return {
      id: seg.id,
      label: seg.label,
      purpose: seg.purpose,
      minPct: seg.min,
      maxPct: seg.max,
      midPct: mid,
      minLakh: (nw * seg.min) / 100,
      maxLakh: (nw * seg.max) / 100,
      midLakh: (nw * mid) / 100,
    };
  });

  const upcoming = parseNum(form.upcomingExpensesLakh);
  const income = parseNum(form.annualIncomeLakh);
  const horizonMonths: 6 | 12 = form.upcomingHorizon === "12" ? 12 : 6;

  const short = segments.find((s) => s.id === "short_term")!;
  const emergency = segments.find((s) => s.id === "emergency_fund")!;

  const alerts: { type: string; message: string }[] = [];
  const hints: string[] = [];

  if (upcoming != null && upcoming > 0) {
    const annualizedUpcoming =
      horizonMonths === 12 ? upcoming : upcoming * 2;
    if (upcoming > short.maxLakh) {
      alerts.push({
        type: "gap",
        message: `Upcoming expenses (₹${upcoming.toFixed(2)} L in ${horizonMonths} mo.) exceed the short-term bucket maximum (₹${short.maxLakh.toFixed(2)} L). You need a funding plan beyond the short-term slice.`,
      });
      hints.push(
        "Typical order to free cash (higher risk of regret last): trim speculative → reduce growth allocation → tap safe/stable → only then consider emergency (keep at least 3 months essentials if possible).",
      );
    } else if (upcoming > short.midLakh) {
      alerts.push({
        type: "watch",
        message: `Upcoming spend is above the midpoint of the short-term bucket (₹${short.midLakh.toFixed(2)} L). Ensure these expenses are funded from short-term/liquid holdings, not long-term equity.`,
      });
    }
    if (horizonMonths === 6 && annualizedUpcoming > short.maxLakh * 0.9) {
      hints.push(
        "If similar spending repeats, annualized pressure may exceed the short-term band — consider raising that bucket or cutting discretionary growth/speculative exposure.",
      );
    }
  }

  if (income != null && income > 0) {
    const monthlyLakh = income / 12;
    const essentialsMo = monthlyLakh * 0.45;
    const sixMoNeed = essentialsMo * 6;
    if (emergency.midLakh + 0.01 < sixMoNeed) {
      alerts.push({
        type: "emergency",
        message: `Rough 6-month essentials (≈45% of monthly take-home × 6 ≈ ₹${sixMoNeed.toFixed(2)} L) is above your emergency-fund midpoint (₹${emergency.midLakh.toFixed(2)} L). Building emergency liquidity is usually priority before adding risk.`,
      });
    }
  }

  if (
    upcoming != null &&
    upcoming > 0 &&
    (income == null || income <= 0) &&
    upcoming > short.midLakh
  ) {
    hints.push(
      "Without salary context, emergency sizing is approximate — add recurring income for a tighter emergency vs essentials check.",
    );
  }

  return {
    netWorthLakh: nw,
    upcomingLakh: upcoming,
    incomeLakh: income,
    horizonMonths,
    segments,
    alerts,
    hints,
  };
}

function buildAiPayload(form: FormState, plan: ManualPlan | null) {
  const bands = WEALTH_SEGMENTS.map((s) => ({
    id: s.id,
    label: s.label,
    min_pct: s.min,
    max_pct: s.max,
    purpose: s.purpose,
  }));

  if (!plan) {
    return {
      inputs: {
        net_worth_lakh: null,
        annual_recurring_income_lakh: parseNum(form.annualIncomeLakh),
        upcoming_expenses_lakh: parseNum(form.upcomingExpensesLakh),
        upcoming_expenses_horizon_months:
          form.upcomingHorizon === "12" ? 12 : 6,
        notes: form.notes.trim() || null,
      },
      computed_distribution: null,
      reference_bands: bands,
    };
  }

  return {
    inputs: {
      net_worth_lakh: plan.netWorthLakh,
      annual_recurring_income_lakh: plan.incomeLakh,
      upcoming_expenses_lakh: plan.upcomingLakh,
      upcoming_expenses_horizon_months: plan.horizonMonths,
      notes: form.notes.trim() || null,
    },
    computed_distribution: {
      segments: plan.segments.map((s) => ({
        segment_id: s.id,
        label: s.label,
        suggested_pct_range: `${s.minPct}–${s.maxPct}%`,
        midpoint_pct: s.midPct,
        amount_min_lakh: Math.round(s.minLakh * 100) / 100,
        amount_max_lakh: Math.round(s.maxLakh * 100) / 100,
        amount_mid_lakh: Math.round(s.midLakh * 100) / 100,
        purpose: s.purpose,
      })),
      manual_alerts: plan.alerts,
      manual_hints: plan.hints,
    },
    reference_bands: bands,
  };
}

function isWealthAiReport(o: Record<string, unknown> | null): boolean {
  if (!o) return false;
  return (
    typeof o.summary === "string" ||
    Array.isArray(o.segment_assessment) ||
    Array.isArray(o.funding_options_for_upcoming) ||
    Array.isArray(o.increase_priority) ||
    typeof o.upcoming_expenses_funding === "string" ||
    typeof o.boost_sector_advice === "string"
  );
}

type ChartRow = {
  name: string;
  fullLabel: string;
  midPct: number;
  band: string;
};

const WealthTabButton = React.memo(function WealthTabButton(props: {
  title: string;
  tabKey: TabType;
  activeTab: TabType;
  onSelect: (k: TabType) => void;
}) {
  const { title, tabKey, activeTab, onSelect } = props;
  return (
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
      onPress={() => onSelect(tabKey)}
    >
      <Text style={{ textAlign: "center", fontWeight: "bold" }}>{title}</Text>
    </TouchableOpacity>
  );
});

function WealthManualTab(props: {
  form: FormState;
  updateForm: (patch: Partial<FormState>) => void;
  plan: ManualPlan | null;
  chartData: ChartRow[];
}) {
  const { form, updateForm, plan, chartData } = props;
  return (
    <View>
      <Text style={{ fontWeight: "700", marginBottom: 8, fontSize: 16 }}>
        Your numbers
      </Text>
      <Text style={{ color: "#64748b", marginBottom: 12, lineHeight: 20 }}>
        Enter approximate figures. The dashboard derives a suggested split of
        your net worth across six segments using standard bands (not personal
        advice).
      </Text>

      <View style={{ marginBottom: 12 }}>
        <Text style={{ color: "#334155", fontWeight: "600" }}>
          1. Net worth (approx, ₹ Lakh) *
        </Text>
        <TextInput
          value={form.netWorthLakh}
          onChangeText={(v) => updateForm({ netWorthLakh: v })}
          placeholder="e.g. 80"
          keyboardType="decimal-pad"
          style={{
            marginTop: 6,
            borderWidth: 1,
            borderColor: "#e2e8f0",
            borderRadius: 8,
            padding: 12,
            backgroundColor: "#fff",
          }}
        />
      </View>

      <View style={{ marginBottom: 12 }}>
        <Text style={{ color: "#334155", fontWeight: "600" }}>
          2. Recurring income / salary (annual, ₹ Lakh) — optional
        </Text>
        <Text style={{ color: "#94a3b8", fontSize: 12 }}>
          Used to cross-check emergency fund vs ~6 months of essentials (rough
          heuristic).
        </Text>
        <TextInput
          value={form.annualIncomeLakh}
          onChangeText={(v) => updateForm({ annualIncomeLakh: v })}
          placeholder="Leave blank if none"
          keyboardType="decimal-pad"
          style={{
            marginTop: 6,
            borderWidth: 1,
            borderColor: "#e2e8f0",
            borderRadius: 8,
            padding: 12,
            backgroundColor: "#fff",
          }}
        />
      </View>

      <View style={{ marginBottom: 12 }}>
        <Text style={{ color: "#334155", fontWeight: "600" }}>
          3. Upcoming expenses (total ₹ Lakh in the period below)
        </Text>
        <TextInput
          value={form.upcomingExpensesLakh}
          onChangeText={(v) => updateForm({ upcomingExpensesLakh: v })}
          placeholder="e.g. 4"
          keyboardType="decimal-pad"
          style={{
            marginTop: 6,
            borderWidth: 1,
            borderColor: "#e2e8f0",
            borderRadius: 8,
            padding: 12,
            backgroundColor: "#fff",
          }}
        />
        <Text style={{ color: "#64748b", fontSize: 13, marginTop: 8 }}>
          Horizon
        </Text>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
          {(["6", "12"] as const).map((h) => (
            <TouchableOpacity
              key={h}
              onPress={() => updateForm({ upcomingHorizon: h })}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: form.upcomingHorizon === h ? "#3b82f6" : "#e2e8f0",
                backgroundColor:
                  form.upcomingHorizon === h ? "#eff6ff" : "#fff",
              }}
            >
              <Text
                style={{
                  color: form.upcomingHorizon === h ? "#1d4ed8" : "#64748b",
                  fontWeight: "600",
                }}
              >
                {h === "6" ? "Next 6 months" : "Next 12 months"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={{ marginBottom: 16 }}>
        <Text style={{ color: "#334155", fontWeight: "600" }}>
          Other notes (optional)
        </Text>
        <TextInput
          value={form.notes}
          onChangeText={(v) => updateForm({ notes: v })}
          placeholder="Dependents, large EMIs, job stability, goals…"
          multiline
          style={{
            marginTop: 6,
            minHeight: 80,
            borderWidth: 1,
            borderColor: "#e2e8f0",
            borderRadius: 8,
            padding: 12,
            backgroundColor: "#fff",
            textAlignVertical: "top",
          }}
        />
      </View>

      {!plan ? (
        <View
          style={{
            padding: 12,
            backgroundColor: "#fffbeb",
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "#fde68a",
          }}
        >
          <Text style={{ color: "#92400e" }}>
            Enter a positive net worth (₹ Lakh) to see the suggested distribution
            and charts.
          </Text>
        </View>
      ) : (
        <>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "700",
              marginTop: 8,
              marginBottom: 10,
            }}
          >
            Manual analysis — suggested distribution
          </Text>
          <Text style={{ color: "#64748b", marginBottom: 12, lineHeight: 20 }}>
            Amounts apply your net worth (₹{plan.netWorthLakh.toFixed(2)} L) to
            each segment’s reference band (min–max %; midpoint shown for
            illustration).
          </Text>

          {plan.alerts.length > 0 ? (
            <View style={{ marginBottom: 14 }}>
              {plan.alerts.map((a, i) => (
                <View
                  key={i}
                  style={{
                    padding: 10,
                    marginBottom: 8,
                    borderRadius: 8,
                    backgroundColor:
                      a.type === "gap" ? "#fef2f2" : "#fffbeb",
                    borderWidth: 1,
                    borderColor: a.type === "gap" ? "#fecaca" : "#fde68a",
                  }}
                >
                  <Text style={{ color: "#78350f", lineHeight: 20 }}>
                    {a.message}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {plan.hints.map((h, i) => (
            <Text
              key={i}
              style={{ color: "#475569", fontSize: 13, marginBottom: 8, lineHeight: 20 }}
            >
              • {h}
            </Text>
          ))}

          <View style={{ marginTop: 8 }}>
            {plan.segments.map((s) => (
              <View
                key={s.id}
                style={{
                  marginBottom: 12,
                  padding: 12,
                  backgroundColor: "#fff",
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "#e2e8f0",
                }}
              >
                <Text style={{ fontWeight: "700", color: "#0f172a" }}>
                  {s.label}{" "}
                  <Text style={{ color: "#64748b", fontWeight: "500" }}>
                    ({s.minPct}–{s.maxPct}%)
                  </Text>
                </Text>
                <Text style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>
                  {s.purpose}
                </Text>
                <Text style={{ color: "#0f172a", marginTop: 8 }}>
                  Suggested ₹ range: {formatLakh(s.minLakh)} –{" "}
                  {formatLakh(s.maxLakh)} · Midpoint (~{s.midPct}%):{" "}
                  {formatLakh(s.midLakh)}
                </Text>
              </View>
            ))}
          </View>

          <View style={{ marginTop: 16, width: "100%", height: 300 }}>
            <Text style={{ fontWeight: "700", marginBottom: 8 }}>
              Midpoint % of net worth (by segment)
            </Text>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ bottom: 56 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  angle={-22}
                  textAnchor="end"
                  height={64}
                  interval={0}
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  domain={[0, 55]}
                  label={{ value: "% of NW (mid)", angle: -90, position: "insideLeft" }}
                />
                <Tooltip
                  formatter={(v: number) => [`${v}%`, "Midpoint"]}
                  labelFormatter={(_l, p: any) =>
                    p?.[0]?.payload?.fullLabel ?? ""
                  }
                />
                <Legend />
                <Bar dataKey="midPct" name="Mid % of NW" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </View>
        </>
      )}
    </View>
  );
}

type WealthAITabProps = {
  plan: ManualPlan | null;
  aiReportText: string;
  aiParsed: Record<string, unknown> | null;
  aiLoading: boolean;
  aiError: string;
  chatMessages: any[];
  chatInput: string;
  chatLoading: boolean;
  onGenerate: () => void;
  onChatSend: () => void;
  onChatInputChange: (v: string) => void;
};

function WealthAITab({
  plan,
  aiReportText,
  aiParsed,
  aiLoading,
  aiError,
  chatMessages,
  chatInput,
  chatLoading,
  onGenerate,
  onChatSend,
  onChatInputChange,
}: WealthAITabProps) {
  return (
    <View>
      {!plan ? (
        <Text style={{ color: "#b45309", marginBottom: 12 }}>
          Enter net worth under Manual allocation so AI can use your numbers.
        </Text>
      ) : null}
      <TouchableOpacity
        style={[styles.secondaryButton, !plan && { opacity: 0.5 }]}
        disabled={!plan || aiLoading}
        onPress={onGenerate}
      >
        <Text style={styles.secondaryButtonText}>
          {aiLoading ? "Generating…" : "Generate AI plan"}
        </Text>
      </TouchableOpacity>
      {aiError ? (
        <Text style={{ color: "#ef4444", marginTop: 8 }}>{aiError}</Text>
      ) : null}

      {aiReportText ? (
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 10 }}>
            AI plan
          </Text>
          {aiParsed && isWealthAiReport(aiParsed) ? (
            <View>
              {typeof aiParsed.summary === "string" ? (
                <Text style={{ color: "#334155", lineHeight: 22, marginBottom: 12 }}>
                  {aiParsed.summary}
                </Text>
              ) : null}

              {typeof aiParsed.upcoming_expenses_funding === "string" &&
              String(aiParsed.upcoming_expenses_funding).trim() !== "" ? (
                <View
                  style={{
                    padding: 10,
                    backgroundColor: "#f0fdf4",
                    borderRadius: 8,
                    marginBottom: 12,
                  }}
                >
                  <Text style={{ fontWeight: "700", marginBottom: 6 }}>
                    Funding upcoming expenses
                  </Text>
                  <Text style={{ color: "#334155", lineHeight: 20 }}>
                    {String(aiParsed.upcoming_expenses_funding)}
                  </Text>
                </View>
              ) : null}

              {Array.isArray(aiParsed.funding_options_for_upcoming) &&
              (aiParsed.funding_options_for_upcoming as unknown[]).length > 0 ? (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontWeight: "700", marginBottom: 6 }}>
                    Where to pull money from (safest first)
                  </Text>
                  {(aiParsed.funding_options_for_upcoming as any[]).map(
                    (x, i) => (
                      <View
                        key={i}
                        style={{
                          padding: 10,
                          marginBottom: 8,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: "#e2e8f0",
                        }}
                      >
                        <Text style={{ fontWeight: "600" }}>
                          {String(x.from_segment ?? "—")}
                          {x.relative_safety
                            ? ` · ${String(x.relative_safety)}`
                            : ""}
                        </Text>
                        {x.why ? (
                          <Text style={{ color: "#475569", marginTop: 4 }}>
                            {String(x.why)}
                          </Text>
                        ) : null}
                      </View>
                    ),
                  )}
                </View>
              ) : null}

              {typeof aiParsed.boost_sector_advice === "string" &&
              String(aiParsed.boost_sector_advice).trim() !== "" ? (
                <View
                  style={{
                    padding: 10,
                    backgroundColor: "#eff6ff",
                    borderRadius: 8,
                    marginBottom: 12,
                  }}
                >
                  <Text style={{ fontWeight: "700", marginBottom: 6 }}>
                    Growing one bucket
                  </Text>
                  <Text style={{ color: "#334155", lineHeight: 20 }}>
                    {String(aiParsed.boost_sector_advice)}
                  </Text>
                </View>
              ) : null}

              {Array.isArray(aiParsed.segment_assessment) ? (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontWeight: "700", marginBottom: 6 }}>
                    Segment roles (vs your numbers)
                  </Text>
                  {(aiParsed.segment_assessment as any[]).map((x, i) => (
                    <View
                      key={i}
                      style={{
                        padding: 8,
                        marginBottom: 6,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: "#e2e8f0",
                      }}
                    >
                      <Text style={{ fontWeight: "600" }}>
                        {String(x.segment_id ?? "")}
                      </Text>
                      {x.message ? (
                        <Text style={{ color: "#475569", marginTop: 4 }}>
                          {String(x.message)}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}

              {Array.isArray(aiParsed.increase_priority) &&
              (aiParsed.increase_priority as unknown[]).length > 0 ? (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontWeight: "700", marginBottom: 6 }}>
                    Prioritize building
                  </Text>
                  {(aiParsed.increase_priority as string[]).map((x, i) => (
                    <Text key={i} style={{ color: "#15803d", marginTop: 4 }}>
                      • {x}
                    </Text>
                  ))}
                </View>
              ) : null}

              {Array.isArray(aiParsed.decrease_priority) &&
              (aiParsed.decrease_priority as unknown[]).length > 0 ? (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontWeight: "700", marginBottom: 6 }}>
                    Consider trimming
                  </Text>
                  {(aiParsed.decrease_priority as string[]).map((x, i) => (
                    <Text key={i} style={{ color: "#b45309", marginTop: 4 }}>
                      • {x}
                    </Text>
                  ))}
                </View>
              ) : null}

              {Array.isArray(aiParsed.risks_and_gaps) ? (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontWeight: "700", marginBottom: 6 }}>
                    Risks & gaps
                  </Text>
                  {(aiParsed.risks_and_gaps as string[]).map((x, i) => (
                    <Text key={i} style={{ color: "#334155", marginTop: 4 }}>
                      • {x}
                    </Text>
                  ))}
                </View>
              ) : null}

              {aiParsed.insurance_notes != null &&
              String(aiParsed.insurance_notes).trim() !== "" ? (
                <View
                  style={{
                    padding: 10,
                    backgroundColor: "#fafafa",
                    borderRadius: 8,
                    marginBottom: 12,
                  }}
                >
                  <Text style={{ fontWeight: "700", marginBottom: 4 }}>
                    Insurance
                  </Text>
                  <Text style={{ color: "#334155" }}>
                    {String(aiParsed.insurance_notes)}
                  </Text>
                </View>
              ) : null}

              {aiParsed.disclaimer ? (
                <Text style={{ color: "#94a3b8", fontSize: 12, marginTop: 8 }}>
                  {String(aiParsed.disclaimer)}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={{ color: "#0f172a", lineHeight: 22 }}>{aiReportText}</Text>
          )}
        </View>
      ) : null}

      <View style={{ marginTop: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>
          Ask a follow-up
        </Text>
        <View
          style={{
            borderWidth: 1,
            borderColor: "#e2e8f0",
            borderRadius: 12,
            padding: 10,
            maxHeight: 200,
            backgroundColor: "#fff",
          }}
        >
          <ScrollView>
            {chatMessages.map((m: any, i: number) => (
              <View key={i} style={{ marginBottom: 8 }}>
                <Text style={{ fontWeight: "700" }}>
                  {m.role === "user" ? "You" : "AI"}
                </Text>
                <Text style={{ color: "#334155" }}>{m.content}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <TextInput
            value={chatInput}
            onChangeText={onChatInputChange}
            placeholder="e.g. I need ₹2L more for emergency — where should it come from?"
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: "#e2e8f0",
              borderRadius: 8,
              padding: 10,
              backgroundColor: "#fff",
            }}
          />
          <TouchableOpacity
            style={[styles.secondaryButton, !plan && { opacity: 0.5 }]}
            disabled={!plan || chatLoading}
            onPress={onChatSend}
          >
            <Text style={styles.secondaryButtonText}>
              {chatLoading ? "…" : "Send"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const WealthDistribution: React.FC = () => {
  const [form, setForm] = React.useState<FormState>(() => readForm());
  const [activeTab, setActiveTab] = React.useState<TabType>("manual");
  const [aiReportText, setAiReportText] = React.useState(() =>
    readString(AI_REPORT_KEY),
  );
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiError, setAiError] = React.useState("");
  const [chatText, setChatText] = React.useState(() => readString(AI_CHAT_KEY));
  const [chatInput, setChatInput] = React.useState("");
  const [chatLoading, setChatLoading] = React.useState(false);

  const updateForm = React.useCallback((patch: Partial<FormState>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      writeForm(next);
      return next;
    });
  }, []);

  const plan = React.useMemo(() => computeManualPlan(form), [form]);
  const payload = React.useMemo(
    () => buildAiPayload(form, plan),
    [form, plan],
  );

  const chartData = React.useMemo(() => {
    if (!plan) return [];
    return plan.segments.map((s) => ({
      name: s.label.length > 16 ? s.label.slice(0, 14) + "…" : s.label,
      fullLabel: s.label,
      midPct: Math.round(s.midPct * 10) / 10,
      band: `${s.minPct}–${s.maxPct}%`,
    }));
  }, [plan]);

  const aiParsed = React.useMemo(() => {
    if (!aiReportText) return null;
    return parseAiJsonPayload(aiReportText);
  }, [aiReportText]);

  const setAiReport = React.useCallback((v: string) => {
    setAiReportText(v);
    writeString(AI_REPORT_KEY, v);
  }, []);

  const chatMessages = React.useMemo(() => {
    if (!chatText) return [];
    try {
      const v = JSON.parse(chatText);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }, [chatText]);

  const setChatMessages = React.useCallback((msgs: any[]) => {
    const s = JSON.stringify(msgs);
    setChatText(s);
    writeString(AI_CHAT_KEY, s);
  }, []);

  const handleGenerateAi = React.useCallback(async () => {
    if (!plan) return;
    setAiLoading(true);
    setAiError("");
    try {
      const resp = await fetch(`${API_BASE}/analyze-wealth-distribution-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wealth_payload: payload }),
      });
      const data = await resp.json();
      const structured = data?.report?.data;
      const raw = data?.report?.raw ?? "";
      if (structured) {
        setAiReport(JSON.stringify(structured, null, 2));
      } else {
        const loose = parseAiJsonPayload(raw);
        if (loose) setAiReport(JSON.stringify(loose, null, 2));
        else setAiReport(raw);
      }
    } catch (e: any) {
      setAiError(e?.message ?? "AI request failed.");
    } finally {
      setAiLoading(false);
    }
  }, [plan, payload, setAiReport]);

  const handleChatSend = React.useCallback(async () => {
    const q = chatInput.trim();
    if (!q || !plan) return;
    setChatLoading(true);
    setAiError("");
    setChatInput("");
    const next = [...chatMessages, { role: "user", content: q }];
    setChatMessages(next);
    try {
      const resp = await fetch(`${API_BASE}/ask-wealth-distribution-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wealth_payload: payload,
          question: q,
          history: next,
        }),
      });
      const data = await resp.json();
      const ans = data?.answer ?? "";
      setChatMessages([...next, { role: "assistant", content: ans }]);
    } catch (e: any) {
      setAiError(e?.message ?? "Chat failed.");
    } finally {
      setChatLoading(false);
    }
  }, [plan, payload, chatInput, chatMessages, setChatMessages]);

  return (
    <View style={styles.contentContainer}>
      <Text style={styles.contentTitle}>Wealth distribution</Text>
      <Text style={styles.contentDescription}>
        From net worth, optional income, and upcoming expenses, we show a
        reference split across six buckets — then AI suggests how to fund
        spends or grow a bucket by shifting from others (with safety notes).
      </Text>

      <View style={{ flexDirection: "row", marginBottom: 10 }}>
        <WealthTabButton
          title="Manual analysis"
          tabKey="manual"
          activeTab={activeTab}
          onSelect={setActiveTab}
        />
        <WealthTabButton
          title="AI insights"
          tabKey="ai"
          activeTab={activeTab}
          onSelect={setActiveTab}
        />
      </View>
      <ScrollView style={styles.resultContainer}>
        {activeTab === "manual" ? (
          <WealthManualTab
            form={form}
            updateForm={updateForm}
            plan={plan}
            chartData={chartData}
          />
        ) : (
          <WealthAITab
            plan={plan}
            aiReportText={aiReportText}
            aiParsed={aiParsed}
            aiLoading={aiLoading}
            aiError={aiError}
            chatMessages={chatMessages}
            chatInput={chatInput}
            chatLoading={chatLoading}
            onGenerate={handleGenerateAi}
            onChatSend={handleChatSend}
            onChatInputChange={setChatInput}
          />
        )}
      </ScrollView>
    </View>
  );
};

export default WealthDistribution;
