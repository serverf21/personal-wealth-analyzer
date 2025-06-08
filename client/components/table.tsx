import React from "react";
import { StyleSheet, View, ScrollView } from "react-native";
import { Table, Row } from "react-native-table-component";

interface GenericTableProps {
  data: string;
}

const GenericTable: React.FC<GenericTableProps> = ({ data }) => {
  // Parse the JSON string to get the actual data
  const parsedData = React.useMemo(() => {
    try {
      return JSON.parse(data);
    } catch (error) {
      console.error("Failed to parse table data:", error);
      return [];
    }
  }, [data]);

  // Get headers from the first row if available
  const tableHead = React.useMemo(() => {
    return parsedData[0] || [];
  }, [parsedData]);

  const widthArr = React.useMemo(() => {
    const baseWidths = new Array(tableHead.length).fill(100);
    const particularsIndex = tableHead.findIndex(
      (header: string) => header === "Particulars"
    );
    if (particularsIndex !== -1) {
      baseWidths[particularsIndex] = 200;
    }
    return baseWidths;
  }, [tableHead]);

  // Use the rest of the rows as table data
  const tableData = React.useMemo(() => {
    return parsedData.slice(1) || [];
  }, [parsedData]);

  return (
    <View style={styles.container}>
      <ScrollView horizontal={true}>
        <View>
          <Table borderStyle={{ borderWidth: 1, borderColor: "#C1C0B9" }}>
            <Row
              data={tableHead}
              widthArr={widthArr}
              style={styles.header}
              textStyle={styles.text}
            />
          </Table>
          <ScrollView style={styles.dataWrapper}>
            <Table borderStyle={{ borderWidth: 1, borderColor: "#C1C0B9" }}>
              {tableData.map((rowData, index) => (
                <Row
                  key={index}
                  data={rowData}
                  widthArr={widthArr}
                  style={[
                    styles.row,
                    index % 2 && { backgroundColor: "#F7F6E7" },
                  ]}
                  textStyle={styles.text}
                />
              ))}
            </Table>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 30, backgroundColor: "#fff" },
  header: { height: 50, backgroundColor: "#537791" },
  text: { textAlign: "center", fontWeight: "100" },
  dataWrapper: { marginTop: -1 },
  row: { height: 60, backgroundColor: "#E7E6E1" },
});

export default GenericTable;
