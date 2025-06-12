import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Dimensions } from "react-native";
import { BarChart } from "react-native-chart-kit";

interface Transaction {
  date: string;
  particulars: string;
  amount: string;
  type: string;
  category: string;
  necessity_level: number;
  ai_analysis: string;
}

interface AIAnalysisData {
  ai_analysis: {
    ai_analyzed_transactions: Transaction[];
    summary: {
      total_transactions: number;
      average_necessity: number;
      recommendation: string;
    };
  };
}

export const AiAccountAnalysis: React.FC<any> = ({ tables }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<Transaction[]>([]);
  const [spendingsSummary, setSpendingsSummary] = useState<any>(null);

  const screenWidth = Dimensions.get("window").width;

  const processChartData = () => {
    if (!analysisData?.length) {
      return {
        categoryChartData: {
          labels: ["No Data"],
          datasets: [
            {
              data: [0],
            },
          ],
        },
        necessityData: {
          labels: ["1", "2", "3", "4", "5"],
          datasets: [
            {
              data: [0, 0, 0, 0, 0],
            },
          ],
        },
      };
    }

    // Process category data with Others category
    const categoryData = analysisData.reduce((acc, transaction) => {
      if (!transaction.category) return acc;
      const amount = transaction.amount ? parseFloat(transaction.amount) : 0;
      if (amount > 0 && !isNaN(amount)) {
        acc[transaction.category] = (acc[transaction.category] || 0) + amount;
      }
      return acc;
    }, {} as Record<string, number>);

    // Check if we have any valid category data
    const categoryEntries = Object.entries(categoryData);
    if (categoryEntries.length === 0) {
      return {
        categoryChartData: {
          labels: ["No Categories"],
          datasets: [
            {
              data: [0],
            },
          ],
        },
        necessityData: {
          labels: ["1", "2", "3", "4", "5"],
          datasets: [
            {
              data: [0, 0, 0, 0, 0],
            },
          ],
        },
      };
    }

    // Sort categories by value and separate top 10 and others
    const sortedCategories = categoryEntries.sort(([, a], [, b]) => b - a);
    const top10Categories = sortedCategories.slice(0, 10);
    const otherCategories = sortedCategories.slice(10);

    // Calculate total for others
    const othersTotal = otherCategories.reduce(
      (sum, [, value]) => sum + value,
      0
    );

    // Combine top 10 and others (only add Others if there are other categories)
    const finalCategories = [...top10Categories];
    if (othersTotal > 0) {
      finalCategories.push(["Others", othersTotal]);
    }

    // Ensure we have at least one data point
    if (finalCategories.length === 0) {
      return {
        categoryChartData: {
          labels: ["No Data"],
          datasets: [
            {
              data: [0],
            },
          ],
        },
        necessityData: {
          labels: ["1", "2", "3", "4", "5"],
          datasets: [
            {
              data: [0, 0, 0, 0, 0],
            },
          ],
        },
      };
    }

    // Prepare data for bar chart
    const categoryChartData = {
      labels: finalCategories.map(([name]) => String(name)),
      datasets: [
        {
          data: finalCategories.map(([, value]) => Number(value)),
        },
      ],
    };

    // Process necessity levels for bar chart
    const necessityData = Array(5).fill(0);
    analysisData.forEach((transaction) => {
      if (
        transaction.necessity_level &&
        transaction.necessity_level >= 1 &&
        transaction.necessity_level <= 5
      ) {
        necessityData[transaction.necessity_level - 1]++;
      }
    });

    return {
      categoryChartData,
      necessityData: {
        labels: ["1", "2", "3", "4", "5"],
        datasets: [
          {
            data: necessityData,
          },
        ],
      },
    };
  };

  useEffect(() => {
    const fetchAnalysis = async () => {
      if (!tables || !tables.length) return;

      // Filter out completely empty rows
      const validTransactions = tables.filter((row) =>
        row.some((cell) => cell !== null && cell !== "")
      );

      // Remove any rows that don't have the expected number of columns
      const headerRow = validTransactions[0];
      if (!headerRow) return;

      const filteredTransactions = validTransactions.filter(
        (row) => row.length === headerRow.length
      );

      setLoading(true);
      setError(null); // Reset error state

      try {
        const response = await fetch(
          "http://localhost:8000/analyze-ai-transactions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              transactions: filteredTransactions,
              use_ai: true,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || "Failed to fetch analysis data");
        }

        const data: AIAnalysisData = await response.json();

        // Validate the response structure
        if (data?.ai_analysis?.ai_analyzed_transactions) {
          setAnalysisData(data.ai_analysis.ai_analyzed_transactions);
          setSpendingsSummary(data.ai_analysis.summary);
        } else {
          throw new Error("Invalid response structure");
        }
      } catch (err) {
        console.error("Error:", err);
        setError(err instanceof Error ? err.message : "An error occurred");
        // Set empty data on error to prevent chart crashes
        setAnalysisData([]);
        setSpendingsSummary(null);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalysis();
  }, [tables]);

  // Don't render charts until we have processed the data
  const chartData = processChartData();

  if (loading) return <Text>Loading analysis...</Text>;
  if (error) return <Text>Error: {error}</Text>;

  // Additional safety check
  if (
    !chartData?.categoryChartData?.labels?.length ||
    !chartData?.categoryChartData?.datasets?.[0]?.data?.length
  ) {
    return <Text>No valid data available for charts</Text>;
  }

  const chartConfig = {
    backgroundColor: "#ffffff",
    backgroundGradientFrom: "#ffffff",
    backgroundGradientTo: "#ffffff",
    color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    strokeWidth: 2,
    barPercentage: 0.8,
    useShadowColorFromDataset: false, // Changed to false to avoid potential issues
    style: {
      borderRadius: 16,
    },
    propsForLabels: {
      fontSize: 10,
    },
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ flex: 1, paddingHorizontal: 15, paddingVertical: 10 }}>
        <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 20 }}>
          Spending Categories Heatmap
        </Text>

        {chartData.categoryChartData.labels[0] !== "No Data" &&
        chartData.categoryChartData.labels[0] !== "No Categories" ? (
          <View style={{ marginBottom: 20, width: "100%" }}>
            {/* Heatmap Grid */}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "space-between",
                width: "100%",
              }}
            >
              {chartData.categoryChartData.labels.map((label, index) => {
                const amount =
                  chartData.categoryChartData.datasets[0].data[index];
                const maxAmount = Math.max(
                  ...chartData.categoryChartData.datasets[0].data
                );
                const intensity = maxAmount > 0 ? amount / maxAmount : 0;

                // Color intensity from light blue to dark red
                const getHeatmapColor = (intensity) => {
                  if (intensity === 0) return "#f0f0f0";
                  if (intensity < 0.2) return "#e3f2fd";
                  if (intensity < 0.4) return "#90caf9";
                  if (intensity < 0.6) return "#42a5f5";
                  if (intensity < 0.8) return "#ff9800";
                  return "#f44336";
                };

                const cellWidth = "48%"; // Use percentage for responsive width

                return (
                  <View
                    key={index}
                    style={{
                      width: cellWidth,
                      height: 100,
                      backgroundColor: getHeatmapColor(intensity),
                      borderRadius: 8,
                      padding: 8,
                      justifyContent: "space-between",
                      elevation: 2,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.2,
                      shadowRadius: 2,
                      marginBottom: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "bold",
                        color: intensity > 0.6 ? "#fff" : "#333",
                        textAlign: "center",
                      }}
                      numberOfLines={2}
                    >
                      {label}
                    </Text>
                    <View style={{ alignItems: "center" }}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "bold",
                          color: intensity > 0.6 ? "#fff" : "#333",
                        }}
                      >
                        ₹
                        {amount >= 1000
                          ? `${(amount / 1000).toFixed(1)}K`
                          : amount.toFixed(0)}
                      </Text>
                      <Text
                        style={{
                          fontSize: 9,
                          color: intensity > 0.6 ? "#fff" : "#666",
                          marginTop: 2,
                        }}
                      >
                        {(intensity * 100).toFixed(0)}% of max
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Legend */}
            <View
              style={{ marginTop: 20, alignItems: "center", width: "100%" }}
            >
              <Text
                style={{ fontSize: 14, fontWeight: "bold", marginBottom: 8 }}
              >
                Spending Intensity
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  flexWrap: "wrap",
                  width: "100%",
                }}
              >
                <Text style={{ fontSize: 12, color: "#666", marginRight: 4 }}>
                  Low
                </Text>
                {["#e3f2fd", "#90caf9", "#42a5f5", "#ff9800", "#f44336"].map(
                  (color, i) => (
                    <View
                      key={i}
                      style={{
                        width: 16,
                        height: 16,
                        backgroundColor: color,
                        borderRadius: 3,
                        marginHorizontal: 2,
                      }}
                    />
                  )
                )}
                <Text style={{ fontSize: 12, color: "#666", marginLeft: 4 }}>
                  High
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <Text style={{ padding: 20, textAlign: "center", color: "#666" }}>
            No spending data available to display
          </Text>
        )}

        {chartData.categoryChartData.labels[0] !== "No Data" &&
          chartData.categoryChartData.labels[0] !== "No Categories" && (
            <View style={{ marginTop: 10, marginBottom: 20, width: "100%" }}>
              <Text
                style={{ fontSize: 13, color: "#666", textAlign: "center" }}
              >
                * Showing top 10 categories + Others (color intensity indicates
                spending level)
              </Text>
            </View>
          )}

        <Text style={{ fontSize: 20, fontWeight: "bold", marginVertical: 20 }}>
          Necessity Levels Distribution
        </Text>

        <View style={{ width: "100%", alignItems: "center" }}>
          {chartData.necessityData.datasets[0].data.some((val) => val > 0) ? (
            <BarChart
              data={chartData.necessityData}
              width={Math.min(screenWidth - 30, 350)} // Constrain max width
              height={220}
              yAxisLabel=""
              yAxisSuffix=""
              chartConfig={{
                ...chartConfig,
                barPercentage: 0.8,
              }}
              style={{
                marginVertical: 8,
                borderRadius: 16,
                alignSelf: "center",
              }}
              fromZero={true}
            />
          ) : (
            <Text style={{ padding: 20, textAlign: "center", color: "#666" }}>
              No necessity level data available
            </Text>
          )}
        </View>

        <Text style={{ fontSize: 20, fontWeight: "bold", marginVertical: 20 }}>
          Transaction Summary
        </Text>

        <View
          style={{
            backgroundColor: "#f5f5f5",
            padding: 15,
            borderRadius: 8,
            marginBottom: 20,
            width: "100%",
          }}
        >
          <Text style={{ fontWeight: "bold" }}>
            Total Transactions: {spendingsSummary?.total_transactions || 0}
          </Text>
          <Text>
            Average Necessity:{" "}
            {spendingsSummary?.average_necessity?.toFixed(2) || "N/A"}
          </Text>
          <Text>
            Recommendation:{" "}
            {spendingsSummary?.recommendation || "No recommendations available"}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};
