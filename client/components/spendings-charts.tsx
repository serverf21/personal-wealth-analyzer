import React, { useEffect, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface SpendingChartsProps {
  tables: Array<Array<string | null>>; // Updated to match the incoming data format
}

interface AnalysisData {
  categories: Record<string, number>;
  total_debits: number;
  total_credits: number;
  categorized_transactions: Array<{
    date: string;
    particulars: string;
    amount: string;
    type: "debit" | "credit";
    category: string;
  }>;
}

const COLORS = [
  "#FF6B6B", // Red for OTHERS
  "#4ECDC4", // Teal for UPI
  "#45B7D1", // Blue for ATM
  "#96CEB4", // Green for FOOD
  "#FFEAA7", // Yellow for TRANSPORT
  "#DDA0DD", // Plum for ENTERTAINMENT
  "#98D8C8", // Mint for TRANSFER
  "#F7DC6F", // Light yellow for SHOPPING
  "#FF9999", // Light red
  "#66B2FF", // Light blue
  "#99FF99", // Light green
  "#FFB366", // Light orange
];

const RADIAN = Math.PI / 180;

// Function to avoid label overlaps
const avoidLabelOverlap = (labelData: any[]) => {
  const minDistance = 25; // Minimum distance between labels
  const sortedLabels = [...labelData].sort((a, b) => a.angle - b.angle);

  for (let i = 0; i < sortedLabels.length; i++) {
    for (let j = i + 1; j < sortedLabels.length; j++) {
      const label1 = sortedLabels[i];
      const label2 = sortedLabels[j];

      const distance = Math.sqrt(
        Math.pow(label2.x - label1.x, 2) + Math.pow(label2.y - label1.y, 2)
      );

      if (distance < minDistance) {
        // Adjust the second label position
        const angle = Math.atan2(label2.y - label1.y, label2.x - label1.x);
        label2.x = label1.x + Math.cos(angle) * minDistance;
        label2.y = label1.y + Math.sin(angle) * minDistance;
      }
    }
  }

  return sortedLabels;
};

const renderCustomizedLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
  name,
  value,
  index,
  data,
}: any) => {
  // Show all labels, even small ones
  const minPercent = 0.005; // 0.5% minimum to show label
  if (percent < minPercent) return null;

  // Calculate base position
  const baseRadius = outerRadius + 30;
  let x = cx + baseRadius * Math.cos(-midAngle * RADIAN);
  let y = cy + baseRadius * Math.sin(-midAngle * RADIAN);

  // Adjust for better distribution
  const adjustedRadius = outerRadius + (40 + (index % 3) * 20); // Vary distance
  x = cx + adjustedRadius * Math.cos(-midAngle * RADIAN);
  y = cy + adjustedRadius * Math.sin(-midAngle * RADIAN);

  // Add some randomness to avoid exact overlaps for very close angles
  const offsetX = (index % 2 === 0 ? 5 : -5) * (index % 3);
  const offsetY = (index % 2 === 0 ? 3 : -3) * (index % 4);
  x += offsetX;
  y += offsetY;

  // Calculate line points
  const lineStartRadius = outerRadius + 5;
  const lineStartX = cx + lineStartRadius * Math.cos(-midAngle * RADIAN);
  const lineStartY = cy + lineStartRadius * Math.sin(-midAngle * RADIAN);

  const lineMidRadius = outerRadius + 20;
  const lineMidX = cx + lineMidRadius * Math.cos(-midAngle * RADIAN);
  const lineMidY = cy + lineMidRadius * Math.sin(-midAngle * RADIAN);

  // Determine text anchor based on position
  const textAnchor = x > cx ? "start" : "end";

  // Format value
  const formattedValue = `₹${parseFloat(value.toString()).toLocaleString(
    "en-IN"
  )}`;
  const percentText = `${(percent * 100).toFixed(1)}%`;

  // Calculate label dimensions
  const labelWidth = 160;
  const labelHeight = 40;
  const rectX = textAnchor === "start" ? x - 5 : x - labelWidth + 5;
  const rectY = y - labelHeight / 2;

  return (
    <g key={`label-${index}`}>
      {/* Connection line */}
      <polyline
        points={`${lineStartX},${lineStartY} ${lineMidX},${lineMidY} ${x},${y}`}
        stroke="#999"
        strokeWidth={1}
        fill="none"
        opacity={0.7}
      />

      {/* Label background */}
      <rect
        x={rectX}
        y={rectY}
        width={labelWidth}
        height={labelHeight}
        fill="rgba(255, 255, 255, 0.95)"
        stroke="#ddd"
        strokeWidth={1}
        rx={6}
        filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))"
      />

      {/* Color indicator */}
      <rect
        x={rectX + 5}
        y={rectY + 8}
        width={12}
        height={12}
        fill={COLORS[index % COLORS.length]}
        rx={2}
      />

      {/* Category name */}
      <text
        x={rectX + 22}
        y={rectY + 14}
        fill="#333"
        fontSize={11}
        fontWeight="600"
        dominantBaseline="middle"
      >
        {name.length > 12 ? name.substring(0, 12) + "..." : name}
      </text>

      {/* Value and percentage */}
      <text
        x={rectX + 22}
        y={rectY + 28}
        fill="#666"
        fontSize={9}
        dominantBaseline="middle"
      >
        {formattedValue} ({percentText})
      </text>
    </g>
  );
};

