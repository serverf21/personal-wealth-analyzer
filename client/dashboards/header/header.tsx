import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { styles } from "../../styles";

const Header: React.FC = () => {
  const [currentDateTime, setCurrentDateTime] = useState<string>("");

  useEffect(() => {
    const updateDateTime = (): void => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      };
      setCurrentDateTime(now.toLocaleString("en-US", options));
    };

    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.header}>
      {/* Left Side - Date & Time */}
      <View style={styles.headerLeft}>
        <Text style={styles.dateTimeText}>⏱️ {currentDateTime}</Text>
      </View>

      {/* Center - Title */}
      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle}>🏛️ Personal Wealth Analyzer</Text>
        <Text style={styles.headerSubtitle}>Your Financial Command Center</Text>
      </View>

      {/* Right Side - Profile */}
      <View style={styles.headerRight}>
        <View style={styles.profileContainer}>
          <View style={styles.profilePic}>
            <Text style={styles.profileIcon}>👤</Text>
          </View>
          <Text style={styles.profileName}>Sarvagya</Text>
        </View>
      </View>
    </View>
  );
};

export default Header;
