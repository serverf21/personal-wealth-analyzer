import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { styles } from "../../styles";
import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { API_BASE } from "../../constants/api";
import GenericTable from "../../components/account-statement-table";
import { SpendingCharts } from "../../components/spendings-charts";
import { AiAccountAnalysis } from "../../components/ai-analysis";
import * as XLSX from "xlsx";

type TabType = "tabulated" | "charts" | "analysis";

const SESSION_STORAGE_KEY = "account-analyzer-statement";

function getStoredStatement(): string {
  if (typeof sessionStorage === "undefined") return "";
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function setStoredStatement(value: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (value) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, value);
    } else {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

function downloadCSV(tableData: string[][], filename = "statement.csv") {
  const csv = tableData
    .map((row) =>
      row
        .map((cell) => {
          const escaped = String(cell ?? "").replace(/"/g, '""');
          return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
        })
        .join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadExcel(tableData: string[][], filename = "statement.xlsx") {
  const ws = XLSX.utils.aoa_to_sheet(tableData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Statement");
  XLSX.writeFile(wb, filename);
}

const AccountAnalyzer: React.FC = () => {
  const [resultText, setResultText] = React.useState<string>(() =>
    getStoredStatement(),
  );
  const [activeTab, setActiveTab] = React.useState<TabType>("tabulated");

  const updateResultText = React.useCallback((value: string) => {
    setResultText(value);
    setStoredStatement(value);
  }, []);

  const parsedTableData = React.useMemo<string[][]>(() => {
    if (!resultText) return [];
    try {
      return JSON.parse(resultText);
    } catch {
      return [];
    }
  }, [resultText]);

  const pickDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });

    if (res.assets && res.assets.length > 0) {
      const file = res.assets[0];

      // Convert it to a Blob-like structure
      const formData = new FormData();
      if (Platform.OS === "web") {
        // On web, DocumentPicker returns a File object in res.assets[0].file
        formData.append("file", file.file);
      } else {
        // On native, use uri, name, and type
        formData.append("file", {
          uri: file.uri,
          name: file.name,
          type: file.mimeType || "application/pdf",
        } as any);
      }

      const response: any = await fetch(`${API_BASE}/upload-pdf`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      updateResultText(JSON.stringify(data.tables, null, 2));
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "tabulated":
        return <GenericTable data={resultText} />;
      case "charts":
        return <SpendingCharts tables={JSON.parse(resultText)} />;
      case "analysis":
        return (
          <Text style={styles.resultText}>
            <AiAccountAnalysis tables={JSON.parse(resultText)} />
          </Text>
        );
      default:
        return null;
    }
  };

  const TabButton: React.FC<{
    title: string;
    tabKey: TabType;
  }> = ({ title, tabKey }) => (
    <TouchableOpacity
      style={{
        flex: 1,
        padding: 10,
        backgroundColor: activeTab === tabKey ? "#e0e0e0" : "#fff",
        borderWidth: 1,
        borderColor: "#ccc",
        ...(tabKey === "tabulated"
          ? {
              borderTopLeftRadius: 8,
              borderBottomLeftRadius: 8,
            }
          : tabKey === "analysis"
            ? {
                borderTopRightRadius: 8,
                borderBottomRightRadius: 8,
              }
            : {}),
      }}
      onPress={() => setActiveTab(tabKey)}
    >
      <Text style={{ textAlign: "center", fontWeight: "bold" }}>{title}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.contentContainer}>
      <Text style={styles.contentTitle}>Account Statement Analyzer</Text>
      <Text style={styles.contentDescription}>
        Upload your bank statements to get AI-powered insights on your spending
        patterns, identify unnecessary expenses, and receive personalized
        recommendations.
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
          📄 Upload PDF Statement
        </Text>
      </TouchableOpacity>

      {resultText ? (
        <View style={{ marginTop: 20 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 10,
              gap: 8,
            }}
          >
            {/* Tab switcher */}
            <View style={{ flexDirection: "row", flex: 1 }}>
              <TabButton title="Tabulated View" tabKey="tabulated" />
              <TabButton title="Spending Charts" tabKey="charts" />
              <TabButton title="AI Insights" tabKey="analysis" />
            </View>

            {/* Download buttons — only shown on tabulated tab */}
            {activeTab === "tabulated" && parsedTableData.length > 0 && (
              <View style={{ flexDirection: "row", gap: 6 }}>
                <TouchableOpacity
                  onPress={() => downloadCSV(parsedTableData)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    backgroundColor: "#fff",
                    borderWidth: 1,
                    borderColor: "#4CAF50",
                    borderRadius: 6,
                  }}
                >
                  <Text
                    style={{ color: "#4CAF50", fontWeight: "bold", fontSize: 13 }}
                  >
                    ⬇ CSV
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => downloadExcel(parsedTableData)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    backgroundColor: "#fff",
                    borderWidth: 1,
                    borderColor: "#1565C0",
                    borderRadius: 6,
                  }}
                >
                  <Text
                    style={{ color: "#1565C0", fontWeight: "bold", fontSize: 13 }}
                  >
                    ⬇ Excel
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          <View style={styles.resultContainer}>{renderTabContent()}</View>
        </View>
      ) : null}
    </View>
  );
};

export default AccountAnalyzer;