export const SpendingCharts: React.FC<SpendingChartsProps> = ({ tables }) => {
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalysis = async () => {
      if (!tables || !tables.length) return;

      // Filter out completely empty rows
      const validTransactions = tables.filter((row) =>
        row.some((cell) => cell !== null && cell !== "")
      );

      // Remove any rows that don't have the expected number of columns
      const headerRow = validTransactions[0];
      const filteredTransactions = validTransactions.filter(
        (row) => row.length === headerRow.length
      );

      setLoading(true);
      try {
        const response = await fetch(
          "http://localhost:8000/analyze-basic-transactions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              transactions: filteredTransactions, // Send as part of an object
              use_ai: false,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || "Failed to fetch analysis data");
        }

        const data = await response.json();
        setAnalysisData(data.basic_analysis); // Updated to access basic_analysis
      } catch (err) {
        console.error("Error:", err);
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchAnalysis();
  }, [tables]);

  if (loading) {
    return (
      <div className="p-4">
        <div className="text-center">Loading charts...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="text-center text-red-500">Error: {error}</div>
      </div>
    );
  }

  if (!analysisData) {
    return (
      <div className="p-4">
        <div className="text-center">No data available</div>
      </div>
    );
  }

  // Prepare data for category pie chart
  const categoryData = Object.entries(analysisData.categories)
    .map(([name, value]) => ({
      name,
      value: parseFloat(value.toString()),
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  // Prepare data for spending trend line chart
  const trendData = analysisData.categorized_transactions
    .filter((transaction) => transaction.type === "debit" && transaction.date)
    .reduce((acc: Record<string, number>, transaction) => {
      const date = transaction.date;
      acc[date] = (acc[date] || 0) + parseFloat(transaction.amount);
      return acc;
    }, {});

  const lineChartData = Object.entries(trendData)
    .map(([date, amount]) => ({
      date,
      amount,
    }))
    .sort(
      (a, b) =>
        new Date(a.date.split("-").reverse().join("-")).getTime() -
        new Date(b.date.split("-").reverse().join("-")).getTime()
    );

  // Calculate additional statistics for the table
  const totalDebitAmount = parseFloat(analysisData.total_debits.toString());
  const categoryStats = categoryData.map((category, index) => {
    const percentage = (category.value / totalDebitAmount) * 100;
    const transactionCount = analysisData.categorized_transactions.filter(
      (t) => t.category === category.name && t.type === "debit"
    ).length;
    const avgTransactionAmount =
      transactionCount > 0 ? category.value / transactionCount : 0;

    return {
      ...category,
      percentage,
      transactionCount,
      avgTransactionAmount,
      color: COLORS[index % COLORS.length],
    };
  });

  return (
    <div className="p-6 max-w-7xl mx-auto font-['Inter','Segoe_UI','Roboto',sans-serif]">
      {/* Category Distribution Chart */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">
          Category-wise Spending Distribution
        </h2>
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div style={{ width: "100%", height: "700px" }}>
            <ResponsiveContainer>
              <PieChart margin={{ top: 40, right: 200, bottom: 40, left: 200 }}>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomizedLabel}
                  outerRadius={100}
                  innerRadius={50}
                  paddingAngle={1}
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string, props: any) => {
                    const percentage = (
                      (value / totalDebitAmount) *
                      100
                    ).toFixed(1);
                    return [
                      `₹${parseFloat(value.toString()).toLocaleString(
                        "en-IN"
                      )} (${percentage}%)`,
                      name,
                    ];
                  }}
                  contentStyle={{
                    backgroundColor: "rgba(255, 255, 255, 0.95)",
                    borderRadius: "8px",
                    border: "1px solid #e0e0e0",
                    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
                    fontFamily: "'Inter', 'Segoe UI', 'Roboto', sans-serif",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Spending Trend Chart */}
      {lineChartData.length > 0 && (
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-6 text-gray-800">
            Daily Spending Trend
          </h2>
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div style={{ width: "100%", height: "400px" }}>
              <ResponsiveContainer>
                <LineChart
                  data={lineChartData}
                  margin={{
                    top: 20,
                    right: 30,
                    left: 20,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" stroke="#666" fontSize={12} />
                  <YAxis
                    stroke="#666"
                    fontSize={12}
                    tickFormatter={(value) =>
                      `₹${value.toLocaleString("en-IN")}`
                    }
                  />
                  <Tooltip
                    formatter={(value: number) => [
                      `₹${parseFloat(value.toString()).toLocaleString(
                        "en-IN"
                      )}`,
                      "Amount Spent",
                    ]}
                    contentStyle={{
                      backgroundColor: "rgba(255, 255, 255, 0.95)",
                      borderRadius: "8px",
                      border: "1px solid #e0e0e0",
                      boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    stroke="#4ECDC4"
                    strokeWidth={3}
                    dot={{ r: 4, fill: "#4ECDC4" }}
                    activeDot={{ r: 6, fill: "#45B7D1" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg p-6 shadow-lg">
          <h3 className="text-lg font-semibold mb-2">Total Debits</h3>
          <p className="text-3xl font-bold">
            ₹
            {parseFloat(analysisData.total_debits.toString()).toLocaleString(
              "en-IN"
            )}
          </p>
        </div>

        <div className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg p-6 shadow-lg">
          <h3 className="text-lg font-semibold mb-2">Total Credits</h3>
          <p className="text-3xl font-bold">
            ₹
            {parseFloat(analysisData.total_credits.toString()).toLocaleString(
              "en-IN"
            )}
          </p>
        </div>

        <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg p-6 shadow-lg">
          <h3 className="text-lg font-semibold mb-2">Net Balance</h3>
          <p className="text-3xl font-bold">
            ₹
            {(
              parseFloat(analysisData.total_credits.toString()) -
              parseFloat(analysisData.total_debits.toString())
            ).toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      {/* Enhanced Category Breakdown Table */}
      <div className="mt-8">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">
          Detailed Category Analysis
        </h2>
        <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                    Category
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                    Total Amount
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                    Percentage
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                    Transactions
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                    Avg per Transaction
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Visual
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {categoryStats.map((category, index) => (
                  <tr
                    key={category.name}
                    className="hover:bg-gray-50 transition-colors duration-150 border-b border-gray-100"
                  >
                    <td className="px-6 py-4 whitespace-nowrap border-r border-gray-100">
                      <div className="flex items-center">
                        <div
                          className="w-4 h-4 rounded-full mr-3 border-2 border-white shadow-sm"
                          style={{
                            backgroundColor: category.color,
                          }}
                        ></div>
                        <div>
                          <div className="text-sm font-semibold text-gray-900">
                            {category.name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap border-r border-gray-100">
                      <div className="text-sm font-bold text-gray-900">
                        ₹{category.value.toLocaleString("en-IN")}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap border-r border-gray-100">
                      <div className="flex items-center">
                        <div className="text-sm font-medium text-gray-900">
                          {category.percentage.toFixed(1)}%
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap border-r border-gray-100">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                        {category.transactionCount}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-100">
                      ₹{category.avgTransactionAmount.toLocaleString("en-IN")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="w-full bg-gray-200 rounded-full h-2.5 border border-gray-300">
                        <div
                          className="h-2.5 rounded-full transition-all duration-300 shadow-sm"
                          style={{
                            width: `${Math.min(category.percentage, 100)}%`,
                            backgroundColor: category.color,
                          }}
                        ></div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gradient-to-r from-gray-100 to-gray-50 border-t-2 border-gray-300">
                <tr className="border-t border-gray-200">
                  <td className="px-6 py-4 text-sm font-bold text-gray-900 border-r border-gray-200">
                    TOTAL
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-900 border-r border-gray-200">
                    ₹{totalDebitAmount.toLocaleString("en-IN")}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-900 border-r border-gray-200">
                    100.0%
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-900 border-r border-gray-200">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gray-200 text-gray-800 border border-gray-300">
                      {categoryStats.reduce(
                        (sum, cat) => sum + cat.transactionCount,
                        0
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-900 border-r border-gray-200">
                    ₹
                    {(
                      totalDebitAmount /
                      categoryStats.reduce(
                        (sum, cat) => sum + cat.transactionCount,
                        0
                      )
                    ).toLocaleString("en-IN")}
                  </td>
                  <td className="px-6 py-4"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
