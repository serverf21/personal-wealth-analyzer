import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { styles } from "../../styles";
import { API_BASE } from "../../constants/api";

const STORAGE_KEY = "cas-import-last-result";

function readStored(): string {
  if (typeof sessionStorage === "undefined") return "";
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStored(v: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (v) sessionStorage.setItem(STORAGE_KEY, v);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

type CasParseResponse = {
  source?: string;
  detected_format?: string;
  summary?: {
    grand_total_value?: number;
    line_count?: number;
    totals_by_asset_class?: Record<string, number>;
  };
  holdings?: Array<Record<string, unknown>>;
  local_parse_error?: string;
};

const CasImport: React.FC = () => {
  const [password, setPassword] = React.useState("");
  const [preferCommercial, setPreferCommercial] = React.useState(false);
  const [includeRaw, setIncludeRaw] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [resultJson, setResultJson] = React.useState(() => readStored());

  const setResult = React.useCallback((v: string) => {
    setResultJson(v);
    writeStored(v);
  }, []);

  const pickAndParse = async () => {
    setError("");
    const res = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });
    if (!res.assets?.length) return;

    const file = res.assets[0];
    const formData = new FormData();
    if (Platform.OS === "web") {
      formData.append("file", file.file as Blob);
    } else {
      formData.append("file", {
        uri: file.uri,
        name: file.name || "cas.pdf",
        type: file.mimeType || "application/pdf",
      } as unknown as Blob);
    }
    formData.append("password", password);
    formData.append("prefer_commercial", preferCommercial ? "true" : "false");
    formData.append("include_raw", includeRaw ? "true" : "false");

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/parse-cas-pdf`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        setError(
          typeof data?.detail === "string"
            ? data.detail
            : JSON.stringify(data?.detail ?? data),
        );
        return;
      }
      setResult(JSON.stringify(data, null, 2));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  let parsed: CasParseResponse | null = null;
  try {
    parsed = resultJson ? (JSON.parse(resultJson) as CasParseResponse) : null;
  } catch {
    parsed = null;
  }

  const totals = parsed?.summary?.totals_by_asset_class;

  return (
    <View style={styles.contentContainer}>
      <Text style={styles.contentTitle}>CAS / Demat import</Text>
      <Text style={styles.contentDescription}>
        Upload a Consolidated Account Statement PDF (CAMS, KFintech, CDSL eCAS, or
        NSDL eCAS). Parsing runs on this server using the open-source casparser
        library. For difficult files or broader asset coverage (some bonds, NPS,
        AIF rows), set{" "}
        <Text style={{ fontWeight: "700" }}>CAS_PARSER_API_KEY</Text> on the
        server and use "Prefer cloud parser" (CAS Parser API — free tier at
        casparser.in).
      </Text>

      <View style={{ marginBottom: 12 }}>
        <Text style={{ fontWeight: "600", color: "#334155", marginBottom: 6 }}>
          PDF password (usually your PAN; CDSL/NSDL may use encrypted PAN)
        </Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Enter CAS password"
          secureTextEntry
          autoCapitalize="characters"
          style={{
            borderWidth: 1,
            borderColor: "#e2e8f0",
            borderRadius: 8,
            padding: 12,
            backgroundColor: "#fff",
          }}
        />
      </View>

      <TouchableOpacity
        style={{ marginBottom: 8, flexDirection: "row", alignItems: "center" }}
        onPress={() => setPreferCommercial(!preferCommercial)}
      >
        <Text style={{ marginRight: 8 }}>{preferCommercial ? "☑" : "☐"}</Text>
        <Text style={{ color: "#334155" }}>
          Prefer cloud parser (requires CAS_PARSER_API_KEY on server)
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={{ marginBottom: 16, flexDirection: "row", alignItems: "center" }}
        onPress={() => setIncludeRaw(!includeRaw)}
      >
        <Text style={{ marginRight: 8 }}>{includeRaw ? "☑" : "☐"}</Text>
        <Text style={{ color: "#334155" }}>
          Include raw parsed payload (large JSON)
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.secondaryButton, loading && { opacity: 0.6 }]}
        disabled={loading}
        onPress={pickAndParse}
      >
        <Text style={styles.secondaryButtonText}>
          {loading ? "Parsing…" : "Choose CAS PDF"}
        </Text>
      </TouchableOpacity>

      {error ? (
        <Text style={{ color: "#dc2626", marginTop: 12 }}>{error}</Text>
      ) : null}

      {parsed ? (
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontWeight: "700", marginBottom: 8 }}>
            Result — {parsed.source ?? "?"} · {parsed.detected_format ?? "?"}
          </Text>
          {parsed.local_parse_error ? (
            <Text style={{ color: "#b45309", marginBottom: 8 }}>
              Note: {parsed.local_parse_error}
            </Text>
          ) : null}
          <Text style={{ color: "#64748b", marginBottom: 6 }}>
            Lines: {parsed.summary?.line_count ?? "—"} · Total ₹ (parsed):{" "}
            {parsed.summary?.grand_total_value ?? "—"}
          </Text>
          {totals && Object.keys(totals).length > 0 ? (
            <View style={{ marginBottom: 10 }}>
              <Text style={{ fontWeight: "600", marginBottom: 4 }}>
                By asset class
              </Text>
              {Object.entries(totals).map(([k, v]) => (
                <Text key={k} style={{ color: "#334155" }}>
                  {k}: ₹{typeof v === "number" ? v.toLocaleString("en-IN") : v}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <ScrollView style={[styles.resultContainer, { marginTop: 8 }]}>
        <Text style={styles.resultText} selectable>
          {resultJson || "No CAS parsed yet."}
        </Text>
      </ScrollView>
    </View>
  );
};

export default CasImport;
