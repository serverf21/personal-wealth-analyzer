import React, { JSX, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
} from "react-native";
import { styles } from "./styles";
import { MenuItem, menuItems } from "./constants";
import { DashboardId } from "./types/types";
import AccountAnalyzer from "./dashboards/account-analyzer/account-analyzer";
import Header from "./dashboards/header/header";

const SIDEBAR_WIDTH = 300;

const PersonalWealthAnalyzer: React.FC = () => {
  const [selectedDashboard, setSelectedDashboard] =
    useState<DashboardId>("account-analyzer");
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const sidebarWidth = React.useRef(new Animated.Value(1)).current;

  const toggleSidebar = () => {
    Animated.timing(sidebarWidth, {
      toValue: isSidebarOpen ? 0 : 1,
      duration: 300,
      useNativeDriver: false,
    }).start();
    setSidebarOpen(!isSidebarOpen);
  };

  const handleMenuItemPress = (dashboardId: string): void => {
    setSelectedDashboard(dashboardId as DashboardId);
    if (!isSidebarOpen) {
      toggleSidebar();
    }
  };

  const renderContent = (): JSX.Element => {
    switch (selectedDashboard) {
      case "account-analyzer":
        return <AccountAnalyzer />;

      default:
        return (
          <View style={styles.contentContainer}>
            <Text style={styles.contentTitle}>
              {menuItems.find((item: MenuItem) => item.id === selectedDashboard)
                ?.title || "Dashboard"}
            </Text>
            <Text style={styles.contentDescription}>
              This dashboard is coming soon. Select Account Statement Analyzer
              to get started.
            </Text>
          </View>
        );
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <Header />

      {/* Main Content Area */}
      <View style={styles.mainContent}>
        <Animated.View
          style={[
            styles.sidebar,
            {
              position: "absolute",
              width: SIDEBAR_WIDTH,
              transform: [
                {
                  translateX: sidebarWidth.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-SIDEBAR_WIDTH, 0],
                  }),
                },
              ],
              zIndex: 100,
            },
          ]}
        >
          <Text style={styles.sidebarTitle}>Dashboards</Text>
          <ScrollView style={styles.menuContainer}>
            {menuItems.map((item: MenuItem) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.menuItem,
                  selectedDashboard === item.id && styles.menuItemActive,
                ]}
                onPress={() => handleMenuItemPress(item.id)}
              >
                <Text style={styles.menuIcon}>{item.icon}</Text>
                <Text
                  style={[
                    styles.menuText,
                    selectedDashboard === item.id && styles.menuTextActive,
                  ]}
                >
                  {item.title}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>

        {/* Sidebar Toggle Button */}
        <TouchableOpacity
          style={[
            styles.sidebarToggle,
            {
              left: isSidebarOpen ? SIDEBAR_WIDTH - 30 : 0,
              right: isSidebarOpen ? 10 : 0,
              transform: [
                {
                  translateX: sidebarWidth.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-SIDEBAR_WIDTH, 0],
                  }),
                },
              ],
              zIndex: 100,
            },
          ]}
          onPress={toggleSidebar}
        >
          <Text style={styles.sidebarToggleText}>
            {isSidebarOpen ? "◀ ◀" : "▶ ▶"}
          </Text>
        </TouchableOpacity>

        {/* Right Content Area */}
        <Animated.View
          style={[
            styles.contentArea,
            {
              flex: 1,
              marginLeft: sidebarWidth.interpolate({
                inputRange: [0, 1],
                outputRange: [0, SIDEBAR_WIDTH],
              }),
            },
          ]}
        >
          {renderContent()}
        </Animated.View>
      </View>
    </View>
  );
};

export default PersonalWealthAnalyzer;
