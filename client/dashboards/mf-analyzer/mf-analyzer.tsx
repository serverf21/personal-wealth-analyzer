import React from "react";
import { View, Text, TouchableOpacity, Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
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
} from "recharts";

type TabType = "manual" | "ai";

const SESSION_STORAGE_KEY = "mf-analyzer-holdings-v1";

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

const MFAnalyzer: React.FC = () => {
  const [activeTab, setActiveTab] = React.useState<TabType>("manual");
  const [resultText, setResultText] = React.useState<string>(() =>
    readSession(),
  );

  const updateResultText = React.useCallback((value: string) => {
    setResultText(value);
    writeSession(value);
  }, []);

  const parsed = React.useMemo(() => {
    if (!resultText) return null;
    try {
      return JSON.parse(resultText);
    } catch {
      return null;
    }
  }, [resultText]);

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
        "http://0.0.0.0:8000/upload-mf-holdings-excel",
        {
          method: "POST",
          body: formData,
        },
      );

      const data = await response.json();
      updateResultText(JSON.stringify(data, null, 2));
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
      <Text style={{ fontSize: 16, color: "#64748b" }}>
        AI Analysis will be integrated later (no Ask AI in this MVP).
      </Text>
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
