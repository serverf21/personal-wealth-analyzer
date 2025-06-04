import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },

  // Header Styles
  header: {
    height: "10%",
    backgroundColor: "#1e293b",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  headerLeft: {
    flex: 1,
    alignItems: "flex-start",
  },
  headerCenter: {
    flex: 2,
    alignItems: "center",
  },
  headerRight: {
    flex: 1,
    alignItems: "flex-end",
  },
  dateTimeText: {
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: "500",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#ffffff",
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 2,
    textAlign: "center",
  },
  profileContainer: {
    alignItems: "center",
  },
  profilePic: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#3b82f6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  profileIcon: {
    fontSize: 20,
    color: "#ffffff",
  },
  profileName: {
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: "500",
  },

  // Main Content Styles
  mainContent: {
    flex: 1,
    flexDirection: "row",
  },

  // Sidebar Styles
  sidebar: {
    width: "30%",
    backgroundColor: "#ffffff",
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0",
    paddingTop: 20,
  },
  sidebarTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1e293b",
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  menuContainer: {
    flex: 1,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
  },
  menuItemActive: {
    backgroundColor: "#f1f5f9",
    borderLeftColor: "#3b82f6",
  },
  menuIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  menuText: {
    fontSize: 16,
    color: "#64748b",
    fontWeight: "500",
  },
  menuTextActive: {
    color: "#3b82f6",
    fontWeight: "600",
  },

  // Content Area Styles
  contentArea: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  contentContainer: {
    padding: 30,
    flex: 1,
    overflow: "scroll",
  },
  contentTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 12,
  },
  contentDescription: {
    fontSize: 16,
    color: "#64748b",
    lineHeight: 24,
    marginBottom: 30,
  },

  // Upload Button Styles
  primaryButton: {
    backgroundColor: "#3b82f6",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#3b82f6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    maxWidth: 300,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: "#3b82f6",
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    alignItems: "center",
    shadowColor: "#3b82f6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    maxWidth: 300,
  },
  secondaryButtonText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "400",
  },

  // Result Container Styles
  resultContainer: {
    marginTop: 30,
    padding: 20,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#10b981",
  },
  resultText: {
    fontSize: 16,
    color: "#374151",
    lineHeight: 24,
  },
});
