import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { styles } from "../../styles";
import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import GenericTable from "../../components/account-statement-table";
import { SpendingCharts } from "../../components/spendings-charts";
import { AiAccountAnalysis } from "../../components/ai-analysis";

type TabType = "tabulated" | "charts" | "analysis";

const AccountAnalyzer: React.FC = () => {
  const [resultText, setResultText] = React.useState<string>("");
  const [activeTab, setActiveTab] = React.useState<TabType>("tabulated");

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

      const response: any = await fetch("http://0.0.0.0:8000/upload-pdf", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      setResultText(JSON.stringify(data.tables, null, 2));
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
          <View style={{ flexDirection: "row", marginBottom: 10 }}>
            <TabButton title="Tabulated View" tabKey="tabulated" />
            <TabButton title="Spending Charts" tabKey="charts" />
            <TabButton title="AI Insights" tabKey="analysis" />
          </View>
          <View style={styles.resultContainer}>{renderTabContent()}</View>
        </View>
      ) : null}
    </View>
  );
};

export default AccountAnalyzer;
