import React, { JSX, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Button, Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { styles } from "./styles";
import { MenuItem, menuItems } from "./constants";
import { DashboardId } from "./types/types";
import AccountAnalyzer from "./components/account-analyzer/account-analyzer";
import Header from "./components/header/header";

const PersonalWealthAnalyzer: React.FC = () => {
  const [selectedDashboard, setSelectedDashboard] =
    useState<DashboardId>("account-analyzer");

  const handleMenuItemPress = (dashboardId: string): void => {
    setSelectedDashboard(dashboardId as DashboardId);
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
        {/* Left Sidebar Menu */}
        <View style={styles.sidebar}>
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
        </View>

        {/* Right Content Area */}
        <View style={styles.contentArea}>{renderContent()}</View>
      </View>
    </View>
  );
};

export default PersonalWealthAnalyzer;
