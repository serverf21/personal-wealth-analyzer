import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { styles } from "../../styles";
import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import GenericTable from "../../components/table";

const AccountAnalyzer: React.FC = () => {
  const [resultText, setResultText] = React.useState<string>("");
  const [activeTab, setActiveTab] = React.useState<"tabulated" | "analysis">(
    "tabulated"
  );

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
          onPress={pickDocument}
        >
          📄 Upload PDF Statement
        </Text>
      </TouchableOpacity>

      {/* Tab group */}
      {resultText ? (
        <View style={{ marginTop: 20 }}>
          <View style={{ flexDirection: "row", marginBottom: 10 }}>
            <TouchableOpacity
              style={{
                flex: 1,
                padding: 10,
                backgroundColor: activeTab === "tabulated" ? "#e0e0e0" : "#fff",
                borderTopLeftRadius: 8,
                borderBottomLeftRadius: 8,
                borderWidth: 1,
                borderColor: "#ccc",
              }}
              onPress={() => setActiveTab("tabulated")}
            >
              <Text style={{ textAlign: "center", fontWeight: "bold" }}>
                Tabulated View
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                flex: 1,
                padding: 10,
                backgroundColor: activeTab === "analysis" ? "#e0e0e0" : "#fff",
                borderTopRightRadius: 8,
                borderBottomRightRadius: 8,
                borderWidth: 1,
                borderColor: "#ccc",
              }}
              onPress={() => setActiveTab("analysis")}
            >
              <Text style={{ textAlign: "center", fontWeight: "bold" }}>
                Analysis
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.resultContainer}>
            {activeTab === "tabulated" ? (
              <>
                <GenericTable data={resultText} />
                {/* <Text style={styles.resultText}>{resultText}</Text> */}
              </>
            ) : (
              <Text style={styles.resultText}>Analysis coming soon...</Text>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
};

export default AccountAnalyzer;
