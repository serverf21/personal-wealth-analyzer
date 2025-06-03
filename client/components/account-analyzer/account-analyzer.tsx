import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { styles } from "../../styles";
import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";

const AccountAnalyzer: React.FC = () => {
  const [resultText, setResultText] = React.useState<string>("");

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
      console.log("FormData:", formData, file);

      const response = await fetch("http://0.0.0.0:8000/upload-pdf", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      setResultText(data.text);
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

      <TouchableOpacity style={styles.uploadButton} onPress={pickDocument}>
        <Text style={styles.uploadButtonText} onPress={pickDocument}>
          📄 Upload PDF Statement
        </Text>
      </TouchableOpacity>

      {resultText ? (
        <View style={styles.resultContainer}>
          <Text style={styles.resultText}>{resultText}</Text>
        </View>
      ) : null}
    </View>
  );
};

export default AccountAnalyzer;
